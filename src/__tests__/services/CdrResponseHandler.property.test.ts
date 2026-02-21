/**
 * Pruebas basadas en propiedades para CdrResponseHandler
 * 
 * Feature: sunat
 * Property 10: Almacenamiento de CDR
 * Property 11: Registro de errores de rechazo
 */

import * as fc from 'fast-check';
import { CdrResponseHandler } from '../../services/CdrResponseHandler';
import { DynamoDBComprobanteRepository } from '../../repositories/ComprobanteRepository';
import { S3FileRepository } from '../../repositories/S3Repository';
import { CDR, EstadoComprobante } from '../../types';

// Mocks
jest.mock('../../repositories/ComprobanteRepository');
jest.mock('../../repositories/S3Repository');

describe('CdrResponseHandler - Property-Based Tests', () => {
  // Generadores de datos arbitrarios
  const arbRuc = fc.stringMatching(/^[0-9]{11}$/);
  
  const arbNumeroComprobante = fc.oneof(
    fc.stringMatching(/^B[0-9]{3}-[0-9]{8}$/), // Boleta
    fc.stringMatching(/^F[0-9]{3}-[0-9]{8}$/)  // Factura
  );

  const arbCodigoAceptado = fc.oneof(
    fc.constant('0'),
    fc.integer({ min: 1, max: 999 }).map(String),
    fc.integer({ min: 4000, max: 4999 }).map(String)
  );

  const arbCodigoRechazado = fc.integer({ min: 2000, max: 2999 }).map(String);

  const arbCDRAceptado = fc.record({
    codigo: arbCodigoAceptado,
    mensaje: fc.string({ minLength: 10, maxLength: 200 }),
    xml: fc.string({ minLength: 100, maxLength: 1000 }).map(s => `<xml>${s}</xml>`),
    fechaRecepcion: fc.date(),
  });

  const arbCDRRechazado = fc.record({
    codigo: arbCodigoRechazado,
    mensaje: fc.string({ minLength: 10, maxLength: 200 }),
    xml: fc.string({ minLength: 100, maxLength: 1000 }).map(s => `<xml>${s}</xml>`),
    fechaRecepcion: fc.date(),
  });

  let handler: CdrResponseHandler;
  let mockComprobanteRepo: jest.Mocked<DynamoDBComprobanteRepository>;
  let mockS3Repo: jest.Mocked<S3FileRepository>;

  beforeEach(() => {
    // Crear mocks
    mockComprobanteRepo = new DynamoDBComprobanteRepository() as jest.Mocked<DynamoDBComprobanteRepository>;
    mockS3Repo = new S3FileRepository() as jest.Mocked<S3FileRepository>;

    // Configurar mocks
    mockComprobanteRepo.guardarCDR = jest.fn().mockResolvedValue(undefined);
    mockComprobanteRepo.actualizarEstado = jest.fn().mockResolvedValue(undefined);
    mockS3Repo.guardarXML = jest.fn().mockResolvedValue('ruta/al/archivo.xml');

    // Crear handler con mocks
    handler = new CdrResponseHandler({
      comprobanteRepository: mockComprobanteRepo,
      s3Repository: mockS3Repo,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 3.4**
   * 
   * Propiedad 10: Almacenamiento de CDR
   * 
   * Para cualquier CDR recibido de SUNAT, el sistema debe almacenarlo
   * y asociarlo correctamente con el comprobante correspondiente.
   * 
   * Esta propiedad verifica que:
   * 1. El CDR se almacena en S3 cuando contiene XML
   * 2. Los metadatos del CDR se almacenan en DynamoDB
   * 3. El estado del comprobante se actualiza según el código de respuesta
   * 4. El almacenamiento funciona para cualquier combinación válida de RUC y número
   */
  it('Property 10: debe almacenar cualquier CDR recibido en S3 y DynamoDB', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRuc,
        arbNumeroComprobante,
        arbCDRAceptado,
        async (empresaRuc, numeroComprobante, cdr) => {
          // Ejecutar
          await handler.procesarCDR(empresaRuc, numeroComprobante, cdr);

          // Verificar que se almacenó en S3 (si hay XML)
          if (cdr.xml) {
            expect(mockS3Repo.guardarXML).toHaveBeenCalledWith(
              empresaRuc,
              `cdr-${numeroComprobante}`,
              cdr.xml
            );
          }

          // Verificar que se almacenó en DynamoDB
          expect(mockComprobanteRepo.guardarCDR).toHaveBeenCalledWith(
            empresaRuc,
            numeroComprobante,
            cdr
          );

          // Verificar que se actualizó el estado
          expect(mockComprobanteRepo.actualizarEstado).toHaveBeenCalledWith(
            empresaRuc,
            numeroComprobante,
            expect.any(String)
          );

          // Limpiar mocks para la siguiente iteración
          jest.clearAllMocks();
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  /**
   * **Validates: Requirements 3.5**
   * 
   * Propiedad 11: Registro de errores de rechazo
   * 
   * Para cualquier comprobante rechazado por SUNAT, el sistema debe
   * registrar el código y mensaje de error completo.
   * 
   * Esta propiedad verifica que:
   * 1. Los CDR con códigos de rechazo (2000-2999) se almacenan correctamente
   * 2. El código y mensaje de error se preservan en DynamoDB
   * 3. El estado del comprobante se actualiza a RECHAZADO
   * 4. El registro funciona para cualquier código de rechazo válido
   */
  it('Property 11: debe registrar código y mensaje de error para cualquier rechazo', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRuc,
        arbNumeroComprobante,
        arbCDRRechazado,
        async (empresaRuc, numeroComprobante, cdr) => {
          // Ejecutar
          await handler.procesarCDR(empresaRuc, numeroComprobante, cdr);

          // Verificar que se guardó el CDR completo (con código y mensaje)
          expect(mockComprobanteRepo.guardarCDR).toHaveBeenCalledWith(
            empresaRuc,
            numeroComprobante,
            expect.objectContaining({
              codigo: cdr.codigo,
              mensaje: cdr.mensaje,
            })
          );

          // Verificar que el estado se actualizó a RECHAZADO
          expect(mockComprobanteRepo.actualizarEstado).toHaveBeenCalledWith(
            empresaRuc,
            numeroComprobante,
            EstadoComprobante.RECHAZADO
          );

          // Limpiar mocks para la siguiente iteración
          jest.clearAllMocks();
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  /**
   * Propiedad adicional: Determinación correcta de estado
   * 
   * Para cualquier código de respuesta de SUNAT, el sistema debe
   * determinar correctamente el estado del comprobante.
   */
  it('debe determinar correctamente el estado para cualquier código de SUNAT', async () => {
    await fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('0'),
          fc.integer({ min: 1, max: 999 }).map(String),
          fc.integer({ min: 2000, max: 2999 }).map(String),
          fc.integer({ min: 4000, max: 4999 }).map(String),
          fc.constant('TICKET'),
          fc.constant('PROCESANDO')
        ),
        (codigo) => {
          const estado = handler.determinarEstado(codigo);

          // El estado debe ser uno de los valores válidos
          const estadosValidos = [
            EstadoComprobante.ACEPTADO,
            EstadoComprobante.RECHAZADO,
            EstadoComprobante.ENVIADO,
          ];
          expect(estadosValidos).toContain(estado);

          // Verificar lógica específica según el código
          const codigoNum = parseInt(codigo, 10);
          
          if (codigo === '0' || (codigoNum >= 1 && codigoNum <= 999) || (codigoNum >= 4000 && codigoNum <= 4999)) {
            expect(estado).toBe(EstadoComprobante.ACEPTADO);
          } else if (codigoNum >= 2000 && codigoNum <= 2999) {
            expect(estado).toBe(EstadoComprobante.RECHAZADO);
          } else if (codigo === 'TICKET' || codigo === 'PROCESANDO') {
            expect(estado).toBe(EstadoComprobante.ENVIADO);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Propiedad adicional: Aislamiento multi-tenant
   * 
   * Para cualquier par de empresas diferentes, el almacenamiento de CDR
   * debe mantener el aislamiento de datos.
   */
  it('debe mantener aislamiento de datos entre diferentes empresas', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRuc,
        arbRuc,
        arbNumeroComprobante,
        arbCDRAceptado,
        async (ruc1, ruc2, numero, cdr) => {
          // Asegurar que los RUCs sean diferentes
          fc.pre(ruc1 !== ruc2);

          // Procesar CDR para empresa 1
          await handler.procesarCDR(ruc1, numero, cdr);
          
          // Verificar que se usó el RUC correcto
          expect(mockS3Repo.guardarXML).toHaveBeenCalledWith(
            ruc1,
            expect.any(String),
            expect.any(String)
          );
          expect(mockComprobanteRepo.guardarCDR).toHaveBeenCalledWith(
            ruc1,
            expect.any(String),
            expect.any(Object)
          );

          jest.clearAllMocks();

          // Procesar CDR para empresa 2
          await handler.procesarCDR(ruc2, numero, cdr);
          
          // Verificar que se usó el RUC correcto (diferente)
          expect(mockS3Repo.guardarXML).toHaveBeenCalledWith(
            ruc2,
            expect.any(String),
            expect.any(String)
          );
          expect(mockComprobanteRepo.guardarCDR).toHaveBeenCalledWith(
            ruc2,
            expect.any(String),
            expect.any(Object)
          );

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });
});
