# Admin Frontend - Sistema de Facturación Electrónica SUNAT

Panel de administración web para el sistema de facturación electrónica multi-tenant.

## Características

- Autenticación con AWS Cognito
- Gestión de empresas
- Gestión de certificados digitales
- Búsqueda y consulta de comprobantes electrónicos
- Descarga de PDFs y CDRs
- Interfaz moderna con Material-UI en tonos azules

## Requisitos Previos

- Node.js 18+ y npm
- Acceso al User Pool de Cognito configurado
- API del backend desplegada

## Configuración

La configuración de AWS Cognito y la API se encuentra en `src/aws-config.ts`:

```typescript
export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-2_UvmWSCB4i',
      userPoolClientId: '2rio311lk9im8593n2ll0teh5r',
      region: 'us-east-2',
    }
  },
  API: {
    REST: {
      'sunat-api': {
        endpoint: 'https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev',
        region: 'us-east-2',
      }
    }
  }
};
```

## Instalación

```bash
cd sunat-facturacion/admin-frontend
npm install
```

## Desarrollo

```bash
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Construcción para Producción

```bash
npm run build
```

Genera los archivos optimizados en la carpeta `build/`.

## Estructura del Proyecto

```
src/
├── components/          # Componentes reutilizables
│   └── Layout.tsx      # Layout principal con navegación
├── pages/              # Páginas de la aplicación
│   ├── Login.tsx       # Página de inicio de sesión
│   ├── Dashboard.tsx   # Dashboard principal
│   ├── Empresas.tsx    # Gestión de empresas
│   ├── Certificados.tsx # Gestión de certificados
│   └── Comprobantes.tsx # Búsqueda de comprobantes
├── services/           # Servicios de API
│   └── api.ts         # Cliente de API REST
├── aws-config.ts      # Configuración de AWS
├── theme.ts           # Tema de Material-UI
└── App.tsx            # Componente principal
```

## Funcionalidades

### Gestión de Empresas
- Listar empresas registradas
- Registrar nuevas empresas
- Ver detalles de empresas
- Actualizar información de empresas

### Gestión de Certificados
- Cargar certificados digitales (PFX/P12)
- Consultar estado de certificados
- Ver fechas de vencimiento

### Comprobantes Electrónicos
- Búsqueda avanzada con múltiples filtros:
  - RUC de empresa
  - Tipo de comprobante (Factura/Boleta)
  - Número de documento del receptor
  - Nombre/Razón social
  - Estado (Pendiente/Enviado/Aceptado/Rechazado)
  - Rango de fechas
- Descargar PDF de comprobantes
- Actualizar estado de comprobantes
- Control de acceso por empresa

## Autenticación

El sistema utiliza AWS Cognito para la autenticación. Los usuarios deben ser creados en el User Pool configurado.

Para crear usuarios de prueba, usa la consola de AWS Cognito o el CLI:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-2_UvmWSCB4i \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com \
  --temporary-password TempPassword123! \
  --region us-east-2
```

## Despliegue

### Opción 1: S3 + CloudFront

```bash
npm run build
aws s3 sync build/ s3://your-bucket-name
```

### Opción 2: Amplify Hosting

```bash
amplify init
amplify add hosting
amplify publish
```

### Opción 3: Vercel/Netlify

Conecta tu repositorio y configura las variables de entorno necesarias.

## Soporte

Para más información sobre el backend, consulta:
- [API Documentation](../API_DOCUMENTATION.md)
- [Deployment Guide](../DEPLOYMENT.md)
- [Dev Access Guide](../DEV_ACCESS.md)
