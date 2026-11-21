// The Sunfall PD: a heat-based wanted system (crimes add heat, stars follow,
// hiding drains it), patrol cars that spawn off-screen and hunt the player, and
// foot officers who pile out to shoot or make the bust. Crimes are reported by
// the other systems as events; this module turns them into consequences.
import { COMBAT, PLAYER, POLICE, WANTED } from './config.js';
import { isRoad, roadCenterX, roadCenterY } from './world.js';
import { CITY } from './config.js';
import { clamp, distance, turnToward } from './random.js';
import { createCar } from './vehicles.js';
import { fireBullet } from './actors.js';

export function createPoliceSystem() {
  return {
    heat: 0,
    stars: 0,
    unseenTimer: 0,
    seen: false,
    spawnTimer: 0,
  };
}

/** Report a crime: heat rises, and with it the stars. */
export function addHeat(game, points) {
  const police = game.police;
  police.heat = clamp(police.heat + points, 0, WANTED.perStar * WANTED.maxStars + 99);
  police.unseenTimer = 0;
}

/** Forget everything (a respawn, a loaded game, a finished escape). */
export function clearHeat(game) {
  game.police.heat = 0;
  game.police.stars = 0;
  game.police.unseenTimer = 0;
}

function starsForHeat(heat) {
  return clamp(Math.floor(heat / WANTED.perStar), 0, WANTED.maxStars);
}

/** Where a fresh patrol car joins: on a road, out of sight, closing in. */
function spawnPoint(game) {
  const p = game.player;
  for (let tries = 0; tries < 10; tries += 1) {
    const angle = game.rng() * Math.PI * 2;
    let x = p.x + Math.cos(angle) * POLICE.spawnDistance;
    let y = p.y + Math.sin(angle) * POLICE.spawnDistance;
    // Snap to the nearest road centre lines so the car starts on asphalt.
    const i = clamp(Math.round((x - CITY.roadW / 2) / CITY.pitch), 0, CITY.cols);
    const j = clamp(Math.round((y - CITY.roadW / 2) / CITY.pitch), 0, CITY.rows);
    if (game.rng.chance(0.5)) x = roadCenterX(i);
    else y = roadCenterY(j);
    x = clamp(x, 40, 3128);
    y = clamp(y, 40, 2360);
    if (!isRoad(x, y)) continue;
    if (distance(x, y, p.x, p.y) < 460) continue;
    if (game.world.circleHitsBuilding(x, y, 26)) continue;
    return { x, y };
  }
  return null;
}

function spawnCopCar(game) {
  const spot = spawnPoint(game);
  if (spot === null) return;
  const car = createCar('cop', '#20242e', spot.x, spot.y, Math.atan2(game.player.y - spot.y, game.player.x - spot.x));
  car.mode = 'police';
  car.crew = game.police.stars >= 3 ? 2 : 1;
  game.cars.push(car);
}

function deployFootCop(game, car) {
  const side = car.angle + Math.PI / 2;
  game.footCops.push({
    x: car.x + Math.cos(side) * 24,
    y: car.y + Math.sin(side) * 24,
    angle: car.angle, health: 60, down: false,
    fireTimer: game.rng.range(0.3, 0.9), walkPhase: 0, idleTimer: 0,
  });
  car.crew -= 1;
  game.events.push({ kind: 'copOut', x: car.x, y: car.y });
}

/** One patrol car's hunt: steer at the player, ram, back out when wedged. */
function updateCopCar(game, car, dt) {
  const player = game.player;
  const tx = player.car !== null ? player.car.x : player.x;
  const ty = player.car !== null ? player.car.y : player.y;
  const dist = distance(car.x, car.y, tx, ty);
  let desired = Math.atan2(ty - car.y, tx - car.x);
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    desired += Math.PI;
    car.speed = Math.max(-110, car.speed - 260 * dt);
  } else {
    const top = car.type.topSpeed * (0.72 + game.police.stars * 0.05);
    const wanted = dist < 56 ? top * 0.25 : top;
    car.speed = Math.min(wanted, car.speed + car.type.accel * dt);
    if (Math.abs(car.speed) < 24 && dist > 90) car.stuckTimer += dt;
    else car.stuckTimer = 0;
    if (car.stuckTimer > 0.8) {
      car.reverseTimer = 0.55;
      car.stuckTimer = 0;
    }
  }
  car.angle = turnToward(car.angle, desired, car.type.grip * (car.reverseTimer > 0 ? 1.4 : 0.92) * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const pos = { x: car.x, y: car.y };
  if (game.world.resolveCircle(pos, car.type.width * 0.55)) {
    car.x = pos.x; car.y = pos.y;
    if (Math.abs(car.speed) > 120) game.events.push({ kind: 'crash', x: car.x, y: car.y, power: Math.abs(car.speed) * 0.6 });
    car.speed *= -0.22;
  }
  // Officers pile out when they are on top of a suspect who is slow or afoot.
  const playerSlow = player.car === null || Math.abs(player.car.speed) < 34;
  if (car.crew > 0 && dist < 128 && playerSlow && Math.abs(car.speed) < 90) {
    deployFootCop(game, car);
  }
  car.sirenPhase += dt * 7;
}

/** One foot officer: close in, shoot with a clear line, grab when close enough. */
function updateFootCop(game, cop, dt) {
  const player = game.player;
  const px = player.car !== null ? player.car.x : player.x;
  const py = player.car !== null ? player.car.y : player.y;
  const dist = distance(cop.x, cop.y, px, py);
  if (game.police.stars === 0) {
    cop.idleTimer += dt;
    return;
  }
  const los = dist < COMBAT.copRange && game.world.hasLineOfSight(cop.x, cop.y, px, py);
  if (dist > 120 || !los) {
    const speed = dist > 300 ? 196 : 158;
    const angle = Math.atan2(py - cop.y, px - cop.x);
    cop.x += Math.cos(angle) * speed * dt;
    cop.y += Math.sin(angle) * speed * dt;
    cop.angle = angle;
    cop.walkPhase += dt * 12;
  } else {
    cop.angle = Math.atan2(py - cop.y, px - cop.x);
  }
  const pos = { x: cop.x, y: cop.y };
  game.world.resolveCircle(pos, 12);
  cop.x = pos.x; cop.y = pos.y;
  cop.fireTimer -= dt;
  if (los && dist > 44 && cop.fireTimer <= 0) {
    cop.fireTimer = COMBAT.copCooldown * game.rng.range(0.8, 1.3);
    const spread = (game.rng() - 0.5) * 0.17;
    fireBullet(game, 'cop', cop.x + Math.cos(cop.angle) * 16, cop.y + Math.sin(cop.angle) * 16, cop.angle + spread);
    game.events.push({ kind: 'copShot', x: cop.x, y: cop.y });
    game.threat.x = cop.x; game.threat.y = cop.y; game.threat.timer = Math.max(game.threat.timer, 1.2);
  }
}

/**
 * The whole system for one step: visibility and decay, star changes, spawning,
 * pursuit, foot officers, running officers over, and the bust meter.
 */
export function updatePolice(game, dt) {
  const police = game.police;
  const player = game.player;
  const px = player.car !== null ? player.car.x : player.x;
  const py = player.car !== null ? player.car.y : player.y;

  // Seen if any officer is close with a clear line.
  let seen = false;
  for (const car of game.cars) {
    if (car.mode !== 'police') continue;
    if (distance(car.x, car.y, px, py) < 470 && game.world.hasLineOfSight(car.x, car.y, px, py)) { seen = true; break; }
  }
  if (!seen) {
    for (const cop of game.footCops) {
      if (!cop.down && distance(cop.x, cop.y, px, py) < 390) { seen = true; break; }
    }
  }
  police.seen = seen;
  if (seen) police.unseenTimer = 0;
  else {
    police.unseenTimer += dt;
    if (police.unseenTimer > WANTED.hideDelay && police.heat > 0) {
      police.heat = Math.max(0, police.heat - WANTED.decayRate * dt);
    }
  }
  const newStars = starsForHeat(police.heat);
  if (newStars !== police.stars) {
    police.stars = newStars;
    game.events.push({ kind: 'starsChanged', stars: newStars });
  }

  // Force size: keep the right number of patrol cars in play, retire far ones.
  police.spawnTimer -= dt;
  let active = 0;
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car.mode !== 'police') continue;
    const d = distance(car.x, car.y, px, py);
    if ((police.stars === 0 && d > 380) || d > POLICE.despawnDistance) {
      game.cars.splice(i, 1);
      continue;
    }
    active += 1;
    updateCopCar(game, car, dt);
  }
  const desiredCars = Math.min(police.stars * POLICE.carsPerStar, POLICE.maxCars);
  if (active < desiredCars && police.spawnTimer <= 0) {
    police.spawnTimer = 1.4;
    spawnCopCar(game);
  }
  if (police.stars === 0) {
    // The hunt is off: patrol cars leave the player alone and roll away.
    for (const car of game.cars) {
      if (car.mode !== 'police') continue;
      car.mode = 'empty';
      car.speed = Math.min(car.speed, 120);
    }
  }

  // Foot officers.
  for (let i = game.footCops.length - 1; i >= 0; i -= 1) {
    const cop = game.footCops[i];
    if (cop.down) continue;
    updateFootCop(game, cop, dt);
    if (police.stars === 0 && (cop.idleTimer > 2.5 || distance(cop.x, cop.y, px, py) > 420)) {
      game.footCops.splice(i, 1);
    }
  }
  // Running down an officer with the player's car.
  if (player.car !== null && Math.abs(player.car.speed) > 60) {
    for (const cop of game.footCops) {
      if (cop.down) continue;
      if (distance(cop.x, cop.y, player.car.x, player.car.y) < 30) {
        cop.down = true;
        game.events.push({ kind: 'crimeDownCop', x: cop.x, y: cop.y });
        game.events.push({ kind: 'thud', x: cop.x, y: cop.y });
      }
    }
  }

  // The bust: an officer at arm's reach while the player is slow or afoot.
  let grabbed = false;
  if (player.car === null) {
    for (const cop of game.footCops) {
      if (!cop.down && distance(cop.x, cop.y, player.x, player.y) < 38) { grabbed = true; break; }
    }
  } else if (Math.abs(player.car.speed) < 14) {
    for (const car of game.cars) {
      if (car.mode === 'police' && distance(car.x, car.y, player.car.x, player.car.y) < 56) { grabbed = true; break; }
    }
    if (!grabbed) {
      for (const cop of game.footCops) {
        if (!cop.down && distance(cop.x, cop.y, player.car.x, player.car.y) < 44) { grabbed = true; break; }
      }
    }
  }
  if (grabbed && police.stars > 0 && player.graceTimer <= 0) {
    player.bustMeter += dt / POLICE.bustTime;
    if (player.bustMeter >= 1) {
      player.bustMeter = 0;
      game.events.push({ kind: 'busted', x: px, y: py });
    }
  } else {
    player.bustMeter = Math.max(0, player.bustMeter - dt * 1.6);
  }
}
