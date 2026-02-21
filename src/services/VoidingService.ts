/**
 * Servicio de Anulación de Comprobantes
 * 
 * Genera comunicaciones de baja para boletas y notas de crédito para facturas
 * según las normativas de SUNAT.
 * 
 * Requisitos: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import {
  Comprobante,
  TipoComprobante,
  EstadoComprobante,
  TipoMoneda,
  ItemComprobante,
  Emisor,
  Receptor,
} from '../types';
import { ComprobanteRepository } from '../repositories/interfaces';

/**
 * Datos para generar una comunicación de baja
 */
export interface DatosComunicacionBaja {
  fechaBaja: Date; // Fecha de la comunicación de baja
  comprobantes: string[]; // Números de comprobantes a dar de baja
  motivo: string; // Motivo de la baja
}

/**
 * Datos para generar una nota de crédito
 */
export interface DatosNotaCredito {
  comprobanteReferencia: string; // Número del comprobante que se anula
  motivo: string; // Motivo de la anulación
  tipoNota: string; // Código del catálogo 09 (tipo de nota de crédito)
  items?: ItemComprobante[]; // Items de la nota (opcional, por defecto copia del original)
}

/**
 * Comunicación de baja generada
 */
export interface ComunicacionBaja {
  empresaRuc: string;
  numero: string; // Formato: RA-YYYYMMDD-CORRELATIVO
  fecha: Date;
  fechaBaja: Date;
  comprobantes: string[];
  motivo: string;
  xmlOriginal?: string;
  xmlFirmado?: string;
}

/**
 * Interfaz del servicio de anulación
 */
export interface IVoidingService {
  generarComunicacionBaja(
    empresaRuc: string,
    datos: DatosComunicacionBaja
  ): Promise<ComunicacionBaja>;
  generarNotaCredito(
    empresaRuc: string,
    datos: DatosNotaCredito
  ): Promise<Comprobante>;
  validarComprobanteParaAnulacion(comprobante: Comprobante): void;
}

/**
 * Servicio de anulación de comprobantes
 */
export class VoidingService implements IVoidingService {
  constructor(
    private repository: ComprobanteRepository,
    private obtenerDatosEmisor: (ruc: string) => Promise<Emisor>
  ) {}

  /**
   * Genera una comunicación de baja para boletas
   * Requisitos: 10.1, 10.3, 10.5
   */
  async generarComunicacionBaja(
    empresaRuc: string,
    datos: DatosComunicacionBaja
  ): Promise<ComunicacionBaja> {
    // Validar que todos los comprobantes existan y sean boletas aceptadas
    for (const numeroComprobante of datos.comprobantes) {
      const comprobante = await this.repository.obtenerComprobante(empresaRuc, numeroComprobante);
      
      if (!comprobante) {
        throw new Error(`Comprobante ${numeroComprobante} no encontrado`);
      }

      // Validar que sea una boleta
      if (comprobante.tipo !== TipoComprobante.BOLETA) {
        throw new Error(
          `El comprobante ${numeroComprobante} no es una boleta. Use nota de crédito para facturas.`
        );
      }

      // Validar que esté aceptado por SUNAT
      this.validarComprobanteParaAnulacion(comprobante);
    }

    // Generar número de comunicación de baja
    const numero = await this.generarNumeroComunicacionBaja(empresaRuc, datos.fechaBaja);

    // Obtener datos del emisor
    const emisor = await this.obtenerDatosEmisor(empresaRuc);

    // Crear comunicación de baja
    const comunicacionBaja: ComunicacionBaja = {
      empresaRuc,
      numero,
      fecha: new Date(),
      fechaBaja: datos.fechaBaja,
      comprobantes: datos.comprobantes,
      motivo: datos.motivo,
    };

    // Generar XML de comunicación de baja
    const xml = this.generarXMLComunicacionBaja(comunicacionBaja, emisor);
    comunicacionBaja.xmlOriginal = xml;

    return comunicacionBaja;
  }

  /**
   * Genera una nota de crédito para anular facturas
   * Requisitos: 10.2, 10.4, 10.5
   */
  async generarNotaCredito(
    empresaRuc: string,
    datos: DatosNotaCredito
  ): Promise<Comprobante> {
    // Obtener el comprobante original
    const comprobanteOriginal = await this.repository.obtenerComprobante(
      empresaRuc,
      datos.comprobanteReferencia
    );

    if (!comprobanteOriginal) {
      throw new Error(`Comprobante ${datos.comprobanteReferencia} no encontrado`);
    }

    // Validar que sea una factura
    if (comprobanteOriginal.tipo !== TipoComprobante.FACTURA) {
      throw new Error(
        `El comprobante ${datos.comprobanteReferencia} no es una factura. Use comunicación de baja para boletas.`
      );
    }

    // Validar que esté aceptado por SUNAT
    this.validarComprobanteParaAnulacion(comprobanteOriginal);

    // Obtener datos del emisor
    const emisor = await this.obtenerDatosEmisor(empresaRuc);

    // Generar número de nota de crédito
    const numero = await this.generarNumeroNotaCredito(empresaRuc);

    // Usar items del comprobante original si no se proporcionan
    const items = datos.items || comprobanteOriginal.items;

    // Calcular totales
    const { subtotal, igv, total } = this.calcularTotales(items);

    // Crear nota de crédito
    const notaCredito: Comprobante = {
      empresaRuc,
      numero,
      tipo: TipoComprobante.NOTA_CREDITO,
      fecha: new Date(),
      emisor,
      receptor: comprobanteOriginal.receptor,
      items,
      subtotal,
      igv,
      total,
      moneda: comprobanteOriginal.moneda,
      estado: EstadoComprobante.PENDIENTE,
    };

    // Generar XML de nota de crédito con referencia al comprobante original
    const xml = this.generarXMLNotaCredito(
      notaCredito,
      comprobanteOriginal,
      datos.motivo,
      datos.tipoNota
    );
    notaCredito.xmlOriginal = xml;

    // Guardar en repositorio
    await this.repository.guardarComprobante(empresaRuc, notaCredito);

    return notaCredito;
  }

  /**
   * Valida que un comprobante pueda ser anulado
   * Requisito: 10.5
   */
  validarComprobanteParaAnulacion(comprobante: Comprobante): void {
    if (comprobante.estado !== EstadoComprobante.ACEPTADO) {
      throw new Error(
        `Solo se pueden anular comprobantes aceptados por SUNAT. ` +
        `El comprobante ${comprobante.numero} está en estado ${comprobante.estado}`
      );
    }
  }

  /**
   * Genera el número de comunicación de baja
   * Formato: RA-YYYYMMDD-CORRELATIVO
   */
  private async generarNumeroComunicacionBaja(
    empresaRuc: string,
    fechaBaja: Date
  ): Promise<string> {
    const fecha = fechaBaja.toISOString().split('T')[0].replace(/-/g, '');
    
    // Obtener correlativo del día
    const correlativo = await this.repository.obtenerSiguienteNumero(
      empresaRuc,
      TipoComprobante.BOLETA, // Usar tipo boleta para bajas
      `RA-${fecha}`
    );

    return `RA-${fecha}-${correlativo}`;
  }

  /**
   * Genera el número de nota de crédito
   * Formato: NC01-CORRELATIVO
   */
  private async generarNumeroNotaCredito(empresaRuc: string): Promise<string> {
    const serie = 'NC01';
    const correlativo = await this.repository.obtenerSiguienteNumero(
      empresaRuc,
      TipoComprobante.NOTA_CREDITO,
      serie
    );

    return `${serie}-${correlativo.toString().padStart(8, '0')}`;
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

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      igv: Math.round(igv * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  /**
   * Genera XML de comunicación de baja según formato SUNAT
   * Requisito: 10.1
   */
  private generarXMLComunicacionBaja(
    comunicacion: ComunicacionBaja,
    emisor: Emisor
  ): string {
    const fecha = comunicacion.fecha.toISOString().split('T')[0];
    const fechaBaja = comunicacion.fechaBaja.toISOString().split('T')[0];

    const lineasBaja = comunicacion.comprobantes
      .map((numero, index) => {
        const [serie, correlativo] = numero.split('-');
        return `    <sac:VoidedDocumentsLine>
      <cbc:LineID>${index + 1}</cbc:LineID>
      <cbc:DocumentTypeCode>03</cbc:DocumentTypeCode>
      <sac:DocumentSerialID>${serie}</sac:DocumentSerialID>
      <sac:DocumentNumberID>${correlativo}</sac:DocumentNumberID>
      <sac:VoidReasonDescription><![CDATA[${comunicacion.motivo}]]></sac:VoidReasonDescription>
    </sac:VoidedDocumentsLine>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<VoidedDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1"
                 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                 xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
                 xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- Firma digital se agregará aquí -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.0</cbc:CustomizationID>
  <cbc:ID>${comunicacion.numero}</cbc:ID>
  <cbc:ReferenceDate>${fechaBaja}</cbc:ReferenceDate>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cac:Signature>
    <cbc:ID>${emisor.ruc}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${emisor.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${emisor.razonSocial}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SIGN-${emisor.ruc}</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cbc:CustomerAssignedAccountID>${emisor.ruc}</cbc:CustomerAssignedAccountID>
    <cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${emisor.razonSocial}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
${lineasBaja}
</VoidedDocuments>`;
  }

  /**
   * Genera XML de nota de crédito según formato UBL 2.1
   * Requisitos: 10.2, 10.4
   */
  private generarXMLNotaCredito(
    notaCredito: Comprobante,
    comprobanteOriginal: Comprobante,
    motivo: string,
    tipoNota: string
  ): string {
    const fecha = notaCredito.fecha.toISOString().split('T')[0];
    const hora = notaCredito.fecha.toISOString().split('T')[1].split('.')[0];

    return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
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
  <cbc:ID>${notaCredito.numero}</cbc:ID>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cbc:IssueTime>${hora}</cbc:IssueTime>
  <cbc:DocumentCurrencyCode>${notaCredito.moneda}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${comprobanteOriginal.numero}</cbc:ReferenceID>
    <cbc:ResponseCode>${tipoNota}</cbc:ResponseCode>
    <cbc:Description><![CDATA[${motivo}]]></cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${comprobanteOriginal.numero}</cbc:ID>
      <cbc:DocumentTypeCode>${comprobanteOriginal.tipo}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  ${this.generarXMLEmisor(notaCredito.emisor)}
  ${this.generarXMLReceptor(notaCredito.receptor)}
  ${this.generarXMLTotales(notaCredito)}
  ${this.generarXMLItems(notaCredito.items, notaCredito.moneda)}
</CreditNote>`;
  }

  /**
   * Genera sección XML del emisor
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
        (item, index) => `  <cac:CreditNoteLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:CreditedQuantity unitCode="${item.unidadMedida}">${item.cantidad}</cbc:CreditedQuantity>
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
  </cac:CreditNoteLine>`
      )
      .join('\n');
  }
}
