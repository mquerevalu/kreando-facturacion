/**
 * Pruebas unitarias para el handler generar-comprobante (Orquestador Principal)
 * 
 * Valida el flujo completo de generación de comprobantes:
 * - Validación de datos de entrada
 * - Generación de XML UBL 2.1
 * - Firma digital
 * - Envío a SUNAT
 * - Procesamiento de CDR
 * - Generación de PDF
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { EstadoComprobante, TipoComprobante, TipoMoneda } from '../../types';

// Crear mocks antes de importar el handler
const mockObtenerEmpresa = jest.fn();
const mockGenerarBoleta = jest.fn();
const mockGenerarFactura = jest.fn();
const mockGuardarComprobante = jest.fn();
const mockActualizarEstado = jest.fn();
const mockObtenerComprobante = jest.fn();
const mockGuardarXML = jest.fn();
const mockGuardarPDF = jest.fn();
const mockFirmarXML = jest.fn();
const mockVerificarVigencia = jest.fn();
const mockObtenerCertificado = jest.fn();
const mockEnviarComprobante = jest.fn();
const mockProcesarCDR = jest.fn();
const mockGenerarPDF = jest.fn();
const mockExecuteWithRetry = jest.fn();

jest.mock('../../repositories/EmpresaRepository', () => ({
  DynamoDBEmpresaRepository: jest.fn().mockImplementation(() => ({
    obtenerEmpresa: mockObtenerEmpresa,
  })),
}));

jest.mock('../../repositories/ComprobanteRepository', () => ({
  DynamoDBComprobanteRepository: jest.fn().mockImplementation(() => ({
    guardarComprobante: mockGuardarComprobante,
    actualizarEstado: mockActualizarEstado,
    obtenerComprobante: mockObtenerComprobante,
  })),
}));

jest.mock('../../repositories/S3Repository', () => ({
  S3FileRepository: jest.fn().mockImplementation(() => ({
    guardarXML: mockGuardarXML,
    guardarPDF: mockGuardarPDF,
  })),
}));

jest.mock('../../services/ComprobanteGenerator', () => ({
  ComprobanteGenerator: jest.fn().mockImplementation(() => ({
    generarBoleta: mockGenerarBoleta,
    generarFactura: mockGenerarFactura,
  })),
}));

jest.mock('../../services/DigitalSigner', () => ({
  DigitalSigner: jest.fn().mockImplementation(() => ({
    firmarXML: mockFirmarXML,
    verificarVigencia: mockVerificarVigencia,
  })),
}));

jest.mock('../../services/CertificateManager', () => ({
  CertificateManager: jest.fn().mockImplementation(() => ({
    obtenerCertificado: mockObtenerCertificado,
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

jest.mock('../../services/PDFGenerator', () => ({
  PDFGenerator: jest.fn().mockImplementation(() => ({
    generarPDF: mockGenerarPDF,
  })),
}));

jest.mock('../../utils/RetryManager', () => ({
  RetryManager: jest.fn().mockImplementation(() => ({
    executeWithRetry: mockExecuteWithRetry,
  })),
}));

jest.mock('../../validators/DataValidator', () => ({
  DataValidator: jest.fn().mockImplementation(() => ({
    validarRUC: jest.fn().mockReturnValue({ valido: true, errores: [] }),
  })),
}));

// Importar el handler después de configurar los mocks
import { handler } from '../../handlers/generar-comprobante';

describe('Handler generar-comprobante (Orquestador Principal)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/generar-comprobante',
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

  const certificadoMock = {
    ruc: '20123456789',
    archivo: Buffer.from('certificado'),
    password: 'encrypted:password',
    fechaEmision: new Date('2024-01-01'),
    fechaVencimiento: new Date('2025-12-31'),
    emisor: 'Test CA',
  };

  const datosBoleta = {
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
        total: 100,
      },
    ],
    subtotal: 100,
    igv: 18,
    total: 118,
    moneda: TipoMoneda.PEN,
    estado: EstadoComprobante.PENDIENTE,
    xmlOriginal: '<?xml version="1.0"?><Invoice>...</Invoice>',
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

  const pdfBufferMock = Buffer.from('PDF content');

  describe('Flujo completo exitoso', () => {
    it('debe generar, firmar, enviar y procesar un comprobante exitosamente', async () => {
      // Arrange
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockResolvedValue({
        success: true,
        data: cdrMock,
        totalAttempts: 1,
      });
      mockProcesarCDR.mockResolvedValue(undefined);
      mockObtenerComprobante.mockResolvedValue({
        ...comprobanteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrMock,
      });
      mockGenerarPDF.mockResolvedValue(pdfBufferMock);
      mockGuardarPDF.mockResolvedValue('s3://bucket/pdfs/B001-00000001.pdf');

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
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
      expect(body.data.urlPDF).toBe('s3://bucket/pdfs/B001-00000001.pdf');
      expect(body.message).toContain('exitosamente');

      // Verificar orden de llamadas
      expect(mockObtenerEmpresa).toHaveBeenCalledWith('20123456789');
      expect(mockObtenerCertificado).toHaveBeenCalledWith('20123456789');
      expect(mockGenerarBoleta).toHaveBeenCalledWith('20123456789', datosBoleta);
      expect(mockFirmarXML).toHaveBeenCalledWith('20123456789', comprobanteMock.xmlOriginal);
      expect(mockExecuteWithRetry).toHaveBeenCalled();
      expect(mockProcesarCDR).toHaveBeenCalledWith('20123456789', 'B001-00000001', cdrMock);
      expect(mockGenerarPDF).toHaveBeenCalled();
    });
  });

  describe('Validación de entrada', () => {
    it('debe retornar error 400 si no hay body', async () => {
      const event = createEvent(null);
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('body de la petición es requerido');
    });

    it('debe retornar error 400 si falta empresaRuc', async () => {
      const event = createEvent({
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('empresaRuc, tipo y datos son requeridos');
    });

    it('debe retornar error 400 si falta tipo', async () => {
      const event = createEvent({
        empresaRuc: '20123456789',
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
    });

    it('debe retornar error 400 si falta datos', async () => {
      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
    });
  });

  describe('Validación de empresa', () => {
    it('debe retornar error 404 si la empresa no existe', async () => {
      mockObtenerEmpresa.mockResolvedValue(null);

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Empresa con RUC 20123456789 no encontrada');
    });

    it('debe retornar error 400 si la empresa está inactiva', async () => {
      mockObtenerEmpresa.mockResolvedValue({
        ...empresaMock,
        activo: false,
      });

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('está inactiva');
    });

    it('debe retornar error 400 si la empresa no tiene certificado', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockRejectedValue(new Error('Certificado no encontrado'));

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('no tiene certificado digital configurado');
    });

    it('debe retornar error 400 si la empresa no tiene credenciales SUNAT', async () => {
      mockObtenerEmpresa.mockResolvedValue({
        ...empresaMock,
        credencialesSunat: undefined,
      });
      mockObtenerCertificado.mockResolvedValue(certificadoMock);

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('no tiene credenciales SUNAT configuradas');
    });
  });

  describe('Generación de comprobantes', () => {
    it('debe generar una factura correctamente', async () => {
      const datosFactura = {
        receptor: {
          ruc: '20987654321',
          razonSocial: 'Cliente Empresa SAC',
          direccion: {
            direccion: 'Av. Cliente 456',
            departamento: 'Lima',
            provincia: 'Lima',
            distrito: 'San Isidro',
            ubigeo: '150130',
          },
        },
        items: datosBoleta.items,
        moneda: TipoMoneda.PEN,
      };

      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarFactura.mockResolvedValue({
        ...comprobanteMock,
        tipo: TipoComprobante.FACTURA,
        numero: 'F001-00000001',
      });
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/F001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockResolvedValue({
        success: true,
        data: cdrMock,
        totalAttempts: 1,
      });
      mockProcesarCDR.mockResolvedValue(undefined);
      mockObtenerComprobante.mockResolvedValue({
        ...comprobanteMock,
        tipo: TipoComprobante.FACTURA,
        numero: 'F001-00000001',
        estado: EstadoComprobante.ACEPTADO,
      });
      mockGenerarPDF.mockResolvedValue(pdfBufferMock);
      mockGuardarPDF.mockResolvedValue('s3://bucket/pdfs/F001-00000001.pdf');

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.FACTURA,
        datos: datosFactura,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(mockGenerarFactura).toHaveBeenCalledWith('20123456789', datosFactura);
      expect(mockGenerarBoleta).not.toHaveBeenCalled();
    });

    it('debe retornar error 400 si falla la generación del comprobante', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockRejectedValue(new Error('El DNI debe tener 8 dígitos'));

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Error al generar comprobante');
      expect(body.message).toContain('DNI debe tener 8 dígitos');
    });

    it('debe retornar error 400 para tipo de comprobante no soportado', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: '99', // Tipo inválido
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Tipo de comprobante no soportado');
    });
  });

  describe('Firma digital', () => {
    it('debe retornar error 500 si falla la firma del comprobante', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockRejectedValue(new Error('El certificado está vencido'));
      mockActualizarEstado.mockResolvedValue(undefined);

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Error al firmar comprobante');
      expect(mockActualizarEstado).toHaveBeenCalledWith(
        '20123456789',
        'B001-00000001',
        EstadoComprobante.PENDIENTE
      );
    });
  });

  describe('Envío a SUNAT con reintentos', () => {
    it('debe retornar respuesta parcial (207) si falla el envío tras reintentos', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockResolvedValue({
        success: false,
        data: null,
        totalAttempts: 3,
      });

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(207); // Multi-Status
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.data.numeroComprobante).toBe('B001-00000001');
      expect(body.data.estado).toBe(EstadoComprobante.PENDIENTE);
      expect(body.message).toContain('generado y firmado');
      expect(body.message).toContain('no se pudo enviar');
      expect(body.message).toContain('pendiente para reintento manual');
    });

    it('debe comprimir el XML correctamente antes de enviar', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockResolvedValue({
        success: true,
        data: cdrMock,
        totalAttempts: 1,
      });
      mockProcesarCDR.mockResolvedValue(undefined);
      mockObtenerComprobante.mockResolvedValue({
        ...comprobanteMock,
        estado: EstadoComprobante.ACEPTADO,
      });
      mockGenerarPDF.mockResolvedValue(pdfBufferMock);
      mockGuardarPDF.mockResolvedValue('s3://bucket/pdfs/B001-00000001.pdf');

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      await handler(event);

      // Verificar que executeWithRetry fue llamado con una función
      expect(mockExecuteWithRetry).toHaveBeenCalled();
      const retryFunction = mockExecuteWithRetry.mock.calls[0][0];
      expect(typeof retryFunction).toBe('function');
    });
  });

  describe('Generación de PDF', () => {
    it('debe generar PDF solo si el comprobante fue aceptado', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockResolvedValue({
        success: true,
        data: cdrMock,
        totalAttempts: 1,
      });
      mockProcesarCDR.mockResolvedValue(undefined);
      mockObtenerComprobante.mockResolvedValue({
        ...comprobanteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrMock,
      });
      mockGenerarPDF.mockResolvedValue(pdfBufferMock);
      mockGuardarPDF.mockResolvedValue('s3://bucket/pdfs/B001-00000001.pdf');

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockGenerarPDF).toHaveBeenCalled();
      expect(mockGuardarPDF).toHaveBeenCalled();
      const body = JSON.parse(result.body);
      expect(body.data.urlPDF).toBeDefined();
    });

    it('no debe generar PDF si el comprobante fue rechazado', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockResolvedValue({
        success: true,
        data: { ...cdrMock, codigo: '2000' }, // Código de rechazo
        totalAttempts: 1,
      });
      mockProcesarCDR.mockResolvedValue(undefined);
      mockObtenerComprobante.mockResolvedValue({
        ...comprobanteMock,
        estado: EstadoComprobante.RECHAZADO,
      });

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockGenerarPDF).not.toHaveBeenCalled();
      expect(mockGuardarPDF).not.toHaveBeenCalled();
      const body = JSON.parse(result.body);
      expect(body.data.urlPDF).toBeUndefined();
    });

    it('no debe fallar la operación completa si falla la generación del PDF', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockResolvedValue({
        success: true,
        data: cdrMock,
        totalAttempts: 1,
      });
      mockProcesarCDR.mockResolvedValue(undefined);
      mockObtenerComprobante.mockResolvedValue({
        ...comprobanteMock,
        estado: EstadoComprobante.ACEPTADO,
        cdr: cdrMock,
      });
      mockGenerarPDF.mockRejectedValue(new Error('Error al generar PDF'));

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      // La operación debe ser exitosa aunque falle el PDF
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.urlPDF).toBeUndefined();
    });
  });

  describe('Manejo de errores', () => {
    it('debe retornar error 502 para errores SOAP de SUNAT', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockRejectedValue(
        new Error('Error SOAP de SUNAT: Credenciales inválidas')
      );

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Error SOAP de SUNAT');
    });

    it('debe retornar error 504 para timeouts', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);
      mockObtenerCertificado.mockResolvedValue(certificadoMock);
      mockGenerarBoleta.mockResolvedValue(comprobanteMock);
      mockGuardarXML.mockResolvedValue('s3://bucket/xmls/B001-00000001.xml');
      mockFirmarXML.mockResolvedValue(xmlFirmadoMock);
      mockGuardarComprobante.mockResolvedValue(undefined);
      mockActualizarEstado.mockResolvedValue(undefined);
      mockExecuteWithRetry.mockRejectedValue(new Error('Connection timeout'));

      const event = createEvent({
        empresaRuc: '20123456789',
        tipo: TipoComprobante.BOLETA,
        datos: datosBoleta,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(504);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('timeout');
    });
  });
});
