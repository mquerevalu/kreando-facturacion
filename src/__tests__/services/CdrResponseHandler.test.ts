/**
 * Pruebas unitarias para CdrResponseHandler
 */

import { CdrResponseHandler } from '../../services/CdrResponseHandler';
import { DynamoDBComprobanteRepository } from '../../repositories/ComprobanteRepository';
import { S3FileRepository } from '../../repositories/S3Repository';
import { CDR, EstadoComprobante } from '../../types';

// Mocks
jest.mock('../../repositories/ComprobanteRepository');
jest.mock('../../repositories/S3Repository');

describe('CdrResponseHandler', () => {
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

  describe('determinarEstado', () => {
    it('debe retornar ACEPTADO para código 0', () => {
      const estado = handler.determinarEstado('0');
      expect(estado).toBe(EstadoComprobante.ACEPTADO);
    });

    it('debe retornar ACEPTADO para códigos 1-999 (excepciones)', () => {
      expect(handler.determinarEstado('1')).toBe(EstadoComprobante.ACEPTADO);
      expect(handler.determinarEstado('100')).toBe(EstadoComprobante.ACEPTADO);
      expect(handler.determinarEstado('999')).toBe(EstadoComprobante.ACEPTADO);
    });

    it('debe retornar RECHAZADO para códigos 2000-2999', () => {
      expect(handler.determinarEstado('2000')).toBe(EstadoComprobante.RECHAZADO);
      expect(handler.determinarEstado('2500')).toBe(EstadoComprobante.RECHAZADO);
      expect(handler.determinarEstado('2999')).toBe(EstadoComprobante.RECHAZADO);
    });

    it('debe retornar ACEPTADO para códigos 4000-4999 (observaciones)', () => {
      expect(handler.determinarEstado('4000')).toBe(EstadoComprobante.ACEPTADO);
      expect(handler.determinarEstado('4500')).toBe(EstadoComprobante.ACEPTADO);
      expect(handler.determinarEstado('4999')).toBe(EstadoComprobante.ACEPTADO);
    });

    it('debe retornar ENVIADO para código TICKET', () => {
      const estado = handler.determinarEstado('TICKET');
      expect(estado).toBe(EstadoComprobante.ENVIADO);
    });

    it('debe retornar ENVIADO para código PROCESANDO', () => {
      const estado = handler.determinarEstado('PROCESANDO');
      expect(estado).toBe(EstadoComprobante.ENVIADO);
    });

    it('debe retornar RECHAZADO para códigos no reconocidos', () => {
      expect(handler.determinarEstado('9999')).toBe(EstadoComprobante.RECHAZADO);
      expect(handler.determinarEstado('UNKNOWN')).toBe(EstadoComprobante.RECHAZADO);
    });

    it('debe manejar códigos con espacios', () => {
      const estado = handler.determinarEstado('  0  ');
      expect(estado).toBe(EstadoComprobante.ACEPTADO);
    });
  });

  describe('procesarCDR', () => {
    const empresaRuc = '20123456789';
    const numeroComprobante = 'B001-00000123';
    const cdrAceptado: CDR = {
      codigo: '0',
      mensaje: 'La Factura numero B001-00000123, ha sido aceptada',
      xml: '<xml>CDR content</xml>',
      fechaRecepcion: new Date('2024-01-15T10:30:00Z'),
    };

    it('debe almacenar CDR en S3 y DynamoDB cuando es aceptado', async () => {
      await handler.procesarCDR(empresaRuc, numeroComprobante, cdrAceptado);

      // Verificar que se guardó en S3
      expect(mockS3Repo.guardarXML).toHaveBeenCalledWith(
        empresaRuc,
        `cdr-${numeroComprobante}`,
        cdrAceptado.xml
      );

      // Verificar que se guardó en DynamoDB
      expect(mockComprobanteRepo.guardarCDR).toHaveBeenCalledWith(
        empresaRuc,
        numeroComprobante,
        cdrAceptado
      );

      // Verificar que se actualizó el estado
      expect(mockComprobanteRepo.actualizarEstado).toHaveBeenCalledWith(
        empresaRuc,
        numeroComprobante,
        EstadoComprobante.ACEPTADO
      );
    });

    it('debe actualizar estado a RECHAZADO cuando el código indica rechazo', async () => {
      const cdrRechazado: CDR = {
        codigo: '2335',
        mensaje: 'El RUC del emisor no existe',
        xml: '<xml>CDR error</xml>',
        fechaRecepcion: new Date(),
      };

      await handler.procesarCDR(empresaRuc, numeroComprobante, cdrRechazado);

      expect(mockComprobanteRepo.actualizarEstado).toHaveBeenCalledWith(
        empresaRuc,
        numeroComprobante,
        EstadoComprobante.RECHAZADO
      );
    });

    it('debe manejar CDR sin XML', async () => {
      const cdrSinXml: CDR = {
        codigo: 'TICKET',
        mensaje: 'Ticket generado: 12345',
        xml: '',
        fechaRecepcion: new Date(),
      };

      await handler.procesarCDR(empresaRuc, numeroComprobante, cdrSinXml);

      // No debe intentar guardar en S3 si no hay XML
      expect(mockS3Repo.guardarXML).not.toHaveBeenCalled();

      // Pero sí debe guardar en DynamoDB y actualizar estado
      expect(mockComprobanteRepo.guardarCDR).toHaveBeenCalled();
      expect(mockComprobanteRepo.actualizarEstado).toHaveBeenCalledWith(
        empresaRuc,
        numeroComprobante,
        EstadoComprobante.ENVIADO
      );
    });

    it('debe propagar errores de almacenamiento en S3', async () => {
      mockS3Repo.guardarXML.mockRejectedValueOnce(new Error('Error de S3'));

      await expect(
        handler.procesarCDR(empresaRuc, numeroComprobante, cdrAceptado)
      ).rejects.toThrow('Error al procesar CDR');
    });

    it('debe propagar errores de almacenamiento en DynamoDB', async () => {
      mockComprobanteRepo.guardarCDR.mockRejectedValueOnce(new Error('Error de DynamoDB'));

      await expect(
        handler.procesarCDR(empresaRuc, numeroComprobante, cdrAceptado)
      ).rejects.toThrow('Error al procesar CDR');
    });

    it('debe manejar múltiples empresas correctamente (multi-tenant)', async () => {
      const empresa1 = '20111111111';
      const empresa2 = '20222222222';
      const numero1 = 'F001-00000001';
      const numero2 = 'B001-00000001';

      await handler.procesarCDR(empresa1, numero1, cdrAceptado);
      await handler.procesarCDR(empresa2, numero2, cdrAceptado);

      // Verificar que cada empresa tiene su propio almacenamiento
      expect(mockS3Repo.guardarXML).toHaveBeenCalledWith(
        empresa1,
        `cdr-${numero1}`,
        cdrAceptado.xml
      );
      expect(mockS3Repo.guardarXML).toHaveBeenCalledWith(
        empresa2,
        `cdr-${numero2}`,
        cdrAceptado.xml
      );
    });
  });
});
