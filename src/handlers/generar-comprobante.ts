/**
 * Lambda Handler: generar-comprobante (Orquestador Principal)
 * 
 * Responsabilidad: Orquestar el flujo completo de generación de comprobantes electrónicos
 * Requisitos: Flujo completo (Generación → Firma → Envío → CDR → PDF)
 * 
 * Flujo:
 * 1. Validar datos de entrada
 * 2. Generar XML UBL 2.1
 * 3. Firmar XML digitalmente
 * 4. Enviar a SUNAT
 * 5. Procesar CDR
 * 6. Generar PDF (si es aceptado)
 * 7. Retornar resultado completo
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import JSZip from 'jszip';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { DynamoDBEmpresaRepository } from '../repositories/EmpresaRepository';
import { S3FileRepository } from '../repositories/S3Repository';
import { ComprobanteGenerator } from '../services/ComprobanteGenerator';
import { DigitalSigner } from '../services/DigitalSigner';
import { SunatSoapClient } from '../services/SunatSoapClient';
import { CdrResponseHandler } from '../services/CdrResponseHandler';
import { CertificateManager } from '../services/CertificateManager';
import { PDFGenerator } from '../services/PDFGenerator';
import { DataValidator } from '../validators/DataValidator';
import { RetryManager } from '../utils/RetryManager';
import {
  DatosBoleta,
  DatosFactura,
  TipoComprobante,
  EstadoComprobante,
  ApiResponse,
  Emisor,
  Comprobante,
} from '../types';

/**
 * Repositorios y servicios (singleton para reutilización en Lambda)
 */
const comprobanteRepository = new DynamoDBComprobanteRepository();
const empresaRepository = new DynamoDBEmpresaRepository();
const s3Repository = new S3FileRepository();
const dataValidator = new DataValidator();
const certificateManager = new CertificateManager();
const digitalSigner = new DigitalSigner(certificateManager);
const sunatClient = new SunatSoapClient({
  ambiente: (process.env.SUNAT_AMBIENTE as 'produccion' | 'homologacion') || 'homologacion',
  timeout: 60000,
});
const cdrHandler = new CdrResponseHandler({
  comprobanteRepository,
  s3Repository,
});
const pdfGenerator = new PDFGenerator();
const retryManager = new RetryManager(comprobanteRepository);

// Función para obtener datos del emisor
const obtenerDatosEmisor = async (ruc: string): Promise<Emisor> => {
  const empresa = await empresaRepository.obtenerEmpresa(ruc);
  if (!empresa) {
    throw new Error(`Empresa con RUC ${ruc} no encontrada`);
  }
  return {
    ruc: empresa.ruc,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial,
    direccion: empresa.direccion,
  };
};

const comprobanteGenerator = new ComprobanteGenerator(
  comprobanteRepository,
  dataValidator,
  obtenerDatosEmisor
);

/**
 * Interfaz para el body de la petición
 */
interface GenerarComprobanteRequest {
  empresaRuc: string;
  tipo: TipoComprobante;
  datos: DatosBoleta | DatosFactura;
}

/**
 * Interfaz para la respuesta
 */
interface GenerarComprobanteResponse {
  numeroComprobante: string;
  estado: EstadoComprobante;
  fechaEmision: string;
  total: number;
  moneda: string;
  cdr?: {
    codigo: string;
    mensaje: string;
    fechaRecepcion: string;
  };
  urlPDF?: string;
  xmlFirmado?: string;
}

/**
 * Handler principal - Orquesta el flujo completo
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. VALIDAR DATOS DE ENTRADA
    if (!event.body) {
      return createErrorResponse(400, 'El body de la petición es requerido');
    }

    const request: GenerarComprobanteRequest = JSON.parse(event.body);

    // Validar campos requeridos
    if (!request.empresaRuc || !request.tipo || !request.datos) {
      return createErrorResponse(
        400,
        'Los campos empresaRuc, tipo y datos son requeridos'
      );
    }

    // Validar formato de RUC
    const validacionRuc = dataValidator.validarRUC(request.empresaRuc);
    if (!validacionRuc.valido) {
      return createErrorResponse(400, validacionRuc.errores.join(', '));
    }

    console.log(
      `Iniciando generación de comprobante - Empresa: ${request.empresaRuc}, Tipo: ${request.tipo}`
    );

    // Validar que la empresa exista y esté activa
    const empresa = await empresaRepository.obtenerEmpresa(request.empresaRuc);
    if (!empresa) {
      return createErrorResponse(404, `Empresa con RUC ${request.empresaRuc} no encontrada`);
    }

    if (!empresa.activo) {
      return createErrorResponse(400, `Empresa con RUC ${request.empresaRuc} está inactiva`);
    }

    // Validar que la empresa tenga certificado
    try {
      await certificateManager.obtenerCertificado(request.empresaRuc);
    } catch (error) {
      return createErrorResponse(
        400,
        `La empresa no tiene certificado digital configurado: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    }

    // Validar que la empresa tenga credenciales SUNAT
    if (!empresa.credencialesSunat) {
      return createErrorResponse(
        400,
        'La empresa no tiene credenciales SUNAT configuradas'
      );
    }

    // 2. GENERAR XML UBL 2.1
    console.log('Generando XML UBL 2.1...');
    let comprobante: Comprobante;

    try {
      if (request.tipo === TipoComprobante.BOLETA) {
        comprobante = await comprobanteGenerator.generarBoleta(
          request.empresaRuc,
          request.datos as DatosBoleta
        );
      } else if (request.tipo === TipoComprobante.FACTURA) {
        comprobante = await comprobanteGenerator.generarFactura(
          request.empresaRuc,
          request.datos as DatosFactura
        );
      } else {
        return createErrorResponse(
          400,
          `Tipo de comprobante no soportado: ${request.tipo}`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      return createErrorResponse(400, `Error al generar comprobante: ${errorMessage}`);
    }

    console.log(`Comprobante generado - Número: ${comprobante.numero}`);

    // Guardar XML original en S3
    await s3Repository.guardarXML(
      request.empresaRuc,
      comprobante.numero,
      comprobante.xmlOriginal!
    );

    // 3. FIRMAR XML
    console.log('Firmando XML digitalmente...');
    let xmlFirmado: string;

    try {
      xmlFirmado = await digitalSigner.firmarXML(request.empresaRuc, comprobante.xmlOriginal!);
      comprobante.xmlFirmado = xmlFirmado;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      await comprobanteRepository.actualizarEstado(
        request.empresaRuc,
        comprobante.numero,
        EstadoComprobante.PENDIENTE
      );
      return createErrorResponse(500, `Error al firmar comprobante: ${errorMessage}`);
    }

    // Guardar XML firmado en S3
    await s3Repository.guardarXML(
      request.empresaRuc,
      `firmado-${comprobante.numero}`,
      xmlFirmado
    );

    console.log('XML firmado exitosamente');

    // Actualizar comprobante con XML firmado
    await comprobanteRepository.guardarComprobante(request.empresaRuc, comprobante);

    // 4. ENVIAR A SUNAT
    console.log('Enviando comprobante a SUNAT...');

    // Comprimir XML en ZIP
    const nombreArchivo = `${request.empresaRuc}-${comprobante.tipo}-${comprobante.numero}.xml`;
    const zipBuffer = await comprimirXML(xmlFirmado, nombreArchivo);

    // Actualizar estado a ENVIADO
    await comprobanteRepository.actualizarEstado(
      request.empresaRuc,
      comprobante.numero,
      EstadoComprobante.ENVIADO
    );

    // Enviar a SUNAT con reintentos automáticos
    const retryResult = await retryManager.executeWithRetry(
      async () => {
        return await sunatClient.enviarComprobante(
          request.empresaRuc,
          empresa.credencialesSunat,
          zipBuffer
        );
      },
      request.empresaRuc,
      comprobante.numero
    );

    // Verificar si el envío fue exitoso
    if (!retryResult.success) {
      console.log(
        `No se pudo enviar el comprobante tras ${retryResult.totalAttempts} intentos. Marcado como pendiente.`
      );

      // Retornar respuesta parcial - comprobante generado pero no enviado
      const response: ApiResponse<GenerarComprobanteResponse> = {
        success: false,
        data: {
          numeroComprobante: comprobante.numero,
          estado: EstadoComprobante.PENDIENTE,
          fechaEmision: comprobante.fecha.toISOString(),
          total: comprobante.total,
          moneda: comprobante.moneda,
          xmlFirmado: xmlFirmado,
        },
        message: `Comprobante generado y firmado, pero no se pudo enviar a SUNAT. El comprobante ha sido marcado como pendiente para reintento manual.`,
      };

      return {
        statusCode: 207, // Multi-Status - operación parcialmente exitosa
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(response),
      };
    }

    const cdr = retryResult.data!;
    console.log(`CDR recibido de SUNAT - Código: ${cdr.codigo}, Mensaje: ${cdr.mensaje}`);

    // 5. PROCESAR CDR
    await cdrHandler.procesarCDR(request.empresaRuc, comprobante.numero, cdr);

    // Recuperar comprobante actualizado
    const comprobanteActualizado = await comprobanteRepository.obtenerComprobante(
      request.empresaRuc,
      comprobante.numero
    );

    // 6. GENERAR PDF (si fue aceptado)
    let urlPDF: string | undefined;

    if (
      comprobanteActualizado &&
      comprobanteActualizado.estado === EstadoComprobante.ACEPTADO
    ) {
      console.log('Generando PDF...');
      try {
        const pdfBuffer = await pdfGenerator.generarPDF(comprobanteActualizado, cdr);
        urlPDF = await s3Repository.guardarPDF(
          request.empresaRuc,
          comprobante.numero,
          pdfBuffer
        );
        console.log(`PDF generado exitosamente: ${urlPDF}`);
      } catch (error) {
        console.error('Error al generar PDF:', error);
        // No fallar la operación completa si falla el PDF
      }
    }

    // 7. RETORNAR RESULTADO COMPLETO
    const response: ApiResponse<GenerarComprobanteResponse> = {
      success: true,
      data: {
        numeroComprobante: comprobante.numero,
        estado: comprobanteActualizado?.estado || EstadoComprobante.ENVIADO,
        fechaEmision: comprobante.fecha.toISOString(),
        total: comprobante.total,
        moneda: comprobante.moneda,
        cdr: {
          codigo: cdr.codigo,
          mensaje: cdr.mensaje,
          fechaRecepcion: cdr.fechaRecepcion.toISOString(),
        },
        urlPDF,
        xmlFirmado,
      },
      message: 'Comprobante generado, firmado y enviado exitosamente a SUNAT',
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
    console.error('Error en generar-comprobante:', error);

    let statusCode = 500;
    let errorMessage = 'Error interno al procesar comprobante';

    if (error instanceof Error) {
      errorMessage = error.message;

      // Errores específicos
      if (error.message.includes('Error SOAP de SUNAT')) {
        statusCode = 502;
      } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        statusCode = 504;
      } else if (error.message.includes('no encontrado') || error.message.includes('not found')) {
        statusCode = 404;
      } else if (
        error.message.includes('inválido') ||
        error.message.includes('requerido') ||
        error.message.includes('debe')
      ) {
        statusCode = 400;
      }
    }

    return createErrorResponse(statusCode, errorMessage);
  }
};

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
