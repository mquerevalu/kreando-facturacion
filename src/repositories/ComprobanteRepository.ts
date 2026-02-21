/**
 * Implementación del repositorio de comprobantes usando DynamoDB
 * Garantiza aislamiento multi-tenant mediante empresaRuc
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Comprobante, CDR, EstadoComprobante, FiltrosComprobante } from '../types';
import { ComprobanteRepository } from './interfaces';

/**
 * Repositorio de comprobantes con DynamoDB
 * Tabla: comprobantes
 * Clave primaria: empresaRuc (partition key) + numero (sort key)
 * GSI: empresaRuc-estado-index para consultas por estado
 * GSI: empresaRuc-fecha-index para consultas por fecha
 */
export class DynamoDBComprobanteRepository implements ComprobanteRepository {
  private client: DynamoDBClient;
  private tableName: string;
  private contadoresTableName: string;

  constructor(client?: DynamoDBClient, tableName?: string, contadoresTableName?: string) {
    this.client = client || new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.tableName = tableName || process.env.COMPROBANTES_TABLE || 'comprobantes';
    this.contadoresTableName =
      contadoresTableName || process.env.CONTADORES_TABLE || 'comprobantes-contadores';
  }

  /**
   * Guarda un comprobante en el sistema
   * Garantiza aislamiento multi-tenant mediante empresaRuc
   */
  async guardarComprobante(empresaRuc: string, comprobante: Comprobante): Promise<void> {
    // Validar que el comprobante pertenece a la empresa
    if (comprobante.empresaRuc !== empresaRuc) {
      throw new Error('El comprobante no pertenece a la empresa especificada');
    }

    const now = new Date();
    const comprobanteConFechas = {
      ...comprobante,
      fechaCreacion: comprobante.fechaCreacion || now,
      fechaActualizacion: now,
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(this.serializeComprobante(comprobanteConFechas), {
        removeUndefinedValues: true,
      }),
    });

    await this.client.send(command);
  }

  /**
   * Guarda el CDR de un comprobante
   */
  async guardarCDR(empresaRuc: string, numero: string, cdr: CDR): Promise<void> {
    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ empresaRuc, numero }),
      UpdateExpression: 'SET #cdr = :cdr, #fechaActualizacion = :fechaActualizacion',
      ExpressionAttributeNames: {
        '#cdr': 'cdr',
        '#fechaActualizacion': 'fechaActualizacion',
      },
      ExpressionAttributeValues: marshall({
        ':cdr': this.serializeCDR(cdr),
        ':fechaActualizacion': new Date().toISOString(),
      }),
      ConditionExpression: 'attribute_exists(empresaRuc) AND attribute_exists(numero)',
    });

    try {
      await this.client.send(command);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Comprobante ${numero} no encontrado para empresa ${empresaRuc}`);
      }
      throw error;
    }
  }

  /**
   * Obtiene un comprobante por su número
   * Solo retorna comprobantes de la empresa especificada (aislamiento multi-tenant)
   */
  async obtenerComprobante(empresaRuc: string, numero: string): Promise<Comprobante | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ empresaRuc, numero }),
    });

    const result = await this.client.send(command);

    if (!result.Item) {
      return null;
    }

    return this.deserializeComprobante(unmarshall(result.Item));
  }

  /**
   * Obtiene el CDR de un comprobante
   */
  async obtenerCDR(empresaRuc: string, numero: string): Promise<CDR | null> {
    const comprobante = await this.obtenerComprobante(empresaRuc, numero);
    return comprobante?.cdr || null;
  }

  /**
   * Lista comprobantes pendientes de envío de una empresa
   */
  async listarPendientes(empresaRuc: string): Promise<Comprobante[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'empresaRuc-estado-index',
      KeyConditionExpression: '#empresaRuc = :empresaRuc AND #estado = :estado',
      ExpressionAttributeNames: {
        '#empresaRuc': 'empresaRuc',
        '#estado': 'estado',
      },
      ExpressionAttributeValues: marshall({
        ':empresaRuc': empresaRuc,
        ':estado': EstadoComprobante.PENDIENTE,
      }),
    });

    const result = await this.client.send(command);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.deserializeComprobante(unmarshall(item)));
  }

  /**
   * Actualiza el estado de un comprobante
   */
  async actualizarEstado(
    empresaRuc: string,
    numero: string,
    estado: EstadoComprobante
  ): Promise<void> {
    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ empresaRuc, numero }),
      UpdateExpression: 'SET #estado = :estado, #fechaActualizacion = :fechaActualizacion',
      ExpressionAttributeNames: {
        '#estado': 'estado',
        '#fechaActualizacion': 'fechaActualizacion',
      },
      ExpressionAttributeValues: marshall({
        ':estado': estado,
        ':fechaActualizacion': new Date().toISOString(),
      }),
      ConditionExpression: 'attribute_exists(empresaRuc) AND attribute_exists(numero)',
    });

    try {
      await this.client.send(command);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Comprobante ${numero} no encontrado para empresa ${empresaRuc}`);
      }
      throw error;
    }
  }

  /**
   * Lista comprobantes de una empresa con filtros opcionales
   */
  async listarComprobantes(
    empresaRuc: string,
    filtros?: FiltrosComprobante
  ): Promise<Comprobante[]> {
    let command: QueryCommand;

    if (filtros?.estado) {
      // Usar GSI por estado
      command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'empresaRuc-estado-index',
        KeyConditionExpression: '#empresaRuc = :empresaRuc AND #estado = :estado',
        ExpressionAttributeNames: {
          '#empresaRuc': 'empresaRuc',
          '#estado': 'estado',
        },
        ExpressionAttributeValues: marshall({
          ':empresaRuc': empresaRuc,
          ':estado': filtros.estado,
        }),
      });
    } else if (filtros?.fechaInicio || filtros?.fechaFin) {
      // Usar GSI por fecha
      const keyCondition = '#empresaRuc = :empresaRuc';
      const expressionAttributeNames: Record<string, string> = {
        '#empresaRuc': 'empresaRuc',
      };
      const expressionAttributeValues: Record<string, any> = {
        ':empresaRuc': empresaRuc,
      };

      if (filtros.fechaInicio && filtros.fechaFin) {
        expressionAttributeNames['#fecha'] = 'fecha';
        expressionAttributeValues[':fechaInicio'] = filtros.fechaInicio.toISOString();
        expressionAttributeValues[':fechaFin'] = filtros.fechaFin.toISOString();
      }

      command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'empresaRuc-fecha-index',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
      });
    } else {
      // Query simple por empresaRuc
      command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#empresaRuc = :empresaRuc',
        ExpressionAttributeNames: {
          '#empresaRuc': 'empresaRuc',
        },
        ExpressionAttributeValues: marshall({
          ':empresaRuc': empresaRuc,
        }),
      });
    }

    const result = await this.client.send(command);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    let comprobantes = result.Items.map((item) => this.deserializeComprobante(unmarshall(item)));

    // Aplicar filtros adicionales en memoria
    if (filtros?.tipo) {
      comprobantes = comprobantes.filter((c) => c.tipo === filtros.tipo);
    }

    if (filtros?.receptor) {
      comprobantes = comprobantes.filter((c) =>
        c.receptor.numeroDocumento.includes(filtros.receptor!)
      );
    }

    return comprobantes;
  }

  /**
   * Obtiene el siguiente número correlativo para un tipo de comprobante
   * Usa una tabla separada para contadores atómicos
   */
  async obtenerSiguienteNumero(
    empresaRuc: string,
    tipo: string,
    serie: string
  ): Promise<number> {
    const contadorKey = `${empresaRuc}#${tipo}#${serie}`;

    const command = new UpdateItemCommand({
      TableName: this.contadoresTableName,
      Key: marshall({ contadorKey }),
      UpdateExpression: 'SET #contador = if_not_exists(#contador, :inicio) + :incremento',
      ExpressionAttributeNames: {
        '#contador': 'contador',
      },
      ExpressionAttributeValues: marshall({
        ':inicio': 0,
        ':incremento': 1,
      }),
      ReturnValues: 'UPDATED_NEW',
    });

    const result = await this.client.send(command);

    if (!result.Attributes) {
      throw new Error('Error al obtener siguiente número correlativo');
    }

    const unmarshalled = unmarshall(result.Attributes);
    return unmarshalled.contador as number;
  }

  /**
   * Serializa un comprobante para almacenar en DynamoDB
   */
  private serializeComprobante(comprobante: Comprobante): any {
    const serialized: any = {
      ...comprobante,
      fecha: comprobante.fecha.toISOString(),
    };

    if (comprobante.fechaCreacion) {
      serialized.fechaCreacion = comprobante.fechaCreacion.toISOString();
    }

    if (comprobante.fechaActualizacion) {
      serialized.fechaActualizacion = comprobante.fechaActualizacion.toISOString();
    }

    if (comprobante.cdr) {
      serialized.cdr = this.serializeCDR(comprobante.cdr);
    }

    return serialized;
  }

  /**
   * Serializa un CDR para almacenar en DynamoDB
   */
  private serializeCDR(cdr: CDR): any {
    return {
      ...cdr,
      fechaRecepcion: cdr.fechaRecepcion.toISOString(),
    };
  }

  /**
   * Deserializa un comprobante desde DynamoDB
   */
  private deserializeComprobante(item: any): Comprobante {
    const comprobante: Comprobante = {
      ...item,
      fecha: new Date(item.fecha),
    };

    if (item.fechaCreacion) {
      comprobante.fechaCreacion = new Date(item.fechaCreacion);
    }

    if (item.fechaActualizacion) {
      comprobante.fechaActualizacion = new Date(item.fechaActualizacion);
    }

    if (item.cdr) {
      comprobante.cdr = this.deserializeCDR(item.cdr);
    }

    return comprobante;
  }

  /**
   * Deserializa un CDR desde DynamoDB
   */
  private deserializeCDR(item: any): CDR {
    return {
      ...item,
      fechaRecepcion: new Date(item.fechaRecepcion),
    };
  }
}
