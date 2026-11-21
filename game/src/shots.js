// The screenshot scenes behind ?shot=city|chase|mission|night (with &seed=N).
// Each one arranges a real game state — the player placed, the police heated,
// a mission started — then runs the actual simulation forward for a second or
// two with a scripted driver, so the frame is a moment the game itself made
// and the same seed always makes the same frame.
import { STEP } from './config.js';
import { roadCenterY } from './world.js';
import { createCar, drivePlayerCar, updateTrafficCar } from './vehicles.js';
import { updatePolice } from './police.js';
import { updateMissions } from './missions.js';

const DRIVE = { throttle: () => 1, steer: () => 0, handbrake: () => false };

/** Run the traffic and the player's scripted driving for `seconds` of game time. */
function runTraffic(game, seconds, drive) {
  const steps = Math.round(seconds / STEP);
  for (let s = 0; s < steps; s += 1) {
    for (const car of game.cars) {
      if (car.mode === 'traffic') updateTrafficCar(game, car, STEP);
    }
    if (drive && game.player.car !== null) drivePlayerCar(game, game.player.car, DRIVE, STEP);
    game.time += STEP;
  }
}

/** Put the player behind the wheel of a fresh car on a road. */
function putInCar(game, typeKey, color, x, y, angle, speed) {
  const car = createCar(typeKey, color, x, y, angle);
  car.mode = 'player';
  car.speed = speed;
  game.cars.push(car);
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}

/** Midday: cruising a Meridian east through downtown, traffic all around. */
function sceneCity(game) {
  game.timeHours = 11.15;
  const y = roadCenterY(2) + 24;
  putInCar(game, 'sedan', '#e63946', 900, y, 0, 215);
  runTraffic(game, 1.6, true);
}

/** Golden hour: three stars, the Interceptors closing on a Vireo GT. */
function sceneChase(game) {
  game.timeHours = 17.35;
  const y = roadCenterY(3) + 24;
  putInCar(game, 'sports', '#3a86ff', 1500, y, 0, 305);
  game.police.heat = 305;
  game.police.stars = 3;
  const offsets = [
    { dx: -190, dy: -46 }, { dx: -260, dy: 30 }, { dx: -340, dy: -8 },
  ];
  for (const off of offsets) {
    const cop = createCar('cop', '#20242e', 1500 + off.dx, y + off.dy, 0);
    cop.mode = 'police';
    cop.crew = 1;
    cop.speed = 320;
    game.cars.push(cop);
  }
  const steps = Math.round(1.15 / STEP);
  for (let s = 0; s < steps; s += 1) {
    drivePlayerCar(game, game.player.car, DRIVE, STEP);
    updatePolice(game, STEP);
    for (const car of game.cars) if (car.mode === 'traffic') updateTrafficCar(game, car, STEP);
    game.time += STEP;
  }
}

/** Morning: the first job — Jace on foot, the marked coupe waiting on the lot. */
function sceneMission(game) {
  game.timeHours = 10.1;
  const club = game.world.landmarks.club.door;
  game.player.x = club.x;
  game.player.y = club.y;
  updateMissions(game, STEP); // standing at Del's door starts First Wheels
  const active = game.missions.active;
  if (active !== null && active.targetCar !== null) {
    const car = active.targetCar;
    game.player.x = car.x - 96;
    game.player.y = car.y + 30;
    game.player.angle = Math.atan2(car.y - game.player.y, car.x - game.player.x);
    if (game.banner !== null) game.banner.timer = 3.2;
  }
  runTraffic(game, 0.7, false);
}

/** After dark: headlights on the boulevard by the Coral Club. */
function sceneNight(game) {
  game.timeHours = 22.65;
  const y = roadCenterY(4) + 24;
  putInCar(game, 'wagon', '#f4a261', 2350, y, 0, 150);
  runTraffic(game, 1.1, true);
}

/**
 * Stage the named scene on a fresh game state. Unknown names stage the city.
 * The caller paints twice and the second paint is the screenshot.
 */
export function stageShot(name, game) {
  if (name === 'chase') sceneChase(game);
  else if (name === 'mission') sceneMission(game);
  else if (name === 'night') sceneNight(game);
  else sceneCity(game);
  game.screen = 'play';
  game.camera.x = game.player.car !== null ? game.player.car.x : game.player.x;
  game.camera.y = game.player.car !== null ? game.player.car.y : game.player.y;
}
