/**
 * Script para crear tablas DynamoDB
 * Útil para desarrollo local con DynamoDB Local
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  KeyType,
  ScalarAttributeType,
  ProjectionType,
} from '@aws-sdk/client-dynamodb';
import { ALL_TABLES_CONFIG, DynamoDBTableConfig } from '../src/config/dynamodb-tables';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined, // Para DynamoDB Local
});

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable(config: DynamoDBTableConfig): Promise<void> {
  const exists = await tableExists(config.tableName);

  if (exists) {
    console.log(`✓ Tabla ${config.tableName} ya existe`);
    return;
  }

  console.log(`Creando tabla ${config.tableName}...`);

  const attributeDefinitions: any[] = [
    {
      AttributeName: config.partitionKey,
      AttributeType: ScalarAttributeType.S,
    },
  ];

  const keySchema: any[] = [
    {
      AttributeName: config.partitionKey,
      KeyType: KeyType.HASH,
    },
  ];

  // Agregar sort key si existe
  if (config.sortKey) {
    attributeDefinitions.push({
      AttributeName: config.sortKey,
      AttributeType: ScalarAttributeType.S,
    });
    keySchema.push({
      AttributeName: config.sortKey,
      KeyType: KeyType.RANGE,
    });
  }

  // Agregar atributos para GSI
  const gsiAttributeNames = new Set<string>();
  if (config.globalSecondaryIndexes) {
    for (const gsi of config.globalSecondaryIndexes) {
      if (!gsiAttributeNames.has(gsi.partitionKey)) {
        attributeDefinitions.push({
          AttributeName: gsi.partitionKey,
          AttributeType: ScalarAttributeType.S,
        });
        gsiAttributeNames.add(gsi.partitionKey);
      }
      if (gsi.sortKey && !gsiAttributeNames.has(gsi.sortKey)) {
        attributeDefinitions.push({
          AttributeName: gsi.sortKey,
          AttributeType: ScalarAttributeType.S,
        });
        gsiAttributeNames.add(gsi.sortKey);
      }
    }
  }

  const command = new CreateTableCommand({
    TableName: config.tableName,
    AttributeDefinitions: attributeDefinitions,
    KeySchema: keySchema,
    BillingMode: config.billingMode,
    GlobalSecondaryIndexes: config.globalSecondaryIndexes?.map((gsi) => ({
      IndexName: gsi.indexName,
      KeySchema: [
        {
          AttributeName: gsi.partitionKey,
          KeyType: KeyType.HASH,
        },
        ...(gsi.sortKey
          ? [
              {
                AttributeName: gsi.sortKey,
                KeyType: KeyType.RANGE,
              },
            ]
          : []),
      ],
      Projection: {
        ProjectionType: gsi.projectionType as ProjectionType,
        ...(gsi.projectedAttributes ? { NonKeyAttributes: gsi.projectedAttributes } : {}),
      },
    })),
  });

  await client.send(command);
  console.log(`✓ Tabla ${config.tableName} creada exitosamente`);
}

async function main() {
  console.log('Creando tablas DynamoDB...\n');

  for (const config of ALL_TABLES_CONFIG) {
    try {
      await createTable(config);
    } catch (error: any) {
      console.error(`✗ Error creando tabla ${config.tableName}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n✓ Todas las tablas fueron creadas exitosamente');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
