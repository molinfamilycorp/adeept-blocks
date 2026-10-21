// Editor wiring: workspace, simulator, USB link, settings.

const DEFAULT_SETTINGS = {
  mecanum: false,
  invertMotors: false,
  invertHead: false,
  startWithOk: false,
  cmps: 25,
  ms90: 550,
  moveSpeed: 60,
  turnSpeed: 70,
};

const STARTER = {
  blocks: {languageVersion: 0, blocks: [{
    type: 'car_start', x: 40, y: 40,
    next: {block: {type: 'car_face', fields: {FACE: '0'},
      next: {block: {type: 'car_repeat', inputs: {
        TIMES: {shadow: {type: 'math_number', fields: {NUM: 4}}},
        DO: {block: {type: 'car_move', inputs: {CM: {shadow: {type: 'math_number', fields: {NUM: 30}}}},
          next: {block: {type: 'car_turn', fields: {DIR: 'R'}, inputs: {DEG: {shadow: {type: 'math_number', fields: {NUM: 90}}}}}}}},
      },
      next: {block: {type: 'car_tune', fields: {TUNE: '0'}}}}}}},
  }]},
};

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* private mode */ }
}

const settings = {...DEFAULT_SETTINGS, ...loadJSON('adeept.settings', {})};
const $ = id => document.getElementById(id);

// Toast

let toastTimer;
function toast(msg, kind = '', ms = 4500) {
  const t = $('toast');
  t.textContent = msg;
  t.className = kind;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms);
}

// Workspace

const ws = Blockly.inject('blocks', {
  toolbox: buildToolbox(settings.mecanum),
  renderer: 'zelos',
  theme: CAR_THEME,
  media: 'vendor/blockly/media/',
  trashcan: true,
  zoom: {controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.4, scaleSpeed: 1.15},
  grid: {spacing: 40, length: 2, colour: '#ddd', snap: false},
  move: {scrollbars: true, drag: true, wheel: false},
  sounds: true,
});
registerVariables(ws);

try {
  Blockly.serialization.workspaces.load(loadJSON('adeept.workspace', STARTER), ws);
} catch (e) {
  Blockly.serialization.workspaces.load(STARTER, ws);
}
ws.scrollCenter();

ws.addChangeListener(e => {
  if (e.isUiEvent)
    return;
  saveJSON('adeept.workspace', Blockly.serialization.workspaces.save(ws));
});

function compileOrExplain() {
  try {
    return compileProgram(ws, settings);
  } catch (err) {
    if (!(err instanceof CompileError))
      throw err;
    if (err.blockId) {
      const b = ws.getBlockById(err.blockId);
      if (b) {
        b.select();
        ws.centerOnBlock(err.blockId);
      }
    }
    toast('🤔 ' + err.message, 'error', 6000);
    return null;
  }
}

// Simulator

const eyesEl = $('eyes');
for (let i = 0; i < 128; i++)
  eyesEl.appendChild(document.createElement('span'));
const ledsEl = $('leds');
for (let i = 0; i < 7; i++)
  ledsEl.appendChild(document.createElement('span'));

let highlighted = null;
const sim = new Simulator($('arena'), {
  eyes(name) {
    const rows = name ? FACES[name] : null;
    eyesEl.childNodes.forEach((el, i) => {
      el.classList.toggle('on', !!rows && rows[i >> 4][i & 15] === 'X');
    });
  },
  oled(lines) {
    $('oled').textContent = lines.map(l => l.padEnd(10)).join('\n');
  },
  leds(cols, brightness) {
    ledsEl.childNodes.forEach((el, i) => {
      const c = cols[i];
      const on = c.some(v => v);
      const k = 0.35 + 0.65 * brightness / 100;
      el.style.background = on ? `rgb(${c.map(v => Math.round(v * k)).join(',')})` : '#333';
      el.style.boxShadow = on ? `0 0 6px rgb(${c.join(',')})` : 'none';
    });
  },
  onHighlight(id) {
    if (highlighted !== id) {
      ws.highlightBlock(id);
      highlighted = id;
    }
  },
  onState(running) {
    $('btnSim').disabled = running;
  },
});
sim.settings = settings;

$('btnSim').onclick = () => {
  const image = compileOrExplain();
  if (image)
    sim.run(image, settings);
};
$('btnSimStop').onclick = () => sim.stop();
$('btnSimReset').onclick = () => {
  sim.stop();
  setTimeout(() => sim.reset(), 50);
};
$('chkTrack').onchange = e => { sim.showTrack = e.target.checked; sim.drawWorld(); };
$('chkBox').onchange = e => { sim.showBox = e.target.checked; sim.drawWorld(); };

function remoteButton(parent, label, key) {
  const b = document.createElement('button');
  b.textContent = label;
  if (key === null) {
    b.style.visibility = 'hidden';
  } else {
    b.onclick = () => sim.pressKey(key);
  }
  parent.appendChild(b);
}
[[' ', null], ['▲', 12], [' ', null], ['◀', 14], ['OK', 16], ['▶', 15], [' ', null], ['▼', 13], [' ', null]]
  .forEach(([l, k]) => remoteButton($('remoteArrows'), l, k));
[['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9], ['*', 10], ['0', 0], ['#', 11]]
  .forEach(([l, k]) => remoteButton($('remoteDigits'), l, k));

const ARROW_KEYS = {ArrowUp: 12, ArrowDown: 13, ArrowLeft: 14, ArrowRight: 15};
document.addEventListener('keydown', e => {
  if (sim.running && e.key in ARROW_KEYS) {
    sim.pressKey(ARROW_KEYS[e.key]);
    e.preventDefault();
  }
});

// Car link

const link = new CarLink(event => {
  if (event === 'disconnected')
    setStatus(false);
});

function setStatus(ok, text) {
  const s = $('status');
  s.textContent = text || (ok ? 'Voiture connectée ✓' : 'Voiture non connectée');
  s.className = ok ? 'ok' : '';
}

async function ensureConnected() {
  if (link.connected)
    return true;
  if (!CarLink.supported()) {
    toast('Pour parler à la voiture, il faut ouvrir cette page avec Chrome ou Edge.', 'error', 7000);
    return false;
  }
  try {
    setStatus(false, 'Connexion…');
    const ok = await link.connect();
    if (!ok) {
      setStatus(false, 'Programme de base manquant');
      toast('La voiture ne répond pas. Il faut d\'abord installer le programme de base (⚙️ Réglages).', 'error', 8000);
      await link.disconnect();
      return false;
    }
    setStatus(true);
    return true;
  } catch (err) {
    setStatus(false);
    if (err.name !== 'NotFoundError')
      toast('Impossible de se connecter : ' + err.message, 'error');
    return false;
  }
}

$('btnConnect').onclick = ensureConnected;

async function sendToCar(andRun) {
  const image = compileOrExplain();
  if (!image || !(await ensureConnected()))
    return;
  try {
    await link.sendProgram(image.bytes);
    if (andRun) {
      await link.run();
      toast('🚗 C\'est parti ! (attention, la voiture est encore branchée)', 'ok');
    } else {
      toast('✅ Programme envoyé ! Débranche le câble et allume la voiture.', 'ok', 7000);
    }
  } catch (err) {
    toast('L\'envoi a échoué : ' + err.message, 'error');
  }
}

$('btnSend').onclick = () => sendToCar(false);
$('btnRunCar').onclick = () => sendToCar(true);
$('btnStop').onclick = async () => {
  sim.stop();
  try {
    await link.stop();
  } catch (e) { /* not connected */ }
};

// Files

$('btnSave').onclick = () => {
  const data = JSON.stringify({adeeptBlocs: 1, workspace: Blockly.serialization.workspaces.save(ws)}, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
  a.download = 'mon-programme.adeept.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('btnOpen').onclick = () => $('fileInput').click();
$('fileInput').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file)
    return;
  try {
    const data = JSON.parse(await file.text());
    ws.clear();
    Blockly.serialization.workspaces.load(data.workspace || data, ws);
    showProgramTop();
    if (data.sim)
      sim.setHome(data.sim);
  } catch (err) {
    toast('Ce fichier n\'est pas un programme Adeept Blocs.', 'error');
  }
};

// Settings

const NUM_SETTINGS = {setCmps: 'cmps', setMs90: 'ms90', setMoveSpeed: 'moveSpeed', setTurnSpeed: 'turnSpeed'};
const BOOL_SETTINGS = {setMecanum: 'mecanum', setInvertMotors: 'invertMotors', setInvertHead: 'invertHead', setStartWithOk: 'startWithOk'};

function fillSettings() {
  for (const [id, key] of Object.entries(NUM_SETTINGS))
    $(id).value = settings[key];
  for (const [id, key] of Object.entries(BOOL_SETTINGS))
    $(id).checked = settings[key];
}

function readSettings() {
  for (const [id, key] of Object.entries(NUM_SETTINGS)) {
    const v = Number($(id).value);
    if (Number.isFinite(v) && v > 0)
      settings[key] = Math.round(v * 10) / 10;
  }
  settings.moveSpeed = Math.min(100, Math.max(20, Math.round(settings.moveSpeed)));
  settings.turnSpeed = Math.min(100, Math.max(20, Math.round(settings.turnSpeed)));
  settings.ms90 = Math.min(5000, Math.max(50, Math.round(settings.ms90)));
  const wasMecanum = settings.mecanum;
  for (const [id, key] of Object.entries(BOOL_SETTINGS))
    settings[key] = $(id).checked;
  if (wasMecanum !== settings.mecanum)
    ws.updateToolbox(buildToolbox(settings.mecanum));
  saveJSON('adeept.settings', settings);
}

document.querySelectorAll('#settings input').forEach(el => el.addEventListener('change', readSettings));

let sensorTimer = null;
async function pollSensors() {
  if (!link.connected || link.busy) {
    $('sensorView').textContent = link.connected ? '…' : 'Voiture non connectée.';
    return;
  }
  try {
    const s = await link.sensors();
    const keyNames = {10: '*', 11: '#', 12: '▲', 13: '▼', 14: '◀', 15: '▶', 16: 'OK'};
    $('sensorView').textContent =
      `Distance devant   ${s.dist} cm\n` +
      `Ligne noire       gauche ${s.line[0] ? '■' : '□'}  milieu ${s.line[1] ? '■' : '□'}  droite ${s.line[2] ? '■' : '□'}\n` +
      `Lumière           ${s.light} (${s.light < -15 ? 'à gauche' : s.light > 15 ? 'à droite' : 'devant'})\n` +
      `Batterie          ${s.battery} %\n` +
      `Télécommande      ${s.key < 0 ? '—' : (keyNames[s.key] || s.key)}`;
  } catch (e) {
    $('sensorView').textContent = 'Pas de réponse.';
  }
}

$('btnSettings').onclick = () => {
  fillSettings();
  $('settings').showModal();
  pollSensors();
  sensorTimer = setInterval(pollSensors, 600);
};
$('settings').addEventListener('close', () => {
  clearInterval(sensorTimer);
  readSettings();
});
$('btnCloseSettings').onclick = () => $('settings').close();

async function calibrationTest(kind) {
  readSettings();
  if (!(await ensureConnected()))
    return;
  try {
    await link.sendProgram(calibrationProgram(kind, settings).bytes, true);
  } catch (err) {
    toast('L\'essai a échoué : ' + err.message, 'error');
  }
}
$('btnTestMove').onclick = () => calibrationTest('move');
$('btnTestTurn').onclick = () => calibrationTest('turn');

$('btnFlash').onclick = async () => {
  if (!CarLink.supported()) {
    toast('Il faut Chrome ou Edge pour installer le programme de base.', 'error');
    return;
  }
  const bar = $('flashProgress');
  const msg = $('flashMsg');
  try {
    if (!link.port)
      await link.choosePort();
    await link.disconnect();
    setStatus(false, 'Installation…');
    bar.hidden = false;
    $('btnFlash').disabled = true;
    await flashFirmware(link.port, FIRMWARE_HEX, (f, text) => {
      bar.value = f;
      msg.textContent = text;
    });
    msg.textContent = 'Installé ✓ Connexion…';
    await sleep(500);
    if (await ensureConnected())
      msg.textContent = 'Installé ✓ La voiture est prête.';
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      msg.textContent = '';
      toast('Installation impossible : ' + err.message, 'error', 9000);
    }
    setStatus(false);
  } finally {
    bar.hidden = true;
    $('btnFlash').disabled = false;
  }
};

if (!CarLink.supported())
  setStatus(false, 'Simulateur seulement (Chrome/Edge pour la voiture)');

// Examples

// Shows the top left of the program (where examples put their explanation).
function showProgramTop() {
  const box = ws.getBlocksBoundingBox();
  const scale = ws.getScale();
  ws.scroll(-box.left * scale + 30, -box.top * scale + 20);
}

function openExample(ex) {
  const blocks = ws.getAllBlocks(false).length;
  if (blocks > 1 && !confirm('Remplacer ton programme par l\'exemple « ' + ex.title + ' » ?\n(Pense à l\'enregistrer avant si tu veux le garder.)'))
    return;
  sim.stop();
  ws.clear();
  Blockly.serialization.workspaces.load(ex.workspace, ws);
  showProgramTop();
  setTimeout(() => sim.setHome(ex.sim), 50);
  $('examplesDlg').close();
  toast('📚 ' + ex.title + ' : clique sur ▶️ Simuler pour l\'essayer.', 'ok');
}

EXAMPLES.forEach((ex, i) => {
  const b = document.createElement('button');
  b.className = 'example';
  b.innerHTML = '<span class="n"></span><span><b></b><p class="d"></p><p class="learn"></p></span>';
  b.querySelector('.n').textContent = i + 1;
  b.querySelector('b').textContent = ex.title;
  b.querySelector('.d').textContent = ex.description;
  b.querySelector('.learn').textContent = 'On apprend : ' + ex.learn;
  b.onclick = () => openExample(ex);
  $('exampleList').appendChild(b);
});
$('btnExamples').onclick = () => $('examplesDlg').showModal();
$('btnCloseExamples').onclick = () => $('examplesDlg').close();
