/**
 * Lambda Handler: Gestionar Certificados
 * 
 * Endpoints:
 * - POST /certificados/cargar - Cargar certificado de empresa
 * - GET /certificados/{ruc}/estado - Consultar estado de certificado
 * - GET /certificados/proximos-vencer - Listar certificados próximos a vencer
 * 
 * Requisitos: 5.1, 5.3
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CertificateManager } from '../services/CertificateManager';
import { Certificado } from '../types/empresa';

// Instancia del gestor de certificados
const certificateManager = new CertificateManager();

/**
 * Handler principal para gestión de certificados
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const httpMethod = event.httpMethod;
    const path = event.path;

    // Determinar qué operación ejecutar según el método y path
    if (httpMethod === 'POST' && path.includes('/certificados/cargar')) {
      return await cargarCertificado(event);
    } else if (httpMethod === 'GET' && path.match(/\/certificados\/[^/]+\/estado/)) {
      return await consultarEstadoCertificado(event);
    } else if (httpMethod === 'GET' && path.includes('/certificados/proximos-vencer')) {
      return await listarCertificadosProximosVencer(event);
    } else {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Endpoint no encontrado',
          message: `No se encontró el endpoint: ${httpMethod} ${path}`,
        }),
      };
    }
  } catch (error) {
    console.error('Error en handler gestionar-certificados:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      }),
    };
  }
};

/**
 * Endpoint: POST /certificados/cargar
 * Carga un certificado digital para una empresa
 * Requisito: 5.1
 */
async function cargarCertificado(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Validar que exista body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Solicitud inválida',
          message: 'El cuerpo de la solicitud es requerido',
        }),
      };
    }

    // Parsear body
    const body = JSON.parse(event.body);
    const { empresaRuc, certificadoBase64, password } = body;

    // Validar campos requeridos
    if (!empresaRuc || !certificadoBase64 || !password) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Campos requeridos faltantes',
          message: 'Se requieren los campos: empresaRuc, certificadoBase64, password',
        }),
      };
    }

    // Convertir certificado de base64 a Buffer
    const certificadoBuffer = Buffer.from(certificadoBase64, 'base64');

    // Cargar certificado usando el CertificateManager
    await certificateManager.cargarCertificado(empresaRuc, certificadoBuffer, password);

    // Obtener el certificado cargado para retornar información
    const certificado = await certificateManager.obtenerCertificado(empresaRuc);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Certificado cargado exitosamente',
        data: {
          ruc: certificado.ruc,
          fechaEmision: certificado.fechaEmision,
          fechaVencimiento: certificado.fechaVencimiento,
          emisor: certificado.emisor,
          diasParaVencimiento: calcularDiasHastaFecha(new Date(), certificado.fechaVencimiento),
        },
      }),
    };
  } catch (error) {
    console.error('Error al cargar certificado:', error);
    
    // Determinar código de error apropiado
    const statusCode = error instanceof Error && error.message.includes('RUC') ? 400 : 500;
    
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error al cargar certificado',
        message: error instanceof Error ? error.message : 'Error desconocido',
      }),
    };
  }
}

/**
 * Endpoint: GET /certificados/{ruc}/estado
 * Consulta el estado de un certificado
 * Requisito: 5.3
 */
async function consultarEstadoCertificado(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Extraer RUC del path
    const ruc = event.pathParameters?.ruc;

    if (!ruc) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Parámetro requerido faltante',
          message: 'Se requiere el parámetro: ruc',
        }),
      };
    }

    // Obtener certificado
    const certificado = await certificateManager.obtenerCertificado(ruc);

    // Validar certificado
    const validacion = await certificateManager.validarCertificado(ruc);

    // Verificar si está próximo a vencer
    const proximoVencer = await certificateManager.verificarProximoVencimiento(ruc);

    // Calcular días para vencimiento
    const ahora = new Date();
    const diasParaVencimiento = calcularDiasHastaFecha(ahora, certificado.fechaVencimiento);

    // Determinar estado
    let estado: 'VIGENTE' | 'PROXIMO_VENCER' | 'VENCIDO';
    if (certificado.fechaVencimiento < ahora) {
      estado = 'VENCIDO';
    } else if (proximoVencer) {
      estado = 'PROXIMO_VENCER';
    } else {
      estado = 'VIGENTE';
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Estado del certificado consultado exitosamente',
        data: {
          ruc: certificado.ruc,
          estado,
          valido: validacion.valido,
          fechaEmision: certificado.fechaEmision,
          fechaVencimiento: certificado.fechaVencimiento,
          emisor: certificado.emisor,
          diasParaVencimiento,
          proximoVencer,
          errores: validacion.errores,
        },
      }),
    };
  } catch (error) {
    console.error('Error al consultar estado del certificado:', error);
    
    // Si el certificado no existe, retornar 404
    const statusCode = error instanceof Error && error.message.includes('No existe') ? 404 : 500;
    
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error al consultar estado del certificado',
        message: error instanceof Error ? error.message : 'Error desconocido',
      }),
    };
  }
}

/**
 * Endpoint: GET /certificados/proximos-vencer
 * Lista certificados próximos a vencer (30 días)
 * Requisito: 5.3
 */
async function listarCertificadosProximosVencer(
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Obtener todos los certificados
    const todosCertificados = await certificateManager.listarCertificados();

    // Filtrar certificados próximos a vencer
    const certificadosProximosVencer: Array<{
      ruc: string;
      razonSocial?: string;
      fechaVencimiento: Date;
      diasParaVencimiento: number;
      estado: 'PROXIMO_VENCER' | 'VENCIDO';
    }> = [];

    const ahora = new Date();

    for (const [ruc, certificado] of todosCertificados.entries()) {
      const proximoVencer = await certificateManager.verificarProximoVencimiento(ruc);
      const diasParaVencimiento = calcularDiasHastaFecha(ahora, certificado.fechaVencimiento);
      
      // Incluir certificados próximos a vencer o ya vencidos
      if (proximoVencer || certificado.fechaVencimiento < ahora) {
        certificadosProximosVencer.push({
          ruc: certificado.ruc,
          fechaVencimiento: certificado.fechaVencimiento,
          diasParaVencimiento,
          estado: certificado.fechaVencimiento < ahora ? 'VENCIDO' : 'PROXIMO_VENCER',
        });
      }
    }

    // Ordenar por días para vencimiento (los más urgentes primero)
    certificadosProximosVencer.sort((a, b) => a.diasParaVencimiento - b.diasParaVencimiento);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Certificados próximos a vencer consultados exitosamente',
        data: {
          total: certificadosProximosVencer.length,
          certificados: certificadosProximosVencer,
        },
      }),
    };
  } catch (error) {
    console.error('Error al listar certificados próximos a vencer:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Error al listar certificados próximos a vencer',
        message: error instanceof Error ? error.message : 'Error desconocido',
      }),
    };
  }
}

/**
 * Calcula los días entre dos fechas
 * @private
 */
function calcularDiasHastaFecha(desde: Date, hasta: Date): number {
  const milisegundosPorDia = 1000 * 60 * 60 * 24;
  const diferencia = hasta.getTime() - desde.getTime();
  return Math.ceil(diferencia / milisegundosPorDia);
}
