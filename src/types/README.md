# Tipos TypeScript - Sistema de Facturación Electrónica SUNAT

Este directorio contiene todas las definiciones de tipos e interfaces TypeScript para el sistema de facturación electrónica SUNAT.

## Estructura de Archivos

### `enums.ts`
Define las enumeraciones utilizadas en el sistema:
- **TipoComprobante**: Tipos de comprobantes según catálogo 01 de SUNAT (Factura, Boleta, Nota de Crédito, Nota de Débito)
- **EstadoComprobante**: Estados del comprobante en el sistema (Pendiente, Enviado, Aceptado, Rechazado)
- **TipoMoneda**: Tipos de moneda (PEN, USD)
- **TipoDocumentoIdentidad**: Tipos de documentos según catálogo 06 de SUNAT (DNI, RUC, etc.)
- **AfectacionIGV**: Códigos de afectación del IGV según catálogo 07 de SUNAT

### `common.ts`
Define tipos comunes utilizados en todo el sistema:
- **Direccion**: Estructura de dirección física
- **ValidationResult**: Resultado de validaciones
- **Montos**: Montos de un comprobante (subtotal, IGV, total)
- **FiltrosComprobante**: Filtros para consultas de comprobantes

### `empresa.ts`
Define tipos relacionados con empresas y certificados:
- **Empresa**: Empresa registrada en el sistema (multi-tenant)
- **Certificado**: Certificado digital de una empresa
- **Credenciales**: Credenciales SOL de SUNAT
- **DatosEmpresa**: Datos para registrar o actualizar una empresa

### `comprobante.ts`
Define tipos relacionados con comprobantes electrónicos:
- **Comprobante**: Comprobante electrónico completo
- **Emisor**: Datos del emisor del comprobante
- **Receptor**: Datos del receptor del comprobante
- **ItemComprobante**: Item o línea de detalle del comprobante
- **CDR**: Constancia de Recepción de SUNAT
- **DatosBoleta**: Datos para generar una boleta
- **DatosFactura**: Datos para generar una factura
- **DatosComprobante**: Datos genéricos para generar un comprobante

### `responses.ts`
Define tipos para respuestas de API y operaciones:
- **ApiResponse**: Respuesta estándar de API
- **GenerarComprobanteResponse**: Respuesta de generación de comprobante
- **FirmarComprobanteResponse**: Respuesta de firma de comprobante
- **EnviarSunatResponse**: Respuesta de envío a SUNAT
- **ConsultarEstadoResponse**: Respuesta de consulta de estado
- **GenerarPDFResponse**: Respuesta de generación de PDF
- **ValidationError**: Error de validación detallado
- **ValidationResponse**: Respuesta de validación con errores detallados

### `index.ts`
Exporta todos los tipos de forma centralizada para facilitar las importaciones.

## Uso

Para importar tipos en tu código:

```typescript
// Importar tipos específicos
import { Comprobante, TipoComprobante, EstadoComprobante } from '../types';

// O importar todo
import * as Types from '../types';
```

## Ejemplos

### Crear un comprobante

```typescript
import { Comprobante, TipoComprobante, EstadoComprobante, TipoMoneda } from '../types';

const comprobante: Comprobante = {
  empresaRuc: '20123456789',
  numero: 'B001-00000001',
  tipo: TipoComprobante.BOLETA,
  fecha: new Date(),
  emisor: {
    ruc: '20123456789',
    razonSocial: 'Mi Empresa SAC',
    nombreComercial: 'Mi Empresa',
    direccion: {
      departamento: 'Lima',
      provincia: 'Lima',
      distrito: 'Miraflores',
      direccion: 'Av. Principal 123'
    }
  },
  receptor: {
    tipoDocumento: '1',
    numeroDocumento: '12345678',
    nombre: 'Cliente Test'
  },
  items: [],
  subtotal: 100.00,
  igv: 18.00,
  total: 118.00,
  moneda: TipoMoneda.PEN,
  estado: EstadoComprobante.PENDIENTE
};
```

### Validar datos

```typescript
import { ValidationResult } from '../types';

const resultado: ValidationResult = {
  valido: true,
  errores: []
};
```

## Notas

- Todos los tipos están diseñados para cumplir con las normativas de SUNAT
- Los enums utilizan los códigos oficiales de los catálogos de SUNAT
- El sistema es multi-tenant, por lo que muchos tipos incluyen el campo `empresaRuc` para identificar a qué empresa pertenecen los datos
- Las interfaces están diseñadas para ser inmutables y type-safe
