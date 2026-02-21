# Guía de Troubleshooting - Sistema de Facturación SUNAT

Esta guía te ayudará a resolver problemas comunes que puedas encontrar al usar el sistema.

## Tabla de Contenidos

1. [Problemas de Desarrollo Local](#problemas-de-desarrollo-local)
2. [Problemas de Despliegue](#problemas-de-despliegue)
3. [Problemas con SUNAT](#problemas-con-sunat)
4. [Problemas con Certificados](#problemas-con-certificados)
5. [Problemas de Rendimiento](#problemas-de-rendimiento)
6. [Errores Comunes](#errores-comunes)

---

## Problemas de Desarrollo Local

### Error: "Cannot find module 'serverless-offline'"

**Síntoma**: Al ejecutar `npm run dev` aparece error de módulo no encontrado.

**Solución**:
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Error: "Port 3000 already in use"

**Síntoma**: El puerto 3000 ya está siendo usado por otro proceso.

**Solución**:
```bash
# Opción 1: Matar el proceso que usa el puerto
lsof -ti:3000 | xargs kill -9

# Opción 2: Cambiar el puerto en serverless.yml
# Editar custom.serverless-offline.httpPort a otro puerto
```

### Error: "AWS credentials not found"

**Síntoma**: Errores al intentar acceder a servicios de AWS localmente.

**Solución**:
```bash
# Configurar credenciales de AWS
aws configure

# O usar variables de entorno
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1
```

### Tests Fallando Localmente

**Síntoma**: Los tests pasan en CI pero fallan localmente.

**Solución**:
```bash
# Limpiar caché de Jest
npm test -- --clearCache

# Reinstalar dependencias
rm -rf node_modules
npm install

# Verificar versión de Node.js
node --version  # Debe ser 20.x o superior
```

---

## Problemas de Despliegue

### Error: "Stack already exists"

**Síntoma**: El despliegue falla porque el stack ya existe en CloudFormation.

**Solución**:
```bash
# Ver estado del stack
aws cloudformation describe-stacks --stack-name sunat-facturacion-dev

# Si está en ROLLBACK_COMPLETE, eliminarlo
npm run remove:dev

# Volver a desplegar
npm run deploy:dev
```

### Error: "Insufficient permissions"

**Síntoma**: Error de permisos al intentar desplegar.

**Solución**:
Verifica que tu usuario de AWS tenga los siguientes permisos:
- CloudFormation (crear/actualizar stacks)
- Lambda (crear/actualizar funciones)
- API Gateway (crear/configurar APIs)
- DynamoDB (crear/configurar tablas)
- S3 (crear/configurar buckets)
- IAM (crear roles y políticas)
- CloudWatch Logs (crear log groups)
- Secrets Manager (crear/actualizar secrets)
- SQS (crear/configurar colas)

```bash
# Verificar permisos actuales
aws iam get-user
aws iam list-attached-user-policies --user-name YOUR_USERNAME
```

### Error: "Rate exceeded"

**Síntoma**: AWS está limitando las peticiones por rate limiting.

**Solución**:
```bash
# Esperar unos minutos y volver a intentar
sleep 300 && npm run deploy:dev

# O desplegar con más tiempo entre operaciones
serverless deploy --stage dev --verbose
```

### Error: "Resource limit exceeded"

**Síntoma**: Has alcanzado el límite de recursos de AWS (ej: 200 buckets S3).

**Solución**:
```bash
# Listar recursos existentes
aws s3 ls
aws dynamodb list-tables
aws lambda list-functions

# Eliminar recursos no utilizados
npm run remove:dev  # Para ambientes de desarrollo antiguos
```

### Despliegue Lento

**Síntoma**: El despliegue tarda más de 10 minutos.

**Solución**:
```bash
# Desplegar solo funciones específicas
serverless deploy function -f generar-comprobante --stage dev

# Verificar que no haya recursos bloqueados
aws cloudformation describe-stack-events --stack-name sunat-facturacion-dev
```

---

## Problemas con SUNAT

### Error: "El comprobante fue rechazado"

**Síntoma**: SUNAT rechaza el comprobante con código de error.

**Solución**:
1. Verificar el código de error en el CDR
2. Consultar catálogo de errores de SUNAT
3. Errores comunes:
   - **2000-2999**: Errores en el XML (estructura, campos faltantes)
   - **3000-3999**: Errores de validación de negocio
   - **4000-4999**: Errores de certificado o firma

```bash
# Ver logs del envío
npm run logs:dev -- -f enviar-sunat --tail

# Consultar estado del comprobante
curl -X GET "https://API_URL/dev/comprobantes/B001-00000001/estado?empresaRuc=20123456789" \
  -H "x-api-key: YOUR_API_KEY"
```

### Error: "Connection timeout"

**Síntoma**: Timeout al intentar conectar con SUNAT.

**Solución**:
1. Verificar que el endpoint de SUNAT esté correcto
2. Verificar conectividad de red
3. El sistema reintentará automáticamente 3 veces

```bash
# Verificar endpoint configurado
aws lambda get-function-configuration \
  --function-name sunat-facturacion-dev-enviar-sunat \
  --query 'Environment.Variables.SUNAT_ENDPOINT'

# Verificar logs de reintentos
npm run logs:dev -- -f procesar-reintentos --tail
```

### Error: "Credenciales inválidas"

**Síntoma**: SUNAT rechaza las credenciales SOL.

**Solución**:
1. Verificar que las credenciales sean correctas
2. Verificar que el RUC coincida con el certificado
3. Verificar que estés usando el ambiente correcto (homologación vs producción)

```bash
# Actualizar credenciales de una empresa
curl -X PUT "https://API_URL/dev/empresas/20123456789" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "credencialesSunat": {
      "ruc": "20123456789",
      "usuario": "USUARIO_CORRECTO",
      "password": "PASSWORD_CORRECTO"
    }
  }'
```

### XML Inválido

**Síntoma**: SUNAT rechaza el XML por estructura inválida.

**Solución**:
1. Verificar que todos los campos obligatorios estén presentes
2. Verificar que los códigos de catálogo sean correctos
3. Validar el XML contra el esquema UBL 2.1

```bash
# Ver el XML generado en los logs
npm run logs:dev -- -f generar-comprobante --tail

# Descargar el XML desde S3
aws s3 cp s3://sunat-facturacion-files-dev/xmls/20123456789/B001-00000001.xml ./
```

---

## Problemas con Certificados

### Error: "Certificado vencido"

**Síntoma**: El sistema rechaza el certificado por estar vencido.

**Solución**:
```bash
# Consultar estado del certificado
curl -X GET "https://API_URL/dev/certificados/20123456789" \
  -H "x-api-key: YOUR_API_KEY"

# Cargar nuevo certificado
curl -X POST "https://API_URL/dev/certificados" \
  -H "x-api-key: YOUR_API_KEY" \
  -F "ruc=20123456789" \
  -F "archivo=@nuevo_certificado.pfx" \
  -F "password=nueva_password"
```

### Error: "Contraseña de certificado incorrecta"

**Síntoma**: No se puede leer el certificado PFX/P12.

**Solución**:
1. Verificar que la contraseña sea correcta
2. Verificar que el archivo no esté corrupto
3. Intentar abrir el certificado con otra herramienta (ej: OpenSSL)

```bash
# Verificar certificado con OpenSSL
openssl pkcs12 -info -in certificado.pfx -nodes
```

### Error: "RUC no coincide con certificado"

**Síntoma**: El RUC de la empresa no coincide con el del certificado.

**Solución**:
1. Verificar que el certificado sea de la empresa correcta
2. Verificar que el RUC esté bien escrito (11 dígitos)

---

## Problemas de Rendimiento

### Lambda Timeout

**Síntoma**: Las funciones Lambda exceden el timeout configurado.

**Solución**:
```bash
# Aumentar timeout en serverless.yml
# Para funciones específicas:
functions:
  enviar-sunat:
    timeout: 90  # Aumentar de 60 a 90 segundos

# Redesplegar
npm run deploy:dev
```

### DynamoDB Throttling

**Síntoma**: Errores de throttling en DynamoDB.

**Solución**:
Las tablas usan PAY_PER_REQUEST (on-demand) que escala automáticamente. Si aún así hay throttling:

```bash
# Verificar métricas de DynamoDB
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=sunat-facturacion-comprobantes-dev \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### S3 Slow Upload

**Síntoma**: Subida lenta de archivos a S3.

**Solución**:
1. Verificar tamaño de los archivos
2. Considerar usar multipart upload para archivos grandes
3. Verificar región del bucket (debe estar en la misma región que Lambda)

---

## Errores Comunes

### Error 400: "Datos inválidos"

**Causa**: Los datos enviados no cumplen con las validaciones.

**Solución**:
- Verificar que el RUC tenga 11 dígitos
- Verificar que el DNI tenga 8 dígitos
- Verificar que los montos sean positivos
- Verificar que la moneda sea PEN o USD

### Error 401: "No autorizado"

**Causa**: API Key inválida o no proporcionada.

**Solución**:
```bash
# Obtener API Key
aws apigateway get-api-keys --include-values \
  --query 'items[?name==`sunat-facturacion-api-key-dev`].value' \
  --output text

# Usar en las peticiones
curl -H "x-api-key: YOUR_API_KEY" https://API_URL/dev/empresas
```

### Error 404: "No encontrado"

**Causa**: El recurso solicitado no existe.

**Solución**:
- Verificar que el RUC o número de comprobante sea correcto
- Verificar que el recurso haya sido creado previamente

### Error 429: "Too Many Requests"

**Causa**: Se excedió el límite de rate limiting.

**Solución**:
- Esperar unos segundos antes de reintentar
- Implementar backoff exponencial en el cliente
- Contactar para aumentar el límite si es necesario

### Error 500: "Error interno"

**Causa**: Error no manejado en el servidor.

**Solución**:
```bash
# Ver logs detallados
npm run logs:dev -- -f nombre-funcion --tail

# Verificar CloudWatch Logs
aws logs tail /aws/lambda/sunat-facturacion-dev-nombre-funcion --follow
```

---

## Herramientas de Diagnóstico

### Ver Logs en Tiempo Real

```bash
# Logs de una función específica
npm run logs:dev -- -f generar-comprobante --tail

# Logs de todas las funciones
serverless logs --stage dev --tail
```

### Ver Métricas de CloudWatch

```bash
# Errores de Lambda
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=sunat-facturacion-dev-generar-comprobante \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Duración de Lambda
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=sunat-facturacion-dev-generar-comprobante \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

### Verificar Estado de Recursos

```bash
# Estado del stack
aws cloudformation describe-stacks --stack-name sunat-facturacion-dev

# Funciones Lambda
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `sunat-facturacion-dev`)].FunctionName'

# Tablas DynamoDB
aws dynamodb list-tables --query 'TableNames[?starts_with(@, `sunat-facturacion-dev`)]'

# Buckets S3
aws s3 ls | grep sunat-facturacion

# Colas SQS
aws sqs list-queues --query 'QueueUrls[?contains(@, `sunat-facturacion-dev`)]'
```

### Probar Endpoints

```bash
# Healthcheck básico
curl https://API_URL/dev/empresas

# Con API Key
curl -H "x-api-key: YOUR_API_KEY" https://API_URL/dev/empresas

# POST con datos
curl -X POST https://API_URL/dev/empresas \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @empresa.json
```

---

## Contacto y Soporte

Si ninguna de estas soluciones resuelve tu problema:

1. Revisa los logs de CloudWatch para más detalles
2. Consulta la documentación de AWS
3. Contacta al equipo de desarrollo con:
   - Descripción del problema
   - Logs relevantes
   - Pasos para reproducir el error
   - Ambiente afectado (dev/staging/prod)

## Recursos Adicionales

- [Documentación de SUNAT](https://cpe.sunat.gob.pe/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Serverless Framework Documentation](https://www.serverless.com/framework/docs/)
- [API Documentation](API_DOCUMENTATION.md)
- [Deployment Guide](DEPLOYMENT.md)
