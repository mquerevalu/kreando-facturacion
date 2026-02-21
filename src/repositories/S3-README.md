# Cliente S3 para Almacenamiento de Archivos

## Descripción

El `S3FileRepository` implementa el almacenamiento de archivos XML, PDF y certificados digitales en Amazon S3, garantizando el aislamiento multi-tenant mediante prefijos organizados por RUC de empresa.

## Estructura de Almacenamiento

Los archivos se organizan en S3 usando la siguiente estructura de prefijos:

```
{empresaRuc}/
├── xmls/
│   ├── B001-00000001.xml
│   ├── B001-00000002.xml
│   └── F001-00000001.xml
├── pdfs/
│   ├── B001-00000001.pdf
│   ├── B001-00000002.pdf
│   └── F001-00000001.pdf
└── certificados/
    ├── certificado.pfx
    └── certificado-backup.pfx
```

### Ventajas de esta Estructura

1. **Aislamiento Multi-tenant**: Cada empresa tiene su propio prefijo basado en su RUC
2. **Organización Clara**: Los archivos están separados por tipo (xmls, pdfs, certificados)
3. **Seguridad**: Las operaciones validan que el RUC coincida con el prefijo
4. **Escalabilidad**: S3 maneja eficientemente millones de archivos por empresa

## Uso

### Inicialización

```typescript
import { S3FileRepository } from './repositories/S3Repository';

// Usar configuración por defecto (desde variables de entorno)
const repository = new S3FileRepository();

// O especificar cliente y bucket personalizados
const customClient = new S3Client({ region: 'us-east-1' });
const repository = new S3FileRepository(customClient, 'mi-bucket-personalizado');
```

### Variables de Entorno

```bash
AWS_REGION=us-east-1
S3_BUCKET=sunat-facturacion-archivos
```

### Guardar y Recuperar XMLs

```typescript
// Guardar XML
const empresaRuc = '20123456789';
const numero = 'B001-00000001';
const contenidoXML = '<?xml version="1.0"?><Invoice>...</Invoice>';

const ruta = await repository.guardarXML(empresaRuc, numero, contenidoXML);
// Retorna: "20123456789/xmls/B001-00000001.xml"

// Recuperar XML
const xml = await repository.recuperarXML(empresaRuc, numero);
// Retorna: string con el contenido XML o null si no existe
```

### Guardar y Recuperar PDFs

```typescript
// Guardar PDF
const empresaRuc = '20123456789';
const numero = 'B001-00000001';
const contenidoPDF = Buffer.from(pdfData);

const ruta = await repository.guardarPDF(empresaRuc, numero, contenidoPDF);
// Retorna: "20123456789/pdfs/B001-00000001.pdf"

// Recuperar PDF
const pdf = await repository.recuperarPDF(empresaRuc, numero);
// Retorna: Buffer con el contenido PDF o null si no existe
```

### Guardar y Recuperar Certificados

```typescript
// Guardar certificado (con encriptación AES256)
const empresaRuc = '20123456789';
const nombre = 'certificado.pfx';
const contenidoCert = Buffer.from(certData);

const ruta = await repository.guardarCertificado(empresaRuc, nombre, contenidoCert);
// Retorna: "20123456789/certificados/certificado.pfx"

// Recuperar certificado
const cert = await repository.recuperarCertificado(empresaRuc, nombre);
// Retorna: Buffer con el contenido del certificado o null si no existe
```

### Listar Archivos

```typescript
// Listar todos los archivos de una empresa
const archivos = await repository.listarArchivos(empresaRuc);
// Retorna: ["20123456789/xmls/B001-00000001.xml", "20123456789/pdfs/B001-00000001.pdf", ...]

// Listar solo XMLs
const xmls = await repository.listarArchivos(empresaRuc, 'xmls');
// Retorna: ["20123456789/xmls/B001-00000001.xml", "20123456789/xmls/B001-00000002.xml"]

// Listar solo PDFs
const pdfs = await repository.listarArchivos(empresaRuc, 'pdfs');
// Retorna: ["20123456789/pdfs/B001-00000001.pdf", ...]
```

### Eliminar Archivos

```typescript
// Eliminar un archivo específico
const ruta = '20123456789/xmls/B001-00000001.xml';
await repository.eliminarArchivo(empresaRuc, ruta);

// IMPORTANTE: La ruta debe comenzar con el RUC de la empresa
// Esto previene que una empresa elimine archivos de otra empresa
```

## Seguridad Multi-tenant

El repositorio implementa varias medidas de seguridad para garantizar el aislamiento entre empresas:

### 1. Validación de Prefijos

```typescript
// ✅ CORRECTO: La ruta comienza con el RUC de la empresa
await repository.eliminarArchivo('20123456789', '20123456789/xmls/B001-00000001.xml');

// ❌ ERROR: La ruta no comienza con el RUC de la empresa
await repository.eliminarArchivo('20123456789', '20987654321/xmls/B001-00000001.xml');
// Lanza: "La ruta del archivo no pertenece a la empresa especificada"
```

### 2. Organización Automática por RUC

Todos los métodos de guardado automáticamente organizan los archivos usando el RUC:

```typescript
// Mismo número de comprobante, diferentes empresas
await repository.guardarXML('20123456789', 'B001-00000001', xml1);
await repository.guardarXML('20987654321', 'B001-00000001', xml2);

// Se guardan en rutas diferentes:
// - 20123456789/xmls/B001-00000001.xml
// - 20987654321/xmls/B001-00000001.xml
```

### 3. Encriptación de Certificados

Los certificados digitales se almacenan con encriptación en reposo (AES256):

```typescript
// Automáticamente aplica ServerSideEncryption: 'AES256'
await repository.guardarCertificado(empresaRuc, nombre, contenido);
```

## Sanitización de Nombres de Archivo

El repositorio sanitiza automáticamente los nombres de archivo para prevenir problemas:

```typescript
// Caracteres especiales son reemplazados por guiones bajos
await repository.guardarXML('20123456789', 'F001/00000123', xml);
// Ruta resultante: "20123456789/xmls/F001_00000123.xml"

await repository.guardarCertificado('20123456789', 'cert@2024!.pfx', cert);
// Ruta resultante: "20123456789/certificados/cert_2024_.pfx"
```

## Manejo de Errores

### Archivo No Encontrado

```typescript
const xml = await repository.recuperarXML('20123456789', 'B001-99999999');
// Retorna: null (no lanza error)
```

### Errores de Red

```typescript
try {
  await repository.guardarXML(empresaRuc, numero, xml);
} catch (error) {
  // Maneja errores de S3 (permisos, red, etc.)
  console.error('Error al guardar XML:', error);
}
```

### Validación de Acceso Multi-tenant

```typescript
try {
  await repository.eliminarArchivo('20123456789', '20987654321/xmls/B001-00000001.xml');
} catch (error) {
  // Error: "La ruta del archivo no pertenece a la empresa especificada"
}
```

## Pruebas

El repositorio incluye pruebas unitarias completas que validan:

- ✅ Guardado y recuperación de XMLs
- ✅ Guardado y recuperación de PDFs
- ✅ Guardado y recuperación de certificados con encriptación
- ✅ Sanitización de nombres de archivo
- ✅ Manejo de archivos no encontrados
- ✅ Listado de archivos con y sin prefijos
- ✅ Aislamiento multi-tenant
- ✅ Validación de acceso entre empresas

Ejecutar pruebas:

```bash
npm test -- S3Repository.test.ts
```

## Configuración de S3

### Bucket Policy Recomendada

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT-ID:role/lambda-execution-role"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::sunat-facturacion-archivos/*",
        "arn:aws:s3:::sunat-facturacion-archivos"
      ]
    }
  ]
}
```

### Lifecycle Policy Recomendada

```json
{
  "Rules": [
    {
      "Id": "TransitionOldXMLs",
      "Status": "Enabled",
      "Prefix": "",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 365,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

## Integración con Otros Componentes

### Con ComprobanteRepository

```typescript
// Guardar comprobante en DynamoDB
await comprobanteRepository.guardarComprobante(empresaRuc, comprobante);

// Guardar XML en S3
await s3Repository.guardarXML(empresaRuc, comprobante.numero, comprobante.xmlFirmado);
```

### Con PDFGenerator

```typescript
// Generar PDF
const pdfBuffer = await pdfGenerator.generarPDF(comprobante, cdr);

// Guardar PDF en S3
await s3Repository.guardarPDF(empresaRuc, comprobante.numero, pdfBuffer);
```

### Con CertificateManager

```typescript
// Cargar certificado
const certBuffer = await fs.readFile('certificado.pfx');

// Guardar en S3
await s3Repository.guardarCertificado(empresaRuc, 'certificado.pfx', certBuffer);

// Recuperar para usar
const cert = await s3Repository.recuperarCertificado(empresaRuc, 'certificado.pfx');
```

## Requisitos Cumplidos

Este cliente S3 cumple con los siguientes requisitos del sistema:

- ✅ **Requisito 3.4**: Almacenamiento de CDR (XMLs)
- ✅ **Requisito 8.1**: Almacenamiento de PDFs
- ✅ **Requisito 5.1**: Almacenamiento de certificados digitales
- ✅ **Arquitectura Multi-tenant**: Aislamiento por empresa usando prefijos por RUC
- ✅ **Seguridad**: Encriptación de certificados y validación de acceso

## Próximos Pasos

1. Integrar con handlers de Lambda para operaciones de comprobantes
2. Implementar generación de URLs pre-firmadas para descarga de PDFs
3. Configurar eventos S3 para procesamiento automático de archivos
4. Implementar versionado de archivos para auditoría
