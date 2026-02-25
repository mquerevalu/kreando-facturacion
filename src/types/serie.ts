/**
 * Tipos relacionados con series de comprobantes
 */

import { TipoComprobante } from './enums';

/**
 * Serie de comprobante
 */
export interface Serie {
  empresaRuc: string; // RUC de la empresa propietaria
  tipoComprobante: TipoComprobante; // FACTURA (01) o BOLETA (03)
  serie: string; // Ej: F001, B001
  correlativo: number; // Número correlativo actual
  activo: boolean;
  fechaCreacion: Date;
  fechaActualizacion?: Date;
}

/**
 * Datos para crear o actualizar una serie
 */
export interface DatosSerie {
  empresaRuc: string;
  tipoComprobante: TipoComprobante;
  serie: string;
  correlativo?: number; // Opcional, por defecto 1
  activo?: boolean;
}
