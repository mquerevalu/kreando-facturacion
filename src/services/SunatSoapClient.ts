/**
 * Cliente SOAP para comunicación con servicios web de SUNAT
 * 
 * Este módulo maneja la comunicación con los servicios web SOAP de SUNAT
 * para el envío de comprobantes electrónicos, comunicaciones de baja y
 * consulta de tickets.
 */

import * as soap from 'soap';
import JSZip from 'jszip';
import { CDR, Credenciales } from '../types';

/**
 * Configuración de endpoints de SUNAT
 */
export interface SunatEndpoints {
  produccion: string;
  homologacion: string;
}

/**
 * Opciones de configuración del cliente SOAP
 */
export interface SunatSoapClientOptions {
  ambiente?: 'produccion' | 'homologacion';
  timeout?: number; // Timeout en milisegundos
}

/**
 * Respuesta del servicio SOAP de SUNAT
 */
interface SunatSoapResponse {
  applicationResponse?: string; // CDR en base64
  ticket?: string; // Ticket para consultas asíncronas
}

/**
 * Interfaz del cliente SOAP de SUNAT
 */
export interface ISunatSoapClient {
  enviarComprobante(empresaRuc: string, credenciales: Credenciales, zip: Buffer): Promise<CDR>;
  enviarBaja(empresaRuc: string, credenciales: Credenciales, zip: Buffer): Promise<CDR>;
  consultarTicket(empresaRuc: string, credenciales: Credenciales, ticket: string): Promise<CDR>;
}

/**
 * Cliente SOAP para comunicación con SUNAT
 */
export class SunatSoapClient implements ISunatSoapClient {
  private readonly endpoints: SunatEndpoints = {
    produccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
    homologacion: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  };

  private readonly ambiente: 'produccion' | 'homologacion';
  private readonly timeout: number;

  constructor(options: SunatSoapClientOptions = {}) {
    this.ambiente = options.ambiente || 'homologacion';
    this.timeout = options.timeout || 60000; // 60 segundos por defecto
  }

  /**
   * Obtiene el endpoint según el ambiente configurado
   */
  private getEndpoint(): string {
    return this.endpoints[this.ambiente];
  }

  /**
   * Crea el cliente SOAP con autenticación
   */
  private async createSoapClient(credenciales: Credenciales): Promise<soap.Client> {
    const endpoint = this.getEndpoint();
    const wsdlUrl = `${endpoint}?wsdl`;

    try {
      const client = await soap.createClientAsync(wsdlUrl, {
        endpoint,
        wsdl_options: {
          timeout: this.timeout,
        },
      });

      // Configurar autenticación WS-Security
      const username = `${credenciales.ruc}${credenciales.usuario}`;
      const password = credenciales.password;

      client.setSecurity(
        new soap.WSSecurity(username, password, {
          passwordType: 'PasswordText',
          hasTimeStamp: false,
        })
      );

      return client;
    } catch (error) {
      throw new Error(
        `Error al crear cliente SOAP: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    }
  }

  /**
   * Comprime el XML en formato ZIP
   */
  private async comprimirXML(xmlContent: string, nombreArchivo: string): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(nombreArchivo, xmlContent);
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  /**
   * Parsea la respuesta CDR de SUNAT
   */
  private async parsearCDR(applicationResponse: string): Promise<CDR> {
    try {
      // El CDR viene en base64, decodificarlo
      const cdrBuffer = Buffer.from(applicationResponse, 'base64');
      
      // Descomprimir el ZIP del CDR
      const zip = new JSZip();
      const cdrZip = await zip.loadAsync(cdrBuffer);
      
      // Obtener el XML del CDR (primer archivo en el ZIP)
      const files = Object.keys(cdrZip.files);
      if (files.length === 0) {
        throw new Error('El CDR no contiene archivos');
      }
      
      const cdrXml = await cdrZip.files[files[0]].async('string');
      
      // Parsear el XML del CDR para extraer código y mensaje
      const codigoMatch = cdrXml.match(/<cbc:ResponseCode>(\d+)<\/cbc:ResponseCode>/);
      const mensajeMatch = cdrXml.match(/<cbc:Description>([^<]+)<\/cbc:Description>/);
      
      const codigo = codigoMatch ? codigoMatch[1] : '0';
      const mensaje = mensajeMatch ? mensajeMatch[1] : 'Sin mensaje';

      return {
        codigo,
        mensaje,
        xml: cdrXml,
        fechaRecepcion: new Date(),
      };
    } catch (error) {
      throw new Error(
        `Error al parsear CDR: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    }
  }

  /**
   * Envía un comprobante electrónico a SUNAT
   * 
   * @param empresaRuc - RUC de la empresa emisora
   * @param credenciales - Credenciales SOL de la empresa
   * @param zip - Buffer del archivo ZIP con el XML firmado
   * @returns CDR de SUNAT
   */
  async enviarComprobante(
    empresaRuc: string,
    credenciales: Credenciales,
    zip: Buffer
  ): Promise<CDR> {
    try {
      const client = await this.createSoapClient(credenciales);

      // Convertir el ZIP a base64
      const zipBase64 = zip.toString('base64');

      // Extraer el nombre del archivo XML del ZIP para construir el nombre del ZIP
      const zipObj = new JSZip();
      const zipContent = await zipObj.loadAsync(zip);
      const files = Object.keys(zipContent.files);
      let nombreXml = files[0] || 'documento.xml';
      
      // IMPORTANTE: SUNAT requiere que fileName sea el nombre del ZIP (CON extensión .zip)
      // El nombre debe ser: {RUC}-{TipoDoc}-{Serie}-{Numero}.zip
      // Ejemplo: 20123456789-03-B001-00000001.zip
      let nombreZip = nombreXml;
      if (nombreZip.endsWith('.xml')) {
        nombreZip = nombreZip.slice(0, -4); // Remover .xml
      }
      nombreZip = nombreZip + '.zip'; // Agregar .zip

      console.log(`Enviando a SUNAT - fileName: ${nombreZip}`);

      // Llamar al método sendBill del servicio SOAP
      const [result] = await client.sendBillAsync({
        fileName: nombreZip,
        contentFile: zipBase64,
      });

      const response = result as SunatSoapResponse;

      if (!response.applicationResponse) {
        throw new Error('SUNAT no devolvió un CDR en la respuesta');
      }

      return await this.parsearCDR(response.applicationResponse);
    } catch (error) {
      if (error instanceof Error) {
        // Si es un error de SOAP, extraer el mensaje de fallo
        if ('root' in error && typeof error.root === 'object') {
          const soapError = error.root as { Envelope?: { Body?: { Fault?: { faultstring?: string } } } };
          const faultString = soapError?.Envelope?.Body?.Fault?.faultstring;
          if (faultString) {
            throw new Error(`Error SOAP de SUNAT: ${faultString}`);
          }
        }
        throw new Error(`Error al enviar comprobante: ${error.message}`);
      }
      throw new Error('Error desconocido al enviar comprobante');
    }
  }

  /**
   * Envía una comunicación de baja a SUNAT
   * 
   * @param empresaRuc - RUC de la empresa emisora
   * @param credenciales - Credenciales SOL de la empresa
   * @param zip - Buffer del archivo ZIP con el XML de baja firmado
   * @returns CDR de SUNAT (puede contener un ticket para consulta posterior)
   */
  async enviarBaja(
    empresaRuc: string,
    credenciales: Credenciales,
    zip: Buffer
  ): Promise<CDR> {
    try {
      const client = await this.createSoapClient(credenciales);

      // Convertir el ZIP a base64
      const zipBase64 = zip.toString('base64');

      // Extraer el nombre del archivo del ZIP
      const zipObj = new JSZip();
      const zipContent = await zipObj.loadAsync(zip);
      const files = Object.keys(zipContent.files);
      const nombreArchivo = files[0] || 'baja.xml';

      // Llamar al método sendSummary del servicio SOAP
      const [result] = await client.sendSummaryAsync({
        fileName: nombreArchivo,
        contentFile: zipBase64,
      });

      const response = result as SunatSoapResponse;

      // Las comunicaciones de baja pueden devolver un ticket para consulta posterior
      if (response.ticket) {
        return {
          codigo: 'TICKET',
          mensaje: `Ticket generado: ${response.ticket}`,
          xml: '',
          fechaRecepcion: new Date(),
        };
      }

      if (!response.applicationResponse) {
        throw new Error('SUNAT no devolvió respuesta para la comunicación de baja');
      }

      return await this.parsearCDR(response.applicationResponse);
    } catch (error) {
      if (error instanceof Error) {
        if ('root' in error && typeof error.root === 'object') {
          const soapError = error.root as { Envelope?: { Body?: { Fault?: { faultstring?: string } } } };
          const faultString = soapError?.Envelope?.Body?.Fault?.faultstring;
          if (faultString) {
            throw new Error(`Error SOAP de SUNAT: ${faultString}`);
          }
        }
        throw new Error(`Error al enviar baja: ${error.message}`);
      }
      throw new Error('Error desconocido al enviar baja');
    }
  }

  /**
   * Consulta el estado de un ticket en SUNAT
   * 
   * @param empresaRuc - RUC de la empresa emisora
   * @param credenciales - Credenciales SOL de la empresa
   * @param ticket - Número de ticket a consultar
   * @returns CDR de SUNAT con el resultado del procesamiento
   */
  async consultarTicket(
    empresaRuc: string,
    credenciales: Credenciales,
    ticket: string
  ): Promise<CDR> {
    try {
      const client = await this.createSoapClient(credenciales);

      // Llamar al método getStatus del servicio SOAP
      const [result] = await client.getStatusAsync({
        ticket,
      });

      const response = result as SunatSoapResponse;

      if (!response.applicationResponse) {
        // Si no hay respuesta aún, el ticket está en proceso
        return {
          codigo: 'PROCESANDO',
          mensaje: 'El ticket está siendo procesado por SUNAT',
          xml: '',
          fechaRecepcion: new Date(),
        };
      }

      return await this.parsearCDR(response.applicationResponse);
    } catch (error) {
      if (error instanceof Error) {
        if ('root' in error && typeof error.root === 'object') {
          const soapError = error.root as { Envelope?: { Body?: { Fault?: { faultstring?: string } } } };
          const faultString = soapError?.Envelope?.Body?.Fault?.faultstring;
          if (faultString) {
            throw new Error(`Error SOAP de SUNAT: ${faultString}`);
          }
        }
        throw new Error(`Error al consultar ticket: ${error.message}`);
      }
      throw new Error('Error desconocido al consultar ticket');
    }
  }
}
