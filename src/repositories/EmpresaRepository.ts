/**
 * Implementación del repositorio de empresas usando DynamoDB
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Empresa, DatosEmpresa } from '../types';
import { EmpresaRepository } from './interfaces';

/**
 * Repositorio de empresas con DynamoDB
 * Tabla: empresas
 * Clave primaria: ruc (string)
 */
export class DynamoDBEmpresaRepository implements EmpresaRepository {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(client?: DynamoDBClient, tableName?: string) {
    this.client = client || new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.tableName = tableName || process.env.EMPRESAS_TABLE || 'empresas';
  }

  /**
   * Registra una nueva empresa en el sistema
   */
  async registrarEmpresa(datos: DatosEmpresa): Promise<Empresa> {
    const empresa: Empresa = {
      ...datos,
      activo: datos.activo !== undefined ? datos.activo : true,
      fechaRegistro: new Date(),
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(this.serializeEmpresa(empresa), { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(ruc)', // Evitar duplicados
    });

    try {
      await this.client.send(command);
      return empresa;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Ya existe una empresa con RUC ${datos.ruc}`);
      }
      throw error;
    }
  }

  /**
   * Obtiene una empresa por su RUC
   */
  async obtenerEmpresa(ruc: string): Promise<Empresa | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ ruc }),
    });

    const result = await this.client.send(command);

    if (!result.Item) {
      return null;
    }

    return this.deserializeEmpresa(unmarshall(result.Item));
  }

  /**
   * Actualiza los datos de una empresa
   */
  async actualizarEmpresa(ruc: string, datos: Partial<DatosEmpresa>): Promise<Empresa> {
    // Log para depuración
    console.log('actualizarEmpresa - datos recibidos:', JSON.stringify(datos, null, 2));
    
    // Construir expresión de actualización dinámicamente
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (datos.razonSocial !== undefined) {
      updateExpressions.push('#razonSocial = :razonSocial');
      expressionAttributeNames['#razonSocial'] = 'razonSocial';
      expressionAttributeValues[':razonSocial'] = datos.razonSocial;
    }

    if (datos.nombreComercial !== undefined) {
      updateExpressions.push('#nombreComercial = :nombreComercial');
      expressionAttributeNames['#nombreComercial'] = 'nombreComercial';
      expressionAttributeValues[':nombreComercial'] = datos.nombreComercial;
    }

    if (datos.direccion !== undefined) {
      updateExpressions.push('#direccion = :direccion');
      expressionAttributeNames['#direccion'] = 'direccion';
      expressionAttributeValues[':direccion'] = datos.direccion;
    }

    if (datos.logoUrl !== undefined) {
      updateExpressions.push('#logoUrl = :logoUrl');
      expressionAttributeNames['#logoUrl'] = 'logoUrl';
      expressionAttributeValues[':logoUrl'] = datos.logoUrl;
    }

    if (datos.credencialesSunat !== undefined) {
      updateExpressions.push('#credencialesSunat = :credencialesSunat');
      expressionAttributeNames['#credencialesSunat'] = 'credencialesSunat';
      expressionAttributeValues[':credencialesSunat'] = datos.credencialesSunat;
    }

    if (datos.activo !== undefined) {
      updateExpressions.push('#activo = :activo');
      expressionAttributeNames['#activo'] = 'activo';
      expressionAttributeValues[':activo'] = datos.activo;
    }

    if (updateExpressions.length === 0) {
      console.log('actualizarEmpresa - No hay expresiones de actualización');
      console.log('actualizarEmpresa - datos:', datos);
      console.log('actualizarEmpresa - keys:', Object.keys(datos));
      throw new Error('No hay datos para actualizar');
    }

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ ruc }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ConditionExpression: 'attribute_exists(ruc)', // Verificar que existe
      ReturnValues: 'ALL_NEW',
    });

    try {
      const result = await this.client.send(command);
      if (!result.Attributes) {
        throw new Error(`Empresa con RUC ${ruc} no encontrada`);
      }
      return this.deserializeEmpresa(unmarshall(result.Attributes));
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Empresa con RUC ${ruc} no encontrada`);
      }
      throw error;
    }
  }

  /**
   * Lista todas las empresas del sistema
   */
  async listarEmpresas(): Promise<Empresa[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: '#activo = :activo',
      ExpressionAttributeNames: {
        '#activo': 'activo',
      },
      ExpressionAttributeValues: marshall({
        ':activo': true,
      }),
    });

    const result = await this.client.send(command);

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.deserializeEmpresa(unmarshall(item)));
  }

  /**
   * Elimina una empresa del sistema (soft delete)
   */
  async eliminarEmpresa(ruc: string): Promise<void> {
    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ ruc }),
      UpdateExpression: 'SET #activo = :activo',
      ExpressionAttributeNames: {
        '#activo': 'activo',
      },
      ExpressionAttributeValues: marshall({
        ':activo': false,
      }),
      ConditionExpression: 'attribute_exists(ruc)',
    });

    try {
      await this.client.send(command);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Empresa con RUC ${ruc} no encontrada`);
      }
      throw error;
    }
  }

  /**
   * Serializa una empresa para almacenar en DynamoDB
   * Convierte Date a ISO string y Buffer a base64
   */
  private serializeEmpresa(empresa: Empresa): any {
    const serialized: any = {
      ...empresa,
      fechaRegistro: empresa.fechaRegistro.toISOString(),
    };

    if (empresa.certificado) {
      serialized.certificado = {
        ...empresa.certificado,
        archivo: empresa.certificado.archivo.toString('base64'),
        fechaEmision: empresa.certificado.fechaEmision.toISOString(),
        fechaVencimiento: empresa.certificado.fechaVencimiento.toISOString(),
      };
    }

    return serialized;
  }

  /**
   * Deserializa una empresa desde DynamoDB
   * Convierte ISO string a Date y base64 a Buffer
   */
  private deserializeEmpresa(item: any): Empresa {
    const empresa: Empresa = {
      ...item,
      fechaRegistro: new Date(item.fechaRegistro),
    };

    if (item.certificado) {
      empresa.certificado = {
        ...item.certificado,
        archivo: Buffer.from(item.certificado.archivo, 'base64'),
        fechaEmision: new Date(item.certificado.fechaEmision),
        fechaVencimiento: new Date(item.certificado.fechaVencimiento),
      };
    }

    return empresa;
  }
}
