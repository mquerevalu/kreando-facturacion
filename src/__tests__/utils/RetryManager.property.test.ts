/**
 * Pruebas de Propiedad para RetryManager
 * 
 * Feature: sunat
 * 
 * Estas pruebas verifican las propiedades de corrección del sistema de reintentos:
 * - Propiedad 21: Reintentos ante fallos de comunicación
 * - Propiedad 22: Registro de errores de red
 * 
 * Valida: Requisitos 7.1, 7.2, 7.4
 */

import * as fc from 'fast-check';
import { RetryManager, RetryConfig } from '../../utils/RetryManager';
import { DynamoDBComprobanteRepository } from '../../repositories/ComprobanteRepository';
import { EstadoComprobante } from '../../types';

// Mock del repositorio
jest.mock('../../repositories/ComprobanteRepository');

describe('RetryManager - Property-Based Tests', () => {
  let mockRepository: jest.Mocked<DynamoDBComprobanteRepository>;
  let retryManager: RetryManager;

  beforeEach(() => {
    // Crear mock del repositorio
    mockRepository = new DynamoDBComprobanteRepository() as jest.Mocked<DynamoDBComprobanteRepository>;
    mockRepository.actualizarEstado = jest.fn().mockResolvedValue(undefined);
    mockRepository.obtenerComprobante = jest.fn().mockResolvedValue({
      empresaRuc: '20123456789',
      numero: 'B001-00000001',
      estado: EstadoComprobante.PENDIENTE,
    });

    // Crear RetryManager con configuración de prueba (delays más cortos)
    retryManager = new RetryManager(mockRepository, {
      maxRetries: 3,
      initialDelayMs: 10, // 10ms para pruebas rápidas
      backoffMultiplier: 2,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Propiedad 21: Reintentos ante fallos de comunicación**
   * 
   * Para cualquier fallo de comunicación con el servicio web de SUNAT,
   * el sistema debe realizar exactamente 3 intentos antes de marcar
   * el comprobante como pendiente.
   * 
   * **Valida: Requisitos 7.1, 7.2**
   */
  describe('Propiedad 21: Reintentos ante fallos de comunicación', () => {
    it('debe realizar exactamente 3 reintentos para cualquier error de red', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            empresaRuc: fc.stringMatching(/^[0-9]{11}$/),
            numeroComprobante: fc.stringMatching(/^[BF][0-9]{3}-[0-9]{8}$/),
            errorType: fc.constantFrom(
              'ETIMEDOUT',
              'ECONNREFUSED',
              'ECONNRESET',
              'ENOTFOUND',
              'Network error',
              'Socket hang up',
              'Service unavailable'
            ),
          }),
          async ({ empresaRuc, numeroComprobante, errorType }) => {
            // Arrange: Crear una operación que siempre falla con error de red
            let attemptCount = 0;
            const failingOperation = jest.fn(async () => {
              attemptCount++;
              throw new Error(errorType);
            });

            // Act: Ejecutar la operación con reintentos
            const result = await retryManager.executeWithRetry(
              failingOperation,
              empresaRuc,
              numeroComprobante
            );

            // Assert: Verificar que se realizaron exactamente 4 intentos (1 inicial + 3 reintentos)
            expect(attemptCount).toBe(4);
            expect(result.success).toBe(false);
            expect(result.totalAttempts).toBe(4);
            expect(result.errors).toHaveLength(4);

            // Verificar que el comprobante fue marcado como PENDIENTE
            expect(mockRepository.actualizarEstado).toHaveBeenCalledWith(
              empresaRuc,
              numeroComprobante,
              EstadoComprobante.PENDIENTE
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('debe tener éxito si la operación funciona en cualquier intento (1-4)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            empresaRuc: fc.stringMatching(/^[0-9]{11}$/),
            numeroComprobante: fc.stringMatching(/^[BF][0-9]{3}-[0-9]{8}$/),
            successAttempt: fc.integer({ min: 1, max: 4 }), // Éxito en intento 1, 2, 3 o 4
          }),
          async ({ empresaRuc, numeroComprobante, successAttempt }) => {
            // Arrange: Crear una operación que falla N-1 veces y luego tiene éxito
            let attemptCount = 0;
            const eventuallySuccessfulOperation = jest.fn(async () => {
              attemptCount++;
              if (attemptCount < successAttempt) {
                throw new Error('ETIMEDOUT');
              }
              return { success: true, data: 'CDR' };
            });

            // Act: Ejecutar la operación con reintentos
            const result = await retryManager.executeWithRetry(
              eventuallySuccessfulOperation,
              empresaRuc,
              numeroComprobante
            );

            // Assert: Verificar que tuvo éxito
            expect(result.success).toBe(true);
            expect(result.totalAttempts).toBe(successAttempt);
            expect(result.data).toEqual({ success: true, data: 'CDR' });
            expect(result.errors).toHaveLength(successAttempt - 1);

            // Verificar que NO se marcó como PENDIENTE
            expect(mockRepository.actualizarEstado).not.toHaveBeenCalledWith(
              empresaRuc,
              numeroComprobante,
              EstadoComprobante.PENDIENTE
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('debe aplicar backoff exponencial entre reintentos', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            empresaRuc: fc.stringMatching(/^[0-9]{11}$/),
            numeroComprobante: fc.stringMatching(/^[BF][0-9]{3}-[0-9]{8}$/),
          }),
          async ({ empresaRuc, numeroComprobante }) => {
            // Arrange: Crear una operación que siempre falla
            const failingOperation = jest.fn(async () => {
              throw new Error('ETIMEDOUT');
            });

            const startTime = Date.now();

            // Act: Ejecutar la operación con reintentos
            const result = await retryManager.executeWithRetry(
              failingOperation,
              empresaRuc,
              numeroComprobante
            );

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Assert: Verificar que los delays fueron aplicados
            // Delays esperados: 10ms, 20ms, 40ms = 70ms total mínimo
            expect(result.errors).toHaveLength(4);
            expect(result.errors[0].delayMs).toBe(10); // 10 * 2^0
            expect(result.errors[1].delayMs).toBe(20); // 10 * 2^1
            expect(result.errors[2].delayMs).toBe(40); // 10 * 2^2
            expect(result.errors[3].delayMs).toBe(0); // No hay delay después del último intento

            // Verificar que el tiempo total es al menos la suma de los delays
            expect(totalTime).toBeGreaterThanOrEqual(70);
          }
        ),
        { numRuns: 50 } // Menos runs porque involucra timing
      );
    });
  });

  /**
   * **Propiedad 22: Registro de errores de red**
   * 
   * Para cualquier error de red o comunicación, el sistema debe registrar
   * el error con timestamp, detalles del error y contexto del comprobante.
   * 
   * **Valida: Requisitos 7.4**
   */
  describe('Propiedad 22: Registro de errores de red', () => {
    it('debe registrar cada error con timestamp y detalles completos', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            empresaRuc: fc.stringMatching(/^[0-9]{11}$/),
            numeroComprobante: fc.stringMatching(/^[BF][0-9]{3}-[0-9]{8}$/),
            errorMessage: fc.string({ minLength: 10, maxLength: 100 }),
          }),
          async ({ empresaRuc, numeroComprobante, errorMessage }) => {
            // Arrange: Crear una operación que falla con un mensaje específico
            const failingOperation = jest.fn(async () => {
              throw new Error(errorMessage);
            });

            const beforeTime = new Date();

            // Act: Ejecutar la operación con reintentos
            const result = await retryManager.executeWithRetry(
              failingOperation,
              empresaRuc,
              numeroComprobante
            );

            const afterTime = new Date();

            // Assert: Verificar que todos los errores fueron registrados
            expect(result.errors).toHaveLength(4);

            result.errors.forEach((error, index) => {
              // Verificar que tiene timestamp
              expect(error.timestamp).toBeInstanceOf(Date);
              expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
              expect(error.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());

              // Verificar que tiene el número de intento
              expect(error.attempt).toBe(index + 1);

              // Verificar que tiene el mensaje de error
              expect(error.errorMessage).toBe(errorMessage);

              // Verificar que tiene el delay calculado
              expect(error.delayMs).toBeGreaterThanOrEqual(0);

              // Verificar que tiene los detalles del error
              expect(error.errorDetails).toBeInstanceOf(Error);
              expect((error.errorDetails as Error).message).toBe(errorMessage);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('debe registrar errores con información de contexto del comprobante', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            empresaRuc: fc.stringMatching(/^[0-9]{11}$/),
            numeroComprobante: fc.stringMatching(/^[BF][0-9]{3}-[0-9]{8}$/),
          }),
          async ({ empresaRuc, numeroComprobante }) => {
            // Arrange: Crear una operación que falla
            const failingOperation = jest.fn(async () => {
              throw new Error('Network error');
            });

            // Spy en console.error para verificar el logging
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            // Act: Ejecutar la operación con reintentos
            await retryManager.executeWithRetry(failingOperation, empresaRuc, numeroComprobante);

            // Assert: Verificar que se registró el contexto del comprobante
            const allLogs = [
              ...consoleLogSpy.mock.calls.map((call) => call.join(' ')),
              ...consoleErrorSpy.mock.calls.map((call) => call.join(' ')),
            ].join(' ');

            expect(allLogs).toContain(empresaRuc);
            expect(allLogs).toContain(numeroComprobante);

            // Limpiar spies
            consoleErrorSpy.mockRestore();
            consoleLogSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('debe preservar el orden cronológico de los errores', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            empresaRuc: fc.stringMatching(/^[0-9]{11}$/),
            numeroComprobante: fc.stringMatching(/^[BF][0-9]{3}-[0-9]{8}$/),
          }),
          async ({ empresaRuc, numeroComprobante }) => {
            // Arrange: Crear una operación que falla
            const failingOperation = jest.fn(async () => {
              throw new Error('ETIMEDOUT');
            });

            // Act: Ejecutar la operación con reintentos
            const result = await retryManager.executeWithRetry(
              failingOperation,
              empresaRuc,
              numeroComprobante
            );

            // Assert: Verificar que los timestamps están en orden cronológico
            for (let i = 1; i < result.errors.length; i++) {
              const prevTimestamp = result.errors[i - 1].timestamp.getTime();
              const currTimestamp = result.errors[i].timestamp.getTime();
              expect(currTimestamp).toBeGreaterThanOrEqual(prevTimestamp);
            }

            // Verificar que los números de intento son secuenciales
            result.errors.forEach((error, index) => {
              expect(error.attempt).toBe(index + 1);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Pruebas adicionales para clasificación de errores
   */
  describe('Clasificación de errores recuperables y no recuperables', () => {
    it('debe identificar correctamente errores recuperables', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'timeout',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ECONNRESET',
            'ENOTFOUND',
            'network error',
            'socket hang up',
            'service unavailable',
            '503 Service Unavailable',
            '504 Gateway Timeout'
          ),
          (errorMessage) => {
            const error = new Error(errorMessage);
            expect(RetryManager.isRecoverableError(error)).toBe(true);
            expect(RetryManager.isNonRecoverableError(error)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('debe identificar correctamente errores no recuperables', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'unauthorized',
            '401 Unauthorized',
            'forbidden',
            '403 Forbidden',
            'not found',
            '404 Not Found',
            'bad request',
            '400 Bad Request',
            'invalid credentials',
            'ya fue aceptado',
            'certificado vencido',
            'certificado inválido'
          ),
          (errorMessage) => {
            const error = new Error(errorMessage);
            expect(RetryManager.isNonRecoverableError(error)).toBe(true);
            expect(RetryManager.isRecoverableError(error)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
