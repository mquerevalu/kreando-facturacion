# Guía de Despliegue - Sistema de Facturación Electrónica SUNAT

## Requisitos Previos

### 1. Herramientas Necesarias

- **Node.js**: v20.x o superior
- **npm**: v10.x o superior
- **AWS CLI**: v2.x configurado con credenciales válidas
- **Serverless Framework**: v4.x (se instala automáticamente con npm)

### 2. Configuración de AWS

Asegúrate de tener configuradas las credenciales de AWS:

```bash
aws configure
```

Necesitarás:
- AWS Access Key ID
- AWS Secret Access Key
- Región por defecto (ej: us-east-1)

### 3. Permisos IAM Requeridos

El usuario de AWS debe tener permisos para:
- Lambda (crear, actualizar, eliminar funciones)
- API Gateway (crear, configurar endpoints)
- DynamoDB (crear, configurar tablas)
- S3 (crear, configurar buckets)
- CloudWatch Logs (crear log groups)
- IAM (crear roles y políticas)
- CloudFormation (crear, actualizar stacks)
- Secrets Manager (crear, actualizar secrets)
- SQS (crear, configurar colas)

## Instalación

### 1. Clonar el Repositorio

```bash
git clone <repository-url>
cd sunat-facturacion
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Compilar el Código TypeScript

```bash
npm run build
```

### 4. Ejecutar Pruebas

```bash
npm test
```

## Desarrollo Local

### Iniciar Servidor Local

El sistema usa `serverless-offline` para desarrollo local sin necesidad de desplegar a AWS:

```bash
npm run dev
```

Esto iniciará:
- API Gateway local en `http://localhost:3000`
- Lambda local en puerto `3002`

### Probar Endpoints Localmente

```bash
# Listar empresas
curl http://localhost:3000/dev/empresas

# Crear empresa
curl -X POST http://localhost:3000/dev/empresas \
  -H "Content-Type: application/json" \
  -d '{
    "ruc": "20123456789",
    "razonSocial": "Mi Empresa SAC",
    "nombreComercial": "Mi Empresa",
    "direccion": {
      "direccion": "Av. Principal 123",
      "departamento": "Lima",
      "provincia": "Lima",
      "distrito": "Miraflores",
      "ubigeo": "150101"
    },
    "credencialesSunat": {
      "ruc": "20123456789",
      "usuario": "MODDATOS",
      "password": "moddatos"
    }
  }'
```

## Despliegue a AWS

### Ambientes Disponibles

El sistema soporta tres ambientes:

1. **Development (dev)**: Para desarrollo y pruebas
   - Usa ambiente de homologación de SUNAT
   - Logs verbosos
   - Sin throttling estricto
   - Retención de datos: 30 días

2. **Staging (staging)**: Para pruebas de integración
   - Usa ambiente de homologación de SUNAT
   - Configuración similar a producción
   - Retención de datos: 60 días

3. **Production (prod)**: Para uso en producción
   - Usa ambiente de producción de SUNAT
   - Alta disponibilidad
   - Backups automáticos
   - Alarmas de CloudWatch
   - Retención de datos: indefinida

### Despliegue a Development

```bash
npm run deploy:dev
```

Este comando:
1. Compila el código TypeScript
2. Empaqueta las funciones Lambda
3. Crea/actualiza el stack de CloudFormation
4. Despliega todas las funciones Lambda
5. Configura API Gateway
6. Crea tablas DynamoDB
7. Crea bucket S3
8. Configura colas SQS

**Salida esperada:**
```
✔ Service deployed to stack sunat-facturacion-dev (123s)

endpoints:
  POST - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/empresas
  GET - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/empresas
  ...

functions:
  empresas-handler: sunat-facturacion-dev-empresas-handler
  generar-comprobante: sunat-facturacion-dev-generar-comprobante
  ...
```

### Despliegue a Staging

```bash
npm run deploy:staging
```

### Despliegue a Production

**IMPORTANTE**: Antes de desplegar a producción:

1. Ejecutar todas las pruebas:
```bash
npm test
npm run test:coverage
```

2. Verificar cobertura de código (mínimo 80%)

3. Probar en staging primero

4. Desplegar a producción:
```bash
npm run deploy:prod
```

### Verificar Despliegue

Después del despliegue, verifica que todo funcione correctamente:

```bash
# Ver información del stack
npm run info:dev  # o info:staging, info:prod

# Ver logs de una función
npm run logs:dev -- -f empresas-handler

# Probar un endpoint
curl https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/empresas
```

## Configuración Post-Despliegue

### 1. Obtener API Key

Después del despliegue, necesitas obtener la API Key:

```bash
aws apigateway get-api-keys --include-values --query 'items[?name==`sunat-facturacion-api-key-dev`].value' --output text
```

### 2. Configurar Certificados Digitales

Para cada empresa, debes cargar su certificado digital:

```bash
curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/certificados \
  -H "x-api-key: YOUR_API_KEY" \
  -F "ruc=20123456789" \
  -F "archivo=@certificado.pfx" \
  -F "password=password123"
```

### 3. Configurar Credenciales SUNAT

Las credenciales de SUNAT se configuran al registrar cada empresa:

```bash
curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/empresas \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ruc": "20123456789",
    "razonSocial": "Mi Empresa SAC",
    "credencialesSunat": {
      "ruc": "20123456789",
      "usuario": "MODDATOS",
      "password": "moddatos"
    }
  }'
```

## Actualización de una Función Específica

Para actualizar solo una función sin redesplegar todo:

```bash
serverless deploy function -f empresas-handler --stage dev
```

## Rollback

Si algo sale mal después del despliegue, puedes hacer rollback:

```bash
# Ver historial de despliegues
aws cloudformation describe-stack-events --stack-name sunat-facturacion-dev

# Rollback al despliegue anterior
aws cloudformation rollback-stack --stack-name sunat-facturacion-dev
```

## Eliminación de Recursos

### Eliminar Stack Completo

**ADVERTENCIA**: Esto eliminará TODOS los recursos incluyendo datos en DynamoDB y S3.

```bash
# Development
npm run remove:dev

# Staging
npm run remove:staging

# Production (requiere confirmación adicional)
npm run remove:prod
```

### Backup Antes de Eliminar

Antes de eliminar un ambiente, haz backup de los datos:

```bash
# Backup de DynamoDB
aws dynamodb create-backup \
  --table-name sunat-facturacion-comprobantes-dev \
  --backup-name comprobantes-backup-$(date +%Y%m%d)

# Backup de S3
aws s3 sync s3://sunat-facturacion-files-dev ./backup-s3/
```

## Monitoreo

### Ver Logs en Tiempo Real

```bash
# Logs de una función específica
npm run logs:dev -- -f generar-comprobante --tail

# Logs de todas las funciones
serverless logs --stage dev --tail
```

### CloudWatch Dashboards

Accede a CloudWatch en la consola de AWS para ver:
- Métricas de Lambda (invocaciones, errores, duración)
- Métricas de API Gateway (requests, latencia, errores)
- Métricas de DynamoDB (lectura/escritura)
- Alarmas configuradas (solo en producción)

### Alarmas (Solo Producción)

El ambiente de producción incluye alarmas para:
- Alta tasa de errores en Lambda
- Throttling de Lambda
- Mensajes en Dead Letter Queue

## Troubleshooting

### Error: "Stack already exists"

Si el despliegue falla porque el stack ya existe:

```bash
# Ver estado del stack
aws cloudformation describe-stacks --stack-name sunat-facturacion-dev

# Si está en estado ROLLBACK_COMPLETE, elimínalo primero
npm run remove:dev

# Luego vuelve a desplegar
npm run deploy:dev
```

### Error: "Insufficient permissions"

Verifica que tu usuario de AWS tenga todos los permisos necesarios listados en la sección de requisitos.

### Error: "Rate exceeded"

Si recibes errores de rate limiting de AWS:

```bash
# Espera unos minutos y vuelve a intentar
# O aumenta el timeout en serverless.yml
```

### Función Lambda con Errores

```bash
# Ver logs detallados
npm run logs:dev -- -f nombre-funcion --tail

# Ver métricas en CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=sunat-facturacion-dev-nombre-funcion \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

## Costos Estimados

### Development/Staging

- Lambda: ~$5-10/mes (con uso moderado)
- DynamoDB: ~$2-5/mes (PAY_PER_REQUEST)
- S3: ~$1-3/mes
- API Gateway: ~$3-5/mes
- **Total estimado**: $11-23/mes

### Production

- Lambda: ~$20-50/mes (con uso alto)
- DynamoDB: ~$10-30/mes (PAY_PER_REQUEST + backups)
- S3: ~$5-15/mes (con versionado y lifecycle)
- API Gateway: ~$10-20/mes
- CloudWatch: ~$5-10/mes
- **Total estimado**: $50-125/mes

## Mejores Prácticas

1. **Siempre probar en dev/staging antes de producción**
2. **Hacer backup antes de actualizaciones importantes**
3. **Monitorear logs y métricas regularmente**
4. **Mantener las dependencias actualizadas**
5. **Usar variables de entorno para configuración sensible**
6. **Implementar CI/CD para despliegues automáticos**
7. **Documentar cambios en el código**
8. **Revisar costos mensualmente**

## CI/CD (Opcional)

Para automatizar despliegues, puedes usar GitHub Actions, GitLab CI, o AWS CodePipeline.

Ejemplo de GitHub Actions:

```yaml
name: Deploy to AWS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run deploy:prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Soporte

Para problemas o preguntas:
- Revisar logs en CloudWatch
- Consultar documentación de AWS
- Contactar al equipo de desarrollo
