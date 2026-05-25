# Payins Dashboard — Deployment Guide

> **Stack:** Single-file HTML · Supabase Auth (Google OAuth) · Supabase Realtime · Vercel static hosting

---

## 1 · Renombrar el archivo

```
dashboard.html  →  index.html
```

Vercel sirve `index.html` como raíz automáticamente.

---

## 2 · Supabase — Habilitar Google Auth

1. [supabase.com/dashboard](https://supabase.com/dashboard) → tu proyecto → **Authentication → Providers**
2. Habilitar **Google**
3. Pegar el **Client ID** y **Client Secret** de Google Cloud Console (paso 3)
4. **Authentication → URL Configuration**:
   - **Site URL:** `https://<tu-dominio>.vercel.app`  *(actualizar después del primer deploy)*
   - **Redirect URLs** → Agregar:
     - `http://localhost:*`
     - `https://<tu-dominio>.vercel.app/**`

---

## 3 · Google Cloud Console — Credenciales OAuth

1. [console.cloud.google.com](https://console.cloud.google.com) → seleccionar o crear proyecto
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (o Internal si tienes Google Workspace)
   - App name: `Payins Dashboard`
   - Authorized domain: `supabase.co`
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins:**
     - `https://nxggmbqozaziketgkktj.supabase.co`
   - **Authorized redirect URIs:**
     - `https://nxggmbqozaziketgkktj.supabase.co/auth/v1/callback`
4. Copiar **Client ID** y **Client Secret** → pegar en Supabase (paso 2)

---

## 4 · Supabase — Habilitar Realtime

1. **Database → Replication → Supabase Realtime**
2. Habilitar replicación para las tablas:
   - `payment_approval_times`
   - `consolidated`
3. Asegurarse de que RLS permita `SELECT` a usuarios autenticados:

```sql
-- payment_approval_times
CREATE POLICY "Authenticated read" ON payment_approval_times
  FOR SELECT USING (auth.role() = 'authenticated');

-- consolidated
CREATE POLICY "Authenticated read" ON consolidated
  FOR SELECT USING (auth.role() = 'authenticated');
```

---

## 5 · GitHub — Subir el proyecto

```bash
# Desde la carpeta del proyecto (después de renombrar a index.html)
git init
git add index.html vercel.json
git commit -m "Payins Dashboard — initial deploy"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

---

## 6 · Vercel — Import & Deploy

1. [vercel.com/new](https://vercel.com/new)
2. **Import Git Repository** → seleccionar tu repo de GitHub
3. Framework preset: **Other** (dejar en blanco)
4. Root directory: `/` (por defecto)
5. Click **Deploy**
6. Tu app estará en `https://<proyecto>.vercel.app`

---

## 7 · Post-deploy — Actualizar URLs en Supabase

Después de que Vercel te dé la URL final, volver a **Supabase → Authentication → URL Configuration**:

- Actualizar **Site URL** a `https://<proyecto>.vercel.app`
- Agregar `https://<proyecto>.vercel.app/**` en **Redirect URLs**

---

## 8 · Dominio personalizado (opcional)

Vercel → tu proyecto → **Settings → Domains** → agregar `payins.getontop.com`.  
Luego actualizar Supabase Redirect URLs para incluir `https://payins.getontop.com/**`.

---

## Control de acceso

| Capa | Mecanismo |
|---|---|
| UX hint | `hd: 'getontop.com'` en Google OAuth → pre-selecciona la cuenta Ontop |
| Guard client-side | `startApp()` verifica `email.endsWith('@getontop.com')` → hace signOut si no coincide |
| Acceso a datos | RLS de Supabase solo permite usuarios `authenticated` |

---

## Desarrollo local

Abrir `index.html` directamente en el browser (no se necesita servidor).  
El cliente de Supabase funciona desde URLs `file://`.  
Para que el redirect de Google OAuth funcione desde localhost, agregar `http://localhost:*` en **Supabase Redirect URLs**.

---

*Última actualización: 2026-05-25*
