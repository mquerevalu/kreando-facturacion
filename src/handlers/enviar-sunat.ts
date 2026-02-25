/**
 * Handler Lambda para enviar comprobantes a SUNAT
 * 
 * Este handler orquesta el flujo completo de envío:
 * 1. Recupera el comprobante y XML firmado
 * 2. Comprime el XML en formato ZIP
 * 3. Envía a SUNAT usando credenciales de la empresa
 * 4. Procesa la respuesta y almacena el CDR
 * 5. Actualiza el estado del comprobante
 * 
 * Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import JSZip from 'jszip';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { DynamoDBEmpresaRepository } from '../repositories/EmpresaRepository';
import { S3FileRepository } from '../repositories/S3Repository';
import { SunatSoapClient } from '../services/SunatSoapClient';
import { CdrResponseHandler } from '../services/CdrResponseHandler';
import { RetryManager } from '../utils/RetryManager';
import { EstadoComprobante, ApiResponse } from '../types';

/**
 * Repositorios y servicios (singleton para reutilización en Lambda)
 */
const comprobanteRepository = new DynamoDBComprobanteRepository();
const empresaRepository = new DynamoDBEmpresaRepository();
const s3Repository = new S3FileRepository();
const sunatClient = new SunatSoapClient({
  ambiente: (process.env.SUNAT_AMBIENTE as 'produccion' | 'homologacion') || 'homologacion',
  timeout: 60000,
});
const cdrHandler = new CdrResponseHandler({
  comprobanteRepository,
  s3Repository,
});
const retryManager = new RetryManager(comprobanteRepository);

/**
 * Interfaz para el body de la petición
 */
interface EnviarSunatRequest {
  empresaRuc: string;
  numeroComprobante: string;
}

/**
 * Handler principal de envío a SUNAT
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Validar y parsear el body de la petición
    if (!event.body) {
      return createErrorResponse(400, 'El body de la petición es requerido');
    }

    const request: EnviarSunatRequest = JSON.parse(event.body);

    // Validar campos requeridos
    if (!request.empresaRuc || !request.numeroComprobante) {
      return createErrorResponse(400, 'empresaRuc y numeroComprobante son requeridos');
    }

    console.log(`Iniciando envío a SUNAT - Empresa: ${request.empresaRuc}, Comprobante: ${request.numeroComprobante}`);

    // 2. Recuperar la empresa y validar que existe
    const empresa = await empresaRepository.obtenerEmpresa(request.empresaRuc);
    if (!empresa) {
      return createErrorResponse(404, `Empresa con RUC ${request.empresaRuc} no encontrada`);
    }

    if (!empresa.activo) {
      return createErrorResponse(400, `Empresa con RUC ${request.empresaRuc} está inactiva`);
    }

    // 3. Recuperar el comprobante
    const comprobante = await comprobanteRepository.obtenerComprobante(
      request.empresaRuc,
      request.numeroComprobante
    );

    if (!comprobante) {
      return createErrorResponse(
        404,
        `Comprobante ${request.numeroComprobante} no encontrado para empresa ${request.empresaRuc}`
      );
    }

    // Validar que el comprobante esté en estado válido para envío
    if (comprobante.estado === EstadoComprobante.ACEPTADO) {
      return createErrorResponse(400, 'El comprobante ya fue aceptado por SUNAT');
    }

    // 4. Recuperar el XML firmado desde S3
    const xmlFirmado = await s3Repository.recuperarXML(
      request.empresaRuc,
      `firmado-${request.numeroComprobante}`
    );

    if (!xmlFirmado) {
      return createErrorResponse(
        404,
        `XML firmado no encontrado para comprobante ${request.numeroComprobante}. Debe firmar el comprobante antes de enviarlo.`
      );
    }

    console.log(`XML firmado recuperado - Tamaño: ${xmlFirmado.length} bytes`);

    // 5. Comprimir el XML en formato ZIP
    // IMPORTANTE: El nombre del archivo dentro del ZIP debe seguir el formato SUNAT
    // Formato: {RUC}-{TipoDoc}-{Serie}-{Numero}.xml
    // Ejemplo: 20123456789-01-F001-00000123.xml
    // - RUC: 11 dígitos
    // - TipoDoc: 2 dígitos (01=Factura, 03=Boleta)
    // - Serie: 4 caracteres (F001, B001)
    // - Número: 8 dígitos con ceros a la izquierda
    // - Extensión: .xml (IMPORTANTE!)
    const [serie, numero] = request.numeroComprobante.split('-');
    const numeroPadded = numero.padStart(8, '0'); // Rellenar con ceros a la izquierda hasta 8 dígitos
    const nombreArchivo = `${request.empresaRuc}-${comprobante.tipo}-${serie}-${numeroPadded}.xml`;
    const zipBuffer = await comprimirXML(xmlFirmado, nombreArchivo);

    console.log(`Nombre del archivo en ZIP: ${nombreArchivo}`);

    console.log(`XML comprimido en ZIP - Tamaño: ${zipBuffer.length} bytes`);

    // 6. Actualizar estado a ENVIADO antes del envío
    await comprobanteRepository.actualizarEstado(
      request.empresaRuc,
      request.numeroComprobante,
      EstadoComprobante.ENVIADO
    );

    // Validar que la empresa tenga credenciales SUNAT
    if (!empresa.credencialesSunat) {
      throw new Error(`La empresa ${request.empresaRuc} no tiene credenciales SUNAT configuradas`);
    }

    // 7. Enviar a SUNAT con reintentos automáticos
    console.log('Enviando comprobante a SUNAT con reintentos automáticos...');
    
    const retryResult = await retryManager.executeWithRetry(
      async () => {
        return await sunatClient.enviarComprobante(
          request.empresaRuc,
          empresa.credencialesSunat!,
          zipBuffer
        );
      },
      request.empresaRuc,
      request.numeroComprobante
    );

    // Verificar si el envío fue exitoso
    if (!retryResult.success) {
      // El comprobante ya fue marcado como PENDIENTE por el RetryManager
      return createErrorResponse(
        503,
        `No se pudo enviar el comprobante tras ${retryResult.totalAttempts} intentos. El comprobante ha sido marcado como pendiente para reintento manual.`
      );
    }

    const cdr = retryResult.data!;
    console.log(`CDR recibido de SUNAT - Código: ${cdr.codigo}, Mensaje: ${cdr.mensaje}`);

    // 8. Procesar la respuesta CDR y actualizar el estado del comprobante
    await cdrHandler.procesarCDR(request.empresaRuc, request.numeroComprobante, cdr);

    // 9. Recuperar el comprobante actualizado para retornar
    const comprobanteActualizado = await comprobanteRepository.obtenerComprobante(
      request.empresaRuc,
      request.numeroComprobante
    );

    // 10. Retornar respuesta exitosa
    const response: ApiResponse<any> = {
      success: true,
      data: {
        numeroComprobante: request.numeroComprobante,
        estado: comprobanteActualizado?.estado || EstadoComprobante.ENVIADO,
        cdr: {
          codigo: cdr.codigo,
          mensaje: cdr.mensaje,
          fechaRecepcion: cdr.fechaRecepcion,
        },
      },
      message: 'Comprobante enviado exitosamente a SUNAT',
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error al enviar comprobante a SUNAT:', error);

    // Determinar el código de error y mensaje apropiado
    let statusCode = 500;
    let errorMessage = 'Error interno al enviar comprobante a SUNAT';

    if (error instanceof Error) {
      errorMessage = error.message;

      // Errores específicos de SUNAT
      if (error.message.includes('Error SOAP de SUNAT')) {
        statusCode = 502; // Bad Gateway - error del servicio externo
      } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        statusCode = 504; // Gateway Timeout
      } else if (error.message.includes('no encontrado') || error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('ya fue aceptado') || error.message.includes('inactiva')) {
        statusCode = 400;
      }
    }

    return createErrorResponse(statusCode, errorMessage);
  }
};

/**
 * Comprime un XML en formato ZIP
 * 
 * @param xmlContent - Contenido del XML a comprimir
 * @param nombreArchivo - Nombre del archivo dentro del ZIP
 * @returns Buffer del archivo ZIP
 */
async function comprimirXML(xmlContent: string, nombreArchivo: string): Promise<Buffer> {
  try {
    const zip = new JSZip();
    zip.file(nombreArchivo, xmlContent);
    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9, // Máxima compresión
      },
    });
  } catch (error) {
    throw new Error(
      `Error al comprimir XML: ${error instanceof Error ? error.message : 'Error desconocido'}`
    );
  }
}

/**
 * Crea una respuesta de error estandarizada
 */
function createErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  const response: ApiResponse<null> = {
    success: false,
    data: null,
    message,
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(response),
  };
}
