// ── ESTADO ───────────────────────────────────────────
const ambulancias  = new Map(); // ambulancia_id → { uuid, triage, estado, ... }
let ws             = null;
let alertaTimeout  = null;

// Contadores de turno
let turnoAtendidos = 0;
let turnoEntregas  = 0;
let turnoRojos     = 0;
let turnoEKG       = 0;

// ── WEBSOCKET ─────────────────────────────────────────
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL   = `${protocol}//${window.location.host}/ws/vitales`;

function conectar() {
  setEstadoConexion('connecting');
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setEstadoConexion('online');
    agregarFeed('Conexión establecida con el sistema', 'blue');
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
    agregarFeed('Conexión perdida — reintentando...', 'gray');
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
    connecting: 'CONECTANDO'
  };
  label.textContent = textos[estado] || estado;
}

// ── PROCESAMIENTO DE EVENTOS ──────────────────────────
function procesarEvento(datos) {
  const ambId = datos.ambulancia_id;
  if (ambId === undefined) return;

  const uuid     = datos.paciente_uuid;
  const triage   = normalizarTriage(datos.triage || 'VERDE');
  const fc       = datos.frecuencia_cardiaca ?? '--';
  const pa       = datos.presion_arterial    ?? '--';
  const tieneEKG = !!datos.imagen_ekg;
  const ts       = new Date().toLocaleTimeString('es-CO', { hour12: false });

  const previo     = ambulancias.get(ambId);
  const esNuevo    = !previo;
  const cambioUUID = previo && previo.uuid !== uuid;

  // Si el triage cambió de ROJO a otro, quitar del banner
  if (previo && previo.triage === 'ROJO' && triage !== 'ROJO') {
    quitarRojo(ambId);
  }

  if (esNuevo) {
    turnoAtendidos++;
    ambulancias.set(ambId, { uuid, triage, fc, pa, ts, estado: 'nuevo-paciente' });
    crearCard(ambId, uuid, triage, fc, pa, ts, tieneEKG);
    agregarFeed(`Ambulancia ${ambId} — nuevo paciente asignado`, colorFeed(triage));

  } else if (cambioUUID) {
    ambulancias.set(ambId, { uuid: previo.uuid, triage: previo.triage, fc: previo.fc, pa: previo.pa, ts, estado: 'entregando' });
    actualizarEstadoBadge(ambId, 'entregando');
    agregarFeed(`Ambulancia ${ambId} — llegando al hospital`, 'amarillo');
    turnoEntregas++;

    setTimeout(() => {
      turnoAtendidos++;
      ambulancias.set(ambId, { uuid, triage, fc, pa, ts, estado: 'nuevo-paciente' });
      actualizarCard(ambId, uuid, triage, fc, pa, ts, tieneEKG, 'nuevo-paciente');
      agregarFeed(`Ambulancia ${ambId} — paciente entregado ✓`, 'verde');
      agregarFeed(`Ambulancia ${ambId} — nuevo paciente asignado`, colorFeed(triage));

      setTimeout(() => {
        const actual = ambulancias.get(ambId);
        if (actual && actual.uuid === uuid) {
          actual.estado = 'en-ruta';
          ambulancias.set(ambId, actual);
          actualizarEstadoBadge(ambId, 'en-ruta');
        }
      }, 8000);
    }, 3000);

  } else {
    const estado = previo.estado === 'nuevo-paciente' ? 'nuevo-paciente' : 'en-ruta';
    ambulancias.set(ambId, { uuid, triage, fc, pa, ts, estado });
    actualizarCard(ambId, uuid, triage, fc, pa, ts, tieneEKG, estado);
  }

  if (tieneEKG) {
    turnoEKG++;
    actualizarTurno();
  }

  if (triage === 'ROJO') {
    turnoRojos++;
    mostrarAlertaRojo(ambId, ts);
    reproducirAlerta();
    agregarFeed(`⚠ Ambulancia ${ambId} — Triage ROJO detectado`, 'rojo');
  }

  reordenarGrid();
  actualizarContadores();
  actualizarTurno();
  actualizarLastUpdate(ts);
  ocultarEmptyState();
}

// ── CREAR CARD ────────────────────────────────────────
function crearCard(ambId, uuid, triage, fc, pa, ts, tieneEKG) {
  const card = document.createElement('div');
  card.className = `card ${triage}`;
  card.id        = `card-amb-${ambId}`;
  card.innerHTML = buildCardHTML(ambId, uuid, triage, fc, pa, ts, tieneEKG, 'nuevo-paciente');
  document.getElementById('grid').appendChild(card);

  // Cambiar a en-ruta después de 8 segundos
  setTimeout(() => {
    const actual = ambulancias.get(ambId);
    if (actual) {
      actual.estado = 'en-ruta';
      ambulancias.set(ambId, actual);
      actualizarEstadoBadge(ambId, 'en-ruta');
    }
  }, 8000);
}

// ── ACTUALIZAR CARD ───────────────────────────────────
function actualizarCard(ambId, uuid, triage, fc, pa, ts, tieneEKG, estado) {
  const card = document.getElementById(`card-amb-${ambId}`);
  if (!card) return;

  const previo = ambulancias.get(ambId);

  // Actualizar clase triage si cambió
  if (!card.classList.contains(triage)) {
    card.className = `card ${triage}`;
  }

  // Actualizar UUID discreto
  const uuidEl = card.querySelector('.paciente-uuid');
  if (uuidEl) uuidEl.textContent = uuid ? uuid.substring(0, 12) + '...' : '';

  // Actualizar badge de triage
  const badgeEl = card.querySelector('.triage-badge');
  if (badgeEl) {
    badgeEl.className   = `triage-badge ${triage}`;
    badgeEl.textContent = triage;
  }

  // Actualizar estado
  const estadoEl = card.querySelector('.estado-badge');
  if (estadoEl) {
    estadoEl.className   = `estado-badge ${estado}`;
    estadoEl.textContent = textoEstado(estado);
  }

  // Actualizar vitales con flash
  const fcEl = card.querySelector('.vital-fc');
  const paEl = card.querySelector('.vital-pa');
  const tsEl = card.querySelector('.card-timestamp');

  if (fcEl) {
    fcEl.textContent = fc;
    fcEl.className   = `vital-value hr-${getHRClass(fc)} vital-fc`;
    flashBlock(fcEl);
  }

  if (paEl) {
    paEl.textContent = pa;
    flashBlock(paEl);
  }

  if (tsEl) tsEl.textContent = ts;

  // EKG indicator
  const ekgEl = card.querySelector('.ekg-indicator');
  if (ekgEl) {
    ekgEl.className   = `ekg-indicator${tieneEKG ? ' tiene-ekg' : ''}`;
    ekgEl.textContent = tieneEKG ? 'EKG ✓' : '';
  }

  // Heartbeat
  const hbPath = card.querySelector('.hb-path');
  if (hbPath) hbPath.setAttribute('d', generarECG());
}

function flashBlock(el) {
  const block = el.closest('.vital-block');
  if (!block) return;
  block.classList.remove('updated');
  void block.offsetWidth;
  block.classList.add('updated');
}

function actualizarEstadoBadge(ambId, estado) {
  const card = document.getElementById(`card-amb-${ambId}`);
  if (!card) return;
  const estadoEl = card.querySelector('.estado-badge');
  if (!estadoEl) return;
  estadoEl.className   = `estado-badge ${estado}`;
  estadoEl.textContent = textoEstado(estado);
}

// ── BUILD CARD HTML ───────────────────────────────────
function buildCardHTML(ambId, uuid, triage, fc, pa, ts, tieneEKG, estado) {
  const hrClass  = getHRClass(fc);
  const uuidCorto = uuid ? uuid.substring(0, 12) + '...' : '—';
  return `
    <div class="card-stripe"></div>
    <div class="card-body">
      <div class="card-top">
        <div class="ambulancia-info">
          <div class="ambulancia-label">Ambulancia</div>
          <div class="ambulancia-num">${String(ambId).padStart(2, '0')}</div>
        </div>
        <div class="card-right">
          <div class="triage-badge ${triage}">${triage}</div>
          <div class="estado-badge ${estado}">${textoEstado(estado)}</div>
        </div>
      </div>
      <div class="paciente-uuid">${uuidCorto}</div>
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
        <svg class="heartbeat-svg" viewBox="0 0 300 24" preserveAspectRatio="none">
          <path class="hb-path" d="${generarECG()}"/>
        </svg>
      </div>
      <div class="card-footer">
        <span class="card-timestamp">${ts}</span>
        <span class="ekg-indicator${tieneEKG ? ' tiene-ekg' : ''}">${tieneEKG ? 'EKG ✓' : ''}</span>
      </div>
    </div>
  `;
}

// ── ACTIVITY FEED ─────────────────────────────────────
const MAX_FEED = 40;

function agregarFeed(msg, tipo) {
  const feed = document.getElementById('activity-feed');
  const ts   = new Date().toLocaleTimeString('es-CO', { hour12: false });

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-dot ${tipo}"></div>
    <div class="feed-content">
      <div class="feed-msg">${msg}</div>
      <div class="feed-time">${ts}</div>
    </div>
  `;

  feed.insertBefore(item, feed.firstChild);

  // Limitar cantidad de items
  while (feed.children.length > MAX_FEED) {
    feed.removeChild(feed.lastChild);
  }
}

// ── HELPERS ────────────────────────────────────────────
function normalizarTriage(t) {
  const s = String(t).toUpperCase();
  if (s.includes('ROJO'))     return 'ROJO';
  if (s.includes('AMARILLO')) return 'AMARILLO';
  return 'VERDE';
}

function colorFeed(triage) {
  if (triage === 'ROJO')     return 'rojo';
  if (triage === 'AMARILLO') return 'amarillo';
  return 'verde';
}

function textoEstado(estado) {
  const textos = {
    'nuevo-paciente': 'Nuevo paciente',
    'en-ruta':        'En ruta',
    'entregando':     'Llegando al hospital'
  };
  return textos[estado] || 'En ruta';
}

function getHRClass(fc) {
  const v = parseInt(fc);
  if (isNaN(v)) return '';
  if (v > 100)  return 'hr-high';
  if (v < 60)   return 'hr-low';
  return 'hr-ok';
}

function generarECG() {
  const pts = [
    [0,12],[30,12],[40,12],[45,8],[50,12],
    [60,12],[65,2],[70,20],[75,1],[80,12],
    [90,12],[95,9],[100,12],
    [130,12],[135,8],[140,12],
    [150,12],[155,2],[160,20],[165,1],[170,12],
    [180,12],[185,9],[190,12],
    [220,12],[225,8],[230,12],
    [240,12],[245,2],[250,20],[255,1],[260,12],
    [280,12],[300,12]
  ];
  const jitter = () => (Math.random() - 0.5) * 1.5;
  return 'M ' + pts.map(([x,y]) => `${x},${y + jitter()}`).join(' L ');
}

function reordenarGrid() {
  const grid  = document.getElementById('grid');
  const cards = [...grid.querySelectorAll('.card')];
  cards.sort((a, b) => {
    const rank = c => c.classList.contains('ROJO') ? 0 : c.classList.contains('AMARILLO') ? 1 : 2;
    return rank(a) - rank(b);
  });
  cards.forEach(c => grid.appendChild(c));
}

function actualizarContadores() {
  let rojo = 0, amarillo = 0, verde = 0;
  ambulancias.forEach(a => {
    if      (a.triage === 'ROJO')     rojo++;
    else if (a.triage === 'AMARILLO') amarillo++;
    else                              verde++;
  });
  document.getElementById('cnt-rojo').textContent     = rojo;
  document.getElementById('cnt-amarillo').textContent = amarillo;
  document.getElementById('cnt-verde').textContent    = verde;
  document.getElementById('cnt-total').textContent    = ambulancias.size;
}

function actualizarTurno() {
  document.getElementById('t-atendidos').textContent = turnoAtendidos;
  document.getElementById('t-entregas').textContent  = turnoEntregas;
  document.getElementById('t-rojos').textContent     = turnoRojos;
  document.getElementById('t-ekg').textContent       = turnoEKG;
}

function actualizarLastUpdate(ts) {
  const el = document.getElementById('last-update');
  if (el) el.textContent = `Último evento: ${ts}`;
}

function ocultarEmptyState() {
  const e = document.getElementById('empty-state');
  if (e) e.remove();
}

// ── AMBULANCIAS EN ROJO ACTIVAS ───────────────────────
const ambulanciasRojo = new Set();

function mostrarAlertaRojo(ambId, ts) {
  ambulanciasRojo.add(ambId);
  actualizarBannerRojo(ts);
}

function quitarRojo(ambId) {
  ambulanciasRojo.delete(ambId);
  if (ambulanciasRojo.size === 0) {
    document.getElementById('alerta-banner').classList.remove('visible');
  } else {
    actualizarBannerRojo('');
  }
}

function actualizarBannerRojo(ts) {
  const banner   = document.getElementById('alerta-banner');
  const uuidEl   = document.getElementById('alerta-uuid');
  const timeEl   = document.getElementById('alerta-time');
  const lista    = [...ambulanciasRojo]
    .sort()
    .map(id => `AMB-${String(id).padStart(2,'0')}`)
    .join('  ·  ');

  uuidEl.textContent = lista;
  if (ts) timeEl.textContent = ts;
  banner.classList.add('visible');

  clearTimeout(alertaTimeout);
  alertaTimeout = setTimeout(() => {
    ambulanciasRojo.clear();
    banner.classList.remove('visible');
  }, 8000);
}

// ── AUDIO ALERT ────────────────────────────────────────
let audioCtx = null;
function reproducirAlerta() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [0, 0.4, 0.8].forEach(offset => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 820;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.06);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.22);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
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