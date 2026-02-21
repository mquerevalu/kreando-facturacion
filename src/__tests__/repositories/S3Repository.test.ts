/**
 * Pruebas unitarias para S3Repository
 * Valida el almacenamiento de archivos con aislamiento multi-tenant
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { Readable } from 'stream';
import { S3FileRepository } from '../../repositories/S3Repository';

const s3Mock = mockClient(S3Client);

describe('S3FileRepository', () => {
  let repository: S3FileRepository;
  const testBucket = 'test-bucket';
  const testRuc = '20123456789';

  beforeEach(() => {
    s3Mock.reset();
    repository = new S3FileRepository(new S3Client({}), testBucket);
  });

  describe('guardarXML', () => {
    it('debe guardar un XML con la ruta correcta por empresa', async () => {
      const numero = 'B001-00000001';
      const contenido = '<?xml version="1.0"?><Invoice></Invoice>';

      s3Mock.on(PutObjectCommand).resolves({});

      const ruta = await repository.guardarXML(testRuc, numero, contenido);

      expect(ruta).toBe(`${testRuc}/xmls/B001-00000001.xml`);
      expect(s3Mock.calls()).toHaveLength(1);

      const call = s3Mock.call(0);
      expect(call.args[0].input).toMatchObject({
        Bucket: testBucket,
        Key: `${testRuc}/xmls/B001-00000001.xml`,
        Body: contenido,
        ContentType: 'application/xml',
      });
    });

    it('debe sanitizar caracteres especiales en el número', async () => {
      const numero = 'F001/00000123';
      const contenido = '<?xml version="1.0"?><Invoice></Invoice>';

      s3Mock.on(PutObjectCommand).resolves({});

      const ruta = await repository.guardarXML(testRuc, numero, contenido);

      expect(ruta).toBe(`${testRuc}/xmls/F001_00000123.xml`);
    });
  });

  describe('recuperarXML', () => {
    it('debe recuperar un XML existente', async () => {
      const numero = 'B001-00000001';
      const contenido = '<?xml version="1.0"?><Invoice></Invoice>';

      const stream = Readable.from([Buffer.from(contenido)]);
      s3Mock.on(GetObjectCommand).resolves({ Body: stream as any });

      const resultado = await repository.recuperarXML(testRuc, numero);

      expect(resultado).toBe(contenido);
      expect(s3Mock.calls()).toHaveLength(1);
    });

    it('debe retornar null si el archivo no existe', async () => {
      const numero = 'B001-00000001';

      s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });

      const resultado = await repository.recuperarXML(testRuc, numero);

      expect(resultado).toBeNull();
    });

    it('debe propagar otros errores', async () => {
      const numero = 'B001-00000001';

      s3Mock.on(GetObjectCommand).rejects(new Error('Network error'));

      await expect(repository.recuperarXML(testRuc, numero)).rejects.toThrow('Network error');
    });
  });

  describe('guardarPDF', () => {
    it('debe guardar un PDF con la ruta correcta por empresa', async () => {
      const numero = 'B001-00000001';
      const contenido = Buffer.from('PDF content');

      s3Mock.on(PutObjectCommand).resolves({});

      const ruta = await repository.guardarPDF(testRuc, numero, contenido);

      expect(ruta).toBe(`${testRuc}/pdfs/B001-00000001.pdf`);
      expect(s3Mock.calls()).toHaveLength(1);

      const call = s3Mock.call(0);
      expect(call.args[0].input).toMatchObject({
        Bucket: testBucket,
        Key: `${testRuc}/pdfs/B001-00000001.pdf`,
        Body: contenido,
        ContentType: 'application/pdf',
      });
    });
  });

  describe('recuperarPDF', () => {
    it('debe recuperar un PDF existente', async () => {
      const numero = 'B001-00000001';
      const contenido = Buffer.from('PDF content');

      const stream = Readable.from([contenido]);
      s3Mock.on(GetObjectCommand).resolves({ Body: stream as any });

      const resultado = await repository.recuperarPDF(testRuc, numero);

      expect(resultado).toEqual(contenido);
    });

    it('debe retornar null si el PDF no existe', async () => {
      const numero = 'B001-00000001';

      s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });

      const resultado = await repository.recuperarPDF(testRuc, numero);

      expect(resultado).toBeNull();
    });
  });

  describe('guardarCertificado', () => {
    it('debe guardar un certificado con encriptación', async () => {
      const nombre = 'certificado.pfx';
      const contenido = Buffer.from('Certificate content');

      s3Mock.on(PutObjectCommand).resolves({});

      const ruta = await repository.guardarCertificado(testRuc, nombre, contenido);

      expect(ruta).toBe(`${testRuc}/certificados/certificado.pfx`);
      expect(s3Mock.calls()).toHaveLength(1);

      const call = s3Mock.call(0);
      expect(call.args[0].input).toMatchObject({
        Bucket: testBucket,
        Key: `${testRuc}/certificados/certificado.pfx`,
        Body: contenido,
        ContentType: 'application/x-pkcs12',
        ServerSideEncryption: 'AES256',
      });
    });

    it('debe sanitizar caracteres especiales en el nombre', async () => {
      const nombre = 'cert@2024!.pfx';
      const contenido = Buffer.from('Certificate content');

      s3Mock.on(PutObjectCommand).resolves({});

      const ruta = await repository.guardarCertificado(testRuc, nombre, contenido);

      expect(ruta).toBe(`${testRuc}/certificados/cert_2024_.pfx`);
    });
  });

  describe('recuperarCertificado', () => {
    it('debe recuperar un certificado existente', async () => {
      const nombre = 'certificado.pfx';
      const contenido = Buffer.from('Certificate content');

      const stream = Readable.from([contenido]);
      s3Mock.on(GetObjectCommand).resolves({ Body: stream as any });

      const resultado = await repository.recuperarCertificado(testRuc, nombre);

      expect(resultado).toEqual(contenido);
    });

    it('debe retornar null si el certificado no existe', async () => {
      const nombre = 'certificado.pfx';

      s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });

      const resultado = await repository.recuperarCertificado(testRuc, nombre);

      expect(resultado).toBeNull();
    });
  });

  describe('eliminarArchivo', () => {
    it('debe eliminar un archivo de la empresa', async () => {
      const ruta = `${testRuc}/xmls/B001-00000001.xml`;

      s3Mock.on(DeleteObjectCommand).resolves({});

      await repository.eliminarArchivo(testRuc, ruta);

      expect(s3Mock.calls()).toHaveLength(1);
    });

    it('debe rechazar eliminar archivos de otra empresa', async () => {
      const otraEmpresa = '20987654321';
      const ruta = `${otraEmpresa}/xmls/B001-00000001.xml`;

      await expect(repository.eliminarArchivo(testRuc, ruta)).rejects.toThrow(
        'La ruta del archivo no pertenece a la empresa especificada'
      );

      expect(s3Mock.calls()).toHaveLength(0);
    });
  });

  describe('listarArchivos', () => {
    it('debe listar archivos de una empresa', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: `${testRuc}/xmls/B001-00000001.xml` },
          { Key: `${testRuc}/xmls/B001-00000002.xml` },
        ],
      });

      const archivos = await repository.listarArchivos(testRuc);

      expect(archivos).toHaveLength(2);
      expect(archivos[0]).toBe(`${testRuc}/xmls/B001-00000001.xml`);
    });

    it('debe listar archivos con prefijo específico', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: `${testRuc}/pdfs/B001-00000001.pdf` }],
      });

      const archivos = await repository.listarArchivos(testRuc, 'pdfs');

      expect(archivos).toHaveLength(1);
      expect(archivos[0]).toBe(`${testRuc}/pdfs/B001-00000001.pdf`);
    });

    it('debe retornar array vacío si no hay archivos', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const archivos = await repository.listarArchivos(testRuc);

      expect(archivos).toEqual([]);
    });
  });

  describe('Aislamiento multi-tenant', () => {
    it('debe organizar archivos por RUC de empresa', async () => {
      const empresa1 = '20123456789';
      const empresa2 = '20987654321';
      const numero = 'B001-00000001';
      const contenido = '<?xml version="1.0"?><Invoice></Invoice>';

      s3Mock.on(PutObjectCommand).resolves({});

      const ruta1 = await repository.guardarXML(empresa1, numero, contenido);
      const ruta2 = await repository.guardarXML(empresa2, numero, contenido);

      expect(ruta1).toBe(`${empresa1}/xmls/B001-00000001.xml`);
      expect(ruta2).toBe(`${empresa2}/xmls/B001-00000001.xml`);
      expect(ruta1).not.toBe(ruta2);
    });

    it('debe prevenir acceso a archivos de otra empresa', async () => {
      const empresa1 = '20123456789';
      const empresa2 = '20987654321';
      const ruta = `${empresa2}/xmls/B001-00000001.xml`;

      await expect(repository.eliminarArchivo(empresa1, ruta)).rejects.toThrow(
        'La ruta del archivo no pertenece a la empresa especificada'
      );
    });
  });
});
