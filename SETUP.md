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

## 9 · Cardops — proyecto Supabase "Card Ops Dash"

El tab **Cardops** vive en el mismo `index.html`, pero se alimenta de un **segundo proyecto Supabase independiente** (`Card Ops Dash`, `https://imjowbxegzyzuoqftidr.supabase.co`), sin login propio: el acceso es 100% vía políticas RLS para el rol `anon` (no `authenticated` — no hay sesión de Auth contra ese proyecto).

### 9.1 · Completar el anon key en el código

En `index.html`, buscar `SB_CARDOPS` y reemplazar el placeholder:

```js
const SB_CARDOPS = createClient(
  'https://imjowbxegzyzuoqftidr.supabase.co',
  'CARDOPS_ANON_KEY_AQUI' // ← reemplazar por el anon/publishable key real
);
```

El key se obtiene en **Card Ops Dash → Settings → API Keys → anon/public**. **Nunca** usar ahí la `secret key` (bypasea RLS por completo y da acceso total a la base — solo se usa server-side, ver 9.3).

### 9.2 · Políticas RLS (rol `anon`) para las 7 tablas/vista de acceso directo

Correr en el SQL Editor del proyecto **Card Ops Dash** (repetir el bloque `CREATE POLICY` por cada tabla):

```sql
alter table atm_fees_daily      enable row level security;
alter table card_distribution   enable row level security;
alter table cashback_b2b        enable row level security;
alter table cashback_b2c        enable row level security;
alter table fx_rate             enable row level security;
alter table daily_spending      enable row level security;
alter table card_envios         enable row level security;

create policy "anon read" on atm_fees_daily      for select to anon using (true);
create policy "anon read" on card_distribution   for select to anon using (true);
create policy "anon read" on cashback_b2b        for select to anon using (true);
create policy "anon read" on cashback_b2c        for select to anon using (true);
create policy "anon read" on fx_rate             for select to anon using (true);
create policy "anon read" on daily_spending      for select to anon using (true);
create policy "anon read" on card_envios         for select to anon using (true);
```

La vista `daily_spending_view` (usada por el dashboard en vez de la tabla cruda) hereda RLS de `daily_spending` solo si se creó con `security_invoker = true`; si al probar el dashboard esa vista devuelve vacío pese a tener datos, recrearla con esa opción o agregar el mismo tipo de policy directamente sobre la vista.

**Nota de seguridad:** estas 7 tablas quedan legibles por cualquiera que tenga el anon key (que está en el HTML público). Es un desvío intencional del patrón `authenticated` que usa el resto de Payins, aceptado porque no son datos con PII — la única tabla con PII (`acceptance`) NO sigue este patrón, ver 9.3.

### 9.3 · Backend seguro para `acceptance` (tiene PII)

La tabla `acceptance` se sirve exclusivamente vía `api/acceptance.js` (función serverless de Vercel), que usa la `secret key` **solo del lado del servidor** y valida que quien pide datos tenga una sesión válida de `@getontop.com` contra el proyecto Payins antes de responder.

Configurar en **Vercel → Project Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `CARDOPS_SUPABASE_URL` | `https://imjowbxegzyzuoqftidr.supabase.co` |
| `CARDOPS_SUPABASE_SECRET_KEY` | la secret key del proyecto Card Ops Dash (Settings → API Keys → secret) |

No hace falta tocar RLS de `acceptance` para esto: la secret key la bypasea por diseño (rol de servicio). Si además se quiere una capa extra de defensa, se puede dejar RLS habilitada en `acceptance` sin ninguna policy para `anon`/`authenticated` (deniega todo acceso directo desde el browser, solo la secret key server-side puede leerla).

### 9.4 · Probar `/api/acceptance`

```bash
npm install        # instala @supabase/supabase-js para la función serverless
vercel dev          # o probar directo contra el deploy
```

Pegar `/api/acceptance` en el navegador ya logueado con una cuenta `@getontop.com` debe devolver JSON (`{"summary":{...},"rows":[...]}`), no el HTML del dashboard (confirma que el rewrite catch-all de `vercel.json` no está interceptando la ruta). Sin header `Authorization` válido debe devolver `401`.

### 9.5 · Función SQL `acceptance_summary` (obligatoria — sin esto `/api/acceptance` falla)

`acceptance` puede tener 200k+ filas en una ventana de 3 meses, y Supabase capea cada request REST a ~1000 filas sin importar el `limit`/`range` pedido. Traer todo y clasificar en el endpoint sería lento (o directamente incorrecto, si solo se toman las primeras 1000). Por eso los KPIs, el gráfico de tendencia y el top de países se calculan **dentro de la base** con esta función — el endpoint solo la llama y devuelve el resultado ya agregado.

Correr en el SQL Editor del proyecto **Card Ops Dash**:

```sql
create or replace function acceptance_summary(from_date timestamptz, to_date timestamptz)
returns table (
  total_txns bigint,
  accepted_txns bigint,
  declined_txns bigint,
  declined_by_rules_txns bigint,
  total_volume numeric,
  daily jsonb,
  top_countries jsonb
)
language sql
stable
as $$
  with dedup as (
    -- Una transacción puede tener varias filas/mensajes (ej. reversas) — nos quedamos
    -- con la más reciente por threddtransactionid, igual que hace el frontend.
    -- Se excluye msgtype='Inquiry' (consultas de saldo, no son compras) — confirmado
    -- que meses con proporción alta de Inquiry (ej. octubre 2025, ~15% vs ~5% típico)
    -- distorsionaban fuerte el % de declined_by_rules.
    select distinct on (threddtransactionid)
      threddtransactionid,
      coalesce(eventtime, localdatetime) as tx_time,
      msgstatusreason,
      outputtag,
      amount_billingvalue,
      merchantcountry
    from acceptance
    where localdatetime >= from_date and localdatetime <= to_date
      and threddtransactionid is not null
      and msgtype <> 'Inquiry'
    order by threddtransactionid, coalesce(eventtime, localdatetime) desc
  ),
  classified as (
    -- Misma fórmula de negocio que classifyAcceptance() en index.html:
    -- 1) msgstatusreason contiene "declined" → declined
    -- 2) si no, y outputtag = "decline" → declined_by_rules
    -- 3) si no → accepted
    -- Ojo: el valor real en la tabla es "Decline" (sin la "d" final), no "Declined"
    -- — confirmado sobre 2000+ filas reales, los únicos valores de outputtag son
    -- "Approved" y "Decline".
    select
      *,
      case
        when lower(coalesce(msgstatusreason,'')) like '%declined%' then 'declined'
        when lower(coalesce(outputtag,'')) = 'decline' then 'declined_by_rules'
        else 'accepted'
      end as status
    from dedup
  ),
  daily_agg as (
    select to_char(tx_time,'YYYY-MM-DD') as day, status, count(*) as cnt
    from classified
    group by 1,2
  ),
  country_agg as (
    select merchantcountry, sum(amount_billingvalue) as vol
    from classified
    group by merchantcountry
    order by sum(amount_billingvalue) desc
    limit 10
  )
  select
    count(*)::bigint,
    count(*) filter (where status='accepted')::bigint,
    count(*) filter (where status='declined')::bigint,
    count(*) filter (where status='declined_by_rules')::bigint,
    coalesce(sum(amount_billingvalue),0),
    (select jsonb_agg(jsonb_build_object('day',day,'status',status,'cnt',cnt)) from daily_agg),
    (select jsonb_agg(jsonb_build_object('country',merchantcountry,'volume',vol)) from country_agg)
  from classified;
$$;
```

**Nota sobre validación cruzada (2026-07-02):** se comparó mes a mes contra el dashboard de referencia de la empresa. Diciembre 2025 matchea exacto (95,9/3,4/0,7). Excluir `Inquiry` corrigió el caso más grande (octubre 2025, que tenía ~15% de mensajes Inquiry vs ~5% típico). Queda un desvío chico sin explicar (~0,5-0,9 puntos porcentuales) en meses de alto volumen como junio 2026 — se probó filtrar por `direction='outbound'` y por `transactiontype='00'` y ninguno de los dos lo explica. Si en algún momento se identifica el filtro exacto que usa el dashboard de referencia, ajustar acá y en `classifyAcceptance()` de `index.html`.

No hace falta `grant execute ... to anon` — la función solo se llama server-side desde `api/acceptance.js` usando la secret key (rol de servicio, bypasea grants). Si en algún momento cambia la fórmula de negocio de accepted/declined/declined_by_rules, hay que actualizarla en **dos lugares**: esta función SQL y `classifyAcceptance()` en `index.html` (esta última se usa para clasificar la muestra de transacciones recientes que sí viaja al browser para la tabla de detalle).

---

*Última actualización: 2026-07-02.*
