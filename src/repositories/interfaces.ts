/**
 * Interfaces de repositorios para el Sistema de Facturación Electrónica SUNAT
 */

import {
  Empresa,
  DatosEmpresa,
  Comprobante,
  CDR,
  EstadoComprobante,
  FiltrosComprobante,
} from '../types';

/**
 * Repositorio de empresas
 * Gestiona la persistencia de empresas en el sistema multi-tenant
 */
export interface EmpresaRepository {
  /**
   * Registra una nueva empresa en el sistema
   */
  registrarEmpresa(datos: DatosEmpresa): Promise<Empresa>;

  /**
   * Obtiene una empresa por su RUC
   */
  obtenerEmpresa(ruc: string): Promise<Empresa | null>;

  /**
   * Actualiza los datos de una empresa
   */
  actualizarEmpresa(ruc: string, datos: Partial<DatosEmpresa>): Promise<Empresa>;

  /**
   * Lista todas las empresas del sistema
   */
  listarEmpresas(): Promise<Empresa[]>;

  /**
   * Elimina una empresa del sistema (soft delete)
   */
  eliminarEmpresa(ruc: string): Promise<void>;
}

/**
 * Repositorio de archivos S3
 * Gestiona el almacenamiento de XMLs, PDFs y certificados con aislamiento multi-tenant
 */
export interface S3Repository {
  /**
   * Guarda un XML en S3
   * Organiza por empresa usando prefijo: {empresaRuc}/xmls/{numero}.xml
   */
  guardarXML(empresaRuc: string, numero: string, contenido: string): Promise<string>;

  /**
   * Recupera un XML desde S3
   */
  recuperarXML(empresaRuc: string, numero: string): Promise<string | null>;

  /**
   * Guarda un PDF en S3
   * Organiza por empresa usando prefijo: {empresaRuc}/pdfs/{numero}.pdf
   */
  guardarPDF(empresaRuc: string, numero: string, contenido: Buffer): Promise<string>;

  /**
   * Recupera un PDF desde S3
   */
  recuperarPDF(empresaRuc: string, numero: string): Promise<Buffer | null>;

  /**
   * Guarda un certificado en S3
   * Organiza por empresa usando prefijo: {empresaRuc}/certificados/{nombre}.pfx
   */
  guardarCertificado(empresaRuc: string, nombre: string, contenido: Buffer): Promise<string>;

  /**
   * Recupera un certificado desde S3
   */
  recuperarCertificado(empresaRuc: string, nombre: string): Promise<Buffer | null>;

  /**
   * Elimina un archivo de S3
   */
  eliminarArchivo(empresaRuc: string, ruta: string): Promise<void>;

  /**
   * Lista archivos de una empresa en S3
   */
  listarArchivos(empresaRuc: string, prefijo?: string): Promise<string[]>;
}

/**
 * Repositorio de comprobantes
 * Gestiona la persistencia de comprobantes con aislamiento multi-tenant
 */
export interface ComprobanteRepository {
  /**
   * Guarda un comprobante en el sistema
   * Garantiza aislamiento multi-tenant mediante empresaRuc
   */
  guardarComprobante(empresaRuc: string, comprobante: Comprobante): Promise<void>;

  /**
   * Guarda el CDR de un comprobante
   */
  guardarCDR(empresaRuc: string, numero: string, cdr: CDR): Promise<void>;

  /**
   * Obtiene un comprobante por su número
   * Solo retorna comprobantes de la empresa especificada
   */
  obtenerComprobante(empresaRuc: string, numero: string): Promise<Comprobante | null>;

  /**
   * Obtiene el CDR de un comprobante
   */
  obtenerCDR(empresaRuc: string, numero: string): Promise<CDR | null>;

  /**
   * Lista comprobantes pendientes de envío de una empresa
   */
  listarPendientes(empresaRuc: string): Promise<Comprobante[]>;

  /**
   * Actualiza el estado de un comprobante
   */
  actualizarEstado(
    empresaRuc: string,
    numero: string,
    estado: EstadoComprobante
  ): Promise<void>;

  /**
   * Lista comprobantes de una empresa con filtros opcionales
   */
  listarComprobantes(
    empresaRuc: string,
    filtros?: FiltrosComprobante
  ): Promise<Comprobante[]>;

  /**
   * Obtiene el siguiente número correlativo para un tipo de comprobante
   */
  obtenerSiguienteNumero(empresaRuc: string, tipo: string, serie: string): Promise<number>;
}
