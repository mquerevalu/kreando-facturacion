/**
 * Tipos relacionados con empresas y certificados
 */

import { Direccion } from './common';

/**
 * Credenciales SOL de SUNAT para una empresa
 */
export interface Credenciales {
  ruc: string;
  usuario: string; // Usuario SOL
  password: string; // Clave SOL (encriptada)
}

/**
 * Certificado digital de una empresa
 */
export interface Certificado {
  ruc: string; // RUC de la empresa propietaria
  archivo: Buffer; // Archivo PFX/P12
  password: string; // Contraseña del certificado (encriptada)
  fechaEmision: Date;
  fechaVencimiento: Date;
  emisor: string; // Entidad emisora del certificado
}

/**
 * Empresa registrada en el sistema (multi-tenant)
 */
export interface Empresa {
  ruc: string; // RUC de la empresa (identificador único)
  razonSocial: string;
  nombreComercial: string;
  direccion: Direccion;
  certificado?: Certificado; // Certificado digital de la empresa
  credencialesSunat: Credenciales; // Credenciales SOL de la empresa
  activo: boolean;
  fechaRegistro: Date;
}

/**
 * Datos para registrar o actualizar una empresa
 */
export interface DatosEmpresa {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: Direccion;
  credencialesSunat: Credenciales;
  activo?: boolean;
}
