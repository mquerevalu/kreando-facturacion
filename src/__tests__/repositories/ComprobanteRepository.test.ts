/**
 * Pruebas unitarias para ComprobanteRepository
 * Valida aislamiento multi-tenant y operaciones CRUD
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBComprobanteRepository } from '../../repositories/ComprobanteRepository';
import {
  Comprobante,
  TipoComprobante,
  EstadoComprobante,
  TipoMoneda,
  CDR,
} from '../../types';

const ddbMock = mockClient(DynamoDBClient);

describe('ComprobanteRepository', () => {
  let repository: DynamoDBComprobanteRepository;

  beforeEach(() => {
    ddbMock.reset();
    repository = new DynamoDBComprobanteRepository(
      ddbMock as unknown as DynamoDBClient,
      'test-comprobantes',
      'test-contadores'
    );
  });

  const comprobanteValido: Comprobante = {
    empresaRuc: '20123456789',
    numero: 'B001-00000001',
    tipo: TipoComprobante.BOLETA,
    fecha: new Date('2025-01-15'),
    emisor: {
      ruc: '20123456789',
      razonSocial: 'Empresa Test S.A.C.',
      nombreComercial: 'Test Corp',
      direccion: {
        departamento: 'Lima',
        provincia: 'Lima',
        distrito: 'Miraflores',
        direccion: 'Av. Test 123',
      },
    },
    receptor: {
      tipoDocumento: '1',
      numeroDocumento: '12345678',
      nombre: 'Juan Pérez',
    },
    items: [
      {
        codigo: 'PROD001',
        descripcion: 'Producto de prueba',
        cantidad: 1,
        unidadMedida: 'NIU',
        precioUnitario: 100,
        afectacionIGV: '10',
        igv: 18,
        total: 118,
      },
    ],
    subtotal: 100,
    igv: 18,
    total: 118,
    moneda: TipoMoneda.PEN,
    estado: EstadoComprobante.PENDIENTE,
  };

  describe('guardarComprobante', () => {
    it('debe guardar un comprobante correctamente', async () => {
      ddbMock.resolves({});

      await expect(
        repository.guardarComprobante('20123456789', comprobanteValido)
      ).resolves.not.toThrow();
    });

    it('debe rechazar comprobante que no pertenece a la empresa (aislamiento multi-tenant)', async () => {
      const comprobanteOtraEmpresa = {
        ...comprobanteValido,
        empresaRuc: '20999999999',
      };

      await expect(
        repository.guardarComprobante('20123456789', comprobanteOtraEmpresa)
      ).rejects.toThrow('El comprobante no pertenece a la empresa especificada');
    });
  });

  describe('obtenerComprobante', () => {
    it('debe retornar un comprobante existente', async () => {
      ddbMock.resolves({
        Item: {
          empresaRuc: { S: '20123456789' },
          numero: { S: 'B001-00000001' },
          tipo: { S: TipoComprobante.BOLETA },
          fecha: { S: new Date('2025-01-15').toISOString() },
          estado: { S: EstadoComprobante.PENDIENTE },
          subtotal: { N: '100' },
          igv: { N: '18' },
          total: { N: '118' },
          moneda: { S: TipoMoneda.PEN },
          emisor: {
            M: {
              ruc: { S: '20123456789' },
              razonSocial: { S: 'Empresa Test S.A.C.' },
              nombreComercial: { S: 'Test Corp' },
              direccion: {
                M: {
                  departamento: { S: 'Lima' },
                  provincia: { S: 'Lima' },
                  distrito: { S: 'Miraflores' },
                  direccion: { S: 'Av. Test 123' },
                },
              },
            },
          },
          receptor: {
            M: {
              tipoDocumento: { S: '1' },
              numeroDocumento: { S: '12345678' },
              nombre: { S: 'Juan Pérez' },
            },
          },
          items: {
            L: [
              {
                M: {
                  codigo: { S: 'PROD001' },
                  descripcion: { S: 'Producto de prueba' },
                  cantidad: { N: '1' },
                  unidadMedida: { S: 'NIU' },
                  precioUnitario: { N: '100' },
                  afectacionIGV: { S: '10' },
                  igv: { N: '18' },
                  total: { N: '118' },
                },
              },
            ],
          },
        },
      });

      const comprobante = await repository.obtenerComprobante('20123456789', 'B001-00000001');

      expect(comprobante).not.toBeNull();
      expect(comprobante?.numero).toBe('B001-00000001');
      expect(comprobante?.empresaRuc).toBe('20123456789');
    });

    it('debe retornar null si el comprobante no existe', async () => {
      ddbMock.resolves({ Item: undefined });

      const comprobante = await repository.obtenerComprobante('20123456789', 'B001-99999999');

      expect(comprobante).toBeNull();
    });
  });

  describe('guardarCDR', () => {
    it('debe guardar el CDR de un comprobante', async () => {
      const cdr: CDR = {
        codigo: '0',
        mensaje: 'Aceptado',
        xml: '<cdr>...</cdr>',
        fechaRecepcion: new Date(),
      };

      ddbMock.resolves({});

      await expect(
        repository.guardarCDR('20123456789', 'B001-00000001', cdr)
      ).resolves.not.toThrow();
    });

    it('debe lanzar error si el comprobante no existe', async () => {
      const cdr: CDR = {
        codigo: '0',
        mensaje: 'Aceptado',
        xml: '<cdr>...</cdr>',
        fechaRecepcion: new Date(),
      };

      ddbMock.rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      await expect(
        repository.guardarCDR('20123456789', 'B001-99999999', cdr)
      ).rejects.toThrow('Comprobante B001-99999999 no encontrado para empresa 20123456789');
    });
  });

  describe('actualizarEstado', () => {
    it('debe actualizar el estado de un comprobante', async () => {
      ddbMock.resolves({});

      await expect(
        repository.actualizarEstado('20123456789', 'B001-00000001', EstadoComprobante.ACEPTADO)
      ).resolves.not.toThrow();
    });

    it('debe lanzar error si el comprobante no existe', async () => {
      ddbMock.rejects({
        name: 'ConditionalCheckFailedException',
        message: 'The conditional request failed',
      });

      await expect(
        repository.actualizarEstado('20123456789', 'B001-99999999', EstadoComprobante.ACEPTADO)
      ).rejects.toThrow('Comprobante B001-99999999 no encontrado para empresa 20123456789');
    });
  });

  describe('listarPendientes', () => {
    it('debe retornar comprobantes pendientes de una empresa', async () => {
      ddbMock.resolves({
        Items: [
          {
            empresaRuc: { S: '20123456789' },
            numero: { S: 'B001-00000001' },
            tipo: { S: TipoComprobante.BOLETA },
            fecha: { S: new Date().toISOString() },
            estado: { S: EstadoComprobante.PENDIENTE },
            subtotal: { N: '100' },
            igv: { N: '18' },
            total: { N: '118' },
            moneda: { S: TipoMoneda.PEN },
            emisor: {
              M: {
                ruc: { S: '20123456789' },
                razonSocial: { S: 'Empresa Test' },
                nombreComercial: { S: 'Test' },
                direccion: {
                  M: {
                    departamento: { S: 'Lima' },
                    provincia: { S: 'Lima' },
                    distrito: { S: 'Miraflores' },
                    direccion: { S: 'Av. Test 123' },
                  },
                },
              },
            },
            receptor: {
              M: {
                tipoDocumento: { S: '1' },
                numeroDocumento: { S: '12345678' },
                nombre: { S: 'Juan Pérez' },
              },
            },
            items: {
              L: [
                {
                  M: {
                    codigo: { S: 'PROD001' },
                    descripcion: { S: 'Producto' },
                    cantidad: { N: '1' },
                    unidadMedida: { S: 'NIU' },
                    precioUnitario: { N: '100' },
                    afectacionIGV: { S: '10' },
                    igv: { N: '18' },
                    total: { N: '118' },
                  },
                },
              ],
            },
          },
        ],
      });

      const pendientes = await repository.listarPendientes('20123456789');

      expect(pendientes).toHaveLength(1);
      expect(pendientes[0].estado).toBe(EstadoComprobante.PENDIENTE);
    });

    it('debe retornar array vacío si no hay pendientes', async () => {
      ddbMock.resolves({ Items: [] });

      const pendientes = await repository.listarPendientes('20123456789');

      expect(pendientes).toEqual([]);
    });
  });

  describe('obtenerSiguienteNumero', () => {
    it('debe retornar el siguiente número correlativo', async () => {
      ddbMock.resolves({
        Attributes: {
          contador: { N: '5' },
        },
      });

      const siguiente = await repository.obtenerSiguienteNumero('20123456789', '03', 'B001');

      expect(siguiente).toBe(5);
    });
  });

  describe('Aislamiento multi-tenant', () => {
    it('debe garantizar que cada empresa solo accede a sus propios comprobantes', async () => {
      // Simular que se intenta guardar un comprobante de otra empresa
      const comprobanteOtraEmpresa = {
        ...comprobanteValido,
        empresaRuc: '20999999999',
      };

      await expect(
        repository.guardarComprobante('20123456789', comprobanteOtraEmpresa)
      ).rejects.toThrow('El comprobante no pertenece a la empresa especificada');
    });
  });
});
