/**
 * Generador de Comprobantes Electrónicos
 * 
 * Genera documentos XML en formato UBL 2.1 para boletas y facturas según estándares SUNAT.
 * Implementa numeración correlativa por empresa (multi-tenant).
 * 
 * Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import {
  Comprobante,
  DatosBoleta,
  DatosFactura,
  TipoComprobante,
  TipoMoneda,
  EstadoComprobante,
  Emisor,
  Receptor,
  ItemComprobante,
} from '../types';
import { ComprobanteRepository } from '../repositories/interfaces';
import { DataValidator } from '../validators/DataValidator';

/**
 * Interfaz del generador de comprobantes
 */
export interface IComprobanteGenerator {
  generarBoleta(empresaRuc: string, datos: DatosBoleta): Promise<Comprobante>;
  generarFactura(empresaRuc: string, datos: DatosFactura): Promise<Comprobante>;
  asignarNumeracion(empresaRuc: string, tipo: TipoComprobante): Promise<string>;
}

/**
 * Configuración de series por tipo de comprobante
 */
const SERIES_DEFAULT: Record<string, string> = {
  [TipoComprobante.BOLETA]: 'B001',
  [TipoComprobante.FACTURA]: 'F001',
  [TipoComprobante.NOTA_CREDITO]: 'NC01',
  [TipoComprobante.NOTA_DEBITO]: 'ND01',
};

/**
 * Generador de comprobantes electrónicos
 */
export class ComprobanteGenerator implements IComprobanteGenerator {
  constructor(
    private repository: ComprobanteRepository,
    private validator: DataValidator,
    private obtenerDatosEmisor: (ruc: string) => Promise<Emisor>
  ) {}

  /**
   * Genera una boleta electrónica
   * Requisitos: 1.1, 1.3, 1.4, 1.5, 1.6
   */
  async generarBoleta(empresaRuc: string, datos: DatosBoleta): Promise<Comprobante> {
    // Validar datos de entrada
    this.validarDatosBoleta(datos);

    // Obtener datos del emisor
    const emisor = await this.obtenerDatosEmisor(empresaRuc);

    // Asignar numeración correlativa
    const numero = await this.asignarNumeracion(empresaRuc, TipoComprobante.BOLETA);

    // Construir receptor
    const receptor: Receptor = {
      tipoDocumento: datos.receptor.tipoDocumento,
      numeroDocumento: datos.receptor.numeroDocumento,
      nombre: datos.receptor.nombre,
    };

    // Calcular totales
    const { subtotal, igv, total } = this.calcularTotales(datos.items);

    // Construir comprobante
    const comprobante: Comprobante = {
      empresaRuc,
      numero,
      tipo: TipoComprobante.BOLETA,
      fecha: new Date(),
      emisor,
      receptor,
      items: datos.items,
      subtotal,
      igv,
      total,
      moneda: datos.moneda || TipoMoneda.PEN,
      estado: EstadoComprobante.PENDIENTE,
    };

    // Generar XML UBL 2.1
    const xml = this.generarXMLBoleta(comprobante);
    comprobante.xmlOriginal = xml;

    // Guardar en repositorio
    await this.repository.guardarComprobante(empresaRuc, comprobante);

    return comprobante;
  }

  /**
   * Genera una factura electrónica
   * Requisitos: 1.2, 1.3, 1.4, 1.5, 1.6
   */
  async generarFactura(empresaRuc: string, datos: DatosFactura): Promise<Comprobante> {
    // Validar datos de entrada
    this.validarDatosFactura(datos);

    // Obtener datos del emisor
    const emisor = await this.obtenerDatosEmisor(empresaRuc);

    // Asignar numeración correlativa
    const numero = await this.asignarNumeracion(empresaRuc, TipoComprobante.FACTURA);

    // Construir receptor
    const receptor: Receptor = {
      tipoDocumento: '6', // RUC (catálogo 06)
      numeroDocumento: datos.receptor.ruc,
      nombre: datos.receptor.razonSocial,
      direccion: datos.receptor.direccion,
    };

    // Calcular totales
    const { subtotal, igv, total } = this.calcularTotales(datos.items);

    // Construir comprobante
    const comprobante: Comprobante = {
      empresaRuc,
      numero,
      tipo: TipoComprobante.FACTURA,
      fecha: new Date(),
      emisor,
      receptor,
      items: datos.items,
      subtotal,
      igv,
      total,
      moneda: datos.moneda || TipoMoneda.PEN,
      estado: EstadoComprobante.PENDIENTE,
    };

    // Generar XML UBL 2.1
    const xml = this.generarXMLFactura(comprobante);
    comprobante.xmlOriginal = xml;

    // Guardar en repositorio
    await this.repository.guardarComprobante(empresaRuc, comprobante);

    return comprobante;
  }

  /**
   * Asigna numeración correlativa única por empresa y tipo de comprobante
   * Requisito: 1.4
   */
  async asignarNumeracion(empresaRuc: string, tipo: TipoComprobante): Promise<string> {
    const serie = SERIES_DEFAULT[tipo];
    const correlativo = await this.repository.obtenerSiguienteNumero(empresaRuc, tipo, serie);
    
    // Formato: SERIE-CORRELATIVO (ej: B001-00000123)
    const numeroFormateado = `${serie}-${correlativo.toString().padStart(8, '0')}`;
    
    return numeroFormateado;
  }

  /**
   * Valida datos de boleta
   */
  private validarDatosBoleta(datos: DatosBoleta): void {
    // Validar tipo de documento del receptor
    const validacionTipoDoc = this.validator.validarCatalogo(datos.receptor.tipoDocumento, '06');
    if (!validacionTipoDoc.valido) {
      throw new Error(`Tipo de documento inválido: ${validacionTipoDoc.errores.join(', ')}`);
    }

    // Validar documento según el tipo
    if (datos.receptor.tipoDocumento === '1') {
      // DNI
      const validacionDNI = this.validator.validarDNI(datos.receptor.numeroDocumento);
      if (!validacionDNI.valido) {
        throw new Error(`DNI de receptor inválido: ${validacionDNI.errores.join(', ')}`);
      }
    } else if (datos.receptor.tipoDocumento === '6') {
      // RUC
      const validacionRUC = this.validator.validarRUC(datos.receptor.numeroDocumento);
      if (!validacionRUC.valido) {
        throw new Error(`RUC de receptor inválido: ${validacionRUC.errores.join(', ')}`);
      }
    }

    // Validar items
    this.validarItems(datos.items);

    // Validar moneda
    if (datos.moneda) {
      const validacionMoneda = this.validator.validarMoneda(datos.moneda);
      if (!validacionMoneda.valido) {
        throw new Error(`Moneda inválida: ${validacionMoneda.errores.join(', ')}`);
      }
    }
  }

  /**
   * Valida datos de factura
   */
  private validarDatosFactura(datos: DatosFactura): void {
    // Validar RUC del receptor
    const validacionRuc = this.validator.validarRUC(datos.receptor.ruc);
    if (!validacionRuc.valido) {
      throw new Error(`RUC de receptor inválido: ${validacionRuc.errores.join(', ')}`);
    }

    // Validar items
    this.validarItems(datos.items);

    // Validar moneda
    if (datos.moneda) {
      const validacionMoneda = this.validator.validarMoneda(datos.moneda);
      if (!validacionMoneda.valido) {
        throw new Error(`Moneda inválida: ${validacionMoneda.errores.join(', ')}`);
      }
    }
  }

  /**
   * Valida items del comprobante
   */
  private validarItems(items: ItemComprobante[]): void {
    if (!items || items.length === 0) {
      throw new Error('El comprobante debe tener al menos un item');
    }

    for (const item of items) {
      // Validar precio unitario
      if (item.precioUnitario <= 0) {
        throw new Error(`Precio unitario inválido en item ${item.codigo}: debe ser mayor a cero`);
      }

      // Validar que tenga máximo 2 decimales
      const decimales = (item.precioUnitario.toString().split('.')[1] || '').length;
      if (decimales > 2) {
        throw new Error(`Precio unitario inválido en item ${item.codigo}: debe tener máximo 2 decimales`);
      }

      // Validar cantidad
      if (item.cantidad <= 0) {
        throw new Error(`Cantidad inválida en item ${item.codigo}: debe ser mayor a cero`);
      }

      // Validar código de afectación IGV
      const validacionAfectacion = this.validator.validarCatalogo(item.afectacionIGV, '07');
      if (!validacionAfectacion.valido) {
        throw new Error(`Código de afectación IGV inválido en item ${item.codigo}: ${validacionAfectacion.errores.join(', ')}`);
      }
    }
  }

  /**
   * Calcula subtotal, IGV y total de los items
   */
  private calcularTotales(items: ItemComprobante[]): {
    subtotal: number;
    igv: number;
    total: number;
  } {
    let subtotal = 0;
    let igv = 0;

    for (const item of items) {
      subtotal += item.total;
      igv += item.igv;
    }

    const total = subtotal + igv;

    // Redondear a 2 decimales
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      igv: Math.round(igv * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  /**
   * Genera XML UBL 2.1 para boleta
   * Requisito: 1.1
   */
  private generarXMLBoleta(comprobante: Comprobante): string {
    const fecha = comprobante.fecha.toISOString().split('T')[0];
    const hora = comprobante.fecha.toISOString().split('T')[1].split('.')[0];

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- Firma digital se agregará aquí -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${comprobante.numero}</cbc:ID>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cbc:IssueTime>${hora}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="0101">${comprobante.tipo}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${comprobante.moneda}</cbc:DocumentCurrencyCode>
  ${this.generarXMLEmisor(comprobante.emisor)}
  ${this.generarXMLReceptor(comprobante.receptor)}
  ${this.generarXMLTotales(comprobante)}
  ${this.generarXMLItems(comprobante.items, comprobante.moneda)}
</Invoice>`;
  }

  /**
   * Genera XML UBL 2.1 para factura
   * Requisito: 1.2
   */
  private generarXMLFactura(comprobante: Comprobante): string {
    // La estructura es similar a la boleta, solo cambia el tipo de comprobante
    return this.generarXMLBoleta(comprobante);
  }

  /**
   * Genera sección XML del emisor
   * Requisito: 1.5
   */
  private generarXMLEmisor(emisor: Emisor): string {
    const codigoPais = emisor.direccion.codigoPais || 'PE';
    
    return `  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${emisor.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${emisor.nombreComercial}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${emisor.razonSocial}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${emisor.direccion.direccion}]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>${codigoPais}</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
  }

  /**
   * Genera sección XML del receptor
   * Requisito: 1.6
   */
  private generarXMLReceptor(receptor: Receptor): string {
    const direccionXML = receptor.direccion
      ? `        <cac:RegistrationAddress>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${receptor.direccion.direccion}]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>${receptor.direccion.codigoPais || 'PE'}</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>`
      : '';

    return `  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${receptor.tipoDocumento}">${receptor.numeroDocumento}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${receptor.nombre}]]></cbc:RegistrationName>
${direccionXML}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
  }

  /**
   * Genera sección XML de totales
   */
  private generarXMLTotales(comprobante: Comprobante): string {
    return `  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${comprobante.moneda}">${comprobante.igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${comprobante.moneda}">${comprobante.subtotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${comprobante.moneda}">${comprobante.igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="${comprobante.moneda}">${comprobante.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
  }

  /**
   * Genera sección XML de items
   */
  private generarXMLItems(items: ItemComprobante[], moneda: TipoMoneda): string {
    return items
      .map(
        (item, index) => `  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${item.unidadMedida}">${item.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${moneda}">${item.total.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${moneda}">${item.precioUnitario.toFixed(2)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${item.igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${item.total.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${item.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>18.00</cbc:Percent>
          <cbc:TaxExemptionReasonCode>${item.afectacionIGV}</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description><![CDATA[${item.descripcion}]]></cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>${item.codigo}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${moneda}">${item.precioUnitario.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
      )
      .join('\n');
  }
}
