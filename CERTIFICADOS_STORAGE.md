# Almacenamiento de Certificados Digitales

## Ubicación

Los certificados digitales se almacenan de forma segura en **AWS Secrets Manager** con la siguiente estructura:

```
sunat/certificados/{RUC}
```

Por ejemplo:
- `sunat/certificados/20123456789`
- `sunat/certificados/20987654321`

## Contenido del Secret

Cada secret contiene un JSON con la siguiente estructura:

```json
{
  "ruc": "20123456789",
  "archivo": "base64_encoded_certificate_data",
  "password": "encrypted:password_del_certificado",
  "fechaEmision": "2024-01-15T00:00:00.000Z",
  "fechaVencimiento": "2026-01-15T00:00:00.000Z",
  "emisor": "Entidad Certificadora"
}
```

## Campos

- **ruc**: RUC de la empresa propietaria del certificado
- **archivo**: Contenido del archivo .pfx/.p12 codificado en base64
- **password**: Contraseña del certificado (encriptada con prefijo "encrypted:")
- **fechaEmision**: Fecha de emisión del certificado
- **fechaVencimiento**: Fecha de vencimiento del certificado
- **emisor**: Nombre de la entidad certificadora

## Seguridad

1. **Encriptación en reposo**: AWS Secrets Manager encripta automáticamente todos los secrets usando AWS KMS
2. **Encriptación de contraseña**: La contraseña del certificado se encripta antes de almacenarla
3. **Control de acceso**: Solo las funciones Lambda con los permisos IAM correctos pueden acceder a los secrets
4. **Auditoría**: Todos los accesos a Secrets Manager quedan registrados en CloudTrail

## Permisos IAM Requeridos

Las funciones Lambda tienen los siguientes permisos configurados en `serverless.yml`:

```yaml
- Effect: Allow
  Action:
    - secretsmanager:GetSecretValue
    - secretsmanager:PutSecretValue
    - secretsmanager:CreateSecret
    - secretsmanager:UpdateSecret
  Resource:
    - !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:sunat/*'
```

## Flujo de Carga

1. Usuario selecciona empresa y archivo .pfx/.p12
2. Frontend convierte el archivo a base64
3. Backend recibe el certificado y valida:
   - Formato del archivo
   - Contraseña correcta
   - Certificado no vencido
   - RUC coincide con la empresa
4. Backend extrae información del certificado
5. Backend encripta la contraseña
6. Backend guarda en AWS Secrets Manager
7. Backend retorna información del certificado cargado

## Flujo de Consulta

1. Usuario selecciona empresa
2. Frontend solicita información del certificado
3. Backend consulta AWS Secrets Manager
4. Backend decodifica el certificado de base64
5. Backend retorna información (sin exponer la contraseña)
6. Frontend muestra: RUC, emisor, fechas, estado, días para vencer

## Recuperación de Certificados

Para recuperar un certificado manualmente desde AWS CLI:

```bash
aws secretsmanager get-secret-value \
  --secret-id sunat/certificados/20123456789 \
  --region us-east-2
```

## Rotación de Certificados

Cuando un certificado está próximo a vencer (30 días):

1. El sistema detecta automáticamente certificados próximos a vencer
2. Se puede consultar el endpoint `/certificados/proximos-vencer`
3. El administrador debe cargar un nuevo certificado
4. El nuevo certificado reemplaza automáticamente al anterior en Secrets Manager

## Costos

AWS Secrets Manager cobra:
- $0.40 por secret por mes
- $0.05 por cada 10,000 llamadas a la API

Para 100 empresas con certificados:
- Almacenamiento: 100 secrets × $0.40 = $40/mes
- API calls: Estimado $5-10/mes (dependiendo del uso)
- Total estimado: ~$50/mes
