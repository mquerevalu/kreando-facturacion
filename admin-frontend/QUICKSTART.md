# Guía Rápida - Admin Frontend

## Inicio Rápido

### 1. Instalar Dependencias

```bash
cd sunat-facturacion/admin-frontend
npm install
```

### 2. Iniciar el Servidor de Desarrollo

```bash
npm start
```

La aplicación se abrirá automáticamente en [http://localhost:3000](http://localhost:3000)

### 3. Iniciar Sesión

Usa las credenciales de un usuario creado en AWS Cognito:

- **User Pool ID**: `us-east-2_UvmWSCB4i`
- **Region**: `us-east-2`

Si no tienes un usuario, créalo con:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-2_UvmWSCB4i \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com \
  --temporary-password TempPassword123! \
  --region us-east-2
```

## Flujo de Trabajo Típico

### 1. Registrar una Empresa

1. Ve a **Empresas** en el menú lateral
2. Haz clic en **Nueva Empresa**
3. Completa el formulario:
   - RUC (11 dígitos)
   - Razón Social
   - Nombre Comercial
   - Dirección completa
   - Credenciales SUNAT (usuario y contraseña)
4. Haz clic en **Guardar**

### 2. Cargar Certificado Digital

1. Ve a **Certificados** en el menú lateral
2. En la sección "Cargar Certificado":
   - Ingresa el RUC de la empresa
   - Selecciona el archivo PFX/P12
   - Ingresa la contraseña del certificado
3. Haz clic en **Cargar Certificado**

### 3. Consultar Comprobantes

1. Ve a **Comprobantes** en el menú lateral
2. Usa los filtros para buscar:
   - RUC de la empresa
   - Tipo de comprobante (Factura/Boleta)
   - Número de documento
   - Nombre del receptor
   - Estado
   - Rango de fechas
3. Haz clic en **Buscar**
4. Desde la tabla puedes:
   - Descargar PDF (icono de descarga)
   - Actualizar estado (icono de actualizar)

## Configuración

### Cambiar el Endpoint de la API

Edita `src/aws-config.ts`:

```typescript
export const awsConfig = {
  API: {
    REST: {
      'sunat-api': {
        endpoint: 'https://TU-API-ENDPOINT.execute-api.us-east-2.amazonaws.com/dev',
        region: 'us-east-2',
      }
    }
  }
};

export const API_KEY = 'TU-API-KEY';
```

### Cambiar el User Pool de Cognito

Edita `src/aws-config.ts`:

```typescript
export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'TU-USER-POOL-ID',
      userPoolClientId: 'TU-CLIENT-ID',
      region: 'us-east-2',
    }
  }
};
```

## Construcción para Producción

```bash
npm run build
```

Los archivos optimizados se generarán en la carpeta `build/`.

## Solución de Problemas

### Error de CORS

Si ves errores de CORS, verifica que el backend tenga configurado CORS correctamente en `serverless.yml`:

```yaml
functions:
  empresas-handler:
    handler: src/handlers/empresas.handler
    events:
      - http:
          path: empresas
          method: ANY
          cors: true
```

### Error de Autenticación

Si no puedes iniciar sesión:

1. Verifica que el User Pool ID y Client ID sean correctos
2. Verifica que el usuario exista en Cognito
3. Si es la primera vez, usa la contraseña temporal y cámbiala

### Error al Cargar Datos

Si no se cargan las empresas o comprobantes:

1. Verifica que el API endpoint sea correcto
2. Verifica que el API Key sea válido
3. Revisa la consola del navegador para ver errores específicos
4. Verifica que el backend esté desplegado y funcionando

## Próximos Pasos

- Personaliza el tema en `src/theme.ts`
- Agrega más funcionalidades según tus necesidades
- Implementa control de acceso basado en roles
- Agrega reportes y estadísticas
