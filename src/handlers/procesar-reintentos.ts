/**
 * Handler Lambda para procesar reintentos de comprobantes pendientes
 * 
 * Este handler es triggered por SQS para procesar comprobantes que fallaron en el envío:
 * 1. Recibe mensajes de SQS con información de comprobantes pendientes
 * 2. Recupera el comprobante y valida su estado
 * 3. Reintenta el envío a SUNAT
 * 4. Actualiza el estado según el resultado
 * 
 * También permite reenvío manual de comprobantes pendientes.
 * 
 * Requisitos: 7.1, 7.2, 7.3
 */

import { SQSEvent, SQSHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
 * Mensaje de SQS para reintento
 */
interface RetryMessage {
  empresaRuc: string;
  numeroComprobante: string;
  intentoPrevio?: number;
}

/**
 * Handler para procesar mensajes de SQS (reintentos automáticos)
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  console.log(`Procesando ${event.Records.length} mensajes de reintentos desde SQS`);

  for (const record of event.Records) {
    try {
      const message: RetryMessage = JSON.parse(record.body);
      console.log(
        `Procesando reintento para comprobante ${message.numeroComprobante} de empresa ${message.empresaRuc}`
      );

      await procesarReintento(message.empresaRuc, message.numeroComprobante);
    } catch (error) {
      console.error('Error al procesar mensaje de SQS:', error);
      // El mensaje volverá a la cola si no se procesa exitosamente
      throw error;
    }
  }
};

/**
 * Handler para reenvío manual (API Gateway)
 */
export const handlerManual = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Validar y parsear el body de la petición
    if (!event.body) {
      return createErrorResponse(400, 'El body de la petición es requerido');
    }

    const request: RetryMessage = JSON.parse(event.body);

    // Validar campos requeridos
    if (!request.empresaRuc || !request.numeroComprobante) {
      return createErrorResponse(400, 'empresaRuc y numeroComprobante son requeridos');
    }

    console.log(
      `Reenvío manual solicitado - Empresa: ${request.empresaRuc}, Comprobante: ${request.numeroComprobante}`
    );

    // Procesar el reintento
    const resultado = await procesarReintento(request.empresaRuc, request.numeroComprobante);

    if (resultado.success) {
      const response: ApiResponse<any> = {
        success: true,
        data: {
          numeroComprobante: request.numeroComprobante,
          estado: resultado.estado,
          cdr: resultado.cdr,
        },
        message: 'Comprobante reenviado exitosamente a SUNAT',
      };

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(response),
      };
    } else {
      return createErrorResponse(503, resultado.message || 'Error al reenviar comprobante');
    }
  } catch (error) {
    console.error('Error en reenvío manual:', error);

    let statusCode = 500;
    let errorMessage = 'Error interno al reenviar comprobante';

    if (error instanceof Error) {
      errorMessage = error.message;

      if (error.message.includes('no encontrado') || error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('no está pendiente')) {
        statusCode = 400;
      }
    }

    return createErrorResponse(statusCode, errorMessage);
  }
};

/**
 * Procesa el reintento de envío de un comprobante pendiente
 */
async function procesarReintento(
  empresaRuc: string,
  numeroComprobante: string
): Promise<{
  success: boolean;
  estado?: EstadoComprobante;
  cdr?: any;
  message?: string;
}> {
  try {
    // 1. Recuperar la empresa
    const empresa = await empresaRepository.obtenerEmpresa(empresaRuc);
    if (!empresa) {
      throw new Error(`Empresa con RUC ${empresaRuc} no encontrada`);
    }

    if (!empresa.activo) {
      throw new Error(`Empresa con RUC ${empresaRuc} está inactiva`);
    }

    // 2. Recuperar el comprobante
    const comprobante = await comprobanteRepository.obtenerComprobante(empresaRuc, numeroComprobante);

    if (!comprobante) {
      throw new Error(
        `Comprobante ${numeroComprobante} no encontrado para empresa ${empresaRuc}`
      );
    }

    // 3. Validar que el comprobante esté en estado PENDIENTE
    if (comprobante.estado !== EstadoComprobante.PENDIENTE) {
      throw new Error(
        `El comprobante ${numeroComprobante} no está pendiente (estado actual: ${comprobante.estado})`
      );
    }

    // 4. Recuperar el XML firmado desde S3
    const xmlFirmado = await s3Repository.recuperarXML(empresaRuc, `firmado-${numeroComprobante}`);

    if (!xmlFirmado) {
      throw new Error(
        `XML firmado no encontrado para comprobante ${numeroComprobante}. No se puede reenviar.`
      );
    }

    console.log(`XML firmado recuperado - Tamaño: ${xmlFirmado.length} bytes`);

    // 5. Comprimir el XML en formato ZIP
    const nombreArchivo = `${empresaRuc}-${comprobante.tipo}-${numeroComprobante}.xml`;
    const zipBuffer = await comprimirXML(xmlFirmado, nombreArchivo);

    console.log(`XML comprimido en ZIP - Tamaño: ${zipBuffer.length} bytes`);

    // 6. Actualizar estado a ENVIADO antes del reintento
    await comprobanteRepository.actualizarEstado(
      empresaRuc,
      numeroComprobante,
      EstadoComprobante.ENVIADO
    );

    // Validar que la empresa tenga credenciales SUNAT
    if (!empresa.credencialesSunat) {
      throw new Error(`La empresa ${empresaRuc} no tiene credenciales SUNAT configuradas`);
    }

    // 7. Reintentar envío a SUNAT con reintentos automáticos
    console.log('Reintentando envío a SUNAT...');

    const retryResult = await retryManager.executeWithRetry(
      async () => {
        return await sunatClient.enviarComprobante(empresaRuc, empresa.credencialesSunat!, zipBuffer);
      },
      empresaRuc,
      numeroComprobante
    );

    // 8. Verificar si el envío fue exitoso
    if (!retryResult.success) {
      // El comprobante ya fue marcado como PENDIENTE por el RetryManager
      return {
        success: false,
        message: `No se pudo reenviar el comprobante tras ${retryResult.totalAttempts} intentos. El comprobante permanece como pendiente.`,
      };
    }

    const cdr = retryResult.data!;
    console.log(`CDR recibido de SUNAT - Código: ${cdr.codigo}, Mensaje: ${cdr.mensaje}`);

    // 9. Procesar la respuesta CDR y actualizar el estado del comprobante
    await cdrHandler.procesarCDR(empresaRuc, numeroComprobante, cdr);

    // 10. Recuperar el comprobante actualizado
    const comprobanteActualizado = await comprobanteRepository.obtenerComprobante(
      empresaRuc,
      numeroComprobante
    );

    return {
      success: true,
      estado: comprobanteActualizado?.estado || EstadoComprobante.ENVIADO,
      cdr: {
        codigo: cdr.codigo,
        mensaje: cdr.mensaje,
        fechaRecepcion: cdr.fechaRecepcion,
      },
    };
  } catch (error) {
    console.error(`Error al procesar reintento para comprobante ${numeroComprobante}:`, error);
    throw error;
  }
}

/**
 * Comprime un XML en formato ZIP
 */
async function comprimirXML(xmlContent: string, nombreArchivo: string): Promise<Buffer> {
  try {
    const zip = new JSZip();
    zip.file(nombreArchivo, xmlContent);
    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9,
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

