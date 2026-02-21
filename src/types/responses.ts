/**
 * Tipos para respuestas de API y operaciones
 */

import { Comprobante, CDR } from './comprobante';
import { Empresa } from './empresa';

/**
 * Respuesta estándar de API
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Respuesta de generación de comprobante
 */
export interface GenerarComprobanteResponse {
  comprobante: Comprobante;
  xml: string;
  numero: string;
}

/**
 * Respuesta de firma de comprobante
 */
export interface FirmarComprobanteResponse {
  xmlFirmado: string;
  success: boolean;
  error?: string;
}

/**
 * Respuesta de envío a SUNAT
 */
export interface EnviarSunatResponse {
  success: boolean;
  cdr?: CDR;
  ticket?: string; // Para envíos asíncronos
  error?: string;
  codigoError?: string;
}

/**
 * Respuesta de consulta de estado
 */
export interface ConsultarEstadoResponse {
  numero: string;
  estado: string;
  cdr?: CDR & { urlDescarga?: string };
  motivoRechazo?: string;
  fechaEnvio?: Date;
  fechaAceptacion?: Date;
}

/**
 * Respuesta de generación de PDF
 */
export interface GenerarPDFResponse {
  pdf: Buffer;
  url?: string; // URL de descarga si está en S3
  codigoQR: string;
}

/**
 * Respuesta de registro de empresa
 */
export interface RegistrarEmpresaResponse {
  empresa: Empresa;
  message: string;
}

/**
 * Respuesta de carga de certificado
 */
export interface CargarCertificadoResponse {
  success: boolean;
  ruc: string;
  fechaVencimiento: Date;
  diasParaVencer: number;
  message: string;
}

/**
 * Respuesta de listado de comprobantes
 */
export interface ListarComprobantesResponse {
  comprobantes: Comprobante[];
  total: number;
  pagina?: number;
  totalPaginas?: number;
}

/**
 * Error de validación detallado
 */
export interface ValidationError {
  campo: string;
  valor?: unknown;
  mensaje: string;
  codigo?: string;
}

/**
 * Respuesta de validación con errores detallados
 */
export interface ValidationResponse {
  valido: boolean;
  errores: ValidationError[];
}
