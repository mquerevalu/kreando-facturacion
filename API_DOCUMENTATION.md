# Documentación de la API de Facturación Electrónica SUNAT

## Descripción General

API REST para el sistema de facturación electrónica multi-tenant que cumple con las normativas de SUNAT. Permite a múltiples empresas generar, firmar y enviar comprobantes electrónicos (boletas y facturas).

## Autenticación

Todos los endpoints requieren autenticación mediante API Key en el header `x-api-key`.

```bash
curl -H "x-api-key: YOUR_API_KEY" https://api.example.com/dev/empresas
```

## Rate Limiting

- **Límite mensual**: 10,000 requests
- **Burst limit**: 200 requests
- **Rate limit**: 100 requests/segundo

## Endpoints

### Gestión de Empresas

#### POST /empresas
Registra una nueva empresa en el sistema.

**Request:**
```json
{
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
}
```

**Response (201):**
```json
{
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
  "activo": true,
  "fechaRegistro": "2024-01-15T10:30:00Z"
}
```

#### GET /empresas
Lista todas las empresas registradas.

**Response (200):**
```json
{
  "empresas": [
    {
      "ruc": "20123456789",
      "razonSocial": "Mi Empresa SAC",
      "nombreComercial": "Mi Empresa",
      "activo": true,
      "fechaRegistro": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### GET /empresas/{ruc}
Obtiene los datos de una empresa específica.

**Response (200):**
```json
{
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
  "activo": true,
  "fechaRegistro": "2024-01-15T10:30:00Z"
}
```

#### PUT /empresas/{ruc}
Actualiza los datos de una empresa.

**Request:**
```json
{
  "razonSocial": "Mi Empresa SAC - Actualizada",
  "nombreComercial": "Mi Empresa",
  "activo": true
}
```

### Gestión de Certificados

#### POST /certificados
Carga el certificado digital de una empresa.

**Request (multipart/form-data):**
- `ruc`: RUC de la empresa (11 dígitos)
- `archivo`: Archivo PFX/P12 del certificado
- `password`: Contraseña del certificado

**Response (201):**
```json
{
  "mensaje": "Certificado cargado exitosamente",
  "certificado": {
    "ruc": "20123456789",
    "fechaEmision": "2024-01-01",
    "fechaVencimiento": "2025-12-31",
    "emisor": "Certificadora Digital",
    "vigente": true,
    "diasParaVencer": 365
  }
}
```

#### GET /certificados/{ruc}
Consulta el estado del certificado de una empresa.

**Response (200):**
```json
{
  "ruc": "20123456789",
  "fechaEmision": "2024-01-01",
  "fechaVencimiento": "2025-12-31",
  "emisor": "Certificadora Digital",
  "vigente": true,
  "diasParaVencer": 365
}
```

### Generación de Comprobantes

#### POST /comprobantes/generar
Genera un nuevo comprobante electrónico (boleta o factura).

**Request (Boleta):**
```json
{
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
}
```

**Request (Factura):**
```json
{
  "empresaRuc": "20123456789",
  "tipo": "01",
  "receptor": {
    "tipoDocumento": "6",
    "numeroDocumento": "20111222333",
    "razonSocial": "Cliente Empresa SAC",
    "direccion": {
      "direccion": "Av. Cliente 789",
      "departamento": "Lima",
      "provincia": "Lima",
      "distrito": "Surco",
      "ubigeo": "150140"
    }
  },
  "items": [
    {
      "codigo": "SERV001",
      "descripcion": "Servicio de consultoría",
      "cantidad": 1,
      "unidadMedida": "ZZ",
      "precioUnitario": 1000.00,
      "afectacionIGV": "10",
      "igv": 180.00,
      "total": 1000.00
    }
  ],
  "moneda": "PEN"
}
```

**Response (201):**
```json
{
  "empresaRuc": "20123456789",
  "numero": "B001-00000001",
  "tipo": "03",
  "fecha": "2024-01-15T10:30:00Z",
  "emisor": {
    "ruc": "20123456789",
    "razonSocial": "Mi Empresa SAC",
    "nombreComercial": "Mi Empresa"
  },
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
  "subtotal": 200.00,
  "igv": 36.00,
  "total": 236.00,
  "moneda": "PEN",
  "estado": "PENDIENTE"
}
```

#### POST /comprobantes/{numero}/firmar
Firma digitalmente un comprobante.

**Request:**
```json
{
  "empresaRuc": "20123456789"
}
```

**Response (200):**
```json
{
  "mensaje": "Comprobante firmado exitosamente",
  "xmlFirmado": "<?xml version=\"1.0\"?>..."
}
```

#### POST /comprobantes/{numero}/enviar
Envía el comprobante firmado a SUNAT.

**Request:**
```json
{
  "empresaRuc": "20123456789"
}
```

**Response (200):**
```json
{
  "mensaje": "Comprobante enviado exitosamente",
  "cdr": {
    "codigo": "0",
    "mensaje": "La Factura ha sido aceptada",
    "xml": "<?xml version=\"1.0\"?>...",
    "fechaRecepcion": "2024-01-15T10:35:00Z"
  }
}
```

### Consultas

#### GET /comprobantes/{numero}/estado
Consulta el estado de un comprobante.

**Query Parameters:**
- `empresaRuc`: RUC de la empresa (requerido)

**Response (200):**
```json
{
  "numero": "B001-00000001",
  "estado": "ACEPTADO",
  "cdr": {
    "codigo": "0",
    "mensaje": "La Factura ha sido aceptada",
    "fechaRecepcion": "2024-01-15T10:35:00Z"
  }
}
```

**Estados posibles:**
- `PENDIENTE`: Comprobante generado pero no enviado
- `ENVIADO`: Comprobante enviado a SUNAT, esperando respuesta
- `ACEPTADO`: Comprobante aceptado por SUNAT
- `RECHAZADO`: Comprobante rechazado por SUNAT

#### GET /comprobantes/{numero}/pdf
Descarga el PDF de un comprobante aceptado.

**Query Parameters:**
- `empresaRuc`: RUC de la empresa (requerido)

**Response (200):**
Archivo PDF del comprobante

## Flujo Completo de Facturación

1. **Registrar empresa**
   ```bash
   POST /empresas
   ```

2. **Cargar certificado digital**
   ```bash
   POST /certificados
   ```

3. **Generar comprobante**
   ```bash
   POST /comprobantes/generar
   ```

4. **Firmar comprobante**
   ```bash
   POST /comprobantes/{numero}/firmar
   ```

5. **Enviar a SUNAT**
   ```bash
   POST /comprobantes/{numero}/enviar
   ```

6. **Consultar estado**
   ```bash
   GET /comprobantes/{numero}/estado
   ```

7. **Descargar PDF**
   ```bash
   GET /comprobantes/{numero}/pdf
   ```

## Códigos de Error

### 400 Bad Request
Datos inválidos en la solicitud.

```json
{
  "error": "Datos inválidos",
  "mensaje": "El RUC debe tener 11 dígitos",
  "detalles": {
    "campo": "ruc",
    "valor": "123"
  }
}
```

### 401 Unauthorized
API Key inválida o no proporcionada.

```json
{
  "error": "No autorizado",
  "mensaje": "API Key inválida"
}
```

### 404 Not Found
Recurso no encontrado.

```json
{
  "error": "No encontrado",
  "mensaje": "Empresa con RUC 20123456789 no encontrada"
}
```

### 409 Conflict
Conflicto con el estado actual del recurso.

```json
{
  "error": "Conflicto",
  "mensaje": "La empresa con RUC 20123456789 ya existe"
}
```

### 429 Too Many Requests
Se excedió el límite de rate limiting.

```json
{
  "error": "Demasiadas solicitudes",
  "mensaje": "Se excedió el límite de 100 requests/segundo"
}
```

### 500 Internal Server Error
Error interno del servidor.

```json
{
  "error": "Error interno",
  "mensaje": "Error al procesar la solicitud"
}
```

## Ejemplos con cURL

### Registrar empresa
```bash
curl -X POST https://api.example.com/dev/empresas \
  -H "x-api-key: YOUR_API_KEY" \
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

### Generar boleta
```bash
curl -X POST https://api.example.com/dev/comprobantes/generar \
  -H "x-api-key: YOUR_API_KEY" \
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

### Consultar estado
```bash
curl -X GET "https://api.example.com/dev/comprobantes/B001-00000001/estado?empresaRuc=20123456789" \
  -H "x-api-key: YOUR_API_KEY"
```

### Descargar PDF
```bash
curl -X GET "https://api.example.com/dev/comprobantes/B001-00000001/pdf?empresaRuc=20123456789" \
  -H "x-api-key: YOUR_API_KEY" \
  -o comprobante.pdf
```

## Documentación OpenAPI

La especificación completa de la API en formato OpenAPI 3.0 está disponible en el archivo `openapi.yml`.

Puedes visualizar la documentación usando herramientas como:
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [Redoc](https://redocly.com/redoc/)
- [Postman](https://www.postman.com/)

## Soporte

Para soporte técnico, contactar a: soporte@example.com
