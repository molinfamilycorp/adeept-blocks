# Adeept Blocs

Programmer la voiture **Adeept 4WD Smart Car Kit for Arduino (ADA038)** avec des blocs façon Scratch, en français, au lieu du C++ Arduino.

L'enfant assemble des blocs comme « avancer de 20 cm », « tourner à droite de 90 degrés », « si obstacle à moins de 20 cm alors… », « yeux contents », « jouer la musique victoire ». Il les essaie dans le simulateur, puis clique **Envoyer à la voiture**. Ensuite il débranche le câble et allume la voiture : elle joue le programme toute seule.

## Contenu

| Dossier | Rôle |
|---|---|
| `editor/` | L'éditeur de blocs (page web, fonctionne sans Internet) |
| `firmware/AdeeptBlocs/` | Le programme Arduino « de base » qui exécute les blocs sur la voiture |
| `firmware/AdeeptBlocs.hex` | Le même, déjà compilé |
| `tools/` | Outils pour le développeur (compilation, tests, visages de la matrice) |

## Mise en route (une seule fois, par un adulte)

1. Ouvrir l'éditeur en ligne, https://molinfamilycorp.github.io/adeept-blocks/, ou `editor/index.html` en local, dans **Chrome** ou **Edge** (double-clic sur le fichier). Firefox et Safari ne savent pas parler au port USB.
   Si le bouton « Connecter » ne fait rien, lancer un petit serveur :
   ```bash
   python3 -m http.server 8000 --directory editor
   ```
   puis ouvrir http://localhost:8000.
2. **Retirer le module WiFi ESP8266** de la carte : il partage le port série avec l'USB et empêche l'installation (on peut le remettre ensuite, mais il ne sert pas pour les blocs).
3. Brancher la voiture en USB. Sur Mac récent, le pilote CH340 est déjà intégré ; sinon il est dans le dossier `Adeept driver` des ressources Adeept.
4. ⚙️ **Réglages → Installer le programme de base**, choisir le port (`wchusbserial…` ou `usbserial…`). L'installation prend environ 15 secondes.
   *Autre méthode :* ouvrir `firmware/AdeeptBlocs/AdeeptBlocs.ino` dans l'IDE Arduino. Installer la bibliothèque **Adafruit NeoPixel**, choisir la carte « Arduino Uno » et téléverser.
5. **Vérifier le sens des roues** (même fenêtre). Poser la voiture sur une boîte, roues dans le vide, et cliquer « Tester chaque roue ». Les moteurs M1 à M4 (connecteurs D1 à D4 de la carte) tournent l'un après l'autre et l'écran affiche leur nom et leur place. D'après la notice de montage, M1 est à l'arrière gauche, M2 à l'avant gauche, M3 à l'avant droit et M4 à l'arrière droit. Chaque roue doit tourner vers l'avant : cocher celles qui tournent à l'envers. Par défaut, les roues de droite (M3, M4) sont cochées, car c'est ce qu'a montré notre voiture. Le code publié par Adeept commande pourtant les 4 moteurs de la même façon.
6. **Régler les déplacements** (même fenêtre). La voiture n'a pas de capteur de rotation des roues : elle calcule les distances et les angles en chronométrant les moteurs. Pose-la sur le sol où elle roulera, avec la batterie chargée :
   - « Essayer : avancer de 50 cm » : ajuster la vitesse en cm/s jusqu'à ce qu'elle fasse bien 50 cm ;
   - « Essayer : faire un tour complet » : ajuster le temps du quart de tour jusqu'à un tour bien complet.

   Ces essais ne remplacent pas le programme de l'enfant. Les réglages sont envoyés avec chaque programme. Ils changent avec le sol (carrelage ou tapis) et avec la charge de la batterie : il est normal de les refaire de temps en temps.
7. Cocher les cases de « Ma voiture » si besoin : roues Mecanum (ajoute les blocs « glisser »), tête inversée, démarrage par la touche OK.
8. Section « Capteurs en direct » : vérifier que la distance, les capteurs de ligne et la télécommande réagissent.

## Checkup

Le bouton **🩺 Checkup** vérifie la voiture pas à pas. Chaque étape envoie un petit programme, et tu réponds à ce que tu as vu :

- écran, yeux, lumières, son ;
- chaque roue, voiture sur une boîte ;
- avancer, tourner, « rouler », et « rouler » répété en boucle, voiture au sol ;
- la tête : sur A1 comme dans la notice, puis A2, CH6 et CH7 si elle ne bouge pas, puis son sens ;
- les capteurs en direct : distance, ligne, lumière, batterie ;
- la télécommande : une télécommande dessinée à l'écran, dont chaque touche passe au vert quand la voiture l'a décodée, avec le code reçu (même inconnu) et les trames abîmées ; puis une touche tenue.

Les réponses corrigent directement les réglages : sens des roues, prise et sens de la tête. À la fin, **Copier le rapport** donne un résumé à envoyer pour demander de l'aide. Le checkup demande le programme de base v4 ou plus récent, et propose de l'installer.

Selon la notice d'Adeept, les fils des moteurs doivent avoir des couleurs opposées d'un côté à l'autre. Si un côté est câblé comme l'autre, ses roues tournent à l'envers : le checkup le détecte et le corrige.

## Utilisation par l'enfant

- **▶️ Simuler** : la voiture roule à l'écran, avec le même programme. Le bloc en cours s'allume. Il y a une piste noire pour le suivi de ligne, une boîte rouge comme obstacle et une lampe dans le coin. La télécommande à l'écran (ou les flèches du clavier) remplace la vraie.
- **⬆️ Envoyer à la voiture** : le programme est enregistré dans la voiture et y reste même éteinte.
- À l'allumage, la voiture fait **3 bips** puis démarre. On peut aussi la lancer avec **OK** sur la télécommande.
- La touche **\*** de la télécommande (ou ⏹ Stop) arrête toujours le programme.
- **▶️ Lancer sur la voiture** envoie et démarre tout de suite, câble branché : attention à la table !
- 💾/📂 pour garder ses programmes dans des fichiers. Le travail en cours est aussi gardé automatiquement par le navigateur.

## Les exemples

Bouton **📚 Exemples** dans l'éditeur, ou fichiers du dossier `examples/` à ouvrir avec 📂. Ils vont du plus simple au plus avancé. Chacun porte une bulle d'explication et place la voiture au bon endroit dans le simulateur.

| # | Exemple | On apprend |
|---|---|---|
| 1 | Bonjour ! | yeux, écran, lumières, musique, attendre |
| 2 | Le carré | avancer, tourner, répéter |
| 3 | La danse | enchaîner mouvements, sons et couleurs |
| 4 | Taxi autonome | répéter indéfiniment, arrêts de 10 s, variable qui compte les arrêts |
| 5 | Voiture télécommandée | si/sinon, flèches de la télécommande, rouler sans s'arrêter |
| 6 | Télécommande musicale | plusieurs « si » : chiffres = notes, arc-en-ciel, sirène |
| 7 | Radar | capteur de distance, couleur selon la proximité |
| 8 | Dé électronique | nombre aléatoire, répéter un nombre de fois variable |
| 9 | Garde du corps | garder une distance, « et » |
| 10 | Éviteur d'obstacles | attendre jusqu'à, tourner la tête, comparer deux mesures |
| 11 | Suiveur de ligne | capteurs de ligne, variable qui sert de mémoire |
| 12 | Suiveur de lumière | capteur de lumière, nombres négatifs |
| 13 | Jeu de réflexes | chronomètre, attente au hasard |

Dans le simulateur, on peut déplacer la voiture à la souris. On la fait pivoter avec la molette ou un double-clic.

Les exemples sont écrits dans `tools/build_examples.js`. `node tools/build_examples.js` régénère `examples/` et le menu de l'éditeur.

## Les blocs

- **Mouvement** : avancer/reculer de N cm, tourner à droite/gauche de N degrés, demi-tour, rouler sans s'arrêter (tout droit, virage, sur place), s'arrêter, vitesse, puissance de chaque côté (experts). Avec des roues Mecanum : glisser de côté.
- **Capteurs** : distance de l'obstacle, « obstacle à moins de N cm ? », capteurs de ligne gauche/milieu/droite, direction de la lumière, touches de la télécommande, batterie, chronomètre, tourner la tête (qui porte le capteur de distance).
- **Lumières** : les 7 LED de couleur, toutes ou une par une, luminosité.
- **Yeux & écran** : 15 expressions sur la matrice 8×16 (content, triste, surpris, en colère, endormi, cœurs, clin d'œil, flèches…) et du texte ou des nombres sur l'écran OLED (4 lignes de 10 lettres, sans accents).
- **Sons** : bip, notes Do-Ré-Mi, 6 petites musiques, son en Hz.
- **Contrôle** : quand le programme démarre, attendre, répéter N fois, répéter indéfiniment, si/sinon, attendre jusqu'à, répéter jusqu'à, arrêter.
- **Opérateurs** et **Variables** comme dans Scratch.

## Limites connues

- Distances et angles chronométrés : précis à quelques centimètres et degrés près, selon le sol et la batterie. Les blocs en cm et en degrés utilisent toujours la puissance réglée. Le bloc « vitesse » ne concerne que les blocs « rouler ».
- Un programme peut faire jusqu'à environ 1000 octets, soit plusieurs centaines de blocs. L'éditeur prévient si c'est trop long.
- La correspondance gauche/droite du capteur de lumière et le sens de la tête viennent du code d'Adeept. S'ils sont inversés sur ta voiture, il y a une case à cocher pour la tête. Pour la lumière, il suffit d'inverser le signe dans le programme.
- Le firmware et l'installateur ont été testés sur un simulateur de la carte, pas sur la vraie voiture. Les broches et adresses viennent du code officiel Adeept (`Adeept_Car_For_Arduino.cpp`).

## Pour le développeur

- Format du programme : `firmware/AdeeptBlocs/bytecode.h`. C'est une petite machine à pile sur des flottants, gardée dans l'EEPROM. `editor/compiler.js` et `editor/simulator.js` suivent le même format.
- Matériel piloté directement, sans bibliothèque à part NeoPixel : PCA9685 (moteurs, I²C 0x5F), écran SSD1306 (0x3C), matrice VK16K33 (0x70), récepteur IR NEC sur l'interruption INT0 (broche 2).
- Protocole USB à 115200 bauds :
  - `?` répond la version ;
  - `P` + longueur + octets + somme enregistre un programme, avec un accusé `.` tous les 32 octets ;
  - `X` fait de même en RAM et l'exécute une fois ;
  - `R` lance le programme, `S` l'arrête, `D` envoie les capteurs.
- `tools/build_firmware.sh` recompile le firmware et met à jour `editor/firmware.js`, avec `arduino-cli` et le cœur `arduino:avr`. Il faut augmenter `FW_VERSION` à chaque changement du firmware : l'éditeur propose alors la mise à jour à la connexion.
- Les scripts de l'éditeur sont chargés avec `?v=N` dans `editor/index.html`. Il faut augmenter ce numéro à chaque publication, sinon un navigateur, ou le cache de GitHub Pages, peut mélanger anciens et nouveaux fichiers.
- `tools/hosttest/` compile le firmware pour l'ordinateur avec du faux matériel. Il rejoue un programme compilé par l'éditeur et affiche moteurs, sons, LED, yeux et écran :
  ```bash
  c++ -std=c++17 -I tools/hosttest/stubs -include cstdarg -x c++ tools/hosttest/hosttest.cpp -o hosttest
  ```
- Piège Arduino : `constrain`, `round`, `abs`, `min` et `max` sont des macros qui évaluent leur argument plusieurs fois. Dans le firmware, on ne leur passe jamais `pop()` directement. Les faux en-têtes de `tools/hosttest/stubs` reprennent exactement ces macros pour que les tests attrapent ce genre d'erreur.
- `tools/gen_faces.py` régénère les visages de la matrice pour le firmware et pour l'éditeur.
- Blockly 12.3.1 (Apache 2.0) est copié dans `editor/vendor/blockly`.
