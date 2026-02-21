# Guía Rápida - Sistema de Facturación SUNAT

Esta guía te ayudará a empezar a usar el sistema en menos de 10 minutos.

## 🚀 Inicio Rápido (Desarrollo Local)

### 1. Instalación (2 minutos)

```bash
# Clonar repositorio
git clone <repository-url>
cd sunat-facturacion

# Instalar dependencias
npm install
```

### 2. Iniciar Servidor Local (1 minuto)

```bash
# Iniciar servidor de desarrollo
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

### 3. Probar el Sistema (5 minutos)

#### Paso 1: Registrar una Empresa

```bash
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

#### Paso 2: Generar una Boleta

```bash
curl -X POST http://localhost:3000/dev/comprobantes/generar \
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

¡Listo! Has generado tu primer comprobante electrónico.

---

## ☁️ Despliegue a AWS (10 minutos)

### 1. Configurar AWS (3 minutos)

```bash
# Instalar AWS CLI (si no lo tienes)
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configurar credenciales
aws configure
# AWS Access Key ID: [tu access key]
# AWS Secret Access Key: [tu secret key]
# Default region: us-east-1
# Default output format: json
```

### 2. Desplegar (5 minutos)

```bash
# Compilar código
npm run build

# Desplegar a desarrollo
npm run deploy:dev
```

Espera a que termine el despliegue. Al final verás algo como:

```
✔ Service deployed to stack sunat-facturacion-dev

endpoints:
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/dev/empresas
  GET - https://abc123.execute-api.us-east-1.amazonaws.com/dev/empresas
  ...

functions:
  empresas-handler: sunat-facturacion-dev-empresas-handler
  ...
```

### 3. Obtener API Key (2 minutos)

```bash
# Obtener la API Key
aws apigateway get-api-keys --include-values \
  --query 'items[?name==`sunat-facturacion-api-key-dev`].value' \
  --output text
```

Guarda esta API Key, la necesitarás para todas las peticiones.

### 4. Probar en AWS

```bash
# Reemplaza API_URL y API_KEY con tus valores
export API_URL="https://abc123.execute-api.us-east-1.amazonaws.com"
export API_KEY="tu-api-key-aqui"

# Registrar empresa
curl -X POST $API_URL/dev/empresas \
  -H "x-api-key: $API_KEY" \
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

---

## 📋 Flujo Completo de Facturación

### 1. Registrar Empresa (una vez)

```bash
POST /empresas
```

### 2. Cargar Certificado Digital (una vez por empresa)

```bash
curl -X POST $API_URL/dev/certificados \
  -H "x-api-key: $API_KEY" \
  -F "ruc=20123456789" \
  -F "archivo=@certificado.pfx" \
  -F "password=password123"
```

### 3. Generar Comprobante

```bash
POST /comprobantes/generar
```

### 4. Firmar Comprobante

```bash
curl -X POST $API_URL/dev/comprobantes/B001-00000001/firmar \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"empresaRuc": "20123456789"}'
```

### 5. Enviar a SUNAT

```bash
curl -X POST $API_URL/dev/comprobantes/B001-00000001/enviar \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"empresaRuc": "20123456789"}'
```

### 6. Consultar Estado

```bash
curl -X GET "$API_URL/dev/comprobantes/B001-00000001/estado?empresaRuc=20123456789" \
  -H "x-api-key: $API_KEY"
```

### 7. Descargar PDF

```bash
curl -X GET "$API_URL/dev/comprobantes/B001-00000001/pdf?empresaRuc=20123456789" \
  -H "x-api-key: $API_KEY" \
  -o comprobante.pdf
```

---

## 🧪 Ejecutar Pruebas

```bash
# Todas las pruebas
npm test

# Pruebas en modo watch
npm run test:watch

# Cobertura de código
npm run test:coverage
```

---

## 📚 Próximos Pasos

Ahora que tienes el sistema funcionando, puedes:

1. **Leer la documentación completa**:
   - [API Documentation](API_DOCUMENTATION.md)
   - [Deployment Guide](DEPLOYMENT.md)
   - [Troubleshooting Guide](TROUBLESHOOTING.md)

2. **Configurar para producción**:
   - Obtener certificados digitales de producción
   - Configurar credenciales SOL de producción
   - Desplegar a producción: `npm run deploy:prod`

3. **Integrar con tu aplicación**:
   - Usar la API REST desde tu frontend
   - Implementar webhooks para notificaciones
   - Personalizar el PDF generado

4. **Monitorear el sistema**:
   - Ver logs en CloudWatch
   - Configurar alarmas
   - Revisar métricas de uso

---

## 🆘 ¿Necesitas Ayuda?

- **Problemas comunes**: Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Documentación de API**: Ver [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Guía de despliegue**: Ver [DEPLOYMENT.md](DEPLOYMENT.md)
- **Especificaciones técnicas**: Ver `.kiro/specs/sunat/`

---

## 💡 Consejos

- **Desarrollo local**: Usa `npm run dev` para probar sin desplegar a AWS
- **Ambiente de homologación**: Usa credenciales de prueba de SUNAT (MODDATOS)
- **Logs**: Usa `npm run logs:dev -- -f nombre-funcion --tail` para ver logs en tiempo real
- **Costos**: El ambiente de desarrollo cuesta ~$10-20/mes en AWS
- **Backups**: Haz backup antes de actualizar a producción

---

## 🎯 Checklist de Producción

Antes de ir a producción, asegúrate de:

- [ ] Todas las pruebas pasan (`npm test`)
- [ ] Cobertura de código > 80% (`npm run test:coverage`)
- [ ] Certificados digitales de producción cargados
- [ ] Credenciales SOL de producción configuradas
- [ ] Endpoint de SUNAT configurado a producción
- [ ] Alarmas de CloudWatch configuradas
- [ ] Backups automáticos habilitados
- [ ] Documentación actualizada
- [ ] Equipo capacitado en el uso del sistema

---

¡Felicidades! Ya tienes el sistema de facturación electrónica funcionando. 🎉
