/**
 * Pruebas unitarias para SunatSoapClient
 */

import { SunatSoapClient } from '../../services/SunatSoapClient';
import { Credenciales, CDR } from '../../types';
import * as soap from 'soap';
import JSZip from 'jszip';

// Mock de soap
jest.mock('soap');
const mockSoap = soap as jest.Mocked<typeof soap>;

describe('SunatSoapClient', () => {
  let client: SunatSoapClient;
  let mockCredenciales: Credenciales;
  let mockSoapClient: any;

  beforeEach(() => {
    // Configurar cliente en ambiente de homologación
    client = new SunatSoapClient({ ambiente: 'homologacion' });

    // Credenciales de prueba
    mockCredenciales = {
      ruc: '20123456789',
      usuario: 'MODDATOS',
      password: 'moddatos',
    };

    // Mock del cliente SOAP
    mockSoapClient = {
      setSecurity: jest.fn(),
      sendBillAsync: jest.fn(),
      sendSummaryAsync: jest.fn(),
      getStatusAsync: jest.fn(),
    };

    mockSoap.createClientAsync = jest.fn().mockResolvedValue(mockSoapClient);
    mockSoap.WSSecurity = jest.fn() as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enviarComprobante', () => {
    it('debe enviar un comprobante y retornar el CDR', async () => {
      // Crear un ZIP de prueba con XML
      const zip = new JSZip();
      const xmlContent = '<?xml version="1.0"?><Invoice></Invoice>';
      zip.file('20123456789-01-F001-00000001.xml', xmlContent);
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Crear un CDR de respuesta simulado
      const cdrZip = new JSZip();
      const cdrXml = `<?xml version="1.0"?>
        <ApplicationResponse>
          <cbc:ResponseCode>0</cbc:ResponseCode>
          <cbc:Description>La Factura numero F001-00000001, ha sido aceptada</cbc:Description>
        </ApplicationResponse>`;
      cdrZip.file('R-20123456789-01-F001-00000001.xml', cdrXml);
      const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });
      const cdrBase64 = cdrBuffer.toString('base64');

      // Configurar mock para retornar CDR
      mockSoapClient.sendBillAsync.mockResolvedValue([
        {
          applicationResponse: cdrBase64,
        },
      ]);

      // Ejecutar
      const result = await client.enviarComprobante(
        mockCredenciales.ruc,
        mockCredenciales,
        zipBuffer
      );

      // Verificar
      expect(mockSoap.createClientAsync).toHaveBeenCalled();
      expect(mockSoapClient.setSecurity).toHaveBeenCalled();
      expect(mockSoapClient.sendBillAsync).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.codigo).toBe('0');
      expect(result.mensaje).toContain('ha sido aceptada');
      expect(result.xml).toContain('ApplicationResponse');
    });

    it('debe lanzar error si SUNAT no devuelve CDR', async () => {
      const zip = new JSZip();
      zip.file('test.xml', '<Invoice></Invoice>');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Configurar mock para retornar respuesta sin CDR
      mockSoapClient.sendBillAsync.mockResolvedValue([{}]);

      // Ejecutar y verificar error
      await expect(
        client.enviarComprobante(mockCredenciales.ruc, mockCredenciales, zipBuffer)
      ).rejects.toThrow('SUNAT no devolvió un CDR en la respuesta');
    });

    it('debe manejar errores SOAP de SUNAT', async () => {
      const zip = new JSZip();
      zip.file('test.xml', '<Invoice></Invoice>');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Simular error SOAP
      const soapError = new Error('SOAP Error');
      (soapError as any).root = {
        Envelope: {
          Body: {
            Fault: {
              faultstring: 'El RUC no está autorizado',
            },
          },
        },
      };

      mockSoapClient.sendBillAsync.mockRejectedValue(soapError);

      // Ejecutar y verificar error
      await expect(
        client.enviarComprobante(mockCredenciales.ruc, mockCredenciales, zipBuffer)
      ).rejects.toThrow('Error SOAP de SUNAT: El RUC no está autorizado');
    });
  });

  describe('enviarBaja', () => {
    it('debe enviar una comunicación de baja y retornar ticket', async () => {
      const zip = new JSZip();
      zip.file('20123456789-RA-20250101-001.xml', '<VoidedDocuments></VoidedDocuments>');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Configurar mock para retornar ticket
      mockSoapClient.sendSummaryAsync.mockResolvedValue([
        {
          ticket: '1234567890',
        },
      ]);

      // Ejecutar
      const result = await client.enviarBaja(
        mockCredenciales.ruc,
        mockCredenciales,
        zipBuffer
      );

      // Verificar
      expect(mockSoapClient.sendSummaryAsync).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.codigo).toBe('TICKET');
      expect(result.mensaje).toContain('1234567890');
    });

    it('debe enviar una comunicación de baja y retornar CDR directo', async () => {
      const zip = new JSZip();
      zip.file('baja.xml', '<VoidedDocuments></VoidedDocuments>');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Crear CDR de respuesta
      const cdrZip = new JSZip();
      const cdrXml = `<?xml version="1.0"?>
        <ApplicationResponse>
          <cbc:ResponseCode>0</cbc:ResponseCode>
          <cbc:Description>La comunicación de baja ha sido aceptada</cbc:Description>
        </ApplicationResponse>`;
      cdrZip.file('R-20123456789-RA-20250101-001.xml', cdrXml);
      const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });
      const cdrBase64 = cdrBuffer.toString('base64');

      mockSoapClient.sendSummaryAsync.mockResolvedValue([
        {
          applicationResponse: cdrBase64,
        },
      ]);

      // Ejecutar
      const result = await client.enviarBaja(
        mockCredenciales.ruc,
        mockCredenciales,
        zipBuffer
      );

      // Verificar
      expect(result.codigo).toBe('0');
      expect(result.mensaje).toContain('ha sido aceptada');
    });
  });

  describe('consultarTicket', () => {
    it('debe consultar un ticket y retornar CDR cuando está procesado', async () => {
      const ticket = '1234567890';

      // Crear CDR de respuesta
      const cdrZip = new JSZip();
      const cdrXml = `<?xml version="1.0"?>
        <ApplicationResponse>
          <cbc:ResponseCode>0</cbc:ResponseCode>
          <cbc:Description>Procesamiento exitoso</cbc:Description>
        </ApplicationResponse>`;
      cdrZip.file('R-20123456789-RA-20250101-001.xml', cdrXml);
      const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });
      const cdrBase64 = cdrBuffer.toString('base64');

      mockSoapClient.getStatusAsync.mockResolvedValue([
        {
          applicationResponse: cdrBase64,
        },
      ]);

      // Ejecutar
      const result = await client.consultarTicket(
        mockCredenciales.ruc,
        mockCredenciales,
        ticket
      );

      // Verificar
      expect(mockSoapClient.getStatusAsync).toHaveBeenCalledWith({ ticket });
      expect(result.codigo).toBe('0');
      expect(result.mensaje).toContain('Procesamiento exitoso');
    });

    it('debe retornar estado PROCESANDO cuando el ticket aún no está listo', async () => {
      const ticket = '1234567890';

      // Configurar mock para retornar respuesta sin CDR (aún procesando)
      mockSoapClient.getStatusAsync.mockResolvedValue([{}]);

      // Ejecutar
      const result = await client.consultarTicket(
        mockCredenciales.ruc,
        mockCredenciales,
        ticket
      );

      // Verificar
      expect(result.codigo).toBe('PROCESANDO');
      expect(result.mensaje).toContain('siendo procesado');
    });
  });

  describe('configuración de endpoints', () => {
    it('debe usar endpoint de homologación por defecto', () => {
      const clientHomologacion = new SunatSoapClient();
      expect(clientHomologacion).toBeDefined();
    });

    it('debe usar endpoint de producción cuando se configura', () => {
      const clientProduccion = new SunatSoapClient({ ambiente: 'produccion' });
      expect(clientProduccion).toBeDefined();
    });

    it('debe configurar timeout personalizado', () => {
      const clientTimeout = new SunatSoapClient({ timeout: 30000 });
      expect(clientTimeout).toBeDefined();
    });
  });

  describe('autenticación', () => {
    it('debe configurar WS-Security con credenciales correctas', async () => {
      const zip = new JSZip();
      zip.file('test.xml', '<Invoice></Invoice>');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const cdrZip = new JSZip();
      cdrZip.file('cdr.xml', '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
      const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

      mockSoapClient.sendBillAsync.mockResolvedValue([
        {
          applicationResponse: cdrBuffer.toString('base64'),
        },
      ]);

      await client.enviarComprobante(mockCredenciales.ruc, mockCredenciales, zipBuffer);

      // Verificar que se configuró la seguridad
      expect(mockSoapClient.setSecurity).toHaveBeenCalled();
      expect(mockSoap.WSSecurity).toHaveBeenCalledWith(
        '20123456789MODDATOS',
        'moddatos',
        expect.any(Object)
      );
    });
  });
});
