# Repositorios DynamoDB

Este directorio contiene las implementaciones de los repositorios para persistencia de datos usando DynamoDB.

## Estructura

- **interfaces.ts**: Define las interfaces de los repositorios
- **EmpresaRepository.ts**: Repositorio para gestión de empresas
- **ComprobanteRepository.ts**: Repositorio para gestión de comprobantes con aislamiento multi-tenant

## Tablas DynamoDB

### Tabla: empresas

**Clave primaria**: `ruc` (String)

**Propósito**: Almacenar información de empresas registradas en el sistema.

**Atributos principales**:
- `ruc`: RUC de la empresa (PK)
- `razonSocial`: Razón social
- `nombreComercial`: Nombre comercial
- `direccion`: Dirección completa
- `credencialesSunat`: Credenciales SOL
- `certificado`: Certificado digital (opcional)
- `activo`: Estado de la empresa
- `fechaRegistro`: Fecha de registro

### Tabla: comprobantes

**Clave primaria**: `empresaRuc` (String) + `numero` (String)

**Propósito**: Almacenar comprobantes electrónicos con aislamiento multi-tenant.

**Índices secundarios globales (GSI)**:
1. **empresaRuc-estado-index**: Para consultas por estado
   - PK: `empresaRuc`
   - SK: `estado`
   
2. **empresaRuc-fecha-index**: Para consultas por fecha
   - PK: `empresaRuc`
   - SK: `fecha`

**Atributos principales**:
- `empresaRuc`: RUC de la empresa emisora (PK)
- `numero`: Número del comprobante (SK)
- `tipo`: Tipo de comprobante (BOLETA, FACTURA)
- `fecha`: Fecha de emisión
- `emisor`: Datos del emisor
- `receptor`: Datos del receptor
- `items`: Items del comprobante
- `subtotal`, `igv`, `total`: Montos
- `moneda`: Moneda (PEN, USD)
- `estado`: Estado del comprobante
- `cdr`: Constancia de Recepción (opcional)
- `xmlOriginal`, `xmlFirmado`: XMLs del comprobante

### Tabla: comprobantes-contadores

**Clave primaria**: `contadorKey` (String)

**Propósito**: Generar números correlativos atómicos para comprobantes.

**Formato de clave**: `{empresaRuc}#{tipo}#{serie}`

Ejemplo: `20123456789#03#B001`

**Atributos**:
- `contadorKey`: Clave compuesta (PK)
- `contador`: Número actual del contador

## Aislamiento Multi-Tenant

Todos los métodos del `ComprobanteRepository` garantizan aislamiento multi-tenant:

1. **Validación en escritura**: Al guardar un comprobante, se valida que `empresaRuc` coincida con el parámetro
2. **Filtrado en lectura**: Todas las consultas filtran por `empresaRuc` usando la clave primaria
3. **Índices por empresa**: Los GSI incluyen `empresaRuc` como partition key

Esto garantiza que:
- Una empresa solo puede acceder a sus propios comprobantes
- No hay posibilidad de acceso cruzado entre empresas
- Las consultas son eficientes usando índices

## Uso

### EmpresaRepository

```typescript
import { DynamoDBEmpresaRepository } from './repositories';

const repository = new DynamoDBEmpresaRepository();

// Registrar empresa
const empresa = await repository.registrarEmpresa({
  ruc: '20123456789',
  razonSocial: 'Mi Empresa S.A.C.',
  nombreComercial: 'Mi Empresa',
  direccion: { /* ... */ },
  credencialesSunat: { /* ... */ },
});

// Obtener empresa
const empresa = await repository.obtenerEmpresa('20123456789');

// Listar empresas activas
const empresas = await repository.listarEmpresas();
```

### ComprobanteRepository

```typescript
import { DynamoDBComprobanteRepository } from './repositories';

const repository = new DynamoDBComprobanteRepository();

// Guardar comprobante (con validación multi-tenant)
await repository.guardarComprobante('20123456789', comprobante);

// Obtener comprobante (solo de la empresa especificada)
const comprobante = await repository.obtenerComprobante('20123456789', 'B001-00000001');

// Listar pendientes de una empresa
const pendientes = await repository.listarPendientes('20123456789');

// Obtener siguiente número correlativo
const siguiente = await repository.obtenerSiguienteNumero('20123456789', '03', 'B001');
```

## Configuración

Las tablas se configuran mediante variables de entorno:

```bash
EMPRESAS_TABLE=empresas
COMPROBANTES_TABLE=comprobantes
CONTADORES_TABLE=comprobantes-contadores
AWS_REGION=us-east-1
```

## Desarrollo Local

Para desarrollo local con DynamoDB Local:

```bash
# Instalar DynamoDB Local
npm install -g dynamodb-local

# Iniciar DynamoDB Local
dynamodb-local

# Crear tablas
DYNAMODB_ENDPOINT=http://localhost:8000 npm run create-tables
```

## Pruebas

Las pruebas unitarias usan mocks de AWS SDK:

```bash
npm test -- --testPathPattern="repositories"
```

## Optimización de Costos

- **Billing Mode**: PAY_PER_REQUEST (on-demand) para minimizar costos
- **GSI**: Solo los índices necesarios para consultas frecuentes
- **Proyección**: ALL en GSI para evitar consultas adicionales
- **Sin provisioned capacity**: No hay costos por capacidad no utilizada
