/**
 * Tipos comunes para el Sistema de Facturación Electrónica SUNAT
 */

/**
 * Dirección física
 */
export interface Direccion {
  ubigeo?: string; // Código de ubigeo (distrito)
  departamento: string;
  provincia: string;
  distrito: string;
  urbanizacion?: string;
  direccion: string; // Dirección completa
  codigoPais?: string; // Código ISO del país (PE para Perú)
}

/**
 * Resultado de validación
 */
export interface ValidationResult {
  valido: boolean;
  errores: string[];
}

/**
 * Montos de un comprobante
 */
export interface Montos {
  subtotal: number;
  igv: number;
  total: number;
}
