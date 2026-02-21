/**
 * Pruebas unitarias para EmpresaRepository
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBEmpresaRepository } from '../../repositories/EmpresaRepository';
import { DatosEmpresa, Empresa } from '../../types';

const ddbMock = mockClient(DynamoDBClient);

describe('EmpresaRepository', () => {
  let repository: DynamoDBEmpresaRepository;

  beforeEach(() => {
    ddbMock.reset();
    repository = new DynamoDBEmpresaRepository(ddbMock as unknown as DynamoDBClient, 'test-table');
  });

  const datosEmpresaValidos: DatosEmpresa = {
    ruc: '20123456789',
    razonSocial: 'Empresa Test S.A.C.',
    nombreComercial: 'Test Corp',
    direccion: {
      departamento: 'Lima',
      provincia: 'Lima',
      distrito: 'Miraflores',
      direccion: 'Av. Test 123',
    },
    credencialesSunat: {
      ruc: '20123456789',
      usuario: 'TESTUSER',
      password: 'encrypted_password',
    },
    activo: true,
  };

  describe('registrarEmpresa', () => {
    it('debe registrar una nueva empresa correctamente', async () => {
      ddbMock.resolves({});

      const empresa = await repository.registrarEmpresa(datosEmpresaValidos);

      expect(empresa.ruc).toBe(datosEmpresaValidos.ruc);
      expect(empresa.razonSocial).toBe(datosEmpresaValidos.razonSocial);
      expect(empresa.activo).toBe(true);
      expect(empresa.fechaRegistro).toBeInstanceOf(Date);
    });

    it('debe establecer activo=true por defecto si no se especifica', async () => {
      ddbMock.resolves({});

      const datosEmpresaSinActivo = { ...datosEmpresaValidos };
      delete datosEmpresaSinActivo.activo;

      const empresa = await repository.registrarEmpresa(datosEmpresaSinActivo);

      expect(empresa.activo).toBe(true);
    });

    it('debe lanzar error si ya existe una empresa con el mismo RUC', async () => {
      ddbMock.rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      await expect(repository.registrarEmpresa(datosEmpresaValidos)).rejects.toThrow(
        'Ya existe una empresa con RUC'
      );
    });
  });

  describe('obtenerEmpresa', () => {
    it('debe retornar una empresa existente', async () => {
      const empresaMock: Empresa = {
        ...datosEmpresaValidos,
        activo: true,
        fechaRegistro: new Date(),
      };

      ddbMock.resolves({
        Item: {
          ruc: { S: empresaMock.ruc },
          razonSocial: { S: empresaMock.razonSocial },
          nombreComercial: { S: empresaMock.nombreComercial },
          activo: { BOOL: true },
          fechaRegistro: { S: empresaMock.fechaRegistro.toISOString() },
          direccion: {
            M: {
              departamento: { S: empresaMock.direccion.departamento },
              provincia: { S: empresaMock.direccion.provincia },
              distrito: { S: empresaMock.direccion.distrito },
              direccion: { S: empresaMock.direccion.direccion },
            },
          },
          credencialesSunat: {
            M: {
              ruc: { S: empresaMock.credencialesSunat.ruc },
              usuario: { S: empresaMock.credencialesSunat.usuario },
              password: { S: empresaMock.credencialesSunat.password },
            },
          },
        },
      });

      const empresa = await repository.obtenerEmpresa('20123456789');

      expect(empresa).not.toBeNull();
      expect(empresa?.ruc).toBe('20123456789');
    });

    it('debe retornar null si la empresa no existe', async () => {
      ddbMock.resolves({ Item: undefined });

      const empresa = await repository.obtenerEmpresa('99999999999');

      expect(empresa).toBeNull();
    });
  });

  describe('actualizarEmpresa', () => {
    it('debe actualizar los datos de una empresa', async () => {
      const empresaActualizada = {
        ...datosEmpresaValidos,
        razonSocial: 'Nueva Razón Social',
        fechaRegistro: new Date(),
      };

      ddbMock.resolves({
        Attributes: {
          ruc: { S: empresaActualizada.ruc },
          razonSocial: { S: empresaActualizada.razonSocial },
          nombreComercial: { S: empresaActualizada.nombreComercial },
          activo: { BOOL: true },
          fechaRegistro: { S: empresaActualizada.fechaRegistro.toISOString() },
          direccion: {
            M: {
              departamento: { S: empresaActualizada.direccion.departamento },
              provincia: { S: empresaActualizada.direccion.provincia },
              distrito: { S: empresaActualizada.direccion.distrito },
              direccion: { S: empresaActualizada.direccion.direccion },
            },
          },
          credencialesSunat: {
            M: {
              ruc: { S: empresaActualizada.credencialesSunat.ruc },
              usuario: { S: empresaActualizada.credencialesSunat.usuario },
              password: { S: empresaActualizada.credencialesSunat.password },
            },
          },
        },
      });

      const empresa = await repository.actualizarEmpresa('20123456789', {
        razonSocial: 'Nueva Razón Social',
      });

      expect(empresa.razonSocial).toBe('Nueva Razón Social');
    });

    it('debe lanzar error si la empresa no existe', async () => {
      ddbMock.rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      await expect(
        repository.actualizarEmpresa('99999999999', { razonSocial: 'Test' })
      ).rejects.toThrow('Empresa con RUC 99999999999 no encontrada');
    });

    it('debe lanzar error si no hay datos para actualizar', async () => {
      await expect(repository.actualizarEmpresa('20123456789', {})).rejects.toThrow(
        'No hay datos para actualizar'
      );
    });
  });

  describe('listarEmpresas', () => {
    it('debe retornar lista de empresas activas', async () => {
      ddbMock.resolves({
        Items: [
          {
            ruc: { S: '20123456789' },
            razonSocial: { S: 'Empresa 1' },
            nombreComercial: { S: 'Empresa 1' },
            activo: { BOOL: true },
            fechaRegistro: { S: new Date().toISOString() },
            direccion: {
              M: {
                departamento: { S: 'Lima' },
                provincia: { S: 'Lima' },
                distrito: { S: 'Miraflores' },
                direccion: { S: 'Av. Test 123' },
              },
            },
            credencialesSunat: {
              M: {
                ruc: { S: '20123456789' },
                usuario: { S: 'USER1' },
                password: { S: 'pass1' },
              },
            },
          },
        ],
      });

      const empresas = await repository.listarEmpresas();

      expect(empresas).toHaveLength(1);
      expect(empresas[0].ruc).toBe('20123456789');
    });

    it('debe retornar array vacío si no hay empresas', async () => {
      ddbMock.resolves({ Items: [] });

      const empresas = await repository.listarEmpresas();

      expect(empresas).toEqual([]);
    });
  });

  describe('eliminarEmpresa', () => {
    it('debe realizar soft delete de una empresa', async () => {
      ddbMock.resolves({});

      await expect(repository.eliminarEmpresa('20123456789')).resolves.not.toThrow();
    });

    it('debe lanzar error si la empresa no existe', async () => {
      ddbMock.rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      await expect(repository.eliminarEmpresa('99999999999')).rejects.toThrow(
        'Empresa con RUC 99999999999 no encontrada'
      );
    });
  });
});
