/**
 * Tests para el handler firmar-comprobante
 * Requisitos: 2.1, 2.4
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler, setDependencies } from '../../handlers/firmar-comprobante';
import { DynamoDBComprobanteRepository } from '../../repositories/ComprobanteRepository';
import { S3FileRepository } from '../../repositories/S3Repository';
import { CertificateManager } from '../../services/CertificateManager';
import { DigitalSigner } from '../../services/DigitalSigner';
import { Comprobante, TipoComprobante, EstadoComprobante, TipoMoneda } from '../../types';

describe('Handler: firmar-comprobante', () => {
  let mockComprobanteRepository: jest.Mocked<DynamoDBComprobanteRepository>;
  let mockS3Repository: jest.Mocked<S3FileRepository>;
  let mockCertificateManager: jest.Mocked<CertificateManager>;
  let mockDigitalSigner: jest.Mocked<DigitalSigner>;

  beforeEach(() => {
    // Crear mocks
    mockComprobanteRepository = {
      obtenerComprobante: jest.fn(),
      guardarComprobante: jest.fn(),
      guardarCDR: jest.fn(),
      obtenerCDR: jest.fn(),
      listarPendientes: jest.fn(),
      actualizarEstado: jest.fn(),
      listarComprobantes: jest.fn(),
      obtenerSiguienteNumero: jest.fn(),
    } as any;

    mockS3Repository = {
      guardarXML: jest.fn(),
      recuperarXML: jest.fn(),
      guardarPDF: jest.fn(),
      recuperarPDF: jest.fn(),
      guardarCertificado: jest.fn(),
      recuperarCertificado: jest.fn(),
      eliminarArchivo: jest.fn(),
      listarArchivos: jest.fn(),
    } as any;

    mockCertificateManager = {
      obtenerCertificado: jest.fn(),
      cargarCertificado: jest.fn(),
      verificarProximoVencimiento: jest.fn(),
      listarCertificados: jest.fn(),
      validarCertificado: jest.fn(),
    } as any;

    mockDigitalSigner = {
      firmarXML: jest.fn(),
      validarCertificado: jest.fn(),
      verificarVigencia: jest.fn(),
    } as any;

    // Inyectar dependencias
    setDependencies({
      comprobanteRepository: mockComprobanteRepository,
      s3Repository: mockS3Repository,
      certificateManager: mockCertificateManager,
      digitalSigner: mockDigitalSigner,
    });
  });

  const crearComprobanteBase = (): Comprobante => ({
    empresaRuc: '20123456789',
    numero: 'B001-00000001',
    tipo: TipoComprobante.BOLETA,
    fecha: new Date('2024-01-15'),
    emisor: {
      ruc: '20123456789',
      razonSocial: 'Empresa Test SAC',
      nombreComercial: 'Test',
      direccion: {
        direccion: 'Av. Test 123',
        departamento: 'Lima',
        provincia: 'Lima',
        distrito: 'Miraflores',
        ubigeo: '150101',
      },
    },
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
        total: 118,
      },
    ],
    subtotal: 100,
    igv: 18,
    total: 118,
    moneda: TipoMoneda.PEN,
    xmlOriginal: '<?xml version="1.0"?><Invoice>...</Invoice>',
    estado: EstadoComprobante.PENDIENTE,
  });

  describe('POST /firmar-comprobante', () => {
    it('debe firmar un comprobante exitosamente', async () => {
      const comprobante = crearComprobanteBase();
      const xmlFirmado = '<?xml version="1.0"?><Invoice><Signature>...</Signature></Invoice>';
      const rutaS3 = '20123456789/xmls/B001-00000001-firmado.xml';

      // Configurar mocks
      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);
      mockCertificateManager.obtenerCertificado = jest.fn().mockResolvedValue({
        ruc: '20123456789',
        archivo: Buffer.from('certificado'),
        password: 'encrypted:password',
        fechaEmision: new Date('2023-01-01'),
        fechaVencimiento: new Date('2025-12-31'),
        emisor: 'Test CA',
      });
      mockDigitalSigner.verificarVigencia = jest.fn().mockResolvedValue(true);
      mockDigitalSigner.firmarXML = jest.fn().mockResolvedValue(xmlFirmado);
      mockS3Repository.guardarXML = jest.fn().mockResolvedValue(rutaS3);
      mockComprobanteRepository.guardarComprobante = jest.fn().mockResolvedValue(undefined);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Comprobante firmado exitosamente');
      expect(body.numeroComprobante).toBe('B001-00000001');
      expect(body.rutaXMLFirmado).toBe(rutaS3);

      // Verificar que se llamaron los métodos correctos
      expect(mockComprobanteRepository.obtenerComprobante).toHaveBeenCalledWith(
        '20123456789',
        'B001-00000001'
      );
      expect(mockCertificateManager.obtenerCertificado).toHaveBeenCalledWith('20123456789');
      expect(mockDigitalSigner.verificarVigencia).toHaveBeenCalledWith('20123456789');
      expect(mockDigitalSigner.firmarXML).toHaveBeenCalledWith(
        '20123456789',
        comprobante.xmlOriginal
      );
      expect(mockS3Repository.guardarXML).toHaveBeenCalledWith(
        '20123456789',
        'B001-00000001-firmado',
        xmlFirmado
      );
      expect(mockComprobanteRepository.guardarComprobante).toHaveBeenCalled();
    });

    it('debe rechazar solicitud sin body', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('cuerpo de la solicitud es requerido');
    });

    it('debe rechazar solicitud con campos faltantes', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          // Falta numeroComprobante
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('requeridos');
    });

    it('debe rechazar RUC inválido', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '123', // RUC inválido
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('11 dígitos');
    });

    it('debe retornar 404 si el comprobante no existe', async () => {
      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(null);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-99999999',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('no encontrado');
    });

    it('debe rechazar comprobante sin XML original', async () => {
      const comprobante = crearComprobanteBase();
      comprobante.xmlOriginal = undefined;

      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('XML original');
    });

    it('debe rechazar comprobante ya firmado', async () => {
      const comprobante = crearComprobanteBase();
      comprobante.xmlFirmado = '<?xml version="1.0"?><Invoice><Signature>...</Signature></Invoice>';

      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('ya está firmado');
    });

    it('debe retornar 404 si no existe certificado para la empresa', async () => {
      const comprobante = crearComprobanteBase();

      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);
      mockCertificateManager.obtenerCertificado = jest
        .fn()
        .mockRejectedValue(new Error('No existe certificado'));

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('certificado');
    });

    it('debe rechazar si el certificado está vencido', async () => {
      const comprobante = crearComprobanteBase();

      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);
      mockCertificateManager.obtenerCertificado = jest.fn().mockResolvedValue({
        ruc: '20123456789',
        archivo: Buffer.from('certificado'),
        password: 'encrypted:password',
        fechaEmision: new Date('2020-01-01'),
        fechaVencimiento: new Date('2023-12-31'), // Vencido
        emisor: 'Test CA',
      });
      mockDigitalSigner.verificarVigencia = jest.fn().mockResolvedValue(false);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('vencido');
    });

    it('debe manejar errores al firmar el XML', async () => {
      const comprobante = crearComprobanteBase();

      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);
      mockCertificateManager.obtenerCertificado = jest.fn().mockResolvedValue({
        ruc: '20123456789',
        archivo: Buffer.from('certificado'),
        password: 'encrypted:password',
        fechaEmision: new Date('2023-01-01'),
        fechaVencimiento: new Date('2025-12-31'),
        emisor: 'Test CA',
      });
      mockDigitalSigner.verificarVigencia = jest.fn().mockResolvedValue(true);
      mockDigitalSigner.firmarXML = jest
        .fn()
        .mockRejectedValue(new Error('Error al firmar'));

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Error al firmar');
    });

    it('debe manejar errores al guardar en S3', async () => {
      const comprobante = crearComprobanteBase();
      const xmlFirmado = '<?xml version="1.0"?><Invoice><Signature>...</Signature></Invoice>';

      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);
      mockCertificateManager.obtenerCertificado = jest.fn().mockResolvedValue({
        ruc: '20123456789',
        archivo: Buffer.from('certificado'),
        password: 'encrypted:password',
        fechaEmision: new Date('2023-01-01'),
        fechaVencimiento: new Date('2025-12-31'),
        emisor: 'Test CA',
      });
      mockDigitalSigner.verificarVigencia = jest.fn().mockResolvedValue(true);
      mockDigitalSigner.firmarXML = jest.fn().mockResolvedValue(xmlFirmado);
      mockS3Repository.guardarXML = jest
        .fn()
        .mockRejectedValue(new Error('Error al guardar en S3'));

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('S3');
    });

    it('debe manejar errores al actualizar DynamoDB', async () => {
      const comprobante = crearComprobanteBase();
      const xmlFirmado = '<?xml version="1.0"?><Invoice><Signature>...</Signature></Invoice>';
      const rutaS3 = '20123456789/xmls/B001-00000001-firmado.xml';

      mockComprobanteRepository.obtenerComprobante = jest.fn().mockResolvedValue(comprobante);
      mockCertificateManager.obtenerCertificado = jest.fn().mockResolvedValue({
        ruc: '20123456789',
        archivo: Buffer.from('certificado'),
        password: 'encrypted:password',
        fechaEmision: new Date('2023-01-01'),
        fechaVencimiento: new Date('2025-12-31'),
        emisor: 'Test CA',
      });
      mockDigitalSigner.verificarVigencia = jest.fn().mockResolvedValue(true);
      mockDigitalSigner.firmarXML = jest.fn().mockResolvedValue(xmlFirmado);
      mockS3Repository.guardarXML = jest.fn().mockResolvedValue(rutaS3);
      mockComprobanteRepository.guardarComprobante = jest
        .fn()
        .mockRejectedValue(new Error('Error al actualizar DynamoDB'));

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          empresaRuc: '20123456789',
          numeroComprobante: 'B001-00000001',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('DynamoDB');
    });
  });
});
