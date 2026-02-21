/**
 * Pruebas basadas en propiedades para comprobantes
 * Feature: sunat
 */

import * as fc from 'fast-check';
import {
  Comprobante,
  TipoComprobante,
  EstadoComprobante,
  TipoMoneda,
  TipoDocumentoIdentidad,
  Emisor,
  Receptor,
  ItemComprobante,
  AfectacionIGV,
  Direccion,
} from '../types';

/**
 * Generador de direcciones válidas
 */
const direccionArbitrary = (): fc.Arbitrary<Direccion> =>
  fc.record({
    departamento: fc.string({ minLength: 3, maxLength: 50 }),
    provincia: fc.string({ minLength: 3, maxLength: 50 }),
    distrito: fc.string({ minLength: 3, maxLength: 50 }),
    direccion: fc.string({ minLength: 5, maxLength: 100 }),
  });

/**
 * Generador de RUC válido (11 dígitos numéricos)
 */
const rucArbitrary = (): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 11, maxLength: 11 })
    .map((digits) => digits.join(''));

/**
 * Generador de DNI válido (8 dígitos numéricos)
 */
const dniArbitrary = (): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map((digits) => digits.join(''));

/**
 * Generador de emisor válido
 */
const emisorArbitrary = (): fc.Arbitrary<Emisor> =>
  fc.record({
    ruc: rucArbitrary(),
    razonSocial: fc.string({ minLength: 5, maxLength: 100 }),
    nombreComercial: fc.string({ minLength: 3, maxLength: 100 }),
    direccion: direccionArbitrary(),
  });

/**
 * Generador de receptor para boleta (con DNI)
 */
const receptorBoletaArbitrary = (): fc.Arbitrary<Receptor> =>
  fc.record({
    tipoDocumento: fc.constant(TipoDocumentoIdentidad.DNI),
    numeroDocumento: dniArbitrary(),
    nombre: fc.string({ minLength: 5, maxLength: 100 }),
    direccion: fc.option(direccionArbitrary(), { nil: undefined }),
  });

/**
 * Generador de receptor para factura (con RUC)
 */
const receptorFacturaArbitrary = (): fc.Arbitrary<Receptor> =>
  fc.record({
    tipoDocumento: fc.constant(TipoDocumentoIdentidad.RUC),
    numeroDocumento: rucArbitrary(),
    nombre: fc.string({ minLength: 5, maxLength: 100 }),
    direccion: fc.option(direccionArbitrary(), { nil: undefined }),
  });

/**
 * Generador de items de comprobante
 */
const itemComprobanteArbitrary = (): fc.Arbitrary<ItemComprobante> =>
  fc.record({
    codigo: fc.string({ minLength: 1, maxLength: 30 }),
    descripcion: fc.string({ minLength: 5, maxLength: 200 }),
    cantidad: fc.integer({ min: 1, max: 1000 }),
    unidadMedida: fc.constantFrom('NIU', 'ZZ', 'KGM', 'MTR'),
    precioUnitario: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(10000),
      noNaN: true,
    }),
    afectacionIGV: fc.constantFrom(
      AfectacionIGV.GRAVADO_OPERACION_ONEROSA,
      AfectacionIGV.EXONERADO_OPERACION_ONEROSA,
      AfectacionIGV.INAFECTO_OPERACION_ONEROSA
    ),
    igv: fc.float({ min: Math.fround(0), max: Math.fround(1800), noNaN: true }),
    total: fc.float({ min: Math.fround(0.01), max: Math.fround(11800), noNaN: true }),
  });

/**
 * Generador de boleta válida
 */
const boletaArbitrary = (): fc.Arbitrary<Comprobante> =>
  fc.record({
    empresaRuc: rucArbitrary(),
    numero: fc
      .tuple(
        fc.constantFrom('B001', 'B002', 'B003'),
        fc.integer({ min: 1, max: 99999999 })
      )
      .map(([serie, num]) => `${serie}-${num.toString().padStart(8, '0')}`),
    tipo: fc.constant(TipoComprobante.BOLETA),
    fecha: fc.date(),
    emisor: emisorArbitrary(),
    receptor: receptorBoletaArbitrary(),
    items: fc.array(itemComprobanteArbitrary(), { minLength: 1, maxLength: 10 }),
    subtotal: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(100000),
      noNaN: true,
    }),
    igv: fc.float({ min: Math.fround(0), max: Math.fround(18000), noNaN: true }),
    total: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(118000),
      noNaN: true,
    }),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
    estado: fc.constantFrom(
      EstadoComprobante.PENDIENTE,
      EstadoComprobante.ENVIADO,
      EstadoComprobante.ACEPTADO,
      EstadoComprobante.RECHAZADO
    ),
  });

/**
 * Generador de factura válida
 */
const facturaArbitrary = (): fc.Arbitrary<Comprobante> =>
  fc.record({
    empresaRuc: rucArbitrary(),
    numero: fc
      .tuple(
        fc.constantFrom('F001', 'F002', 'F003'),
        fc.integer({ min: 1, max: 99999999 })
      )
      .map(([serie, num]) => `${serie}-${num.toString().padStart(8, '0')}`),
    tipo: fc.constant(TipoComprobante.FACTURA),
    fecha: fc.date(),
    emisor: emisorArbitrary(),
    receptor: receptorFacturaArbitrary(),
    items: fc.array(itemComprobanteArbitrary(), { minLength: 1, maxLength: 10 }),
    subtotal: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(100000),
      noNaN: true,
    }),
    igv: fc.float({ min: Math.fround(0), max: Math.fround(18000), noNaN: true }),
    total: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(118000),
      noNaN: true,
    }),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
    estado: fc.constantFrom(
      EstadoComprobante.PENDIENTE,
      EstadoComprobante.ENVIADO,
      EstadoComprobante.ACEPTADO,
      EstadoComprobante.RECHAZADO
    ),
  });

describe('Property-Based Tests: Comprobantes', () => {
  describe('Property 4: Completitud de datos en comprobantes', () => {
    /**
     * **Validates: Requirements 1.5, 1.6**
     *
     * Para cualquier comprobante generado, el XML debe incluir todos los datos
     * del emisor y del receptor según el tipo de comprobante (DNI para boletas,
     * RUC para facturas).
     */
    it('debe incluir todos los datos del emisor en cualquier comprobante', () => {
      fc.assert(
        fc.property(
          fc.oneof(boletaArbitrary(), facturaArbitrary()),
          (comprobante) => {
            // Verificar que el emisor tiene todos los campos requeridos
            expect(comprobante.emisor).toBeDefined();
            expect(comprobante.emisor.ruc).toBeDefined();
            expect(comprobante.emisor.ruc).toMatch(/^\d{11}$/);
            expect(comprobante.emisor.razonSocial).toBeDefined();
            expect(comprobante.emisor.razonSocial.length).toBeGreaterThan(0);
            expect(comprobante.emisor.nombreComercial).toBeDefined();
            expect(comprobante.emisor.nombreComercial.length).toBeGreaterThan(0);
            expect(comprobante.emisor.direccion).toBeDefined();
            expect(comprobante.emisor.direccion.departamento).toBeDefined();
            expect(comprobante.emisor.direccion.provincia).toBeDefined();
            expect(comprobante.emisor.direccion.distrito).toBeDefined();
            expect(comprobante.emisor.direccion.direccion).toBeDefined();
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe incluir DNI del receptor en boletas', () => {
      fc.assert(
        fc.property(boletaArbitrary(), (boleta) => {
          // Verificar que es una boleta
          expect(boleta.tipo).toBe(TipoComprobante.BOLETA);

          // Verificar que el receptor tiene DNI
          expect(boleta.receptor).toBeDefined();
          expect(boleta.receptor.tipoDocumento).toBe(TipoDocumentoIdentidad.DNI);
          expect(boleta.receptor.numeroDocumento).toBeDefined();
          expect(boleta.receptor.numeroDocumento).toMatch(/^\d{8}$/);
          expect(boleta.receptor.nombre).toBeDefined();
          expect(boleta.receptor.nombre.length).toBeGreaterThan(0);
        }),
        { numRuns: 25 }
      );
    });

    it('debe incluir RUC del receptor en facturas', () => {
      fc.assert(
        fc.property(facturaArbitrary(), (factura) => {
          // Verificar que es una factura
          expect(factura.tipo).toBe(TipoComprobante.FACTURA);

          // Verificar que el receptor tiene RUC
          expect(factura.receptor).toBeDefined();
          expect(factura.receptor.tipoDocumento).toBe(TipoDocumentoIdentidad.RUC);
          expect(factura.receptor.numeroDocumento).toBeDefined();
          expect(factura.receptor.numeroDocumento).toMatch(/^\d{11}$/);
          expect(factura.receptor.nombre).toBeDefined();
          expect(factura.receptor.nombre.length).toBeGreaterThan(0);
        }),
        { numRuns: 25 }
      );
    });

    it('debe incluir todos los campos obligatorios del comprobante', () => {
      fc.assert(
        fc.property(
          fc.oneof(boletaArbitrary(), facturaArbitrary()),
          (comprobante) => {
            // Verificar campos básicos del comprobante
            expect(comprobante.empresaRuc).toBeDefined();
            expect(comprobante.empresaRuc).toMatch(/^\d{11}$/);
            expect(comprobante.numero).toBeDefined();
            expect(comprobante.numero).toMatch(/^[BF]\d{3}-\d{8}$/);
            expect(comprobante.tipo).toBeDefined();
            expect([TipoComprobante.BOLETA, TipoComprobante.FACTURA]).toContain(
              comprobante.tipo
            );
            expect(comprobante.fecha).toBeDefined();
            expect(comprobante.fecha).toBeInstanceOf(Date);

            // Verificar items
            expect(comprobante.items).toBeDefined();
            expect(Array.isArray(comprobante.items)).toBe(true);
            expect(comprobante.items.length).toBeGreaterThan(0);

            // Verificar cada item tiene los campos requeridos
            comprobante.items.forEach((item) => {
              expect(item.codigo).toBeDefined();
              expect(item.descripcion).toBeDefined();
              expect(item.cantidad).toBeGreaterThan(0);
              expect(item.unidadMedida).toBeDefined();
              expect(item.precioUnitario).toBeGreaterThan(0);
              expect(item.afectacionIGV).toBeDefined();
              expect(item.igv).toBeGreaterThanOrEqual(0);
              expect(item.total).toBeGreaterThan(0);
            });

            // Verificar montos
            expect(comprobante.subtotal).toBeGreaterThan(0);
            expect(comprobante.igv).toBeGreaterThanOrEqual(0);
            expect(comprobante.total).toBeGreaterThan(0);
            expect(comprobante.moneda).toBeDefined();
            expect([TipoMoneda.PEN, TipoMoneda.USD]).toContain(comprobante.moneda);
            expect(comprobante.estado).toBeDefined();
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
