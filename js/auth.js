// ============================================================
// AUTH UTILITIES — compartido por todas las páginas
// ============================================================

async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function getPerfil(userId) {
  const { data, error } = await sb
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

// Guarda en Supabase la sesión actual y devuelve el perfil
async function getSessionAndPerfil() {
  const session = await getSession();
  if (!session) return { session: null, perfil: null };
  const perfil = await getPerfil(session.user.id);
  return { session, perfil };
}

// Redirige según rol. Llamar desde index.html después de login.
async function redirectByRole() {
  const { session, perfil } = await getSessionAndPerfil();
  if (!session) return;

  if (!perfil) {
    // El perfil no existe aún (puede pasar milisegundos después del OAuth)
    // Crear perfil mínimo y reintentar
    await sb.from('perfiles').upsert({
      id: session.user.id,
      email: session.user.email,
      nombre_completo: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
      rol: 'operador',
      aprobado: false
    }, { onConflict: 'id', ignoreDuplicates: true });
    // Reintentar
    const p = await getPerfil(session.user.id);
    if (!p) return;
    doRedirect(p);
    return;
  }
  doRedirect(perfil);
}

function doRedirect(perfil) {
  if (perfil.rol === 'admin') {
    window.location.href = 'admin.html';
  } else if (perfil.aprobado) {
    window.location.href = 'operador.html';
  } else {
    window.location.href = 'pendiente.html';
  }
}

// Guard para páginas de operador — redirige si no hay sesión o no aprobado
async function requireOperador() {
  const { session, perfil } = await getSessionAndPerfil();
  if (!session) { window.location.href = 'index.html'; return null; }
  if (!perfil || (!perfil.aprobado && perfil.rol !== 'admin')) {
    window.location.href = 'pendiente.html'; return null;
  }
  return { session, perfil };
}

// Guard para páginas de admin
async function requireAdmin() {
  const { session, perfil } = await getSessionAndPerfil();
  if (!session) { window.location.href = 'index.html'; return null; }
  if (!perfil || perfil.rol !== 'admin') { window.location.href = 'index.html'; return null; }
  return { session, perfil };
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

// Formato HH:MM desde Date o timestamptz string
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// Formato fecha corta
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Diferencia en horas entre dos timestamps
function diffHours(inicio, fin) {
  if (!inicio || !fin) return 0;
  return Math.max(0, (new Date(fin) - new Date(inicio)) / 3600000);
}

// Semana actual (lunes–sábado)
function semanaActual() {
  const hoy = new Date();
  const dia = hoy.getDay(); // 0=dom, 1=lun ... 6=sab
  const diff = dia === 0 ? -6 : 1 - dia; // lunes de esta semana
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diff);
  lunes.setHours(0, 0, 0, 0);
  const sabado = new Date(lunes);
  sabado.setDate(lunes.getDate() + 5);
  sabado.setHours(23, 59, 59, 999);
  return {
    inicio: lunes.toISOString().split('T')[0],
    fin: sabado.toISOString().split('T')[0]
  };
}

// Mostrar toast message
function toast(msg, tipo = 'info') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast toast-${tipo} show`;
  setTimeout(() => t.className = 'toast', 3000);
}
