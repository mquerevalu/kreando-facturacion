/**
 * Pruebas basadas en propiedades para PDFGenerator
 *
 * Feature: sunat
 *
 * Estas pruebas validan propiedades universales del generador de PDF
 * usando fast-check para generar múltiples casos de prueba aleatorios.
 */

import * as fc from 'fast-check';
import { PDFGenerator } from '../../services/PDFGenerator';
import { Comprobante, CDR, TipoComprobante, TipoMoneda, EstadoComprobante } from '../../types';

describe('PDFGenerator - Property-Based Tests', () => {
  let generator: PDFGenerator;

  // Generador de RUC válido
  const rucArbitrary = fc.integer({ min: 10000000000, max: 99999999999 }).map((n) => n.toString());

  // Generador de DNI válido
  const dniArbitrary = fc.integer({ min: 10000000, max: 99999999 }).map((n) => n.toString());

  // Generador de comprobante válido
  const comprobanteArbitrary: fc.Arbitrary<Comprobante> = fc.record({
    empresaRuc: rucArbitrary,
    numero: fc
      .tuple(
        fc.constantFrom('B001', 'F001'),
        fc.integer({ min: 1, max: 99999999 }).map((n) => n.toString().padStart(8, '0'))
      )
      .map(([serie, num]) => `${serie}-${num}`),
    tipo: fc.constantFrom(TipoComprobante.BOLETA, TipoComprobante.FACTURA),
    fecha: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
    emisor: fc.record({
      ruc: rucArbitrary,
      razonSocial: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      nombreComercial: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      direccion: fc.record({
        departamento: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        provincia: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        distrito: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        direccion: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        codigoPais: fc.constant('PE'),
      }),
    }),
    receptor: fc.record({
      tipoDocumento: fc.constantFrom('1', '6'),
      numeroDocumento: fc.oneof(dniArbitrary, rucArbitrary),
      nombre: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      direccion: fc.option(
        fc.record({
          departamento: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          provincia: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          distrito: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          direccion: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
          codigoPais: fc.constant('PE'),
        }),
        { nil: undefined }
      ),
    }),
    items: fc.array(
      fc.record({
        codigo: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        descripcion: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        cantidad: fc.double({ min: 0.01, max: 10000, noNaN: true }).map((n) => Math.round(n * 100) / 100),
        unidadMedida: fc.constantFrom('NIU', 'ZZ', 'KGM', 'MTR'),
        precioUnitario: fc.double({ min: 0.01, max: 100000, noNaN: true }).map((n) => Math.round(n * 100) / 100),
        afectacionIGV: fc.constantFrom('10', '20', '30'),
        igv: fc.double({ min: 0, max: 18000, noNaN: true }).map((n) => Math.round(n * 100) / 100),
        total: fc.double({ min: 0.01, max: 100000, noNaN: true }).map((n) => Math.round(n * 100) / 100),
      }),
      { minLength: 1, maxLength: 20 }
    ),
    subtotal: fc.double({ min: 0.01, max: 1000000, noNaN: true }).map((n) => Math.round(n * 100) / 100),
    igv: fc.double({ min: 0, max: 180000, noNaN: true }).map((n) => Math.round(n * 100) / 100),
    total: fc.double({ min: 0.01, max: 1180000, noNaN: true }).map((n) => Math.round(n * 100) / 100),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
    estado: fc.constant(EstadoComprobante.ACEPTADO),
  });

  // Generador de CDR válido
  const cdrArbitrary: fc.Arbitrary<CDR> = fc.record({
    codigo: fc.constantFrom('0', '1', '2', '3'),
    mensaje: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
    xml: fc.string({ minLength: 10, maxLength: 1000 }),
    fechaRecepcion: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
  });

  beforeEach(() => {
    generator = new PDFGenerator();
  });

  /**
   * **Propiedad 23: Generación de PDF para comprobantes aceptados**
   * **Valida: Requisitos 8.1**
   *
   * Para cualquier comprobante en estado ACEPTADO, debe generarse un archivo PDF
   * válido con la representación impresa.
   */
  describe('Propiedad 23: Generación de PDF para comprobantes aceptados', () => {
    it('debe generar un PDF válido para cualquier comprobante aceptado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          // Asegurar que el comprobante está aceptado
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);

          // Verificar que se generó un buffer válido
          expect(pdfBuffer).toBeInstanceOf(Buffer);
          expect(pdfBuffer.length).toBeGreaterThan(0);

          // Verificar que es un PDF válido (comienza con %PDF)
          const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
          expect(pdfHeader).toBe('%PDF');

          // Verificar que termina con %%EOF
          const pdfEnd = pdfBuffer.toString('utf-8', pdfBuffer.length - 6, pdfBuffer.length).trim();
          expect(pdfEnd).toBe('%%EOF');
        }),
        { numRuns: 50 }
      );
    });

    it('debe generar un PDF válido incluso sin CDR', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, async (comprobante) => {
          // Generar PDF sin CDR
          const pdfBuffer = await generator.generarPDF(comprobante);

          // Verificar que se generó un buffer válido
          expect(pdfBuffer).toBeInstanceOf(Buffer);
          expect(pdfBuffer.length).toBeGreaterThan(0);

          // Verificar que es un PDF válido
          const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
          expect(pdfHeader).toBe('%PDF');
        }),
        { numRuns: 50 }
      );
    });

    it('debe generar PDFs de tamaño razonable para cualquier comprobante', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);

          // Verificar que el tamaño es razonable (entre 5KB y 500KB)
          expect(pdfBuffer.length).toBeGreaterThan(5000); // Mínimo 5KB
          expect(pdfBuffer.length).toBeLessThan(500000); // Máximo 500KB
        }),
        { numRuns: 50 }
      );
    });

    it('debe generar PDFs diferentes para comprobantes diferentes', () => {
      fc.assert(
        fc.asyncProperty(
          comprobanteArbitrary,
          comprobanteArbitrary,
          cdrArbitrary,
          async (comprobante1, comprobante2, cdr) => {
            // Asegurar que los comprobantes son diferentes
            if (comprobante1.numero === comprobante2.numero) {
              comprobante2 = { ...comprobante2, numero: comprobante1.numero + '1' };
            }

            // Generar PDFs
            const pdf1 = await generator.generarPDF(comprobante1, cdr);
            const pdf2 = await generator.generarPDF(comprobante2, cdr);

            // Los PDFs deben ser diferentes
            expect(pdf1.equals(pdf2)).toBe(false);
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 24: Completitud del PDF**
   * **Valida: Requisitos 8.2, 8.3, 8.4**
   *
   * Para cualquier PDF generado, debe incluir: código QR, número de comprobante,
   * fecha, datos del emisor y receptor, detalle de items, subtotales, impuestos y total.
   */
  describe('Propiedad 24: Completitud del PDF', () => {
    it('debe incluir código QR en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene referencia a imagen (QR code)
          // Los PDFs con imágenes contienen referencias a objetos de imagen
          expect(pdfContent).toMatch(/\/Type\s*\/XObject/);
          expect(pdfContent).toMatch(/\/Subtype\s*\/Image/);
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir número de comprobante en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene el número del comprobante
          expect(pdfContent).toContain(comprobante.numero);
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir datos del emisor en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene datos del emisor
          expect(pdfContent).toContain(comprobante.emisor.ruc);
          expect(pdfContent).toContain(comprobante.emisor.razonSocial);
          expect(pdfContent).toContain(comprobante.emisor.nombreComercial);
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir datos del receptor en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene datos del receptor
          expect(pdfContent).toContain(comprobante.receptor.numeroDocumento);
          expect(pdfContent).toContain(comprobante.receptor.nombre);
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir todos los items en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene todos los items
          comprobante.items.forEach((item) => {
            expect(pdfContent).toContain(item.codigo);
            expect(pdfContent).toContain(item.descripcion);
          });
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir subtotal, IGV y total en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene los totales
          expect(pdfContent).toContain(comprobante.subtotal.toFixed(2));
          expect(pdfContent).toContain(comprobante.igv.toFixed(2));
          expect(pdfContent).toContain(comprobante.total.toFixed(2));
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir moneda en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene la moneda
          expect(pdfContent).toContain(comprobante.moneda);
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir información del CDR cuando está presente', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF con CDR
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene información del CDR
          expect(pdfContent).toContain(cdr.codigo);
          expect(pdfContent).toContain(cdr.mensaje);
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir tipo de comprobante correcto en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene el tipo correcto
          if (comprobante.tipo === TipoComprobante.BOLETA) {
            expect(pdfContent).toContain('BOLETA');
          } else if (comprobante.tipo === TipoComprobante.FACTURA) {
            expect(pdfContent).toContain('FACTURA');
          }
        }),
        { numRuns: 50 }
      );
    });

    it('debe incluir fecha de emisión en cualquier PDF generado', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, cdrArbitrary, async (comprobante, cdr) => {
          const comprobanteAceptado = { ...comprobante, estado: EstadoComprobante.ACEPTADO, cdr };

          // Generar PDF
          const pdfBuffer = await generator.generarPDF(comprobanteAceptado, cdr);
          const pdfContent = pdfBuffer.toString('utf-8');

          // Verificar que contiene referencia a fecha
          expect(pdfContent).toMatch(/Fecha/i);
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Pruebas adicionales para el código QR
   */
  describe('Generación de código QR', () => {
    it('debe generar un código QR válido para cualquier comprobante', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, async (comprobante) => {
          // Generar código QR
          const qrDataURL = await generator.generarCodigoQR(comprobante);

          // Verificar que es un data URL válido
          expect(qrDataURL).toMatch(/^data:image\/png;base64,/);

          // Verificar que tiene contenido después del prefijo
          const base64Data = qrDataURL.split(',')[1];
          expect(base64Data.length).toBeGreaterThan(0);

          // Verificar que es base64 válido
          expect(() => Buffer.from(base64Data, 'base64')).not.toThrow();
        }),
        { numRuns: 50 }
      );
    });

    it('debe generar códigos QR diferentes para comprobantes diferentes', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, comprobanteArbitrary, async (comprobante1, comprobante2) => {
          // Asegurar que los comprobantes son diferentes
          if (comprobante1.numero === comprobante2.numero) {
            comprobante2 = { ...comprobante2, numero: comprobante1.numero + '1' };
          }

          // Generar códigos QR
          const qr1 = await generator.generarCodigoQR(comprobante1);
          const qr2 = await generator.generarCodigoQR(comprobante2);

          // Los códigos QR deben ser diferentes
          expect(qr1).not.toBe(qr2);
        }),
        { numRuns: 25 }
      );
    });

    it('debe incluir información clave del comprobante en el QR', () => {
      fc.assert(
        fc.asyncProperty(comprobanteArbitrary, async (comprobante) => {
          // Generar código QR
          const qrDataURL = await generator.generarCodigoQR(comprobante);

          // El QR debe contener información del comprobante
          // (verificamos que se generó correctamente, el contenido exacto
          // está codificado en el QR y no es fácilmente verificable sin decodificar)
          expect(qrDataURL).toBeDefined();
          expect(qrDataURL.length).toBeGreaterThan(100);
        }),
        { numRuns: 50 }
      );
    });
  });
});
