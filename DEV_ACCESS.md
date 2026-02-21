# Acceso al Ambiente de Desarrollo

## Información de Despliegue

- **Región**: us-east-2 (Ohio)
- **Stage**: dev
- **Fecha de despliegue**: $(date)

## Credenciales

### API Key
```
BUZsB7dnl75nnAcHA06sQ5WaCvPXTRQC5SfJArnC
```

**IMPORTANTE**: Usa esta API Key en el header `x-api-key` de todas tus peticiones.

## Endpoints

### URL Base
```
https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev
```

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

## Ejemplos de Uso

### 1. Registrar una Empresa

```bash
curl -X POST https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev/empresas \
  -H "x-api-key: BUZsB7dnl75nnAcHA06sQ5WaCvPXTRQC5SfJArnC" \
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

### 2. Listar Empresas

```bash
curl -X GET https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev/empresas \
  -H "x-api-key: BUZsB7dnl75nnAcHA06sQ5WaCvPXTRQC5SfJArnC"
```

### 3. Generar una Boleta

```bash
curl -X POST https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev/comprobantes/generar \
  -H "x-api-key: BUZsB7dnl75nnAcHA06sQ5WaCvPXTRQC5SfJArnC" \
  -H "Content-Type: application/json" \
  -d '{
    "empresaRuc": "20123456789",
    "tipo": "03",
    "receptor": {
      "tipoDocumento": "1",
      "numeroDocumento": "12345678",
      "nombre": "Juan Pérez"
    },
    "items": [
      {
        "codigo": "PROD001",
        "descripcion": "Producto de prueba",
        "cantidad": 2,
        "unidadMedida": "NIU",
        "precioUnitario": 100.00,
        "afectacionIGV": "10",
        "igv": 36.00,
        "total": 200.00
      }
    ],
    "moneda": "PEN"
  }'
```

## Recursos AWS Creados

### Lambda Functions
- sunat-facturacion-dev-empresas-handler
- sunat-facturacion-dev-generar-comprobante
- sunat-facturacion-dev-firmar-comprobante
- sunat-facturacion-dev-enviar-sunat
- sunat-facturacion-dev-consultar-estado
- sunat-facturacion-dev-generar-pdf
- sunat-facturacion-dev-gestionar-certificados
- sunat-facturacion-dev-procesar-reintentos

### DynamoDB Tables
- sunat-facturacion-empresas-dev
- sunat-facturacion-comprobantes-dev
- sunat-facturacion-contadores-dev

### S3 Bucket
- sunat-facturacion-files-dev

### SQS Queues
- sunat-facturacion-reintentos-dev
- sunat-facturacion-reintentos-dlq-dev

## Monitoreo

### Ver Logs
```bash
# Logs de una función específica
npm run logs:dev -- -f empresas-handler --tail

# Logs de todas las funciones
serverless logs --stage dev --region us-east-2 --tail
```

### Ver Información del Stack
```bash
npm run info:dev
```

## Eliminar el Ambiente

Cuando termines de probar y quieras eliminar todos los recursos:

```bash
npm run remove:dev -- --region us-east-2
```

**NOTA**: Esto eliminará TODOS los recursos y datos. Haz backup si necesitas conservar algo.

## Costos Estimados

Con uso ligero de pruebas:
- **Costo mínimo**: ~$1-2/mes (API Gateway + CloudWatch)
- **Con pruebas moderadas**: ~$2-5/mes
- **Si no usas nada**: ~$1/mes (solo por tener la API creada)

## Soporte

Para más información, consulta:
- [API Documentation](API_DOCUMENTATION.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
