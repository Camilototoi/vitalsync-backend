// ── ESTADO ───────────────────────────────────────────
const pacientes = new Map();
let ws = null;
let alertaTimeout = null;

// ── WEBSOCKET ─────────────────────────────────────────
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}/ws/vitales`;

function conectar() {
  setEstadoConexion('connecting');
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setEstadoConexion('online');
    console.log('[VitalSync] WebSocket conectado');
  };

  ws.onmessage = (event) => {
    try {
      const datos = JSON.parse(event.data);
      procesarEvento(datos);
    } catch (e) {
      console.warn('[VitalSync] Evento no parseable:', e);
    }
  };

  ws.onclose = () => {
    setEstadoConexion('offline');
    console.log('[VitalSync] WebSocket desconectado — reintentando en 3s');
    setTimeout(conectar, 3000);
  };

  ws.onerror = () => {
    setEstadoConexion('offline');
    ws.close();
  };
}

function setEstadoConexion(estado) {
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  dot.className   = `conn-dot ${estado}`;
  label.className = `conn-label ${estado}`;
  const textos = {
    online:     'EN LÍNEA',
    offline:    'SIN CONEXIÓN',
    connecting: 'CONECTANDO...'
  };
  label.textContent = textos[estado] || estado;
}

// ── PROCESAMIENTO DE EVENTOS ──────────────────────────
function procesarEvento(datos) {
  const uuid = datos.ambulancia_id !== undefined
    ? `ambulancia-${datos.ambulancia_id}`
    : datos.paciente_uuid;
  if (!uuid) return;

  const uuidCorto = uuid.substring(0, 8).toUpperCase();
  const triage    = datos.triage || 'VERDE';
  const fc        = datos.frecuencia_cardiaca ?? '--';
  const pa        = datos.presion_arterial    ?? '--';
  const ts        = new Date().toLocaleTimeString('es-CO', { hour12: false });

  const esNuevo = !pacientes.has(uuid);

  if (esNuevo) {
    crearCard(uuid, uuidCorto, triage, fc, pa, ts);
  } else {
    actualizarCard(uuid, uuidCorto, triage, fc, pa, ts);
  }

  pacientes.set(uuid, { triage, fc, pa, ts });
  reordenarGrid();
  actualizarContadores();
  actualizarLastUpdate(ts);

  if (triage === 'ROJO') {
    mostrarAlertaRojo(uuidCorto);
    reproducirAlerta();
  }

  ocultarEmptyState();
}

// ── CREAR CARD ────────────────────────────────────────
function crearCard(uuid, uuidCorto, triage, fc, pa, ts) {
  const card = document.createElement('div');
  card.className = `card ${triage}`;
  card.id        = `card-${uuid}`;
  card.innerHTML = buildCardHTML(uuidCorto, triage, fc, pa, ts);
  document.getElementById('grid').appendChild(card);
  pacientes.set(uuid, { triage, fc, pa, ts, card });
}

// ── ACTUALIZAR CARD ───────────────────────────────────
function actualizarCard(uuid, uuidCorto, triage, fc, pa, ts) {
  const card = document.getElementById(`card-${uuid}`);
  if (!card) return;

  const prevTriage = pacientes.get(uuid)?.triage;

  if (prevTriage !== triage) {
    card.className = `card ${triage}`;
  }

  const fcEl    = card.querySelector('.vital-fc');
  const paEl    = card.querySelector('.vital-pa');
  const tsEl    = card.querySelector('.card-timestamp');
  const badgeEl = card.querySelector('.triage-badge');

  if (fcEl) {
    fcEl.textContent = fc;
    fcEl.className   = `vital-value hr-${getHRClass(fc)} vital-fc`;
    fcEl.closest('.vital-block').classList.remove('updated');
    void fcEl.closest('.vital-block').offsetWidth;
    fcEl.closest('.vital-block').classList.add('updated');
  }

  if (paEl) {
    paEl.textContent = pa;
    paEl.closest('.vital-block').classList.remove('updated');
    void paEl.closest('.vital-block').offsetWidth;
    paEl.closest('.vital-block').classList.add('updated');
  }

  if (tsEl)    tsEl.textContent = ts;
  if (badgeEl) {
    badgeEl.className   = `triage-badge ${triage}`;
    badgeEl.textContent = triage;
  }

  const hbPath = card.querySelector('.hb-path');
  if (hbPath) hbPath.setAttribute('d', generarECG());
}

// ── BUILD CARD HTML ───────────────────────────────────
function buildCardHTML(uuidCorto, triage, fc, pa, ts) {
  const hrClass = getHRClass(fc);
  return `
    <div class="card-stripe"></div>
    <div class="card-body">
      <div class="card-header">
        <div class="patient-id">AMBULANCIA <span>${uuidCorto}...</span></div>
        <div class="triage-badge ${triage}">${triage}</div>
      </div>
      <div class="vitals">
        <div class="vital-block">
          <div class="vital-label">Frec. Cardíaca</div>
          <div class="vital-value ${hrClass} vital-fc">${fc}<span class="vital-unit">bpm</span></div>
        </div>
        <div class="vital-block">
          <div class="vital-label">Presión Arterial</div>
          <div class="vital-value vital-pa">${pa}<span class="vital-unit">mmHg</span></div>
        </div>
      </div>
      <div class="heartbeat-wrap">
        <svg class="heartbeat-svg" viewBox="0 0 300 28" preserveAspectRatio="none">
          <path class="hb-path" d="${generarECG()}"/>
        </svg>
      </div>
      <div class="card-footer">
        <span class="card-timestamp">${ts}</span>
        <span class="card-estado">ACTIVO</span>
      </div>
    </div>
  `;
}

// ── HELPERS ────────────────────────────────────────────
function getHRClass(fc) {
  const v = parseInt(fc);
  if (isNaN(v)) return '';
  if (v > 100)  return 'hr-high';
  if (v < 60)   return 'hr-low';
  return 'hr-ok';
}

function generarECG() {
  const pts = [
    [0,14],[30,14],[40,14],[45,10],[50,14],
    [60,14],[65,4],[70,22],[75,2],[80,14],
    [90,14],[95,11],[100,14],
    [130,14],[135,10],[140,14],
    [150,14],[155,4],[160,22],[165,2],[170,14],
    [180,14],[185,11],[190,14],
    [220,14],[225,10],[230,14],
    [240,14],[245,4],[250,22],[255,2],[260,14],
    [280,14],[300,14]
  ];
  const jitter = () => (Math.random() - 0.5) * 2;
  return 'M ' + pts.map(([x,y]) => `${x},${y + jitter()}`).join(' L ');
}

function reordenarGrid() {
  const grid  = document.getElementById('grid');
  const cards = [...grid.querySelectorAll('.card')];
  cards.sort((a, b) => {
    const ta = a.classList.contains('ROJO') ? 0 : a.classList.contains('AMARILLO') ? 1 : 2;
    const tb = b.classList.contains('ROJO') ? 0 : b.classList.contains('AMARILLO') ? 1 : 2;
    return ta - tb;
  });
  cards.forEach(c => grid.appendChild(c));
}

function actualizarContadores() {
  let rojo = 0, amarillo = 0, verde = 0;
  pacientes.forEach(p => {
    if      (p.triage === 'ROJO')     rojo++;
    else if (p.triage === 'AMARILLO') amarillo++;
    else                              verde++;
  });
  document.getElementById('cnt-rojo').textContent     = rojo;
  document.getElementById('cnt-amarillo').textContent = amarillo;
  document.getElementById('cnt-verde').textContent    = verde;
  document.getElementById('cnt-total').textContent    = pacientes.size;
}

function actualizarLastUpdate(ts) {
  document.getElementById('last-update').textContent = `Último evento: ${ts}`;
}

function ocultarEmptyState() {
  const e = document.getElementById('empty-state');
  if (e) e.remove();
}

// ── ALERTA ROJO ────────────────────────────────────────
function mostrarAlertaRojo(uuidCorto) {
  const banner = document.getElementById('alerta-banner');
  document.getElementById('alerta-uuid').textContent = `UUID: ${uuidCorto}...`;
  banner.classList.add('visible');
  clearTimeout(alertaTimeout);
  alertaTimeout = setTimeout(() => banner.classList.remove('visible'), 6000);
}

// ── AUDIO ALERT ────────────────────────────────────────
let audioCtx = null;
function reproducirAlerta() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [0, 0.35, 0.7].forEach(offset => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.25, now + offset + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.2);
      osc.start(now + offset);
      osc.stop(now + offset + 0.25);
    });
  } catch (e) {}
}

// ── RELOJ ─────────────────────────────────────────────
function actualizarReloj() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('es-CO', { hour12: false });
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

// ── INICIO ────────────────────────────────────────────
conectar();