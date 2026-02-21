/**
 * Implementación del repositorio de archivos usando S3
 * Garantiza aislamiento multi-tenant mediante prefijos por RUC
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { S3Repository } from './interfaces';

/**
 * Repositorio de archivos con S3
 * Bucket: sunat-facturacion-archivos
 * Estructura de prefijos:
 * - {empresaRuc}/xmls/{numero}.xml
 * - {empresaRuc}/pdfs/{numero}.pdf
 * - {empresaRuc}/certificados/{nombre}.pfx
 */
export class S3FileRepository implements S3Repository {
  private client: S3Client;
  private bucketName: string;

  constructor(client?: S3Client, bucketName?: string) {
    this.client = client || new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bucketName = bucketName || process.env.S3_BUCKET || 'sunat-facturacion-archivos';
  }

  /**
   * Guarda un XML en S3
   * Organiza por empresa usando prefijo: {empresaRuc}/xmls/{numero}.xml
   */
  async guardarXML(empresaRuc: string, numero: string, contenido: string): Promise<string> {
    const key = this.construirRutaXML(empresaRuc, numero);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: contenido,
      ContentType: 'application/xml',
      Metadata: {
        empresaRuc,
        numero,
        tipo: 'xml',
      },
    });

    await this.client.send(command);
    return key;
  }

  /**
   * Recupera un XML desde S3
   */
  async recuperarXML(empresaRuc: string, numero: string): Promise<string | null> {
    const key = this.construirRutaXML(empresaRuc, numero);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      return await this.streamToString(response.Body);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Guarda un PDF en S3
   * Organiza por empresa usando prefijo: {empresaRuc}/pdfs/{numero}.pdf
   */
  async guardarPDF(empresaRuc: string, numero: string, contenido: Buffer): Promise<string> {
    const key = this.construirRutaPDF(empresaRuc, numero);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: contenido,
      ContentType: 'application/pdf',
      Metadata: {
        empresaRuc,
        numero,
        tipo: 'pdf',
      },
    });

    await this.client.send(command);
    return key;
  }

  /**
   * Recupera un PDF desde S3
   */
  async recuperarPDF(empresaRuc: string, numero: string): Promise<Buffer | null> {
    const key = this.construirRutaPDF(empresaRuc, numero);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      return await this.streamToBuffer(response.Body);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Guarda un certificado en S3
   * Organiza por empresa usando prefijo: {empresaRuc}/certificados/{nombre}.pfx
   */
  async guardarCertificado(empresaRuc: string, nombre: string, contenido: Buffer): Promise<string> {
    const key = this.construirRutaCertificado(empresaRuc, nombre);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: contenido,
      ContentType: 'application/x-pkcs12',
      Metadata: {
        empresaRuc,
        nombre,
        tipo: 'certificado',
      },
      ServerSideEncryption: 'AES256', // Encriptación en reposo
    });

    await this.client.send(command);
    return key;
  }

  /**
   * Recupera un certificado desde S3
   */
  async recuperarCertificado(empresaRuc: string, nombre: string): Promise<Buffer | null> {
    const key = this.construirRutaCertificado(empresaRuc, nombre);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      return await this.streamToBuffer(response.Body);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Elimina un archivo de S3
   */
  async eliminarArchivo(empresaRuc: string, ruta: string): Promise<void> {
    // Validar que la ruta comienza con el RUC de la empresa (seguridad multi-tenant)
    if (!ruta.startsWith(`${empresaRuc}/`)) {
      throw new Error('La ruta del archivo no pertenece a la empresa especificada');
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: ruta,
    });

    await this.client.send(command);
  }

  /**
   * Lista archivos de una empresa en S3
   */
  async listarArchivos(empresaRuc: string, prefijo?: string): Promise<string[]> {
    const prefix = prefijo ? `${empresaRuc}/${prefijo}` : `${empresaRuc}/`;

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const response = await this.client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      return [];
    }

    return response.Contents.map((item) => item.Key!).filter((key) => key !== undefined);
  }

  /**
   * Construye la ruta de un XML en S3
   */
  private construirRutaXML(empresaRuc: string, numero: string): string {
    // Sanitizar el número para usar como nombre de archivo
    const nombreArchivo = numero.replace(/[^a-zA-Z0-9-]/g, '_');
    return `${empresaRuc}/xmls/${nombreArchivo}.xml`;
  }

  /**
   * Construye la ruta de un PDF en S3
   */
  private construirRutaPDF(empresaRuc: string, numero: string): string {
    // Sanitizar el número para usar como nombre de archivo
    const nombreArchivo = numero.replace(/[^a-zA-Z0-9-]/g, '_');
    return `${empresaRuc}/pdfs/${nombreArchivo}.pdf`;
  }

  /**
   * Construye la ruta de un certificado en S3
   */
  private construirRutaCertificado(empresaRuc: string, nombre: string): string {
    // Sanitizar el nombre para usar como nombre de archivo
    const nombreArchivo = nombre.replace(/[^a-zA-Z0-9-_.]/g, '_');
    return `${empresaRuc}/certificados/${nombreArchivo}`;
  }

  /**
   * Convierte un stream a string
   */
  private async streamToString(
    stream: Readable | ReadableStream | Blob | undefined
  ): Promise<string> {
    if (!stream) {
      return '';
    }

    const chunks: Uint8Array[] = [];

    if (stream instanceof Readable) {
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
    } else {
      // Para ReadableStream o Blob
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  /**
   * Convierte un stream a Buffer
   */
  private async streamToBuffer(
    stream: Readable | ReadableStream | Blob | undefined
  ): Promise<Buffer> {
    if (!stream) {
      return Buffer.alloc(0);
    }

    const chunks: Uint8Array[] = [];

    if (stream instanceof Readable) {
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
    } else {
      // Para ReadableStream o Blob
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    }

    return Buffer.concat(chunks);
  }
}
