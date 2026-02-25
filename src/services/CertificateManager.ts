/**
 * CertificateManager - Gestor de certificados digitales
 * 
 * Responsabilidad: Administrar certificados digitales y sus credenciales
 * Requisitos: 5.1, 5.2, 5.3, 5.4
 */

import { Certificado } from '../types/empresa';
import { ValidationResult } from '../types/common';
import { 
  SecretsManagerClient, 
  GetSecretValueCommand, 
  CreateSecretCommand,
  UpdateSecretCommand,
  ResourceNotFoundException 
} from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

/**
 * Interfaz del gestor de certificados
 */
export interface ICertificateManager {
  /**
   * Carga un certificado digital para una empresa
   * @param empresaRuc RUC de la empresa
   * @param archivo Buffer del archivo PFX/P12
   * @param password Contraseña del certificado
   * @throws Error si el certificado es inválido o está vencido
   */
  cargarCertificado(empresaRuc: string, archivo: Buffer, password: string): Promise<void>;

  /**
   * Obtiene el certificado de una empresa
   * @param empresaRuc RUC de la empresa
   * @returns Certificado de la empresa
   * @throws Error si no existe certificado para la empresa
   */
  obtenerCertificado(empresaRuc: string): Promise<Certificado>;

  /**
   * Verifica si un certificado está próximo a vencer (30 días)
   * @param empresaRuc RUC de la empresa
   * @returns true si el certificado vence en los próximos 30 días
   */
  verificarProximoVencimiento(empresaRuc: string): Promise<boolean>;

  /**
   * Lista todos los certificados del sistema
   * @returns Mapa de RUC a Certificado
   */
  listarCertificados(): Promise<Map<string, Certificado>>;

  /**
   * Valida que un certificado sea válido y esté vigente
   * @param empresaRuc RUC de la empresa
   * @returns Resultado de validación
   */
  validarCertificado(empresaRuc: string): Promise<ValidationResult>;
}

/**
 * Implementación del gestor de certificados
 */
export class CertificateManager implements ICertificateManager {
  private certificados: Map<string, Certificado> = new Map();
  private readonly DIAS_ALERTA_VENCIMIENTO = 30;

  /**
   * Carga un certificado digital para una empresa
   * Requisitos: 5.1, 5.2, 5.4
   */
  async cargarCertificado(
    empresaRuc: string,
    archivo: Buffer,
    password: string
  ): Promise<void> {
    // Validar que el archivo no esté vacío
    if (!archivo || archivo.length === 0) {
      throw new Error('El archivo del certificado está vacío');
    }

    // Validar que la contraseña no esté vacía
    if (!password || password.trim().length === 0) {
      throw new Error('La contraseña del certificado es requerida');
    }

    // Validar formato RUC
    if (!this.validarFormatoRUC(empresaRuc)) {
      throw new Error('El RUC debe tener 11 dígitos numéricos');
    }

    // Extraer información del certificado
    const certificadoInfo = await this.extraerInfoCertificado(archivo, password, empresaRuc);

    // Validar que el certificado no esté vencido
    if (certificadoInfo.fechaVencimiento < new Date()) {
      throw new Error(
        `El certificado está vencido. Fecha de vencimiento: ${certificadoInfo.fechaVencimiento.toISOString()}`
      );
    }

    // Validar que el RUC del certificado coincida con el RUC de la empresa
    if (certificadoInfo.ruc !== empresaRuc) {
      throw new Error(
        `El RUC del certificado (${certificadoInfo.ruc}) no coincide con el RUC de la empresa (${empresaRuc})`
      );
    }

    // Encriptar la contraseña antes de almacenar (Requisito 5.2)
    const passwordEncriptada = await this.encriptarPassword(password);

    // Crear objeto certificado
    const certificado: Certificado = {
      ruc: empresaRuc,
      archivo: archivo,
      password: passwordEncriptada,
      fechaEmision: certificadoInfo.fechaEmision,
      fechaVencimiento: certificadoInfo.fechaVencimiento,
      emisor: certificadoInfo.emisor,
    };

    // Almacenar certificado en memoria (para compatibilidad con tests)
    this.certificados.set(empresaRuc, certificado);

    // Almacenar en AWS Secrets Manager
    await this.almacenarEnSecretsManager(empresaRuc, certificado);
  }

  /**
   * Obtiene el certificado de una empresa
   */
  async obtenerCertificado(empresaRuc: string): Promise<Certificado> {
    // Intentar obtener de Secrets Manager primero
    try {
      const certificado = await this.obtenerDeSecretsManager(empresaRuc);
      // Actualizar cache en memoria
      this.certificados.set(empresaRuc, certificado);
      return certificado;
    } catch (error) {
      // Si no está en Secrets Manager, intentar obtener de memoria
      const certificado = this.certificados.get(empresaRuc);
      if (!certificado) {
        throw new Error(`No existe certificado para la empresa con RUC ${empresaRuc}`);
      }
      return certificado;
    }
  }

  /**
   * Verifica si un certificado está próximo a vencer (30 días)
   * Requisito: 5.3
   */
  async verificarProximoVencimiento(empresaRuc: string): Promise<boolean> {
    const certificado = await this.obtenerCertificado(empresaRuc);

    const ahora = new Date();
    const diasParaVencimiento = this.calcularDiasHastaFecha(
      ahora,
      certificado.fechaVencimiento
    );

    return diasParaVencimiento <= this.DIAS_ALERTA_VENCIMIENTO && diasParaVencimiento >= 0;
  }

  /**
   * Lista todos los certificados del sistema
   */
  async listarCertificados(): Promise<Map<string, Certificado>> {
    // TODO: En producción, recuperar de AWS Secrets Manager
    return new Map(this.certificados);
  }

  /**
   * Valida que un certificado sea válido y esté vigente
   * Requisito: 5.4
   */
  async validarCertificado(empresaRuc: string): Promise<ValidationResult> {
    const errores: string[] = [];

    try {
      const certificado = await this.obtenerCertificado(empresaRuc);

      // Validar vigencia
      const ahora = new Date();
      if (certificado.fechaVencimiento < ahora) {
        errores.push(
          `El certificado está vencido. Fecha de vencimiento: ${certificado.fechaVencimiento.toISOString()}`
        );
      }

      if (certificado.fechaEmision > ahora) {
        errores.push(
          `El certificado aún no es válido. Fecha de emisión: ${certificado.fechaEmision.toISOString()}`
        );
      }

      // Validar que el RUC coincida
      if (certificado.ruc !== empresaRuc) {
        errores.push(
          `El RUC del certificado (${certificado.ruc}) no coincide con el RUC solicitado (${empresaRuc})`
        );
      }

      // Validar que el archivo no esté vacío
      if (!certificado.archivo || certificado.archivo.length === 0) {
        errores.push('El archivo del certificado está vacío');
      }

      // Validar que la contraseña no esté vacía
      if (!certificado.password || certificado.password.trim().length === 0) {
        errores.push('La contraseña del certificado está vacía');
      }
    } catch (error) {
      errores.push(error instanceof Error ? error.message : 'Error desconocido');
    }

    return {
      valido: errores.length === 0,
      errores,
    };
  }

  /**
   * Extrae información del certificado PFX/P12
   * @private
   */
  private async extraerInfoCertificado(
    archivo: Buffer,
    password: string,
    empresaRuc: string
  ): Promise<{
    ruc: string;
    fechaEmision: Date;
    fechaVencimiento: Date;
    emisor: string;
  }> {
    // TODO: Implementar extracción real usando node-forge o similar
    // Por ahora, retornamos datos de prueba para desarrollo
    
    // Simular extracción de RUC del subject del certificado
    // En producción, esto se extraería del campo CN o O del certificado
    // Para pruebas, asumimos que el certificado corresponde a la empresa
    const ruc = empresaRuc;

    // Generar fechas de prueba: emitido hace 1 año, vence en 1 año
    const ahora = new Date();
    const fechaEmision = new Date(ahora);
    fechaEmision.setFullYear(ahora.getFullYear() - 1);
    
    const fechaVencimiento = new Date(ahora);
    fechaVencimiento.setFullYear(ahora.getFullYear() + 1);

    return {
      ruc,
      fechaEmision,
      fechaVencimiento,
      emisor: 'Entidad Certificadora de Prueba',
    };
  }

  /**
   * Extrae RUC de prueba del buffer del certificado
   * En producción, esto se reemplazará con extracción real del certificado
   * @private
   */
  private extraerRUCDePrueba(archivo: Buffer): string {
    // Para pruebas, generamos un RUC basado en el contenido del buffer
    // Esto permite que diferentes buffers generen diferentes RUCs
    const hash = archivo.toString('utf-8').length;
    const rucBase = 20000000000 + (hash % 1000000000);
    return rucBase.toString().padStart(11, '2');
  }

  /**
   * Encripta una contraseña
   * Requisito: 5.2 - Almacenamiento seguro
   * @private
   */
  private async encriptarPassword(password: string): Promise<string> {
    // TODO: Implementar encriptación real usando crypto
    // Por ahora, retornamos la contraseña con un prefijo para indicar que está "encriptada"
    return `encrypted:${password}`;
  }

  /**
   * Valida el formato de un RUC
   * @private
   */
  private validarFormatoRUC(ruc: string): boolean {
    return /^\d{11}$/.test(ruc);
  }

  /**
   * Calcula los días entre dos fechas
   * @private
   */
  private calcularDiasHastaFecha(desde: Date, hasta: Date): number {
    const milisegundosPorDia = 1000 * 60 * 60 * 24;
    const diferencia = hasta.getTime() - desde.getTime();
    return Math.ceil(diferencia / milisegundosPorDia);
  }

  /**
   * Almacena un certificado en AWS Secrets Manager
   * @private
   */
  private async almacenarEnSecretsManager(empresaRuc: string, certificado: Certificado): Promise<void> {
    const secretName = `sunat/certificados/${empresaRuc}`;
    
    const secretValue = JSON.stringify({
      ruc: certificado.ruc,
      archivo: certificado.archivo.toString('base64'),
      password: certificado.password,
      fechaEmision: certificado.fechaEmision.toISOString(),
      fechaVencimiento: certificado.fechaVencimiento.toISOString(),
      emisor: certificado.emisor,
    });

    try {
      // Intentar actualizar el secreto existente
      await secretsClient.send(new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: secretValue,
      }));
    } catch (error: any) {
      if (error instanceof ResourceNotFoundException) {
        // Si no existe, crear uno nuevo
        await secretsClient.send(new CreateSecretCommand({
          Name: secretName,
          SecretString: secretValue,
          Description: `Certificado digital para empresa RUC ${empresaRuc}`,
        }));
      } else {
        throw error;
      }
    }
  }

  /**
   * Obtiene un certificado de AWS Secrets Manager
   * @private
   */
  private async obtenerDeSecretsManager(empresaRuc: string): Promise<Certificado> {
    const secretName = `sunat/certificados/${empresaRuc}`;
    
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: secretName,
    }));

    if (!response.SecretString) {
      throw new Error(`No se pudo obtener el certificado para RUC ${empresaRuc}`);
    }

    const secretData = JSON.parse(response.SecretString);
    
    return {
      ruc: secretData.ruc,
      archivo: Buffer.from(secretData.archivo, 'base64'),
      password: secretData.password,
      fechaEmision: new Date(secretData.fechaEmision),
      fechaVencimiento: new Date(secretData.fechaVencimiento),
      emisor: secretData.emisor,
    };
  }
}
