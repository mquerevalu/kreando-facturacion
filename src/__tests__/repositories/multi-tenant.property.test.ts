/**
 * Pruebas basadas en propiedades para aislamiento multi-tenant
 * Feature: sunat, Property 27: Aislamiento de datos multi-tenant
 * 
 * **Validates: Arquitectura multi-tenant**
 * 
 * Para cualquier consulta o operación sobre comprobantes, el sistema debe garantizar
 * que una empresa solo pueda acceder a sus propios comprobantes, rechazando accesos
 * a comprobantes de otras empresas.
 */

import * as fc from 'fast-check';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBComprobanteRepository } from '../../repositories/ComprobanteRepository';
import { S3FileRepository } from '../../repositories/S3Repository';
import {
  Comprobante,
  TipoComprobante,
  EstadoComprobante,
  TipoMoneda,
  TipoDocumentoIdentidad,
  Emisor,
  Receptor,
  ItemComprobante,
  AfectacionIGV,
  Direccion,
  CDR,
} from '../../types';

const ddbMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

/**
 * Generador de RUC válido (11 dígitos numéricos)
 */
const rucArbitrary = (): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 11, maxLength: 11 })
    .map((digits) => digits.join(''));

/**
 * Generador de DNI válido (8 dígitos numéricos)
 */
const dniArbitrary = (): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map((digits) => digits.join(''));

/**
 * Generador de direcciones válidas
 */
const direccionArbitrary = (): fc.Arbitrary<Direccion> =>
  fc.record({
    departamento: fc.string({ minLength: 3, maxLength: 50 }),
    provincia: fc.string({ minLength: 3, maxLength: 50 }),
    distrito: fc.string({ minLength: 3, maxLength: 50 }),
    direccion: fc.string({ minLength: 5, maxLength: 100 }),
  });

/**
 * Generador de emisor válido
 */
const emisorArbitrary = (ruc: string): fc.Arbitrary<Emisor> =>
  fc.record({
    ruc: fc.constant(ruc),
    razonSocial: fc.string({ minLength: 5, maxLength: 100 }),
    nombreComercial: fc.string({ minLength: 3, maxLength: 100 }),
    direccion: direccionArbitrary(),
  });

/**
 * Generador de receptor para boleta (con DNI)
 */
const receptorBoletaArbitrary = (): fc.Arbitrary<Receptor> =>
  fc.record({
    tipoDocumento: fc.constant(TipoDocumentoIdentidad.DNI),
    numeroDocumento: dniArbitrary(),
    nombre: fc.string({ minLength: 5, maxLength: 100 }),
    direccion: fc.option(direccionArbitrary(), { nil: undefined }),
  });

/**
 * Generador de items de comprobante
 */
const itemComprobanteArbitrary = (): fc.Arbitrary<ItemComprobante> =>
  fc.record({
    codigo: fc.string({ minLength: 1, maxLength: 30 }),
    descripcion: fc.string({ minLength: 5, maxLength: 200 }),
    cantidad: fc.integer({ min: 1, max: 1000 }),
    unidadMedida: fc.constantFrom('NIU', 'ZZ', 'KGM', 'MTR'),
    precioUnitario: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(10000),
      noNaN: true,
    }),
    afectacionIGV: fc.constantFrom(
      AfectacionIGV.GRAVADO_OPERACION_ONEROSA,
      AfectacionIGV.EXONERADO_OPERACION_ONEROSA,
      AfectacionIGV.INAFECTO_OPERACION_ONEROSA
    ),
    igv: fc.float({ min: Math.fround(0), max: Math.fround(1800), noNaN: true }),
    total: fc.float({ min: Math.fround(0.01), max: Math.fround(11800), noNaN: true }),
  });

/**
 * Generador de comprobante para una empresa específica
 */
const comprobanteParaEmpresaArbitrary = (empresaRuc: string): fc.Arbitrary<Comprobante> =>
  fc.record({
    empresaRuc: fc.constant(empresaRuc),
    numero: fc
      .tuple(
        fc.constantFrom('B001', 'B002', 'B003'),
        fc.integer({ min: 1, max: 99999999 })
      )
      .map(([serie, num]) => `${serie}-${num.toString().padStart(8, '0')}`),
    tipo: fc.constant(TipoComprobante.BOLETA),
    fecha: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    emisor: emisorArbitrary(empresaRuc),
    receptor: receptorBoletaArbitrary(),
    items: fc.array(itemComprobanteArbitrary(), { minLength: 1, maxLength: 10 }),
    subtotal: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(100000),
      noNaN: true,
    }),
    igv: fc.float({ min: Math.fround(0), max: Math.fround(18000), noNaN: true }),
    total: fc.float({
      min: Math.fround(0.01),
      max: Math.fround(118000),
      noNaN: true,
    }),
    moneda: fc.constantFrom(TipoMoneda.PEN, TipoMoneda.USD),
    estado: fc.constantFrom(
      EstadoComprobante.PENDIENTE,
      EstadoComprobante.ENVIADO,
      EstadoComprobante.ACEPTADO,
      EstadoComprobante.RECHAZADO
    ),
  });

/**
 * Generador de CDR
 */
const cdrArbitrary = (): fc.Arbitrary<CDR> =>
  fc.record({
    codigo: fc.constantFrom('0', '1', '2', '3'),
    mensaje: fc.string({ minLength: 5, maxLength: 200 }),
    xml: fc.string({ minLength: 10, maxLength: 1000 }),
    fechaRecepcion: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  });

describe('Property 27: Aislamiento de datos multi-tenant', () => {
  let comprobanteRepository: DynamoDBComprobanteRepository;
  let s3Repository: S3FileRepository;

  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    comprobanteRepository = new DynamoDBComprobanteRepository(
      ddbMock as unknown as DynamoDBClient,
      'test-comprobantes',
      'test-contadores'
    );
    s3Repository = new S3FileRepository(s3Mock as unknown as S3Client, 'test-bucket');
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier par de empresas diferentes (empresaA, empresaB) y
   * cualquier comprobante de empresaA, cuando empresaB intenta guardar ese comprobante,
   * el sistema debe rechazar la operación.
   */
  it('debe rechazar guardar comprobantes que no pertenecen a la empresa', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaA
        rucArbitrary(), // empresaB
        comprobanteParaEmpresaArbitrary('00000000000'), // comprobante template
        async (empresaA, empresaB, comprobanteTemplate) => {
          // Pre-condición: las empresas deben ser diferentes
          fc.pre(empresaA !== empresaB);

          // Crear un comprobante para empresaA
          const comprobante = {
            ...comprobanteTemplate,
            empresaRuc: empresaA,
            emisor: {
              ...comprobanteTemplate.emisor,
              ruc: empresaA,
            },
          };

          // Intentar guardar el comprobante de empresaA usando empresaB
          await expect(
            comprobanteRepository.guardarComprobante(empresaB, comprobante)
          ).rejects.toThrow('El comprobante no pertenece a la empresa especificada');
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier empresa y cualquier comprobante válido de esa empresa,
   * el sistema debe permitir guardar el comprobante cuando el RUC coincide.
   */
  it('debe permitir guardar comprobantes que pertenecen a la empresa', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaRuc
        comprobanteParaEmpresaArbitrary('00000000000'), // comprobante template
        async (empresaRuc, comprobanteTemplate) => {
          // Pre-condición: la fecha debe ser válida
          fc.pre(!isNaN(comprobanteTemplate.fecha.getTime()));

          // Crear un comprobante para la empresa
          const comprobante = {
            ...comprobanteTemplate,
            empresaRuc: empresaRuc,
            emisor: {
              ...comprobanteTemplate.emisor,
              ruc: empresaRuc,
            },
          };

          // Mock de DynamoDB para permitir la operación
          ddbMock.resolves({});

          // Guardar el comprobante debe funcionar sin errores
          await expect(
            comprobanteRepository.guardarComprobante(empresaRuc, comprobante)
          ).resolves.not.toThrow();
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier par de empresas diferentes y cualquier número de comprobante,
   * cuando empresaB intenta obtener un comprobante usando el número de empresaA,
   * el sistema debe retornar null (no encontrado) porque la búsqueda filtra por empresaRuc.
   */
  it('debe aislar consultas de comprobantes por empresa', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaA
        rucArbitrary(), // empresaB
        fc.string({ minLength: 1, maxLength: 20 }), // numero de comprobante
        async (empresaA, empresaB, numero) => {
          // Pre-condición: las empresas deben ser diferentes
          fc.pre(empresaA !== empresaB);

          // Mock de DynamoDB para retornar vacío (no encontrado)
          ddbMock.resolves({ Item: undefined });

          // EmpresaB intenta obtener un comprobante con un número cualquiera
          // El sistema debe buscar solo en los comprobantes de empresaB
          const comprobante = await comprobanteRepository.obtenerComprobante(empresaB, numero);

          // Debe retornar null porque no existe para empresaB
          expect(comprobante).toBeNull();
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier par de empresas diferentes y cualquier número de comprobante,
   * cuando empresaB intenta guardar un CDR para un comprobante de empresaA,
   * el sistema debe rechazar la operación.
   */
  it('debe rechazar guardar CDR para comprobantes de otras empresas', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaA
        rucArbitrary(), // empresaB
        fc.string({ minLength: 1, maxLength: 20 }), // numero de comprobante
        cdrArbitrary(), // CDR
        async (empresaA, empresaB, numero, cdr) => {
          // Pre-condiciones
          fc.pre(empresaA !== empresaB);
          fc.pre(!isNaN(cdr.fechaRecepcion.getTime())); // Fecha válida

          // Mock de DynamoDB para simular que el comprobante no existe para empresaB
          ddbMock.rejects({
            name: 'ConditionalCheckFailedException',
            message: 'The conditional request failed',
          });

          // EmpresaB intenta guardar un CDR para un número de comprobante
          // El sistema debe verificar que el comprobante existe para empresaB
          await expect(
            comprobanteRepository.guardarCDR(empresaB, numero, cdr)
          ).rejects.toThrow(`Comprobante ${numero} no encontrado para empresa ${empresaB}`);
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier par de empresas diferentes y cualquier número de comprobante,
   * cuando empresaB intenta actualizar el estado de un comprobante de empresaA,
   * el sistema debe rechazar la operación.
   */
  it('debe rechazar actualizar estado de comprobantes de otras empresas', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaA
        rucArbitrary(), // empresaB
        fc.string({ minLength: 1, maxLength: 20 }), // numero de comprobante
        fc.constantFrom(
          EstadoComprobante.PENDIENTE,
          EstadoComprobante.ENVIADO,
          EstadoComprobante.ACEPTADO,
          EstadoComprobante.RECHAZADO
        ), // nuevo estado
        async (empresaA, empresaB, numero, nuevoEstado) => {
          // Pre-condición: las empresas deben ser diferentes
          fc.pre(empresaA !== empresaB);

          // Mock de DynamoDB para simular que el comprobante no existe para empresaB
          ddbMock.rejects({
            name: 'ConditionalCheckFailedException',
            message: 'The conditional request failed',
          });

          // EmpresaB intenta actualizar el estado de un comprobante
          // El sistema debe verificar que el comprobante existe para empresaB
          await expect(
            comprobanteRepository.actualizarEstado(empresaB, numero, nuevoEstado)
          ).rejects.toThrow(`Comprobante ${numero} no encontrado para empresa ${empresaB}`);
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier empresa, cuando lista comprobantes pendientes,
   * el sistema debe retornar solo comprobantes de esa empresa (filtrados por empresaRuc).
   */
  it('debe listar solo comprobantes pendientes de la empresa solicitante', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaRuc
        fc.array(
          fc.record({
            numero: fc
              .tuple(
                fc.constantFrom('B001', 'B002', 'B003'),
                fc.integer({ min: 1, max: 99999999 })
              )
              .map(([serie, num]) => `${serie}-${num.toString().padStart(8, '0')}`),
            fecha: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (empresaRuc, comprobantesData) => {
          // Pre-condición: todas las fechas deben ser válidas
          fc.pre(comprobantesData.every((data) => !isNaN(data.fecha.getTime())));

          // Mock de DynamoDB para retornar comprobantes
          ddbMock.resolves({
            Items: comprobantesData.map((data) => ({
              empresaRuc: { S: empresaRuc },
              numero: { S: data.numero },
              tipo: { S: TipoComprobante.BOLETA },
              fecha: { S: data.fecha.toISOString() },
              estado: { S: EstadoComprobante.PENDIENTE },
              subtotal: { N: '100' },
              igv: { N: '18' },
              total: { N: '118' },
              moneda: { S: TipoMoneda.PEN },
              emisor: {
                M: {
                  ruc: { S: empresaRuc },
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
                  tipoDocumento: { S: TipoDocumentoIdentidad.DNI },
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
                      afectacionIGV: { S: AfectacionIGV.GRAVADO_OPERACION_ONEROSA },
                      igv: { N: '18' },
                      total: { N: '118' },
                    },
                  },
                ],
              },
            })),
          });

          // Listar comprobantes pendientes
          const pendientes = await comprobanteRepository.listarPendientes(empresaRuc);

          // Todos los comprobantes deben pertenecer a la empresa
          pendientes.forEach((comprobante) => {
            expect(comprobante.empresaRuc).toBe(empresaRuc);
            expect(comprobante.estado).toBe(EstadoComprobante.PENDIENTE);
          });
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier par de empresas diferentes y cualquier ruta de archivo,
   * cuando empresaB intenta eliminar un archivo que no comienza con su RUC,
   * el sistema debe rechazar la operación.
   */
  it('debe rechazar eliminar archivos de otras empresas en S3', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaA
        rucArbitrary(), // empresaB
        fc.string({ minLength: 1, maxLength: 50 }), // nombre de archivo
        async (empresaA, empresaB, nombreArchivo) => {
          // Pre-condición: las empresas deben ser diferentes
          fc.pre(empresaA !== empresaB);

          // Construir ruta de archivo de empresaA
          const rutaArchivoEmpresaA = `${empresaA}/xmls/${nombreArchivo}.xml`;

          // EmpresaB intenta eliminar un archivo de empresaA
          await expect(
            s3Repository.eliminarArchivo(empresaB, rutaArchivoEmpresaA)
          ).rejects.toThrow('La ruta del archivo no pertenece a la empresa especificada');
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier empresa y cualquier nombre de archivo,
   * cuando guarda un XML, el sistema debe organizarlo con el prefijo del RUC de la empresa.
   */
  it('debe organizar archivos XML por empresa usando prefijos', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaRuc
        fc.string({ minLength: 1, maxLength: 20 }), // numero de comprobante
        fc.string({ minLength: 10, maxLength: 1000 }), // contenido XML
        async (empresaRuc, numero, contenidoXML) => {
          // Mock de S3 para permitir la operación
          s3Mock.resolves({});

          // Guardar XML
          const ruta = await s3Repository.guardarXML(empresaRuc, numero, contenidoXML);

          // La ruta debe comenzar con el RUC de la empresa
          expect(ruta).toMatch(new RegExp(`^${empresaRuc}/xmls/`));
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier empresa y cualquier nombre de archivo,
   * cuando guarda un PDF, el sistema debe organizarlo con el prefijo del RUC de la empresa.
   */
  it('debe organizar archivos PDF por empresa usando prefijos', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaRuc
        fc.string({ minLength: 1, maxLength: 20 }), // numero de comprobante
        fc.uint8Array({ minLength: 10, maxLength: 1000 }), // contenido PDF
        async (empresaRuc, numero, contenidoPDF) => {
          // Mock de S3 para permitir la operación
          s3Mock.resolves({});

          // Guardar PDF
          const ruta = await s3Repository.guardarPDF(empresaRuc, numero, Buffer.from(contenidoPDF));

          // La ruta debe comenzar con el RUC de la empresa
          expect(ruta).toMatch(new RegExp(`^${empresaRuc}/pdfs/`));
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier empresa y cualquier nombre de certificado,
   * cuando guarda un certificado, el sistema debe organizarlo con el prefijo del RUC de la empresa.
   */
  it('debe organizar certificados por empresa usando prefijos', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaRuc
        fc.string({ minLength: 1, maxLength: 50 }), // nombre de certificado
        fc.uint8Array({ minLength: 10, maxLength: 1000 }), // contenido certificado
        async (empresaRuc, nombreCertificado, contenidoCertificado) => {
          // Mock de S3 para permitir la operación
          s3Mock.resolves({});

          // Guardar certificado
          const ruta = await s3Repository.guardarCertificado(
            empresaRuc,
            nombreCertificado,
            Buffer.from(contenidoCertificado)
          );

          // La ruta debe comenzar con el RUC de la empresa
          expect(ruta).toMatch(new RegExp(`^${empresaRuc}/certificados/`));
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * **Validates: Arquitectura multi-tenant**
   * 
   * Propiedad: Para cualquier empresa, cuando lista archivos,
   * el sistema debe retornar solo archivos con el prefijo del RUC de esa empresa.
   */
  it('debe listar solo archivos de la empresa solicitante', async () => {
    await fc.assert(
      fc.asyncProperty(
        rucArbitrary(), // empresaRuc
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }), // nombres de archivos
        async (empresaRuc, nombresArchivos) => {
          // Mock de S3 para retornar archivos con el prefijo correcto
          s3Mock.resolves({
            Contents: nombresArchivos.map((nombre) => ({
              Key: `${empresaRuc}/xmls/${nombre}.xml`,
            })),
          });

          // Listar archivos
          const archivos = await s3Repository.listarArchivos(empresaRuc, 'xmls');

          // Todos los archivos deben comenzar con el RUC de la empresa
          archivos.forEach((archivo) => {
            expect(archivo).toMatch(new RegExp(`^${empresaRuc}/`));
          });
        }
      ),
      { numRuns: 25 }
    );
  });
});
