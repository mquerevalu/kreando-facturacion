/**
 * Pruebas basadas en propiedades para DataValidator
 * 
 * Feature: sunat
 * 
 * Estas pruebas validan propiedades universales del validador usando fast-check
 * para generar múltiples casos de prueba aleatorios.
 */

import * as fc from 'fast-check';
import { DataValidator } from '../../validators/DataValidator';
import { TipoMoneda, TipoComprobante } from '../../types/enums';
import { DatosComprobante } from '../../types/comprobante';
import { catalogos } from '../../validators/catalogos';

describe('DataValidator - Property-Based Tests', () => {
  let validator: DataValidator;

  beforeEach(() => {
    validator = new DataValidator();
  });

  /**
   * **Propiedad 12: Validación de documentos de identidad**
   * **Valida: Requisitos 4.1, 4.2, 4.3**
   * 
   * Para cualquier documento de identidad (RUC o DNI), el sistema debe validar
   * que tenga el formato correcto: 11 dígitos para RUC, 8 dígitos para DNI,
   * todos numéricos.
   */
  describe('Propiedad 12: Validación de documentos de identidad', () => {
    it('debe aceptar cualquier RUC de 11 dígitos numéricos', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10000000000, max: 99999999999 }),
          (rucNumber) => {
            const ruc = rucNumber.toString();
            const resultado = validator.validarRUC(ruc);
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier RUC que no tenga exactamente 11 dígitos', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // RUC con menos de 11 dígitos
            fc.integer({ min: 0, max: 9999999999 }).map(n => n.toString()),
            // RUC con más de 11 dígitos
            fc.integer({ min: 100000000000, max: 999999999999 }).map(n => n.toString())
          ),
          (ruc) => {
            const resultado = validator.validarRUC(ruc);
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier RUC con caracteres no numéricos', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 11, maxLength: 11 }).filter(s => !/^\d{11}$/.test(s)),
          (ruc) => {
            const resultado = validator.validarRUC(ruc);
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe aceptar cualquier DNI de 8 dígitos numéricos', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10000000, max: 99999999 }),
          (dniNumber) => {
            const dni = dniNumber.toString();
            const resultado = validator.validarDNI(dni);
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier DNI que no tenga exactamente 8 dígitos', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // DNI con menos de 8 dígitos
            fc.integer({ min: 0, max: 9999999 }).map(n => n.toString()),
            // DNI con más de 8 dígitos
            fc.integer({ min: 100000000, max: 999999999 }).map(n => n.toString())
          ),
          (dni) => {
            const resultado = validator.validarDNI(dni);
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier DNI con caracteres no numéricos', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 8 }).filter(s => !/^\d{8}$/.test(s)),
          (dni) => {
            const resultado = validator.validarDNI(dni);
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 13: Validación de montos positivos**
   * **Valida: Requisitos 4.4**
   * 
   * Para cualquier monto en un comprobante (subtotal, IGV, total, precio unitario),
   * debe ser mayor a cero y tener máximo 2 decimales.
   */
  describe('Propiedad 13: Validación de montos positivos', () => {
    it('debe aceptar cualquier monto positivo con máximo 2 decimales', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: 0, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          (subtotal, igv, total) => {
            const resultado = validator.validarMontos({ subtotal, igv, total });
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier subtotal cero o negativo', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -999999, max: 0, noNaN: true }),
          fc.double({ min: 0, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          (subtotal, igv, total) => {
            const resultado = validator.validarMontos({ subtotal, igv, total });
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.some(e => e.includes('subtotal'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier total cero o negativo', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: 0, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: -999999, max: 0, noNaN: true }),
          (subtotal, igv, total) => {
            const resultado = validator.validarMontos({ subtotal, igv, total });
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.some(e => e.includes('total'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier IGV negativo', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: -999999, max: -0.01, noNaN: true }),
          fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          (subtotal, igv, total) => {
            const resultado = validator.validarMontos({ subtotal, igv, total });
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.some(e => e.includes('IGV'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier monto con más de 2 decimales', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.001, max: 999999.999, noNaN: true })
            .filter(n => {
              const decimales = (n.toString().split('.')[1] || '').length;
              return decimales > 2;
            }),
          (monto) => {
            const resultado = validator.validarMontos({
              subtotal: monto,
              igv: 0,
              total: monto,
            });
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.some(e => e.includes('decimales'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe aceptar IGV cero para cualquier monto válido', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 999999.99, noNaN: true }).map(n => Math.round(n * 100) / 100),
          (monto) => {
            const resultado = validator.validarMontos({
              subtotal: monto,
              igv: 0,
              total: monto,
            });
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 14: Validación de moneda**
   * **Valida: Requisitos 4.5**
   * 
   * Para cualquier comprobante, la moneda debe ser exactamente "PEN" o "USD",
   * rechazando cualquier otro valor.
   */
  describe('Propiedad 14: Validación de moneda', () => {
    it('debe aceptar siempre PEN y USD', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          (moneda) => {
            const resultado = validator.validarMoneda(moneda);
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier moneda que no sea PEN o USD', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 })
            .filter(s => s !== TipoMoneda.PEN && s !== TipoMoneda.USD),
          (moneda) => {
            const resultado = validator.validarMoneda(moneda);
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar moneda vacía', () => {
      const resultado = validator.validarMoneda('');
      
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('La moneda es obligatoria');
    });
  });

  /**
   * **Propiedad 15: Validación contra catálogos oficiales**
   * **Valida: Requisitos 4.6, 9.1, 9.2, 9.3, 9.4**
   * 
   * Para cualquier código usado en el comprobante (tipo de documento, tributo,
   * documento de identidad, afectación IGV), debe existir en el catálogo oficial
   * de SUNAT correspondiente.
   */
  describe('Propiedad 15: Validación contra catálogos oficiales', () => {
    it('debe aceptar cualquier código válido del catálogo 01 (Tipos de Documentos)', () => {
      const codigosValidos = Object.keys(catalogos['01']);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...codigosValidos),
          (codigo) => {
            const resultado = validator.validarCatalogo(codigo, '01');
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe aceptar cualquier código válido del catálogo 05 (Tipos de Tributos)', () => {
      const codigosValidos = Object.keys(catalogos['05']);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...codigosValidos),
          (codigo) => {
            const resultado = validator.validarCatalogo(codigo, '05');
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe aceptar cualquier código válido del catálogo 06 (Tipos de Documentos de Identidad)', () => {
      const codigosValidos = Object.keys(catalogos['06']);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...codigosValidos),
          (codigo) => {
            const resultado = validator.validarCatalogo(codigo, '06');
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe aceptar cualquier código válido del catálogo 07 (Códigos de Afectación del IGV)', () => {
      const codigosValidos = Object.keys(catalogos['07']);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...codigosValidos),
          (codigo) => {
            const resultado = validator.validarCatalogo(codigo, '07');
            
            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier código inválido para catálogo 01', () => {
      const codigosValidos = Object.keys(catalogos['01']);
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 5 })
            .filter(s => !codigosValidos.includes(s)),
          (codigo) => {
            const resultado = validator.validarCatalogo(codigo, '01');
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier código inválido para catálogo 06', () => {
      const codigosValidos = Object.keys(catalogos['06']);
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 5 })
            .filter(s => !codigosValidos.includes(s)),
          (codigo) => {
            const resultado = validator.validarCatalogo(codigo, '06');
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier código inválido para catálogo 07', () => {
      const codigosValidos = Object.keys(catalogos['07']);
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 5 })
            .filter(s => !codigosValidos.includes(s)),
          (codigo) => {
            const resultado = validator.validarCatalogo(codigo, '07');
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier catálogo inexistente', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 5 })
            .filter(s => !['01', '05', '06', '07'].includes(s)),
          fc.string({ minLength: 1, maxLength: 5 }),
          (catalogo, codigo) => {
            const resultado = validator.validarCatalogo(codigo, catalogo);
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores.some(e => e.includes('no existe'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar código vacío para cualquier catálogo válido', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '05', '06', '07'),
          (catalogo) => {
            const resultado = validator.validarCatalogo('', catalogo);
            
            expect(resultado.valido).toBe(false);
            expect(resultado.errores).toContain('El código es obligatorio');
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 2: Validación de campos obligatorios**
   * **Valida: Requisitos 1.3, 4.7**
   * 
   * Para cualquier intento de generación de comprobante con campos obligatorios
   * faltantes, el sistema debe rechazar la operación y retornar un mensaje de
   * error descriptivo.
   */
  describe('Propiedad 2: Validación de campos obligatorios', () => {
    it('debe rechazar cualquier comprobante sin receptor y retornar mensaje descriptivo', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'), // Tipos de comprobante válidos
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.array(
            fc.record({
              codigo: fc.string({ minLength: 1, maxLength: 10 }),
              descripcion: fc.string({ minLength: 1, maxLength: 100 }),
              cantidad: fc.double({ min: 0.01, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              unidadMedida: fc.constantFrom('NIU', 'ZZ'),
              precioUnitario: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              afectacionIGV: fc.constantFrom('10', '20', '30'),
              igv: fc.double({ min: 0, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              total: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (tipo, moneda, items) => {
            const datos: any = {
              tipo,
              receptor: undefined, // Campo obligatorio faltante
              items,
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.toLowerCase().includes('receptor'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('obligatorio'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier comprobante sin items y retornar mensaje descriptivo', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.record({
            tipoDocumento: fc.constantFrom('1', '6'),
            numeroDocumento: fc.oneof(
              fc.integer({ min: 10000000, max: 99999999 }).map(n => n.toString()),
              fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString())
            ),
            nombre: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          (tipo, moneda, receptor) => {
            const datos: DatosComprobante = {
              tipo: tipo as TipoComprobante,
              receptor,
              items: [], // Campo obligatorio vacío
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.toLowerCase().includes('item'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('al menos'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier receptor sin tipo de documento y retornar mensaje descriptivo', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.array(
            fc.record({
              codigo: fc.string({ minLength: 1, maxLength: 10 }),
              descripcion: fc.string({ minLength: 1, maxLength: 100 }),
              cantidad: fc.double({ min: 0.01, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              unidadMedida: fc.constantFrom('NIU', 'ZZ'),
              precioUnitario: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              afectacionIGV: fc.constantFrom('10', '20', '30'),
              igv: fc.double({ min: 0, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              total: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (tipo, moneda, nombre, items) => {
            const datos: DatosComprobante = {
              tipo: tipo as TipoComprobante,
              receptor: {
                tipoDocumento: '', // Campo obligatorio vacío
                numeroDocumento: '12345678',
                nombre,
              },
              items,
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.toLowerCase().includes('código'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('obligatorio'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier receptor sin número de documento y retornar mensaje descriptivo', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.constantFrom('1', '6'),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.array(
            fc.record({
              codigo: fc.string({ minLength: 1, maxLength: 10 }),
              descripcion: fc.string({ minLength: 1, maxLength: 100 }),
              cantidad: fc.double({ min: 0.01, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              unidadMedida: fc.constantFrom('NIU', 'ZZ'),
              precioUnitario: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              afectacionIGV: fc.constantFrom('10', '20', '30'),
              igv: fc.double({ min: 0, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              total: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (tipo, moneda, tipoDocumento, nombre, items) => {
            const datos: DatosComprobante = {
              tipo: tipo as TipoComprobante,
              receptor: {
                tipoDocumento,
                numeroDocumento: '', // Campo obligatorio vacío
                nombre,
              },
              items,
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            // Debe mencionar DNI o RUC según el tipo de documento
            const mencionaDocumento = resultado.errores.some(e => 
              e.toLowerCase().includes('dni') || e.toLowerCase().includes('ruc')
            );
            expect(mencionaDocumento).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('obligatorio'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier receptor sin nombre y retornar mensaje descriptivo', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.record({
            tipoDocumento: fc.constantFrom('1', '6'),
            numeroDocumento: fc.oneof(
              fc.integer({ min: 10000000, max: 99999999 }).map(n => n.toString()),
              fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString())
            ),
          }),
          fc.array(
            fc.record({
              codigo: fc.string({ minLength: 1, maxLength: 10 }),
              descripcion: fc.string({ minLength: 1, maxLength: 100 }),
              cantidad: fc.double({ min: 0.01, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              unidadMedida: fc.constantFrom('NIU', 'ZZ'),
              precioUnitario: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              afectacionIGV: fc.constantFrom('10', '20', '30'),
              igv: fc.double({ min: 0, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              total: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (tipo, moneda, receptorBase, items) => {
            const datos: DatosComprobante = {
              tipo: tipo as TipoComprobante,
              receptor: {
                ...receptorBase,
                nombre: '', // Campo obligatorio vacío
              },
              items,
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.toLowerCase().includes('nombre'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('receptor'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('obligatorio'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier comprobante sin moneda y retornar mensaje descriptivo', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.record({
            tipoDocumento: fc.constantFrom('1', '6'),
            numeroDocumento: fc.oneof(
              fc.integer({ min: 10000000, max: 99999999 }).map(n => n.toString()),
              fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString())
            ),
            nombre: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          fc.array(
            fc.record({
              codigo: fc.string({ minLength: 1, maxLength: 10 }),
              descripcion: fc.string({ minLength: 1, maxLength: 100 }),
              cantidad: fc.double({ min: 0.01, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              unidadMedida: fc.constantFrom('NIU', 'ZZ'),
              precioUnitario: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              afectacionIGV: fc.constantFrom('10', '20', '30'),
              igv: fc.double({ min: 0, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              total: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (tipo, receptor, items) => {
            const datos: any = {
              tipo,
              receptor,
              items,
              moneda: '', // Campo obligatorio vacío
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.toLowerCase().includes('moneda'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('obligatori'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier item con cantidad inválida y retornar mensaje descriptivo con número de item', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.record({
            tipoDocumento: fc.constantFrom('1', '6'),
            numeroDocumento: fc.oneof(
              fc.integer({ min: 10000000, max: 99999999 }).map(n => n.toString()),
              fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString())
            ),
            nombre: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          fc.double({ min: -1000, max: 0, noNaN: true }), // Cantidad inválida
          (tipo, moneda, receptor, cantidadInvalida) => {
            const datos: DatosComprobante = {
              tipo: tipo as TipoComprobante,
              receptor,
              items: [
                {
                  codigo: 'PROD001',
                  descripcion: 'Producto de prueba',
                  cantidad: cantidadInvalida, // Cantidad inválida
                  unidadMedida: 'NIU',
                  precioUnitario: 10.50,
                  afectacionIGV: '10',
                  igv: 1.89,
                  total: 12.39,
                },
              ],
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.includes('Item 1'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('cantidad'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier item con precio unitario inválido y retornar mensaje descriptivo con número de item', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.record({
            tipoDocumento: fc.constantFrom('1', '6'),
            numeroDocumento: fc.oneof(
              fc.integer({ min: 10000000, max: 99999999 }).map(n => n.toString()),
              fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString())
            ),
            nombre: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          fc.double({ min: -1000, max: 0, noNaN: true }), // Precio inválido
          (tipo, moneda, receptor, precioInvalido) => {
            const datos: DatosComprobante = {
              tipo: tipo as TipoComprobante,
              receptor,
              items: [
                {
                  codigo: 'PROD001',
                  descripcion: 'Producto de prueba',
                  cantidad: 2,
                  unidadMedida: 'NIU',
                  precioUnitario: precioInvalido, // Precio inválido
                  afectacionIGV: '10',
                  igv: 0,
                  total: 1,
                },
              ],
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.includes('Item 1'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('precio'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier item con afectación IGV inválida y retornar mensaje descriptivo con número de item', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
          fc.record({
            tipoDocumento: fc.constantFrom('1', '6'),
            numeroDocumento: fc.oneof(
              fc.integer({ min: 10000000, max: 99999999 }).map(n => n.toString()),
              fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString())
            ),
            nombre: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          fc.string({ minLength: 1, maxLength: 5 })
            .filter(s => !Object.keys(catalogos['07']).includes(s)), // Código inválido
          (tipo, moneda, receptor, codigoInvalido) => {
            const datos: DatosComprobante = {
              tipo: tipo as TipoComprobante,
              receptor,
              items: [
                {
                  codigo: 'PROD001',
                  descripcion: 'Producto de prueba',
                  cantidad: 2,
                  unidadMedida: 'NIU',
                  precioUnitario: 10.50,
                  afectacionIGV: codigoInvalido, // Código inválido
                  igv: 1.89,
                  total: 12.39,
                },
              ],
              moneda,
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.includes('Item 1'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe retornar múltiples mensajes de error descriptivos cuando faltan varios campos obligatorios', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('01', '03'),
          (tipo) => {
            const datos: any = {
              tipo,
              receptor: undefined, // Falta receptor
              items: [], // Falta items
              moneda: '', // Falta moneda
            };

            const resultado = validator.validarComprobante(datos);

            expect(resultado.valido).toBe(false);
            // Debe haber al menos 3 errores (receptor, items, moneda)
            expect(resultado.errores.length).toBeGreaterThanOrEqual(3);
            
            // Verificar que cada error sea descriptivo
            expect(resultado.errores.some(e => e.toLowerCase().includes('receptor'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('item'))).toBe(true);
            expect(resultado.errores.some(e => e.toLowerCase().includes('moneda'))).toBe(true);
            
            // Todos los errores deben mencionar que algo es obligatorio o debe cumplir algo
            const todosDescriptivos = resultado.errores.every(e => 
              e.toLowerCase().includes('obligatori') || // Cubre obligatorio/obligatoria
              e.toLowerCase().includes('al menos') ||
              e.toLowerCase().includes('debe')
            );
            expect(todosDescriptivos).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
