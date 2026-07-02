// Endpoint seguro para la tabla `acceptance` del proyecto Supabase "Card Ops Dash".
// Esa tabla tiene PII (full_name, email, dirección) por eso NO se consulta directo
// desde el browser con un anon key — solo desde acá, server-side, con la secret key.
//
// Auth: reusa la sesión que el usuario ya tiene contra el proyecto Payins (no hace
// falta loguearse dos veces). El frontend manda el access_token de esa sesión en el
// header Authorization; acá lo validamos contra el propio Supabase Auth de Payins.
const { createClient } = require('@supabase/supabase-js');

const PAYINS_URL = 'https://nxggmbqozaziketgkktj.supabase.co';
// Anon key de Payins — ya está público en index.html, no es un secreto, solo se
// reusa acá para poder llamar a /auth/v1/user y validar el token del usuario.
const PAYINS_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Z2dtYnFvemF6aWtldGdra3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDEwNDMsImV4cCI6MjA5MTc3NzA0M30.CI9YX7ztFvxgCg1gsTCcJAtLS5F4tDxo1a-_zdWpC_Y';

const ALLOWED_DOMAIN = '@getontop.com';
// La tabla puede tener 200k+ filas en una ventana de 3 meses, y Supabase capea
// cada request a ~1000 filas — traer todo y clasificar acá sería lento/pesado.
// Los KPIs/gráficos usan la función SQL `acceptance_summary` (agrega en la base).
// Esto solo trae una muestra reciente para la tabla de detalle del dashboard.
const DETAIL_LIMIT = 300;

// Columnas explícitas — nunca select('*') acá. Se excluyen a propósito las columnas
// más crudas de revisión manual (reviewcomment, triggeredrules, riskscorevaa, reviewedby):
// no hacen falta para la fórmula de negocio y son ruido para la tabla del dashboard.
const COLUMNS = [
  'threddtransactionid', 'cardid', 'cardentityid', 'localdatetime', 'eventtime',
  'msgtype', 'msgstatusreason', 'outputtag',
  'amount_billingvalue', 'amount_billingcurrency',
  'merchantcountry', 'cardproducttype', 'transactiontype', 'direction',
  'full_name', 'email'
].join(',');

async function validatePayinsUser(token) {
  if (!token) return null;
  const res = await fetch(`${PAYINS_URL}/auth/v1/user`, {
    headers: { apikey: PAYINS_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.email && user.email.endsWith(ALLOWED_DOMAIN) ? user : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await validatePayinsUser(token);
  if (!user) {
    res.status(401).json({ error: 'No autorizado. Se requiere una sesión válida de @getontop.com.' });
    return;
  }

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const from = (req.query.from || defaultFrom) + 'T00:00:00';
  const to = (req.query.to || defaultTo) + 'T23:59:59';

  if (!process.env.CARDOPS_SUPABASE_URL || !process.env.CARDOPS_SUPABASE_SECRET_KEY) {
    res.status(500).json({ error: 'Server misconfigured: faltan CARDOPS_SUPABASE_URL / CARDOPS_SUPABASE_SECRET_KEY en Vercel.' });
    return;
  }

  const sbCardops = createClient(
    process.env.CARDOPS_SUPABASE_URL,
    process.env.CARDOPS_SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } }
  );

  // Agregados (totales, % accepted/declined/declined_by_rules, serie diaria, top países)
  // calculados en la base vía la función `acceptance_summary` — ver SETUP.md sección 9.5.
  const { data: summaryRows, error: summaryErr } = await sbCardops
    .rpc('acceptance_summary', { from_date: from, to_date: to });

  if (summaryErr) {
    res.status(502).json({ error: `Supabase RPC error (acceptance_summary): ${summaryErr.message || summaryErr.code}. ¿Corriste el SQL de SETUP.md sección 9.5?` });
    return;
  }

  // Muestra acotada de transacciones recientes, solo para la tabla de detalle del dashboard.
  const { data: rows, error: rowsErr } = await sbCardops
    .from('acceptance')
    .select(COLUMNS)
    .gte('localdatetime', from)
    .lte('localdatetime', to)
    // nullsFirst:false es necesario: en Postgres los NULL van primero en orden
    // descendente por default, así que sin esto la "muestra reciente" traería puras
    // filas con localdatetime nulo en vez de las transacciones más nuevas.
    .order('localdatetime', { ascending: false, nullsFirst: false })
    .limit(DETAIL_LIMIT);

  if (rowsErr) {
    res.status(502).json({ error: `Supabase error: ${rowsErr.message || rowsErr.code}` });
    return;
  }

  res.status(200).json({
    summary: (summaryRows && summaryRows[0]) || null,
    rows: rows || [],
    from, to
  });
};
