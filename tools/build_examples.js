// Builds the example programs: examples/*.adeept.json (to open with 📂) and
// editor/examples.js (the 📚 Exemples menu).
// Run: node tools/build_examples.js

const fs = require('fs');
const path = require('path');

// Small helpers to write block programs.

function value(v) {
  if (typeof v === 'number')
    return {shadow: {type: 'math_number', fields: {NUM: v}}};
  return {block: v};
}

// blk(type, {fields}, {inputs}) where an input is a number, a block, or an array of statements.
function blk(type, fields = {}, inputs = {}) {
  const b = {type};
  if (Object.keys(fields).length)
    b.fields = fields;
  for (const [name, v] of Object.entries(inputs)) {
    b.inputs = b.inputs || {};
    if (Array.isArray(v)) {
      if (v.length)
        b.inputs[name] = {block: seq(v)};
    } else {
      b.inputs[name] = value(v);
    }
  }
  return b;
}

function seq(blocks) {
  for (let i = blocks.length - 2; i >= 0; i--)
    blocks[i].next = {block: blocks[i + 1]};
  return blocks[0];
}

const varField = name => ({VAR: {id: 'var_' + name}});
const get = name => blk('variables_get', varField(name));
const set = (name, v) => blk('variables_set', varField(name), {VALUE: v});
const change = (name, v) => blk('math_change', varField(name), {DELTA: v});

const move = cm => blk('car_move', {}, {CM: cm});
const back = cm => blk('car_back', {}, {CM: cm});
const turn = (dir, deg) => blk('car_turn', {DIR: dir}, {DEG: deg});
const drive = mode => blk('car_drive', {MODE: String(mode)});
const stop = () => blk('car_stop');
const speed = s => blk('car_speed', {SPEED: String(s)});
const wait = s => blk('car_wait', {}, {SEC: s});
const waitUntil = cond => blk('car_wait_until', {}, {COND: cond});
const repeat = (n, body) => blk('car_repeat', {}, {TIMES: n, DO: body});
const forever = body => blk('car_forever', {}, {DO: body});
const ifThen = (cond, body) => blk('car_if', {}, {COND: cond, DO: body});
const ifElse = (cond, yes, no) => blk('car_ifelse', {}, {COND: cond, DO: yes, ELSE: no});
const halt = () => blk('car_halt');

const leds = c => blk('car_leds', {COLOUR: c});
const led = (n, c) => blk('car_led', {COLOUR: c}, {N: n});
const ledsOff = () => blk('car_leds_off');
const face = f => blk('car_face', {FACE: String(f)});
const text = (t, line) => blk('car_text', {TEXT: t, LINE: String(line - 1)});
const textNum = (t, v, line) => blk('car_textnum', {TEXT: t, LINE: String(line - 1)}, {VALUE: v});
const cls = () => blk('car_cls');
const beep = () => blk('car_beep');
const note = (n, s) => blk('car_note', {NOTE: n}, {SEC: s});
const tune = t => blk('car_tune', {TUNE: String(t)});
const head = dir => blk('car_head', {DIR: String(dir)});

const distance = () => blk('car_distance');
const obstacle = cm => blk('car_obstacle', {}, {CM: cm});
const line = which => blk('car_line', {WHICH: String(which)});
const light = () => blk('car_light');
const key = k => blk('car_key', {KEY: String(k)});
const timer = () => blk('car_timer');
const timerReset = () => blk('car_timer_reset');
const op = (type, a, b) => blk(type, {}, b === undefined ? {A: a} : {A: a, B: b});
const lt = (a, b) => op('op_lt', a, b);
const gt = (a, b) => op('op_gt', a, b);
const and = (a, b) => op('op_and', a, b);
const random = (a, b) => op('op_random', a, b);

// Colours, faces, keys, notes, tunes (same values as editor/blocks.js).
const RED = '255,0,0', ORANGE = '255,90,0', YELLOW = '255,200,0', GREEN = '0,255,0',
  CYAN = '0,220,255', BLUE = '0,0,255', PURPLE = '150,0,255', PINK = '255,0,120', WHITE = '255,255,255';
const F = {happy: 0, open: 1, left: 2, right: 3, sad: 4, surprised: 5, angry: 6, asleep: 7,
  hearts: 8, wink: 9, ko: 10, arrowLeft: 11, arrowRight: 12, arrowUp: 13, arrowDown: 14};
const K = {ok: 16, up: 12, down: 13, left: 14, right: 15, hash: 11};
const DO = '262', RE = '294', MI = '330', FA = '349', SOL = '392', LA = '440', SI = '494', DO2 = '523';
const T = {win: 0, lose: 1, alarm: 2, birthday: 3, robot: 4, siren: 5};
const DRIVE = {forward: 1, backward: 2, spinLeft: 3, spinRight: 4, curveLeft: 7, curveRight: 8};

// The examples, from the simplest to the most advanced.

const START_LEFT = {x: 40, y: 80, heading: 0};
const ON_TRACK = {x: 120, y: 130, heading: 180};

const EXAMPLES = [
  {
    file: '01-bonjour',
    title: 'Bonjour !',
    description: 'La voiture se réveille : elle ouvre les yeux, écrit sur son écran, allume ses lumières et chante. Elle ne bouge pas encore.',
    learn: 'yeux, écran, lumières, musique, attendre',
    program: [
      face(F.asleep),
      wait(1),
      face(F.open),
      text('Bonjour !', 1),
      text('Je suis', 3),
      text('ta voiture', 4),
      leds(BLUE),
      wait(1),
      face(F.wink),
      tune(T.robot),
      face(F.happy),
      leds(GREEN),
    ],
  },
  {
    file: '02-carre',
    title: 'Le carré',
    description: 'La voiture dessine un carré : 4 fois « avancer puis tourner d\'un quart de tour ». Essaie de faire un triangle (3 fois, 120 degrés) !',
    learn: 'avancer, tourner, répéter',
    program: [
      face(F.happy),
      repeat(4, [
        move(40),
        turn('R', 90),
      ]),
      tune(T.win),
    ],
  },
  {
    file: '03-danse',
    title: 'La danse',
    description: 'Une petite chorégraphie : la voiture se tortille, change de couleur et fait de la musique. Invente tes propres pas de danse !',
    learn: 'enchaîner des mouvements, des sons et des couleurs',
    program: [
      text('Disco !', 2),
      repeat(2, [
        leds(PINK),
        face(F.left),
        turn('L', 45),
        note(DO, 0.2),
        leds(CYAN),
        face(F.right),
        turn('R', 90),
        note(MI, 0.2),
        leds(YELLOW),
        face(F.left),
        turn('L', 45),
        note(SOL, 0.2),
      ]),
      leds(PURPLE),
      move(15),
      back(15),
      face(F.hearts),
      blk('car_uturn'),
      leds(RED),
      tune(T.robot),
      blk('car_uturn'),
      face(F.happy),
      ledsOff(),
    ],
  },
  {
    file: '04-taxi',
    title: 'Taxi autonome',
    description: 'Le taxi tourne en rond dans la ville. À chaque arrêt, il joue une musique, fait clignoter ses lumières orange pendant 10 secondes et compte les arrêts sur son écran.',
    learn: 'répéter indéfiniment, variable qui compte',
    sim: {x: 20, y: 145, heading: 270},
    program: [
      set('arrets', 0),
      text('TAXI', 1),
      forever([
        text('En route', 3),
        face(F.open),
        move(80),
        turn('R', 90),
        move(50),
        stop(),
        change('arrets', 1),
        textNum('Arret', get('arrets'), 3),
        face(F.happy),
        tune(T.win),
        repeat(5, [
          leds(ORANGE),
          wait(1),
          ledsOff(),
          wait(1),
        ]),
        turn('R', 90),
      ]),
    ],
  },
  {
    file: '05-telecommande',
    title: 'Voiture télécommandée',
    description: 'Pilote la voiture avec les flèches de la télécommande. Tant qu\'on appuie, elle roule ; quand on lâche, elle s\'arrête. Les yeux montrent la direction.',
    learn: 'si … alors … sinon, touches de la télécommande, rouler sans s\'arrêter',
    program: [
      speed(85),
      forever([
        ifElse(key(K.up), [drive(DRIVE.forward), face(F.arrowUp)], [
          ifElse(key(K.down), [drive(DRIVE.backward), face(F.arrowDown)], [
            ifElse(key(K.left), [drive(DRIVE.spinLeft), face(F.left)], [
              ifElse(key(K.right), [drive(DRIVE.spinRight), face(F.right)], [
                stop(),
                face(F.open),
              ]),
            ]),
          ]),
        ]),
      ]),
    ],
  },
  {
    file: '06-telecommande-musicale',
    title: 'Télécommande musicale',
    description: 'Comme la voiture télécommandée, mais les chiffres font des choses : 1 à 7 jouent Do Ré Mi Fa Sol La Si, 8 allume un arc-en-ciel, 9 met la sirène, 0 éteint tout, OK fait un clin d\'œil.',
    learn: 'plusieurs « si » à la suite',
    program: [
      speed(85),
      forever([
        ifElse(key(K.up), [drive(DRIVE.forward)], [
          ifElse(key(K.down), [drive(DRIVE.backward)], [
            ifElse(key(K.left), [drive(DRIVE.spinLeft)], [
              ifElse(key(K.right), [drive(DRIVE.spinRight)], [stop()]),
            ]),
          ]),
        ]),
        ifThen(key(1), [note(DO, 0.2)]),
        ifThen(key(2), [note(RE, 0.2)]),
        ifThen(key(3), [note(MI, 0.2)]),
        ifThen(key(4), [note(FA, 0.2)]),
        ifThen(key(5), [note(SOL, 0.2)]),
        ifThen(key(6), [note(LA, 0.2)]),
        ifThen(key(7), [note(SI, 0.2)]),
        ifThen(key(8), [
          led(1, RED), led(2, ORANGE), led(3, YELLOW), led(4, GREEN),
          led(5, CYAN), led(6, BLUE), led(7, PURPLE),
        ]),
        ifThen(key(9), [leds(BLUE), tune(T.siren), ledsOff()]),
        ifThen(key(0), [ledsOff(), blk('car_face_off')]),
        ifThen(key(K.ok), [face(F.wink)]),
      ]),
    ],
  },
  {
    file: '07-radar',
    title: 'Radar',
    description: 'La voiture ne bouge pas : elle mesure la distance devant elle et l\'écrit. Vert = c\'est loin, orange = attention, rouge = trop près (et elle bipe) ! Approche ta main.',
    learn: 'capteur de distance, variable, comparer des nombres',
    program: [
      forever([
        set('d', distance()),
        textNum('Dist', get('d'), 1),
        text('cm', 2),
        ifElse(lt(get('d'), 20), [
          leds(RED),
          face(F.surprised),
          beep(),
        ], [
          ifElse(lt(get('d'), 50), [
            leds(ORANGE),
            face(F.open),
          ], [
            leds(GREEN),
            face(F.happy),
          ]),
        ]),
        wait(0.2),
      ]),
    ],
  },
  {
    file: '08-de-electronique',
    title: 'Dé électronique',
    description: 'Appuie sur OK : la voiture lance un dé. Elle allume autant de lumières que le résultat et l\'écrit sur l\'écran.',
    learn: 'nombre aléatoire, variables, répéter un nombre de fois qui change',
    program: [
      text('Appuie', 1),
      text('sur OK', 2),
      forever([
        waitUntil(key(K.ok)),
        cls(),
        face(F.ko),
        repeat(6, [
          led(random(1, 7), WHITE),
          note(LA, 0.05),
          ledsOff(),
        ]),
        set('de', random(1, 6)),
        set('n', 1),
        repeat(get('de'), [
          led(get('n'), YELLOW),
          beep(),
          change('n', 1),
          wait(0.2),
        ]),
        textNum('De :', get('de'), 2),
        ifElse(gt(get('de'), 5), [face(F.hearts), tune(T.win)], [face(F.happy)]),
      ]),
    ],
  },
  {
    file: '09-garde-du-corps',
    title: 'Garde du corps',
    description: 'La voiture te suit ! Mets ta main devant elle : si elle est trop près, la voiture recule ; si elle s\'éloigne, la voiture avance. S\'il n\'y a personne, elle s\'endort.',
    learn: 'garder une distance, « et »',
    sim: START_LEFT,
    program: [
      speed(60),
      forever([
        set('d', distance()),
        ifElse(lt(get('d'), 15), [
          drive(DRIVE.backward),
          face(F.surprised),
        ], [
          ifElse(and(gt(get('d'), 25), lt(get('d'), 80)), [
            drive(DRIVE.forward),
            face(F.open),
          ], [
            stop(),
            ifElse(gt(get('d'), 80), [face(F.asleep)], [face(F.happy)]),
          ]),
        ]),
      ]),
    ],
  },
  {
    file: '10-eviteur-obstacles',
    title: 'Éviteur d\'obstacles',
    description: 'La voiture explore toute seule. Devant un obstacle, elle s\'arrête, recule, tourne la tête à gauche et à droite pour mesurer, puis part du côté où il y a le plus de place.',
    learn: 'attendre jusqu\'à, tourner la tête, comparer deux mesures',
    sim: {x: 40, y: 40, heading: 0},
    program: [
      speed(60),
      forever([
        head(0),
        face(F.open),
        leds(GREEN),
        drive(DRIVE.forward),
        waitUntil(obstacle(25)),
        stop(),
        leds(RED),
        face(F.surprised),
        beep(),
        back(10),
        head(-70),
        face(F.left),
        wait(0.5),
        set('gauche', distance()),
        head(70),
        face(F.right),
        wait(0.5),
        set('droite', distance()),
        head(0),
        ifElse(gt(get('gauche'), get('droite')), [turn('L', 90)], [turn('R', 90)]),
      ]),
    ],
  },
  {
    file: '11-suiveur-de-ligne',
    title: 'Suiveur de ligne',
    description: 'Trace une ligne noire au sol avec du ruban adhésif. La voiture la suit grâce à ses 3 capteurs du dessous. Si elle perd la ligne, elle se souvient de quel côté elle l\'a vue en dernier et tourne de ce côté pour la retrouver.',
    learn: 'capteurs de ligne, une variable qui sert de mémoire',
    sim: ON_TRACK,
    program: [
      speed(40),
      set('cote', 0),
      text('Je suis', 1),
      text('la ligne', 2),
      forever([
        ifElse(line(1), [
          drive(DRIVE.forward),
          face(F.arrowUp),
        ], [
          ifElse(line(0), [
            drive(DRIVE.spinLeft),
            face(F.left),
            set('cote', -1),
          ], [
            ifElse(line(2), [
              drive(DRIVE.spinRight),
              face(F.right),
              set('cote', 1),
            ], [
              face(F.surprised),
              ifElse(lt(get('cote'), 0), [drive(DRIVE.spinLeft)], [drive(DRIVE.spinRight)]),
            ]),
          ]),
        ]),
      ]),
    ],
  },
  {
    file: '12-suiveur-de-lumiere',
    title: 'Suiveur de lumière',
    description: 'La voiture va vers la lumière, comme un papillon de nuit. Éclaire-la avec une lampe de poche sur un côté. Dans le simulateur, la lampe est en haut à gauche.',
    learn: 'capteur de lumière, nombres négatifs',
    sim: {x: 210, y: 40, heading: 90},
    program: [
      speed(40),
      forever([
        set('lumiere', light()),
        textNum('Lum', get('lumiere'), 1),
        ifElse(obstacle(15), [
          stop(),
          face(F.hearts),
          leds(YELLOW),
        ], [
          ledsOff(),
          ifElse(lt(get('lumiere'), -20), [
            drive(DRIVE.spinLeft),
            face(F.left),
          ], [
            ifElse(gt(get('lumiere'), 20), [
              drive(DRIVE.spinRight),
              face(F.right),
            ], [
              drive(DRIVE.forward),
              face(F.open),
            ]),
          ]),
        ]),
      ]),
    ],
  },
  {
    file: '13-jeu-de-reflexes',
    title: 'Jeu de réflexes',
    description: 'Attention… Quand les lumières deviennent vertes, appuie vite sur OK ! La voiture chronomètre ton temps de réaction. Moins de 0,5 seconde : bravo ! Mais si tu appuies trop tôt, c\'est perdu. Appuie encore sur OK pour rejouer.',
    learn: 'chronomètre, attendre un temps au hasard, répéter jusqu\'à',
    program: [
      cls(),
      text('Pret ?', 1),
      leds(RED),
      face(F.open),
      set('attente', random(2, 5)),
      timerReset(),
      blk('car_repeat_until', {}, {COND: gt(timer(), get('attente')), DO: [
        ifThen(key(K.ok), [
          ledsOff(),
          text('Trop tot !', 2),
          face(F.angry),
          tune(T.lose),
          halt(),
        ]),
      ]}),
      leds(GREEN),
      face(F.arrowUp),
      text('VITE !', 1),
      timerReset(),
      waitUntil(key(K.ok)),
      set('temps', timer()),
      ledsOff(),
      textNum('Temps', get('temps'), 2),
      ifElse(lt(get('temps'), 0.5), [
        text('Bravo !', 4),
        face(F.hearts),
        tune(T.win),
      ], [
        text('Encore !', 4),
        face(F.sad),
        tune(T.lose),
      ]),
    ],
  },
];

// Output

const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'examples'), {recursive: true});
const bundle = [];
// Variable names used by a block tree.
function varsIn(node, found = new Set()) {
  if (Array.isArray(node))
    node.forEach(n => varsIn(n, found));
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) {
      if (k === 'VAR' && v.id)
        found.add(v.id.slice('var_'.length));
      else
        varsIn(v, found);
    }
  return found;
}

for (const ex of EXAMPLES) {
  const start = blk('car_start');
  start.x = 0;
  start.y = 170;
  start.next = {block: seq(ex.program)};
  const workspace = {
    blocks: {languageVersion: 0, blocks: [start]},
    variables: [...varsIn(start)].map(name => ({name, id: 'var_' + name})),
    workspaceComments: [{
      id: 'explication', x: 0, y: 0, width: 440, height: 150,
      text: `${ex.title}\n\n${ex.description}\n\nOn apprend : ${ex.learn}.`,
    }],
  };
  const data = {adeeptBlocs: 1, title: ex.title, description: ex.description, learn: ex.learn,
    sim: ex.sim || START_LEFT, workspace};
  fs.writeFileSync(path.join(root, 'examples', ex.file + '.adeept.json'), JSON.stringify(data, null, 1) + '\n');
  bundle.push({file: ex.file, ...data});
}
fs.writeFileSync(path.join(root, 'editor', 'examples.js'),
  '// Generated by tools/build_examples.js: do not edit by hand.\n' +
  'const EXAMPLES = ' + JSON.stringify(bundle) + ';\n');
console.log(`${EXAMPLES.length} examples written`);
