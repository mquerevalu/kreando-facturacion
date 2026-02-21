/**
 * Pruebas basadas en propiedades para DigitalSigner
 * 
 * Feature: sunat
 * 
 * Estas pruebas validan propiedades universales del firmador digital
 * usando fast-check para generar múltiples casos de prueba aleatorios.
 */

import * as fc from 'fast-check';
import { DigitalSigner } from '../../services/DigitalSigner';
import { CertificateManager } from '../../services/CertificateManager';

describe('DigitalSigner - Property-Based Tests', () => {
  let digitalSigner: DigitalSigner;
  let certificateManager: CertificateManager;

  beforeEach(() => {
    certificateManager = new CertificateManager();
    digitalSigner = new DigitalSigner(certificateManager);
  });

  /**
   * **Propiedad 5: Presencia de firma digital válida**
   * **Valida: Requisitos 2.1, 2.4**
   * 
   * Para cualquier XML de comprobante procesado, debe contener una firma
   * digital válida según el estándar XMLDSig.
   */
  describe('Propiedad 5: Presencia de firma digital válida', () => {
    it('debe incluir firma XMLDSig en cualquier XML válido firmado', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          fc.constantFrom('Invoice', 'CreditNote', 'DebitNote'), // Tipos de documento
          async (ruc, comprobanteId, tipoDocumento) => {
            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<${tipoDocumento} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${tipoDocumento}-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</${tipoDocumento}>`;

            // Cargar certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Firmar el XML
            const xmlFirmado = await digitalSigner.firmarXML(ruc, xml);

            // Verificar que contiene todos los elementos de XMLDSig
            expect(xmlFirmado).toContain('Signature');
            expect(xmlFirmado).toContain('SignedInfo');
            expect(xmlFirmado).toContain('SignatureValue');
            expect(xmlFirmado).toContain('KeyInfo');
            expect(xmlFirmado).toContain('X509Data');
            expect(xmlFirmado).toContain('X509Certificate');
            
            // Verificar que el XML firmado es más largo que el original
            expect(xmlFirmado.length).toBeGreaterThan(xml.length);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe incluir SignedInfo con referencias correctas en cualquier XML firmado', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          async (ruc, comprobanteId) => {
            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // Cargar certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Firmar el XML
            const xmlFirmado = await digitalSigner.firmarXML(ruc, xml);

            // Verificar elementos específicos de SignedInfo
            expect(xmlFirmado).toContain('SignedInfo');
            expect(xmlFirmado).toContain('CanonicalizationMethod');
            expect(xmlFirmado).toContain('SignatureMethod');
            expect(xmlFirmado).toContain('Reference');
            expect(xmlFirmado).toContain('DigestMethod');
            expect(xmlFirmado).toContain('DigestValue');
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe incluir KeyInfo con certificado X509 en cualquier XML firmado', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          async (ruc, comprobanteId) => {
            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // Cargar certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Firmar el XML
            const xmlFirmado = await digitalSigner.firmarXML(ruc, xml);

            // Verificar elementos de KeyInfo
            expect(xmlFirmado).toContain('KeyInfo');
            expect(xmlFirmado).toContain('X509Data');
            expect(xmlFirmado).toContain('X509Certificate');
            
            // Verificar que el certificado X509 no esté vacío
            const x509Match = xmlFirmado.match(/<X509Certificate>(.+?)<\/X509Certificate>/);
            expect(x509Match).not.toBeNull();
            if (x509Match) {
              expect(x509Match[1].length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar firma de cualquier XML vacío o inválido', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.constantFrom('', '   ', '\n', '\t', 'not-xml', '<invalid>'), // XMLs inválidos
          async (ruc, xmlInvalido) => {
            // Cargar certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Intentar firmar XML inválido
            await expect(
              digitalSigner.firmarXML(ruc, xmlInvalido)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe generar firmas diferentes para XMLs diferentes con el mismo certificado', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID 1
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID 2
          async (ruc, id1, id2) => {
            // Asegurar que los IDs sean diferentes
            if (id1 === id2) {
              return;
            }

            // Crear dos XMLs diferentes
            const xml1 = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${id1}</cbc:ID>
</Invoice>`;

            const xml2 = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${id2}</cbc:ID>
</Invoice>`;

            // Cargar certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Firmar ambos XMLs
            const xmlFirmado1 = await digitalSigner.firmarXML(ruc, xml1);
            const xmlFirmado2 = await digitalSigner.firmarXML(ruc, xml2);

            // Las firmas deben ser diferentes
            expect(xmlFirmado1).not.toBe(xmlFirmado2);
            
            // Ambos deben contener firma válida
            expect(xmlFirmado1).toContain('Signature');
            expect(xmlFirmado2).toContain('Signature');
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe preservar el contenido original del XML al firmar', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => {
            // Filtrar caracteres que requieren escape XML
            return s.trim().length > 0 && 
                   !s.includes('&') && !s.includes('<') && !s.includes('>') && 
                   !s.includes('"') && !s.includes("'");
          }), // ID de comprobante sin caracteres especiales XML
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
            // Filtrar caracteres que requieren escape XML para simplificar la prueba
            return s.trim().length > 0 &&
                   !s.includes('&') && !s.includes('<') && !s.includes('>') && 
                   !s.includes('"') && !s.includes("'");
          }), // Contenido adicional sin caracteres especiales XML
          async (ruc, comprobanteId, contenidoAdicional) => {
            // Crear XML de prueba con contenido adicional
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
  <cbc:Note>${contenidoAdicional}</cbc:Note>
</Invoice>`;

            // Cargar certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Firmar el XML
            const xmlFirmado = await digitalSigner.firmarXML(ruc, xml);

            // Verificar que el contenido original se preserva
            expect(xmlFirmado).toContain(comprobanteId);
            expect(xmlFirmado).toContain(contenidoAdicional);
            expect(xmlFirmado).toContain('<cbc:ID>');
            expect(xmlFirmado).toContain('<cbc:Note>');
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 7: Validación de correspondencia RUC-certificado**
   * **Valida: Requisitos 2.3**
   * 
   * Para cualquier intento de firma, el sistema debe validar que el RUC del
   * certificado de la empresa coincida con el RUC de la empresa emisora,
   * rechazando firmas con certificados que no correspondan.
   */
  describe('Propiedad 7: Validación de correspondencia RUC-certificado', () => {
    it('debe rechazar firma cuando el RUC del certificado no coincide con el RUC de la empresa', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC empresa 1
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC empresa 2
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          async (ruc1, ruc2, comprobanteId) => {
            // Asegurar que los RUCs sean diferentes
            if (ruc1 === ruc2) {
              return;
            }

            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // Cargar certificado para empresa 2
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc2);
            await certificateManager.cargarCertificado(ruc2, certificadoBuffer, 'password123');

            // Obtener certificado de empresa 2 y asignarlo a empresa 1 (simulando uso incorrecto)
            const certificado = await certificateManager.obtenerCertificado(ruc2);
            (certificateManager as any).certificados.set(ruc1, certificado);

            // Intentar firmar con certificado de otra empresa
            await expect(
              digitalSigner.firmarXML(ruc1, xml)
            ).rejects.toThrow(/certificado no es válido/i);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe validar correspondencia RUC-certificado antes de firmar cualquier XML', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          async (ruc, comprobanteId) => {
            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // Cargar certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Validar certificado antes de firmar
            const validacion = await digitalSigner.validarCertificado(ruc);

            // Si el certificado es válido, la firma debe funcionar
            if (validacion.valido) {
              const xmlFirmado = await digitalSigner.firmarXML(ruc, xml);
              expect(xmlFirmado).toContain('Signature');
            } else {
              // Si el certificado no es válido, la firma debe fallar
              await expect(
                digitalSigner.firmarXML(ruc, xml)
              ).rejects.toThrow();
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe permitir firma solo cuando el RUC del certificado coincide exactamente', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          async (ruc, comprobanteId) => {
            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // Cargar certificado de prueba con el RUC correcto
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');

            // Firmar debe funcionar porque el RUC coincide
            const xmlFirmado = await digitalSigner.firmarXML(ruc, xml);

            // Verificar que la firma se realizó correctamente
            expect(xmlFirmado).toContain('Signature');
            expect(xmlFirmado).toContain('SignedInfo');
            expect(xmlFirmado).toContain('SignatureValue');
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar firma con certificado de cualquier otra empresa', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()),
            { minLength: 2, maxLength: 5 }
          ),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          async (rucs, comprobanteId) => {
            // Asegurar que todos los RUCs sean únicos
            const rucsUnicos = [...new Set(rucs)];
            if (rucsUnicos.length < 2) {
              return;
            }

            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // Cargar certificados para todas las empresas
            for (const ruc of rucsUnicos) {
              const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);
              await certificateManager.cargarCertificado(ruc, certificadoBuffer, 'password123');
            }

            // Intentar firmar con certificado de otra empresa
            const rucEmpresa = rucsUnicos[0];
            const rucOtraEmpresa = rucsUnicos[1];

            // Obtener certificado de otra empresa y asignarlo a la empresa actual
            const certificadoOtraEmpresa = await certificateManager.obtenerCertificado(rucOtraEmpresa);
            (certificateManager as any).certificados.set(rucEmpresa, certificadoOtraEmpresa);

            // Intentar firmar debe fallar
            await expect(
              digitalSigner.firmarXML(rucEmpresa, xml)
            ).rejects.toThrow(/certificado no es válido/i);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe validar correspondencia RUC-certificado incluso con certificado vigente', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC empresa 1
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC empresa 2
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          fc.integer({ min: 31, max: 365 }), // Días hasta vencimiento (certificado vigente)
          async (ruc1, ruc2, comprobanteId, diasHastaVencimiento) => {
            // Asegurar que los RUCs sean diferentes
            if (ruc1 === ruc2) {
              return;
            }

            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // Cargar certificado vigente para empresa 2
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc2);
            await certificateManager.cargarCertificado(ruc2, certificadoBuffer, 'password123');

            // Asegurar que el certificado esté vigente
            const certificado = await certificateManager.obtenerCertificado(ruc2);
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + diasHastaVencimiento);
            certificado.fechaVencimiento = fechaVencimiento;

            // Asignar certificado de empresa 2 a empresa 1
            (certificateManager as any).certificados.set(ruc1, certificado);

            // Verificar que el certificado está vigente
            const vigente = await digitalSigner.verificarVigencia(ruc1);
            expect(vigente).toBe(true);

            // Pero la firma debe fallar por RUC incorrecto
            await expect(
              digitalSigner.firmarXML(ruc1, xml)
            ).rejects.toThrow(/certificado no es válido/i);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar firma sin certificado cargado para cualquier empresa', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // ID de comprobante
          async (ruc, comprobanteId) => {
            // Crear XML de prueba
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${comprobanteId}</cbc:ID>
</Invoice>`;

            // NO cargar certificado

            // Intentar firmar sin certificado debe fallar
            await expect(
              digitalSigner.firmarXML(ruc, xml)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
