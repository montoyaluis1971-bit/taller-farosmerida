# Área de Taller — Guía de Configuración

## PASO 1 — Supabase Auth: desactivar confirmación de email

Para que los operadores puedan registrarse sin recibir un email de confirmación:

1. Ir a **supabase.com → tu proyecto → Authentication → Providers → Email**
2. Desactivar **"Confirm email"**
3. Guardar

---

## PASO 2 — Supabase Auth: habilitar Google OAuth (para admins)

1. Ir a **Authentication → Providers → Google**
2. Activar el toggle
3. Necesitas un **Client ID** y **Client Secret** de Google Cloud:
   - Ve a [console.cloud.google.com](https://console.cloud.google.com)
   - Crea un proyecto (o usa uno existente)
   - Habilita **Google Identity** API
   - Crea credenciales OAuth 2.0 → tipo "Web Application"
   - En **Authorized redirect URIs** agrega:
     `https://zsftubjexoogvmdhjleb.supabase.co/auth/v1/callback`
   - Copia el Client ID y Client Secret a Supabase
4. En Supabase, en **URL Configuration**, agrega como **Redirect URL**:
   `https://taller.farosmerida.com/index.html`

---

## PASO 3 — Hacer admins a Luis y Luis Alonso

Después de que cada uno inicie sesión con Google por primera vez en `taller.farosmerida.com`:

1. Ir a **Supabase → Table Editor → perfiles**
2. Buscar el registro con su email
3. Cambiar `rol` de `operador` a `admin` y `aprobado` a `true`

O desde **SQL Editor**:
```sql
UPDATE perfiles
SET rol = 'admin', aprobado = true
WHERE email IN ('tu-email@gmail.com', 'email-luis-alonso@gmail.com');
```

---

## PASO 4 — Configurar puntos del catálogo

1. Ingresar al admin → tab **Catálogo**
2. Asignar los puntos base a cada servicio
3. Guardar cambios

---

## PASO 5 — Publicar en GitHub Pages

### 5.1 Crear repositorio en GitHub

1. Ir a [github.com](https://github.com) → **New repository**
2. Nombre: `taller-farosmerida`
3. Público (GitHub Pages gratuito)
4. No inicializar con README

### 5.2 Subir los archivos

Desde terminal (en la carpeta `taller-app`):

```bash
cd "/Users/a100029281/Documents/Faros Mérida/taller-app"
git init
git add .
git commit -m "Área de Taller v1.0"
git remote add origin https://github.com/TU_USUARIO/taller-farosmerida.git
git push -u origin main
```

### 5.3 Activar GitHub Pages

1. En GitHub → **Settings → Pages**
2. Source: **Deploy from a branch → main → / (root)**
3. Guardar

La app quedará en: `https://TU_USUARIO.github.io/taller-farosmerida`

---

## PASO 6 — Apuntar taller.farosmerida.com

En tu proveedor de DNS (donde está registrado farosmerida.com):

1. Agrega un registro **CNAME**:
   - Host: `taller`
   - Value: `TU_USUARIO.github.io`

2. En GitHub → **Settings → Pages → Custom domain**:
   - Escribe: `taller.farosmerida.com`
   - Activa **"Enforce HTTPS"**

DNS puede tardar de 10 min a 24h en propagarse.

---

## PASO 7 — Agregar URL final a Supabase

Una vez que el dominio funcione, agrega la URL final en Supabase:
- **Authentication → URL Configuration → Site URL**: `https://taller.farosmerida.com`
- **Redirect URLs**: `https://taller.farosmerida.com/index.html`

---

## Flujo de alta de operadores

1. Admin abre `taller.farosmerida.com` → ingresa con Google
2. En tab **Operadores** → **+ Nuevo Operador**
3. Captura nombre, correo (@farosmerida.com), contraseña temporal, costo/hora y horario
4. El operador queda aprobado automáticamente
5. El operador entra en `taller.farosmerida.com` con su correo y contraseña

Alternativamente, el operador puede auto-registrarse con su correo y contraseña, y el admin lo aprueba desde la sección **Operadores → Pendientes de aprobación**.

---

## Estructura de archivos

```
taller-app/
├── index.html        ← Login
├── operador.html     ← Portal operador
├── admin.html        ← Portal administrador
├── pendiente.html    ← Pantalla de cuenta pendiente
├── css/
│   └── app.css       ← Estilos
└── js/
    ├── config.js     ← Conexión Supabase
    ├── auth.js       ← Autenticación y utilidades
    ├── operador.js   ← Lógica portal operador
    └── admin.js      ← Lógica portal admin
```
