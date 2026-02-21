/**
 * Pruebas unitarias para el handler enviar-sunat
 * 
 * Valida el flujo completo de envío de comprobantes a SUNAT:
 * - Recuperación de comprobante y XML firmado
 * - Compresión en ZIP
 * - Envío a SUNAT con credenciales
 * - Procesamiento de CDR
 * - Actualización de estado
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { EstadoComprobante, TipoComprobante, TipoMoneda } from '../../types';

// Crear mocks antes de importar el handler
const mockObtenerEmpresa = jest.fn();
const mockObtenerComprobante = jest.fn();
const mockActualizarEstado = jest.fn();
const mockRecuperarXML = jest.fn();
const mockEnviarComprobante = jest.fn();
const mockProcesarCDR = jest.fn();

jest.mock('../../repositories/EmpresaRepository', () => ({
  DynamoDBEmpresaRepository: jest.fn().mockImplementation(() => ({
    obtenerEmpresa: mockObtenerEmpresa,
  })),
}));

jest.mock('../../repositories/ComprobanteRepository', () => ({
  DynamoDBComprobanteRepository: jest.fn().mockImplementation(() => ({
    obtenerComprobante: mockObtenerComprobante,
    actualizarEstado: mockActualizarEstado,
  })),
}));

jest.mock('../../repositories/S3Repository', () => ({
  S3FileRepository: jest.fn().mockImplementation(() => ({
    recuperarXML: mockRecuperarXML,
  })),
}));

jest.mock('../../services/SunatSoapClient', () => ({
  SunatSoapClient: jest.fn().mockImplementation(() => ({
    enviarComprobante: mockEnviarComprobante,
  })),
}));

jest.mock('../../services/CdrResponseHandler', () => ({
  CdrResponseHandler: jest.fn().mockImplementation(() => ({
    procesarCDR: mockProcesarCDR,
  })),
}));

// Importar el handler después de configurar los mocks
import { handler } from '../../handlers/enviar-sunat';

describe('Handler enviar-sunat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/enviar-sunat',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
  });

  const empresaMock = {
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
    credencialesSunat: {
      ruc: '20123456789',
      usuario: 'MODDATOS',
      password: 'moddatos',
    },
    activo: true,
    fechaRegistro: new Date('2024-01-01'),
  };

  const comprobanteMock = {
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
  };

  const xmlFirmadoMock = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>B001-00000001</cbc:ID>
  <Signature>...</Signature>
</Invoice>`;

  const cdrMock = {
    codigo: '0',
    mensaje: 'La Factura numero B001-00000001, ha sido aceptada',
    xml: '<CDR>...</CDR>',
    fechaRecepcion: new Date('2024-01-15T10:30:00Z'),
  };

  describe('Flujo exitoso', () => {
    it('debe enviar un comprobante exitosamente a SUNAT', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante
        .mockResolvedValueOnce(comprobanteMock)
        .mockResolvedValueOnce({
          ...comprobanteMock,
          estado: EstadoComprobante.ACEPTADO,
          cdr: cdrMock,
        });
      mockRecuperarXML.mockResolvedValue(xmlFirmadoMock);
      mockEnviarComprobante.mockResolvedValue(cdrMock);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockProcesarCDR.mockResolvedValue(undefined);

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.numeroComprobante).toBe('B001-00000001');
      expect(body.data.estado).toBe(EstadoComprobante.ACEPTADO);
      expect(body.data.cdr.codigo).toBe('0');

      // Verificar que se llamaron los métodos en el orden correcto
      expect(mockObtenerEmpresa).toHaveBeenCalledWith('20123456789');
      expect(mockObtenerComprobante).toHaveBeenCalledWith('20123456789', 'B001-00000001');
      expect(mockRecuperarXML).toHaveBeenCalledWith('20123456789', 'firmado-B001-00000001');
      expect(mockActualizarEstado).toHaveBeenCalledWith(
        '20123456789',
        'B001-00000001',
        EstadoComprobante.ENVIADO
      );
      expect(mockEnviarComprobante).toHaveBeenCalledWith(
        '20123456789',
        empresaMock.credencialesSunat,
        expect.any(Buffer)
      );
      expect(mockProcesarCDR).toHaveBeenCalledWith('20123456789', 'B001-00000001', cdrMock);
    });

    it('debe comprimir el XML correctamente antes de enviar', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(comprobanteMock);
      mockRecuperarXML.mockResolvedValue(xmlFirmadoMock);
      mockEnviarComprobante.mockResolvedValue(cdrMock);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockProcesarCDR.mockResolvedValue(undefined);

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      await handler(event);

      // Assert
      const zipBuffer = mockEnviarComprobante.mock.calls[0][2];
      expect(zipBuffer).toBeInstanceOf(Buffer);
      expect(zipBuffer.length).toBeGreaterThan(0);
      // Verificar que es un archivo ZIP válido (comienza con PK)
      expect(zipBuffer[0]).toBe(0x50); // 'P'
      expect(zipBuffer[1]).toBe(0x4b); // 'K'
    });
  });

  describe('Validación de entrada', () => {
    it('debe retornar error 400 si no hay body', async () => {
      // Arrange
      const event = createEvent(null);
      event.body = null;

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('body de la petición es requerido');
    });

    it('debe retornar error 400 si falta empresaRuc', async () => {
      // Arrange
      const event = createEvent({
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('empresaRuc y numeroComprobante son requeridos');
    });

    it('debe retornar error 400 si falta numeroComprobante', async () => {
      // Arrange
      const event = createEvent({
        empresaRuc: '20123456789',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('empresaRuc y numeroComprobante son requeridos');
    });
  });

  describe('Validación de empresa', () => {
    it('debe retornar error 404 si la empresa no existe', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(null);

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Empresa con RUC 20123456789 no encontrada');
    });

    it('debe retornar error 400 si la empresa está inactiva', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue({
        ...empresaMock,
        activo: false,
      });

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('está inactiva');
    });
  });

  describe('Validación de comprobante', () => {
    it('debe retornar error 404 si el comprobante no existe', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(null);

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Comprobante B001-00000001 no encontrado');
    });

    it('debe retornar error 400 si el comprobante ya fue aceptado', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue({
        ...comprobanteMock,
        estado: EstadoComprobante.ACEPTADO,
      });

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('ya fue aceptado por SUNAT');
    });

    it('debe retornar error 404 si no existe el XML firmado', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(comprobanteMock);
      mockRecuperarXML.mockResolvedValue(null);

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('XML firmado no encontrado');
      expect(body.message).toContain('Debe firmar el comprobante antes de enviarlo');
    });
  });

  describe('Manejo de errores de SUNAT', () => {
    it('debe retornar error 502 si SUNAT devuelve un error SOAP', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(comprobanteMock);
      mockRecuperarXML.mockResolvedValue(xmlFirmadoMock);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockEnviarComprobante.mockRejectedValue(
        new Error('Error SOAP de SUNAT: El RUC no está autorizado')
      );

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Error SOAP de SUNAT');
    });

    it('debe retornar error 504 si hay timeout en la comunicación con SUNAT', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(comprobanteMock);
      mockRecuperarXML.mockResolvedValue(xmlFirmadoMock);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockEnviarComprobante.mockRejectedValue(new Error('Connection timeout'));

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(504);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('timeout');
    });

    it('debe retornar error 500 para errores internos no específicos', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(comprobanteMock);
      mockRecuperarXML.mockResolvedValue(xmlFirmadoMock);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockEnviarComprobante.mockRejectedValue(new Error('Error inesperado'));

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
    });
  });

  describe('Integración con servicios', () => {
    it('debe actualizar el estado a ENVIADO antes de enviar a SUNAT', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(comprobanteMock);
      mockRecuperarXML.mockResolvedValue(xmlFirmadoMock);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockEnviarComprobante.mockResolvedValue(cdrMock);
      mockProcesarCDR.mockResolvedValue(undefined);

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      await handler(event);

      // Assert
      // Verificar que actualizarEstado se llamó antes de enviarComprobante
      const actualizarEstadoCallOrder = mockActualizarEstado.mock.invocationCallOrder[0];
      const enviarComprobanteCallOrder = mockEnviarComprobante.mock.invocationCallOrder[0];
      expect(actualizarEstadoCallOrder).toBeLessThan(enviarComprobanteCallOrder);
    });

    it('debe procesar el CDR después de recibir respuesta de SUNAT', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerComprobante.mockResolvedValue(comprobanteMock);
      mockRecuperarXML.mockResolvedValue(xmlFirmadoMock);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockEnviarComprobante.mockResolvedValue(cdrMock);
      mockProcesarCDR.mockResolvedValue(undefined);

      const event = createEvent({
        empresaRuc: '20123456789',
        numeroComprobante: 'B001-00000001',
      });

      // Act
      await handler(event);

      // Assert
      expect(mockProcesarCDR).toHaveBeenCalledWith('20123456789', 'B001-00000001', cdrMock);
      
      // Verificar que procesarCDR se llamó después de enviarComprobante
      const enviarComprobanteCallOrder = mockEnviarComprobante.mock.invocationCallOrder[0];
      const procesarCDRCallOrder = mockProcesarCDR.mock.invocationCallOrder[0];
      expect(procesarCDRCallOrder).toBeGreaterThan(enviarComprobanteCallOrder);
    });
  });
});
