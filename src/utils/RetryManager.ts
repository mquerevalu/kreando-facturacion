/**
 * Gestor de Reintentos con Backoff Exponencial
 * 
 * Este módulo implementa la lógica de reintentos para el envío de comprobantes a SUNAT:
 * - 3 reintentos con backoff exponencial (1s, 2s, 4s)
 * - Registro de errores con timestamp y detalles
 * - Marcado de comprobantes como pendientes tras fallos
 * 
 * Requisitos: 7.1, 7.2, 7.4
 */

import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { EstadoComprobante } from '../types';

/**
 * Configuración de reintentos
 */
export interface RetryConfig {
  maxRetries: number; // Número máximo de reintentos (por defecto 3)
  initialDelayMs: number; // Delay inicial en milisegundos (por defecto 1000ms)
  backoffMultiplier: number; // Multiplicador para backoff exponencial (por defecto 2)
}

/**
 * Información de un error de reintento
 */
export interface RetryError {
  timestamp: Date;
  attempt: number;
  errorMessage: string;
  errorDetails?: any;
  delayMs: number;
}

/**
 * Resultado de una operación con reintentos
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  errors: RetryError[];
  totalAttempts: number;
}

/**
 * Gestor de reintentos con backoff exponencial
 */
export class RetryManager {
  private config: RetryConfig;
  private comprobanteRepository: DynamoDBComprobanteRepository;

  constructor(
    comprobanteRepository: DynamoDBComprobanteRepository,
    config?: Partial<RetryConfig>
  ) {
    this.comprobanteRepository = comprobanteRepository;
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      initialDelayMs: config?.initialDelayMs ?? 1000,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
    };
  }

  /**
   * Ejecuta una operación con reintentos y backoff exponencial
   * 
   * @param operation - Función asíncrona a ejecutar
   * @param empresaRuc - RUC de la empresa (para logging)
   * @param numeroComprobante - Número del comprobante (para logging)
   * @returns Resultado de la operación con información de reintentos
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    empresaRuc: string,
    numeroComprobante: string
  ): Promise<RetryResult<T>> {
    const errors: RetryError[] = [];
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        console.log(
          `Intento ${attempt + 1}/${this.config.maxRetries + 1} - Empresa: ${empresaRuc}, Comprobante: ${numeroComprobante}`
        );

        const result = await operation();

        // Operación exitosa
        return {
          success: true,
          data: result,
          errors,
          totalAttempts: attempt + 1,
        };
      } catch (error) {
        attempt++;

        // Calcular el delay para el siguiente intento (backoff exponencial)
        const delayMs =
          attempt <= this.config.maxRetries
            ? this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1)
            : 0;

        // Registrar el error
        const retryError: RetryError = {
          timestamp: new Date(),
          attempt,
          errorMessage: error instanceof Error ? error.message : 'Error desconocido',
          errorDetails: error,
          delayMs,
        };

        errors.push(retryError);

        console.error(
          `Error en intento ${attempt}/${this.config.maxRetries + 1}:`,
          retryError.errorMessage
        );

        // Si aún quedan reintentos, esperar antes del siguiente intento
        if (attempt <= this.config.maxRetries) {
          console.log(`Esperando ${delayMs}ms antes del siguiente intento...`);
          await this.sleep(delayMs);
        } else {
          // Se agotaron los reintentos
          console.error(
            `Se agotaron los ${this.config.maxRetries} reintentos para comprobante ${numeroComprobante}`
          );

          // Marcar el comprobante como pendiente
          await this.marcarComoPendiente(empresaRuc, numeroComprobante, errors);

          return {
            success: false,
            errors,
            totalAttempts: attempt,
          };
        }
      }
    }

    // Este punto no debería alcanzarse, pero por seguridad
    return {
      success: false,
      errors,
      totalAttempts: attempt,
    };
  }

  /**
   * Marca un comprobante como pendiente tras fallos de envío
   * 
   * @param empresaRuc - RUC de la empresa
   * @param numeroComprobante - Número del comprobante
   * @param errors - Lista de errores ocurridos
   */
  private async marcarComoPendiente(
    empresaRuc: string,
    numeroComprobante: string,
    errors: RetryError[]
  ): Promise<void> {
    try {
      console.log(
        `Marcando comprobante ${numeroComprobante} como PENDIENTE tras ${errors.length} intentos fallidos`
      );

      await this.comprobanteRepository.actualizarEstado(
        empresaRuc,
        numeroComprobante,
        EstadoComprobante.PENDIENTE
      );

      // Registrar los errores en el comprobante
      await this.registrarErrores(empresaRuc, numeroComprobante, errors);
    } catch (error) {
      console.error(
        `Error al marcar comprobante ${numeroComprobante} como pendiente:`,
        error instanceof Error ? error.message : 'Error desconocido'
      );
      // No lanzamos el error para no interrumpir el flujo
    }
  }

  /**
   * Registra los errores de reintento en el comprobante
   * 
   * @param empresaRuc - RUC de la empresa
   * @param numeroComprobante - Número del comprobante
   * @param errors - Lista de errores a registrar
   */
  private async registrarErrores(
    empresaRuc: string,
    numeroComprobante: string,
    errors: RetryError[]
  ): Promise<void> {
    try {
      // Obtener el comprobante actual
      const comprobante = await this.comprobanteRepository.obtenerComprobante(
        empresaRuc,
        numeroComprobante
      );

      if (!comprobante) {
        console.error(`Comprobante ${numeroComprobante} no encontrado para registrar errores`);
        return;
      }

      // Preparar el registro de errores
      const errorLog = errors.map((error) => ({
        timestamp: error.timestamp.toISOString(),
        attempt: error.attempt,
        message: error.errorMessage,
        delayMs: error.delayMs,
      }));

      // Actualizar el comprobante con el registro de errores
      // Nota: Esto requiere que el repositorio soporte actualización de campos adicionales
      console.log(
        `Registrando ${errorLog.length} errores para comprobante ${numeroComprobante}:`,
        JSON.stringify(errorLog, null, 2)
      );

      // TODO: Implementar método en el repositorio para guardar el log de errores
      // Por ahora solo lo registramos en los logs de CloudWatch
    } catch (error) {
      console.error(
        `Error al registrar errores para comprobante ${numeroComprobante}:`,
        error instanceof Error ? error.message : 'Error desconocido'
      );
    }
  }

  /**
   * Función auxiliar para esperar un tiempo determinado
   * 
   * @param ms - Milisegundos a esperar
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determina si un error es recuperable (debería reintentar)
   * 
   * @param error - Error a evaluar
   * @returns true si el error es recuperable
   */
  static isRecoverableError(error: any): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Errores de red que son recuperables
    const recoverablePatterns = [
      'timeout',
      'etimedout',
      'econnrefused',
      'econnreset',
      'enotfound',
      'network',
      'socket hang up',
      'service unavailable',
      '503',
      '504',
      'gateway timeout',
    ];

    return recoverablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Determina si un error NO es recuperable (no debería reintentar)
   * 
   * @param error - Error a evaluar
   * @returns true si el error NO es recuperable
   */
  static isNonRecoverableError(error: any): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Errores que no deberían reintentarse
    const nonRecoverablePatterns = [
      'unauthorized',
      '401',
      'forbidden',
      '403',
      'not found',
      '404',
      'bad request',
      '400',
      'invalid',
      'ya fue aceptado',
      'certificado vencido',
      'certificado inválido',
    ];

    return nonRecoverablePatterns.some((pattern) => message.includes(pattern));
  }
}
