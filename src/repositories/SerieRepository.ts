/**
 * Repositorio para gestión de series de comprobantes
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Serie, DatosSerie } from '../types';

/**
 * Repositorio de series con DynamoDB
 * Tabla: series
 * Clave primaria: empresaRuc (HASH) + serieKey (RANGE)
 * serieKey formato: {tipoComprobante}#{serie} (ej: FACTURA#F001)
 */
export class DynamoDBSerieRepository {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(client?: DynamoDBClient, tableName?: string) {
    this.client = client || new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-2' });
    this.tableName = tableName || process.env.SERIES_TABLE || 'series';
  }

  /**
   * Genera la clave de serie
   */
  private generarSerieKey(tipoComprobante: string, serie: string): string {
    return `${tipoComprobante}#${serie}`;
  }

  /**
   * Registra una nueva serie
   */
  async registrarSerie(datos: DatosSerie): Promise<Serie> {
    const serie: Serie = {
      empresaRuc: datos.empresaRuc,
      tipoComprobante: datos.tipoComprobante,
      serie: datos.serie,
      correlativo: datos.correlativo || 1,
      activo: datos.activo !== undefined ? datos.activo : true,
      fechaCreacion: new Date(),
    };

    const serieKey = this.generarSerieKey(datos.tipoComprobante, datos.serie);

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(
        {
          ...this.serializeSerie(serie),
          serieKey,
        },
        { removeUndefinedValues: true }
      ),
      ConditionExpression: 'attribute_not_exists(empresaRuc) AND attribute_not_exists(serieKey)',
    });

    try {
      await this.client.send(command);
      return serie;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(
          `Ya existe la serie ${datos.serie} para ${datos.tipoComprobante} en la empresa ${datos.empresaRuc}`
        );
      }
      throw error;
    }
  }

  /**
   * Obtiene una serie específica
   */
  async obtenerSerie(empresaRuc: string, tipoComprobante: string, serie: string): Promise<Serie | null> {
    const serieKey = this.generarSerieKey(tipoComprobante, serie);

    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ empresaRuc, serieKey }),
    });

    const result = await this.client.send(command);

    if (!result.Item) {
      return null;
    }

    return this.deserializeSerie(unmarshall(result.Item));
  }

  /**
   * Lista todas las series de una empresa
   */
  async listarSeriesPorEmpresa(empresaRuc: string): Promise<Serie[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'empresaRuc = :empresaRuc',
      FilterExpression: 'activo = :activo',
      ExpressionAttributeValues: marshall({
        ':empresaRuc': empresaRuc,
        ':activo': true,
      }),
    });

    const result = await this.client.send(command);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.deserializeSerie(unmarshall(item)));
  }

  /**
   * Actualiza una serie
   */
  async actualizarSerie(
    empresaRuc: string,
    tipoComprobante: string,
    serie: string,
    datos: Partial<DatosSerie>
  ): Promise<Serie> {
    const serieKey = this.generarSerieKey(tipoComprobante, serie);

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (datos.correlativo !== undefined) {
      updateExpressions.push('#correlativo = :correlativo');
      expressionAttributeNames['#correlativo'] = 'correlativo';
      expressionAttributeValues[':correlativo'] = datos.correlativo;
    }

    if (datos.activo !== undefined) {
      updateExpressions.push('#activo = :activo');
      expressionAttributeNames['#activo'] = 'activo';
      expressionAttributeValues[':activo'] = datos.activo;
    }

    // Siempre actualizar fecha de actualización
    updateExpressions.push('#fechaActualizacion = :fechaActualizacion');
    expressionAttributeNames['#fechaActualizacion'] = 'fechaActualizacion';
    expressionAttributeValues[':fechaActualizacion'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      // Solo fechaActualizacion
      throw new Error('No hay datos para actualizar');
    }

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ empresaRuc, serieKey }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ConditionExpression: 'attribute_exists(empresaRuc) AND attribute_exists(serieKey)',
      ReturnValues: 'ALL_NEW',
    });

    try {
      const result = await this.client.send(command);
      if (!result.Attributes) {
        throw new Error(`Serie ${serie} no encontrada`);
      }
      return this.deserializeSerie(unmarshall(result.Attributes));
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Serie ${serie} no encontrada`);
      }
      throw error;
    }
  }

  /**
   * Elimina una serie (soft delete)
   */
  async eliminarSerie(empresaRuc: string, tipoComprobante: string, serie: string): Promise<void> {
    const serieKey = this.generarSerieKey(tipoComprobante, serie);

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ empresaRuc, serieKey }),
      UpdateExpression: 'SET #activo = :activo, #fechaActualizacion = :fechaActualizacion',
      ExpressionAttributeNames: {
        '#activo': 'activo',
        '#fechaActualizacion': 'fechaActualizacion',
      },
      ExpressionAttributeValues: marshall({
        ':activo': false,
        ':fechaActualizacion': new Date().toISOString(),
      }),
      ConditionExpression: 'attribute_exists(empresaRuc) AND attribute_exists(serieKey)',
    });

    try {
      await this.client.send(command);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Serie ${serie} no encontrada`);
      }
      throw error;
    }
  }

  /**
   * Serializa una serie para almacenar en DynamoDB
   */
  private serializeSerie(serie: Serie): any {
    return {
      ...serie,
      fechaCreacion: serie.fechaCreacion.toISOString(),
      fechaActualizacion: serie.fechaActualizacion?.toISOString(),
    };
  }

  /**
   * Deserializa una serie desde DynamoDB
   */
  private deserializeSerie(item: any): Serie {
    return {
      ...item,
      fechaCreacion: new Date(item.fechaCreacion),
      fechaActualizacion: item.fechaActualizacion ? new Date(item.fechaActualizacion) : undefined,
    };
  }
}
