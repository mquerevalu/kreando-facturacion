/**
 * Tipos relacionados con comprobantes electrónicos
 */

import { Direccion } from './common';
import { TipoComprobante, EstadoComprobante, TipoMoneda } from './enums';

/**
 * Datos del emisor del comprobante
 */
export interface Emisor {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: Direccion;
}

/**
 * Datos del receptor del comprobante
 */
export interface Receptor {
  tipoDocumento: string; // DNI | RUC | etc (catálogo 06)
  numeroDocumento: string;
  nombre: string; // Nombre o razón social
  direccion?: Direccion;
}

/**
 * Item o línea de detalle del comprobante
 */
export interface ItemComprobante {
  codigo: string; // Código del producto/servicio
  descripcion: string;
  cantidad: number;
  unidadMedida: string; // Código de unidad de medida (catálogo 03)
  precioUnitario: number;
  afectacionIGV: string; // Código del catálogo 07
  igv: number;
  total: number;
}

/**
 * Constancia de Recepción de SUNAT
 */
export interface CDR {
  codigo: string; // Código de respuesta SUNAT
  mensaje: string; // Mensaje de respuesta
  xml: string; // XML del CDR
  fechaRecepcion: Date;
}

/**
 * Comprobante electrónico completo
 */
export interface Comprobante {
  empresaRuc: string; // RUC de la empresa emisora (para multi-tenant)
  numero: string; // Numeración correlativa (ej: B001-00000123)
  tipo: TipoComprobante; // BOLETA | FACTURA
  fecha: Date;
  emisor: Emisor;
  receptor: Receptor;
  items: ItemComprobante[];
  subtotal: number;
  igv: number;
  total: number;
  moneda: TipoMoneda; // PEN | USD
  xmlOriginal?: string; // XML sin firmar
  xmlFirmado?: string; // XML con firma digital
  estado: EstadoComprobante; // PENDIENTE | ENVIADO | ACEPTADO | RECHAZADO
  cdr?: CDR;
  fechaCreacion?: Date;
  fechaActualizacion?: Date;
}

/**
 * Datos para generar una boleta
 */
export interface DatosBoleta {
  receptor: {
    tipoDocumento: string; // Generalmente DNI
    numeroDocumento: string;
    nombre: string;
  };
  items: ItemComprobante[];
  moneda?: TipoMoneda; // Por defecto PEN
  observaciones?: string;
}

/**
 * Datos para generar una factura
 */
export interface DatosFactura {
  receptor: {
    ruc: string;
    razonSocial: string;
    direccion?: Direccion;
  };
  items: ItemComprobante[];
  moneda?: TipoMoneda; // Por defecto PEN
  observaciones?: string;
}

/**
 * Datos genéricos para generar un comprobante
 */
export interface DatosComprobante {
  tipo: TipoComprobante;
  receptor: Receptor;
  items: ItemComprobante[];
  moneda: TipoMoneda;
  observaciones?: string;
}

/**
 * Filtros para consultar comprobantes
 */
export interface FiltrosComprobante {
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  fechaInicio?: Date;
  fechaFin?: Date;
  receptor?: string; // Número de documento del receptor
}
