/**
 * Pruebas unitarias para CertificateManager
 */

import { CertificateManager } from '../../services/CertificateManager';
import { Certificado } from '../../types/empresa';

describe('CertificateManager', () => {
  let manager: CertificateManager;

  beforeEach(() => {
    manager = new CertificateManager();
  });

  describe('cargarCertificado', () => {
    it('debe cargar un certificado válido', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await expect(manager.cargarCertificado(ruc, archivo, password)).resolves.not.toThrow();

      const certificado = await manager.obtenerCertificado(ruc);
      expect(certificado).toBeDefined();
      expect(certificado.ruc).toBe(ruc);
    });

    it('debe rechazar archivo vacío', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('');
      const password = 'password123';

      await expect(manager.cargarCertificado(ruc, archivo, password)).rejects.toThrow(
        'El archivo del certificado está vacío'
      );
    });

    it('debe rechazar contraseña vacía', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = '';

      await expect(manager.cargarCertificado(ruc, archivo, password)).rejects.toThrow(
        'La contraseña del certificado es requerida'
      );
    });

    it('debe rechazar RUC inválido', async () => {
      const ruc = '123'; // RUC inválido
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await expect(manager.cargarCertificado(ruc, archivo, password)).rejects.toThrow(
        'El RUC debe tener 11 dígitos numéricos'
      );
    });

    it('debe rechazar RUC con letras', async () => {
      const ruc = '2012345678A'; // RUC con letra
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await expect(manager.cargarCertificado(ruc, archivo, password)).rejects.toThrow(
        'El RUC debe tener 11 dígitos numéricos'
      );
    });

    it('debe encriptar la contraseña al almacenar', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      const certificado = await manager.obtenerCertificado(ruc);
      // La contraseña debe estar encriptada (no en texto plano)
      expect(certificado.password).not.toBe(password);
      expect(certificado.password).toContain('encrypted:');
    });
  });

  describe('obtenerCertificado', () => {
    it('debe retornar certificado existente', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      const certificado = await manager.obtenerCertificado(ruc);
      expect(certificado).toBeDefined();
      expect(certificado.ruc).toBe(ruc);
      expect(certificado.archivo).toEqual(archivo);
    });

    it('debe lanzar error si no existe certificado', async () => {
      const ruc = '20999999999';

      await expect(manager.obtenerCertificado(ruc)).rejects.toThrow(
        `No existe certificado para la empresa con RUC ${ruc}`
      );
    });
  });

  describe('verificarProximoVencimiento', () => {
    it('debe retornar true si el certificado vence en 30 días', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      // Modificar la fecha de vencimiento para que sea en 30 días
      const certificado = await manager.obtenerCertificado(ruc);
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
      certificado.fechaVencimiento = fechaVencimiento;

      const proximoVencimiento = await manager.verificarProximoVencimiento(ruc);
      expect(proximoVencimiento).toBe(true);
    });

    it('debe retornar true si el certificado vence en 15 días', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      // Modificar la fecha de vencimiento para que sea en 15 días
      const certificado = await manager.obtenerCertificado(ruc);
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 15);
      certificado.fechaVencimiento = fechaVencimiento;

      const proximoVencimiento = await manager.verificarProximoVencimiento(ruc);
      expect(proximoVencimiento).toBe(true);
    });

    it('debe retornar false si el certificado vence en más de 30 días', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      // Modificar la fecha de vencimiento para que sea en 60 días
      const certificado = await manager.obtenerCertificado(ruc);
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 60);
      certificado.fechaVencimiento = fechaVencimiento;

      const proximoVencimiento = await manager.verificarProximoVencimiento(ruc);
      expect(proximoVencimiento).toBe(false);
    });

    it('debe retornar false si el certificado ya venció', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      // Modificar la fecha de vencimiento para que sea en el pasado
      const certificado = await manager.obtenerCertificado(ruc);
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() - 10);
      certificado.fechaVencimiento = fechaVencimiento;

      const proximoVencimiento = await manager.verificarProximoVencimiento(ruc);
      expect(proximoVencimiento).toBe(false);
    });
  });

  describe('listarCertificados', () => {
    it('debe retornar mapa vacío si no hay certificados', async () => {
      const certificados = await manager.listarCertificados();
      expect(certificados.size).toBe(0);
    });

    it('debe retornar todos los certificados cargados', async () => {
      const ruc1 = '20123456789';
      const archivo1 = Buffer.from('certificado-pfx-data-empresa1');
      const password = 'password123';

      await manager.cargarCertificado(ruc1, archivo1, password);

      // Para el segundo certificado, usamos un buffer diferente que generará un RUC diferente
      // En producción, cada certificado real tendría su propio RUC embebido
      const ruc2 = '20987654321';
      const archivo2 = Buffer.from('certificado-pfx-data-empresa2-con-contenido-diferente-para-generar-otro-ruc');
      
      await manager.cargarCertificado(ruc2, archivo2, password);

      const certificados = await manager.listarCertificados();
      expect(certificados.size).toBe(2);
      expect(certificados.has(ruc1)).toBe(true);
      expect(certificados.has(ruc2)).toBe(true);
    });
  });

  describe('validarCertificado', () => {
    it('debe validar certificado válido y vigente', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      const resultado = await manager.validarCertificado(ruc);
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe detectar certificado vencido', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      // Modificar la fecha de vencimiento para que esté en el pasado
      const certificado = await manager.obtenerCertificado(ruc);
      certificado.fechaVencimiento = new Date('2020-01-01');

      const resultado = await manager.validarCertificado(ruc);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain('vencido');
    });

    it('debe detectar certificado que aún no es válido', async () => {
      const ruc = '20123456789';
      const archivo = Buffer.from('certificado-pfx-data');
      const password = 'password123';

      await manager.cargarCertificado(ruc, archivo, password);

      // Modificar la fecha de emisión para que esté en el futuro
      const certificado = await manager.obtenerCertificado(ruc);
      certificado.fechaEmision = new Date('2030-01-01');

      const resultado = await manager.validarCertificado(ruc);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores.some((e) => e.includes('aún no es válido'))).toBe(true);
    });

    it('debe detectar certificado inexistente', async () => {
      const ruc = '20999999999';

      const resultado = await manager.validarCertificado(ruc);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
    });
  });
});
