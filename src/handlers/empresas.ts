import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBEmpresaRepository } from '../repositories/EmpresaRepository';
import { DatosEmpresa, ApiResponse, Empresa } from '../types';

/**
 * Handler Lambda para gestión de empresas
 * Implementa operaciones CRUD para empresas en el sistema multi-tenant
 *
 * Rutas soportadas:
 * - POST /empresas - Registrar nueva empresa
 * - GET /empresas/{ruc} - Obtener empresa por RUC
 * - PUT /empresas/{ruc} - Actualizar empresa
 * - GET /empresas - Listar todas las empresas
 * - DELETE /empresas/{ruc} - Eliminar empresa (soft delete)
 */

const repository = new DynamoDBEmpresaRepository();

/**
 * Crea una respuesta HTTP estándar
 */
function createResponse(
  statusCode: number,
  body: ApiResponse<unknown>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Valida que el RUC tenga el formato correcto (11 dígitos numéricos)
 */
function validarRUC(ruc: string): { valido: boolean; error?: string } {
  if (!ruc || typeof ruc !== 'string') {
    return { valido: false, error: 'RUC es requerido' };
  }

  if (!/^\d{11}$/.test(ruc)) {
    return { valido: false, error: 'RUC debe tener 11 dígitos numéricos' };
  }

  return { valido: true };
}

/**
 * Valida los datos de una empresa
 */
function validarDatosEmpresa(
  datos: Partial<DatosEmpresa>,
  esRegistro: boolean = false
): { valido: boolean; errores: string[] } {
  const errores: string[] = [];

  // En registro, el RUC es obligatorio
  if (esRegistro && !datos.ruc) {
    errores.push('RUC es requerido');
  } else if (datos.ruc !== undefined) {
    const validacionRUC = validarRUC(datos.ruc);
    if (!validacionRUC.valido) {
      errores.push(validacionRUC.error!);
    }
  }

  if (datos.razonSocial !== undefined && (!datos.razonSocial || datos.razonSocial.trim() === '')) {
    errores.push('Razón social es requerida');
  }

  if (
    datos.nombreComercial !== undefined &&
    (!datos.nombreComercial || datos.nombreComercial.trim() === '')
  ) {
    errores.push('Nombre comercial es requerido');
  }

  if (datos.direccion !== undefined) {
    if (!datos.direccion.direccion || datos.direccion.direccion.trim() === '') {
      errores.push('Dirección: dirección es requerida');
    }
    if (!datos.direccion.departamento || datos.direccion.departamento.trim() === '') {
      errores.push('Dirección: departamento es requerido');
    }
    if (!datos.direccion.provincia || datos.direccion.provincia.trim() === '') {
      errores.push('Dirección: provincia es requerida');
    }
    if (!datos.direccion.distrito || datos.direccion.distrito.trim() === '') {
      errores.push('Dirección: distrito es requerido');
    }
  }

  if (datos.credencialesSunat !== undefined) {
    if (!datos.credencialesSunat.ruc || datos.credencialesSunat.ruc.trim() === '') {
      errores.push('Credenciales SUNAT: RUC es requerido');
    }
    if (!datos.credencialesSunat.usuario || datos.credencialesSunat.usuario.trim() === '') {
      errores.push('Credenciales SUNAT: usuario es requerido');
    }
    if (!datos.credencialesSunat.password || datos.credencialesSunat.password.trim() === '') {
      errores.push('Credenciales SUNAT: password es requerido');
    }
  }

  return { valido: errores.length === 0, errores };
}

/**
 * Registra una nueva empresa
 */
async function registrarEmpresa(body: string): Promise<APIGatewayProxyResult> {
  try {
    const datos: DatosEmpresa = JSON.parse(body);

    // Validar datos completos para registro
    const validacion = validarDatosEmpresa(datos, true);
    if (!validacion.valido) {
      return createResponse(400, {
        success: false,
        error: 'Datos de empresa inválidos',
        message: validacion.errores.join(', '),
      });
    }

    const empresa = await repository.registrarEmpresa(datos);

    return createResponse(201, {
      success: true,
      data: empresa,
      message: 'Empresa registrada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al registrar empresa:', error);

    if (error.message.includes('Ya existe una empresa')) {
      return createResponse(409, {
        success: false,
        error: error.message,
      });
    }

    return createResponse(500, {
      success: false,
      error: 'Error al registrar empresa',
      message: error.message,
    });
  }
}

/**
 * Obtiene una empresa por su RUC
 */
async function obtenerEmpresa(ruc: string): Promise<APIGatewayProxyResult> {
  try {
    const validacion = validarRUC(ruc);
    if (!validacion.valido) {
      return createResponse(400, {
        success: false,
        error: validacion.error,
      });
    }

    const empresa = await repository.obtenerEmpresa(ruc);

    if (!empresa) {
      return createResponse(404, {
        success: false,
        error: `Empresa con RUC ${ruc} no encontrada`,
      });
    }

    return createResponse(200, {
      success: true,
      data: empresa,
    });
  } catch (error: any) {
    console.error('Error al obtener empresa:', error);
    return createResponse(500, {
      success: false,
      error: 'Error al obtener empresa',
      message: error.message,
    });
  }
}

/**
 * Actualiza los datos de una empresa
 */
async function actualizarEmpresa(ruc: string, body: string): Promise<APIGatewayProxyResult> {
  try {
    const validacion = validarRUC(ruc);
    if (!validacion.valido) {
      return createResponse(400, {
        success: false,
        error: validacion.error,
      });
    }

    const datos: Partial<DatosEmpresa> = JSON.parse(body);

    // Validar datos de actualización
    const validacionDatos = validarDatosEmpresa(datos);
    if (!validacionDatos.valido) {
      return createResponse(400, {
        success: false,
        error: 'Datos de empresa inválidos',
        message: validacionDatos.errores.join(', '),
      });
    }

    const empresa = await repository.actualizarEmpresa(ruc, datos);

    return createResponse(200, {
      success: true,
      data: empresa,
      message: 'Empresa actualizada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al actualizar empresa:', error);

    if (error.message.includes('no encontrada')) {
      return createResponse(404, {
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes('No hay datos para actualizar')) {
      return createResponse(400, {
        success: false,
        error: error.message,
      });
    }

    return createResponse(500, {
      success: false,
      error: 'Error al actualizar empresa',
      message: error.message,
    });
  }
}

/**
 * Lista todas las empresas activas
 */
async function listarEmpresas(): Promise<APIGatewayProxyResult> {
  try {
    const empresas = await repository.listarEmpresas();

    return createResponse(200, {
      success: true,
      data: {
        empresas,
        total: empresas.length,
      },
    });
  } catch (error: any) {
    console.error('Error al listar empresas:', error);
    return createResponse(500, {
      success: false,
      error: 'Error al listar empresas',
      message: error.message,
    });
  }
}

/**
 * Elimina una empresa (soft delete)
 */
async function eliminarEmpresa(ruc: string): Promise<APIGatewayProxyResult> {
  try {
    const validacion = validarRUC(ruc);
    if (!validacion.valido) {
      return createResponse(400, {
        success: false,
        error: validacion.error,
      });
    }

    await repository.eliminarEmpresa(ruc);

    return createResponse(200, {
      success: true,
      message: `Empresa con RUC ${ruc} eliminada exitosamente`,
    });
  } catch (error: any) {
    console.error('Error al eliminar empresa:', error);

    if (error.message.includes('no encontrada')) {
      return createResponse(404, {
        success: false,
        error: error.message,
      });
    }

    return createResponse(500, {
      success: false,
      error: 'Error al eliminar empresa',
      message: error.message,
    });
  }
}

/**
 * Handler principal
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const method = event.httpMethod;
  const path = event.path;
  const pathParameters = event.pathParameters;
  const body = event.body || '';

  try {
    // POST /empresas - Registrar nueva empresa
    if (method === 'POST' && path === '/empresas') {
      return await registrarEmpresa(body);
    }

    // GET /empresas - Listar todas las empresas
    if (method === 'GET' && path === '/empresas') {
      return await listarEmpresas();
    }

    // GET /empresas/{ruc} - Obtener empresa por RUC
    if (method === 'GET' && pathParameters?.ruc) {
      return await obtenerEmpresa(pathParameters.ruc);
    }

    // PUT /empresas/{ruc} - Actualizar empresa
    if (method === 'PUT' && pathParameters?.ruc) {
      return await actualizarEmpresa(pathParameters.ruc, body);
    }

    // DELETE /empresas/{ruc} - Eliminar empresa
    if (method === 'DELETE' && pathParameters?.ruc) {
      return await eliminarEmpresa(pathParameters.ruc);
    }

    // Ruta no encontrada
    return createResponse(404, {
      success: false,
      error: 'Ruta no encontrada',
      message: `${method} ${path} no está soportado`,
    });
  } catch (error: any) {
    console.error('Error no manejado:', error);
    return createResponse(500, {
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
    });
  }
};
