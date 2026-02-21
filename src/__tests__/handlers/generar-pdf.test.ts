/**
 * Pruebas unitarias para el handler generar-pdf
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { Comprobante, EstadoComprobante, TipoComprobante, TipoMoneda } from '../../types';

// Mock de los repositorios y servicios ANTES de importar el handler
const mockObtenerComprobante = jest.fn();
const mockGuardarPDF = jest.fn();
const mockGenerarPDF = jest.fn();

jest.mock('../../repositories/ComprobanteRepository', () => ({
  DynamoDBComprobanteRepository: jest.fn().mockImplementation(() => ({
    obtenerComprobante: mockObtenerComprobante,
  })),
}));

jest.mock('../../repositories/S3Repository', () => ({
  S3FileRepository: jest.fn().mockImplementation(() => ({
    guardarPDF: mockGuardarPDF,
  })),
}));

jest.mock('../../services/PDFGenerator', () => ({
  PDFGenerator: jest.fn().mockImplementation(() => ({
    generarPDF: mockGenerarPDF,
  })),
}));

// Ahora importar el handler
import { handler } from '../../handlers/generar-pdf';

describe('generar-pdf handler', () => {
  const mockComprobante: Comprobante = {
    empresaRuc: '20123456789',
    numero: 'B001-00000001',
    tipo: TipoComprobante.BOLETA,
    fecha: new Date('2024-01-15'),
    emisor: {
      ruc: '20123456789',
      razonSocial: 'Empresa Test SAC',
      nombreComercial: 'Test',
      direccion: {
        departamento: 'Lima',
        provincia: 'Lima',
        distrito: 'Miraflores',
        direccion: 'Av. Test 123',
        codigoPais: 'PE',
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
    estado: EstadoComprobante.ACEPTADO,
    cdr: {
      codigo: '0',
      mensaje: 'Aceptado',
      xml: '<cdr>...</cdr>',
      fechaRecepcion: new Date('2024-01-15'),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('debe generar PDF exitosamente para un comprobante aceptado', async () => {
    // Configurar mocks
    mockObtenerComprobante.mockResolvedValue(mockComprobante);
    mockGenerarPDF.mockResolvedValue(Buffer.from('PDF content'));
    mockGuardarPDF.mockResolvedValue('20123456789/pdfs/B001-00000001.pdf');

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        empresaRuc: '20123456789',
        numero: 'B001-00000001',
      }),
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.mensaje).toBe('PDF generado exitosamente');
    expect(body.url).toContain('B001-00000001.pdf');
    expect(body.numero).toBe('B001-00000001');
    expect(body.empresaRuc).toBe('20123456789');
  });

  it('debe retornar error 400 si falta el body', async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Body requerido');
  });

  it('debe retornar error 400 si faltan parámetros requeridos', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        empresaRuc: '20123456789',
        // falta numero
      }),
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('empresaRuc y numero son requeridos');
  });

  it('debe retornar error 404 si el comprobante no existe', async () => {
    mockObtenerComprobante.mockResolvedValue(null);

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        empresaRuc: '20123456789',
        numero: 'B001-00000001',
      }),
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('no encontrado');
  });

  it('debe retornar error 400 si el comprobante no está aceptado', async () => {
    const comprobantePendiente = {
      ...mockComprobante,
      estado: EstadoComprobante.PENDIENTE,
    };

    mockObtenerComprobante.mockResolvedValue(comprobantePendiente);

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        empresaRuc: '20123456789',
        numero: 'B001-00000001',
      }),
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('debe estar en estado ACEPTADO');
  });

  it('debe manejar errores internos correctamente', async () => {
    mockObtenerComprobante.mockRejectedValue(new Error('Database error'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        empresaRuc: '20123456789',
        numero: 'B001-00000001',
      }),
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Error al generar PDF');
    expect(body.detalle).toBe('Database error');
  });
});
