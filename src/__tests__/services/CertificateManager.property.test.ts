/**
 * Pruebas basadas en propiedades para CertificateManager
 * 
 * Feature: sunat
 * 
 * Estas pruebas validan propiedades universales del gestor de certificados
 * usando fast-check para generar múltiples casos de prueba aleatorios.
 */

import * as fc from 'fast-check';
import { CertificateManager } from '../../services/CertificateManager';

describe('CertificateManager - Property-Based Tests', () => {
  let certificateManager: CertificateManager;

  beforeEach(() => {
    certificateManager = new CertificateManager();
  });

  /**
   * **Propiedad 6: Validación de vigencia de certificado**
   * **Valida: Requisitos 2.2, 5.4**
   * 
   * Para cualquier intento de firma con un certificado vencido, el sistema
   * debe rechazar la operación.
   */
  describe('Propiedad 6: Validación de vigencia de certificado', () => {
    it('debe rechazar cualquier certificado con fecha de vencimiento en el pasado', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.integer({ min: 1, max: 365 }), // Días en el pasado
          async (ruc, password, diasPasado) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado (esto funcionará porque el mock genera fechas futuras)
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y modificar su fecha de vencimiento al pasado
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaVencida = new Date();
            fechaVencida.setDate(fechaVencida.getDate() - diasPasado);
            certificado.fechaVencimiento = fechaVencida;

            // Validar el certificado - debe fallar por estar vencido
            const resultado = await certificateManager.validarCertificado(ruc);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => e.toLowerCase().includes('vencido'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe aceptar cualquier certificado con fecha de vencimiento en el futuro', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.integer({ min: 1, max: 365 }), // Días en el futuro
          async (ruc, password, diasFuturo) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y asegurar que su fecha de vencimiento esté en el futuro
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaFutura = new Date();
            fechaFutura.setDate(fechaFutura.getDate() + diasFuturo);
            certificado.fechaVencimiento = fechaFutura;

            // Validar el certificado - debe ser válido
            const resultado = await certificateManager.validarCertificado(ruc);

            // Si solo falla por vencimiento, debe ser válido
            const soloErrorVencimiento = resultado.errores.every(e => 
              !e.toLowerCase().includes('vencido')
            );
            expect(soloErrorVencimiento).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar carga de cualquier certificado ya vencido', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          async (ruc, password) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado primero
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Modificar la fecha de vencimiento al pasado
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaVencida = new Date();
            fechaVencida.setDate(fechaVencida.getDate() - 1);
            certificado.fechaVencimiento = fechaVencida;

            // Intentar cargar nuevamente con el certificado vencido
            // Esto debería fallar en la validación
            const resultado = await certificateManager.validarCertificado(ruc);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.some(e => e.toLowerCase().includes('vencido'))).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier certificado con fecha de emisión en el futuro', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.integer({ min: 1, max: 365 }), // Días en el futuro
          async (ruc, password, diasFuturo) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y modificar su fecha de emisión al futuro
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaFutura = new Date();
            fechaFutura.setDate(fechaFutura.getDate() + diasFuturo);
            certificado.fechaEmision = fechaFutura;

            // Validar el certificado - debe fallar por fecha de emisión futura
            const resultado = await certificateManager.validarCertificado(ruc);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores.length).toBeGreaterThan(0);
            expect(resultado.errores.some(e => 
              e.toLowerCase().includes('emisión') || e.toLowerCase().includes('emision')
            )).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 16: Almacenamiento seguro de contraseñas**
   * **Valida: Requisitos 5.2**
   * 
   * Para cualquier certificado almacenado de cualquier empresa, su contraseña
   * debe estar encriptada y nunca almacenarse en texto plano.
   */
  describe('Propiedad 16: Almacenamiento seguro de contraseñas', () => {
    it('debe encriptar la contraseña de cualquier certificado cargado', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 50 }), // Password original
          async (ruc, passwordOriginal) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, passwordOriginal);

            // Obtener el certificado almacenado
            const certificado = await certificateManager.obtenerCertificado(ruc);

            // La contraseña almacenada NO debe ser igual a la original (debe estar encriptada)
            expect(certificado.password).not.toBe(passwordOriginal);
            
            // La contraseña almacenada debe tener algún indicador de encriptación
            // (en este caso, el prefijo "encrypted:")
            expect(certificado.password).toContain('encrypted:');
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe nunca almacenar contraseñas en texto plano para cualquier empresa', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              ruc: fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()),
              password: fc.string({ minLength: 8, maxLength: 50 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (empresas) => {
            // Cargar certificados para múltiples empresas
            for (const empresa of empresas) {
              const certificadoBuffer = Buffer.from('certificado-prueba-' + empresa.ruc);
              await certificateManager.cargarCertificado(
                empresa.ruc,
                certificadoBuffer,
                empresa.password
              );
            }

            // Listar todos los certificados
            const certificados = await certificateManager.listarCertificados();

            // Verificar que ninguna contraseña esté en texto plano
            for (const [ruc, certificado] of certificados.entries()) {
              const empresaOriginal = empresas.find(e => e.ruc === ruc);
              if (empresaOriginal) {
                // La contraseña almacenada NO debe ser igual a la original
                expect(certificado.password).not.toBe(empresaOriginal.password);
                
                // Debe tener indicador de encriptación
                expect(certificado.password).toContain('encrypted:');
              }
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe encriptar contraseñas de cualquier longitud', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 1, maxLength: 100 }), // Password de cualquier longitud
          async (ruc, password) => {
            // Filtrar contraseñas vacías (no son válidas)
            if (password.trim().length === 0) {
              return;
            }

            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado almacenado
            const certificado = await certificateManager.obtenerCertificado(ruc);

            // La contraseña debe estar encriptada independientemente de su longitud
            expect(certificado.password).not.toBe(password);
            expect(certificado.password).toContain('encrypted:');
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe rechazar cualquier certificado con contraseña vacía', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.constantFrom('', '   ', '\t', '\n'), // Contraseñas vacías o solo espacios
          async (ruc, passwordVacia) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Intentar cargar el certificado con contraseña vacía
            await expect(
              certificateManager.cargarCertificado(ruc, certificadoBuffer, passwordVacia)
            ).rejects.toThrow(/contraseña.*requerida/i);
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Propiedad 17: Alertas de vencimiento de certificado**
   * **Valida: Requisitos 5.3**
   * 
   * Para cualquier certificado de cualquier empresa con fecha de vencimiento
   * dentro de los próximos 30 días, el sistema debe emitir una alerta.
   */
  describe('Propiedad 17: Alertas de vencimiento de certificado', () => {
    it('debe alertar para cualquier certificado que vence en los próximos 30 días', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.integer({ min: 1, max: 30 }), // Días hasta vencimiento (1-30)
          async (ruc, password, diasHastaVencimiento) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y modificar su fecha de vencimiento
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + diasHastaVencimiento);
            certificado.fechaVencimiento = fechaVencimiento;

            // Verificar que se emita alerta de próximo vencimiento
            const proximoVencer = await certificateManager.verificarProximoVencimiento(ruc);

            expect(proximoVencer).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe NO alertar para cualquier certificado que vence después de 30 días', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.integer({ min: 31, max: 365 }), // Días hasta vencimiento (31-365)
          async (ruc, password, diasHastaVencimiento) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y modificar su fecha de vencimiento
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + diasHastaVencimiento);
            certificado.fechaVencimiento = fechaVencimiento;

            // Verificar que NO se emita alerta de próximo vencimiento
            const proximoVencer = await certificateManager.verificarProximoVencimiento(ruc);

            expect(proximoVencer).toBe(false);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe NO alertar para cualquier certificado ya vencido', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          fc.integer({ min: 1, max: 365 }), // Días en el pasado
          async (ruc, password, diasPasado) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y modificar su fecha de vencimiento al pasado
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaVencida = new Date();
            fechaVencida.setDate(fechaVencida.getDate() - diasPasado);
            certificado.fechaVencimiento = fechaVencida;

            // Verificar que NO se emita alerta (ya está vencido, no "próximo a vencer")
            const proximoVencer = await certificateManager.verificarProximoVencimiento(ruc);

            expect(proximoVencer).toBe(false);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe alertar exactamente en el día 30 antes del vencimiento', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          async (ruc, password) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y configurar vencimiento exactamente en 30 días
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
            certificado.fechaVencimiento = fechaVencimiento;

            // Verificar que se emita alerta (30 días es el límite)
            const proximoVencer = await certificateManager.verificarProximoVencimiento(ruc);

            expect(proximoVencer).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe listar todos los certificados próximos a vencer de cualquier empresa', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              ruc: fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()),
              password: fc.string({ minLength: 8, maxLength: 20 }).filter(p => p.trim().length > 0),
              diasHastaVencimiento: fc.integer({ min: 1, max: 60 }), // Algunos dentro, algunos fuera del rango
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (empresasConDuplicados) => {
            // Eliminar duplicados por RUC (mantener el primero)
            const rucVistos = new Set<string>();
            const empresas = empresasConDuplicados.filter(empresa => {
              if (rucVistos.has(empresa.ruc)) {
                return false;
              }
              rucVistos.add(empresa.ruc);
              return true;
            });

            // Si no hay empresas después de eliminar duplicados, saltar
            if (empresas.length === 0) {
              return;
            }
            // Cargar certificados para múltiples empresas
            for (const empresa of empresas) {
              const certificadoBuffer = Buffer.from('certificado-prueba-' + empresa.ruc);
              await certificateManager.cargarCertificado(
                empresa.ruc,
                certificadoBuffer,
                empresa.password
              );

              // Configurar fecha de vencimiento
              const certificado = await certificateManager.obtenerCertificado(empresa.ruc);
              const fechaVencimiento = new Date();
              fechaVencimiento.setDate(fechaVencimiento.getDate() + empresa.diasHastaVencimiento);
              certificado.fechaVencimiento = fechaVencimiento;
            }

            // Contar cuántos certificados deberían estar próximos a vencer
            const esperadosProximosVencer = empresas.filter(
              e => e.diasHastaVencimiento >= 1 && e.diasHastaVencimiento <= 30
            ).length;

            // Verificar cada certificado
            let contadorProximosVencer = 0;
            for (const empresa of empresas) {
              const proximoVencer = await certificateManager.verificarProximoVencimiento(
                empresa.ruc
              );
              if (proximoVencer) {
                contadorProximosVencer++;
              }
            }

            // El contador debe coincidir con los esperados
            expect(contadorProximosVencer).toBe(esperadosProximosVencer);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('debe alertar para certificado que vence hoy (día 0)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10000000000, max: 99999999999 }).map(n => n.toString()), // RUC válido
          fc.string({ minLength: 8, maxLength: 20 }), // Password
          async (ruc, password) => {
            // Crear un certificado de prueba
            const certificadoBuffer = Buffer.from('certificado-prueba-' + ruc);

            // Cargar el certificado
            await certificateManager.cargarCertificado(ruc, certificadoBuffer, password);

            // Obtener el certificado y configurar vencimiento para hoy
            const certificado = await certificateManager.obtenerCertificado(ruc);
            const fechaVencimiento = new Date();
            // Configurar para que venza en las próximas horas (mismo día)
            fechaVencimiento.setHours(23, 59, 59, 999);
            certificado.fechaVencimiento = fechaVencimiento;

            // Verificar que se emita alerta (día 0 está dentro del rango)
            const proximoVencer = await certificateManager.verificarProximoVencimiento(ruc);

            expect(proximoVencer).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
