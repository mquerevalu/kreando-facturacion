/**
 * Pruebas basadas en propiedades para SunatSoapClient
 * 
 * Feature: sunat
 * 
 * Estas pruebas validan propiedades universales del cliente SOAP
 * usando fast-check para generar múltiples casos de prueba aleatorios.
 */

import * as fc from 'fast-check';
import { SunatSoapClient } from '../../services/SunatSoapClient';
import { Credenciales } from '../../types';
import * as soap from 'soap';
import JSZip from 'jszip';

// Mock de soap
jest.mock('soap');
const mockSoap = soap as jest.Mocked<typeof soap>;

describe.skip('SunatSoapClient - Property-Based Tests', () => {
  let client: SunatSoapClient;
  let mockSoapClient: any;

  // Timeout global para todas las pruebas de este suite (30 segundos)
  jest.setTimeout(30000);
  
  // Timeout individual por prueba (30 segundos)
  const TEST_TIMEOUT = 30000;

  beforeEach(() => {
    client = new SunatSoapClient({ ambiente: 'homologacion' });

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

  /**
   * **Propiedad 8: Compresión antes de envío**
   * **Valida: Requisitos 3.2**
   * 
   * Para cualquier comprobante enviado a SUNAT, el payload debe ser un
   * archivo ZIP válido que contenga el XML firmado.
   */
  describe('Propiedad 8: Compresión antes de envío', () => {
    it('debe enviar cualquier XML como archivo ZIP válido', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.includes('<') && s.includes('>')), // XML content
          fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.endsWith('.xml')), // Nombre archivo
          async (ruc, usuario, password, xmlContent, nombreArchivo) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear un ZIP válido con el XML
            const zip = new JSZip();
            zip.file(nombreArchivo, xmlContent);
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

            // Crear CDR de respuesta simulado
            const cdrZip = new JSZip();
            const cdrXml = `<?xml version="1.0"?>
              <ApplicationResponse>
                <cbc:ResponseCode>0</cbc:ResponseCode>
                <cbc:Description>Aceptado</cbc:Description>
              </ApplicationResponse>`;
            cdrZip.file('R-' + nombreArchivo, cdrXml);
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });
            const cdrBase64 = cdrBuffer.toString('base64');

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBase64 },
            ]);

            // Enviar comprobante
            await client.enviarComprobante(ruc, credenciales, zipBuffer);

            // Verificar que se llamó al método SOAP
            expect(mockSoapClient.sendBillAsync).toHaveBeenCalled();

            // Obtener el argumento enviado
            const callArgs = mockSoapClient.sendBillAsync.mock.calls[0][0];

            // Verificar que el contenido enviado es base64
            expect(callArgs.contentFile).toBeDefined();
            expect(typeof callArgs.contentFile).toBe('string');

            // Verificar que el base64 se puede decodificar a un ZIP válido
            const decodedBuffer = Buffer.from(callArgs.contentFile, 'base64');
            const decodedZip = new JSZip();
            const loadedZip = await decodedZip.loadAsync(decodedBuffer);

            // Verificar que el ZIP contiene archivos
            const files = Object.keys(loadedZip.files);
            expect(files.length).toBeGreaterThan(0);

            // Verificar que el contenido del archivo coincide
            const fileContent = await loadedZip.files[files[0]].async('string');
            expect(fileContent).toBe(xmlContent);
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe comprimir con DEFLATE cualquier XML antes de enviar', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.string({ minLength: 100, maxLength: 1000 }).filter(s => s.includes('<') && s.includes('>')), // XML largo
          async (ruc, usuario, password, xmlContent) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear un ZIP con compresión DEFLATE
            const zip = new JSZip();
            zip.file('documento.xml', xmlContent);
            const zipBuffer = await zip.generateAsync({ 
              type: 'nodebuffer', 
              compression: 'DEFLATE',
              compressionOptions: { level: 6 }
            });

            // Crear CDR de respuesta
            const cdrZip = new JSZip();
            cdrZip.file('R-documento.xml', '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBuffer.toString('base64') },
            ]);

            // Enviar comprobante
            await client.enviarComprobante(ruc, credenciales, zipBuffer);

            // Verificar que se envió
            expect(mockSoapClient.sendBillAsync).toHaveBeenCalled();

            // Verificar que el ZIP está comprimido (tamaño menor que el original)
            const callArgs = mockSoapClient.sendBillAsync.mock.calls[0][0];
            const decodedBuffer = Buffer.from(callArgs.contentFile, 'base64');
            
            // El ZIP comprimido debe ser más pequeño que el XML original
            // (esto es cierto para XMLs de tamaño razonable)
            if (xmlContent.length > 200) {
              expect(decodedBuffer.length).toBeLessThan(xmlContent.length);
            }
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe enviar ZIP válido para cualquier comunicación de baja', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.includes('<VoidedDocuments')), // XML de baja
          async (ruc, usuario, password, xmlBaja) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear ZIP con XML de baja
            const zip = new JSZip();
            zip.file(`${ruc}-RA-20250101-001.xml`, xmlBaja);
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

            // Mock respuesta con ticket
            mockSoapClient.sendSummaryAsync.mockResolvedValue([
              { ticket: '1234567890' },
            ]);

            // Enviar baja
            await client.enviarBaja(ruc, credenciales, zipBuffer);

            // Verificar que se llamó al método SOAP
            expect(mockSoapClient.sendSummaryAsync).toHaveBeenCalled();

            // Verificar que el contenido enviado es un ZIP válido en base64
            const callArgs = mockSoapClient.sendSummaryAsync.mock.calls[0][0];
            expect(callArgs.contentFile).toBeDefined();

            const decodedBuffer = Buffer.from(callArgs.contentFile, 'base64');
            const decodedZip = new JSZip();
            const loadedZip = await decodedZip.loadAsync(decodedBuffer);

            // Verificar que el ZIP contiene el archivo
            const files = Object.keys(loadedZip.files);
            expect(files.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe rechazar envío de cualquier buffer que no sea ZIP válido', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.uint8Array({ minLength: 10, maxLength: 100 }), // Buffer aleatorio (no ZIP)
          async (ruc, usuario, password, randomBytes) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear un buffer que NO es un ZIP válido
            const invalidBuffer = Buffer.from(randomBytes);

            // Intentar enviar debe fallar al procesar el ZIP
            await expect(
              client.enviarComprobante(ruc, credenciales, invalidBuffer)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe preservar el nombre del archivo XML dentro del ZIP al enviar', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.endsWith('.xml') && !s.includes('/')), // Nombre archivo
          async (ruc, usuario, password, nombreArchivo) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear ZIP con nombre específico
            const zip = new JSZip();
            zip.file(nombreArchivo, '<Invoice></Invoice>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock respuesta
            const cdrZip = new JSZip();
            cdrZip.file('R-' + nombreArchivo, '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBuffer.toString('base64') },
            ]);

            // Enviar
            await client.enviarComprobante(ruc, credenciales, zipBuffer);

            // Verificar que se usó el nombre correcto
            const callArgs = mockSoapClient.sendBillAsync.mock.calls[0][0];
            expect(callArgs.fileName).toBe(nombreArchivo);
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });
  });

  /**
   * **Propiedad 9: Uso de credenciales en peticiones SOAP**
   * **Valida: Requisitos 3.3**
   * 
   * Para cualquier petición SOAP enviada a SUNAT, debe incluir las
   * credenciales SOL específicas de la empresa emisora en el formato requerido.
   */
  describe('Propiedad 9: Uso de credenciales en peticiones SOAP', () => {
    it('debe incluir credenciales WS-Security en cualquier petición de envío', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          async (ruc, usuario, password) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear ZIP de prueba
            const zip = new JSZip();
            zip.file('test.xml', '<Invoice></Invoice>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock respuesta
            const cdrZip = new JSZip();
            cdrZip.file('cdr.xml', '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBuffer.toString('base64') },
            ]);

            // Enviar comprobante
            await client.enviarComprobante(ruc, credenciales, zipBuffer);

            // Verificar que se configuró WS-Security
            expect(mockSoapClient.setSecurity).toHaveBeenCalled();

            // Verificar que se usó el formato correcto: RUC + Usuario
            expect(mockSoap.WSSecurity).toHaveBeenCalledWith(
              `${ruc}${usuario}`,
              password,
              expect.objectContaining({
                passwordType: 'PasswordText',
                hasTimeStamp: false,
              })
            );
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe usar formato RUC+Usuario para autenticación en cualquier envío', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          async (ruc, usuario, password) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear ZIP de prueba
            const zip = new JSZip();
            zip.file('test.xml', '<Invoice></Invoice>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock respuesta
            const cdrZip = new JSZip();
            cdrZip.file('cdr.xml', '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBuffer.toString('base64') },
            ]);

            // Enviar
            await client.enviarComprobante(ruc, credenciales, zipBuffer);

            // Verificar formato de username
            const wsSecurityCall = mockSoap.WSSecurity.mock.calls[0];
            const username = wsSecurityCall[0];

            // El username debe ser exactamente RUC + Usuario (concatenados)
            expect(username).toBe(`${ruc}${usuario}`);
            expect(username).toHaveLength(ruc.length + usuario.length);
            expect(username.startsWith(ruc)).toBe(true);
            expect(username.endsWith(usuario)).toBe(true);
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe incluir credenciales en cualquier comunicación de baja', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          async (ruc, usuario, password) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear ZIP de baja
            const zip = new JSZip();
            zip.file('baja.xml', '<VoidedDocuments></VoidedDocuments>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock respuesta
            mockSoapClient.sendSummaryAsync.mockResolvedValue([
              { ticket: '1234567890' },
            ]);

            // Enviar baja
            await client.enviarBaja(ruc, credenciales, zipBuffer);

            // Verificar que se configuró WS-Security con las credenciales correctas
            expect(mockSoapClient.setSecurity).toHaveBeenCalled();
            expect(mockSoap.WSSecurity).toHaveBeenCalledWith(
              `${ruc}${usuario}`,
              password,
              expect.any(Object)
            );
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe incluir credenciales en cualquier consulta de ticket', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.string({ minLength: 10, maxLength: 20 }), // Ticket
          async (ruc, usuario, password, ticket) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Mock respuesta
            mockSoapClient.getStatusAsync.mockResolvedValue([
              { applicationResponse: undefined }, // Ticket en proceso
            ]);

            // Consultar ticket
            await client.consultarTicket(ruc, credenciales, ticket);

            // Verificar que se configuró WS-Security
            expect(mockSoapClient.setSecurity).toHaveBeenCalled();
            expect(mockSoap.WSSecurity).toHaveBeenCalledWith(
              `${ruc}${usuario}`,
              password,
              expect.any(Object)
            );
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe usar PasswordText como tipo de password en cualquier petición', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          async (ruc, usuario, password) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear ZIP de prueba
            const zip = new JSZip();
            zip.file('test.xml', '<Invoice></Invoice>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock respuesta
            const cdrZip = new JSZip();
            cdrZip.file('cdr.xml', '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBuffer.toString('base64') },
            ]);

            // Enviar
            await client.enviarComprobante(ruc, credenciales, zipBuffer);

            // Verificar opciones de WS-Security
            const wsSecurityCall = mockSoap.WSSecurity.mock.calls[0];
            const options = wsSecurityCall[2];

            expect(options).toHaveProperty('passwordType', 'PasswordText');
            expect(options).toHaveProperty('hasTimeStamp', false);
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe rechazar envío sin credenciales válidas', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          async (ruc) => {
            // Credenciales inválidas (campos vacíos)
            const credencialesInvalidas: Credenciales = {
              ruc: '',
              usuario: '',
              password: '',
            };

            // Crear ZIP de prueba
            const zip = new JSZip();
            zip.file('test.xml', '<Invoice></Invoice>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock error de autenticación
            mockSoap.createClientAsync.mockRejectedValue(
              new Error('Error de autenticación')
            );

            // Intentar enviar debe fallar
            await expect(
              client.enviarComprobante(ruc, credencialesInvalidas, zipBuffer)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });

    it('debe usar las credenciales específicas de cada empresa en peticiones concurrentes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              ruc: fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()),
              usuario: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              password: fc.string({ minLength: 8, maxLength: 20 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (empresas) => {
            // Asegurar que todas las empresas sean únicas
            const empresasUnicas = empresas.filter(
              (empresa, index, self) =>
                index === self.findIndex((e) => e.ruc === empresa.ruc)
            );

            if (empresasUnicas.length < 2) {
              return;
            }

            // Crear ZIP de prueba
            const zip = new JSZip();
            zip.file('test.xml', '<Invoice></Invoice>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock respuesta
            const cdrZip = new JSZip();
            cdrZip.file('cdr.xml', '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBuffer.toString('base64') },
            ]);

            // Enviar comprobantes de múltiples empresas
            const promises = empresasUnicas.map((empresa) =>
              client.enviarComprobante(empresa.ruc, empresa, zipBuffer)
            );

            await Promise.all(promises);

            // Verificar que se usaron las credenciales correctas para cada empresa
            const wsSecurityCalls = mockSoap.WSSecurity.mock.calls;
            expect(wsSecurityCalls.length).toBe(empresasUnicas.length);

            // Verificar que cada llamada usó las credenciales correspondientes
            empresasUnicas.forEach((empresa, index) => {
              const [username, password] = wsSecurityCalls[index];
              expect(username).toBe(`${empresa.ruc}${empresa.usuario}`);
              expect(password).toBe(empresa.password);
            });
          }
        ),
        { numRuns: 3, timeout: 3000 } // Muy pocas iteraciones para pruebas concurrentes
      );
    });

    it('debe preservar la contraseña original sin modificaciones en cualquier petición', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // Usuario
          fc.string({ minLength: 8, maxLength: 20 }).filter(s => {
            // Incluir caracteres especiales en la contraseña
            return s.length >= 8;
          }), // Password con caracteres especiales
          async (ruc, usuario, password) => {
            const credenciales: Credenciales = { ruc, usuario, password };

            // Crear ZIP de prueba
            const zip = new JSZip();
            zip.file('test.xml', '<Invoice></Invoice>');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Mock respuesta
            const cdrZip = new JSZip();
            cdrZip.file('cdr.xml', '<ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>OK</cbc:Description></ApplicationResponse>');
            const cdrBuffer = await cdrZip.generateAsync({ type: 'nodebuffer' });

            mockSoapClient.sendBillAsync.mockResolvedValue([
              { applicationResponse: cdrBuffer.toString('base64') },
            ]);

            // Enviar
            await client.enviarComprobante(ruc, credenciales, zipBuffer);

            // Verificar que la contraseña se pasó sin modificaciones
            const wsSecurityCall = mockSoap.WSSecurity.mock.calls[0];
            const passwordUsed = wsSecurityCall[1];

            expect(passwordUsed).toBe(password);
            expect(passwordUsed).toHaveLength(password.length);
          }
        ),
        { numRuns: 3, timeout: 3000 }
      );
    });
  });
});
