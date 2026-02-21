/**
 * Pruebas unitarias para DataValidator
 */

import { DataValidator } from '../../validators/DataValidator';
import { TipoComprobante, TipoMoneda } from '../../types/enums';
import { DatosComprobante, ItemComprobante } from '../../types';

describe('DataValidator', () => {
  let validator: DataValidator;

  beforeEach(() => {
    validator = new DataValidator();
  });

  describe('validarRUC', () => {
    it('debe validar un RUC correcto', () => {
      const resultado = validator.validarRUC('20123456789');
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe rechazar un RUC con menos de 11 dígitos', () => {
      const resultado = validator.validarRUC('2012345678');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El RUC debe tener exactamente 11 dígitos numéricos'
      );
    });

    it('debe rechazar un RUC con más de 11 dígitos', () => {
      const resultado = validator.validarRUC('201234567890');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El RUC debe tener exactamente 11 dígitos numéricos'
      );
    });

    it('debe rechazar un RUC con caracteres no numéricos', () => {
      const resultado = validator.validarRUC('2012345678A');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El RUC debe tener exactamente 11 dígitos numéricos'
      );
    });

    it('debe rechazar un RUC vacío', () => {
      const resultado = validator.validarRUC('');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El RUC es obligatorio');
    });
  });

  describe('validarDNI', () => {
    it('debe validar un DNI correcto', () => {
      const resultado = validator.validarDNI('12345678');
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe rechazar un DNI con menos de 8 dígitos', () => {
      const resultado = validator.validarDNI('1234567');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El DNI debe tener exactamente 8 dígitos numéricos'
      );
    });

    it('debe rechazar un DNI con más de 8 dígitos', () => {
      const resultado = validator.validarDNI('123456789');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El DNI debe tener exactamente 8 dígitos numéricos'
      );
    });

    it('debe rechazar un DNI con caracteres no numéricos', () => {
      const resultado = validator.validarDNI('1234567A');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El DNI debe tener exactamente 8 dígitos numéricos'
      );
    });

    it('debe rechazar un DNI vacío', () => {
      const resultado = validator.validarDNI('');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El DNI es obligatorio');
    });
  });

  describe('validarMontos', () => {
    it('debe validar montos correctos', () => {
      const resultado = validator.validarMontos({
        subtotal: 100.5,
        igv: 18.09,
        total: 118.59,
      });
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe rechazar subtotal cero o negativo', () => {
      const resultado = validator.validarMontos({
        subtotal: 0,
        igv: 0,
        total: 0,
      });
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El subtotal debe ser mayor a cero');
    });

    it('debe rechazar total cero o negativo', () => {
      const resultado = validator.validarMontos({
        subtotal: 100,
        igv: 18,
        total: -118,
      });
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El total debe ser mayor a cero');
    });

    it('debe rechazar IGV negativo', () => {
      const resultado = validator.validarMontos({
        subtotal: 100,
        igv: -18,
        total: 82,
      });
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El IGV no puede ser negativo');
    });

    it('debe rechazar montos con más de 2 decimales', () => {
      const resultado = validator.validarMontos({
        subtotal: 100.123,
        igv: 18.09,
        total: 118.213,
      });
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El subtotal debe tener máximo 2 decimales'
      );
      expect(resultado.errores).toContain(
        'El total debe tener máximo 2 decimales'
      );
    });

    it('debe aceptar IGV cero', () => {
      const resultado = validator.validarMontos({
        subtotal: 100,
        igv: 0,
        total: 100,
      });
      expect(resultado.valido).toBe(true);
    });
  });

  describe('validarMoneda', () => {
    it('debe validar PEN', () => {
      const resultado = validator.validarMoneda('PEN');
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe validar USD', () => {
      const resultado = validator.validarMoneda('USD');
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe rechazar moneda inválida', () => {
      const resultado = validator.validarMoneda('EUR');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('La moneda debe ser PEN o USD');
    });

    it('debe rechazar moneda vacía', () => {
      const resultado = validator.validarMoneda('');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('La moneda es obligatoria');
    });
  });

  describe('validarCatalogo', () => {
    it('debe validar código de tipo de documento (catálogo 01)', () => {
      const resultado = validator.validarCatalogo('01', '01');
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe validar código de tipo de identidad (catálogo 06)', () => {
      const resultado = validator.validarCatalogo('1', '06');
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe validar código de afectación IGV (catálogo 07)', () => {
      const resultado = validator.validarCatalogo('10', '07');
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe rechazar código inválido', () => {
      const resultado = validator.validarCatalogo('99', '01');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El código 99 no es válido para el catálogo 01'
      );
    });

    it('debe rechazar catálogo inexistente', () => {
      const resultado = validator.validarCatalogo('01', '99');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El catálogo 99 no existe');
    });

    it('debe rechazar código vacío', () => {
      const resultado = validator.validarCatalogo('', '01');
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El código es obligatorio');
    });
  });

  describe('validarComprobante', () => {
    const itemValido: ItemComprobante = {
      codigo: 'PROD001',
      descripcion: 'Producto de prueba',
      cantidad: 1,
      unidadMedida: 'NIU',
      precioUnitario: 100,
      afectacionIGV: '10',
      igv: 18,
      total: 118,
    };

    const datosValidos: DatosComprobante = {
      tipo: TipoComprobante.BOLETA,
      receptor: {
        tipoDocumento: '1',
        numeroDocumento: '12345678',
        nombre: 'Juan Pérez',
      },
      items: [itemValido],
      moneda: TipoMoneda.PEN,
    };

    it('debe validar un comprobante completo y válido', () => {
      const resultado = validator.validarComprobante(datosValidos);
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe rechazar comprobante sin receptor', () => {
      const datos = { ...datosValidos, receptor: undefined as any };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('El receptor es obligatorio');
    });

    it('debe rechazar comprobante sin items', () => {
      const datos = { ...datosValidos, items: [] };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain('Debe incluir al menos un item');
    });

    it('debe validar DNI del receptor en boletas', () => {
      const datos = {
        ...datosValidos,
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '1234567', // DNI inválido
          nombre: 'Juan Pérez',
        },
      };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El DNI debe tener exactamente 8 dígitos numéricos'
      );
    });

    it('debe validar RUC del receptor en facturas', () => {
      const datos: DatosComprobante = {
        tipo: TipoComprobante.FACTURA,
        receptor: {
          tipoDocumento: '6',
          numeroDocumento: '2012345678', // RUC inválido
          nombre: 'Empresa SAC',
        },
        items: [itemValido],
        moneda: TipoMoneda.PEN,
      };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El RUC debe tener exactamente 11 dígitos numéricos'
      );
    });

    it('debe validar items con cantidad inválida', () => {
      const itemInvalido = { ...itemValido, cantidad: 0 };
      const datos = { ...datosValidos, items: [itemInvalido] };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'Item 1: La cantidad debe ser mayor a cero'
      );
    });

    it('debe validar items con precio unitario inválido', () => {
      const itemInvalido = { ...itemValido, precioUnitario: -10 };
      const datos = { ...datosValidos, items: [itemInvalido] };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'Item 1: El precio unitario debe ser mayor a cero'
      );
    });

    it('debe validar items con afectación IGV inválida', () => {
      const itemInvalido = { ...itemValido, afectacionIGV: '99' };
      const datos = { ...datosValidos, items: [itemInvalido] };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.some((e) => e.includes('Item 1:'))).toBe(true);
    });

    it('debe validar múltiples items con errores', () => {
      const item1 = { ...itemValido, cantidad: 0 };
      const item2 = { ...itemValido, precioUnitario: -5 };
      const datos = { ...datosValidos, items: [item1, item2] };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(1);
    });

    it('debe rechazar receptor sin nombre', () => {
      const datos = {
        ...datosValidos,
        receptor: {
          ...datosValidos.receptor,
          nombre: '',
        },
      };
      const resultado = validator.validarComprobante(datos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain(
        'El nombre del receptor es obligatorio'
      );
    });
  });
});
