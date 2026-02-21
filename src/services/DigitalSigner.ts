/**
 * DigitalSigner - Firmador Digital de Documentos XML
 * 
 * Responsabilidad: Firmar digitalmente los documentos XML usando certificados digitales
 * Requisitos: 2.1, 2.2, 2.3, 2.4
 */

import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import * as crypto from 'crypto';
import { ValidationResult } from '../types/common';
import { ICertificateManager } from './CertificateManager';

/**
 * Interfaz del firmador digital
 */
export interface IDigitalSigner {
  /**
   * Firma un documento XML con el certificado de la empresa
   * @param empresaRuc RUC de la empresa
   * @param xml Documento XML a firmar
   * @returns XML firmado con XMLDSig
   * @throws Error si el certificado es inválido o está vencido
   */
  firmarXML(empresaRuc: string, xml: string): Promise<string>;

  /**
   * Valida que el certificado de una empresa sea válido
   * @param empresaRuc RUC de la empresa
   * @returns Resultado de validación
   */
  validarCertificado(empresaRuc: string): Promise<ValidationResult>;

  /**
   * Verifica que el certificado de una empresa esté vigente
   * @param empresaRuc RUC de la empresa
   * @returns true si el certificado está vigente
   */
  verificarVigencia(empresaRuc: string): Promise<boolean>;
}

/**
 * Implementación del firmador digital
 */
export class DigitalSigner implements IDigitalSigner {
  constructor(private certificateManager: ICertificateManager) {}

  /**
   * Firma un documento XML con el certificado de la empresa
   * Requisitos: 2.1, 2.2, 2.3, 2.4
   */
  async firmarXML(empresaRuc: string, xml: string): Promise<string> {
    // Validar que el XML no esté vacío
    if (!xml || xml.trim().length === 0) {
      throw new Error('El documento XML está vacío');
    }

    // Validar que el certificado esté vigente (Requisito 2.2)
    const vigente = await this.verificarVigencia(empresaRuc);
    if (!vigente) {
      throw new Error('El certificado está vencido o aún no es válido');
    }

    // Validar correspondencia RUC-certificado (Requisito 2.3)
    const validacion = await this.validarCertificado(empresaRuc);
    if (!validacion.valido) {
      throw new Error(
        `El certificado no es válido: ${validacion.errores.join(', ')}`
      );
    }

    // Obtener certificado de la empresa
    const certificado = await this.certificateManager.obtenerCertificado(empresaRuc);

    // Desencriptar contraseña
    const password = this.desencriptarPassword(certificado.password);

    // Extraer clave privada y certificado del archivo PFX/P12
    const { privateKey, publicCert } = await this.extraerClaves(
      certificado.archivo,
      password
    );

    // Parsear XML (para validación)
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    
    // Verificar que el XML sea válido
    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('El documento XML no es válido');
    }

    // Crear firma XMLDSig (Requisito 2.4)
    const sig = new SignedXml({
      privateKey: privateKey,
      publicCert: publicCert,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });

    // Configurar transformaciones
    sig.addReference({
      xpath: "//*[local-name(.)='Invoice' or local-name(.)='CreditNote' or local-name(.)='DebitNote']",
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      ],
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    });

    // Agregar información del certificado
    const keyInfoProvider = {
      getKeyInfo: (): string => {
        return `<X509Data><X509Certificate>${publicCert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, '')}</X509Certificate></X509Data>`;
      },
    };
    
    // Asignar el proveedor de información de clave
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sig as any).keyInfoProvider = keyInfoProvider;

    // Firmar el documento
    sig.computeSignature(xml);

    // Obtener XML firmado
    const xmlFirmado = sig.getSignedXml();

    return xmlFirmado;
  }

  /**
   * Valida que el certificado de una empresa sea válido
   * Requisito: 2.3
   */
  async validarCertificado(empresaRuc: string): Promise<ValidationResult> {
    // Delegar validación al CertificateManager
    return await this.certificateManager.validarCertificado(empresaRuc);
  }

  /**
   * Verifica que el certificado de una empresa esté vigente
   * Requisito: 2.2
   */
  async verificarVigencia(empresaRuc: string): Promise<boolean> {
    try {
      const certificado = await this.certificateManager.obtenerCertificado(empresaRuc);
      const ahora = new Date();

      // Verificar que el certificado no esté vencido
      if (certificado.fechaVencimiento < ahora) {
        return false;
      }

      // Verificar que el certificado ya sea válido
      if (certificado.fechaEmision > ahora) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extrae la clave privada y el certificado público del archivo PFX/P12
   * @private
   */
  private async extraerClaves(
    _archivo: Buffer,
    _password: string
  ): Promise<{ privateKey: string; publicCert: string }> {
    try {
      // Usar OpenSSL para extraer la clave privada
      // En producción, esto se haría con node-forge o similar
      // Por ahora, generamos claves de prueba para desarrollo
      
      // TODO: Implementar extracción real usando node-forge
      // const forge = require('node-forge');
      // const p12Asn1 = forge.asn1.fromDer(archivo.toString('binary'));
      // const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
      // const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      // const certBag = bags[forge.pki.oids.certBag][0];
      // const cert = certBag.cert;
      // const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      // const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
      // const privateKey = keyBag.key;

      // Generar par de claves RSA de prueba
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      // Generar certificado autofirmado de prueba
      const publicCert = this.generarCertificadoPrueba(publicKey);

      return {
        privateKey,
        publicCert,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      throw new Error(`Error al extraer claves del certificado: ${errorMessage}`);
    }
  }

  /**
   * Genera un certificado de prueba
   * En producción, esto se reemplazará con el certificado real del PFX
   * @private
   */
  private generarCertificadoPrueba(publicKey: string): string {
    // Esto es solo para pruebas
    // En producción, se usará el certificado real del archivo PFX
    const base64Cert = Buffer.from(publicKey).toString('base64');
    return `-----BEGIN CERTIFICATE-----\n${base64Cert}\n-----END CERTIFICATE-----`;
  }

  /**
   * Desencripta una contraseña
   * @private
   */
  private desencriptarPassword(passwordEncriptada: string): string {
    // TODO: Implementar desencriptación real
    // Por ahora, removemos el prefijo de prueba
    if (passwordEncriptada.startsWith('encrypted:')) {
      return passwordEncriptada.substring('encrypted:'.length);
    }
    return passwordEncriptada;
  }
}
