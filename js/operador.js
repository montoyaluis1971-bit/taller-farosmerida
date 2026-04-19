// ============================================================
// PORTAL OPERADOR — Lógica principal
// ============================================================

let PERFIL = null;
let CATALOGO = [];          // [{id, nombre, categoria, puntos_base}]
let FICHAJE_HOY = null;     // registro de fichaje del día
let TURNO_TIMER = null;     // interval para reloj del turno
let MARCAS_MODELOS = [];    // [{marca, modelo, tamano, precio_base}]
let MARCAS_UNICAS  = [];    // marcas únicas ordenadas

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireOperador();
  if (!auth) return;

  PERFIL = auth.perfil;
  document.getElementById('hdr-nombre').textContent = PERFIL.nombre_completo;

  // Fecha siempre = hoy (readonly, no permite fechas pasadas)
  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];
  const fechaEl = document.getElementById('reg-fecha');
  fechaEl.value = hoyStr;
  fechaEl.max   = hoyStr;   // tampoco fechas futuras
  fechaEl.min   = hoyStr;   // bloquea pasadas

  // Hora inicio: ahora; hora fin: max = ahora (no futuro)
  const ahoraStr = fmtTimeLocal(hoy);
  document.getElementById('reg-hora-inicio').value = ahoraStr;
  document.getElementById('reg-hora-fin').max       = ahoraStr;

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Detectar vehículo existente al cambiar placa
  document.getElementById('reg-placa4').addEventListener('input', debounce(checkSesionExistente, 600));

  // Puntos totales reactivo
  document.getElementById('services-grid').addEventListener('input', recalcPuntos);

  // Form submit
  document.getElementById('form-registro').addEventListener('submit', submitRegistro);

  // Cargar datos iniciales
  await Promise.all([
    cargarCatalogo(),
    cargarFichaje(),
    cargarHorario(),
    verSemanaActual(),
    cargarMarcasModelos()
  ]);

  iniciarRelojTurno();
});

// ── TABS ──────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
}

// ── CATÁLOGO DE SERVICIOS ─────────────────────────────────
async function cargarCatalogo() {
  const { data, error } = await sb
    .from('catalogo_servicios')
    .select('*')
    .eq('activo', true)
    .order('orden');

  if (error || !data) return;
  CATALOGO = data;
  renderServicesGrid(data);
}

function renderServicesGrid(servicios) {
  const grid = document.getElementById('services-grid');
  const porCategoria = {};
  servicios.forEach(s => {
    if (!porCategoria[s.categoria]) porCategoria[s.categoria] = [];
    porCategoria[s.categoria].push(s);
  });

  grid.innerHTML = Object.entries(porCategoria).map(([cat, items]) => `
    <div class="service-category">
      <div class="service-category-title">${cat}</div>
      ${items.map(s => `
        <label class="service-item">
          <input type="checkbox" name="servicio" value="${s.id}" data-pts="${s.puntos_base}">
          <span class="service-item-label">${s.nombre}</span>
          <input type="number" class="service-item-pts" value="${s.puntos_base}"
            min="0" step="0.5" title="Puntos" data-svc="${s.id}">
        </label>
      `).join('')}
    </div>
  `).join('');
}

function recalcPuntos() {
  let total = 0;
  document.querySelectorAll('.service-item input[type="checkbox"]:checked').forEach(cb => {
    const item = cb.closest('.service-item');
    const ptsInput = item.querySelector('.service-item-pts');
    total += parseFloat(ptsInput?.value || 0);
  });
  document.getElementById('puntos-total-val').textContent = total.toFixed(1).replace(/\.0$/, '');
}

// ── MODAL CONFIRMACIÓN ───────────────────────────────────
let _confirmCb = null;

function mostrarConfirm(icon, title, msg, okLabel, okClass, cb) {
  document.getElementById('confirm-icon').textContent  = icon;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  const btnOk = document.getElementById('btn-confirm-ok');
  btnOk.textContent = okLabel;
  btnOk.className   = 'btn ' + okClass + ' btn-block';
  btnOk.onclick     = ejecutarConfirm;
  _confirmCb = cb;
  document.getElementById('modal-confirm').classList.remove('hidden');
}

function cerrarConfirm() {
  document.getElementById('modal-confirm').classList.add('hidden');
  _confirmCb = null;
}

function ejecutarConfirm() {
  cerrarConfirm();
  if (_confirmCb) _confirmCb();
}

// ── FICHAJE ───────────────────────────────────────────────
async function cargarFichaje() {
  const hoy = new Date().toISOString().split('T')[0];
  const { data } = await sb
    .from('fichajes')
    .select('*')
    .eq('operador_id', PERFIL.id)
    .eq('fecha', hoy)
    .maybeSingle();

  FICHAJE_HOY = data;
  renderFichaje();
}

function renderFichaje() {
  const fichado = FICHAJE_HOY?.hora_entrada;
  const salida  = FICHAJE_HOY?.hora_salida;

  // Mini card en tab registro
  const miniLabel = document.getElementById('fichar-mini-label');
  const miniTime  = document.getElementById('fichar-mini-time');
  const miniBtnEl = document.getElementById('btn-fichar-mini');

  // Turno tab
  const noFichado = document.getElementById('turno-no-fichado');
  const fichData  = document.getElementById('turno-fichado');

  if (!fichado) {
    miniLabel.textContent = 'Turno no iniciado';
    miniTime.textContent  = '—';
    miniBtnEl.textContent = 'Fichar Entrada';
    miniBtnEl.className   = 'btn btn-success';
    noFichado.classList.remove('hidden');
    fichData.classList.add('hidden');
  } else if (!salida) {
    miniLabel.textContent = 'En turno desde';
    miniTime.textContent  = fmtTime(FICHAJE_HOY.hora_entrada);
    miniBtnEl.textContent = 'Fichar Salida';
    miniBtnEl.className   = 'btn btn-danger';
    noFichado.classList.add('hidden');
    fichData.classList.remove('hidden');
    document.getElementById('turno-hora-entrada').textContent = fmtTime(FICHAJE_HOY.hora_entrada);
    document.getElementById('turno-hora-salida').textContent  = '—';
  } else {
    miniLabel.textContent = 'Turno cerrado';
    miniTime.textContent  = fmtTime(FICHAJE_HOY.hora_salida);
    miniBtnEl.textContent = 'Turno cerrado';
    miniBtnEl.disabled    = true;
    noFichado.classList.add('hidden');
    fichData.classList.remove('hidden');
    document.getElementById('turno-hora-entrada').textContent = fmtTime(FICHAJE_HOY.hora_entrada);
    document.getElementById('turno-hora-salida').textContent  = fmtTime(FICHAJE_HOY.hora_salida);
    document.getElementById('turno-btn-wrap').classList.add('hidden');
    actualizarBarraHoras();
  }

  const hoy = new Date();
  document.getElementById('turno-fecha').textContent =
    hoy.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
}

function pedirConfirmFichar() {
  if (FICHAJE_HOY?.hora_salida) return; // turno cerrado, botón ya deshabilitado

  const ahora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  if (!FICHAJE_HOY?.hora_entrada) {
    mostrarConfirm('🟢', 'Fichar Entrada',
      `¿Confirmas tu entrada al taller a las ${ahora}?`,
      'Sí, fichar entrada', 'btn-success', toggleFichar);
  } else {
    mostrarConfirm('🔴', 'Fichar Salida',
      `¿Confirmas tu salida del taller a las ${ahora}?\nEsta acción no se puede modificar.`,
      'Sí, fichar salida', 'btn-danger', toggleFichar);
  }
}

async function toggleFichar() {
  const hoy = new Date().toISOString().split('T')[0];

  if (!FICHAJE_HOY?.hora_entrada) {
    // Protección: no sobreescribir si ya existe
    const { data: existing } = await sb.from('fichajes')
      .select('id').eq('operador_id', PERFIL.id).eq('fecha', hoy).maybeSingle();
    if (existing) {
      toast('Ya tienes una entrada registrada hoy.', 'error');
      await cargarFichaje(); return;
    }

    const { data, error } = await sb.from('fichajes').insert({
      operador_id: PERFIL.id,
      fecha: hoy,
      hora_entrada: new Date().toISOString(),
      es_inferido: false
    }).select().single();

    if (error) { toast('Error al fichar: ' + error.message, 'error'); return; }
    FICHAJE_HOY = data;
    toast('Entrada registrada', 'success');

  } else if (!FICHAJE_HOY?.hora_salida) {
    // Protección: no sobreescribir si ya tiene salida
    const { data: check } = await sb.from('fichajes')
      .select('hora_salida').eq('id', FICHAJE_HOY.id).single();
    if (check?.hora_salida) {
      toast('Tu salida ya fue registrada.', 'error');
      await cargarFichaje(); return;
    }

    const { data, error } = await sb.from('fichajes')
      .update({ hora_salida: new Date().toISOString() })
      .eq('id', FICHAJE_HOY.id)
      .select().single();

    if (error) { toast('Error al fichar: ' + error.message, 'error'); return; }
    FICHAJE_HOY = data;
    toast('Salida registrada', 'success');
  }

  renderFichaje();
  actualizarBarraHoras();
}

function iniciarRelojTurno() {
  if (TURNO_TIMER) clearInterval(TURNO_TIMER);
  TURNO_TIMER = setInterval(() => {
    if (FICHAJE_HOY?.hora_entrada && !FICHAJE_HOY?.hora_salida) {
      actualizarBarraHoras();
    }
  }, 60000); // actualizar cada minuto
}

function actualizarBarraHoras() {
  if (!FICHAJE_HOY?.hora_entrada) return;
  const fin = FICHAJE_HOY.hora_salida ? new Date(FICHAJE_HOY.hora_salida) : new Date();
  const horas = diffHours(FICHAJE_HOY.hora_entrada, fin.toISOString());
  const jornadaNormal = 7.5; // 8h - 0.5h comida
  const horasExtra = Math.max(0, horas - jornadaNormal);

  document.getElementById('turno-horas-trab').textContent = horas.toFixed(1) + 'h';
  document.getElementById('turno-horas-extra').textContent = horasExtra.toFixed(1) + 'h';

  const pct = Math.min(100, (horas / jornadaNormal) * 100);
  const fill = document.getElementById('bar-fill');
  fill.style.width = pct + '%';
  fill.className = 'horas-bar-fill' + (horasExtra > 0 ? ' extra' : '');
  document.getElementById('bar-pct').textContent = Math.round(pct) + '%';
}

// ── HORARIO DEL OPERADOR ──────────────────────────────────
async function cargarHorario() {
  const { data } = await sb
    .from('horarios_operadores')
    .select('*')
    .eq('operador_id', PERFIL.id)
    .eq('activo', true)
    .order('dia_semana');

  const dias = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const el = document.getElementById('horario-grid');

  if (!data || data.length === 0) {
    el.innerHTML = '<span>Horario no configurado. Contacta al administrador.</span>';
    return;
  }

  el.innerHTML = `<div style="display:flex;gap:.75rem;flex-wrap:wrap;">
    ${data.map(h => `
      <div style="text-align:center;background:var(--surface2);border-radius:8px;padding:.5rem .75rem;min-width:60px;">
        <div style="font-weight:700;color:var(--primary)">${dias[h.dia_semana]}</div>
        <div>${h.hora_entrada.slice(0,5)}</div>
        <div>${h.hora_salida.slice(0,5)}</div>
      </div>
    `).join('')}
  </div>`;
}

// ── MARCAS Y MODELOS ──────────────────────────────────────
async function cargarMarcasModelos() {
  const { data } = await sb.from('marcas_modelos')
    .select('marca, modelo, tamano, precio_base')
    .eq('activo', true)
    .order('marca').order('modelo');

  if (!data) return;
  MARCAS_MODELOS = data;
  MARCAS_UNICAS  = [...new Set(data.map(r => r.marca))].sort((a,b) => a.localeCompare(b, 'es'));

  const sel = document.getElementById('reg-marca');
  sel.innerHTML =
    '<option value="">— Selecciona marca —</option>' +
    MARCAS_UNICAS.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('') +
    '<option value="__otro__">— Otro (captura manual) —</option>';
}

function onMarcaChange() {
  const marca = document.getElementById('reg-marca').value;
  document.getElementById('reg-marca-modelo').value = '';
  document.getElementById('grupo-modelo').style.display = 'none';
  document.getElementById('grupo-otro').style.display   = 'none';
  document.getElementById('reg-modelo').innerHTML = '<option value="">Selecciona modelo...</option>';
  document.getElementById('reg-marca-modelo-otro').value = '';

  if (!marca) return;

  if (marca === '__otro__') {
    document.getElementById('grupo-otro').style.display = '';
    return;
  }

  const modelos = MARCAS_MODELOS.filter(r => r.marca === marca).map(r => r.modelo);
  document.getElementById('reg-modelo').innerHTML =
    '<option value="">— Selecciona modelo —</option>' +
    modelos.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('') +
    '<option value="__otro__">— Otro (captura manual) —</option>';
  document.getElementById('grupo-modelo').style.display = '';
}

function onModeloChange() {
  const marca  = document.getElementById('reg-marca').value;
  const modelo = document.getElementById('reg-modelo').value;

  if (modelo === '__otro__') {
    document.getElementById('grupo-otro').style.display = '';
    document.getElementById('reg-marca-modelo-otro').value = marca + ' ';
    document.getElementById('reg-marca-modelo').value = '';
  } else if (modelo) {
    document.getElementById('grupo-otro').style.display = 'none';
    document.getElementById('reg-marca-modelo').value = marca + ' ' + modelo;
    checkSesionExistente();
  } else {
    document.getElementById('grupo-otro').style.display = 'none';
    document.getElementById('reg-marca-modelo').value = '';
  }
}

function onOtroInput() {
  const val = document.getElementById('reg-marca-modelo-otro').value.trim();
  document.getElementById('reg-marca-modelo').value = val;
  checkSesionExistente();
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function checkSesionExistente() {
  const marca = document.getElementById('reg-marca-modelo').value.trim();
  const placa = document.getElementById('reg-placa4').value.trim().toUpperCase();
  const fecha  = document.getElementById('reg-fecha').value;

  const info = document.getElementById('sesion-existente');
  if (!marca || !placa || placa.length < 3 || !fecha) { info.classList.add('hidden'); return; }

  // Buscar vehículo
  const { data: veh } = await sb.from('vehiculos')
    .select('id')
    .eq('marca_modelo', marca)
    .eq('placa_ultimos4', placa)
    .maybeSingle();

  if (!veh) { info.classList.add('hidden'); return; }

  // Buscar sesión del día con tareas del mismo operador
  const { data: reg } = await sb.from('registros_trabajo')
    .select('id, tareas(operador_id)')
    .eq('vehiculo_id', veh.id)
    .eq('fecha', fecha)
    .eq('estado', 'en_proceso')
    .maybeSingle();

  if (reg) {
    info.classList.remove('hidden');
  } else {
    info.classList.add('hidden');
  }
}

// ── SUBMIT REGISTRO ───────────────────────────────────────
function submitRegistro(e) {
  e.preventDefault();

  const fecha      = document.getElementById('reg-fecha').value;
  const horaInicio = document.getElementById('reg-hora-inicio').value;
  const horaFin    = document.getElementById('reg-hora-fin').value;
  const marca      = document.getElementById('reg-marca-modelo').value.trim();   // campo oculto consolidado
  const placa      = document.getElementById('reg-placa4').value.trim().toUpperCase();

  const serviciosSeleccionados = [];
  document.querySelectorAll('.service-item input[type="checkbox"]:checked').forEach(cb => {
    const ptsInput = cb.closest('.service-item').querySelector('.service-item-pts');
    serviciosSeleccionados.push({
      servicio_id: parseInt(cb.value),
      puntos: parseFloat(ptsInput?.value || 0)
    });
  });

  // Validar fecha = hoy
  const hoyStr = new Date().toISOString().split('T')[0];
  if (fecha !== hoyStr) {
    showMsgRegistro('error', 'Solo puedes registrar trabajo del día de hoy.');
    return;
  }

  // Validar hora inicio no en el futuro
  const ahora = new Date();
  const [hi, mi] = horaInicio.split(':').map(Number);
  const tsInicio = new Date(); tsInicio.setHours(hi, mi, 0, 0);
  if (tsInicio > ahora) {
    showMsgRegistro('error', 'La hora de inicio no puede ser en el futuro.');
    return;
  }

  if (!marca || !placa) {
    showMsgRegistro('error', 'Ingresa la marca/modelo y los últimos 4 dígitos de la placa.');
    return;
  }
  if (serviciosSeleccionados.length === 0) {
    showMsgRegistro('error', 'Selecciona al menos un servicio.');
    return;
  }

  // Pedir confirmación antes de guardar
  mostrarConfirm('💾', 'Confirmar registro',
    `¿Guardar ${serviciosSeleccionados.length} servicio(s) para ${marca} — ${placa}?`,
    'Sí, guardar', 'btn-primary',
    () => ejecutarGuardadoRegistro(fecha, horaInicio, horaFin, marca, placa, serviciosSeleccionados)
  );
}

async function ejecutarGuardadoRegistro(fecha, horaInicio, horaFin, marca, placa, serviciosSeleccionados) {
  const btn = document.getElementById('btn-registrar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Guardando...';

  try {
    // 1. Obtener o crear vehículo
    let { data: veh, error: vehErr } = await sb.from('vehiculos')
      .upsert({ marca_modelo: marca, placa_ultimos4: placa }, { onConflict: 'marca_modelo,placa_ultimos4' })
      .select().single();

    if (vehErr) throw vehErr;

    // 2. Buscar sesión abierta del día para este vehículo
    let { data: reg } = await sb.from('registros_trabajo')
      .select('id')
      .eq('vehiculo_id', veh.id)
      .eq('fecha', fecha)
      .eq('estado', 'en_proceso')
      .maybeSingle();

    // 3. Si no existe, crearla
    if (!reg) {
      const hiTs = fecha + 'T' + horaInicio + ':00';
      const hfTs = horaFin ? fecha + 'T' + horaFin + ':00' : null;
      const { data: newReg, error: regErr } = await sb.from('registros_trabajo')
        .insert({
          fecha,
          vehiculo_id: veh.id,
          hora_inicio: hiTs,
          hora_fin: hfTs,
          estado: 'en_proceso',
          origen: 'taller_sistema'
        }).select().single();
      if (regErr) throw regErr;
      reg = newReg;
    } else {
      // Actualizar hora_fin si se proporcionó
      if (horaFin) {
        await sb.from('registros_trabajo')
          .update({ hora_fin: fecha + 'T' + horaFin + ':00' })
          .eq('id', reg.id);
      }
    }

    // 4. Insertar tareas
    const hiTs = fecha + 'T' + horaInicio + ':00';
    const hfTs = horaFin ? fecha + 'T' + horaFin + ':00' : null;

    const tareasPayload = serviciosSeleccionados.map(s => ({
      registro_id: reg.id,
      operador_id: PERFIL.id,
      servicio_id: s.servicio_id,
      hora_inicio: hiTs,
      hora_fin: hfTs,
      puntos_capturados: s.puntos,
      validado: false
    }));

    const { error: tareasErr } = await sb.from('tareas').insert(tareasPayload);
    if (tareasErr) throw tareasErr;

    // 5. Sincronizar a servicios_taller
    await syncServiciosTaller(reg.id, veh, fecha);

    // Reset form
    showMsgRegistro('success', `Registro guardado: ${serviciosSeleccionados.length} servicio(s) para ${marca} — ${placa}.`);
    document.getElementById('form-registro').reset();
    document.getElementById('reg-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('reg-hora-inicio').value = fmtTimeLocal(new Date());
    // Reset selectores de vehículo
    document.getElementById('reg-marca').value = '';
    document.getElementById('reg-modelo').innerHTML = '<option value="">Selecciona modelo...</option>';
    document.getElementById('grupo-modelo').style.display = 'none';
    document.getElementById('grupo-otro').style.display   = 'none';
    document.getElementById('reg-marca-modelo').value     = '';
    document.getElementById('reg-marca-modelo-otro').value = '';
    document.getElementById('services-grid').querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('puntos-total-val').textContent = '0';
    document.getElementById('sesion-existente').classList.add('hidden');

    // Recargar puntos de la semana
    verSemanaActual();

  } catch (err) {
    showMsgRegistro('error', 'Error al guardar: ' + (err.message || JSON.stringify(err)));
  }

  btn.disabled = false;
  btn.innerHTML = 'Guardar Registro';
}

// Sincronizar registro a servicios_taller
async function syncServiciosTaller(registroId, vehiculo, fecha) {
  const dt = new Date(fecha + 'T12:00:00');
  const anio = dt.getFullYear();
  const mes  = dt.getMonth() + 1;
  // Semana ISO: simplificado como semana del mes
  const semana = Math.ceil(dt.getDate() / 7);
  const vehiculoStr = `${vehiculo.marca_modelo} ${vehiculo.placa_ultimos4}`;

  // Verificar si ya existe un registro de servicios_taller para este registro_trabajo
  const { data: existing } = await sb.from('servicios_taller')
    .select('id')
    .eq('registro_trabajo_id', registroId)
    .maybeSingle();

  if (!existing) {
    await sb.from('servicios_taller').insert({
      anio, mes, semana,
      vehiculo: vehiculoStr,
      fecha,
      registro_trabajo_id: registroId,
      origen: 'taller_sistema',
      importe_cobrado: 0
    });
  }
}

// ── MIS PUNTOS ────────────────────────────────────────────
async function verSemanaActual() {
  const sw = semanaActual();
  document.getElementById('pts-periodo-label').textContent =
    `Semana del ${fmtDate(sw.inicio)} al ${fmtDate(sw.fin)}`;
  await cargarPuntos(sw.inicio, sw.fin);
}

function togglePeriodo() {
  const el = document.getElementById('periodo-inputs');
  el.classList.toggle('hidden');
}

async function cargarPuntosPeriodo() {
  const desde = document.getElementById('pts-desde').value;
  const hasta = document.getElementById('pts-hasta').value;
  if (!desde || !hasta) { toast('Selecciona un rango de fechas', 'warning'); return; }
  document.getElementById('pts-periodo-label').textContent =
    `Del ${fmtDate(desde)} al ${fmtDate(hasta)}`;
  await cargarPuntos(desde, hasta);
}

async function cargarPuntos(desde, hasta) {
  const { data, error } = await sb
    .from('tareas')
    .select(`
      id, puntos_capturados, puntos_aprobados, validado, hora_inicio, hora_fin,
      registros_trabajo!inner(fecha, vehiculos(marca_modelo, placa_ultimos4)),
      catalogo_servicios(nombre)
    `)
    .eq('operador_id', PERFIL.id)
    .gte('registros_trabajo.fecha', desde)
    .lte('registros_trabajo.fecha', hasta)
    .order('hora_inicio', { ascending: false });

  if (error || !data) { return; }

  let totalPts = 0, aprobados = 0, pendientes = 0;
  data.forEach(t => {
    const pts = t.validado ? (t.puntos_aprobados ?? t.puntos_capturados) : t.puntos_capturados;
    totalPts += pts;
    if (t.validado) aprobados += (t.puntos_aprobados ?? t.puntos_capturados);
    else pendientes += t.puntos_capturados;
  });

  document.getElementById('pts-total').textContent     = totalPts.toFixed(1).replace(/\.0$/,'');
  document.getElementById('pts-aprobados').textContent = aprobados.toFixed(1).replace(/\.0$/,'');
  document.getElementById('pts-pendientes').textContent= pendientes.toFixed(1).replace(/\.0$/,'');
  document.getElementById('pts-tareas').textContent    = data.length;

  const tbody = document.getElementById('pts-tabla-body');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center muted" style="padding:1.5rem">Sin registros en este período</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(t => {
    const reg = t.registros_trabajo;
    const veh = reg?.vehiculos;
    const pts = t.validado ? (t.puntos_aprobados ?? t.puntos_capturados) : t.puntos_capturados;
    const badge = t.validado
      ? `<span class="badge badge-success">Aprobado</span>`
      : `<span class="badge badge-warning">Pendiente</span>`;
    return `<tr>
      <td>${fmtDate(reg?.fecha)}</td>
      <td>${veh ? veh.marca_modelo + ' ' + veh.placa_ultimos4 : '—'}</td>
      <td>${t.catalogo_servicios?.nombre || '—'}</td>
      <td>${fmtTime(t.hora_inicio)}${t.hora_fin ? '–' + fmtTime(t.hora_fin) : ''}</td>
      <td><strong>${pts.toFixed(1).replace(/\.0$/,'')}</strong></td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

// ── UTILIDADES ────────────────────────────────────────────
function fmtTimeLocal(d) {
  return d.toTimeString().slice(0, 5);
}

function showMsgRegistro(tipo, msg) {
  const el = document.getElementById('msg-registro');
  el.className = `alert alert-${tipo === 'error' ? 'danger' : 'success'}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
