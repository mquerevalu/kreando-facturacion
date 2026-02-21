/**
 * Validador de datos para comprobantes electrónicos SUNAT
 * 
 * Implementa las validaciones requeridas por SUNAT:
 * - RUC: 11 dígitos numéricos
 * - DNI: 8 dígitos numéricos
 * - Montos: positivos con máximo 2 decimales
 * - Moneda: PEN o USD
 * - Catálogos: códigos válidos según catálogos oficiales de SUNAT
 */

import { ValidationResult, Montos, DatosComprobante } from '../types';
import { TipoMoneda } from '../types/enums';
import { catalogos } from './catalogos';

export class DataValidator {
  /**
   * Valida que un RUC tenga el formato correcto (11 dígitos numéricos)
   * @param ruc - RUC a validar
   * @returns Resultado de la validación
   */
  validarRUC(ruc: string): ValidationResult {
    const errores: string[] = [];

    if (!ruc) {
      errores.push('El RUC es obligatorio');
      return { valido: false, errores };
    }

    if (!/^\d{11}$/.test(ruc)) {
      errores.push('El RUC debe tener exactamente 11 dígitos numéricos');
    }

    return {
      valido: errores.length === 0,
      errores,
    };
  }

  /**
   * Valida que un DNI tenga el formato correcto (8 dígitos numéricos)
   * @param dni - DNI a validar
   * @returns Resultado de la validación
   */
  validarDNI(dni: string): ValidationResult {
    const errores: string[] = [];

    if (!dni) {
      errores.push('El DNI es obligatorio');
      return { valido: false, errores };
    }

    if (!/^\d{8}$/.test(dni)) {
      errores.push('El DNI debe tener exactamente 8 dígitos numéricos');
    }

    return {
      valido: errores.length === 0,
      errores,
    };
  }

  /**
   * Valida que los montos sean positivos y tengan máximo 2 decimales
   * @param montos - Montos a validar
   * @returns Resultado de la validación
   */
  validarMontos(montos: Montos): ValidationResult {
    const errores: string[] = [];

    // Validar subtotal
    if (montos.subtotal <= 0) {
      errores.push('El subtotal debe ser mayor a cero');
    }
    if (!this.tieneMaximoDosDecimales(montos.subtotal)) {
      errores.push('El subtotal debe tener máximo 2 decimales');
    }

    // Validar IGV
    if (montos.igv < 0) {
      errores.push('El IGV no puede ser negativo');
    }
    if (!this.tieneMaximoDosDecimales(montos.igv)) {
      errores.push('El IGV debe tener máximo 2 decimales');
    }

    // Validar total
    if (montos.total <= 0) {
      errores.push('El total debe ser mayor a cero');
    }
    if (!this.tieneMaximoDosDecimales(montos.total)) {
      errores.push('El total debe tener máximo 2 decimales');
    }

    return {
      valido: errores.length === 0,
      errores,
    };
  }

  /**
   * Valida que un número tenga máximo 2 decimales
   * @param numero - Número a validar
   * @returns true si tiene máximo 2 decimales
   */
  private tieneMaximoDosDecimales(numero: number): boolean {
    const decimales = (numero.toString().split('.')[1] || '').length;
    return decimales <= 2;
  }

  /**
   * Valida que la moneda sea válida (PEN o USD)
   * @param moneda - Moneda a validar
   * @returns Resultado de la validación
   */
  validarMoneda(moneda: string): ValidationResult {
    const errores: string[] = [];

    if (!moneda) {
      errores.push('La moneda es obligatoria');
      return { valido: false, errores };
    }

    const monedasValidas = Object.values(TipoMoneda);
    if (!monedasValidas.includes(moneda as TipoMoneda)) {
      errores.push(`La moneda debe ser ${monedasValidas.join(' o ')}`);
    }

    return {
      valido: errores.length === 0,
      errores,
    };
  }

  /**
   * Valida que un código exista en el catálogo especificado
   * @param codigo - Código a validar
   * @param catalogo - Nombre del catálogo (01, 05, 06, 07)
   * @returns Resultado de la validación
   */
  validarCatalogo(codigo: string, catalogo: string): ValidationResult {
    const errores: string[] = [];

    if (!codigo) {
      errores.push('El código es obligatorio');
      return { valido: false, errores };
    }

    const catalogoData = catalogos[catalogo];
    if (!catalogoData) {
      errores.push(`El catálogo ${catalogo} no existe`);
      return { valido: false, errores };
    }

    if (!catalogoData[codigo]) {
      errores.push(
        `El código ${codigo} no es válido para el catálogo ${catalogo}`
      );
    }

    return {
      valido: errores.length === 0,
      errores,
    };
  }

  /**
   * Valida todos los datos de un comprobante
   * @param datos - Datos del comprobante a validar
   * @returns Resultado de la validación
   */
  validarComprobante(datos: DatosComprobante): ValidationResult {
    const errores: string[] = [];

    // Validar tipo de comprobante
    const resultadoTipo = this.validarCatalogo(datos.tipo, '01');
    if (!resultadoTipo.valido) {
      errores.push(...resultadoTipo.errores);
    }

    // Validar receptor
    if (!datos.receptor) {
      errores.push('El receptor es obligatorio');
    } else {
      // Validar tipo de documento del receptor
      const resultadoTipoDoc = this.validarCatalogo(
        datos.receptor.tipoDocumento,
        '06'
      );
      if (!resultadoTipoDoc.valido) {
        errores.push(...resultadoTipoDoc.errores);
      }

      // Validar número de documento según el tipo
      if (datos.receptor.tipoDocumento === '1') {
        // DNI
        const resultadoDNI = this.validarDNI(datos.receptor.numeroDocumento);
        if (!resultadoDNI.valido) {
          errores.push(...resultadoDNI.errores);
        }
      } else if (datos.receptor.tipoDocumento === '6') {
        // RUC
        const resultadoRUC = this.validarRUC(datos.receptor.numeroDocumento);
        if (!resultadoRUC.valido) {
          errores.push(...resultadoRUC.errores);
        }
      }

      // Validar nombre
      if (!datos.receptor.nombre || datos.receptor.nombre.trim() === '') {
        errores.push('El nombre del receptor es obligatorio');
      }
    }

    // Validar items
    if (!datos.items || datos.items.length === 0) {
      errores.push('Debe incluir al menos un item');
    } else {
      datos.items.forEach((item, index) => {
        // Validar cantidad
        if (item.cantidad <= 0) {
          errores.push(`Item ${index + 1}: La cantidad debe ser mayor a cero`);
        }

        // Validar precio unitario
        if (item.precioUnitario <= 0) {
          errores.push(
            `Item ${index + 1}: El precio unitario debe ser mayor a cero`
          );
        }
        if (!this.tieneMaximoDosDecimales(item.precioUnitario)) {
          errores.push(
            `Item ${index + 1}: El precio unitario debe tener máximo 2 decimales`
          );
        }

        // Validar afectación IGV
        const resultadoAfectacion = this.validarCatalogo(
          item.afectacionIGV,
          '07'
        );
        if (!resultadoAfectacion.valido) {
          errores.push(
            `Item ${index + 1}: ${resultadoAfectacion.errores.join(', ')}`
          );
        }

        // Validar IGV
        if (item.igv < 0) {
          errores.push(`Item ${index + 1}: El IGV no puede ser negativo`);
        }
        if (!this.tieneMaximoDosDecimales(item.igv)) {
          errores.push(
            `Item ${index + 1}: El IGV debe tener máximo 2 decimales`
          );
        }

        // Validar total
        if (item.total <= 0) {
          errores.push(`Item ${index + 1}: El total debe ser mayor a cero`);
        }
        if (!this.tieneMaximoDosDecimales(item.total)) {
          errores.push(
            `Item ${index + 1}: El total debe tener máximo 2 decimales`
          );
        }
      });
    }

    // Validar moneda
    const resultadoMoneda = this.validarMoneda(datos.moneda);
    if (!resultadoMoneda.valido) {
      errores.push(...resultadoMoneda.errores);
    }

    return {
      valido: errores.length === 0,
      errores,
    };
  }
}

// Exportar instancia singleton
export const dataValidator = new DataValidator();
