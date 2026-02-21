/**
 * Pruebas unitarias para VoidingService
 * 
 * Valida la generación de comunicaciones de baja y notas de crédito
 */

import { VoidingService } from '../../services/VoidingService';
import {
  Comprobante,
  TipoComprobante,
  EstadoComprobante,
  TipoMoneda,
  Emisor,
  ItemComprobante,
} from '../../types';
import { ComprobanteRepository } from '../../repositories/interfaces';

describe('VoidingService', () => {
  let voidingService: VoidingService;
  let mockRepository: jest.Mocked<ComprobanteRepository>;
  let mockObtenerDatosEmisor: jest.Mock;

  const emisorMock: Emisor = {
    ruc: '20123456789',
    razonSocial: 'EMPRESA TEST SAC',
    nombreComercial: 'EMPRESA TEST',
    direccion: {
      departamento: 'LIMA',
      provincia: 'LIMA',
      distrito: 'MIRAFLORES',
      direccion: 'AV. TEST 123',
      codigoPais: 'PE',
    },
  };

  const itemMock: ItemComprobante = {
    codigo: 'PROD001',
    descripcion: 'Producto de prueba',
    cantidad: 2,
    unidadMedida: 'NIU',
    precioUnitario: 100.0,
    afectacionIGV: '10',
    igv: 36.0,
    total: 200.0,
  };

  const boletaAceptadaMock: Comprobante = {
    empresaRuc: '20123456789',
    numero: 'B001-00000001',
    tipo: TipoComprobante.BOLETA,
    fecha: new Date('2025-01-15'),
    emisor: emisorMock,
    receptor: {
      tipoDocumento: '1',
      numeroDocumento: '12345678',
      nombre: 'CLIENTE TEST',
    },
    items: [itemMock],
    subtotal: 200.0,
    igv: 36.0,
    total: 236.0,
    moneda: TipoMoneda.PEN,
    estado: EstadoComprobante.ACEPTADO,
  };

  const facturaAceptadaMock: Comprobante = {
    empresaRuc: '20123456789',
    numero: 'F001-00000001',
    tipo: TipoComprobante.FACTURA,
    fecha: new Date('2025-01-15'),
    emisor: emisorMock,
    receptor: {
      tipoDocumento: '6',
      numeroDocumento: '20987654321',
      nombre: 'CLIENTE EMPRESA SAC',
      direccion: {
        departamento: 'LIMA',
        provincia: 'LIMA',
        distrito: 'SAN ISIDRO',
        direccion: 'AV. CLIENTE 456',
        codigoPais: 'PE',
      },
    },
    items: [itemMock],
    subtotal: 200.0,
    igv: 36.0,
    total: 236.0,
    moneda: TipoMoneda.PEN,
    estado: EstadoComprobante.ACEPTADO,
  };

  beforeEach(() => {
    mockRepository = {
      obtenerComprobante: jest.fn(),
      guardarComprobante: jest.fn(),
      obtenerSiguienteNumero: jest.fn(),
      guardarCDR: jest.fn(),
      obtenerCDR: jest.fn(),
      listarPendientes: jest.fn(),
      actualizarEstado: jest.fn(),
      listarComprobantes: jest.fn(),
    } as jest.Mocked<ComprobanteRepository>;

    mockObtenerDatosEmisor = jest.fn().mockResolvedValue(emisorMock);

    voidingService = new VoidingService(mockRepository, mockObtenerDatosEmisor);
  });

  describe('generarComunicacionBaja', () => {
    it('debe generar comunicación de baja para boletas aceptadas', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(boletaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);

      const datos = {
        fechaBaja: new Date('2025-01-20'),
        comprobantes: ['B001-00000001'],
        motivo: 'Error en la emisión',
      };

      // Act
      const resultado = await voidingService.generarComunicacionBaja('20123456789', datos);

      // Assert
      expect(resultado).toBeDefined();
      expect(resultado.empresaRuc).toBe('20123456789');
      expect(resultado.numero).toMatch(/^RA-\d{8}-\d+$/);
      expect(resultado.comprobantes).toEqual(['B001-00000001']);
      expect(resultado.motivo).toBe('Error en la emisión');
      expect(resultado.xmlOriginal).toBeDefined();
      expect(resultado.xmlOriginal).toContain('VoidedDocuments');
      expect(resultado.xmlOriginal).toContain('<sac:DocumentSerialID>B001</sac:DocumentSerialID>');
      expect(resultado.xmlOriginal).toContain('<sac:DocumentNumberID>00000001</sac:DocumentNumberID>');
      expect(resultado.xmlOriginal).toContain('Error en la emisión');
    });

    it('debe generar comunicación de baja para múltiples boletas', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(boletaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);

      const datos = {
        fechaBaja: new Date('2025-01-20'),
        comprobantes: ['B001-00000001', 'B001-00000002', 'B001-00000003'],
        motivo: 'Anulación masiva',
      };

      // Act
      const resultado = await voidingService.generarComunicacionBaja('20123456789', datos);

      // Assert
      expect(resultado.comprobantes).toHaveLength(3);
      expect(resultado.xmlOriginal).toContain('<sac:DocumentSerialID>B001</sac:DocumentSerialID>');
      expect(resultado.xmlOriginal).toContain('<sac:DocumentNumberID>00000001</sac:DocumentNumberID>');
      expect(resultado.xmlOriginal).toContain('<sac:DocumentNumberID>00000002</sac:DocumentNumberID>');
      expect(resultado.xmlOriginal).toContain('<sac:DocumentNumberID>00000003</sac:DocumentNumberID>');
      expect(mockRepository.obtenerComprobante).toHaveBeenCalledTimes(3);
    });

    it('debe rechazar comunicación de baja si el comprobante no existe', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(null);

      const datos = {
        fechaBaja: new Date('2025-01-20'),
        comprobantes: ['B001-99999999'],
        motivo: 'Error en la emisión',
      };

      // Act & Assert
      await expect(
        voidingService.generarComunicacionBaja('20123456789', datos)
      ).rejects.toThrow('Comprobante B001-99999999 no encontrado');
    });

    it('debe rechazar comunicación de baja si el comprobante no es una boleta', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(facturaAceptadaMock);

      const datos = {
        fechaBaja: new Date('2025-01-20'),
        comprobantes: ['F001-00000001'],
        motivo: 'Error en la emisión',
      };

      // Act & Assert
      await expect(
        voidingService.generarComunicacionBaja('20123456789', datos)
      ).rejects.toThrow('no es una boleta. Use nota de crédito para facturas');
    });

    it('debe rechazar comunicación de baja si el comprobante no está aceptado', async () => {
      // Arrange
      const boletaPendiente = { ...boletaAceptadaMock, estado: EstadoComprobante.PENDIENTE };
      mockRepository.obtenerComprobante.mockResolvedValue(boletaPendiente);

      const datos = {
        fechaBaja: new Date('2025-01-20'),
        comprobantes: ['B001-00000001'],
        motivo: 'Error en la emisión',
      };

      // Act & Assert
      await expect(
        voidingService.generarComunicacionBaja('20123456789', datos)
      ).rejects.toThrow('Solo se pueden anular comprobantes aceptados por SUNAT');
    });

    it('debe incluir datos del emisor en el XML', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(boletaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);

      const datos = {
        fechaBaja: new Date('2025-01-20'),
        comprobantes: ['B001-00000001'],
        motivo: 'Error en la emisión',
      };

      // Act
      const resultado = await voidingService.generarComunicacionBaja('20123456789', datos);

      // Assert
      expect(resultado.xmlOriginal).toContain(emisorMock.ruc);
      expect(resultado.xmlOriginal).toContain(emisorMock.razonSocial);
    });
  });

  describe('generarNotaCredito', () => {
    it('debe generar nota de crédito para factura aceptada', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(facturaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);
      mockRepository.guardarComprobante.mockResolvedValue();

      const datos = {
        comprobanteReferencia: 'F001-00000001',
        motivo: 'Anulación de la operación',
        tipoNota: '01', // Anulación de la operación
      };

      // Act
      const resultado = await voidingService.generarNotaCredito('20123456789', datos);

      // Assert
      expect(resultado).toBeDefined();
      expect(resultado.tipo).toBe(TipoComprobante.NOTA_CREDITO);
      expect(resultado.numero).toMatch(/^NC01-\d{8}$/);
      expect(resultado.estado).toBe(EstadoComprobante.PENDIENTE);
      expect(resultado.xmlOriginal).toBeDefined();
      expect(resultado.xmlOriginal).toContain('CreditNote');
      expect(resultado.xmlOriginal).toContain('F001-00000001'); // Referencia al original
      expect(resultado.xmlOriginal).toContain('Anulación de la operación');
      expect(mockRepository.guardarComprobante).toHaveBeenCalledWith('20123456789', resultado);
    });

    it('debe copiar items del comprobante original si no se proporcionan', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(facturaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);
      mockRepository.guardarComprobante.mockResolvedValue();

      const datos = {
        comprobanteReferencia: 'F001-00000001',
        motivo: 'Anulación de la operación',
        tipoNota: '01',
      };

      // Act
      const resultado = await voidingService.generarNotaCredito('20123456789', datos);

      // Assert
      expect(resultado.items).toEqual(facturaAceptadaMock.items);
      expect(resultado.subtotal).toBe(facturaAceptadaMock.subtotal);
      expect(resultado.igv).toBe(facturaAceptadaMock.igv);
      expect(resultado.total).toBe(facturaAceptadaMock.total);
    });

    it('debe usar items proporcionados si se especifican', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(facturaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);
      mockRepository.guardarComprobante.mockResolvedValue();

      const itemParcial: ItemComprobante = {
        codigo: 'PROD001',
        descripcion: 'Producto de prueba',
        cantidad: 1, // Solo 1 unidad
        unidadMedida: 'NIU',
        precioUnitario: 100.0,
        afectacionIGV: '10',
        igv: 18.0,
        total: 100.0,
      };

      const datos = {
        comprobanteReferencia: 'F001-00000001',
        motivo: 'Devolución parcial',
        tipoNota: '01',
        items: [itemParcial],
      };

      // Act
      const resultado = await voidingService.generarNotaCredito('20123456789', datos);

      // Assert
      expect(resultado.items).toEqual([itemParcial]);
      expect(resultado.subtotal).toBe(100.0);
      expect(resultado.igv).toBe(18.0);
      expect(resultado.total).toBe(118.0);
    });

    it('debe rechazar nota de crédito si el comprobante no existe', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(null);

      const datos = {
        comprobanteReferencia: 'F001-99999999',
        motivo: 'Anulación',
        tipoNota: '01',
      };

      // Act & Assert
      await expect(
        voidingService.generarNotaCredito('20123456789', datos)
      ).rejects.toThrow('Comprobante F001-99999999 no encontrado');
    });

    it('debe rechazar nota de crédito si el comprobante no es una factura', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(boletaAceptadaMock);

      const datos = {
        comprobanteReferencia: 'B001-00000001',
        motivo: 'Anulación',
        tipoNota: '01',
      };

      // Act & Assert
      await expect(
        voidingService.generarNotaCredito('20123456789', datos)
      ).rejects.toThrow('no es una factura. Use comunicación de baja para boletas');
    });

    it('debe rechazar nota de crédito si el comprobante no está aceptado', async () => {
      // Arrange
      const facturaPendiente = { ...facturaAceptadaMock, estado: EstadoComprobante.PENDIENTE };
      mockRepository.obtenerComprobante.mockResolvedValue(facturaPendiente);

      const datos = {
        comprobanteReferencia: 'F001-00000001',
        motivo: 'Anulación',
        tipoNota: '01',
      };

      // Act & Assert
      await expect(
        voidingService.generarNotaCredito('20123456789', datos)
      ).rejects.toThrow('Solo se pueden anular comprobantes aceptados por SUNAT');
    });

    it('debe incluir referencia al comprobante original en el XML', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(facturaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);
      mockRepository.guardarComprobante.mockResolvedValue();

      const datos = {
        comprobanteReferencia: 'F001-00000001',
        motivo: 'Anulación de la operación',
        tipoNota: '01',
      };

      // Act
      const resultado = await voidingService.generarNotaCredito('20123456789', datos);

      // Assert
      expect(resultado.xmlOriginal).toContain('<cac:DiscrepancyResponse>');
      expect(resultado.xmlOriginal).toContain('<cbc:ReferenceID>F001-00000001</cbc:ReferenceID>');
      expect(resultado.xmlOriginal).toContain('<cac:BillingReference>');
      expect(resultado.xmlOriginal).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    });

    it('debe copiar datos del receptor del comprobante original', async () => {
      // Arrange
      mockRepository.obtenerComprobante.mockResolvedValue(facturaAceptadaMock);
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);
      mockRepository.guardarComprobante.mockResolvedValue();

      const datos = {
        comprobanteReferencia: 'F001-00000001',
        motivo: 'Anulación',
        tipoNota: '01',
      };

      // Act
      const resultado = await voidingService.generarNotaCredito('20123456789', datos);

      // Assert
      expect(resultado.receptor).toEqual(facturaAceptadaMock.receptor);
      expect(resultado.xmlOriginal).toContain(facturaAceptadaMock.receptor.numeroDocumento);
      expect(resultado.xmlOriginal).toContain(facturaAceptadaMock.receptor.nombre);
    });
  });

  describe('validarComprobanteParaAnulacion', () => {
    it('debe aceptar comprobantes en estado ACEPTADO', () => {
      // Arrange
      const comprobante = { ...boletaAceptadaMock, estado: EstadoComprobante.ACEPTADO };

      // Act & Assert
      expect(() => voidingService.validarComprobanteParaAnulacion(comprobante)).not.toThrow();
    });

    it('debe rechazar comprobantes en estado PENDIENTE', () => {
      // Arrange
      const comprobante = { ...boletaAceptadaMock, estado: EstadoComprobante.PENDIENTE };

      // Act & Assert
      expect(() => voidingService.validarComprobanteParaAnulacion(comprobante)).toThrow(
        'Solo se pueden anular comprobantes aceptados por SUNAT'
      );
    });

    it('debe rechazar comprobantes en estado ENVIADO', () => {
      // Arrange
      const comprobante = { ...boletaAceptadaMock, estado: EstadoComprobante.ENVIADO };

      // Act & Assert
      expect(() => voidingService.validarComprobanteParaAnulacion(comprobante)).toThrow(
        'Solo se pueden anular comprobantes aceptados por SUNAT'
      );
    });

    it('debe rechazar comprobantes en estado RECHAZADO', () => {
      // Arrange
      const comprobante = { ...boletaAceptadaMock, estado: EstadoComprobante.RECHAZADO };

      // Act & Assert
      expect(() => voidingService.validarComprobanteParaAnulacion(comprobante)).toThrow(
        'Solo se pueden anular comprobantes aceptados por SUNAT'
      );
    });
  });
});
