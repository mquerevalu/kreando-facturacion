# Crear Usuario en AWS Cognito

Para poder iniciar sesión en el Admin Frontend, necesitas crear un usuario en AWS Cognito.

## Opción 1: Usando AWS CLI

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-2_UvmWSCB4i \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com \
  --temporary-password TempPassword123! \
  --region us-east-2
```

Reemplaza:
- `admin@example.com` con el email del usuario
- `TempPassword123!` con una contraseña temporal

## Opción 2: Usando la Consola de AWS

1. Ve a la consola de AWS Cognito: https://console.aws.amazon.com/cognito/
2. Selecciona la región **us-east-2 (Ohio)**
3. Haz clic en **User Pools**
4. Selecciona el User Pool: `us-east-2_UvmWSCB4i`
5. Ve a la pestaña **Users**
6. Haz clic en **Create user**
7. Completa el formulario:
   - **Username**: El email del usuario (ej: admin@example.com)
   - **Email**: El mismo email
   - **Temporary password**: Una contraseña temporal (ej: TempPassword123!)
   - Marca **Send an email invitation** si quieres que el usuario reciba un email
8. Haz clic en **Create user**

## Primer Inicio de Sesión

1. Abre el frontend en http://localhost:3000
2. Ingresa el username (email) y la contraseña temporal
3. El sistema te pedirá cambiar la contraseña
4. Ingresa una nueva contraseña que cumpla con los requisitos:
   - Mínimo 8 caracteres
   - Al menos una letra mayúscula
   - Al menos una letra minúscula
   - Al menos un número
   - Al menos un carácter especial

## Verificar Usuario Creado

```bash
aws cognito-idp list-users \
  --user-pool-id us-east-2_UvmWSCB4i \
  --region us-east-2
```

## Eliminar Usuario (si es necesario)

```bash
aws cognito-idp admin-delete-user \
  --user-pool-id us-east-2_UvmWSCB4i \
  --username admin@example.com \
  --region us-east-2
```

## Resetear Contraseña

Si olvidas la contraseña, puedes resetearla:

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-2_UvmWSCB4i \
  --username admin@example.com \
  --password NewPassword123! \
  --permanent \
  --region us-east-2
```

## Configuración del User Pool

- **User Pool ID**: `us-east-2_UvmWSCB4i`
- **Client ID**: `2rio311lk9im8593n2ll0teh5r`
- **Region**: `us-east-2` (Ohio)

## Solución de Problemas

### Error: "User does not exist"
El usuario no ha sido creado. Verifica que el User Pool ID sea correcto y que hayas creado el usuario.

### Error: "Incorrect username or password"
Verifica que estés usando el username y contraseña correctos. Si es la primera vez, usa la contraseña temporal.

### Error: "Password does not conform to policy"
La contraseña debe cumplir con los requisitos mínimos mencionados arriba.

### Error: "User is not confirmed"
Si el usuario no está confirmado, puedes confirmarlo manualmente:

```bash
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id us-east-2_UvmWSCB4i \
  --username admin@example.com \
  --region us-east-2
```
