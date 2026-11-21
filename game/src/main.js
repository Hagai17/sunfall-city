// Sunfall City: boot, the screens, the fixed-step loop, and every system wired
// together. The world, cars, people, police and missions live in their own
// modules; this file owns the shared game state, the interactions between
// systems (stealing, pickups, crimes and their heat, explosions, busted and
// wasted, saving), the camera, and the particles those events throw off.
//
// ?seed=N fixes the city. ?shot=city|chase|mission|night (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { DAY_SECONDS, ECONOMY, MUTE_KEY, PLAYER, SAVE_KEY, START_HOUR, STEP, WORLD_H, WORLD_W } from './config.js';
import { clamp, createRandom, distance } from './random.js';
import { createWorld } from './world.js';
import { carRadius, collideCars, drivePlayerCar, populateTraffic, updateTrafficCar } from './vehicles.js';
import { createPlayer, doorSidePoint, startReload, tickPlayerTimers, spawnPeds, updateBullets, updatePeds, updatePlayerOnFoot } from './actors.js';
import { addHeat, clearHeat, createPoliceSystem, updatePolice } from './police.js';
import { WANTED } from './config.js';
import { createMissionSystem, failMission, objectivePoint, updateMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

function readMuted() {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch { return null; }
}

/** A complete fresh game state: city, people, traffic, systems, screens. */
function createGameState() {
  const rng = createRandom(seed);
  const world = createWorld(seed);
  const clubDoor = world.landmarks.club.door;
  const game = {
    rng, world,
    time: 0, timeHours: START_HOUR,
    player: createPlayer(clubDoor.x, clubDoor.y + 96),
    cars: [], peds: [], bullets: [], footCops: [],
    particles: [], skids: [], events: [],
    threat: { x: 0, y: 0, timer: 0 },
    police: createPoliceSystem(),
    missions: createMissionSystem(),
    money: 120,
    camera: { x: clubDoor.x, y: clubDoor.y + 96 },
    shake: 0, shakeX: 0, shakeY: 0,
    screen: SCREEN_TITLE,
    menu: { items: [], selected: 0 },
    dialogue: null, dialogueQueue: [], banner: null, toast: null,
    prompt: '', objectiveCache: null,
    mouseWorld: { x: 0, y: 0, moved: false },
    overKind: '', overText: '',
    wantSave: false, deliverCar: null,
    lastShootHeat: 0, smokeTimer: 0,
    titleLine: 'The city is awake. Del is waiting at the Coral Club.',
  };
  populateTraffic(game);
  spawnPeds(game);
  return game;
}

function saveGame(game) {
  try {
    const p = game.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: game.money,
      storyIndex: game.missions.storyIndex,
      jobsDone: game.missions.jobsDone,
      storyDone: game.missions.storyDone,
      x: p.car !== null ? p.car.x : p.x,
      y: p.car !== null ? p.car.y : p.y,
      timeHours: game.timeHours,
      ammo: p.ammo,
    }));
    game.toast = { text: 'Game saved', timer: 1.6 };
  } catch {
    game.toast = { text: 'Saving is unavailable in this browser', timer: 2 };
  }
}

function applySave(game, data) {
  game.money = data.money | 0;
  game.missions.storyIndex = data.storyIndex | 0;
  game.missions.jobsDone = data.jobsDone | 0;
  game.missions.storyDone = !!data.storyDone;
  game.player.x = clamp(data.x || game.player.x, 30, WORLD_W - 30);
  game.player.y = clamp(data.y || game.player.y, 30, WORLD_H - 30);
  game.player.ammo = data.ammo | 0;
  game.timeHours = data.timeHours || START_HOUR;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
}

/** Could anyone in uniform see this spot right now? Crimes need a witness. */
function witnessed(game, x, y) {
  if (game.police.seen) return true;
  for (const car of game.cars) {
    if (car.mode === 'police' && distance(car.x, car.y, x, y) < 400 && game.world.hasLineOfSight(car.x, car.y, x, y)) return true;
  }
  for (const cop of game.footCops) {
    if (!cop.down && distance(cop.x, cop.y, x, y) < 360) return true;
  }
  return false;
}

function burst(game, x, y, kind, count, speed, size) {
  for (let n = 0; n < count; n += 1) {
    if (game.particles.length > 420) return;
    const a = game.rng() * Math.PI * 2;
    const v = game.rng.range(speed * 0.3, speed);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 0, maxLife: game.rng.range(0.3, 0.9), size: game.rng.range(size * 0.6, size * 1.4),
      kind,
    });
  }
}

/** A car at zero health catches fire and goes up, hurting whatever is close. */
function explodeCar(game, car) {
  car.exploded = true;
  game.events.push({ kind: 'explosion', x: car.x, y: car.y });
  burst(game, car.x, car.y, 'flame', 26, 190, 9);
  burst(game, car.x, car.y, 'spark', 18, 260, 4);
  burst(game, car.x, car.y, 'smoke', 12, 60, 12);
  game.shake = Math.max(game.shake, 7);
  const p = game.player;
  if (p.car === car) {
    exitCar(game, true);
    p.health -= 42;
    p.hurtTimer = 0;
    if (p.health <= 0) game.events.push({ kind: 'playerDown', x: p.x, y: p.y });
  } else if (p.car === null && distance(p.x, p.y, car.x, car.y) < 92) {
    p.health -= 30;
    p.hurtTimer = 0;
    if (p.health <= 0) game.events.push({ kind: 'playerDown', x: p.x, y: p.y });
  }
  for (const ped of game.peds) {
    if (!ped.down && distance(ped.x, ped.y, car.x, car.y) < 74) ped.down = true;
  }
  for (const other of game.cars) {
    if (other !== car && !other.exploded && distance(other.x, other.y, car.x, car.y) < 84) {
      other.health = Math.max(0, other.health - 46);
    }
  }
}

function nearestEnterableCar(game) {
  const p = game.player;
  let best = null;
  let bestD = 56;
  for (const car of game.cars) {
    if (car.health <= 0) continue;
    if (car.mode === 'player') continue;
    if (Math.abs(car.speed) > 46) continue;
    const d = distance(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(game, car) {
  const p = game.player;
  const wasTraffic = car.mode === 'traffic';
  car.mode = 'player';
  car.target = car.target && game.missions.active !== null;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.bustMeter = 0;
  game.events.push({ kind: 'enterCar', x: car.x, y: car.y });
  if (wasTraffic) {
    // The driver bails out and runs, screaming for the whole street.
    game.peds.push({
      x: car.x + 20, y: car.y + 14, angle: 0, corner: 0, col: 0, row: 0,
      skin: '#e0ac69', shirt: '#56cbf9', health: 30, state: 'flee', fleeTimer: 3,
      walkPhase: 0, down: false,
    });
    game.threat.x = car.x; game.threat.y = car.y; game.threat.timer = 2.5;
  }
  if (witnessed(game, car.x, car.y)) addHeat(game, WANTED.stealCar);
}

function exitCar(game, forced) {
  const p = game.player;
  if (p.car === null) return;
  const car = p.car;
  const spot = doorSidePoint(car);
  p.x = spot.x;
  p.y = spot.y;
  const pos = { x: p.x, y: p.y };
  game.world.resolveCircle(pos, PLAYER.radius);
  p.x = pos.x; p.y = pos.y;
  if (car.mode === 'player') car.mode = 'empty';
  p.car = null;
  if (!forced) game.events.push({ kind: 'enterCar', x: p.x, y: p.y });
}

/** Everything one game event means for the other systems and the soundtrack. */
function processEvents(game) {
  for (const ev of game.events) {
    audio.event(game, ev);
    switch (ev.kind) {
      case 'crash':
        game.shake = Math.max(game.shake, clamp(ev.power / 34, 1.5, 6.5));
        burst(game, ev.x, ev.y, 'spark', Math.round(clamp(ev.power / 16, 3, 12)), 170, 3.6);
        break;
      case 'crimeHitCar':
        if (witnessed(game, ev.x, ev.y)) addHeat(game, WANTED.hitCar);
        break;
      case 'crimeDownPed':
        if (witnessed(game, ev.x, ev.y)) addHeat(game, WANTED.downPed);
        burst(game, ev.x, ev.y, 'smoke', 4, 40, 7);
        break;
      case 'crimeDownCop':
        addHeat(game, WANTED.downCop);
        break;
      case 'crimeShootAt':
        if (game.time - game.lastShootHeat > 0.9 && witnessed(game, ev.x, ev.y)) {
          game.lastShootHeat = game.time;
          addHeat(game, WANTED.shootAt);
        }
        break;
      case 'explosion':
        game.shake = Math.max(game.shake, 6);
        break;
      case 'busted':
        endRun(game, 'busted');
        break;
      case 'playerDown':
        endRun(game, 'wasted');
        break;
      default:
        break;
    }
  }
  game.events.length = 0;
}

/** Busted or wasted: pay up, wake up somewhere official, the heat forgotten. */
function endRun(game, kind) {
  const p = game.player;
  if (game.screen !== SCREEN_PLAY) return;
  failMission(game, kind === 'busted' ? 'The job died with the arrest' : 'The job died at the hospital');
  const fine = kind === 'busted' ? Math.round(game.money * ECONOMY.bustFine) : Math.round(game.money * ECONOMY.wastedBill);
  game.money -= fine;
  game.overKind = kind;
  game.overText = kind === 'busted'
    ? `The Sunfall PD impound your pride and fine you $${fine}.`
    : `St. Solana patches you up and bills you $${fine}.`;
  game.screen = SCREEN_OVER;
  game.events.push({ kind });
  status.textContent = kind === 'busted' ? 'Busted.' : 'Wasted.';
}

function respawn(game) {
  const p = game.player;
  const door = game.overKind === 'busted' ? game.world.landmarks.police.door : game.world.landmarks.hospital.door;
  if (p.car !== null) {
    p.car.mode = 'empty';
    p.car = null;
  }
  p.x = door.x;
  p.y = door.y + 18;
  p.health = PLAYER.health;
  p.bustMeter = 0;
  p.graceTimer = PLAYER.respawnGrace;
  clearHeat(game);
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    if (game.cars[i].mode === 'police') game.cars.splice(i, 1);
  }
  game.footCops.length = 0;
  game.camera.x = p.x;
  game.camera.y = p.y;
  game.screen = SCREEN_PLAY;
  status.textContent = 'Back on the street.';
}

/** One fixed step of the living city while the player is playing. */
function stepPlay(game, input, dt) {
  const p = game.player;
  game.time += dt;
  game.timeHours = (game.timeHours + (dt * 24) / DAY_SECONDS) % 24;

  if (p.car !== null) {
    drivePlayerCar(game, p.car, input, dt);
    p.x = p.car.x;
    p.y = p.car.y;
    tickPlayerTimers(game, dt);
    // Skid marks when the car is sliding hard.
    if ((input.handbrake() && Math.abs(p.car.speed) > 110) || Math.abs(p.car.speed) > 300) {
      game.skids.push({ x: p.car.x - Math.cos(p.car.angle) * 12, y: p.car.y - Math.sin(p.car.angle) * 12, angle: p.car.angle, life: 1 });
      if (game.skids.length > 320) game.skids.shift();
    }
    // Running people down with the car.
    if (Math.abs(p.car.speed) > 62) {
      for (const ped of game.peds) {
        if (ped.down) continue;
        if (distance(ped.x, ped.y, p.car.x, p.car.y) < carRadius(p.car) + 9) {
          ped.down = true;
          p.car.speed *= 0.84;
          game.events.push({ kind: 'crimeDownPed', x: ped.x, y: ped.y });
          game.events.push({ kind: 'thud', x: ped.x, y: ped.y });
        }
      }
    }
  } else {
    updatePlayerOnFoot(game, input, dt);
  }

  for (const car of game.cars) if (car.mode === 'traffic') updateTrafficCar(game, car, dt);
  collideCars(game);
  updatePolice(game, dt);
  updatePeds(game, dt);
  updateBullets(game, dt);
  updateMissions(game, dt);
  game.world.updatePickups(dt);

  // Pickups are collected on foot.
  if (p.car === null) {
    for (const pk of game.world.pickups) {
      if (pk.taken) continue;
      if (distance(p.x, p.y, pk.x, pk.y) > 25) continue;
      if (pk.kind === 'health') {
        if (p.health >= PLAYER.health) continue;
        p.health = Math.min(PLAYER.health, p.health + 42);
        pk.taken = true; pk.timer = 30;
        game.events.push({ kind: 'pickup', x: pk.x, y: pk.y });
        game.toast = { text: 'Patched up', timer: 1.4 };
      } else if (pk.kind === 'ammo') {
        p.ammo += 36;
        pk.taken = true; pk.timer = 30;
        game.events.push({ kind: 'pickup', x: pk.x, y: pk.y });
        game.toast = { text: '+36 rounds', timer: 1.4 };
      } else {
        game.money += ECONOMY.pickupCash;
        pk.taken = true; pk.timer = 45;
        game.events.push({ kind: 'cash', x: pk.x, y: pk.y });
        game.toast = { text: `+$${ECONOMY.pickupCash} found`, timer: 1.4 };
      }
    }
  }

  // Delivered cars change hands.
  if (game.deliverCar !== null) {
    const car = game.deliverCar;
    game.deliverCar = null;
    if (p.car === car) exitCar(game, false);
    car.mode = 'empty';
  }

  // Fire and wreckage.
  game.smokeTimer -= dt;
  for (const car of game.cars) {
    if (car.health <= 0 && !car.exploded) explodeCar(game, car);
    else if (car.health > 0 && car.health < car.maxHealth * 0.34 && game.smokeTimer <= 0) {
      burst(game, car.x, car.y, 'smoke', 1, 22, 8);
    }
    if (car.exploded && game.rng.chance(0.3)) burst(game, car.x, car.y, 'flame', 1, 30, 8);
  }
  if (game.smokeTimer <= 0) game.smokeTimer = 0.12;

  // Particles and skid marks age.
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const pt = game.particles[i];
    pt.life += dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy = pt.vy * 0.92 - (pt.kind === 'smoke' ? 14 * dt : 0);
    if (pt.life >= pt.maxLife) game.particles.splice(i, 1);
  }
  for (let i = game.skids.length - 1; i >= 0; i -= 1) {
    game.skids[i].life -= dt / 7;
    if (game.skids[i].life <= 0) game.skids.splice(i, 1);
  }

  // Camera: follow with a look-ahead in the direction of travel.
  const focusX = p.car !== null ? p.car.x + Math.cos(p.car.angle) * p.car.speed * 0.32 : p.x;
  const focusY = p.car !== null ? p.car.y + Math.sin(p.car.angle) * p.car.speed * 0.32 : p.y;
  game.camera.x += (focusX - game.camera.x) * Math.min(1, 5.2 * dt);
  game.camera.y += (focusY - game.camera.y) * Math.min(1, 5.2 * dt);
  game.camera.x = clamp(game.camera.x, 320, WORLD_W - 320);
  game.camera.y = clamp(game.camera.y, 220, WORLD_H - 160);
  game.shake = Math.max(0, game.shake - dt * 16);
  game.shakeX = (game.rng() - 0.5) * 2 * game.shake;
  game.shakeY = (game.rng() - 0.5) * 2 * game.shake;

  // Words fade.
  if (game.dialogue !== null) {
    game.dialogue.timer -= dt;
    if (game.dialogue.timer <= 0) {
      game.dialogue = game.dialogueQueue.length > 0 ? game.dialogueQueue.shift() : null;
    }
  }
  if (game.banner !== null) game.banner.timer -= dt;
  if (game.toast !== null) game.toast.timer -= dt;

  game.objectiveCache = objectivePoint(game);
  processEvents(game);
  if (game.wantSave) {
    game.wantSave = false;
    saveGame(game);
  }
}

/** The title screen's living postcard: traffic and strollers, a drifting camera. */
function stepTitle(game, dt) {
  game.time += dt;
  game.timeHours = (game.timeHours + (dt * 24) / DAY_SECONDS) % 24;
  for (const car of game.cars) if (car.mode === 'traffic') updateTrafficCar(game, car, dt);
  updatePeds(game, dt);
  const t = game.time * 0.045;
  game.camera.x = WORLD_W / 2 + Math.cos(t) * 620;
  game.camera.y = WORLD_H / 2 + Math.sin(t * 1.3) * 380;
  game.objectiveCache = null;
  game.events.length = 0; // the postcard makes no sound and starts no stories
}

function setMenu(game, items) {
  game.menu.items = items;
  game.menu.selected = 0;
}

function soundItem(game) {
  return { id: 'sound', label: audio.isMuted() ? 'Sound: Off' : 'Sound: On' };
}

function titleMenu(game) {
  const items = [];
  if (readSave() !== null) items.push({ id: 'continue', label: 'Continue' });
  items.push({ id: 'new', label: 'New Game' });
  items.push(soundItem(game));
  setMenu(game, items);
}

function pauseMenu(game) {
  setMenu(game, [
    { id: 'resume', label: 'Resume' },
    { id: 'save', label: 'Save Game' },
    soundItem(game),
    { id: 'title', label: 'Quit to Title' },
  ]);
}

function runShot(name) {
  const game = createGameState();
  stageShot(name, game);
  game.objectiveCache = objectivePoint(game);
  let painted = 0;
  function paint() {
    renderer.draw(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let game = createGameState();
  audio.setMuted(readMuted());
  titleMenu(game);
  let accumulator = 0;
  let last = performance.now();
  let prevMoveY = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startPlay(fresh) {
    if (fresh) {
      game = createGameState();
      audio.setMuted(readMuted());
    } else {
      const data = readSave();
      if (data !== null) applySave(game, data);
    }
    game.screen = SCREEN_PLAY;
    game.toast = { text: 'See Del at the Coral Club — follow the gold marker', timer: 3.4 };
    announce('Playing Sunfall City.');
  }

  function activate(item) {
    audio.unlock();
    audio.event(game, { kind: 'uiClick', x: game.player.x, y: game.player.y });
    if (game.screen === SCREEN_TITLE) {
      if (item.id === 'new') startPlay(true);
      else if (item.id === 'continue') startPlay(false);
      else if (item.id === 'sound') {
        audio.setMuted(!audio.isMuted());
        try { window.localStorage.setItem(MUTE_KEY, audio.isMuted() ? '1' : '0'); } catch { /* private mode */ }
        titleMenu(game);
      }
    } else if (game.screen === SCREEN_PAUSED) {
      if (item.id === 'resume') game.screen = SCREEN_PLAY;
      else if (item.id === 'save') { saveGame(game); game.screen = SCREEN_PLAY; }
      else if (item.id === 'sound') {
        audio.setMuted(!audio.isMuted());
        try { window.localStorage.setItem(MUTE_KEY, audio.isMuted() ? '1' : '0'); } catch { /* private mode */ }
        pauseMenu(game);
      } else if (item.id === 'title') {
        game = createGameState();
        audio.setMuted(readMuted());
        titleMenu(game);
      }
    }
  }

  function menuInput(actions) {
    const menu = game.menu;
    const my = input.moveY();
    if (my !== 0 && prevMoveY === 0) {
      menu.selected = (menu.selected + my + menu.items.length) % menu.items.length;
      audio.event(game, { kind: 'uiClick', x: game.player.x, y: game.player.y });
    }
    prevMoveY = my;
    // Mouse: hovering selects, clicking activates.
    const baseY = game.screen === SCREEN_TITLE ? 428 : 300;
    const stepY = game.screen === SCREEN_TITLE ? 52 : 48;
    const rect = canvas.getBoundingClientRect();
    const logicalY = ((input.mouse.y * (canvas.height / rect.height)) - renderer.view.y) / renderer.view.scale;
    const logicalX = ((input.mouse.x * (canvas.width / rect.width)) - renderer.view.x) / renderer.view.scale;
    menu.items.forEach((item, index) => {
      const y = baseY + index * stepY;
      if (Math.abs(logicalY - (y - 12)) < 24 && Math.abs(logicalX - 640) < 190) {
        menu.selected = index;
        if (input.takeClick()) activate(item);
      }
    });
    if (actions & ACTION_CONFIRM) activate(menu.items[menu.selected]);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      try { window.localStorage.setItem(MUTE_KEY, audio.isMuted() ? '1' : '0'); } catch { /* private mode */ }
    }
    if (game.screen === SCREEN_TITLE || game.screen === SCREEN_PAUSED) {
      menuInput(actions);
      return;
    }
    if (game.screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) respawn(game);
      return;
    }
    // Play screen.
    if (actions & ACTION_PAUSE) {
      game.screen = SCREEN_PAUSED;
      pauseMenu(game);
      announce('Paused.');
      return;
    }
    if (actions & ACTION_RELOAD && game.player.car === null) startReload(game);
    if (actions & ACTION_INTERACT) {
      if (game.player.car !== null) {
        if (Math.abs(game.player.car.speed) < 60) exitCar(game, false);
        else game.toast = { text: 'Too fast to bail out', timer: 1.4 };
      } else {
        const car = nearestEnterableCar(game);
        if (car !== null) enterCar(game, car);
      }
    }
  }

  function updatePrompt() {
    const p = game.player;
    if (game.screen !== SCREEN_PLAY) { game.prompt = ''; return; }
    if (p.car !== null) {
      game.prompt = Math.abs(p.car.speed) < 60 ? 'E — Get out' : '';
      return;
    }
    const car = nearestEnterableCar(game);
    game.prompt = car !== null ? `E — Take the ${car.type.name}` : '';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    // The mouse's world position, for aiming.
    const world = renderer.toWorld(input.mouse.x, input.mouse.y, game.camera);
    if (world.x !== game.mouseWorld.x || world.y !== game.mouseWorld.y) game.mouseWorld.moved = true;
    game.mouseWorld.x = world.x;
    game.mouseWorld.y = world.y;

    if (game.screen === SCREEN_PLAY) {
      while (accumulator >= STEP && game.screen === SCREEN_PLAY) {
        stepPlay(game, input, STEP);
        accumulator -= STEP;
      }
    } else if (game.screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        stepTitle(game, STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    updatePrompt();
    audio.update(game);
    renderer.draw(game);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      pauseMenu(game);
      announce('Paused.');
    }
  });

  announce('Sunfall City. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
