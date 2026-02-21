/**
 * Enumeraciones para el Sistema de Facturación Electrónica SUNAT
 */

/**
 * Tipos de comprobantes según catálogo 01 de SUNAT
 */
export enum TipoComprobante {
  FACTURA = '01',
  BOLETA = '03',
  NOTA_CREDITO = '07',
  NOTA_DEBITO = '08',
}

/**
 * Estados del comprobante en el sistema
 */
export enum EstadoComprobante {
  PENDIENTE = 'PENDIENTE',
  ENVIADO = 'ENVIADO',
  ACEPTADO = 'ACEPTADO',
  RECHAZADO = 'RECHAZADO',
}

/**
 * Tipos de moneda según catálogo de SUNAT
 */
export enum TipoMoneda {
  PEN = 'PEN', // Soles
  USD = 'USD', // Dólares
}

/**
 * Tipos de documentos de identidad según catálogo 06 de SUNAT
 */
export enum TipoDocumentoIdentidad {
  DNI = '1',
  RUC = '6',
  CARNET_EXTRANJERIA = '4',
  PASAPORTE = '7',
}

/**
 * Códigos de afectación del IGV según catálogo 07 de SUNAT
 */
export enum AfectacionIGV {
  GRAVADO_OPERACION_ONEROSA = '10',
  GRAVADO_RETIRO_BONIFICACION = '11',
  GRAVADO_RETIRO = '12',
  GRAVADO_RETIRO_PREMIO = '13',
  GRAVADO_BONIFICACION = '14',
  GRAVADO_RETIRO_PUBLICIDAD = '15',
  GRAVADO_BONIFICACION_RETIRO = '16',
  GRAVADO_IVAP = '17',
  EXONERADO_OPERACION_ONEROSA = '20',
  INAFECTO_OPERACION_ONEROSA = '30',
  INAFECTO_RETIRO_BONIFICACION = '31',
  INAFECTO_RETIRO = '32',
  INAFECTO_RETIRO_MUESTRAS_MEDICAS = '33',
  INAFECTO_CONVENIO_COLECTIVO = '34',
  INAFECTO_RETIRO_PREMIO = '35',
  INAFECTO_RETIRO_PUBLICIDAD = '36',
  EXPORTACION = '40',
}
