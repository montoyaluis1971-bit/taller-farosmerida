// ============================================================
// PORTAL ADMIN — Lógica principal
// ============================================================

let ADMIN_PERFIL = null;
let TODOS_OPERADORES = [];
const DIAS_LABELS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const JORNADA_NORMAL_HRS = 7.5; // 8h - 0.5h comida

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;

  ADMIN_PERFIL = auth.perfil;
  document.getElementById('hdr-nombre').textContent = auth.perfil.nombre_completo;

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Fechas default para reportes (semana actual)
  const sw = semanaActual();
  document.getElementById('rep-desde').value = sw.inicio;
  document.getElementById('rep-hasta').value = sw.fin;

  // Cargar datos iniciales en paralelo
  await Promise.all([
    cargarDashboard(),
    cargarValidacion(),
    cargarOperadores(),
    cargarCatalogo()
  ]);
});

// ── TABS ──────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
}

// ── DASHBOARD ─────────────────────────────────────────────
async function cargarDashboard() {
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('dash-fecha-titulo').textContent =
    new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const [fichajes, tareas] = await Promise.all([
    sb.from('fichajes').select('*, perfiles(nombre_completo, costo_hora_normal, costo_hora_extra)')
      .eq('fecha', hoy),
    sb.from('tareas').select(`
      id, operador_id, puntos_capturados, puntos_aprobados, validado, hora_inicio, hora_fin,
      registros_trabajo!inner(fecha)
    `).eq('registros_trabajo.fecha', hoy)
  ]);

  const fData = fichajes.data || [];
  const tData = tareas.data   || [];

  const fichados   = fData.filter(f => f.hora_entrada).length;
  const tareasHoy  = tData.length;
  const ptsTotal   = tData.reduce((s, t) => s + (t.puntos_aprobados ?? t.puntos_capturados ?? 0), 0);
  const pendientes = tData.filter(t => !t.validado).length;

  document.getElementById('dash-fichados').textContent   = fichados;
  document.getElementById('dash-tareas-hoy').textContent = tareasHoy;
  document.getElementById('dash-pts-hoy').textContent    = ptsTotal.toFixed(0);
  document.getElementById('dash-pendientes').textContent = pendientes;

  // Badge en tab validación
  const badge = document.getElementById('badge-pendientes');
  if (pendientes > 0) {
    badge.textContent = pendientes;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Tabla de operadores
  const tbody = document.getElementById('dash-tabla-body');
  if (fData.length === 0 && tData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center muted" style="padding:2rem">Sin actividad registrada hoy</td></tr>';
    return;
  }

  // Agrupar tareas por operador
  const porOp = {};
  tData.forEach(t => {
    if (!porOp[t.operador_id]) porOp[t.operador_id] = { tareas: 0, pts: 0 };
    porOp[t.operador_id].tareas++;
    porOp[t.operador_id].pts += (t.puntos_aprobados ?? t.puntos_capturados ?? 0);
  });

  tbody.innerHTML = fData.map(f => {
    const horas     = f.hora_entrada ? diffHours(f.hora_entrada, f.hora_salida || new Date().toISOString()) : 0;
    const horasN    = Math.min(horas, JORNADA_NORMAL_HRS);
    const horasE    = Math.max(0, horas - JORNADA_NORMAL_HRS);
    const cnorm     = f.perfiles?.costo_hora_normal || 0;
    const cextra    = f.perfiles?.costo_hora_extra  || 0;
    const costo     = horasN * cnorm + horasE * cextra;
    const opData    = porOp[f.operador_id] || { tareas: 0, pts: 0 };
    const extraBadge = horasE > 0 ? `<span class="badge badge-extra">${horasE.toFixed(1)}h extra</span>` : '';

    return `<tr>
      <td><strong>${f.perfiles?.nombre_completo || '—'}</strong></td>
      <td>${fmtTime(f.hora_entrada)}</td>
      <td>${fmtTime(f.hora_salida)}</td>
      <td>${horas.toFixed(1)}h ${extraBadge}</td>
      <td>${horasE > 0 ? horasE.toFixed(1) + 'h' : '—'}</td>
      <td>${opData.tareas}</td>
      <td>${opData.pts.toFixed(0)}</td>
      <td>$${costo.toFixed(0)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="text-center muted" style="padding:2rem">Sin fichajes hoy</td></tr>';
}

// ── VALIDACIÓN DE TAREAS ──────────────────────────────────
async function cargarValidacion() {
  const { data, error } = await sb
    .from('tareas')
    .select(`
      id, puntos_capturados, puntos_aprobados, validado, hora_inicio, hora_fin,
      perfiles(nombre_completo),
      registros_trabajo(fecha, vehiculos(marca_modelo, placa_ultimos4)),
      catalogo_servicios(nombre)
    `)
    .eq('validado', false)
    .order('hora_inicio', { ascending: false });

  const el = document.getElementById('validacion-content');

  if (!data || data.length === 0) {
    el.innerHTML = '<div class="alert alert-success">Todas las tareas están validadas.</div>';
    return;
  }

  el.innerHTML = `
    <div class="flex-between mb-2">
      <span class="muted">${data.length} tarea(s) pendiente(s)</span>
      <button class="btn btn-success btn-sm" onclick="validarTodas()">Aprobar todas</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Operador</th>
              <th>Vehículo</th>
              <th>Servicio</th>
              <th>Hora</th>
              <th>Pts capturados</th>
              <th>Pts aprobados</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(t => {
              const reg = t.registros_trabajo;
              const veh = reg?.vehiculos;
              return `<tr id="tarea-row-${t.id}">
                <td>${fmtDate(reg?.fecha)}</td>
                <td>${t.perfiles?.nombre_completo || '—'}</td>
                <td>${veh ? veh.marca_modelo + ' ' + veh.placa_ultimos4 : '—'}</td>
                <td>${t.catalogo_servicios?.nombre || '—'}</td>
                <td>${fmtTime(t.hora_inicio)}${t.hora_fin ? '–'+fmtTime(t.hora_fin):''}</td>
                <td><strong>${t.puntos_capturados}</strong></td>
                <td>
                  <input type="number" class="form-control" style="width:80px;padding:.3rem .5rem;"
                    id="pts-aprobados-${t.id}" value="${t.puntos_capturados}" min="0" step="0.5">
                </td>
                <td>
                  <button class="btn btn-success btn-sm" onclick="validarTarea(${t.id})">Aprobar</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function validarTarea(tareaId) {
  const input = document.getElementById(`pts-aprobados-${tareaId}`);
  const pts = parseFloat(input?.value || 0);

  const { error } = await sb.from('tareas').update({
    puntos_aprobados: pts,
    validado: true,
    validado_por: ADMIN_PERFIL.id,
    validado_at: new Date().toISOString()
  }).eq('id', tareaId);

  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const row = document.getElementById(`tarea-row-${tareaId}`);
  if (row) row.remove();
  toast('Tarea aprobada', 'success');
  actualizarBadgePendientes();
}

async function validarTodas() {
  const inputs = document.querySelectorAll('[id^="pts-aprobados-"]');
  if (inputs.length === 0) return;

  const updates = Array.from(inputs).map(inp => {
    const tareaId = parseInt(inp.id.replace('pts-aprobados-', ''));
    return sb.from('tareas').update({
      puntos_aprobados: parseFloat(inp.value || 0),
      validado: true,
      validado_por: ADMIN_PERFIL.id,
      validado_at: new Date().toISOString()
    }).eq('id', tareaId);
  });

  await Promise.all(updates);
  toast(`${updates.length} tareas aprobadas`, 'success');
  await cargarValidacion();
  actualizarBadgePendientes();
}

async function actualizarBadgePendientes() {
  const { count } = await sb.from('tareas').select('id', { count: 'exact' }).eq('validado', false);
  const badge = document.getElementById('badge-pendientes');
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

// ── OPERADORES ────────────────────────────────────────────
async function cargarOperadores() {
  const { data } = await sb
    .from('perfiles')
    .select('*, horarios_operadores(*)')
    .eq('rol', 'operador')
    .order('nombre_completo');

  TODOS_OPERADORES = data || [];

  // Rellenar selector de reportes
  const sel = document.getElementById('rep-operador');
  sel.innerHTML = '<option value="">Todos</option>' +
    TODOS_OPERADORES.map(o => `<option value="${o.id}">${o.nombre_completo}</option>`).join('');

  // Separar pendientes y aprobados
  const pendientes = TODOS_OPERADORES.filter(o => !o.aprobado);
  const aprobados  = TODOS_OPERADORES.filter(o => o.aprobado);

  // Pendientes de aprobación
  const secPendientes = document.getElementById('pendientes-aprobacion');
  const listaPendientes = document.getElementById('lista-pendientes');
  if (pendientes.length > 0) {
    secPendientes.classList.remove('hidden');
    listaPendientes.innerHTML = pendientes.map(o => `
      <div class="operador-card mb-1">
        <div class="operador-avatar">${o.nombre_completo[0].toUpperCase()}</div>
        <div class="operador-info">
          <div class="name">${o.nombre_completo}</div>
          <div class="email">${o.email}</div>
        </div>
        <div class="operador-actions">
          <button class="btn btn-success btn-sm" onclick="aprobarOperador('${o.id}')">Aprobar</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarOperador('${o.id}', '${o.nombre_completo}')">Rechazar</button>
        </div>
      </div>
    `).join('');
  } else {
    secPendientes.classList.add('hidden');
  }

  // Lista de operadores aprobados
  const listaEl = document.getElementById('lista-operadores');
  if (aprobados.length === 0) {
    listaEl.innerHTML = '<div class="muted">Sin operadores registrados aún.</div>';
    return;
  }

  listaEl.innerHTML = aprobados.map(o => {
    const horarioBadges = (o.horarios_operadores || []).map(h =>
      `<span class="badge badge-primary">${DIAS_LABELS[h.dia_semana]} ${h.hora_entrada.slice(0,5)}-${h.hora_salida.slice(0,5)}</span>`
    ).join(' ');

    return `<div class="operador-card mb-1">
      <div class="operador-avatar">${o.nombre_completo[0].toUpperCase()}</div>
      <div class="operador-info" style="flex:2">
        <div class="name">${o.nombre_completo} ${!o.activo ? '<span class="badge badge-danger">Inactivo</span>' : ''}</div>
        <div class="email">${o.email}</div>
        <div style="margin-top:.25rem;display:flex;gap:.25rem;flex-wrap:wrap;">${horarioBadges || '<span class="muted" style="font-size:.78rem">Sin horario</span>'}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem;">
          $${o.costo_hora_normal}/h normal · $${o.costo_hora_extra}/h extra
        </div>
      </div>
      <div class="operador-actions">
        <button class="btn btn-ghost btn-sm" onclick="abrirModalEditarOperador('${o.id}')">Editar</button>
        <button class="btn btn-${o.activo ? 'warning' : 'success'} btn-sm"
          onclick="toggleActivoOperador('${o.id}', ${o.activo})">
          ${o.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>`;
  }).join('');
}

async function aprobarOperador(id) {
  const { error } = await sb.from('perfiles').update({ aprobado: true }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Operador aprobado', 'success');
  await cargarOperadores();
}

async function toggleActivoOperador(id, actual) {
  const { error } = await sb.from('perfiles').update({ activo: !actual }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(actual ? 'Operador desactivado' : 'Operador activado', 'success');
  await cargarOperadores();
}

async function eliminarOperador(id, nombre) {
  if (!confirm(`¿Rechazar/eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
  // Solo eliminamos el perfil; el usuario de auth queda (sin perfil no puede hacer nada)
  const { error } = await sb.from('perfiles').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Cuenta rechazada', 'success');
  await cargarOperadores();
}

// ── MODAL OPERADOR ────────────────────────────────────────
function abrirModalNuevoOperador() {
  document.getElementById('modal-op-titulo').textContent = 'Nuevo Operador';
  document.getElementById('op-id').value = '';
  document.getElementById('op-nombre').value = '';
  document.getElementById('op-email').value = '';
  document.getElementById('op-password').value = '';
  document.getElementById('op-costo-normal').value = 0;
  document.getElementById('op-costo-extra').value  = 0;
  document.getElementById('grp-password').classList.remove('hidden');
  renderHorarioEditor([]);
  document.getElementById('modal-operador').classList.remove('hidden');
  document.getElementById('form-operador').onsubmit = submitNuevoOperador;
}

async function abrirModalEditarOperador(id) {
  const op = TODOS_OPERADORES.find(o => o.id === id);
  if (!op) return;

  document.getElementById('modal-op-titulo').textContent = 'Editar Operador';
  document.getElementById('op-id').value    = op.id;
  document.getElementById('op-nombre').value = op.nombre_completo;
  document.getElementById('op-email').value  = op.email;
  document.getElementById('op-costo-normal').value = op.costo_hora_normal;
  document.getElementById('op-costo-extra').value  = op.costo_hora_extra;
  document.getElementById('grp-password').classList.add('hidden'); // No cambiar password desde aquí
  renderHorarioEditor(op.horarios_operadores || []);
  document.getElementById('modal-operador').classList.remove('hidden');
  document.getElementById('form-operador').onsubmit = (e) => submitEditarOperador(e, id);
}

function cerrarModalOperador() {
  document.getElementById('modal-operador').classList.add('hidden');
}

function renderHorarioEditor(horarios) {
  const horariosMap = {};
  horarios.forEach(h => { horariosMap[h.dia_semana] = h; });

  document.getElementById('horario-editor').innerHTML = [1,2,3,4,5,6].map(d => {
    const h = horariosMap[d];
    const checked = h ? 'checked' : '';
    const entrada = h?.hora_entrada?.slice(0,5) || '08:00';
    const salida  = h?.hora_salida?.slice(0,5)  || '16:00';
    return `<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:.4rem;width:50px;cursor:pointer;">
        <input type="checkbox" name="dia" value="${d}" ${checked}
          onchange="toggleDiaHorario(this,${d})">
        <span style="font-weight:600;font-size:.88rem">${DIAS_LABELS[d]}</span>
      </label>
      <div id="horario-dia-${d}" style="display:flex;gap:.4rem;${!h?'opacity:.4;pointer-events:none':''}">
        <input class="form-control" type="time" id="entrada-${d}" value="${entrada}" style="width:100px">
        <span style="align-self:center;color:var(--muted)">–</span>
        <input class="form-control" type="time" id="salida-${d}"  value="${salida}"  style="width:100px">
      </div>
    </div>`;
  }).join('');
}

function toggleDiaHorario(cb, dia) {
  const wrap = document.getElementById(`horario-dia-${dia}`);
  wrap.style.opacity = cb.checked ? '1' : '.4';
  wrap.style.pointerEvents = cb.checked ? 'auto' : 'none';
}

async function submitNuevoOperador(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-op-submit');
  btn.disabled = true;

  const nombre   = document.getElementById('op-nombre').value.trim();
  const email    = document.getElementById('op-email').value.trim();
  const password = document.getElementById('op-password').value;

  if (!email || !password) {
    showModalMsg('error', 'El correo y la contraseña son obligatorios para cuentas nuevas.');
    btn.disabled = false; return;
  }

  // Registrar usuario en Supabase Auth
  const { data: authData, error: authErr } = await sb.auth.admin
    ? // Si hubiera cliente admin (no disponible en anon) — usar signUp como alternativa
      { data: null, error: { message: 'use_signup' } }
    : { data: null, error: { message: 'use_signup' } };

  // Usamos signUp con email+password; el admin puede aprobar después
  // Nota: requiere que la confirmación de email esté desactivada en Supabase
  const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: nombre },
      emailRedirectTo: window.location.origin + '/index.html'
    }
  });

  if (signUpErr) {
    showModalMsg('error', 'Error al crear cuenta: ' + signUpErr.message);
    btn.disabled = false; return;
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    showModalMsg('error', 'No se pudo obtener el ID del usuario. Intenta de nuevo.');
    btn.disabled = false; return;
  }

  // Actualizar perfil y aprobar directamente (admin lo crea → ya aprobado)
  await sb.from('perfiles').update({
    nombre_completo: nombre,
    aprobado: true,
    activo: true,
    costo_hora_normal: parseFloat(document.getElementById('op-costo-normal').value) || 0,
    costo_hora_extra:  parseFloat(document.getElementById('op-costo-extra').value)  || 0
  }).eq('id', userId);

  // Guardar horarios
  await guardarHorariosOperador(userId);

  toast(`Operador ${nombre} creado y aprobado`, 'success');
  cerrarModalOperador();
  await cargarOperadores();
  btn.disabled = false;
}

async function submitEditarOperador(e, id) {
  e.preventDefault();
  const btn = document.getElementById('btn-op-submit');
  btn.disabled = true;

  const nombre = document.getElementById('op-nombre').value.trim();
  const cnorm  = parseFloat(document.getElementById('op-costo-normal').value) || 0;
  const cextra = parseFloat(document.getElementById('op-costo-extra').value)  || 0;

  const { error } = await sb.from('perfiles').update({
    nombre_completo: nombre,
    costo_hora_normal: cnorm,
    costo_hora_extra: cextra
  }).eq('id', id);

  if (error) { showModalMsg('error', 'Error: ' + error.message); btn.disabled = false; return; }

  await guardarHorariosOperador(id);

  toast('Operador actualizado', 'success');
  cerrarModalOperador();
  await cargarOperadores();
  btn.disabled = false;
}

async function guardarHorariosOperador(operadorId) {
  // Borrar horarios existentes y reinsertar
  await sb.from('horarios_operadores').delete().eq('operador_id', operadorId);

  const diasChecked = document.querySelectorAll('input[name="dia"]:checked');
  if (diasChecked.length === 0) return;

  const horarios = Array.from(diasChecked).map(cb => ({
    operador_id: operadorId,
    dia_semana: parseInt(cb.value),
    hora_entrada: document.getElementById(`entrada-${cb.value}`).value,
    hora_salida:  document.getElementById(`salida-${cb.value}`).value,
    activo: true
  }));

  await sb.from('horarios_operadores').insert(horarios);
}

function showModalMsg(tipo, msg) {
  const el = document.getElementById('modal-op-msg');
  el.className = `alert alert-${tipo === 'error' ? 'danger' : 'success'}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── CATÁLOGO ──────────────────────────────────────────────
let CATALOGO_ADMIN = [];

async function cargarCatalogo() {
  const { data } = await sb
    .from('catalogo_servicios')
    .select('*')
    .order('orden');

  CATALOGO_ADMIN = data || [];

  const porCategoria = {};
  CATALOGO_ADMIN.forEach(s => {
    if (!porCategoria[s.categoria]) porCategoria[s.categoria] = [];
    porCategoria[s.categoria].push(s);
  });

  document.getElementById('catalogo-content').innerHTML = Object.entries(porCategoria).map(([cat, items]) => `
    <div class="card mb-2">
      <h3 class="card-title mb-2" style="color:var(--primary)">${cat}</h3>
      ${items.map(s => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;border-bottom:1px solid var(--border);">
          <span style="flex:1;font-size:.9rem;">${s.nombre}</span>
          <label style="font-size:.8rem;color:var(--muted);">Puntos base:</label>
          <input type="number" class="form-control" style="width:90px;padding:.35rem .5rem;"
            id="cat-pts-${s.id}" value="${s.puntos_base}" min="0" step="0.5">
          <label style="display:flex;align-items:center;gap:.3rem;cursor:pointer;">
            <input type="checkbox" id="cat-activo-${s.id}" ${s.activo ? 'checked' : ''}
              style="accent-color:var(--primary)">
            <span style="font-size:.8rem;color:var(--muted)">Activo</span>
          </label>
        </div>
      `).join('')}
    </div>
  `).join('');
}

async function guardarCatalogo() {
  const updates = CATALOGO_ADMIN.map(s => {
    const ptsEl   = document.getElementById(`cat-pts-${s.id}`);
    const actEl   = document.getElementById(`cat-activo-${s.id}`);
    if (!ptsEl) return null;
    return sb.from('catalogo_servicios').update({
      puntos_base: parseFloat(ptsEl.value) || 0,
      activo: actEl?.checked ?? true
    }).eq('id', s.id);
  }).filter(Boolean);

  await Promise.all(updates);
  toast('Catálogo guardado', 'success');
  await cargarCatalogo();
}

// ── REPORTES ──────────────────────────────────────────────
async function generarReporte() {
  const opId  = document.getElementById('rep-operador').value;
  const desde = document.getElementById('rep-desde').value;
  const hasta = document.getElementById('rep-hasta').value;

  if (!desde || !hasta) { toast('Selecciona un rango de fechas', 'warning'); return; }

  // Cargar fichajes del período
  let fichajesQ = sb.from('fichajes')
    .select('*, perfiles(nombre_completo, costo_hora_normal, costo_hora_extra)')
    .gte('fecha', desde).lte('fecha', hasta).order('fecha');
  if (opId) fichajesQ = fichajesQ.eq('operador_id', opId);
  const { data: fichajes } = await fichajesQ;

  // Cargar tareas del período
  let tareasQ = sb.from('tareas')
    .select(`
      operador_id, puntos_capturados, puntos_aprobados, validado, hora_inicio, hora_fin,
      registros_trabajo!inner(fecha)
    `)
    .gte('registros_trabajo.fecha', desde)
    .lte('registros_trabajo.fecha', hasta);
  if (opId) tareasQ = tareasQ.eq('operador_id', opId);
  const { data: tareas } = await tareasQ;

  if (!fichajes || fichajes.length === 0) {
    toast('Sin datos en el período seleccionado', 'warning'); return;
  }

  // Agrupar tareas por fecha+operador
  const tareasMap = {};
  (tareas || []).forEach(t => {
    const key = `${t.registros_trabajo?.fecha}_${t.operador_id}`;
    if (!tareasMap[key]) tareasMap[key] = { tareas: 0, pts: 0, tiempos: [] };
    tareasMap[key].tareas++;
    tareasMap[key].pts += (t.puntos_aprobados ?? t.puntos_capturados ?? 0);
    if (t.hora_inicio) tareasMap[key].tiempos.push({ ini: t.hora_inicio, fin: t.hora_fin });
  });

  let totalHNorm = 0, totalHExtra = 0, totalPts = 0, totalCNorm = 0, totalCExtra = 0;

  const filas = fichajes.map(f => {
    const horas  = f.hora_entrada ? diffHours(f.hora_entrada, f.hora_salida || f.hora_entrada) : 0;
    const hNorm  = Math.min(horas, JORNADA_NORMAL_HRS);
    const hExtra = Math.max(0, horas - JORNADA_NORMAL_HRS);
    const cnorm  = f.perfiles?.costo_hora_normal || 0;
    const cextra = f.perfiles?.costo_hora_extra  || 0;
    const cNorm  = hNorm  * cnorm;
    const cExt   = hExtra * cextra;

    const key    = `${f.fecha}_${f.operador_id}`;
    const tData  = tareasMap[key] || { tareas: 0, pts: 0, tiempos: [] };

    // Calcular tiempo muerto (tiempo entre tareas)
    const tMuerto = calcTiempoMuerto(tData.tiempos, f.hora_entrada, f.hora_salida);

    totalHNorm  += hNorm;
    totalHExtra += hExtra;
    totalPts    += tData.pts;
    totalCNorm  += cNorm;
    totalCExtra += cExt;

    return `<tr>
      <td>${fmtDate(f.fecha)}</td>
      <td>${f.perfiles?.nombre_completo || '—'}</td>
      <td>${fmtTime(f.hora_entrada)}</td>
      <td>${fmtTime(f.hora_salida)}</td>
      <td>${hNorm.toFixed(1)}h</td>
      <td>${hExtra > 0 ? '<span class="badge badge-extra">' + hExtra.toFixed(1) + 'h</span>' : '—'}</td>
      <td>${tMuerto > 0 ? tMuerto.toFixed(1) + 'h' : '—'}</td>
      <td>${tData.tareas}</td>
      <td>${tData.pts.toFixed(0)}</td>
      <td>$${(cNorm + cExt).toFixed(0)}</td>
    </tr>`;
  });

  // Totales
  const totalCosto = totalCNorm + totalCExtra;
  document.getElementById('rep-horas-norm').textContent  = totalHNorm.toFixed(1)  + 'h';
  document.getElementById('rep-horas-extra').textContent = totalHExtra.toFixed(1) + 'h';
  document.getElementById('rep-pts-total').textContent   = totalPts.toFixed(0);
  document.getElementById('rep-costo-norm').textContent  = '$' + totalCNorm.toFixed(0);
  document.getElementById('rep-costo-extra').textContent = '$' + totalCExtra.toFixed(0);
  document.getElementById('rep-costo-total').textContent = '$' + totalCosto.toFixed(0);

  document.getElementById('rep-tabla-body').innerHTML = filas.join('') +
    `<tr style="font-weight:700;border-top:2px solid var(--border)">
      <td colspan="4">TOTALES</td>
      <td>${totalHNorm.toFixed(1)}h</td>
      <td>${totalHExtra.toFixed(1)}h</td>
      <td>—</td>
      <td>—</td>
      <td>${totalPts.toFixed(0)}</td>
      <td>$${totalCosto.toFixed(0)}</td>
    </tr>`;

  document.getElementById('reporte-stats').classList.remove('hidden');
}

// Calcula horas de tiempo muerto entre tareas de una jornada
function calcTiempoMuerto(tiempos, horaEntrada, horaSalida) {
  if (!tiempos || tiempos.length === 0 || !horaEntrada) return 0;
  const jornadaHrs = diffHours(horaEntrada, horaSalida || horaEntrada);
  const trabHrs = tiempos.reduce((s, t) => s + (t.ini && t.fin ? diffHours(t.ini, t.fin) : 0), 0);
  return Math.max(0, jornadaHrs - trabHrs);
}
