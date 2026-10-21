// Block definitions and toolbox for the Adeept 4WD Smart Car.

const COLOURS = {
  motion: '#4C97FF',
  sensing: '#5CB1D6',
  lights: '#0FBD8C',
  looks: '#9966FF',
  sound: '#CF63CF',
  control: '#FFAB19',
  operators: '#59C059',
  variables: '#FF8C1A',
};

const COLOUR_CHOICES = [
  ['🔴 rouge', '255,0,0'],
  ['🟠 orange', '255,90,0'],
  ['🟡 jaune', '255,200,0'],
  ['🟢 vert', '0,255,0'],
  ['🩵 cyan', '0,220,255'],
  ['🔵 bleu', '0,0,255'],
  ['🟣 violet', '150,0,255'],
  ['🩷 rose', '255,0,120'],
  ['⚪ blanc', '255,255,255'],
];

const KEY_CHOICES = [
  ['OK', '16'], ['▲ haut', '12'], ['▼ bas', '13'], ['◀ gauche', '14'], ['▶ droite', '15'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'],
  ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'], ['0', '0'], ['#', '11'],
];

const FACE_CHOICES = [
  ['😊 contents', '0'], ['👀 ouverts', '1'], ['👈 qui regardent à gauche', '2'],
  ['👉 qui regardent à droite', '3'], ['😢 tristes', '4'], ['😮 surpris', '5'],
  ['😠 en colère', '6'], ['😴 endormis', '7'], ['😍 en cœur', '8'], ['😉 clin d\'œil', '9'],
  ['😵 KO', '10'], ['⬅️ flèche gauche', '11'], ['➡️ flèche droite', '12'],
  ['⬆️ flèche haut', '13'], ['⬇️ flèche bas', '14'],
];

const NOTE_CHOICES = [
  ['Do', '262'], ['Ré', '294'], ['Mi', '330'], ['Fa', '349'], ['Sol', '392'],
  ['La', '440'], ['Si', '494'], ['Do aigu', '523'],
];

const TUNE_CHOICES = [
  ['🏆 victoire', '0'], ['😢 perdu', '1'], ['🚨 alarme', '2'],
  ['🎂 joyeux anniversaire', '3'], ['🤖 robot', '4'], ['🚓 sirène', '5'],
];

function num(name) {
  return {type: 'input_value', name};
}

function bool(name) {
  return {type: 'input_value', name, check: 'Boolean'};
}

function dropdown(name, options) {
  return {type: 'field_dropdown', name, options};
}

function stmt(type, message, args, colour, extra = {}) {
  return {type, message0: message, args0: args, previousStatement: null, nextStatement: null,
          colour, inputsInline: true, ...extra};
}

function reporter(type, message, args, colour, output = 'Number', extra = {}) {
  return {type, message0: message, args0: args, output, colour, inputsInline: true, ...extra};
}

const BLOCK_DEFS = [
  // Mouvement
  stmt('car_move', 'avancer de %1 cm', [num('CM')], COLOURS.motion,
       {tooltip: 'La voiture avance tout droit de cette distance puis s\'arrête.'}),
  stmt('car_back', 'reculer de %1 cm', [num('CM')], COLOURS.motion,
       {tooltip: 'La voiture recule de cette distance puis s\'arrête.'}),
  stmt('car_turn', 'tourner %1 de %2 degrés',
       [dropdown('DIR', [['à droite ↻', 'R'], ['à gauche ↺', 'L']]), num('DEG')], COLOURS.motion,
       {tooltip: 'Tourne sur place. 90 degrés = un quart de tour, 360 = un tour complet.'}),
  stmt('car_uturn', 'faire demi-tour', [], COLOURS.motion),
  stmt('car_strafe', 'glisser %1 de %2 cm',
       [dropdown('DIR', [['vers la gauche', 'L'], ['vers la droite', 'R']]), num('CM')], COLOURS.motion,
       {tooltip: 'Seulement avec les roues Mecanum : la voiture se déplace de côté.'}),
  stmt('car_drive', 'rouler %1', [dropdown('MODE', [
    ['tout droit', '1'], ['en arrière', '2'], ['en virage à gauche', '7'], ['en virage à droite', '8'],
    ['en tournant sur place à gauche', '3'], ['en tournant sur place à droite', '4']])], COLOURS.motion,
       {tooltip: 'La voiture roule sans s\'arrêter, jusqu\'au bloc « s\'arrêter ».'}),
  stmt('car_drive_mecanum', 'rouler %1', [dropdown('MODE', [
    ['en glissant à gauche', '5'], ['en glissant à droite', '6']])], COLOURS.motion,
       {tooltip: 'Seulement avec les roues Mecanum.'}),
  stmt('car_stop', 's\'arrêter', [], COLOURS.motion),
  stmt('car_speed', 'vitesse %1', [dropdown('SPEED', [
    ['normale', '60'], ['lente', '40'], ['rapide', '85'], ['à fond', '100']])], COLOURS.motion,
       {tooltip: 'Vitesse des blocs « rouler ». Les blocs en cm et en degrés gardent la vitesse réglée.'}),
  stmt('car_motors', 'moteurs gauche %1 % droite %2 %', [num('LEFT'), num('RIGHT')], COLOURS.motion,
       {tooltip: 'Pour les experts : puissance de chaque côté, de -100 (arrière) à 100 (avant).'}),

  // Capteurs
  reporter('car_distance', 'distance de l\'obstacle (cm)', [], COLOURS.sensing),
  reporter('car_obstacle', 'obstacle à moins de %1 cm ?', [num('CM')], COLOURS.sensing, 'Boolean'),
  reporter('car_line', 'le capteur %1 voit la ligne noire ?', [dropdown('WHICH', [
    ['du milieu', '1'], ['de gauche', '0'], ['de droite', '2']])], COLOURS.sensing, 'Boolean'),
  reporter('car_light', 'direction de la lumière', [], COLOURS.sensing, 'Number',
           {tooltip: 'Négatif : la lumière est à gauche. Positif : elle est à droite.'}),
  reporter('car_key', 'touche %1 de la télécommande appuyée ?', [dropdown('KEY', KEY_CHOICES)],
           COLOURS.sensing, 'Boolean'),
  reporter('car_battery', 'batterie (%)', [], COLOURS.sensing),
  reporter('car_timer', 'chronomètre', [], COLOURS.sensing, 'Number',
           {tooltip: 'Secondes écoulées depuis le départ ou la remise à zéro.'}),
  stmt('car_timer_reset', 'remettre le chronomètre à zéro', [], COLOURS.sensing),
  stmt('car_head', 'tourner la tête %1', [dropdown('DIR', [
    ['droit devant', '0'], ['vers la gauche', '-70'], ['vers la droite', '70']])], COLOURS.sensing,
       {tooltip: 'La tête porte le capteur de distance.'}),
  stmt('car_head_angle', 'tourner la tête de %1 degrés', [num('DEG')], COLOURS.sensing,
       {tooltip: '-90 = tout à gauche, 0 = devant, 90 = tout à droite.'}),

  // Lumières
  stmt('car_leds', 'allumer les lumières en %1', [dropdown('COLOUR', COLOUR_CHOICES)], COLOURS.lights),
  stmt('car_led', 'allumer la lumière n° %1 en %2', [num('N'), dropdown('COLOUR', COLOUR_CHOICES)],
       COLOURS.lights, {tooltip: 'Les lumières sont numérotées de 1 à 7.'}),
  stmt('car_leds_off', 'éteindre les lumières', [], COLOURS.lights),
  stmt('car_bright', 'luminosité des lumières %1 %', [num('PCT')], COLOURS.lights),

  // Apparence : yeux et écran
  stmt('car_face', 'yeux %1', [dropdown('FACE', FACE_CHOICES)], COLOURS.looks),
  stmt('car_face_off', 'éteindre les yeux', [], COLOURS.looks),
  stmt('car_text', 'écrire %1 sur la ligne %2',
       [{type: 'field_input', name: 'TEXT', text: 'Bonjour'}, dropdown('LINE', [['1', '0'], ['2', '1'], ['3', '2'], ['4', '3']])],
       COLOURS.looks, {tooltip: 'L\'écran a 4 lignes de 10 lettres.'}),
  stmt('car_textnum', 'écrire %1 et %2 sur la ligne %3',
       [{type: 'field_input', name: 'TEXT', text: 'Dist'}, num('VALUE'),
        dropdown('LINE', [['1', '0'], ['2', '1'], ['3', '2'], ['4', '3']])], COLOURS.looks),
  stmt('car_cls', 'effacer l\'écran', [], COLOURS.looks),

  // Sons
  stmt('car_beep', 'bip !', [], COLOURS.sound),
  stmt('car_note', 'jouer la note %1 pendant %2 secondes', [dropdown('NOTE', NOTE_CHOICES), num('SEC')], COLOURS.sound),
  stmt('car_tune', 'jouer la musique %1', [dropdown('TUNE', TUNE_CHOICES)], COLOURS.sound),
  stmt('car_tone', 'jouer un son de %1 Hz pendant %2 secondes', [num('HZ'), num('SEC')], COLOURS.sound),

  // Contrôle
  {type: 'car_start', message0: 'quand le programme démarre 🏁', nextStatement: null,
   colour: COLOURS.control, tooltip: 'Le programme commence ici.'},
  stmt('car_wait', 'attendre %1 secondes', [num('SEC')], COLOURS.control),
  stmt('car_repeat', 'répéter %1 fois %2 %3', [num('TIMES'), {type: 'input_dummy'}, {type: 'input_statement', name: 'DO'}],
       COLOURS.control),
  {type: 'car_forever', message0: 'répéter indéfiniment %1 %2', args0: [{type: 'input_dummy'}, {type: 'input_statement', name: 'DO'}],
   previousStatement: null, colour: COLOURS.control},
  stmt('car_if', 'si %1 alors %2 %3', [bool('COND'), {type: 'input_dummy'}, {type: 'input_statement', name: 'DO'}],
       COLOURS.control),
  {type: 'car_ifelse', message0: 'si %1 alors %2 %3', args0: [bool('COND'), {type: 'input_dummy'}, {type: 'input_statement', name: 'DO'}],
   message1: 'sinon %1 %2', args1: [{type: 'input_dummy'}, {type: 'input_statement', name: 'ELSE'}],
   previousStatement: null, nextStatement: null, colour: COLOURS.control, inputsInline: true},
  stmt('car_wait_until', 'attendre jusqu\'à %1', [bool('COND')], COLOURS.control),
  stmt('car_repeat_until', 'répéter jusqu\'à %1 %2 %3', [bool('COND'), {type: 'input_dummy'}, {type: 'input_statement', name: 'DO'}],
       COLOURS.control),
  {type: 'car_halt', message0: 'arrêter le programme', previousStatement: null, colour: COLOURS.control},

  // Opérateurs
  reporter('op_add', '%1 + %2', [num('A'), num('B')], COLOURS.operators),
  reporter('op_sub', '%1 - %2', [num('A'), num('B')], COLOURS.operators),
  reporter('op_mul', '%1 × %2', [num('A'), num('B')], COLOURS.operators),
  reporter('op_div', '%1 ÷ %2', [num('A'), num('B')], COLOURS.operators),
  reporter('op_random', 'nombre aléatoire entre %1 et %2', [num('A'), num('B')], COLOURS.operators),
  reporter('op_gt', '%1 > %2', [num('A'), num('B')], COLOURS.operators, 'Boolean'),
  reporter('op_lt', '%1 < %2', [num('A'), num('B')], COLOURS.operators, 'Boolean'),
  reporter('op_eq', '%1 = %2', [num('A'), num('B')], COLOURS.operators, 'Boolean'),
  reporter('op_and', '%1 et %2', [bool('A'), bool('B')], COLOURS.operators, 'Boolean'),
  reporter('op_or', '%1 ou %2', [bool('A'), bool('B')], COLOURS.operators, 'Boolean'),
  reporter('op_not', 'non %1', [bool('A')], COLOURS.operators, 'Boolean'),
  reporter('op_mod', 'reste de %1 divisé par %2', [num('A'), num('B')], COLOURS.operators),
  reporter('op_round', 'arrondi de %1', [num('A')], COLOURS.operators),
];

Blockly.common.defineBlocksWithJsonArray(BLOCK_DEFS);

// Toolbox

function shadowNum(v) {
  return {shadow: {type: 'math_number', fields: {NUM: v}}};
}

function tb(type, inputs) {
  const b = {kind: 'block', type};
  if (inputs) {
    b.inputs = {};
    for (const [k, v] of Object.entries(inputs))
      b.inputs[k] = shadowNum(v);
  }
  return b;
}

function buildToolbox(mecanum) {
  const motion = [
    tb('car_move', {CM: 20}),
    tb('car_back', {CM: 20}),
    tb('car_turn', {DEG: 90}),
    tb('car_uturn'),
  ];
  if (mecanum)
    motion.push(tb('car_strafe', {CM: 20}));
  motion.push(
    {kind: 'sep', gap: 24},
    tb('car_drive'),
  );
  if (mecanum)
    motion.push(tb('car_drive_mecanum'));
  motion.push(
    tb('car_stop'),
    tb('car_speed'),
    {kind: 'sep', gap: 24},
    tb('car_motors', {LEFT: 50, RIGHT: 50}),
  );
  return {
    kind: 'categoryToolbox',
    contents: [
      {kind: 'category', name: 'Mouvement', colour: COLOURS.motion, contents: motion},
      {kind: 'category', name: 'Capteurs', colour: COLOURS.sensing, contents: [
        tb('car_distance'),
        tb('car_obstacle', {CM: 20}),
        tb('car_line'),
        tb('car_light'),
        tb('car_key'),
        tb('car_battery'),
        tb('car_timer'),
        tb('car_timer_reset'),
        {kind: 'sep', gap: 24},
        tb('car_head'),
        tb('car_head_angle', {DEG: 45}),
      ]},
      {kind: 'category', name: 'Lumières', colour: COLOURS.lights, contents: [
        tb('car_leds'),
        tb('car_led', {N: 1}),
        tb('car_leds_off'),
        tb('car_bright', {PCT: 50}),
      ]},
      {kind: 'category', name: 'Yeux & écran', colour: COLOURS.looks, contents: [
        tb('car_face'),
        tb('car_face_off'),
        {kind: 'sep', gap: 24},
        tb('car_text'),
        tb('car_textnum', {VALUE: 0}),
        tb('car_cls'),
      ]},
      {kind: 'category', name: 'Sons', colour: COLOURS.sound, contents: [
        tb('car_beep'),
        tb('car_note', {SEC: 0.5}),
        tb('car_tune'),
        tb('car_tone', {HZ: 440, SEC: 0.5}),
      ]},
      {kind: 'category', name: 'Contrôle', colour: COLOURS.control, contents: [
        tb('car_start'),
        tb('car_wait', {SEC: 1}),
        tb('car_repeat', {TIMES: 4}),
        tb('car_forever'),
        tb('car_if'),
        tb('car_ifelse'),
        tb('car_wait_until'),
        tb('car_repeat_until'),
        tb('car_halt'),
      ]},
      {kind: 'category', name: 'Opérateurs', colour: COLOURS.operators, contents: [
        tb('op_add', {A: '', B: ''}),
        tb('op_sub', {A: '', B: ''}),
        tb('op_mul', {A: '', B: ''}),
        tb('op_div', {A: '', B: ''}),
        tb('op_random', {A: 1, B: 10}),
        tb('op_gt', {A: '', B: 50}),
        tb('op_lt', {A: '', B: 50}),
        tb('op_eq', {A: '', B: 50}),
        tb('op_and'),
        tb('op_or'),
        tb('op_not'),
        tb('op_mod', {A: '', B: 2}),
        tb('op_round', {A: ''}),
      ]},
      {kind: 'category', name: 'Variables', colour: COLOURS.variables, custom: 'CAR_VARIABLES'},
    ],
  };
}

function variablesFlyout(ws) {
  const items = [{kind: 'button', text: 'Créer une variable', callbackKey: 'CREATE_VARIABLE'}];
  const vars = ws.getVariableMap().getVariablesOfType('');
  vars.sort((a, b) => a.getName().localeCompare(b.getName()));
  for (const v of vars)
    items.push({kind: 'block', type: 'variables_get', fields: {VAR: {name: v.getName()}}});
  if (vars.length) {
    const first = {name: vars[0].getName()};
    items.push(
      {kind: 'block', type: 'variables_set', fields: {VAR: first}, inputs: {VALUE: shadowNum(0)}},
      {kind: 'block', type: 'math_change', fields: {VAR: first}, inputs: {DELTA: shadowNum(1)}},
    );
  }
  return items;
}

function registerVariables(ws) {
  ws.registerToolboxCategoryCallback('CAR_VARIABLES', variablesFlyout);
  ws.registerButtonCallback('CREATE_VARIABLE', (button) => {
    Blockly.Variables.createVariableButtonHandler(button.getTargetWorkspace());
  });
}

const CAR_THEME = Blockly.Theme.defineTheme('carScratch', {
  base: Blockly.Themes.Classic,
  startHats: true,
  blockStyles: {
    variable_blocks: {colourPrimary: COLOURS.variables, colourSecondary: '#FFA54C', colourTertiary: '#DB6E00'},
    math_blocks: {colourPrimary: COLOURS.operators, colourSecondary: '#46B946', colourTertiary: '#389438'},
  },
  componentStyles: {
    workspaceBackgroundColour: '#F9F9F9',
    toolboxBackgroundColour: '#FFFFFF',
    toolboxForegroundColour: '#575E75',
    flyoutBackgroundColour: '#F2F2F2',
    flyoutOpacity: 1,
    scrollbarColour: '#CECDCE',
    insertionMarkerColour: '#000000',
    insertionMarkerOpacity: 0.2,
  },
  fontStyle: {family: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: '500', size: 12},
});
