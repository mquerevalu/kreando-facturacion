import {
  catalogo01,
  catalogo05,
  catalogo06,
  catalogo07,
  catalogos,
  obtenerDescripcionCatalogo,
  existeEnCatalogo,
  recargarCatalogos,
} from '../../validators/catalogos';

describe('Catálogos SUNAT', () => {
  describe('Catálogo 01 - Tipos de Documentos', () => {
    it('debe contener los códigos principales de documentos', () => {
      expect(catalogo01['01']).toBe('Factura');
      expect(catalogo01['03']).toBe('Boleta de Venta');
      expect(catalogo01['07']).toBe('Nota de Crédito');
      expect(catalogo01['08']).toBe('Nota de Débito');
    });

    it('debe tener al menos 10 tipos de documentos', () => {
      expect(Object.keys(catalogo01).length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Catálogo 05 - Tipos de Tributos', () => {
    it('debe contener los tributos principales', () => {
      expect(catalogo05['1000']).toBe('IGV - Impuesto General a las Ventas');
      expect(catalogo05['2000']).toBe('ISC - Impuesto Selectivo al Consumo');
      expect(catalogo05['7152']).toBe('ICBPER - Impuesto al Consumo de las Bolsas de Plástico');
    });

    it('debe contener códigos de exoneración', () => {
      expect(catalogo05['9997']).toBe('EXO - Exonerado');
      expect(catalogo05['9998']).toBe('INA - Inafecto');
      expect(catalogo05['9996']).toBe('GRA - Gratuito');
    });

    it('debe tener al menos 8 tipos de tributos', () => {
      expect(Object.keys(catalogo05).length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Catálogo 06 - Tipos de Documentos de Identidad', () => {
    it('debe contener los documentos de identidad principales', () => {
      expect(catalogo06['1']).toBe('DNI - Documento Nacional de Identidad');
      expect(catalogo06['6']).toBe('RUC - Registro Único de Contribuyentes');
      expect(catalogo06['4']).toBe('Carnet de Extranjería');
      expect(catalogo06['7']).toBe('Pasaporte');
    });

    it('debe tener al menos 8 tipos de documentos de identidad', () => {
      expect(Object.keys(catalogo06).length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Catálogo 07 - Códigos de Afectación del IGV', () => {
    it('debe contener códigos de operaciones gravadas', () => {
      expect(catalogo07['10']).toBe('Gravado - Operación Onerosa');
      expect(catalogo07['11']).toBe('Gravado - Retiro por premio');
      expect(catalogo07['17']).toBe('Gravado - IVAP');
    });

    it('debe contener códigos de operaciones exoneradas', () => {
      expect(catalogo07['20']).toBe('Exonerado - Operación Onerosa');
      expect(catalogo07['21']).toBe('Exonerado - Transferencia Gratuita');
    });

    it('debe contener códigos de operaciones inafectas', () => {
      expect(catalogo07['30']).toBe('Inafecto - Operación Onerosa');
      expect(catalogo07['37']).toBe('Inafecto - Transferencia Gratuita');
    });

    it('debe contener código de exportación', () => {
      expect(catalogo07['40']).toBe('Exportación');
    });

    it('debe tener al menos 15 códigos de afectación', () => {
      expect(Object.keys(catalogo07).length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('obtenerDescripcionCatalogo', () => {
    it('debe retornar la descripción correcta para códigos válidos', () => {
      expect(obtenerDescripcionCatalogo('01', '01')).toBe('Factura');
      expect(obtenerDescripcionCatalogo('01', '03')).toBe('Boleta de Venta');
      expect(obtenerDescripcionCatalogo('05', '1000')).toBe('IGV - Impuesto General a las Ventas');
      expect(obtenerDescripcionCatalogo('06', '1')).toBe('DNI - Documento Nacional de Identidad');
      expect(obtenerDescripcionCatalogo('07', '10')).toBe('Gravado - Operación Onerosa');
    });

    it('debe retornar undefined para códigos inválidos', () => {
      expect(obtenerDescripcionCatalogo('01', '99')).toBeUndefined();
      expect(obtenerDescripcionCatalogo('05', 'INVALID')).toBeUndefined();
      expect(obtenerDescripcionCatalogo('99', '01')).toBeUndefined();
    });

    it('debe retornar undefined para catálogos inexistentes', () => {
      expect(obtenerDescripcionCatalogo('99', '01')).toBeUndefined();
    });
  });

  describe('existeEnCatalogo', () => {
    it('debe retornar true para códigos válidos', () => {
      expect(existeEnCatalogo('01', '01')).toBe(true);
      expect(existeEnCatalogo('01', '03')).toBe(true);
      expect(existeEnCatalogo('05', '1000')).toBe(true);
      expect(existeEnCatalogo('06', '1')).toBe(true);
      expect(existeEnCatalogo('06', '6')).toBe(true);
      expect(existeEnCatalogo('07', '10')).toBe(true);
      expect(existeEnCatalogo('07', '40')).toBe(true);
    });

    it('debe retornar false para códigos inválidos', () => {
      expect(existeEnCatalogo('01', '99')).toBe(false);
      expect(existeEnCatalogo('05', 'INVALID')).toBe(false);
      expect(existeEnCatalogo('06', '99')).toBe(false);
      expect(existeEnCatalogo('07', '99')).toBe(false);
    });

    it('debe retornar false para catálogos inexistentes', () => {
      expect(existeEnCatalogo('99', '01')).toBe(false);
    });
  });

  describe('Estructura de catálogos', () => {
    it('debe tener los 4 catálogos requeridos', () => {
      expect(catalogos).toHaveProperty('01');
      expect(catalogos).toHaveProperty('05');
      expect(catalogos).toHaveProperty('06');
      expect(catalogos).toHaveProperty('07');
    });

    it('todos los catálogos deben ser objetos', () => {
      expect(typeof catalogos['01']).toBe('object');
      expect(typeof catalogos['05']).toBe('object');
      expect(typeof catalogos['06']).toBe('object');
      expect(typeof catalogos['07']).toBe('object');
    });

    it('todos los valores en los catálogos deben ser strings', () => {
      Object.values(catalogo01).forEach((value) => {
        expect(typeof value).toBe('string');
      });
      Object.values(catalogo05).forEach((value) => {
        expect(typeof value).toBe('string');
      });
      Object.values(catalogo06).forEach((value) => {
        expect(typeof value).toBe('string');
      });
      Object.values(catalogo07).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('recargarCatalogos', () => {
    it('debe poder recargar los catálogos sin errores', () => {
      expect(() => recargarCatalogos()).not.toThrow();
    });

    it('debe mantener los catálogos después de recargar', () => {
      const codigoAntes = catalogo01['01'];
      recargarCatalogos();
      expect(catalogo01['01']).toBe(codigoAntes);
    });
  });

  describe('Validación de requisitos SUNAT', () => {
    it('Requisito 9.1: debe usar catálogo 01 (Tipos de Documentos)', () => {
      expect(catalogos['01']).toBeDefined();
      expect(Object.keys(catalogos['01']).length).toBeGreaterThan(0);
    });

    it('Requisito 9.2: debe usar catálogo 05 (Tipos de Tributos)', () => {
      expect(catalogos['05']).toBeDefined();
      expect(Object.keys(catalogos['05']).length).toBeGreaterThan(0);
    });

    it('Requisito 9.3: debe usar catálogo 06 (Tipos de Documentos de Identidad)', () => {
      expect(catalogos['06']).toBeDefined();
      expect(Object.keys(catalogos['06']).length).toBeGreaterThan(0);
    });

    it('Requisito 9.4: debe usar catálogo 07 (Códigos de Afectación del IGV)', () => {
      expect(catalogos['07']).toBeDefined();
      expect(Object.keys(catalogos['07']).length).toBeGreaterThan(0);
    });

    it('Requisito 9.5: debe permitir actualización sin cambios en código fuente', () => {
      // La función recargarCatalogos permite actualizar desde el archivo JSON
      expect(typeof recargarCatalogos).toBe('function');
      
      // Los catálogos se cargan desde un archivo externo (catalogos.json)
      // lo que permite actualizarlos sin modificar el código TypeScript
      expect(() => recargarCatalogos()).not.toThrow();
    });
  });
});
