/**
 * Pruebas basadas en propiedades para VoidingService
 * 
 * **Propiedad 25: Referencia en notas de crédito**
 * **Valida: Requisitos 10.4**
 * 
 * **Propiedad 26: Validación de estado para anulación**
 * **Valida: Requisitos 10.5**
 */

import * as fc from 'fast-check';
import { VoidingService } from '../../services/VoidingService';
import {
  TipoComprobante,
  EstadoComprobante,
  TipoMoneda,
  Emisor,
} from '../../types';
import { ComprobanteRepository } from '../../repositories/interfaces';

describe('VoidingService - Property-Based Tests', () => {
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

  // Generadores de datos aleatorios
  const itemArbitrary = fc.record({
    codigo: fc.string({ minLength: 1, maxLength: 20 }),
    descripcion: fc.string({ minLength: 1, maxLength: 100 }),
    cantidad: fc.integer({ min: 1, max: 1000 }),
    unidadMedida: fc.constantFrom('NIU', 'ZZ', 'KGM', 'MTR'),
    precioUnitario: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    afectacionIGV: fc.constantFrom('10', '20', '30', '40'),
    igv: fc.double({ min: 0, max: 1800, noNaN: true }).map(n => Math.round(n * 100) / 100),
    total: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
  });

  const facturaAceptadaArbitrary = fc.record({
    empresaRuc: fc.constant('20123456789'),
    numero: fc.string({ minLength: 13, maxLength: 13 }).map(s => `F001-${s.slice(0, 8)}`),
    tipo: fc.constant(TipoComprobante.FACTURA),
    fecha: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
    emisor: fc.constant(emisorMock),
    receptor: fc.record({
      tipoDocumento: fc.constant('6'),
      numeroDocumento: fc.string({ minLength: 11, maxLength: 11 }).map(s => s.replace(/\D/g, '0').slice(0, 11)),
      nombre: fc.string({ minLength: 5, maxLength: 100 }),
      direccion: fc.record({
        departamento: fc.constantFrom('LIMA', 'AREQUIPA', 'CUSCO', 'PIURA'),
        provincia: fc.constantFrom('LIMA', 'AREQUIPA', 'CUSCO', 'PIURA'),
        distrito: fc.constantFrom('MIRAFLORES', 'CAYMA', 'WANCHAQ', 'CASTILLA'),
        direccion: fc.string({ minLength: 5, maxLength: 100 }),
        codigoPais: fc.constant('PE'),
      }),
    }),
    items: fc.array(itemArbitrary, { minLength: 1, maxLength: 5 }),
    subtotal: fc.double({ min: 0.01, max: 50000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    igv: fc.double({ min: 0, max: 9000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    total: fc.double({ min: 0.01, max: 59000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
    estado: fc.constant(EstadoComprobante.ACEPTADO),
  });

  const boletaAceptadaArbitrary = fc.record({
    empresaRuc: fc.constant('20123456789'),
    numero: fc.string({ minLength: 13, maxLength: 13 }).map(s => `B001-${s.slice(0, 8)}`),
    tipo: fc.constant(TipoComprobante.BOLETA),
    fecha: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
    emisor: fc.constant(emisorMock),
    receptor: fc.record({
      tipoDocumento: fc.constant('1'),
      numeroDocumento: fc.string({ minLength: 8, maxLength: 8 }).map(s => s.replace(/\D/g, '0').slice(0, 8)),
      nombre: fc.string({ minLength: 5, maxLength: 100 }),
    }),
    items: fc.array(itemArbitrary, { minLength: 1, maxLength: 5 }),
    subtotal: fc.double({ min: 0.01, max: 50000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    igv: fc.double({ min: 0, max: 9000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    total: fc.double({ min: 0.01, max: 59000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
    estado: fc.constant(EstadoComprobante.ACEPTADO),
  });

  /**
   * **Propiedad 25: Referencia en notas de crédito**
   * **Valida: Requisitos 10.4**
   * 
   * Para cualquier nota de crédito generada, el XML debe contener una referencia
   * válida al comprobante original que se está anulando.
   */
  it('Propiedad 25: Toda nota de crédito debe contener referencia al comprobante original', async () => {
    await fc.assert(
      fc.asyncProperty(
        facturaAceptadaArbitrary,
        fc.string({ minLength: 5, maxLength: 200 }),
        fc.constantFrom('01', '02', '03', '04', '05', '06', '07', '08', '09', '10'),
        async (facturaOriginal, motivo, tipoNota) => {
          // Arrange
          mockRepository.obtenerComprobante.mockResolvedValue(facturaOriginal);
          mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);
          mockRepository.guardarComprobante.mockResolvedValue();

          const datos = {
            comprobanteReferencia: facturaOriginal.numero,
            motivo,
            tipoNota,
          };

          // Act
          const notaCredito = await voidingService.generarNotaCredito(
            facturaOriginal.empresaRuc,
            datos
          );

          // Assert - El XML debe contener la referencia al comprobante original
          expect(notaCredito.xmlOriginal).toBeDefined();
          expect(notaCredito.xmlOriginal).toContain('<cac:DiscrepancyResponse>');
          expect(notaCredito.xmlOriginal).toContain(`<cbc:ReferenceID>${facturaOriginal.numero}</cbc:ReferenceID>`);
          expect(notaCredito.xmlOriginal).toContain('<cac:BillingReference>');
          expect(notaCredito.xmlOriginal).toContain(`<cbc:ID>${facturaOriginal.numero}</cbc:ID>`);
          expect(notaCredito.xmlOriginal).toContain(`<cbc:DocumentTypeCode>${facturaOriginal.tipo}</cbc:DocumentTypeCode>`);
          expect(notaCredito.xmlOriginal).toContain(motivo);
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  /**
   * **Propiedad 26: Validación de estado para anulación**
   * **Valida: Requisitos 10.5**
   * 
   * Para cualquier intento de anulación de comprobante, el sistema debe validar
   * que el comprobante esté en estado ACEPTADO, rechazando anulaciones de
   * comprobantes en otros estados.
   */
  it('Propiedad 26: Solo se pueden anular comprobantes en estado ACEPTADO', async () => {
    await fc.assert(
      fc.asyncProperty(
        facturaAceptadaArbitrary,
        fc.constantFrom(
          EstadoComprobante.PENDIENTE,
          EstadoComprobante.ENVIADO,
          EstadoComprobante.RECHAZADO
        ),
        fc.string({ minLength: 5, maxLength: 200 }),
        async (factura, estadoInvalido, motivo) => {
          // Arrange - Comprobante con estado no aceptado
          const facturaNoAceptada = { ...factura, estado: estadoInvalido };
          mockRepository.obtenerComprobante.mockResolvedValue(facturaNoAceptada);

          const datos = {
            comprobanteReferencia: factura.numero,
            motivo,
            tipoNota: '01',
          };

          // Act & Assert - Debe rechazar la anulación
          await expect(
            voidingService.generarNotaCredito(factura.empresaRuc, datos)
          ).rejects.toThrow('Solo se pueden anular comprobantes aceptados por SUNAT');
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('Propiedad 26: Comunicaciones de baja solo aceptan boletas en estado ACEPTADO', async () => {
    await fc.assert(
      fc.asyncProperty(
        boletaAceptadaArbitrary,
        fc.constantFrom(
          EstadoComprobante.PENDIENTE,
          EstadoComprobante.ENVIADO,
          EstadoComprobante.RECHAZADO
        ),
        fc.string({ minLength: 5, maxLength: 200 }),
        async (boleta, estadoInvalido, motivo) => {
          // Arrange - Boleta con estado no aceptado
          const boletaNoAceptada = { ...boleta, estado: estadoInvalido };
          mockRepository.obtenerComprobante.mockResolvedValue(boletaNoAceptada);

          const datos = {
            fechaBaja: new Date('2025-01-20'),
            comprobantes: [boleta.numero],
            motivo,
          };

          // Act & Assert - Debe rechazar la comunicación de baja
          await expect(
            voidingService.generarComunicacionBaja(boleta.empresaRuc, datos)
          ).rejects.toThrow('Solo se pueden anular comprobantes aceptados por SUNAT');
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('Propiedad: Comunicaciones de baja solo aceptan boletas, no facturas', async () => {
    await fc.assert(
      fc.asyncProperty(
        facturaAceptadaArbitrary,
        fc.string({ minLength: 5, maxLength: 200 }),
        async (factura, motivo) => {
          // Arrange
          mockRepository.obtenerComprobante.mockResolvedValue(factura);

          const datos = {
            fechaBaja: new Date('2025-01-20'),
            comprobantes: [factura.numero],
            motivo,
          };

          // Act & Assert - Debe rechazar facturas en comunicación de baja
          await expect(
            voidingService.generarComunicacionBaja(factura.empresaRuc, datos)
          ).rejects.toThrow('no es una boleta. Use nota de crédito para facturas');
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('Propiedad: Notas de crédito solo aceptan facturas, no boletas', async () => {
    await fc.assert(
      fc.asyncProperty(
        boletaAceptadaArbitrary,
        fc.string({ minLength: 5, maxLength: 200 }),
        async (boleta, motivo) => {
          // Arrange
          mockRepository.obtenerComprobante.mockResolvedValue(boleta);

          const datos = {
            comprobanteReferencia: boleta.numero,
            motivo,
            tipoNota: '01',
          };

          // Act & Assert - Debe rechazar boletas en nota de crédito
          await expect(
            voidingService.generarNotaCredito(boleta.empresaRuc, datos)
          ).rejects.toThrow('no es una factura. Use comunicación de baja para boletas');
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('Propiedad: Notas de crédito copian datos del receptor del comprobante original', async () => {
    await fc.assert(
      fc.asyncProperty(
        facturaAceptadaArbitrary,
        fc.string({ minLength: 5, maxLength: 200 }),
        async (facturaOriginal, motivo) => {
          // Arrange
          mockRepository.obtenerComprobante.mockResolvedValue(facturaOriginal);
          mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);
          mockRepository.guardarComprobante.mockResolvedValue();

          const datos = {
            comprobanteReferencia: facturaOriginal.numero,
            motivo,
            tipoNota: '01',
          };

          // Act
          const notaCredito = await voidingService.generarNotaCredito(
            facturaOriginal.empresaRuc,
            datos
          );

          // Assert - El receptor debe ser el mismo que el del comprobante original
          expect(notaCredito.receptor).toEqual(facturaOriginal.receptor);
          expect(notaCredito.xmlOriginal).toContain(facturaOriginal.receptor.numeroDocumento);
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('Propiedad: Comunicaciones de baja generan número con formato RA-YYYYMMDD-N', async () => {
    await fc.assert(
      fc.asyncProperty(
        boletaAceptadaArbitrary,
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).filter(d => !isNaN(d.getTime())),
        fc.string({ minLength: 5, maxLength: 200 }),
        async (boleta, fechaBaja, motivo) => {
          // Arrange
          mockRepository.obtenerComprobante.mockResolvedValue(boleta);
          mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);

          const datos = {
            fechaBaja,
            comprobantes: [boleta.numero],
            motivo,
          };

          // Act
          const comunicacion = await voidingService.generarComunicacionBaja(
            boleta.empresaRuc,
            datos
          );

          // Assert - El número debe tener el formato correcto
          expect(comunicacion.numero).toMatch(/^RA-\d{8}-\d+$/);
          
          // Verificar que la fecha en el número coincide con la fecha de baja
          const fechaEnNumero = comunicacion.numero.split('-')[1];
          const fechaBajaFormateada = fechaBaja.toISOString().split('T')[0].replace(/-/g, '');
          expect(fechaEnNumero).toBe(fechaBajaFormateada);
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });
});
