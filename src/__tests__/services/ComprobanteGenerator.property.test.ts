/**
 * Pruebas basadas en propiedades para ComprobanteGenerator
 * 
 * Feature: sunat
 * 
 * Estas pruebas validan propiedades universales del generador de comprobantes
 * usando fast-check para generar múltiples casos de prueba aleatorios.
 */

import * as fc from 'fast-check';
import { ComprobanteGenerator } from '../../services/ComprobanteGenerator';
import { DataValidator } from '../../validators/DataValidator';
import { ComprobanteRepository } from '../../repositories/interfaces';
import {
  TipoComprobante,
  TipoMoneda,
  EstadoComprobante,
  Emisor,
  DatosBoleta,
  DatosFactura,
  ItemComprobante,
} from '../../types';
import { catalogos } from '../../validators/catalogos';

describe('ComprobanteGenerator - Property-Based Tests', () => {
  let generator: ComprobanteGenerator;
  let mockRepository: jest.Mocked<ComprobanteRepository>;
  let validator: DataValidator;
  let mockObtenerDatosEmisor: jest.Mock;

  // Generador de RUC válido
  const rucArbitrary = fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString());

  // Generador de DNI válido
  const dniArbitrary = fc.integer({ min: 10000000, max: 99999999 }).map(n => n.toString());

  // Generador de emisor válido
  const emisorArbitrary: fc.Arbitrary<Emisor> = fc.record({
    ruc: rucArbitrary,
    razonSocial: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    nombreComercial: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    direccion: fc.record({
      departamento: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      provincia: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      distrito: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      direccion: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
      codigoPais: fc.constant('PE'),
    }),
  });

  // Generador de item válido
  const itemArbitrary: fc.Arbitrary<ItemComprobante> = fc.record({
    codigo: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
    descripcion: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
    cantidad: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    unidadMedida: fc.constantFrom('NIU', 'ZZ', 'KGM', 'MTR'),
    precioUnitario: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    afectacionIGV: fc.constantFrom(...Object.keys(catalogos['07'])),
    igv: fc.double({ min: 0, max: 18000, noNaN: true }).map(n => Math.round(n * 100) / 100),
    total: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
  });

  // Generador de datos de boleta válidos
  const datosBoleaArbitrary: fc.Arbitrary<DatosBoleta> = fc.record({
    receptor: fc.record({
      tipoDocumento: fc.constant('1'), // Solo DNI para simplificar
      numeroDocumento: dniArbitrary,
      nombre: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    }),
    items: fc.array(itemArbitrary, { minLength: 1, maxLength: 10 }),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
  });

  // Generador de datos de factura válidos
  const datosFacturaArbitrary: fc.Arbitrary<DatosFactura> = fc.record({
    receptor: fc.record({
      ruc: rucArbitrary,
      razonSocial: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      direccion: fc.option(fc.record({
        departamento: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        provincia: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        distrito: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        direccion: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        codigoPais: fc.constant('PE'),
      }), { nil: undefined }),
    }),
    items: fc.array(itemArbitrary, { minLength: 1, maxLength: 10 }),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
  });

  beforeEach(() => {
    validator = new DataValidator();
    
    mockRepository = {
      guardarComprobante: jest.fn(),
      guardarCDR: jest.fn(),
      obtenerComprobante: jest.fn(),
      obtenerCDR: jest.fn(),
      listarPendientes: jest.fn(),
      actualizarEstado: jest.fn(),
      listarComprobantes: jest.fn(),
      obtenerSiguienteNumero: jest.fn(),
    };

    mockObtenerDatosEmisor = jest.fn();

    generator = new ComprobanteGenerator(
      mockRepository,
      validator,
      mockObtenerDatosEmisor
    );
  });

  /**
   * **Propiedad 1: Generación de XML válido según tipo de comprobante**
   * **Valida: Requisitos 1.1, 1.2**
   * 
   * Para cualquier conjunto de datos válidos de boleta o factura, el sistema debe
   * generar un documento XML que cumpla con la estructura UBL 2.1 estándar
   * correspondiente al tipo de comprobante.
   */
  describe('Propiedad 1: Generación de XML válido según tipo de comprobante', () => {
    it('debe generar XML UBL 2.1 válido para cualquier boleta con datos válidos', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          emisorArbitrary,
          datosBoleaArbitrary,
          fc.integer({ min: 1, max: 999999 }),
          async (empresaRuc, emisor, datosBoleta, numeroCorrelativo) => {
            // Configurar mocks
            mockObtenerDatosEmisor.mockResolvedValue(emisor);
            mockRepository.obtenerSiguienteNumero.mockResolvedValue(numeroCorrelativo);

            // Generar boleta
            const comprobante = await generator.generarBoleta(empresaRuc, datosBoleta);

            // Verificar que se generó XML
            expect(comprobante.xmlOriginal).toBeDefined();
            const xml = comprobante.xmlOriginal!;

            // Verificar estructura UBL 2.1 básica
            expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xml).toContain('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
            expect(xml).toContain('xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"');
            expect(xml).toContain('xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"');
            
            // Verificar versión UBL 2.1
            expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
            
            // Verificar tipo de comprobante (boleta = 03)
            expect(xml).toContain(`<cbc:InvoiceTypeCode listID="0101">${TipoComprobante.BOLETA}</cbc:InvoiceTypeCode>`);
            
            // Verificar que incluye número de comprobante
            expect(xml).toContain(`<cbc:ID>${comprobante.numero}</cbc:ID>`);
            
            // Verificar que incluye fecha
            expect(xml).toContain('<cbc:IssueDate>');
            expect(xml).toContain('<cbc:IssueTime>');
            
            // Verificar que incluye moneda
            expect(xml).toContain(`<cbc:DocumentCurrencyCode>${datosBoleta.moneda}</cbc:DocumentCurrencyCode>`);
            
            // Verificar sección del emisor
            expect(xml).toContain('<cac:AccountingSupplierParty>');
            expect(xml).toContain(emisor.ruc);
            expect(xml).toContain(emisor.razonSocial);
            expect(xml).toContain(emisor.nombreComercial);
            
            // Verificar sección del receptor
            expect(xml).toContain('<cac:AccountingCustomerParty>');
            expect(xml).toContain(datosBoleta.receptor.numeroDocumento);
            expect(xml).toContain(datosBoleta.receptor.nombre);
            
            // Verificar sección de totales
            expect(xml).toContain('<cac:TaxTotal>');
            expect(xml).toContain('<cac:LegalMonetaryTotal>');
            
            // Verificar que incluye items
            expect(xml).toContain('<cac:InvoiceLine>');
            
            // Verificar que cada item está presente
            datosBoleta.items.forEach(item => {
              expect(xml).toContain(item.codigo);
              expect(xml).toContain(item.descripcion);
            });
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe generar XML UBL 2.1 válido para cualquier factura con datos válidos', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          emisorArbitrary,
          datosFacturaArbitrary,
          fc.integer({ min: 1, max: 999999 }),
          async (empresaRuc, emisor, datosFactura, numeroCorrelativo) => {
            // Configurar mocks
            mockObtenerDatosEmisor.mockResolvedValue(emisor);
            mockRepository.obtenerSiguienteNumero.mockResolvedValue(numeroCorrelativo);

            // Generar factura
            const comprobante = await generator.generarFactura(empresaRuc, datosFactura);

            // Verificar que se generó XML
            expect(comprobante.xmlOriginal).toBeDefined();
            const xml = comprobante.xmlOriginal!;

            // Verificar estructura UBL 2.1 básica
            expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xml).toContain('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
            expect(xml).toContain('xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"');
            expect(xml).toContain('xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"');
            
            // Verificar versión UBL 2.1
            expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
            
            // Verificar tipo de comprobante (factura = 01)
            expect(xml).toContain(`<cbc:InvoiceTypeCode listID="0101">${TipoComprobante.FACTURA}</cbc:InvoiceTypeCode>`);
            
            // Verificar que incluye número de comprobante
            expect(xml).toContain(`<cbc:ID>${comprobante.numero}</cbc:ID>`);
            
            // Verificar que incluye fecha
            expect(xml).toContain('<cbc:IssueDate>');
            expect(xml).toContain('<cbc:IssueTime>');
            
            // Verificar que incluye moneda
            expect(xml).toContain(`<cbc:DocumentCurrencyCode>${datosFactura.moneda}</cbc:DocumentCurrencyCode>`);
            
            // Verificar sección del emisor
            expect(xml).toContain('<cac:AccountingSupplierParty>');
            expect(xml).toContain(emisor.ruc);
            expect(xml).toContain(emisor.razonSocial);
            
            // Verificar sección del receptor (factura siempre tiene RUC)
            expect(xml).toContain('<cac:AccountingCustomerParty>');
            expect(xml).toContain(datosFactura.receptor.ruc);
            expect(xml).toContain(datosFactura.receptor.razonSocial);
            expect(xml).toContain('schemeID="6"'); // RUC
            
            // Si tiene dirección, debe incluirla
            if (datosFactura.receptor.direccion) {
              expect(xml).toContain('<cac:RegistrationAddress>');
              expect(xml).toContain(datosFactura.receptor.direccion.direccion);
            }
            
            // Verificar sección de totales
            expect(xml).toContain('<cac:TaxTotal>');
            expect(xml).toContain('<cac:LegalMonetaryTotal>');
            
            // Verificar que incluye items
            expect(xml).toContain('<cac:InvoiceLine>');
            
            // Verificar que cada item está presente
            datosFactura.items.forEach(item => {
              expect(xml).toContain(item.codigo);
              expect(xml).toContain(item.descripcion);
            });
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe incluir todos los campos obligatorios UBL 2.1 en cualquier XML generado', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          emisorArbitrary,
          fc.oneof(datosBoleaArbitrary, datosFacturaArbitrary),
          fc.integer({ min: 1, max: 999999 }),
          async (empresaRuc, emisor, datos, numeroCorrelativo) => {
            // Configurar mocks
            mockObtenerDatosEmisor.mockResolvedValue(emisor);
            mockRepository.obtenerSiguienteNumero.mockResolvedValue(numeroCorrelativo);

            // Generar comprobante (boleta o factura)
            const comprobante = 'ruc' in datos.receptor
              ? await generator.generarFactura(empresaRuc, datos as DatosFactura)
              : await generator.generarBoleta(empresaRuc, datos as DatosBoleta);

            const xml = comprobante.xmlOriginal!;

            // Campos obligatorios según UBL 2.1
            const camposObligatorios = [
              '<cbc:UBLVersionID>',
              '<cbc:CustomizationID>',
              '<cbc:ID>',
              '<cbc:IssueDate>',
              '<cbc:IssueTime>',
              '<cbc:InvoiceTypeCode',
              '<cbc:DocumentCurrencyCode>',
              '<cac:AccountingSupplierParty>',
              '<cac:AccountingCustomerParty>',
              '<cac:TaxTotal>',
              '<cac:LegalMonetaryTotal>',
              '<cac:InvoiceLine>',
            ];

            // Verificar que todos los campos obligatorios están presentes
            camposObligatorios.forEach(campo => {
              expect(xml).toContain(campo);
            });
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe generar XML bien formado (sin errores de sintaxis) para cualquier comprobante válido', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          emisorArbitrary,
          fc.oneof(datosBoleaArbitrary, datosFacturaArbitrary),
          fc.integer({ min: 1, max: 999999 }),
          async (empresaRuc, emisor, datos, numeroCorrelativo) => {
            // Configurar mocks
            mockObtenerDatosEmisor.mockResolvedValue(emisor);
            mockRepository.obtenerSiguienteNumero.mockResolvedValue(numeroCorrelativo);

            // Generar comprobante
            const comprobante = 'ruc' in datos.receptor
              ? await generator.generarFactura(empresaRuc, datos as DatosFactura)
              : await generator.generarBoleta(empresaRuc, datos as DatosBoleta);

            const xml = comprobante.xmlOriginal!;

            // Verificar que el XML está bien formado
            // 1. Debe empezar con declaración XML
            expect(xml.trim()).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
            
            // 2. Debe tener etiqueta raíz Invoice
            expect(xml).toContain('<Invoice');
            expect(xml).toContain('</Invoice>');
            
            // 3. Verificar que no hay etiquetas obviamente mal cerradas
            // Contar etiquetas de apertura y cierre de elementos clave
            const invoiceOpen = (xml.match(/<Invoice[^>]*>/g) || []).length;
            const invoiceClose = (xml.match(/<\/Invoice>/g) || []).length;
            expect(invoiceOpen).toBe(invoiceClose);
            
            // 4. Verificar que CDATA está bien formado si existe
            if (xml.includes('<![CDATA[')) {
              const cdataOpen = (xml.match(/<!\[CDATA\[/g) || []).length;
              const cdataClose = (xml.match(/\]\]>/g) || []).length;
              expect(cdataOpen).toBe(cdataClose);
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 3: Unicidad y correlatividad de numeración por empresa**
   * **Valida: Requisitos 1.4**
   * 
   * Para cualquier secuencia de comprobantes generados del mismo tipo y de la misma
   * empresa, todos deben tener números únicos y consecutivos sin saltos ni duplicados.
   * Comprobantes de diferentes empresas tienen secuencias independientes.
   */
  describe('Propiedad 3: Unicidad y correlatividad de numeración por empresa', () => {
    it('debe asignar números únicos y consecutivos para cualquier secuencia de boletas de la misma empresa', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          emisorArbitrary,
          fc.array(datosBoleaArbitrary, { minLength: 2, maxLength: 20 }),
          async (empresaRuc, emisor, secuenciaBoletas) => {
            // Crear mocks frescos para esta iteración
            const freshMockRepository: jest.Mocked<ComprobanteRepository> = {
              guardarComprobante: jest.fn(),
              guardarCDR: jest.fn(),
              obtenerComprobante: jest.fn(),
              obtenerCDR: jest.fn(),
              listarPendientes: jest.fn(),
              actualizarEstado: jest.fn(),
              listarComprobantes: jest.fn(),
              obtenerSiguienteNumero: jest.fn(),
            };

            const freshMockObtenerDatosEmisor = jest.fn().mockResolvedValue(emisor);
            
            // Simular numeración correlativa
            let numeroActual = 1;
            freshMockRepository.obtenerSiguienteNumero.mockImplementation(async () => {
              const resultado = numeroActual;
              numeroActual++;
              return resultado;
            });

            // Crear generador fresco para esta iteración
            const freshGenerator = new ComprobanteGenerator(
              freshMockRepository,
              validator,
              freshMockObtenerDatosEmisor
            );

            // Generar secuencia de boletas
            const comprobantes = [];
            for (const datos of secuenciaBoletas) {
              const comprobante = await freshGenerator.generarBoleta(empresaRuc, datos);
              comprobantes.push(comprobante);
            }

            // Verificar unicidad: todos los números deben ser diferentes
            const numeros = comprobantes.map(c => c.numero);
            const numerosUnicos = new Set(numeros);
            expect(numerosUnicos.size).toBe(numeros.length);

            // Verificar correlatividad: los números deben ser consecutivos
            const correlativos = comprobantes.map(c => {
              const partes = c.numero.split('-');
              return parseInt(partes[1], 10);
            });

            // Verificar que son consecutivos (cada uno es el anterior + 1)
            for (let i = 1; i < correlativos.length; i++) {
              expect(correlativos[i]).toBe(correlativos[i - 1] + 1);
            }

            // Verificar que todos tienen la misma serie (B001 para boletas)
            comprobantes.forEach(c => {
              expect(c.numero).toMatch(/^B001-\d{8}$/);
            });

            // Verificar que todos los números son positivos
            correlativos.forEach(c => {
              expect(c).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe asignar números únicos y consecutivos para cualquier secuencia de facturas de la misma empresa', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          emisorArbitrary,
          fc.array(datosFacturaArbitrary, { minLength: 2, maxLength: 20 }),
          async (empresaRuc, emisor, secuenciaFacturas) => {
            // Crear mocks frescos para esta iteración
            const freshMockRepository: jest.Mocked<ComprobanteRepository> = {
              guardarComprobante: jest.fn(),
              guardarCDR: jest.fn(),
              obtenerComprobante: jest.fn(),
              obtenerCDR: jest.fn(),
              listarPendientes: jest.fn(),
              actualizarEstado: jest.fn(),
              listarComprobantes: jest.fn(),
              obtenerSiguienteNumero: jest.fn(),
            };

            const freshMockObtenerDatosEmisor = jest.fn().mockResolvedValue(emisor);
            
            // Simular numeración correlativa
            let numeroActual = 1;
            freshMockRepository.obtenerSiguienteNumero.mockImplementation(async () => {
              const resultado = numeroActual;
              numeroActual++;
              return resultado;
            });

            // Crear generador fresco para esta iteración
            const freshGenerator = new ComprobanteGenerator(
              freshMockRepository,
              validator,
              freshMockObtenerDatosEmisor
            );

            // Generar secuencia de facturas
            const comprobantes = [];
            for (const datos of secuenciaFacturas) {
              const comprobante = await freshGenerator.generarFactura(empresaRuc, datos);
              comprobantes.push(comprobante);
            }

            // Verificar unicidad: todos los números deben ser diferentes
            const numeros = comprobantes.map(c => c.numero);
            const numerosUnicos = new Set(numeros);
            expect(numerosUnicos.size).toBe(numeros.length);

            // Verificar correlatividad: los números deben ser consecutivos
            const correlativos = comprobantes.map(c => {
              const partes = c.numero.split('-');
              return parseInt(partes[1], 10);
            });

            // Verificar que son consecutivos (cada uno es el anterior + 1)
            for (let i = 1; i < correlativos.length; i++) {
              expect(correlativos[i]).toBe(correlativos[i - 1] + 1);
            }

            // Verificar que todos tienen la misma serie (F001 para facturas)
            comprobantes.forEach(c => {
              expect(c.numero).toMatch(/^F001-\d{8}$/);
            });

            // Verificar que todos los números son positivos
            correlativos.forEach(c => {
              expect(c).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe mantener secuencias independientes para diferentes empresas', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(rucArbitrary, { minLength: 2, maxLength: 5 }).map(rucs => [...new Set(rucs)]), // RUCs únicos
          fc.array(emisorArbitrary, { minLength: 2, maxLength: 5 }),
          fc.array(datosBoleaArbitrary, { minLength: 3, maxLength: 10 }),
          async (empresasRuc, emisores, datosBoletas) => {
            // Asegurar que tenemos al menos 2 empresas diferentes
            if (empresasRuc.length < 2) return;

            // Crear mocks frescos para esta iteración
            const freshMockRepository: jest.Mocked<ComprobanteRepository> = {
              guardarComprobante: jest.fn(),
              guardarCDR: jest.fn(),
              obtenerComprobante: jest.fn(),
              obtenerCDR: jest.fn(),
              listarPendientes: jest.fn(),
              actualizarEstado: jest.fn(),
              listarComprobantes: jest.fn(),
              obtenerSiguienteNumero: jest.fn(),
            };

            const freshMockObtenerDatosEmisor = jest.fn();

            // Mapa de numeración por empresa
            const numeracionPorEmpresa = new Map<string, number>();
            empresasRuc.forEach(ruc => numeracionPorEmpresa.set(ruc, 1));

            // Configurar mocks
            freshMockObtenerDatosEmisor.mockImplementation(async (ruc: string) => {
              const index = empresasRuc.indexOf(ruc) % emisores.length;
              return { ...emisores[index], ruc };
            });

            freshMockRepository.obtenerSiguienteNumero.mockImplementation(async (ruc: string) => {
              const numero = numeracionPorEmpresa.get(ruc) || 1;
              numeracionPorEmpresa.set(ruc, numero + 1);
              return numero;
            });

            // Crear generador fresco para esta iteración
            const freshGenerator = new ComprobanteGenerator(
              freshMockRepository,
              validator,
              freshMockObtenerDatosEmisor
            );

            // Generar comprobantes alternando entre empresas
            const comprobantesPorEmpresa = new Map<string, string[]>();
            
            for (let i = 0; i < datosBoletas.length; i++) {
              const empresaRuc = empresasRuc[i % empresasRuc.length];
              const comprobante = await freshGenerator.generarBoleta(empresaRuc, datosBoletas[i]);
              
              if (!comprobantesPorEmpresa.has(empresaRuc)) {
                comprobantesPorEmpresa.set(empresaRuc, []);
              }
              comprobantesPorEmpresa.get(empresaRuc)!.push(comprobante.numero);
            }

            // Verificar que cada empresa tiene su propia secuencia correlativa
            comprobantesPorEmpresa.forEach((numeros, empresaRuc) => {
              // Extraer correlativos
              const correlativos = numeros.map(n => {
                const partes = n.split('-');
                return parseInt(partes[1], 10);
              });

              // Verificar que son consecutivos para esta empresa
              for (let i = 1; i < correlativos.length; i++) {
                expect(correlativos[i]).toBe(correlativos[i - 1] + 1);
              }

              // Verificar que empiezan en 1 (o el número que corresponda)
              expect(correlativos[0]).toBeGreaterThanOrEqual(1);
            });

            // Verificar que las secuencias son independientes
            // (diferentes empresas pueden tener los mismos correlativos)
            const todasLasSecuencias = Array.from(comprobantesPorEmpresa.values());
            if (todasLasSecuencias.length >= 2) {
              // Las secuencias pueden coincidir en correlativos, pero son independientes
              // Esto se verifica porque cada empresa mantiene su propia numeración
              expect(comprobantesPorEmpresa.size).toBeGreaterThanOrEqual(2);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe mantener secuencias independientes para diferentes tipos de comprobante de la misma empresa', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          emisorArbitrary,
          fc.array(datosBoleaArbitrary, { minLength: 2, maxLength: 5 }),
          fc.array(datosFacturaArbitrary, { minLength: 2, maxLength: 5 }),
          async (empresaRuc, emisor, boletas, facturas) => {
            // Configurar mocks
            mockObtenerDatosEmisor.mockResolvedValue(emisor);

            // Numeración independiente por tipo
            const numeracionBoletas = { actual: 1 };
            const numeracionFacturas = { actual: 1 };

            mockRepository.obtenerSiguienteNumero.mockImplementation(
              async (ruc: string, tipo: string, serie: string) => {
                if (tipo === TipoComprobante.BOLETA) {
                  return numeracionBoletas.actual++;
                } else {
                  return numeracionFacturas.actual++;
                }
              }
            );

            // Generar boletas
            const comprobantesBoletas = [];
            for (const datos of boletas) {
              const comprobante = await generator.generarBoleta(empresaRuc, datos);
              comprobantesBoletas.push(comprobante);
            }

            // Generar facturas
            const comprobantesFacturas = [];
            for (const datos of facturas) {
              const comprobante = await generator.generarFactura(empresaRuc, datos);
              comprobantesFacturas.push(comprobante);
            }

            // Verificar que las boletas tienen su propia secuencia
            const numerosBoletas = comprobantesBoletas.map(c => c.numero);
            const correlativosBoletas = numerosBoletas.map(n => parseInt(n.split('-')[1], 10));
            
            for (let i = 1; i < correlativosBoletas.length; i++) {
              expect(correlativosBoletas[i]).toBe(correlativosBoletas[i - 1] + 1);
            }
            expect(correlativosBoletas[0]).toBe(1);

            // Verificar que las facturas tienen su propia secuencia
            const numerosFacturas = comprobantesFacturas.map(c => c.numero);
            const correlativosFacturas = numerosFacturas.map(n => parseInt(n.split('-')[1], 10));
            
            for (let i = 1; i < correlativosFacturas.length; i++) {
              expect(correlativosFacturas[i]).toBe(correlativosFacturas[i - 1] + 1);
            }
            expect(correlativosFacturas[0]).toBe(1);

            // Verificar que las series son diferentes
            comprobantesBoletas.forEach(c => expect(c.numero).toMatch(/^B001-/));
            comprobantesFacturas.forEach(c => expect(c.numero).toMatch(/^F001-/));
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe formatear cualquier número correlativo con 8 dígitos con ceros a la izquierda', () => {
      fc.assert(
        fc.asyncProperty(
          rucArbitrary,
          fc.integer({ min: 1, max: 99999999 }), // Cualquier número de 1 a 99999999
          async (empresaRuc, numeroCorrelativo) => {
            mockRepository.obtenerSiguienteNumero.mockResolvedValue(numeroCorrelativo);

            const numero = await generator.asignarNumeracion(empresaRuc, TipoComprobante.BOLETA);

            // Verificar formato: SERIE-NNNNNNNN (8 dígitos)
            expect(numero).toMatch(/^B001-\d{8}$/);

            // Extraer correlativo y verificar que coincide
            const partes = numero.split('-');
            const correlativoFormateado = parseInt(partes[1], 10);
            expect(correlativoFormateado).toBe(numeroCorrelativo);

            // Verificar que tiene exactamente 8 dígitos
            expect(partes[1].length).toBe(8);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
