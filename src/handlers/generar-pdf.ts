/**
 * Lambda handler para generar PDF de comprobantes aceptados
 * Se ejecuta automáticamente cuando un comprobante es aceptado por SUNAT
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { DynamoDBEmpresaRepository } from '../repositories/EmpresaRepository';
import { S3FileRepository } from '../repositories/S3Repository';
import { PDFGenerator } from '../services/PDFGenerator';
import { EstadoComprobante } from '../types';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const comprobanteRepo = new DynamoDBComprobanteRepository();
const empresaRepo = new DynamoDBEmpresaRepository();
const s3Repo = new S3FileRepository();
const pdfGenerator = new PDFGenerator();
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

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
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: `Comprobante ${numero} no encontrado para empresa ${empresaRuc}`,
        }),
      };
    }

    // Obtener datos de la empresa
    const empresa = await empresaRepo.obtenerEmpresa(empresaRuc);
    if (!empresa) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: `Empresa con RUC ${empresaRuc} no encontrada`,
        }),
      };
    }

    // Obtener logo de la empresa si existe
    let logoBuffer: Buffer | undefined;
    if (empresa.logoUrl) {
      try {
        const bucketName = process.env.S3_BUCKET;
        const urlParts = empresa.logoUrl.split('.amazonaws.com/');
        const key = urlParts.length > 1 ? urlParts[1] : `empresas/logos/${empresaRuc}.png`;
        
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        });
        
        const response = await s3Client.send(command);
        if (response.Body) {
          const chunks: Uint8Array[] = [];
          for await (const chunk of response.Body as any) {
            chunks.push(chunk);
          }
          logoBuffer = Buffer.concat(chunks);
        }
      } catch (error) {
        console.log('No se pudo obtener el logo de la empresa:', error);
        // Continuar sin logo
      }
    }

    // Validar que el comprobante esté aceptado (opcional - permitir generar PDF en cualquier estado)
    // if (comprobante.estado !== EstadoComprobante.ACEPTADO) {
    //   return {
    //     statusCode: 400,
    //     body: JSON.stringify({
    //       error: `El comprobante debe estar en estado ACEPTADO. Estado actual: ${comprobante.estado}`,
    //     }),
    //   };
    // }

    // Generar el PDF
    const pdfBuffer = await pdfGenerator.generarPDF(comprobante, empresa, logoBuffer, comprobante.cdr);

    // Guardar el PDF en S3
    const s3Key = await s3Repo.guardarPDF(empresaRuc, numero, pdfBuffer);

    // Construir URL del PDF (presigned URL o URL pública según configuración)
    const pdfUrl = `https://${process.env.S3_BUCKET || 'sunat-facturacion-archivos'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': `attachment; filename="${numero}.pdf"`,
      },
      body: pdfBuffer.toString('base64'),
      isBase64Encoded: true,
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
