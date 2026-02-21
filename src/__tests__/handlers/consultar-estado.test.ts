/**
 * Pruebas unitarias para el handler consultar-estado
 * 
 * Valida la consulta de estado de comprobantes:
 * - Consulta por número de comprobante
 * - Retorno de estado válido (PENDIENTE, ENVIADO, ACEPTADO, RECHAZADO)
 * - Retorno de motivo de rechazo para comprobantes rechazados
 * - Descarga de CDR para comprobantes aceptados
 * 
 * Requisitos: 6.1, 6.2, 6.3, 6.4
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { EstadoComprobante, TipoComprobante, TipoMoneda } from '../../types';

// Crear mocks antes de importar el handler
const mockObtenerComprobante = jest.fn();

jest.mock('../../repositories/ComprobanteRepository', () => ({
  DynamoDBComprobanteRepository: jest.fn().mockImplementation(() => ({
    obtenerComprobante: mockObtenerComprobante,
  })),
}));

// Mock del módulo de presigned URLs
const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// Importar el handler después de configurar los mocks
import { handler } from '../../handlers/consultar-estado';

describe('Handler consultar-estado', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue('https://s3.amazonaws.com/signed-url/cdr.xml');
  });

  const createEvent = (empresaRuc: string, numero: string): APIGatewayProxyEvent => ({
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/comprobantes/${empresaRuc}/${numero}/estado`,
    pathParameters: {
      empresaRuc,
      numero,
    },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
  });

  const comprobantePendienteMock = {
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
    estado: EstadoComprobante.PENDIENTE,
    fechaCreacion: new Date('2024-01-15T08:00:00Z'),
  };

  const cdrAceptadoMock = {
    codigo: '0',
    mensaje: 'La Factura numero B001-00000001, ha sido aceptada',
    xml: '<CDR>...</CDR>',
    fechaRecepcion: new Date('2024-01-15T10:30:00Z'),
  };

  const cdrRechazadoMock = {
    codigo: '2324',
    mensaje: 'El RUC del emisor no está autorizado para emitir comprobantes electrónicos',
    xml: '<CDR>...</CDR>',
    fechaRecepcion: new Date('2024-01-15T10:30:00Z'),
  };

  describe('Consulta exitosa de estado', () => {
    it('debe retornar estado PENDIENTE para comprobante pendiente', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(comprobantePendienteMock);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.numero).toBe('B001-00000001');
      expect(body.data.estado).toBe(EstadoComprobante.PENDIENTE);
      expect(body.data.cdr).toBeUndefined();
      expect(body.data.motivoRechazo).toBeUndefined();
    });

    it('debe retornar estado ENVIADO para comprobante enviado', async () => {
      // Arrange
      const comprobanteEnviado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.ENVIADO,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteEnviado);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.estado).toBe(EstadoComprobante.ENVIADO);
      expect(body.data.cdr).toBeUndefined();
    });

    it('debe retornar estado ACEPTADO con CDR y URL de descarga', async () => {
      // Arrange
      const comprobanteAceptado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrAceptadoMock,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteAceptado);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.estado).toBe(EstadoComprobante.ACEPTADO);
      expect(body.data.cdr).toBeDefined();
      expect(body.data.cdr.codigo).toBe('0');
      expect(body.data.cdr.mensaje).toBe(cdrAceptadoMock.mensaje);
      expect(body.data.cdr.urlDescarga).toBeDefined();
      expect(body.data.cdr.urlDescarga).toContain('https://');
      expect(body.data.motivoRechazo).toBeUndefined();
    });

    it('debe retornar estado RECHAZADO con motivo de rechazo', async () => {
      // Arrange
      const comprobanteRechazado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.RECHAZADO,
        cdr: cdrRechazadoMock,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteRechazado);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.estado).toBe(EstadoComprobante.RECHAZADO);
      expect(body.data.motivoRechazo).toBeDefined();
      expect(body.data.motivoRechazo).toBe(cdrRechazadoMock.mensaje);
      expect(body.data.motivoRechazo).toContain('no está autorizado');
    });

    it('debe incluir fechas de envío y aceptación cuando estén disponibles', async () => {
      // Arrange
      const comprobanteAceptado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrAceptadoMock,
        fechaCreacion: new Date('2024-01-15T08:00:00Z'),
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteAceptado);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.fechaEnvio).toBeDefined();
      expect(body.data.fechaAceptacion).toBeDefined();
    });
  });

  describe('Validación de parámetros', () => {
    it('debe retornar error 400 si falta empresaRuc', async () => {
      // Arrange
      const event = createEvent('', 'B001-00000001');
      event.pathParameters = { numero: 'B001-00000001' };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('empresaRuc y numero son requeridos');
    });

    it('debe retornar error 400 si falta numero', async () => {
      // Arrange
      const event = createEvent('20123456789', '');
      event.pathParameters = { empresaRuc: '20123456789' };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('empresaRuc y numero son requeridos');
    });

    it('debe retornar error 400 si RUC no tiene 11 dígitos', async () => {
      // Arrange
      const event = createEvent('2012345678', 'B001-00000001'); // 10 dígitos

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe retornar error 400 si RUC contiene caracteres no numéricos', async () => {
      // Arrange
      const event = createEvent('2012345678A', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('RUC debe tener 11 dígitos numéricos');
    });
  });

  describe('Comprobante no encontrado', () => {
    it('debe retornar error 404 si el comprobante no existe', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(null);

      const event = createEvent('20123456789', 'B001-99999999');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Comprobante B001-99999999 no encontrado');
      expect(body.error).toContain('empresa 20123456789');
    });

    it('debe verificar aislamiento multi-tenant', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(null);

      const event = createEvent('20987654321', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      expect(mockObtenerComprobante).toHaveBeenCalledWith('20987654321', 'B001-00000001');
    });
  });

  describe('Generación de URL de descarga de CDR', () => {
    it('debe generar URL firmada para CDR de comprobante aceptado', async () => {
      // Arrange
      const comprobanteAceptado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrAceptadoMock,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteAceptado);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(mockGetSignedUrl).toHaveBeenCalled();
      const body = JSON.parse(result.body);
      expect(body.data.cdr.urlDescarga).toBe('https://s3.amazonaws.com/signed-url/cdr.xml');
    });

    it('debe manejar error al generar URL sin fallar la petición', async () => {
      // Arrange
      const comprobanteAceptado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrAceptadoMock,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteAceptado);
      mockGetSignedUrl.mockRejectedValue(new Error('S3 error'));

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.cdr).toBeDefined();
      // La URL no debe estar presente si hubo error
      expect(body.data.cdr.urlDescarga).toBeUndefined();
    });

    it('no debe intentar generar URL para comprobantes no aceptados', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(comprobantePendienteMock);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      await handler(event);

      // Assert
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('Manejo de errores', () => {
    it('debe retornar error 500 si hay error en el repositorio', async () => {
      // Arrange
      mockObtenerComprobante.mockRejectedValue(new Error('Database error'));

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Error interno');
      expect(body.message).toContain('Database error');
    });

    it('debe incluir headers CORS en todas las respuestas', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(comprobantePendienteMock);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });

    it('debe incluir headers CORS en respuestas de error', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(null);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('Casos de diferentes tipos de comprobantes', () => {
    it('debe consultar estado de una factura', async () => {
      // Arrange
      const facturaAceptada = {
        ...comprobantePendienteMock,
        numero: 'F001-00000001',
        tipo: TipoComprobante.FACTURA,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrAceptadoMock,
        receptor: {
          tipoDocumento: '6',
          numeroDocumento: '20987654321',
          nombre: 'Empresa Cliente SAC',
        },
      };
      mockObtenerComprobante.mockResolvedValue(facturaAceptada);

      const event = createEvent('20123456789', 'F001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.numero).toBe('F001-00000001');
      expect(body.data.estado).toBe(EstadoComprobante.ACEPTADO);
    });

    it('debe consultar estado de comprobante en moneda USD', async () => {
      // Arrange
      const comprobanteUSD = {
        ...comprobantePendienteMock,
        moneda: TipoMoneda.USD,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrAceptadoMock,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteUSD);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.estado).toBe(EstadoComprobante.ACEPTADO);
    });
  });

  describe('Requisitos específicos', () => {
    it('debe cumplir requisito 6.1: permitir consultar por número', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(comprobantePendienteMock);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      expect(mockObtenerComprobante).toHaveBeenCalledWith('20123456789', 'B001-00000001');
      expect(result.statusCode).toBe(200);
    });

    it('debe cumplir requisito 6.2: mostrar estado válido', async () => {
      // Arrange
      mockObtenerComprobante.mockResolvedValue(comprobantePendienteMock);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      const body = JSON.parse(result.body);
      const estadosValidos = [
        EstadoComprobante.PENDIENTE,
        EstadoComprobante.ENVIADO,
        EstadoComprobante.ACEPTADO,
        EstadoComprobante.RECHAZADO,
      ];
      expect(estadosValidos).toContain(body.data.estado);
    });

    it('debe cumplir requisito 6.3: mostrar motivo de rechazo', async () => {
      // Arrange
      const comprobanteRechazado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.RECHAZADO,
        cdr: cdrRechazadoMock,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteRechazado);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      const body = JSON.parse(result.body);
      expect(body.data.motivoRechazo).toBeDefined();
      expect(body.data.motivoRechazo).toBe(cdrRechazadoMock.mensaje);
    });

    it('debe cumplir requisito 6.4: permitir descarga de CDR', async () => {
      // Arrange
      const comprobanteAceptado = {
        ...comprobantePendienteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrAceptadoMock,
      };
      mockObtenerComprobante.mockResolvedValue(comprobanteAceptado);

      const event = createEvent('20123456789', 'B001-00000001');

      // Act
      const result = await handler(event);

      // Assert
      const body = JSON.parse(result.body);
      expect(body.data.cdr).toBeDefined();
      expect(body.data.cdr.urlDescarga).toBeDefined();
      expect(body.data.cdr.urlDescarga).toContain('https://');
    });
  });
});
