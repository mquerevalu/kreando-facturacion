/**
 * Lambda handler para generar PDF de comprobantes aceptados
 * Se ejecuta automáticamente cuando un comprobante es aceptado por SUNAT
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { S3FileRepository } from '../repositories/S3Repository';
import { PDFGenerator } from '../services/PDFGenerator';
import { EstadoComprobante } from '../types';

const comprobanteRepo = new DynamoDBComprobanteRepository();
const s3Repo = new S3FileRepository();
const pdfGenerator = new PDFGenerator();

/**
 * Handler principal para generar PDF
 * Espera: { empresaRuc: string, numero: string }
 * Retorna: { url: string, mensaje: string }
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Parsear el body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Body requerido',
        }),
      };
    }

    const { empresaRuc, numero } = JSON.parse(event.body);

    // Validar parámetros
    if (!empresaRuc || !numero) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'empresaRuc y numero son requeridos',
        }),
      };
    }

    // Obtener el comprobante
    const comprobante = await comprobanteRepo.obtenerComprobante(empresaRuc, numero);

    if (!comprobante) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: `Comprobante ${numero} no encontrado para empresa ${empresaRuc}`,
        }),
      };
    }

    // Validar que el comprobante esté aceptado
    if (comprobante.estado !== EstadoComprobante.ACEPTADO) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `El comprobante debe estar en estado ACEPTADO. Estado actual: ${comprobante.estado}`,
        }),
      };
    }

    // Generar el PDF
    const pdfBuffer = await pdfGenerator.generarPDF(comprobante, comprobante.cdr);

    // Guardar el PDF en S3
    const s3Key = await s3Repo.guardarPDF(empresaRuc, numero, pdfBuffer);

    // Construir URL del PDF (presigned URL o URL pública según configuración)
    const pdfUrl = `https://${process.env.S3_BUCKET || 'sunat-facturacion-archivos'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        mensaje: 'PDF generado exitosamente',
        url: pdfUrl,
        numero: comprobante.numero,
        empresaRuc: comprobante.empresaRuc,
      }),
    };
  } catch (error) {
    console.error('Error al generar PDF:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error al generar PDF',
        detalle: error instanceof Error ? error.message : 'Error desconocido',
      }),
    };
  }
};
