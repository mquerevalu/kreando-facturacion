/**
 * Lambda Handler: listar-comprobantes
 * 
 * Responsabilidad: Listar y buscar comprobantes con filtros
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBComprobanteRepository } from '../repositories/ComprobanteRepository';
import { FiltrosComprobante, ApiResponse, Comprobante } from '../types';

const comprobanteRepository = new DynamoDBComprobanteRepository();

interface ListarComprobantesResponse {
  comprobantes: Array<{
    numero: string;
    tipo: string;
    empresaRuc: string;
    fecha: string;
    receptor: {
      tipoDocumento: string;
      numeroDocumento: string;
      nombre?: string;
      razonSocial?: string;
    };
    subtotal: number;
    igv: number;
    total: number;
    moneda: string;
    estado: string;
    cdr?: {
      codigo: string;
      mensaje: string;
      fechaRecepcion: string;
    };
  }>;
  total: number;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Obtener parámetros de query
    const queryParams = event.queryStringParameters || {};
    
    const empresaRuc = queryParams.empresaRuc;
    
    if (!empresaRuc) {
      return createErrorResponse(400, 'El parámetro empresaRuc es requerido');
    }

    // Construir filtros
    const filtros: FiltrosComprobante = {};

    if (queryParams.tipo) {
      filtros.tipo = queryParams.tipo as any;
    }

    if (queryParams.estado) {
      filtros.estado = queryParams.estado as any;
    }

    if (queryParams.receptor) {
      filtros.receptor = queryParams.receptor;
    }

    if (queryParams.fechaInicio) {
      filtros.fechaInicio = new Date(queryParams.fechaInicio);
    }

    if (queryParams.fechaFin) {
      filtros.fechaFin = new Date(queryParams.fechaFin);
    }

    console.log(`Listando comprobantes - Empresa: ${empresaRuc}, Filtros:`, filtros);

    // Obtener comprobantes
    const comprobantes = await comprobanteRepository.listarComprobantes(empresaRuc, filtros);

    // Aplicar filtros adicionales en memoria si es necesario
    let comprobantesFiltrados = comprobantes;

    // Filtrar por nombre/razón social si se proporciona
    if (queryParams.nombre) {
      const nombreBusqueda = queryParams.nombre.toLowerCase();
      comprobantesFiltrados = comprobantesFiltrados.filter((c) => {
        const nombre = c.receptor.nombre?.toLowerCase() || '';
        return nombre.includes(nombreBusqueda);
      });
    }

    // Formatear respuesta
    const comprobantesFormateados = comprobantesFiltrados.map((c) => ({
      numero: c.numero,
      tipo: c.tipo,
      empresaRuc: c.empresaRuc,
      fecha: c.fecha.toISOString(),
      receptor: {
        tipoDocumento: c.receptor.tipoDocumento,
        numeroDocumento: c.receptor.numeroDocumento,
        nombre: c.receptor.nombre,
      },
      subtotal: c.subtotal,
      igv: c.igv,
      total: c.total,
      moneda: c.moneda,
      estado: c.estado,
      cdr: c.cdr ? {
        codigo: c.cdr.codigo,
        mensaje: c.cdr.mensaje,
        fechaRecepcion: c.cdr.fechaRecepcion.toISOString(),
      } : undefined,
    }));

    const response: ApiResponse<ListarComprobantesResponse> = {
      success: true,
      data: {
        comprobantes: comprobantesFormateados,
        total: comprobantesFormateados.length,
      },
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error en listar-comprobantes:', error);

    const errorMessage = error instanceof Error ? error.message : 'Error interno al listar comprobantes';

    return createErrorResponse(500, errorMessage);
  }
};

function createErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  const response: ApiResponse<null> = {
    success: false,
    data: null,
    message,
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(response),
  };
}
