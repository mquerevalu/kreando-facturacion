/**
 * Lambda handler para consultar el estado de comprobantes
 * Requisitos: 6.1, 6.2, 6.3, 6.4
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { ConsultarEstadoResponse, ApiResponse, CDR } from '../types';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const comprobanteRepository = new DynamoDBComprobanteRepository();
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.COMPROBANTES_BUCKET || 'sunat-comprobantes';

/**
 * Handler principal para consultar estado de comprobantes
 * 
 * Endpoint: GET /comprobantes/{empresaRuc}/{numero}/estado
 * 
 * Retorna:
 * - Estado del comprobante (PENDIENTE, ENVIADO, ACEPTADO, RECHAZADO)
 * - Motivo de rechazo si aplica
 * - URL de descarga del CDR para comprobantes aceptados
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Extraer parámetros de la ruta y query string
    const numero = event.pathParameters?.numero;
    const empresaRuc = event.queryStringParameters?.empresaRuc;

    // Validar parámetros requeridos
    if (!empresaRuc || !numero) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Parámetros empresaRuc y numero son requeridos',
        } as ApiResponse),
      };
    }

    // Validar formato de RUC
    if (!/^\d{11}$/.test(empresaRuc)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'RUC debe tener 11 dígitos numéricos',
        } as ApiResponse),
      };
    }

    // Obtener comprobante del repositorio
    const comprobante = await comprobanteRepository.obtenerComprobante(empresaRuc, numero);

    if (!comprobante) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: `Comprobante ${numero} no encontrado para empresa ${empresaRuc}`,
        } as ApiResponse),
      };
    }

    // Construir respuesta base
    const response: ConsultarEstadoResponse = {
      numero: comprobante.numero,
      estado: comprobante.estado,
    };

    // Si el comprobante fue rechazado, incluir motivo de rechazo
    if (comprobante.estado === 'RECHAZADO' && comprobante.cdr) {
      response.motivoRechazo = comprobante.cdr.mensaje;
    }

    // Si el comprobante fue aceptado, generar URL de descarga del CDR
    if (comprobante.estado === 'ACEPTADO' && comprobante.cdr) {
      try {
        const cdrKey = `${empresaRuc}/cdr/${numero}.xml`;
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: cdrKey,
        });

        // Generar URL firmada válida por 1 hora
        const urlDescargaCDR = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        response.cdr = {
          ...comprobante.cdr,
          urlDescarga: urlDescargaCDR,
        } as CDR & { urlDescarga: string };
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error al generar URL de descarga del CDR:', error);
        // No fallar la petición si no se puede generar la URL
        response.cdr = comprobante.cdr;
      }
    }

    // Incluir fechas si están disponibles
    if (comprobante.fechaCreacion) {
      response.fechaEnvio = comprobante.fechaCreacion;
    }

    if (comprobante.cdr?.fechaRecepcion) {
      response.fechaAceptacion = comprobante.cdr.fechaRecepcion;
    }

    // Incluir XML firmado si está disponible
    if (comprobante.xmlFirmado) {
      (response as any).xmlFirmado = comprobante.xmlFirmado;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: response,
      } as ApiResponse<ConsultarEstadoResponse>),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error al consultar estado del comprobante:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: 'Error interno al consultar estado del comprobante',
        message: error instanceof Error ? error.message : 'Error desconocido',
      } as ApiResponse),
    };
  }
};
