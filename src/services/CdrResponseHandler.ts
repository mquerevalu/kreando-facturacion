/**
 * Manejador de respuestas CDR de SUNAT
 * 
 * Este módulo procesa las Constancias de Recepción (CDR) devueltas por SUNAT,
 * almacena el CDR en S3 y DynamoDB, y actualiza el estado del comprobante.
 */

import { CDR, EstadoComprobante } from '../types';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { S3FileRepository } from '../repositories/S3Repository';

/**
 * Opciones de configuración del manejador de CDR
 */
export interface CdrResponseHandlerOptions {
  comprobanteRepository?: DynamoDBComprobanteRepository;
  s3Repository?: S3FileRepository;
}

/**
 * Interfaz del manejador de respuestas CDR
 */
export interface ICdrResponseHandler {
  procesarCDR(empresaRuc: string, numeroComprobante: string, cdr: CDR): Promise<void>;
  determinarEstado(codigoCDR: string): EstadoComprobante;
}

/**
 * Manejador de respuestas CDR de SUNAT
 */
export class CdrResponseHandler implements ICdrResponseHandler {
  private comprobanteRepository: DynamoDBComprobanteRepository;
  private s3Repository: S3FileRepository;

  constructor(options: CdrResponseHandlerOptions = {}) {
    this.comprobanteRepository = options.comprobanteRepository || new DynamoDBComprobanteRepository();
    this.s3Repository = options.s3Repository || new S3FileRepository();
  }

  /**
   * Procesa un CDR recibido de SUNAT
   * 
   * Realiza las siguientes operaciones:
   * 1. Almacena el XML del CDR en S3
   * 2. Almacena los metadatos del CDR en DynamoDB
   * 3. Determina el estado del comprobante según el código de respuesta
   * 4. Actualiza el estado del comprobante en DynamoDB
   * 
   * @param empresaRuc - RUC de la empresa emisora
   * @param numeroComprobante - Número del comprobante (ej: B001-00000123)
   * @param cdr - CDR recibido de SUNAT
   */
  async procesarCDR(empresaRuc: string, numeroComprobante: string, cdr: CDR): Promise<void> {
    try {
      // 1. Almacenar el XML del CDR en S3
      if (cdr.xml) {
        await this.almacenarCDREnS3(empresaRuc, numeroComprobante, cdr.xml);
      }

      // 2. Almacenar los metadatos del CDR en DynamoDB
      await this.comprobanteRepository.guardarCDR(empresaRuc, numeroComprobante, cdr);

      // 3. Determinar el estado del comprobante según el código de respuesta
      const nuevoEstado = this.determinarEstado(cdr.codigo);

      // 4. Actualizar el estado del comprobante
      await this.comprobanteRepository.actualizarEstado(empresaRuc, numeroComprobante, nuevoEstado);
    } catch (error) {
      throw new Error(
        `Error al procesar CDR para comprobante ${numeroComprobante}: ${
          error instanceof Error ? error.message : 'Error desconocido'
        }`
      );
    }
  }

  /**
   * Determina el estado del comprobante según el código de respuesta de SUNAT
   * 
   * Códigos de SUNAT:
   * - 0: Aceptado
   * - 0001-0999: Excepciones (aceptado con observaciones)
   * - 2000-2999: Rechazado
   * - 4000-4999: Observaciones (aceptado con observaciones)
   * 
   * @param codigoCDR - Código de respuesta de SUNAT
   * @returns Estado del comprobante
   */
  determinarEstado(codigoCDR: string): EstadoComprobante {
    // Normalizar el código (eliminar espacios y convertir a número)
    const codigo = parseInt(codigoCDR.trim(), 10);

    // Código 0 = Aceptado
    if (codigo === 0) {
      return EstadoComprobante.ACEPTADO;
    }

    // Códigos 1-999 = Excepciones (aceptado con observaciones)
    if (codigo >= 1 && codigo <= 999) {
      return EstadoComprobante.ACEPTADO;
    }

    // Códigos 2000-2999 = Rechazado
    if (codigo >= 2000 && codigo <= 2999) {
      return EstadoComprobante.RECHAZADO;
    }

    // Códigos 4000-4999 = Observaciones (aceptado con observaciones)
    if (codigo >= 4000 && codigo <= 4999) {
      return EstadoComprobante.ACEPTADO;
    }

    // Códigos especiales
    if (codigoCDR === 'TICKET' || codigoCDR === 'PROCESANDO') {
      return EstadoComprobante.ENVIADO;
    }

    // Por defecto, si no se reconoce el código, marcar como rechazado
    return EstadoComprobante.RECHAZADO;
  }

  /**
   * Almacena el XML del CDR en S3
   * 
   * @param empresaRuc - RUC de la empresa emisora
   * @param numeroComprobante - Número del comprobante
   * @param cdrXml - XML del CDR
   */
  private async almacenarCDREnS3(
    empresaRuc: string,
    numeroComprobante: string,
    cdrXml: string
  ): Promise<void> {
    // Construir la ruta del CDR en S3: {empresaRuc}/cdrs/{numero}.xml
    const nombreArchivo = numeroComprobante.replace(/[^a-zA-Z0-9-]/g, '_');
    const key = `${empresaRuc}/cdrs/${nombreArchivo}.xml`;

    // Guardar usando el método genérico de S3
    await this.s3Repository.guardarXML(empresaRuc, `cdr-${numeroComprobante}`, cdrXml);
  }
}
