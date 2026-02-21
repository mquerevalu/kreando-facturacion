/**
 * Pruebas unitarias para DigitalSigner
 * Requisitos: 2.1, 2.2, 2.3, 2.4
 */

import { DigitalSigner } from '../../services/DigitalSigner';
import { CertificateManager } from '../../services/CertificateManager';
import { Certificado } from '../../types/empresa';

describe('DigitalSigner', () => {
  let digitalSigner: DigitalSigner;
  let certificateManager: CertificateManager;

  beforeEach(() => {
    certificateManager = new CertificateManager();
    digitalSigner = new DigitalSigner(certificateManager);
  });

  describe('firmarXML', () => {
    it('debe firmar un XML válido con certificado vigente', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;
      
      // Cargar certificado de prueba
      const certificadoBuffer = Buffer.from('certificado-prueba');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Act
      const xmlFirmado = await digitalSigner.firmarXML(empresaRuc, xml);

      // Assert
      expect(xmlFirmado).toBeDefined();
      expect(xmlFirmado.length).toBeGreaterThan(xml.length);
      expect(xmlFirmado).toContain('Signature');
    });

    it('debe rechazar XML vacío', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const xml = '';

      // Act & Assert
      await expect(digitalSigner.firmarXML(empresaRuc, xml)).rejects.toThrow(
        'El documento XML está vacío'
      );
    });

    it('debe rechazar firma con certificado vencido', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;

      // Cargar certificado vencido
      const certificadoBuffer = Buffer.from('certificado-vencido');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Modificar fecha de vencimiento para que esté vencido
      const certificado = await certificateManager.obtenerCertificado(empresaRuc);
      const certificadoVencido: Certificado = {
        ...certificado,
        fechaVencimiento: new Date('2020-01-01'),
      };
      
      // Reemplazar certificado con uno vencido
      (certificateManager as any).certificados.set(empresaRuc, certificadoVencido);

      // Act & Assert
      await expect(digitalSigner.firmarXML(empresaRuc, xml)).rejects.toThrow(
        'El certificado está vencido o aún no es válido'
      );
    });

    it('debe rechazar firma con certificado de RUC diferente', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const otraEmpresaRuc = '20987654321';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;

      // Cargar certificado para otra empresa
      const certificadoBuffer = Buffer.from('certificado-otra-empresa');
      await certificateManager.cargarCertificado(otraEmpresaRuc, certificadoBuffer, 'password123');

      // Intentar firmar con certificado de otra empresa
      const certificado = await certificateManager.obtenerCertificado(otraEmpresaRuc);
      (certificateManager as any).certificados.set(empresaRuc, certificado);

      // Act & Assert
      await expect(digitalSigner.firmarXML(empresaRuc, xml)).rejects.toThrow(
        'El certificado no es válido'
      );
    });

    it('debe rechazar firma sin certificado cargado', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;

      // Act & Assert
      await expect(digitalSigner.firmarXML(empresaRuc, xml)).rejects.toThrow();
    });
  });

  describe('validarCertificado', () => {
    it('debe validar certificado vigente correctamente', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const certificadoBuffer = Buffer.from('certificado-prueba');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Act
      const resultado = await digitalSigner.validarCertificado(empresaRuc);

      // Assert
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe detectar certificado vencido', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const certificadoBuffer = Buffer.from('certificado-vencido');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Modificar fecha de vencimiento
      const certificado = await certificateManager.obtenerCertificado(empresaRuc);
      const certificadoVencido: Certificado = {
        ...certificado,
        fechaVencimiento: new Date('2020-01-01'),
      };
      (certificateManager as any).certificados.set(empresaRuc, certificadoVencido);

      // Act
      const resultado = await digitalSigner.validarCertificado(empresaRuc);

      // Assert
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain('vencido');
    });

    it('debe detectar certificado inexistente', async () => {
      // Arrange
      const empresaRuc = '20123456789';

      // Act
      const resultado = await digitalSigner.validarCertificado(empresaRuc);

      // Assert
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
    });
  });

  describe('verificarVigencia', () => {
    it('debe retornar true para certificado vigente', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const certificadoBuffer = Buffer.from('certificado-prueba');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Act
      const vigente = await digitalSigner.verificarVigencia(empresaRuc);

      // Assert
      expect(vigente).toBe(true);
    });

    it('debe retornar false para certificado vencido', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const certificadoBuffer = Buffer.from('certificado-vencido');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Modificar fecha de vencimiento
      const certificado = await certificateManager.obtenerCertificado(empresaRuc);
      const certificadoVencido: Certificado = {
        ...certificado,
        fechaVencimiento: new Date('2020-01-01'),
      };
      (certificateManager as any).certificados.set(empresaRuc, certificadoVencido);

      // Act
      const vigente = await digitalSigner.verificarVigencia(empresaRuc);

      // Assert
      expect(vigente).toBe(false);
    });

    it('debe retornar false para certificado aún no válido', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const certificadoBuffer = Buffer.from('certificado-futuro');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Modificar fecha de emisión al futuro
      const certificado = await certificateManager.obtenerCertificado(empresaRuc);
      const certificadoFuturo: Certificado = {
        ...certificado,
        fechaEmision: new Date('2030-01-01'),
      };
      (certificateManager as any).certificados.set(empresaRuc, certificadoFuturo);

      // Act
      const vigente = await digitalSigner.verificarVigencia(empresaRuc);

      // Assert
      expect(vigente).toBe(false);
    });

    it('debe retornar false para certificado inexistente', async () => {
      // Arrange
      const empresaRuc = '20123456789';

      // Act
      const vigente = await digitalSigner.verificarVigencia(empresaRuc);

      // Assert
      expect(vigente).toBe(false);
    });
  });

  describe('Requisito 2.1: Firma digital XMLDSig', () => {
    it('debe incluir firma digital en el XML según estándar XMLDSig', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;
      
      const certificadoBuffer = Buffer.from('certificado-prueba');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Act
      const xmlFirmado = await digitalSigner.firmarXML(empresaRuc, xml);

      // Assert - Verificar elementos de XMLDSig
      expect(xmlFirmado).toContain('Signature');
      expect(xmlFirmado).toContain('SignedInfo');
      expect(xmlFirmado).toContain('SignatureValue');
      expect(xmlFirmado).toContain('KeyInfo');
    });
  });

  describe('Requisito 2.2: Validación de vigencia', () => {
    it('debe validar que el certificado no esté vencido antes de firmar', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;

      const certificadoBuffer = Buffer.from('certificado-vencido');
      await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, 'password123');

      // Modificar para que esté vencido
      const certificado = await certificateManager.obtenerCertificado(empresaRuc);
      const certificadoVencido: Certificado = {
        ...certificado,
        fechaVencimiento: new Date('2020-01-01'),
      };
      (certificateManager as any).certificados.set(empresaRuc, certificadoVencido);

      // Act & Assert
      await expect(digitalSigner.firmarXML(empresaRuc, xml)).rejects.toThrow(
        'El certificado está vencido o aún no es válido'
      );
    });
  });

  describe('Requisito 2.3: Validación de correspondencia RUC-certificado', () => {
    it('debe validar que el certificado pertenezca al RUC del emisor', async () => {
      // Arrange
      const empresaRuc = '20123456789';
      const otraEmpresaRuc = '20987654321';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;

      // Cargar certificado para otra empresa
      const certificadoBuffer = Buffer.from('certificado-otra-empresa');
      await certificateManager.cargarCertificado(otraEmpresaRuc, certificadoBuffer, 'password123');

      // Intentar usar certificado de otra empresa
      const certificado = await certificateManager.obtenerCertificado(otraEmpresaRuc);
      (certificateManager as any).certificados.set(empresaRuc, certificado);

      // Act & Assert
      await expect(digitalSigner.firmarXML(empresaRuc, xml)).rejects.toThrow(
        'El certificado no es válido'
      );
    });
  });
});
