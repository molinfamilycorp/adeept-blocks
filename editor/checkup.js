// Checkup: runs small programs on the car, one feature at a time, and asks the user
// what happened. Answers can fix the settings (wheel directions, head port...).

const YES = {label: '✅ Oui', result: 'ok'};
const NO = {label: '❌ Non', result: 'fail'};
const WHEEL_PLACES = ['arrière gauche', 'avant gauche', 'avant droite', 'arrière droite'];
const SCREEN_PLACES = ['arr gauche', 'av gauche', 'av droite', 'arr droite'];
const HEAD_PORTS = ['A1', 'A2', 'CH6', 'CH7'];
const KEY_NAMES = {10: '*', 11: '#', 12: '▲', 13: '▼', 14: '◀', 15: '▶', 16: 'OK'};

// Helpers to write the test programs directly in bytecode.
function say(e, line, text) {
  e.emit(OP.TEXT, line, text.length, ...[...text].map(c => c.charCodeAt(0)));
}

function pause(e, seconds) {
  e.push(seconds);
  e.emit(OP.WAIT);
}

function testProgram(build, overrides = {}) {
  const e = new Emitter();
  build(e);
  e.emit(OP.END);
  return buildImage(e.code, 0, {...settings, ...overrides}).bytes;
}

function toggleWheel(i) {
  settings.invertWheels = settings.invertWheels.slice();
  settings.invertWheels[i] = !settings.invertWheels[i];
}

const CHECKUP_STEPS = [
  {
    id: 'start', group: 'Préparation', title: 'Avant de commencer', kind: 'start',
    setup: 'Branche la voiture avec le câble USB et allume-la. Pose-la sur une boîte, les roues dans le vide : elles vont tourner.',
  },

  {
    id: 'screen', group: 'Affichage et son', title: 'Écran',
    program: () => testProgram(e => { say(e, 0, 'Bonjour'); say(e, 2, 'Checkup'); pause(e, 0.5); }),
    question: 'Sur le petit écran, vois-tu « Bonjour » et « Checkup » ?',
    answers: [YES, NO],
  },
  {
    id: 'eyes', group: 'Affichage et son', title: 'Yeux (matrice de LED)',
    program: () => testProgram(e => { e.emit(OP.FACE, 8); pause(e, 1); e.emit(OP.FACE, 0); pause(e, 0.5); }),
    question: 'Les yeux ont-ils montré deux cœurs, puis deux yeux contents ?',
    answers: [YES, NO],
  },
  {
    id: 'lights', group: 'Affichage et son', title: 'Lumières de couleur',
    program: () => testProgram(e => {
      for (const c of [[255, 0, 0], [0, 255, 0], [0, 0, 255]]) {
        e.emit(OP.LEDS, ...c);
        pause(e, 0.8);
      }
      e.emit(OP.LEDS, 0, 0, 0);
    }),
    question: 'Les 7 lumières ont-elles été rouges, puis vertes, puis bleues ?',
    answers: [YES, {label: '🟡 Seulement certaines', result: 'fail'}, NO],
  },
  {
    id: 'sound', group: 'Affichage et son', title: 'Son',
    program: () => testProgram(e => e.emit(OP.TUNE, 0)),
    question: 'As-tu entendu une petite musique ?',
    answers: [YES, NO],
  },

  ...[0, 1, 2, 3].map(i => ({
    id: 'wheel' + i, group: 'Roues (voiture sur la boîte)', title: `Roue M${i + 1} (${WHEEL_PLACES[i]})`,
    setup: 'La voiture est toujours sur la boîte, roues dans le vide. Une seule roue va tourner pendant 1,5 seconde.',
    program: () => testProgram(e => {
      say(e, 0, `Roue M${i + 1}`);
      say(e, 1, SCREEN_PLACES[i]);
      e.push(70);
      e.emit(OP.WHEEL, i);
      pause(e, 1.5);
      e.push(0);
      e.emit(OP.WHEEL, i);
    }),
    question: `La roue ${WHEEL_PLACES[i]} a-t-elle tourné, et dans quel sens ?`,
    answers: [
      {label: '⬆️ Vers l\'avant', result: 'ok'},
      {label: '⬇️ Vers l\'arrière', result: 'fixed', note: 'sens corrigé', fix: () => toggleWheel(i)},
      {label: '🔀 Une autre roue a tourné', result: 'fail'},
      {label: '❌ Rien n\'a tourné', result: 'fail'},
    ],
  })),

  {
    id: 'floor', group: 'Déplacements (voiture au sol)', title: 'Pose la voiture par terre', kind: 'info',
    setup: 'Pose la voiture par terre, avec au moins 50 cm de place devant elle, le câble assez long pour la suivre.',
  },
  {
    id: 'move', group: 'Déplacements (voiture au sol)', title: 'Avancer de 20 cm',
    program: () => testProgram(e => { e.push(20); e.emit(OP.MOVE); }),
    question: 'La voiture a-t-elle avancé tout droit, d\'environ 20 cm ?',
    answers: [YES,
      {label: '📏 Oui, mais pas 20 cm', result: 'ok', note: 'régler la vitesse en cm/s dans Réglages'},
      {label: '↪️ Elle a tourné ou reculé', result: 'fail'},
      {label: '❌ Elle n\'a pas bougé', result: 'fail'}],
  },
  {
    id: 'turn', group: 'Déplacements (voiture au sol)', title: 'Tourner à droite de 90°',
    program: () => testProgram(e => { e.push(90); e.emit(OP.TURN); }),
    question: 'A-t-elle tourné sur place vers la droite, d\'environ un quart de tour ?',
    answers: [YES,
      {label: '📐 Oui, mais pas un quart de tour', result: 'ok', note: 'régler le temps du quart de tour dans Réglages'},
      {label: '↩️ Vers la gauche', result: 'fail'},
      {label: '❌ Elle n\'a pas bougé', result: 'fail'}],
  },
  {
    id: 'drive', group: 'Déplacements (voiture au sol)', title: 'Bloc « rouler tout droit »',
    program: () => testProgram(e => { e.emit(OP.DRIVE, 1); pause(e, 1); e.emit(OP.DRIVE, 0); }),
    question: 'A-t-elle roulé tout droit pendant 1 seconde, puis s\'est-elle arrêtée ?',
    answers: [YES, {label: '↪️ Elle a tourné', result: 'fail'}, {label: '❌ Elle n\'a pas bougé', result: 'fail'}],
  },
  {
    id: 'driveLoop', group: 'Déplacements (voiture au sol)', title: '« Rouler » répété en boucle',
    setup: 'Comme dans le programme de la voiture télécommandée : la commande « rouler » est répétée sans arrêt pendant 1,5 seconde.',
    program: () => testProgram(e => {
      e.emit(OP.TIMER_RESET);
      const top = e.here();
      e.emit(OP.DRIVE, 1, OP.FACE, 13, OP.TIMER);
      e.push(1.5);
      e.emit(OP.GT);
      e.jump(OP.JZ, top);
      e.emit(OP.DRIVE, 0, OP.FACE, 0);
    }),
    question: 'A-t-elle roulé tout droit pendant 1,5 seconde ?',
    answers: [YES, {label: '🐢 Par à-coups', result: 'fail'}, {label: '❌ Elle n\'a pas bougé', result: 'fail'}],
  },

  ...[0, 1, 2, 3].map(port => ({
    id: 'head' + port, group: 'Tête (capteur de distance)', title: `Tête branchée sur ${HEAD_PORTS[port]} ?`,
    setup: port === 0
      ? 'La tête porte le capteur de distance (les deux « yeux » argentés). D\'après la notice, son servo est branché sur A1.'
      : `Elle n'a pas bougé sur ${HEAD_PORTS[port - 1]} : on essaie la prise ${HEAD_PORTS[port]}.`,
    skip: results => [0, 1, 2, 3].slice(0, port).some(p => !results['head' + p] || results['head' + p].result !== 'fail'),
    program: () => testProgram(e => {
      e.push(-70); e.emit(OP.HEAD); pause(e, 0.7);
      e.push(70); e.emit(OP.HEAD); pause(e, 0.7);
      e.push(0); e.emit(OP.HEAD); pause(e, 0.5);
    }, {headPort: port}),
    question: 'La tête a-t-elle tourné d\'un côté, puis de l\'autre ?',
    answers: [
      {label: '✅ Oui', result: 'ok', note: `servo sur ${HEAD_PORTS[port]}`, fix: () => {
        const changed = settings.headPort !== port;
        settings.headPort = port;
        return changed ? 'fixed' : 'ok';
      }},
      {label: '❌ Non', result: 'fail'},
    ],
  })),
  {
    id: 'headSide', group: 'Tête (capteur de distance)', title: 'Sens de la tête',
    skip: results => ![0, 1, 2, 3].some(p => results['head' + p] && results['head' + p].result !== 'fail'),
    setup: 'Mets-toi derrière la voiture, comme si tu la conduisais.',
    program: () => testProgram(e => { e.push(-70); e.emit(OP.HEAD); pause(e, 1.2); e.push(0); e.emit(OP.HEAD); pause(e, 0.5); }),
    question: 'La tête a-t-elle regardé vers la gauche ?',
    answers: [YES, {label: '↪️ Non, vers la droite', result: 'fixed', note: 'sens corrigé',
      fix: () => { settings.invertHead = !settings.invertHead; }}],
  },

  {
    id: 'distance', group: 'Capteurs (valeurs en direct)', title: 'Capteur de distance', live: s => `Distance : ${Math.round(s.dist)} cm`,
    setup: 'Approche puis éloigne ta main devant la tête.',
    question: 'La distance diminue-t-elle quand ta main s\'approche (environ 10 cm à 10 cm) ?',
    answers: [YES, {label: '🔢 Elle ne change pas', result: 'fail'}, {label: '🤪 Valeurs bizarres', result: 'fail'}],
  },
  {
    id: 'line', group: 'Capteurs (valeurs en direct)', title: 'Capteurs de ligne (sous la voiture)',
    live: s => `Gauche ${s.line[0] ? '■' : '□'}   Milieu ${s.line[1] ? '■' : '□'}   Droite ${s.line[2] ? '■' : '□'}   (■ = noir)`,
    setup: 'Pose la voiture sur une feuille blanche, puis glisse une bande noire (ruban adhésif, feutre épais) sous chacun des 3 capteurs, à l\'avant sous la voiture.',
    question: 'Chaque carré devient-il noir quand la bande noire est sous son capteur ?',
    answers: [YES, {label: '🟡 Seulement certains', result: 'fail'}, {label: '🔄 C\'est l\'inverse (noir sur blanc)', result: 'fail'}, NO],
  },
  {
    id: 'light', group: 'Capteurs (valeurs en direct)', title: 'Capteur de lumière',
    live: s => `Lumière : ${s.light} (${s.light < -15 ? 'à gauche' : s.light > 15 ? 'à droite' : 'devant'})`,
    setup: 'Éclaire la voiture avec une lampe de poche, d\'abord par sa gauche, puis par sa droite.',
    question: 'La valeur devient-elle négative (à gauche) quand la lampe est à gauche, et positive à droite ?',
    answers: [YES, {label: '🔄 C\'est l\'inverse', result: 'fail', note: 'inverser le signe dans les programmes'},
      {label: '🔢 Elle ne change pas', result: 'fail'}],
  },
  {
    id: 'remote', group: 'Capteurs (valeurs en direct)', title: 'Télécommande',
    live: s => `Touche : ${s.key < 0 ? '—' : (KEY_NAMES[s.key] || s.key)}`,
    setup: 'Vise la voiture avec la télécommande. Appuie sur ▲ et garde le doigt dessus 3 secondes.',
    question: 'La flèche ▲ reste-t-elle affichée tant que tu appuies ?',
    answers: [YES, {label: '💡 Elle clignote', result: 'fail'}, {label: '❌ Rien ne s\'affiche', result: 'fail'}],
  },
  {
    id: 'battery', group: 'Capteurs (valeurs en direct)', title: 'Batterie', live: s => `Batterie : ${s.battery} %`,
    setup: 'Si les piles viennent d\'être chargées, la valeur doit être proche de 100 %.',
    question: 'La valeur paraît-elle juste ?',
    answers: [YES, NO],
  },
  {id: 'end', group: 'Fin', title: 'Résultat', kind: 'end'},
];

class Checkup {
  constructor() {
    this.dlg = $('checkupDlg');
    this.liveTimer = null;
    $('btnCheckup').onclick = () => this.open();
    $('btnCloseCheckup').onclick = () => this.dlg.close();
    this.dlg.addEventListener('close', () => this.stopLive());
  }

  open() {
    this.results = {};
    this.index = 0;
    this.dlg.showModal();
    this.show();
  }

  stopLive() {
    clearInterval(this.liveTimer);
    this.liveTimer = null;
  }

  next() {
    this.stopLive();
    do
      this.index++;
    while (CHECKUP_STEPS[this.index].skip && CHECKUP_STEPS[this.index].skip(this.results));
    this.show();
  }

  // An answer's fix() changes the settings; it may return the result to record instead of answer.result.
  record(step, answer) {
    let result = answer.result;
    if (answer.fix) {
      result = answer.fix() || result;
      saveJSON('adeept.settings', settings);
    }
    this.results[step.id] = {title: step.title, answer: answer.label, result, note: answer.note};
    if (step.id.startsWith('head') && result !== 'fail')
      // The head was found on this port: the ports tried before are not problems.
      for (const r of Object.entries(this.results))
        if (r[0] !== step.id && /^head\d$/.test(r[0]) && r[1].result === 'fail')
          r[1].result = 'info';
    this.next();
  }

  show() {
    const step = CHECKUP_STEPS[this.index];
    const steps = CHECKUP_STEPS.length;
    const body = $('checkupBody');
    body.innerHTML = '';
    const add = (tag, text, cls) => {
      const el = document.createElement(tag);
      if (text)
        el.textContent = text;
      if (cls)
        el.className = cls;
      body.appendChild(el);
      return el;
    };
    add('p', `${step.group} · étape ${this.index + 1} sur ${steps}`, 'cu-group');
    add('h3', step.title);
    if (step.setup)
      add('p', step.setup, 'cu-setup');

    if (step.kind === 'start')
      return this.showStart(add);
    if (step.kind === 'end')
      return this.showEnd(add);
    const row = add('div', null, 'row');
    const msg = add('p', '', 'cu-msg');
    if (step.kind === 'info') {
      const ok = document.createElement('button');
      ok.textContent = 'C\'est fait →';
      ok.onclick = () => this.next();
      row.appendChild(ok);
      return;
    }

    const question = add('p', step.question, 'cu-question');
    const answers = add('div', null, 'cu-answers');
    const buttons = step.answers.map(a => {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.onclick = () => this.record(step, a);
      answers.appendChild(b);
      return b;
    });
    const skip = document.createElement('button');
    skip.textContent = 'Passer';
    skip.className = 'secondary';
    skip.onclick = () => this.record(step, {label: 'passé', result: 'skip'});
    answers.appendChild(skip);

    if (step.live) {
      const live = document.createElement('div');
      live.className = 'cu-live';
      live.textContent = '…';
      body.insertBefore(live, question);
      const poll = async () => {
        if (!link.connected || link.busy)
          return;
        try {
          live.textContent = step.live(await link.sensors());
        } catch (e) {
          live.textContent = 'Pas de réponse de la voiture.';
        }
      };
      poll();
      this.liveTimer = setInterval(poll, 300);
      return;
    }

    // Steps with a program: the answers wait for the first run.
    buttons.forEach(b => { b.disabled = true; });
    question.style.opacity = 0.4;
    const run = document.createElement('button');
    run.textContent = '▶️ Lancer le test';
    run.style.background = 'var(--green)';
    run.onclick = async () => {
      run.disabled = true;
      msg.textContent = 'Le test est en cours… regarde bien la voiture !';
      try {
        const end = await link.runOnce(step.program());
        msg.textContent = end.startsWith('END') ? 'Test terminé.' : 'La voiture a répondu : ' + end;
      } catch (err) {
        msg.textContent = 'Le test n\'a pas pu être envoyé : ' + err.message;
      }
      run.disabled = false;
      run.textContent = '🔁 Relancer';
      buttons.forEach(b => { b.disabled = false; });
      question.style.opacity = 1;
    };
    row.appendChild(run);
  }

  showStart(add) {
    const row = add('div', null, 'row');
    const msg = add('p', '', 'cu-msg');
    const bar = add('progress');
    bar.max = 1;
    bar.hidden = true;
    const go = document.createElement('button');
    go.textContent = 'Connecter la voiture et commencer →';
    go.style.background = 'var(--green)';
    row.appendChild(go);
    go.onclick = async () => {
      if (!(await ensureConnected()))
        return;
      if (link.version >= FIRMWARE_VERSION)
        return this.next();
      msg.textContent = `Le programme de base de la voiture (v${link.version}) est plus ancien que l'éditeur (v${FIRMWARE_VERSION}). Il faut d'abord le mettre à jour.`;
      go.textContent = 'Mettre à jour le programme de base';
      go.onclick = async () => {
        if (await installFirmware(go, bar, msg))
          this.next();
      };
    };
  }

  report() {
    const date = new Date().toLocaleString('fr-FR');
    const wheels = settings.invertWheels.map((v, i) => v ? 'M' + (i + 1) : null).filter(Boolean);
    const lines = [
      `Checkup Adeept Blocs, ${date}`,
      `Éditeur v${FIRMWARE_VERSION}, voiture v${link.version ?? '?'}`,
      `Réglages : roues inversées ${wheels.length ? wheels.join(' ') : 'aucune'}, tête sur ${HEAD_PORTS[settings.headPort]}` +
        `${settings.invertHead ? ' (inversée)' : ''}, ${settings.cmps} cm/s, quart de tour ${settings.ms90} ms`,
      '',
    ];
    const mark = {ok: '✓', fixed: '✓ corrigé', fail: '✗', skip: '–', info: '·'};
    for (const step of CHECKUP_STEPS) {
      const r = this.results[step.id];
      if (r)
        lines.push(`${mark[r.result]}  ${r.title} : ${r.answer}${r.note ? ' (' + r.note + ')' : ''}`);
    }
    return lines.join('\n');
  }

  showEnd(add) {
    const all = Object.values(this.results);
    const fails = all.filter(r => r.result === 'fail').length;
    const fixed = all.filter(r => r.result === 'fixed').length;
    add('p', fails
      ? `${fails} problème(s) trouvé(s). Copie le rapport pour demander de l'aide.`
      : 'Tout ce qui a été testé fonctionne 🎉', 'cu-question');
    if (fixed)
      add('p', `${fixed} réglage(s) corrigé(s) automatiquement et enregistré(s) : ils seront utilisés dans les prochains programmes.`, 'cu-setup');
    const text = this.report();
    const pre = add('pre', text, 'cu-report');
    pre.tabIndex = 0;
    const row = add('div', null, 'row');
    const copy = document.createElement('button');
    copy.textContent = '📋 Copier le rapport';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = '📋 Copié ✓';
      } catch (e) {
        getSelection().selectAllChildren(pre);
        copy.textContent = 'Sélectionné : Cmd+C pour copier';
      }
    };
    const again = document.createElement('button');
    again.textContent = '🔁 Recommencer';
    again.className = 'secondary';
    again.onclick = () => this.open();
    row.append(copy, again);
  }
}

const checkup = new Checkup();
