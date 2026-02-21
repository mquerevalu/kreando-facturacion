# Sistema de Facturación Electrónica SUNAT

Sistema multi-tenant de facturación electrónica para SUNAT (Perú) implementado con arquitectura serverless en AWS Lambda usando Node.js/TypeScript.

## Características

- ✅ Generación de comprobantes electrónicos (boletas y facturas) en formato UBL 2.1
- ✅ Firma digital de documentos XML
- ✅ Envío a servicios web SOAP de SUNAT
- ✅ Gestión de certificados digitales
- ✅ Multi-tenant (múltiples empresas)
- ✅ Manejo de errores y reintentos automáticos
- ✅ Generación de PDF con código QR
- ✅ Arquitectura serverless (AWS Lambda)

## Requisitos Previos

- Node.js 20.x o superior
- npm 10.x o superior
- Cuenta de AWS (para despliegue)
- Serverless Framework (instalado globalmente)

## Instalación

```bash
# Instalar dependencias
npm install

# Instalar Serverless Framework globalmente (si no lo tienes)
npm install -g serverless
```

## Desarrollo Local

El proyecto usa `serverless-offline` para desarrollo local sin necesidad de desplegar a AWS:

```bash
# Iniciar servidor local
npm run dev

# El servidor estará disponible en http://localhost:3000
```

## Scripts Disponibles

### Desarrollo
- `npm run dev` - Inicia servidor local con serverless-offline
- `npm run build` - Compila TypeScript a JavaScript
- `npm run lint` - Ejecuta ESLint
- `npm run lint:fix` - Ejecuta ESLint y corrige errores automáticamente
- `npm run format` - Formatea código con Prettier
- `npm run format:check` - Verifica formato del código

### Testing
- `npm test` - Ejecuta todas las pruebas
- `npm run test:watch` - Ejecuta pruebas en modo watch
- `npm run test:coverage` - Ejecuta pruebas con reporte de cobertura

### Despliegue
- `npm run deploy:dev` - Despliega a ambiente de desarrollo
- `npm run deploy:prod` - Despliega a ambiente de producción
- `npm run remove:dev` - Elimina stack de desarrollo
- `npm run remove:prod` - Elimina stack de producción

## Estructura del Proyecto

```
sunat-facturacion/
├── src/
│   ├── handlers/          # Funciones Lambda
│   │   ├── empresas.ts
│   │   ├── generar-comprobante.ts
│   │   ├── firmar-comprobante.ts
│   │   ├── enviar-sunat.ts
│   │   ├── consultar-estado.ts
│   │   ├── generar-pdf.ts
│   │   ├── gestionar-certificados.ts
│   │   └── procesar-reintentos.ts
│   ├── services/          # Lógica de negocio
│   ├── repositories/      # Acceso a datos (DynamoDB, S3)
│   ├── validators/        # Validaciones
│   ├── types/            # Tipos TypeScript
│   ├── utils/            # Utilidades
│   └── __tests__/        # Pruebas
├── serverless.yml        # Configuración de Serverless Framework
├── tsconfig.json         # Configuración de TypeScript
├── jest.config.js        # Configuración de Jest
├── .eslintrc.json        # Configuración de ESLint
└── .prettierrc.json      # Configuración de Prettier
```

## Endpoints API

### Empresas
- `POST /empresas` - Registrar nueva empresa
- `GET /empresas` - Listar empresas
- `GET /empresas/{ruc}` - Obtener empresa por RUC
- `PUT /empresas/{ruc}` - Actualizar empresa

### Comprobantes
- `POST /comprobantes/generar` - Generar comprobante
- `POST /comprobantes/{numero}/firmar` - Firmar comprobante
- `POST /comprobantes/{numero}/enviar` - Enviar a SUNAT
- `GET /comprobantes/{numero}/estado` - Consultar estado
- `GET /comprobantes/{numero}/pdf` - Descargar PDF

### Certificados
- `POST /certificados` - Cargar certificado digital
- `GET /certificados/{ruc}` - Consultar certificado

## Infraestructura AWS

El sistema utiliza los siguientes servicios de AWS:

- **Lambda**: Funciones serverless para toda la lógica
- **API Gateway**: Exposición de endpoints REST
- **DynamoDB**: Base de datos NoSQL (tablas: empresas, comprobantes)
- **S3**: Almacenamiento de XMLs, PDFs y certificados
- **Secrets Manager**: Credenciales SUNAT y contraseñas de certificados
- **SQS**: Cola para reintentos de envíos fallidos
- **CloudWatch**: Logs y monitoreo

## Configuración

### Variables de Entorno

Las variables de entorno se configuran en `serverless.yml`:

- `STAGE`: Ambiente (dev, prod)
- `DYNAMODB_TABLE_EMPRESAS`: Tabla de empresas
- `DYNAMODB_TABLE_COMPROBANTES`: Tabla de comprobantes
- `S3_BUCKET`: Bucket para archivos
- `SQS_QUEUE_URL`: URL de cola SQS
- `SUNAT_ENDPOINT_PRODUCCION`: Endpoint de producción SUNAT
- `SUNAT_ENDPOINT_HOMOLOGACION`: Endpoint de homologación SUNAT

## Testing

El proyecto incluye dos tipos de pruebas:

1. **Pruebas Unitarias**: Casos específicos y ejemplos concretos
2. **Pruebas Basadas en Propiedades**: Verificación de propiedades universales usando `fast-check`

```bash
# Ejecutar todas las pruebas
npm test

# Ejecutar con cobertura (mínimo 80%)
npm run test:coverage
```

## Despliegue a AWS

### Primera vez

1. Configurar credenciales de AWS:
```bash
aws configure
```

2. Desplegar a desarrollo:
```bash
npm run deploy:dev
```

3. Desplegar a producción:
```bash
npm run deploy:prod
```

### Actualizaciones

Simplemente ejecuta el comando de despliegue correspondiente:
```bash
npm run deploy:dev  # o deploy:prod
```

## Integración con SUNAT

### Ambiente de Homologación

Para pruebas, usa el endpoint de homologación configurado en las variables de entorno.

### Ambiente de Producción

Para producción, asegúrate de:
1. Tener certificados digitales válidos
2. Credenciales SOL de producción
3. Configurar el endpoint de producción

## Documentación

Este proyecto incluye documentación completa:

- **[QUICKSTART.md](QUICKSTART.md)**: Guía rápida para empezar en 10 minutos ⚡
- **[README.md](README.md)**: Guía de inicio rápido (este archivo)
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)**: Documentación completa de la API REST
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Guía detallada de despliegue y configuración
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**: Solución de problemas comunes
- **[openapi.yml](openapi.yml)**: Especificación OpenAPI 3.0 de la API

### Documentación de Diseño

La documentación de diseño y especificaciones se encuentra en:
- `.kiro/specs/sunat/requirements.md`: Requisitos del sistema
- `.kiro/specs/sunat/design.md`: Diseño detallado con propiedades de corrección
- `.kiro/specs/sunat/tasks.md`: Plan de implementación

## Licencia

ISC

## Soporte

Para dudas o problemas, consulta la documentación en `.kiro/specs/sunat/`

npm run deploy:dev -- --region us-east-2
curl -X GET "https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev/empresas" \
  -H "x-api-key: BUZsB7dnl75nnAcHA06sQ5WaCvPXTRQC5SfJArnC"