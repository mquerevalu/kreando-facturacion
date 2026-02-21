/**
 * Lambda Handler: firmar-comprobante
 * 
 * Responsabilidad: Firmar digitalmente comprobantes electrónicos
 * Requisitos: 2.1, 2.4
 * 
 * Flujo:
 * 1. Recuperar comprobante desde DynamoDB
 * 2. Recuperar certificado de la empresa desde Secrets Manager (vía CertificateManager)
 * 3. Firmar XML del comprobante usando DigitalSigner
 * 4. Guardar XML firmado en S3
 * 5. Actualizar comprobante en DynamoDB con referencia al XML firmado
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { S3FileRepository } from '../repositories/S3Repository';
import { CertificateManager } from '../services/CertificateManager';
import { DigitalSigner } from '../services/DigitalSigner';
import { EstadoComprobante } from '../types';

// Inicializar servicios (reutilizados entre invocaciones Lambda)
// Estos pueden ser sobrescritos para testing
let comprobanteRepository = new DynamoDBComprobanteRepository();
let s3Repository = new S3FileRepository();
let certificateManager = new CertificateManager();
let digitalSigner = new DigitalSigner(certificateManager);

// Función para inyectar dependencias (usado en tests)
export function setDependencies(deps: {
  comprobanteRepository?: DynamoDBComprobanteRepository;
  s3Repository?: S3FileRepository;
  certificateManager?: CertificateManager;
  digitalSigner?: DigitalSigner;
}) {
  if (deps.comprobanteRepository) comprobanteRepository = deps.comprobanteRepository;
  if (deps.s3Repository) s3Repository = deps.s3Repository;
  if (deps.certificateManager) certificateManager = deps.certificateManager;
  if (deps.digitalSigner) digitalSigner = deps.digitalSigner;
}

/**
 * Request body esperado
 */
interface FirmarComprobanteRequest {
  empresaRuc: string;
  numeroComprobante: string;
}

/**
 * Response body
 */
interface FirmarComprobanteResponse {
  success: boolean;
  message: string;
  numeroComprobante?: string;
  rutaXMLFirmado?: string;
  error?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Parsear body del request
    if (!event.body) {
      return crearRespuestaError(400, 'El cuerpo de la solicitud es requerido');
    }

    const request: FirmarComprobanteRequest = JSON.parse(event.body);

    // Validar parámetros requeridos
    if (!request.empresaRuc || !request.numeroComprobante) {
      return crearRespuestaError(
        400,
        'Los parámetros empresaRuc y numeroComprobante son requeridos'
      );
    }

    // Validar formato de RUC
    if (!/^\d{11}$/.test(request.empresaRuc)) {
      return crearRespuestaError(400, 'El RUC debe tener 11 dígitos numéricos');
    }

    // 1. Recuperar comprobante desde DynamoDB
    const comprobante = await comprobanteRepository.obtenerComprobante(
      request.empresaRuc,
      request.numeroComprobante
    );

    if (!comprobante) {
      return crearRespuestaError(
        404,
        `Comprobante ${request.numeroComprobante} no encontrado para empresa ${request.empresaRuc}`
      );
    }

    // Validar que el comprobante tenga XML original
    if (!comprobante.xmlOriginal) {
      return crearRespuestaError(
        400,
        'El comprobante no tiene XML original para firmar'
      );
    }

    // Validar que el comprobante no esté ya firmado
    if (comprobante.xmlFirmado) {
      return crearRespuestaError(
        400,
        'El comprobante ya está firmado'
      );
    }

    // 2. Recuperar certificado de la empresa desde CertificateManager
    // (CertificateManager internamente usa Secrets Manager en producción)
    let certificado;
    try {
      certificado = await certificateManager.obtenerCertificado(request.empresaRuc);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      return crearRespuestaError(
        404,
        `No se encontró certificado para la empresa: ${errorMessage}`
      );
    }

    // Validar que el certificado esté vigente
    const vigente = await digitalSigner.verificarVigencia(request.empresaRuc);
    if (!vigente) {
      return crearRespuestaError(
        400,
        `El certificado de la empresa está vencido. Fecha de vencimiento: ${certificado.fechaVencimiento.toISOString()}`
      );
    }

    // 3. Firmar XML del comprobante usando DigitalSigner
    // (Requisitos 2.1, 2.4: Firma digital con XMLDSig)
    let xmlFirmado: string;
    try {
      xmlFirmado = await digitalSigner.firmarXML(
        request.empresaRuc,
        comprobante.xmlOriginal
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      return crearRespuestaError(
        500,
        `Error al firmar el comprobante: ${errorMessage}`
      );
    }

    // 4. Guardar XML firmado en S3
    let rutaXMLFirmado: string;
    try {
      rutaXMLFirmado = await s3Repository.guardarXML(
        request.empresaRuc,
        `${request.numeroComprobante}-firmado`,
        xmlFirmado
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      return crearRespuestaError(
        500,
        `Error al guardar XML firmado en S3: ${errorMessage}`
      );
    }

    // 5. Actualizar comprobante en DynamoDB con XML firmado
    try {
      comprobante.xmlFirmado = xmlFirmado;
      comprobante.estado = EstadoComprobante.PENDIENTE; // Listo para enviar a SUNAT
      await comprobanteRepository.guardarComprobante(request.empresaRuc, comprobante);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      return crearRespuestaError(
        500,
        `Error al actualizar comprobante en DynamoDB: ${errorMessage}`
      );
    }

    // Respuesta exitosa
    const response: FirmarComprobanteResponse = {
      success: true,
      message: 'Comprobante firmado exitosamente',
      numeroComprobante: request.numeroComprobante,
      rutaXMLFirmado,
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
    console.error('Error inesperado en firmar-comprobante:', error);
    return crearRespuestaError(
      500,
      `Error interno del servidor: ${error instanceof Error ? error.message : 'Error desconocido'}`
    );
  }
};

/**
 * Crea una respuesta de error estandarizada
 */
function crearRespuestaError(statusCode: number, mensaje: string): APIGatewayProxyResult {
  const response: FirmarComprobanteResponse = {
    success: false,
    message: mensaje,
    error: mensaje,
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
