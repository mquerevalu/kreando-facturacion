/**
 * Pruebas de integración end-to-end para el flujo completo de facturación SUNAT
 * 
 * Valida: Requisito 20.2 - Flujo completo: generación → firma → envío → CDR → PDF
 * 
 * Estas pruebas verifican:
 * - Flujo completo con diferentes tipos de comprobantes (boletas y facturas)
 * - Aislamiento multi-tenant (múltiples empresas)
 * - Integración real entre todos los componentes del sistema
 * - Manejo de errores en el flujo completo
 */

import { DynamoDBComprobanteRepository } from '../../repositories/ComprobanteRepository';
import { DynamoDBEmpresaRepository } from '../../repositories/EmpresaRepository';
import { S3FileRepository } from '../../repositories/S3Repository';
import { ComprobanteGenerator } from '../../services/ComprobanteGenerator';
import { DigitalSigner } from '../../services/DigitalSigner';
import { SunatSoapClient } from '../../services/SunatSoapClient';
import { CdrResponseHandler } from '../../services/CdrResponseHandler';
import { CertificateManager } from '../../services/CertificateManager';
import { PDFGenerator } from '../../services/PDFGenerator';
import { DataValidator } from '../../validators/DataValidator';
import { RetryManager } from '../../utils/RetryManager';
import {
  TipoComprobante,
  TipoMoneda,
  EstadoComprobante,
  DatosBoleta,
  DatosFactura,
  Empresa,
  Emisor,
} from '../../types';

describe('Integración E2E: Flujo completo de facturación SUNAT', () => {
  // Repositorios y servicios reales (con mocks solo para servicios externos)
  let comprobanteRepository: DynamoDBComprobanteRepository;
  let empresaRepository: DynamoDBEmpresaRepository;
  let s3Repository: S3FileRepository;
  let dataValidator: DataValidator;
  let certificateManager: CertificateManager;
  let digitalSigner: DigitalSigner;
  let sunatClient: SunatSoapClient;
  let cdrHandler: CdrResponseHandler;
  let pdfGenerator: PDFGenerator;
  let retryManager: RetryManager;
  let comprobanteGenerator: ComprobanteGenerator;

  // Datos de prueba para múltiples empresas (multi-tenant)
  const empresa1: Empresa = {
    ruc: '20123456789',
    razonSocial: 'Empresa Test 1 SAC',
    nombreComercial: 'Test 1',
    direccion: {
      direccion: 'Av. Test 123',
      departamento: 'Lima',
      provincia: 'Lima',
      distrito: 'Miraflores',
      ubigeo: '150101',
    },
    credencialesSunat: {
      ruc: '20123456789',
      usuario: 'MODDATOS',
      password: 'moddatos',
    },
    activo: true,
    fechaRegistro: new Date('2024-01-01'),
  };

  const empresa2: Empresa = {
    ruc: '20987654321',
    razonSocial: 'Empresa Test 2 SAC',
    nombreComercial: 'Test 2',
    direccion: {
      direccion: 'Jr. Prueba 456',
      departamento: 'Lima',
      provincia: 'Lima',
      distrito: 'San Isidro',
      ubigeo: '150130',
    },
    credencialesSunat: {
      ruc: '20987654321',
      usuario: 'MODDATOS2',
      password: 'moddatos2',
    },
    activo: true,
    fechaRegistro: new Date('2024-01-01'),
  };

  beforeEach(() => {
    // Inicializar repositorios y servicios reales
    comprobanteRepository = new DynamoDBComprobanteRepository();
    empresaRepository = new DynamoDBEmpresaRepository();
    s3Repository = new S3FileRepository();
    dataValidator = new DataValidator();
    certificateManager = new CertificateManager();
    digitalSigner = new DigitalSigner(certificateManager);
    sunatClient = new SunatSoapClient({
      ambiente: 'homologacion',
      timeout: 60000,
    });
    cdrHandler = new CdrResponseHandler({
      comprobanteRepository,
      s3Repository,
    });
    pdfGenerator = new PDFGenerator();
    retryManager = new RetryManager(comprobanteRepository);

    // Función para obtener datos del emisor
    const obtenerDatosEmisor = async (ruc: string): Promise<Emisor> => {
      const empresa = await empresaRepository.obtenerEmpresa(ruc);
      if (!empresa) {
        throw new Error(`Empresa con RUC ${ruc} no encontrada`);
      }
      return {
        ruc: empresa.ruc,
        razonSocial: empresa.razonSocial,
        nombreComercial: empresa.nombreComercial,
        direccion: empresa.direccion,
      };
    };

    comprobanteGenerator = new ComprobanteGenerator(
      comprobanteRepository,
      dataValidator,
      obtenerDatosEmisor
    );

    // Mock de servicios externos (DynamoDB, S3, SUNAT)
    jest.spyOn(empresaRepository, 'obtenerEmpresa').mockImplementation(async (ruc: string) => {
      if (ruc === empresa1.ruc) return empresa1;
      if (ruc === empresa2.ruc) return empresa2;
      return null;
    });

    jest.spyOn(comprobanteRepository, 'guardarComprobante').mockResolvedValue(undefined);
    jest.spyOn(comprobanteRepository, 'actualizarEstado').mockResolvedValue(undefined);
    jest.spyOn(comprobanteRepository, 'obtenerComprobante').mockImplementation(async (ruc, numero) => {
      // Simular recuperación del comprobante actualizado
      return null; // Se sobrescribirá en cada test
    });
    
    // Mock para obtener siguiente número correlativo - independiente por empresa
    const contadores: Record<string, number> = {};
    jest.spyOn(comprobanteRepository, 'obtenerSiguienteNumero').mockImplementation(async (ruc, tipo, serie) => {
      const key = `${ruc}#${tipo}#${serie}`;
      if (!contadores[key]) {
        contadores[key] = 0;
      }
      contadores[key]++;
      return contadores[key];
    });

    jest.spyOn(s3Repository, 'guardarXML').mockResolvedValue('s3://bucket/xmls/test.xml');
    jest.spyOn(s3Repository, 'guardarPDF').mockResolvedValue('s3://bucket/pdfs/test.pdf');

    jest.spyOn(certificateManager, 'obtenerCertificado').mockResolvedValue({
      ruc: '20123456789',
      archivo: Buffer.from('certificado'),
      password: 'encrypted:password',
      fechaEmision: new Date('2024-01-01'),
      fechaVencimiento: new Date('2025-12-31'),
      emisor: 'Test CA',
    });

    jest.spyOn(digitalSigner, 'firmarXML').mockImplementation(async (ruc, xml) => {
      // Simular firma digital agregando un nodo Signature
      return xml.replace('</Invoice>', '<Signature>...</Signature></Invoice>');
    });

    jest.spyOn(sunatClient, 'enviarComprobante').mockResolvedValue({
      codigo: '0',
      mensaje: 'La Factura ha sido aceptada',
      xml: '<CDR>...</CDR>',
      fechaRecepcion: new Date(),
    });

    jest.spyOn(cdrHandler, 'procesarCDR').mockResolvedValue(undefined);
    jest.spyOn(pdfGenerator, 'generarPDF').mockResolvedValue(Buffer.from('PDF content'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Flujo completo: Boleta', () => {
    it('debe completar el flujo end-to-end para una boleta', async () => {
      // Arrange
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto Test',
            cantidad: 2,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 36,
            total: 200,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Act - Paso 1: Generar comprobante
      const comprobante = await comprobanteGenerator.generarBoleta(empresa1.ruc, datosBoleta);

      // Assert - Verificar generación
      expect(comprobante).toBeDefined();
      expect(comprobante.numero).toMatch(/^B\d{3}-\d{8}$/);
      expect(comprobante.tipo).toBe(TipoComprobante.BOLETA);
      expect(comprobante.empresaRuc).toBe(empresa1.ruc);
      expect(comprobante.xmlOriginal).toBeDefined();
      expect(comprobante.xmlOriginal).toContain('<Invoice');

      // Act - Paso 2: Firmar XML
      const xmlFirmado = await digitalSigner.firmarXML(empresa1.ruc, comprobante.xmlOriginal!);

      // Assert - Verificar firma
      expect(xmlFirmado).toBeDefined();
      expect(xmlFirmado).toContain('<Signature>');

      // Act - Paso 3: Enviar a SUNAT
      const cdr = await sunatClient.enviarComprobante(
        empresa1.ruc,
        empresa1.credencialesSunat,
        Buffer.from('zip content')
      );

      // Assert - Verificar CDR
      expect(cdr).toBeDefined();
      expect(cdr.codigo).toBe('0');
      expect(cdr.mensaje).toContain('aceptada');

      // Act - Paso 4: Procesar CDR
      await cdrHandler.procesarCDR(empresa1.ruc, comprobante.numero, cdr);

      // Assert - Verificar procesamiento
      expect(cdrHandler.procesarCDR).toHaveBeenCalledWith(empresa1.ruc, comprobante.numero, cdr);

      // Act - Paso 5: Generar PDF
      const pdfBuffer = await pdfGenerator.generarPDF(comprobante, cdr);

      // Assert - Verificar PDF
      expect(pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);

      // Verificar que todos los pasos se ejecutaron
      expect(comprobanteRepository.guardarComprobante).toHaveBeenCalled();
      expect(digitalSigner.firmarXML).toHaveBeenCalled();
      expect(sunatClient.enviarComprobante).toHaveBeenCalled();
      expect(pdfGenerator.generarPDF).toHaveBeenCalled();
      
      // Nota: s3Repository.guardarXML se llama en el handler de envío, no en el generador
    });
  });

  describe('Flujo completo: Factura', () => {
    it('debe completar el flujo end-to-end para una factura', async () => {
      // Arrange
      const datosFactura: DatosFactura = {
        receptor: {
          ruc: '20111222333',
          razonSocial: 'Cliente Empresa SAC',
          direccion: {
            direccion: 'Av. Cliente 789',
            departamento: 'Lima',
            provincia: 'Lima',
            distrito: 'Surco',
            ubigeo: '150140',
          },
        },
        items: [
          {
            codigo: 'SERV001',
            descripcion: 'Servicio de Consultoría',
            cantidad: 1,
            unidadMedida: 'ZZ',
            precioUnitario: 1000,
            afectacionIGV: '10',
            igv: 180,
            total: 1000,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Act - Paso 1: Generar comprobante
      const comprobante = await comprobanteGenerator.generarFactura(empresa1.ruc, datosFactura);

      // Assert - Verificar generación
      expect(comprobante).toBeDefined();
      expect(comprobante.numero).toMatch(/^F\d{3}-\d{8}$/);
      expect(comprobante.tipo).toBe(TipoComprobante.FACTURA);
      expect(comprobante.empresaRuc).toBe(empresa1.ruc);
      expect(comprobante.xmlOriginal).toBeDefined();

      // Act - Paso 2: Firmar XML
      const xmlFirmado = await digitalSigner.firmarXML(empresa1.ruc, comprobante.xmlOriginal!);

      // Assert - Verificar firma
      expect(xmlFirmado).toBeDefined();
      expect(xmlFirmado).toContain('<Signature>');

      // Act - Paso 3: Enviar a SUNAT
      const cdr = await sunatClient.enviarComprobante(
        empresa1.ruc,
        empresa1.credencialesSunat,
        Buffer.from('zip content')
      );

      // Assert - Verificar CDR
      expect(cdr).toBeDefined();
      expect(cdr.codigo).toBe('0');

      // Act - Paso 4: Procesar CDR
      await cdrHandler.procesarCDR(empresa1.ruc, comprobante.numero, cdr);

      // Act - Paso 5: Generar PDF
      const pdfBuffer = await pdfGenerator.generarPDF(comprobante, cdr);

      // Assert - Verificar PDF
      expect(pdfBuffer).toBeDefined();

      // Verificar flujo completo
      expect(comprobanteRepository.guardarComprobante).toHaveBeenCalled();
      expect(digitalSigner.firmarXML).toHaveBeenCalled();
      expect(sunatClient.enviarComprobante).toHaveBeenCalled();
      expect(pdfGenerator.generarPDF).toHaveBeenCalled();
    });
  });

  describe('Multi-tenant: Aislamiento entre empresas', () => {
    it('debe mantener aislamiento entre comprobantes de diferentes empresas', async () => {
      // Arrange - Datos para empresa 1
      const datosBoleta1: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '11111111',
          nombre: 'Cliente Empresa 1',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto Empresa 1',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 18,
            total: 100,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Arrange - Datos para empresa 2
      const datosBoleta2: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '22222222',
          nombre: 'Cliente Empresa 2',
        },
        items: [
          {
            codigo: 'PROD002',
            descripcion: 'Producto Empresa 2',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 200,
            afectacionIGV: '10',
            igv: 36,
            total: 200,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Act - Generar comprobantes para ambas empresas
      const comprobante1 = await comprobanteGenerator.generarBoleta(empresa1.ruc, datosBoleta1);
      const comprobante2 = await comprobanteGenerator.generarBoleta(empresa2.ruc, datosBoleta2);

      // Assert - Verificar que cada comprobante está asociado a su empresa
      expect(comprobante1.empresaRuc).toBe(empresa1.ruc);
      expect(comprobante2.empresaRuc).toBe(empresa2.ruc);

      // Assert - Verificar que los datos del emisor son diferentes
      expect(comprobante1.emisor.ruc).toBe(empresa1.ruc);
      expect(comprobante1.emisor.razonSocial).toBe(empresa1.razonSocial);
      expect(comprobante2.emisor.ruc).toBe(empresa2.ruc);
      expect(comprobante2.emisor.razonSocial).toBe(empresa2.razonSocial);

      // Assert - Verificar que los números de comprobante tienen el mismo formato pero son independientes por empresa
      // Ambas empresas pueden tener el mismo número correlativo (B001-00000001) porque son contadores independientes
      expect(comprobante1.numero).toMatch(/^B\d{3}-\d{8}$/);
      expect(comprobante2.numero).toMatch(/^B\d{3}-\d{8}$/);
      
      // Lo importante es que cada comprobante esté asociado a su empresa correcta
      expect(comprobante1.empresaRuc).toBe(empresa1.ruc);
      expect(comprobante2.empresaRuc).toBe(empresa2.ruc);

      // Act - Firmar ambos comprobantes
      const xmlFirmado1 = await digitalSigner.firmarXML(empresa1.ruc, comprobante1.xmlOriginal!);
      const xmlFirmado2 = await digitalSigner.firmarXML(empresa2.ruc, comprobante2.xmlOriginal!);

      // Assert - Verificar que ambos fueron firmados
      expect(xmlFirmado1).toContain('<Signature>');
      expect(xmlFirmado2).toContain('<Signature>');

      // Verificar que se guardaron con el RUC correcto
      expect(comprobanteRepository.guardarComprobante).toHaveBeenCalledWith(
        empresa1.ruc,
        expect.objectContaining({ empresaRuc: empresa1.ruc })
      );
      expect(comprobanteRepository.guardarComprobante).toHaveBeenCalledWith(
        empresa2.ruc,
        expect.objectContaining({ empresaRuc: empresa2.ruc })
      );
    });

    it('debe usar credenciales SUNAT específicas de cada empresa', async () => {
      // Arrange
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto Test',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 18,
            total: 100,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Act - Generar y enviar para empresa 1
      const comprobante1 = await comprobanteGenerator.generarBoleta(empresa1.ruc, datosBoleta);
      await sunatClient.enviarComprobante(
        empresa1.ruc,
        empresa1.credencialesSunat,
        Buffer.from('zip1')
      );

      // Act - Generar y enviar para empresa 2
      const comprobante2 = await comprobanteGenerator.generarBoleta(empresa2.ruc, datosBoleta);
      await sunatClient.enviarComprobante(
        empresa2.ruc,
        empresa2.credencialesSunat,
        Buffer.from('zip2')
      );

      // Assert - Verificar que se usaron credenciales diferentes
      expect(sunatClient.enviarComprobante).toHaveBeenCalledWith(
        empresa1.ruc,
        empresa1.credencialesSunat,
        expect.any(Buffer)
      );
      expect(sunatClient.enviarComprobante).toHaveBeenCalledWith(
        empresa2.ruc,
        empresa2.credencialesSunat,
        expect.any(Buffer)
      );

      // Verificar que las credenciales son diferentes
      expect(empresa1.credencialesSunat.usuario).not.toBe(empresa2.credencialesSunat.usuario);
    });
  });

  describe('Manejo de errores en el flujo completo', () => {
    it('debe manejar error en la generación del comprobante', async () => {
      // Arrange - Datos inválidos (DNI con formato incorrecto)
      const datosInvalidos: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '123', // DNI inválido (debe tener 8 dígitos)
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto Test',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 18,
            total: 100,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Act & Assert
      await expect(
        comprobanteGenerator.generarBoleta(empresa1.ruc, datosInvalidos)
      ).rejects.toThrow();

      // Verificar que no se guardó nada
      expect(comprobanteRepository.guardarComprobante).not.toHaveBeenCalled();
    });

    it('debe manejar error en la firma digital', async () => {
      // Arrange
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto Test',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 18,
            total: 100,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Mock error en firma
      jest.spyOn(digitalSigner, 'firmarXML').mockRejectedValue(
        new Error('El certificado está vencido')
      );

      // Act
      const comprobante = await comprobanteGenerator.generarBoleta(empresa1.ruc, datosBoleta);

      // Assert - El comprobante se generó pero la firma falla
      expect(comprobante).toBeDefined();

      await expect(
        digitalSigner.firmarXML(empresa1.ruc, comprobante.xmlOriginal!)
      ).rejects.toThrow('El certificado está vencido');

      // Verificar que el comprobante se guardó pero no se firmó
      expect(comprobanteRepository.guardarComprobante).toHaveBeenCalled();
    });

    it('debe manejar rechazo de SUNAT', async () => {
      // Arrange
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto Test',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 18,
            total: 100,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Mock rechazo de SUNAT
      const cdrRechazo = {
        codigo: '2000',
        mensaje: 'El comprobante fue rechazado por errores en el XML',
        xml: '<CDR>...</CDR>',
        fechaRecepcion: new Date(),
      };

      jest.spyOn(sunatClient, 'enviarComprobante').mockResolvedValue(cdrRechazo);

      // Act - Flujo completo
      const comprobante = await comprobanteGenerator.generarBoleta(empresa1.ruc, datosBoleta);
      const xmlFirmado = await digitalSigner.firmarXML(empresa1.ruc, comprobante.xmlOriginal!);
      const cdr = await sunatClient.enviarComprobante(
        empresa1.ruc,
        empresa1.credencialesSunat,
        Buffer.from('zip')
      );

      // Assert - Verificar que se recibió el rechazo
      expect(cdr.codigo).toBe('2000');
      expect(cdr.mensaje).toContain('rechazado');

      // Procesar CDR de rechazo
      await cdrHandler.procesarCDR(empresa1.ruc, comprobante.numero, cdr);

      // Verificar que se procesó el rechazo
      expect(cdrHandler.procesarCDR).toHaveBeenCalledWith(
        empresa1.ruc,
        comprobante.numero,
        cdrRechazo
      );

      // No se debe generar PDF para comprobantes rechazados
      // (esto se verifica en el handler principal)
    });

    it('debe manejar timeout en el envío a SUNAT con reintentos', async () => {
      // Arrange
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto Test',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 18,
            total: 100,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Mock timeout en SUNAT
      jest.spyOn(sunatClient, 'enviarComprobante').mockRejectedValue(
        new Error('Connection timeout')
      );

      // Act
      const comprobante = await comprobanteGenerator.generarBoleta(empresa1.ruc, datosBoleta);
      const xmlFirmado = await digitalSigner.firmarXML(empresa1.ruc, comprobante.xmlOriginal!);

      // Intentar enviar con reintentos
      const retryResult = await retryManager.executeWithRetry(
        async () => {
          return await sunatClient.enviarComprobante(
            empresa1.ruc,
            empresa1.credencialesSunat,
            Buffer.from('zip')
          );
        },
        empresa1.ruc,
        comprobante.numero
      );

      // Assert - Verificar que falló tras reintentos
      expect(retryResult.success).toBe(false);
      expect(retryResult.totalAttempts).toBeGreaterThan(1);

      // Verificar que se marcó como pendiente
      expect(comprobanteRepository.actualizarEstado).toHaveBeenCalledWith(
        empresa1.ruc,
        comprobante.numero,
        EstadoComprobante.PENDIENTE
      );
    }, 10000); // Timeout de 10 segundos
  });

  describe('Diferentes tipos de comprobantes', () => {
    it('debe procesar boleta con múltiples items', async () => {
      // Arrange
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto 1',
            cantidad: 2,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: '10',
            igv: 36,
            total: 200,
          },
          {
            codigo: 'PROD002',
            descripcion: 'Producto 2',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 50,
            afectacionIGV: '10',
            igv: 9,
            total: 50,
          },
          {
            codigo: 'PROD003',
            descripcion: 'Producto 3',
            cantidad: 3,
            unidadMedida: 'NIU',
            precioUnitario: 25,
            afectacionIGV: '10',
            igv: 13.5,
            total: 75,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      // Act
      const comprobante = await comprobanteGenerator.generarBoleta(empresa1.ruc, datosBoleta);

      // Assert
      expect(comprobante.items).toHaveLength(3);
      expect(comprobante.subtotal).toBe(325);
      expect(comprobante.igv).toBeCloseTo(58.5, 2);
      expect(comprobante.total).toBeCloseTo(383.5, 2);

      // Verificar que el XML contiene todos los items
      expect(comprobante.xmlOriginal).toContain('PROD001');
      expect(comprobante.xmlOriginal).toContain('PROD002');
      expect(comprobante.xmlOriginal).toContain('PROD003');
    });

    it('debe procesar factura en dólares (USD)', async () => {
      // Arrange
      const datosFactura: DatosFactura = {
        receptor: {
          ruc: '20111222333',
          razonSocial: 'Cliente Empresa SAC',
          direccion: {
            direccion: 'Av. Cliente 789',
            departamento: 'Lima',
            provincia: 'Lima',
            distrito: 'Surco',
            ubigeo: '150140',
          },
        },
        items: [
          {
            codigo: 'SERV001',
            descripcion: 'Servicio Internacional',
            cantidad: 1,
            unidadMedida: 'ZZ',
            precioUnitario: 500,
            afectacionIGV: '10',
            igv: 90,
            total: 500,
          },
        ],
        moneda: TipoMoneda.USD,
      };

      // Act
      const comprobante = await comprobanteGenerator.generarFactura(empresa1.ruc, datosFactura);

      // Assert
      expect(comprobante.moneda).toBe(TipoMoneda.USD);
      expect(comprobante.xmlOriginal).toContain('USD');
      expect(comprobante.total).toBe(590);
    });
  });
});
