// ============================================================
// AUTH UTILITIES — compartido por todas las páginas
// ============================================================

// ============================================================
// AUTH UTILITIES — compartido por todas las páginas
// ============================================================

// Obtiene la sesión actual. Si hay access_token en el hash,
// espera SOLO al evento SIGNED_IN con sesión válida (no INITIAL_SESSION que llega con null).
async function resolveSession() {
  if (window.location.hash.includes('access_token')) {
    return new Promise((resolve) => {
      const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
        // INITIAL_SESSION puede llegar con null antes de que Supabase procese el hash.
        // Solo resolvemos cuando tenemos una sesión real.
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          subscription.unsubscribe();
          history.replaceState(null, '', window.location.pathname);
          resolve(session);
        }
      });
      // Fallback: si tras 8s no llega sesión, seguimos sin ella
      setTimeout(() => { subscription.unsubscribe(); resolve(null); }, 8000);
    });
  }
  const { data: { session } } = await sb.auth.getSession();
  return session || null;
}

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

// Redirige según rol. Llamar desde index.html después de login.
async function redirectByRole() {
  const session = await resolveSession();
  if (!session) return;

  let perfil = await getPerfil(session.user.id);

  if (!perfil) {
    // Crear perfil mínimo si el trigger aún no corrió
    await sb.from('perfiles').upsert({
      id: session.user.id,
      email: session.user.email,
      nombre_completo: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
      rol: 'operador',
      aprobado: false
    }, { onConflict: 'id', ignoreDuplicates: true });
    perfil = await getPerfil(session.user.id);
    if (!perfil) return;
  }
  doRedirect(perfil);
}

function doRedirect(perfil) {
  if (perfil.rol === 'admin') {
    window.location.replace('admin.html');
  } else if (perfil.aprobado) {
    window.location.replace('operador.html');
  } else {
    window.location.replace('pendiente.html');
  }
}

// Guard para páginas de operador
async function requireOperador() {
  const session = await resolveSession();
  if (!session) { window.location.replace('index.html'); return null; }
  const perfil = await getPerfil(session.user.id);
  if (!perfil || (!perfil.aprobado && perfil.rol !== 'admin')) {
    window.location.replace('pendiente.html'); return null;
  }
  return { session, perfil };
}

// Guard para páginas de admin
async function requireAdmin() {
  const session = await resolveSession();
  if (!session) { window.location.replace('index.html'); return null; }
  const perfil = await getPerfil(session.user.id);
  if (!perfil || perfil.rol !== 'admin') { window.location.replace('index.html'); return null; }
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
