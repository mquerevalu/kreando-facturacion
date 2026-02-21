# Catálogos SUNAT

Este módulo implementa los catálogos oficiales de SUNAT requeridos para la facturación electrónica.

## Catálogos Implementados

### Catálogo 01: Tipos de Documentos
Códigos de tipos de comprobantes de pago y documentos relacionados.
- `01`: Factura
- `03`: Boleta de Venta
- `07`: Nota de Crédito
- `08`: Nota de Débito
- Y más...

### Catálogo 05: Tipos de Tributos
Códigos de tributos aplicables en Perú.
- `1000`: IGV - Impuesto General a las Ventas
- `2000`: ISC - Impuesto Selectivo al Consumo
- `7152`: ICBPER - Impuesto al Consumo de las Bolsas de Plástico
- Y más...

### Catálogo 06: Tipos de Documentos de Identidad
Códigos de documentos de identidad válidos.
- `1`: DNI - Documento Nacional de Identidad
- `6`: RUC - Registro Único de Contribuyentes
- `4`: Carnet de Extranjería
- `7`: Pasaporte
- Y más...

### Catálogo 07: Códigos de Afectación del IGV
Códigos que indican cómo se afecta el IGV en cada operación.
- `10`: Gravado - Operación Onerosa
- `20`: Exonerado - Operación Onerosa
- `30`: Inafecto - Operación Onerosa
- `40`: Exportación
- Y más...

## Uso

```typescript
import {
  catalogo01,
  catalogo05,
  catalogo06,
  catalogo07,
  obtenerDescripcionCatalogo,
  existeEnCatalogo,
  recargarCatalogos
} from './validators/catalogos';

// Verificar si un código existe en un catálogo
if (existeEnCatalogo('01', '03')) {
  console.log('Código válido para Boleta de Venta');
}

// Obtener la descripción de un código
const descripcion = obtenerDescripcionCatalogo('05', '1000');
console.log(descripcion); // "IGV - Impuesto General a las Ventas"

// Acceder directamente a un catálogo
console.log(catalogo01['01']); // "Factura"
```

## Actualización de Catálogos (Requisito 9.5)

Los catálogos se cargan desde el archivo `catalogos.json`, lo que permite actualizarlos **sin modificar el código fuente**.

### Cómo actualizar los catálogos:

1. **Editar el archivo JSON**: Modifica el archivo `src/validators/catalogos.json` con los nuevos códigos o descripciones.

   ```json
   {
     "01": {
       "01": "Factura",
       "03": "Boleta de Venta",
       "99": "Nuevo Tipo de Documento"
     }
   }
   ```

2. **Recargar en caliente (opcional)**: Si la aplicación está en ejecución, puedes recargar los catálogos sin reiniciar:

   ```typescript
   import { recargarCatalogos } from './validators/catalogos';
   
   // Recargar catálogos desde el archivo JSON
   recargarCatalogos();
   ```

3. **Reiniciar la aplicación**: Si no usas recarga en caliente, simplemente reinicia la aplicación y los nuevos catálogos se cargarán automáticamente.

### Ventajas de este enfoque:

- ✅ **Sin cambios en código**: Solo editas el archivo JSON
- ✅ **Sin recompilación**: No necesitas recompilar TypeScript
- ✅ **Sin redespliegue**: En producción, solo actualizas el archivo JSON
- ✅ **Versionable**: El archivo JSON puede versionarse en Git
- ✅ **Auditable**: Los cambios en catálogos quedan registrados en el historial

## Validación

El módulo incluye pruebas exhaustivas que verifican:

- ✅ Presencia de todos los códigos principales en cada catálogo
- ✅ Estructura correcta de los datos
- ✅ Funciones de búsqueda y validación
- ✅ Capacidad de recarga sin errores
- ✅ Cumplimiento de requisitos 9.1, 9.2, 9.3, 9.4 y 9.5

Para ejecutar las pruebas:

```bash
npm test -- catalogos.test.ts
```

## Referencias

Los catálogos están basados en la documentación oficial de SUNAT:
- [Catálogos para la emisión electrónica](https://cpe.sunat.gob.pe/node/88)
- [Anexos y estructuras UBL 2.1](https://cpe.sunat.gob.pe/node/88)

## Mantenimiento

Cuando SUNAT publique actualizaciones a los catálogos:

1. Descarga la versión actualizada desde el portal de SUNAT
2. Actualiza el archivo `catalogos.json` con los nuevos códigos
3. Ejecuta las pruebas para verificar que todo funciona correctamente
4. Despliega solo el archivo JSON actualizado (no requiere redespliegue de código)
