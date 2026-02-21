/**
 * Pruebas unitarias para el handler de empresas
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { DatosEmpresa, Empresa } from '../../types';

// Mock del repositorio antes de importar el handler
const mockRegistrarEmpresa = jest.fn();
const mockObtenerEmpresa = jest.fn();
const mockActualizarEmpresa = jest.fn();
const mockListarEmpresas = jest.fn();
const mockEliminarEmpresa = jest.fn();

jest.mock('../../repositories/EmpresaRepository', () => {
  return {
    DynamoDBEmpresaRepository: jest.fn().mockImplementation(() => {
      return {
        registrarEmpresa: mockRegistrarEmpresa,
        obtenerEmpresa: mockObtenerEmpresa,
        actualizarEmpresa: mockActualizarEmpresa,
        listarEmpresas: mockListarEmpresas,
        eliminarEmpresa: mockEliminarEmpresa,
      };
    }),
  };
});

// Importar el handler después del mock
import { handler } from '../../handlers/empresas';

describe('Empresas Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  const empresaMock: Empresa = {
    ...datosEmpresaValidos,
    activo: true,
    fechaRegistro: new Date('2024-01-01'),
  };

  const createEvent = (
    method: string,
    path: string,
    body?: any,
    pathParameters?: any
  ): APIGatewayProxyEvent => {
    return {
      httpMethod: method,
      path,
      body: body ? JSON.stringify(body) : null,
      pathParameters,
      headers: {},
      multiValueHeaders: {},
      isBase64Encoded: false,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
    };
  };

  describe('POST /empresas - Registrar empresa', () => {
    it('debe registrar una nueva empresa con datos válidos', async () => {
      mockRegistrarEmpresa.mockResolvedValue(empresaMock);

      const event = createEvent('POST', '/empresas', datosEmpresaValidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.ruc).toBe('20123456789');
      expect(body.message).toBe('Empresa registrada exitosamente');
    });

    it('debe rechazar registro con RUC inválido (menos de 11 dígitos)', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, ruc: '123456789' };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Datos de empresa inválidos');
      expect(body.message).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe rechazar registro con RUC no numérico', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, ruc: '2012345678A' };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe rechazar registro sin razón social', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, razonSocial: '' };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Razón social es requerida');
    });

    it('debe rechazar registro sin dirección completa', async () => {
      const datosInvalidos = {
        ...datosEmpresaValidos,
        direccion: {
          departamento: '',
          provincia: 'Lima',
          distrito: 'Miraflores',
          direccion: 'Av. Test 123',
        },
      };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('departamento es requerido');
    });

    it('debe rechazar registro sin credenciales SUNAT', async () => {
      const datosInvalidos = {
        ...datosEmpresaValidos,
        credencialesSunat: {
          ruc: '20123456789',
          usuario: '',
          password: 'pass',
        },
      };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('usuario es requerido');
    });

    it('debe retornar 409 si la empresa ya existe', async () => {
      mockRegistrarEmpresa.mockRejectedValue(
        new Error('Ya existe una empresa con RUC 20123456789')
      );

      const event = createEvent('POST', '/empresas', datosEmpresaValidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Ya existe una empresa');
    });
  });

  describe('GET /empresas/{ruc} - Obtener empresa', () => {
    it('debe obtener una empresa existente', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);

      const event = createEvent('GET', '/empresas/20123456789', null, { ruc: '20123456789' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.ruc).toBe('20123456789');
    });

    it('debe retornar 404 si la empresa no existe', async () => {
      mockObtenerEmpresa.mockResolvedValue(null);

      const event = createEvent('GET', '/empresas/99999999999', null, { ruc: '99999999999' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('no encontrada');
    });

    it('debe rechazar RUC inválido', async () => {
      const event = createEvent('GET', '/empresas/123', null, { ruc: '123' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('RUC debe tener 11 dígitos numéricos');
    });
  });

  describe('PUT /empresas/{ruc} - Actualizar empresa', () => {
    it('debe actualizar una empresa existente', async () => {
      const empresaActualizada = {
        ...empresaMock,
        razonSocial: 'Nueva Razón Social',
      };
      mockActualizarEmpresa.mockResolvedValue(empresaActualizada);

      const event = createEvent(
        'PUT',
        '/empresas/20123456789',
        { razonSocial: 'Nueva Razón Social' },
        { ruc: '20123456789' }
      );
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.razonSocial).toBe('Nueva Razón Social');
      expect(body.message).toBe('Empresa actualizada exitosamente');
    });

    it('debe retornar 404 si la empresa no existe', async () => {
      mockActualizarEmpresa.mockRejectedValue(
        new Error('Empresa con RUC 99999999999 no encontrada')
      );

      const event = createEvent(
        'PUT',
        '/empresas/99999999999',
        { razonSocial: 'Test' },
        { ruc: '99999999999' }
      );
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('no encontrada');
    });

    it('debe rechazar actualización con datos inválidos', async () => {
      const event = createEvent(
        'PUT',
        '/empresas/20123456789',
        { razonSocial: '' },
        { ruc: '20123456789' }
      );
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Razón social es requerida');
    });
  });

  describe('GET /empresas - Listar empresas', () => {
    it('debe listar todas las empresas activas', async () => {
      const empresas = [empresaMock, { ...empresaMock, ruc: '20987654321' }];
      mockListarEmpresas.mockResolvedValue(empresas);

      const event = createEvent('GET', '/empresas');
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.empresas).toHaveLength(2);
      expect(body.data.total).toBe(2);
    });

    it('debe retornar array vacío si no hay empresas', async () => {
      mockListarEmpresas.mockResolvedValue([]);

      const event = createEvent('GET', '/empresas');
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.empresas).toHaveLength(0);
      expect(body.data.total).toBe(0);
    });
  });

  describe('DELETE /empresas/{ruc} - Eliminar empresa', () => {
    it('debe eliminar una empresa existente', async () => {
      mockEliminarEmpresa.mockResolvedValue(undefined);

      const event = createEvent('DELETE', '/empresas/20123456789', null, { ruc: '20123456789' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('eliminada exitosamente');
    });

    it('debe retornar 404 si la empresa no existe', async () => {
      mockEliminarEmpresa.mockRejectedValue(
        new Error('Empresa con RUC 99999999999 no encontrada')
      );

      const event = createEvent('DELETE', '/empresas/99999999999', null, { ruc: '99999999999' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('no encontrada');
    });
  });

  describe('Rutas no soportadas', () => {
    it('debe retornar 404 para rutas no existentes', async () => {
      const event = createEvent('GET', '/empresas/invalid/route');
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Ruta no encontrada');
    });

    it('debe retornar 404 para métodos no soportados', async () => {
      const event = createEvent('PATCH', '/empresas');
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Ruta no encontrada');
    });
  });

  describe('Validación exhaustiva de RUC', () => {
    it('debe rechazar RUC con más de 11 dígitos', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, ruc: '201234567890' };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe rechazar RUC vacío', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, ruc: '' };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('RUC es requerido');
    });

    it('debe rechazar RUC con caracteres especiales', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, ruc: '2012345678@' };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe rechazar RUC con espacios', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, ruc: '201 2345 678' };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe rechazar RUC null', async () => {
      const datosInvalidos = { ...datosEmpresaValidos, ruc: null as any };
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('RUC es requerido');
    });

    it('debe rechazar RUC undefined', async () => {
      const { ruc, ...datosInvalidos } = datosEmpresaValidos;
      const event = createEvent('POST', '/empresas', datosInvalidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('RUC es requerido');
    });

    it('debe aceptar RUC válido con exactamente 11 dígitos', async () => {
      mockRegistrarEmpresa.mockResolvedValue(empresaMock);

      const event = createEvent('POST', '/empresas', datosEmpresaValidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('debe validar RUC en operación de obtener empresa', async () => {
      const event = createEvent('GET', '/empresas/invalid', null, { ruc: 'invalid' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe validar RUC en operación de actualizar empresa', async () => {
      const event = createEvent('PUT', '/empresas/123', { razonSocial: 'Test' }, { ruc: '123' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('RUC debe tener 11 dígitos numéricos');
    });

    it('debe validar RUC en operación de eliminar empresa', async () => {
      const event = createEvent('DELETE', '/empresas/abc', null, { ruc: 'abc' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('RUC debe tener 11 dígitos numéricos');
    });
  });

  describe('Control de acceso', () => {
    it('debe permitir acceso a empresa propia', async () => {
      mockObtenerEmpresa.mockResolvedValue(empresaMock);

      const event = createEvent('GET', '/empresas/20123456789', null, { ruc: '20123456789' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.ruc).toBe('20123456789');
    });

    it('debe permitir listar todas las empresas (operación administrativa)', async () => {
      const empresas = [empresaMock, { ...empresaMock, ruc: '20987654321' }];
      mockListarEmpresas.mockResolvedValue(empresas);

      const event = createEvent('GET', '/empresas');
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.empresas).toHaveLength(2);
    });

    it('debe permitir registrar nueva empresa', async () => {
      mockRegistrarEmpresa.mockResolvedValue(empresaMock);

      const event = createEvent('POST', '/empresas', datosEmpresaValidos);
      const response = await handler(event);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('debe permitir actualizar empresa existente', async () => {
      const empresaActualizada = {
        ...empresaMock,
        razonSocial: 'Nueva Razón Social',
      };
      mockActualizarEmpresa.mockResolvedValue(empresaActualizada);

      const event = createEvent(
        'PUT',
        '/empresas/20123456789',
        { razonSocial: 'Nueva Razón Social' },
        { ruc: '20123456789' }
      );
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('debe permitir eliminar empresa existente', async () => {
      mockEliminarEmpresa.mockResolvedValue(undefined);

      const event = createEvent('DELETE', '/empresas/20123456789', null, { ruc: '20123456789' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('debe retornar 404 al intentar acceder a empresa inexistente', async () => {
      mockObtenerEmpresa.mockResolvedValue(null);

      const event = createEvent('GET', '/empresas/99999999999', null, { ruc: '99999999999' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('no encontrada');
    });

    it('debe retornar 404 al intentar actualizar empresa inexistente', async () => {
      mockActualizarEmpresa.mockRejectedValue(
        new Error('Empresa con RUC 99999999999 no encontrada')
      );

      const event = createEvent(
        'PUT',
        '/empresas/99999999999',
        { razonSocial: 'Test' },
        { ruc: '99999999999' }
      );
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('debe retornar 404 al intentar eliminar empresa inexistente', async () => {
      mockEliminarEmpresa.mockRejectedValue(
        new Error('Empresa con RUC 99999999999 no encontrada')
      );

      const event = createEvent('DELETE', '/empresas/99999999999', null, { ruc: '99999999999' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });
});
