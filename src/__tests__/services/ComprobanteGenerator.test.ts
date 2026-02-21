/**
 * Pruebas unitarias para ComprobanteGenerator
 * 
 * Valida la generación de XML UBL 2.1 para boletas y facturas
 */

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

describe('ComprobanteGenerator', () => {
  let generator: ComprobanteGenerator;
  let mockRepository: jest.Mocked<ComprobanteRepository>;
  let validator: DataValidator;
  let mockObtenerDatosEmisor: jest.Mock;

  const emisorMock: Emisor = {
    ruc: '20123456789',
    razonSocial: 'EMPRESA DE PRUEBA S.A.C.',
    nombreComercial: 'EMPRESA PRUEBA',
    direccion: {
      departamento: 'LIMA',
      provincia: 'LIMA',
      distrito: 'MIRAFLORES',
      direccion: 'AV. LARCO 1234',
      codigoPais: 'PE',
    },
  };

  const itemMock: ItemComprobante = {
    codigo: 'PROD001',
    descripcion: 'Producto de prueba',
    cantidad: 2,
    unidadMedida: 'NIU',
    precioUnitario: 100.00,
    afectacionIGV: '10', // Gravado
    igv: 36.00,
    total: 200.00,
  };

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
      obtenerSiguienteNumero: jest.fn().mockResolvedValue(1),
    };

    mockObtenerDatosEmisor = jest.fn().mockResolvedValue(emisorMock);

    generator = new ComprobanteGenerator(
      mockRepository,
      validator,
      mockObtenerDatosEmisor
    );
  });

  describe('generarBoleta', () => {
    it('debe generar una boleta con datos válidos', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1', // DNI
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
        moneda: TipoMoneda.PEN,
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);

      expect(comprobante).toBeDefined();
      expect(comprobante.tipo).toBe(TipoComprobante.BOLETA);
      expect(comprobante.numero).toBe('B001-00000001');
      expect(comprobante.empresaRuc).toBe('20123456789');
      expect(comprobante.emisor).toEqual(emisorMock);
      expect(comprobante.receptor.numeroDocumento).toBe('12345678');
      expect(comprobante.items).toHaveLength(1);
      expect(comprobante.subtotal).toBe(200.00);
      expect(comprobante.igv).toBe(36.00);
      expect(comprobante.total).toBe(236.00);
      expect(comprobante.moneda).toBe(TipoMoneda.PEN);
      expect(comprobante.estado).toBe(EstadoComprobante.PENDIENTE);
      expect(comprobante.xmlOriginal).toBeDefined();
      expect(comprobante.xmlOriginal).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(comprobante.xmlOriginal).toContain('<Invoice');
      expect(comprobante.xmlOriginal).toContain('B001-00000001');
      
      expect(mockRepository.guardarComprobante).toHaveBeenCalledWith('20123456789', comprobante);
    });

    it('debe rechazar boleta con DNI inválido', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '123', // DNI inválido (debe tener 8 dígitos)
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      await expect(generator.generarBoleta('20123456789', datosBoleta))
        .rejects.toThrow('DNI de receptor inválido');
    });

    it('debe rechazar boleta sin items', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [],
      };

      await expect(generator.generarBoleta('20123456789', datosBoleta))
        .rejects.toThrow('El comprobante debe tener al menos un item');
    });

    it('debe rechazar boleta con moneda inválida', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
        moneda: 'EUR' as TipoMoneda, // Moneda no válida
      };

      await expect(generator.generarBoleta('20123456789', datosBoleta))
        .rejects.toThrow('Moneda inválida');
    });

    it('debe usar PEN como moneda por defecto', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
        // No se especifica moneda
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);

      expect(comprobante.moneda).toBe(TipoMoneda.PEN);
    });
  });

  describe('generarFactura', () => {
    it('debe generar una factura con datos válidos', async () => {
      const datosFactura: DatosFactura = {
        receptor: {
          ruc: '20987654321',
          razonSocial: 'CLIENTE S.A.C.',
          direccion: {
            departamento: 'LIMA',
            provincia: 'LIMA',
            distrito: 'SAN ISIDRO',
            direccion: 'AV. JAVIER PRADO 5678',
          },
        },
        items: [itemMock],
        moneda: TipoMoneda.USD,
      };

      const comprobante = await generator.generarFactura('20123456789', datosFactura);

      expect(comprobante).toBeDefined();
      expect(comprobante.tipo).toBe(TipoComprobante.FACTURA);
      expect(comprobante.numero).toBe('F001-00000001');
      expect(comprobante.empresaRuc).toBe('20123456789');
      expect(comprobante.receptor.tipoDocumento).toBe('6'); // RUC
      expect(comprobante.receptor.numeroDocumento).toBe('20987654321');
      expect(comprobante.receptor.nombre).toBe('CLIENTE S.A.C.');
      expect(comprobante.moneda).toBe(TipoMoneda.USD);
      expect(comprobante.xmlOriginal).toContain('F001-00000001');
      expect(comprobante.xmlOriginal).toContain('USD');
    });

    it('debe rechazar factura con RUC inválido', async () => {
      const datosFactura: DatosFactura = {
        receptor: {
          ruc: '123', // RUC inválido (debe tener 11 dígitos)
          razonSocial: 'CLIENTE S.A.C.',
        },
        items: [itemMock],
      };

      await expect(generator.generarFactura('20123456789', datosFactura))
        .rejects.toThrow('RUC de receptor inválido');
    });
  });

  describe('asignarNumeracion', () => {
    it('debe asignar numeración correlativa para boletas', async () => {
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(123);

      const numero = await generator.asignarNumeracion('20123456789', TipoComprobante.BOLETA);

      expect(numero).toBe('B001-00000123');
      expect(mockRepository.obtenerSiguienteNumero).toHaveBeenCalledWith(
        '20123456789',
        TipoComprobante.BOLETA,
        'B001'
      );
    });

    it('debe asignar numeración correlativa para facturas', async () => {
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(456);

      const numero = await generator.asignarNumeracion('20123456789', TipoComprobante.FACTURA);

      expect(numero).toBe('F001-00000456');
      expect(mockRepository.obtenerSiguienteNumero).toHaveBeenCalledWith(
        '20123456789',
        TipoComprobante.FACTURA,
        'F001'
      );
    });

    it('debe formatear números con ceros a la izquierda', async () => {
      mockRepository.obtenerSiguienteNumero.mockResolvedValue(1);

      const numero = await generator.asignarNumeracion('20123456789', TipoComprobante.BOLETA);

      expect(numero).toBe('B001-00000001');
    });
  });

  describe('validación de items', () => {
    it('debe rechazar items con precio unitario negativo', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [
          {
            ...itemMock,
            precioUnitario: -10.00,
          },
        ],
      };

      await expect(generator.generarBoleta('20123456789', datosBoleta))
        .rejects.toThrow('Precio unitario inválido');
    });

    it('debe rechazar items con cantidad cero o negativa', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [
          {
            ...itemMock,
            cantidad: 0,
          },
        ],
      };

      await expect(generator.generarBoleta('20123456789', datosBoleta))
        .rejects.toThrow('Cantidad inválida');
    });

    it('debe rechazar items con código de afectación IGV inválido', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [
          {
            ...itemMock,
            afectacionIGV: '99', // Código inválido
          },
        ],
      };

      await expect(generator.generarBoleta('20123456789', datosBoleta))
        .rejects.toThrow('Código de afectación IGV inválido');
    });
  });

  describe('cálculo de totales', () => {
    it('debe calcular correctamente subtotal, IGV y total con múltiples items', async () => {
      const item1: ItemComprobante = {
        codigo: 'PROD001',
        descripcion: 'Producto 1',
        cantidad: 2,
        unidadMedida: 'NIU',
        precioUnitario: 100.00,
        afectacionIGV: '10',
        igv: 36.00,
        total: 200.00,
      };

      const item2: ItemComprobante = {
        codigo: 'PROD002',
        descripcion: 'Producto 2',
        cantidad: 1,
        unidadMedida: 'NIU',
        precioUnitario: 50.00,
        afectacionIGV: '10',
        igv: 9.00,
        total: 50.00,
      };

      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [item1, item2],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);

      expect(comprobante.subtotal).toBe(250.00); // 200 + 50
      expect(comprobante.igv).toBe(45.00); // 36 + 9
      expect(comprobante.total).toBe(295.00); // 250 + 45
    });
  });

  describe('generación de XML', () => {
    it('debe incluir todos los campos obligatorios en el XML de boleta', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar estructura UBL 2.1
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
      expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
      
      // Verificar datos del emisor
      expect(xml).toContain('<cac:AccountingSupplierParty>');
      expect(xml).toContain(emisorMock.ruc);
      expect(xml).toContain(emisorMock.razonSocial);
      expect(xml).toContain(emisorMock.nombreComercial);
      
      // Verificar datos del receptor
      expect(xml).toContain('<cac:AccountingCustomerParty>');
      expect(xml).toContain('12345678');
      expect(xml).toContain('JUAN PEREZ');
      
      // Verificar items
      expect(xml).toContain('<cac:InvoiceLine>');
      expect(xml).toContain('PROD001');
      expect(xml).toContain('Producto de prueba');
      
      // Verificar totales
      expect(xml).toContain('<cac:TaxTotal>');
      expect(xml).toContain('<cac:LegalMonetaryTotal>');
    });

    it('debe incluir dirección del receptor en facturas', async () => {
      const datosFactura: DatosFactura = {
        receptor: {
          ruc: '20987654321',
          razonSocial: 'CLIENTE S.A.C.',
          direccion: {
            departamento: 'LIMA',
            provincia: 'LIMA',
            distrito: 'SAN ISIDRO',
            direccion: 'AV. JAVIER PRADO 5678',
          },
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarFactura('20123456789', datosFactura);
      const xml = comprobante.xmlOriginal!;

      expect(xml).toContain('<cac:RegistrationAddress>');
      expect(xml).toContain('AV. JAVIER PRADO 5678');
    });
  });

  describe('casos específicos de generación', () => {
    it('debe generar boleta con datos conocidos y verificar estructura completa', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '87654321',
          nombre: 'MARIA LOPEZ GARCIA',
        },
        items: [
          {
            codigo: 'SERV001',
            descripcion: 'Servicio de consultoría',
            cantidad: 1,
            unidadMedida: 'ZZ',
            precioUnitario: 500.00,
            afectacionIGV: '10',
            igv: 90.00,
            total: 500.00,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);

      // Verificar datos del comprobante
      expect(comprobante.tipo).toBe(TipoComprobante.BOLETA);
      expect(comprobante.numero).toMatch(/^B001-\d{8}$/);
      expect(comprobante.empresaRuc).toBe('20123456789');
      expect(comprobante.receptor.numeroDocumento).toBe('87654321');
      expect(comprobante.receptor.nombre).toBe('MARIA LOPEZ GARCIA');
      expect(comprobante.subtotal).toBe(500.00);
      expect(comprobante.igv).toBe(90.00);
      expect(comprobante.total).toBe(590.00);
      expect(comprobante.moneda).toBe(TipoMoneda.PEN);

      // Verificar XML
      const xml = comprobante.xmlOriginal!;
      expect(xml).toContain('SERV001');
      expect(xml).toContain('Servicio de consultoría');
      expect(xml).toContain('87654321');
      expect(xml).toContain('MARIA LOPEZ GARCIA');
      expect(xml).toContain('500.00');
      expect(xml).toContain('90.00');
      expect(xml).toContain('590.00');
    });

    it('debe generar factura con datos conocidos y verificar estructura completa', async () => {
      const datosFactura: DatosFactura = {
        receptor: {
          ruc: '20456789012',
          razonSocial: 'CORPORACION XYZ S.A.',
          direccion: {
            departamento: 'AREQUIPA',
            provincia: 'AREQUIPA',
            distrito: 'CERCADO',
            direccion: 'CALLE MERCADERES 456',
            codigoPais: 'PE',
          },
        },
        items: [
          {
            codigo: 'PROD100',
            descripcion: 'Laptop HP ProBook 450',
            cantidad: 5,
            unidadMedida: 'NIU',
            precioUnitario: 2500.00,
            afectacionIGV: '10',
            igv: 2250.00,
            total: 12500.00,
          },
        ],
        moneda: TipoMoneda.USD,
      };

      const comprobante = await generator.generarFactura('20123456789', datosFactura);

      // Verificar datos del comprobante
      expect(comprobante.tipo).toBe(TipoComprobante.FACTURA);
      expect(comprobante.numero).toMatch(/^F001-\d{8}$/);
      expect(comprobante.empresaRuc).toBe('20123456789');
      expect(comprobante.receptor.tipoDocumento).toBe('6');
      expect(comprobante.receptor.numeroDocumento).toBe('20456789012');
      expect(comprobante.receptor.nombre).toBe('CORPORACION XYZ S.A.');
      expect(comprobante.subtotal).toBe(12500.00);
      expect(comprobante.igv).toBe(2250.00);
      expect(comprobante.total).toBe(14750.00);
      expect(comprobante.moneda).toBe(TipoMoneda.USD);

      // Verificar XML
      const xml = comprobante.xmlOriginal!;
      expect(xml).toContain('PROD100');
      expect(xml).toContain('Laptop HP ProBook 450');
      expect(xml).toContain('20456789012');
      expect(xml).toContain('CORPORACION XYZ S.A.');
      expect(xml).toContain('CALLE MERCADERES 456');
      expect(xml).toContain('USD');
      expect(xml).toContain('2500.00');
      expect(xml).toContain('2250.00');
      expect(xml).toContain('14750.00');
    });

    it('debe verificar estructura XML contra esquema UBL 2.1 - namespaces', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar namespaces UBL 2.1
      expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
      expect(xml).toContain('xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"');
      expect(xml).toContain('xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"');
      expect(xml).toContain('xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"');
    });

    it('debe verificar estructura XML contra esquema UBL 2.1 - elementos obligatorios', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Elementos obligatorios según UBL 2.1
      expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
      expect(xml).toContain('<cbc:CustomizationID>2.0</cbc:CustomizationID>');
      expect(xml).toContain('<cbc:ID>');
      expect(xml).toContain('<cbc:IssueDate>');
      expect(xml).toContain('<cbc:IssueTime>');
      expect(xml).toContain('<cbc:InvoiceTypeCode');
      expect(xml).toContain('<cbc:DocumentCurrencyCode>');
      
      // Secciones obligatorias
      expect(xml).toContain('<cac:AccountingSupplierParty>');
      expect(xml).toContain('<cac:AccountingCustomerParty>');
      expect(xml).toContain('<cac:TaxTotal>');
      expect(xml).toContain('<cac:LegalMonetaryTotal>');
      expect(xml).toContain('<cac:InvoiceLine>');
    });

    it('debe verificar estructura XML contra esquema UBL 2.1 - formato de fechas', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar formato de fecha ISO (YYYY-MM-DD)
      const fechaMatch = xml.match(/<cbc:IssueDate>(\d{4}-\d{2}-\d{2})<\/cbc:IssueDate>/);
      expect(fechaMatch).toBeTruthy();
      expect(fechaMatch![1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verificar formato de hora ISO (HH:MM:SS)
      const horaMatch = xml.match(/<cbc:IssueTime>(\d{2}:\d{2}:\d{2})<\/cbc:IssueTime>/);
      expect(horaMatch).toBeTruthy();
      expect(horaMatch![1]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('debe verificar estructura XML contra esquema UBL 2.1 - formato de montos', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar que todos los montos tengan 2 decimales
      const montosMatch = xml.match(/currencyID="[A-Z]{3}">(\d+\.\d{2})</g);
      expect(montosMatch).toBeTruthy();
      expect(montosMatch!.length).toBeGreaterThan(0);

      // Verificar que cada monto tenga exactamente 2 decimales
      montosMatch!.forEach((monto) => {
        const valor = monto.match(/(\d+\.\d{2})/);
        expect(valor).toBeTruthy();
        expect(valor![1].split('.')[1]).toHaveLength(2);
      });
    });

    it('debe verificar estructura XML contra esquema UBL 2.1 - códigos de catálogo', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar InvoiceTypeCode con listID
      expect(xml).toContain('<cbc:InvoiceTypeCode listID="0101">');
      
      // Verificar schemeID en identificaciones
      expect(xml).toContain('schemeID="6"'); // RUC del emisor
      expect(xml).toContain('schemeID="1"'); // DNI del receptor
      
      // Verificar código de afectación IGV
      expect(xml).toContain('<cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>');
      
      // Verificar código de tributo IGV
      expect(xml).toContain('<cbc:ID>1000</cbc:ID>');
      expect(xml).toContain('<cbc:Name>IGV</cbc:Name>');
      expect(xml).toContain('<cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>');
    });

    it('debe generar XML con caracteres especiales escapados correctamente', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PÉREZ & ASOCIADOS',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto con "comillas" y <etiquetas>',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100.00,
            afectacionIGV: '10',
            igv: 18.00,
            total: 100.00,
          },
        ],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar que los caracteres especiales estén dentro de CDATA
      expect(xml).toContain('<![CDATA[JUAN PÉREZ & ASOCIADOS]]>');
      expect(xml).toContain('<![CDATA[Producto con "comillas" y <etiquetas>]]>');
    });

    it('debe generar XML con múltiples items en el orden correcto', async () => {
      const items: ItemComprobante[] = [
        {
          codigo: 'PROD001',
          descripcion: 'Producto 1',
          cantidad: 2,
          unidadMedida: 'NIU',
          precioUnitario: 100.00,
          afectacionIGV: '10',
          igv: 36.00,
          total: 200.00,
        },
        {
          codigo: 'PROD002',
          descripcion: 'Producto 2',
          cantidad: 1,
          unidadMedida: 'NIU',
          precioUnitario: 50.00,
          afectacionIGV: '10',
          igv: 9.00,
          total: 50.00,
        },
        {
          codigo: 'PROD003',
          descripcion: 'Producto 3',
          cantidad: 3,
          unidadMedida: 'NIU',
          precioUnitario: 25.00,
          afectacionIGV: '10',
          igv: 13.50,
          total: 75.00,
        },
      ];

      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items,
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar que cada item tenga su ID correlativo
      expect(xml).toContain('<cbc:ID>1</cbc:ID>');
      expect(xml).toContain('<cbc:ID>2</cbc:ID>');
      expect(xml).toContain('<cbc:ID>3</cbc:ID>');

      // Verificar que los items aparezcan en orden
      const prod1Index = xml.indexOf('PROD001');
      const prod2Index = xml.indexOf('PROD002');
      const prod3Index = xml.indexOf('PROD003');

      expect(prod1Index).toBeLessThan(prod2Index);
      expect(prod2Index).toBeLessThan(prod3Index);
    });

    it('debe generar XML con extensión para firma digital', async () => {
      const datosBoleta: DatosBoleta = {
        receptor: {
          tipoDocumento: '1',
          numeroDocumento: '12345678',
          nombre: 'JUAN PEREZ',
        },
        items: [itemMock],
      };

      const comprobante = await generator.generarBoleta('20123456789', datosBoleta);
      const xml = comprobante.xmlOriginal!;

      // Verificar que exista la sección de extensiones para la firma
      expect(xml).toContain('<ext:UBLExtensions>');
      expect(xml).toContain('<ext:UBLExtension>');
      expect(xml).toContain('<ext:ExtensionContent>');
      expect(xml).toContain('<!-- Firma digital se agregará aquí -->');
    });
  });
});
