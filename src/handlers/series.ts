import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBSerieRepository } from '../repositories/SerieRepository';
import { DatosSerie, ApiResponse, TipoComprobante } from '../types';

/**
 * Handler Lambda para gestión de series de comprobantes
 *
 * Rutas soportadas:
 * - POST /series - Registrar nueva serie
 * - GET /series/{empresaRuc} - Listar series de una empresa
 * - GET /series/{empresaRuc}/{tipoComprobante}/{serie} - Obtener serie específica
 * - PUT /series/{empresaRuc}/{tipoComprobante}/{serie} - Actualizar serie
 * - DELETE /series/{empresaRuc}/{tipoComprobante}/{serie} - Eliminar serie
 */

const repository = new DynamoDBSerieRepository();

/**
 * Crea una respuesta HTTP estándar
 */
function createResponse(statusCode: number, body: ApiResponse<unknown>): APIGatewayProxyResult {
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
 * Valida los datos de una serie
 */
function validarDatosSerie(datos: Partial<DatosSerie>, esRegistro: boolean = false): { valido: boolean; errores: string[] } {
  const errores: string[] = [];

  if (esRegistro) {
    if (!datos.empresaRuc || datos.empresaRuc.trim() === '') {
      errores.push('RUC de empresa es requerido');
    }

    if (!datos.tipoComprobante) {
      errores.push('Tipo de comprobante es requerido');
    } else if (![TipoComprobante.FACTURA, TipoComprobante.BOLETA].includes(datos.tipoComprobante)) {
      errores.push('Tipo de comprobante inválido. Debe ser FACTURA (01) o BOLETA (03)');
    }

    if (!datos.serie || datos.serie.trim() === '') {
      errores.push('Serie es requerida');
    } else {
      // Validar formato de serie
      const serieUpper = datos.serie.toUpperCase();
      if (datos.tipoComprobante === TipoComprobante.FACTURA && !serieUpper.startsWith('F')) {
        errores.push('Serie de factura debe comenzar con F (ej: F001)');
      }
      if (datos.tipoComprobante === TipoComprobante.BOLETA && !serieUpper.startsWith('B')) {
        errores.push('Serie de boleta debe comenzar con B (ej: B001)');
      }
      if (!/^[A-Z]\d{3}$/.test(serieUpper)) {
        errores.push('Serie debe tener formato: letra + 3 dígitos (ej: F001, B001)');
      }
    }

    if (datos.correlativo !== undefined && datos.correlativo < 1) {
      errores.push('Correlativo debe ser mayor o igual a 1');
    }
  }

  return { valido: errores.length === 0, errores };
}

/**
 * Registra una nueva serie
 */
async function registrarSerie(body: string): Promise<APIGatewayProxyResult> {
  try {
    const datos: DatosSerie = JSON.parse(body);

    // Normalizar serie a mayúsculas
    if (datos.serie) {
      datos.serie = datos.serie.toUpperCase();
    }

    const validacion = validarDatosSerie(datos, true);
    if (!validacion.valido) {
      return createResponse(400, {
        success: false,
        error: 'Datos de serie inválidos',
        message: validacion.errores.join(', '),
      });
    }

    const serie = await repository.registrarSerie(datos);

    return createResponse(201, {
      success: true,
      data: serie,
      message: 'Serie registrada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al registrar serie:', error);

    if (error.message.includes('Ya existe')) {
      return createResponse(409, {
        success: false,
        error: error.message,
      });
    }

    return createResponse(500, {
      success: false,
      error: 'Error al registrar serie',
      message: error.message,
    });
  }
}

/**
 * Lista todas las series de una empresa
 */
async function listarSeriesPorEmpresa(empresaRuc: string): Promise<APIGatewayProxyResult> {
  try {
    const series = await repository.listarSeriesPorEmpresa(empresaRuc);

    return createResponse(200, {
      success: true,
      data: {
        series,
        total: series.length,
      },
    });
  } catch (error: any) {
    console.error('Error al listar series:', error);
    return createResponse(500, {
      success: false,
      error: 'Error al listar series',
      message: error.message,
    });
  }
}

/**
 * Obtiene una serie específica
 */
async function obtenerSerie(empresaRuc: string, tipoComprobante: string, serie: string): Promise<APIGatewayProxyResult> {
  try {
    const serieData = await repository.obtenerSerie(empresaRuc, tipoComprobante, serie.toUpperCase());

    if (!serieData) {
      return createResponse(404, {
        success: false,
        error: `Serie ${serie} no encontrada`,
      });
    }

    return createResponse(200, {
      success: true,
      data: serieData,
    });
  } catch (error: any) {
    console.error('Error al obtener serie:', error);
    return createResponse(500, {
      success: false,
      error: 'Error al obtener serie',
      message: error.message,
    });
  }
}

/**
 * Actualiza una serie
 */
async function actualizarSerie(
  empresaRuc: string,
  tipoComprobante: string,
  serie: string,
  body: string
): Promise<APIGatewayProxyResult> {
  try {
    const datos: Partial<DatosSerie> = JSON.parse(body);

    const serieActualizada = await repository.actualizarSerie(empresaRuc, tipoComprobante, serie.toUpperCase(), datos);

    return createResponse(200, {
      success: true,
      data: serieActualizada,
      message: 'Serie actualizada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al actualizar serie:', error);

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
      error: 'Error al actualizar serie',
      message: error.message,
    });
  }
}

/**
 * Elimina una serie (soft delete)
 */
async function eliminarSerie(empresaRuc: string, tipoComprobante: string, serie: string): Promise<APIGatewayProxyResult> {
  try {
    await repository.eliminarSerie(empresaRuc, tipoComprobante, serie.toUpperCase());

    return createResponse(200, {
      success: true,
      message: `Serie ${serie} eliminada exitosamente`,
    });
  } catch (error: any) {
    console.error('Error al eliminar serie:', error);

    if (error.message.includes('no encontrada')) {
      return createResponse(404, {
        success: false,
        error: error.message,
      });
    }

    return createResponse(500, {
      success: false,
      error: 'Error al eliminar serie',
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
    // POST /series - Registrar nueva serie
    if (method === 'POST' && path === '/series') {
      return await registrarSerie(body);
    }

    // GET /series/{empresaRuc} - Listar series de una empresa
    if (method === 'GET' && pathParameters?.empresaRuc && !pathParameters.tipoComprobante) {
      return await listarSeriesPorEmpresa(pathParameters.empresaRuc);
    }

    // GET /series/{empresaRuc}/{tipoComprobante}/{serie} - Obtener serie específica
    if (method === 'GET' && pathParameters?.empresaRuc && pathParameters?.tipoComprobante && pathParameters?.serie) {
      return await obtenerSerie(pathParameters.empresaRuc, pathParameters.tipoComprobante, pathParameters.serie);
    }

    // PUT /series/{empresaRuc}/{tipoComprobante}/{serie} - Actualizar serie
    if (method === 'PUT' && pathParameters?.empresaRuc && pathParameters?.tipoComprobante && pathParameters?.serie) {
      return await actualizarSerie(pathParameters.empresaRuc, pathParameters.tipoComprobante, pathParameters.serie, body);
    }

    // DELETE /series/{empresaRuc}/{tipoComprobante}/{serie} - Eliminar serie
    if (method === 'DELETE' && pathParameters?.empresaRuc && pathParameters?.tipoComprobante && pathParameters?.serie) {
      return await eliminarSerie(pathParameters.empresaRuc, pathParameters.tipoComprobante, pathParameters.serie);
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
