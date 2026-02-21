/**
 * Configuración de tablas DynamoDB para el sistema
 * Define la estructura de tablas, índices y configuración
 */

export interface DynamoDBTableConfig {
  tableName: string;
  partitionKey: string;
  sortKey?: string;
  globalSecondaryIndexes?: GlobalSecondaryIndex[];
  billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
}

export interface GlobalSecondaryIndex {
  indexName: string;
  partitionKey: string;
  sortKey?: string;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  projectedAttributes?: string[];
}

/**
 * Configuración de la tabla de empresas
 */
export const EMPRESAS_TABLE_CONFIG: DynamoDBTableConfig = {
  tableName: process.env.EMPRESAS_TABLE || 'empresas',
  partitionKey: 'ruc',
  billingMode: 'PAY_PER_REQUEST', // On-demand para minimizar costos
};

/**
 * Configuración de la tabla de comprobantes
 * Incluye GSI para consultas eficientes por estado y fecha
 */
export const COMPROBANTES_TABLE_CONFIG: DynamoDBTableConfig = {
  tableName: process.env.COMPROBANTES_TABLE || 'comprobantes',
  partitionKey: 'empresaRuc',
  sortKey: 'numero',
  globalSecondaryIndexes: [
    {
      indexName: 'empresaRuc-estado-index',
      partitionKey: 'empresaRuc',
      sortKey: 'estado',
      projectionType: 'ALL',
    },
    {
      indexName: 'empresaRuc-fecha-index',
      partitionKey: 'empresaRuc',
      sortKey: 'fecha',
      projectionType: 'ALL',
    },
  ],
  billingMode: 'PAY_PER_REQUEST',
};

/**
 * Configuración de la tabla de contadores
 * Usada para generar números correlativos atómicos
 */
export const CONTADORES_TABLE_CONFIG: DynamoDBTableConfig = {
  tableName: process.env.CONTADORES_TABLE || 'comprobantes-contadores',
  partitionKey: 'contadorKey', // Formato: empresaRuc#tipo#serie
  billingMode: 'PAY_PER_REQUEST',
};

/**
 * Todas las configuraciones de tablas
 */
export const ALL_TABLES_CONFIG = [
  EMPRESAS_TABLE_CONFIG,
  COMPROBANTES_TABLE_CONFIG,
  CONTADORES_TABLE_CONFIG,
];
