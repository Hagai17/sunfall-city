// People: the player on foot, the pedestrians who stroll the sidewalks and run
// from trouble, and the bullets both sides trade. The player is a plain object;
// while player.car is set the player rides in that car and is not drawn on foot.
import { COMBAT, PALETTE, PLAYER, TRAFFIC } from './config.js';
import { blockRect } from './world.js';
import { CITY } from './config.js';
import { clamp, distance } from './random.js';
import { carRadius } from './vehicles.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2,
    health: PLAYER.health,
    car: null,
    ammo: 48, inMag: COMBAT.magazine, reloading: 0, fireTimer: 0,
    walkPhase: 0, hurtTimer: 99, graceTimer: 0,
    bustMeter: 0,
  };
}

/** Damage the player, honouring the respawn grace; reports 'playerDown' once. */
export function hurtPlayer(game, amount) {
  const player = game.player;
  if (player.graceTimer > 0 || game.screen !== 'play') return;
  player.health -= amount;
  player.hurtTimer = 0;
  game.events.push({ kind: 'playerHurt', x: player.x, y: player.y });
  if (player.health <= 0) {
    player.health = 0;
    game.events.push({ kind: 'playerDown', x: player.x, y: player.y });
  }
}

/** The car's driver-side door point: where the player stands to get in or out. */
export function doorSidePoint(car) {
  const side = car.angle - Math.PI / 2;
  return { x: car.x + Math.cos(side) * (car.type.width / 2 + 16), y: car.y + Math.sin(side) * (car.type.width / 2 + 16) };
}

/** Advance the player on foot: WASD movement, mouse aim, firing and reloading. */
export function updatePlayerOnFoot(game, input, dt) {
  const player = game.player;
  const mx = input.moveX();
  const my = input.moveY();
  const moving = mx !== 0 || my !== 0;
  const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (moving) {
    const len = Math.hypot(mx, my);
    player.x += (mx / len) * speed * dt;
    player.y += (my / len) * speed * dt;
    player.walkPhase += dt * (input.sprint() ? 13 : 9);
  }
  const pos = { x: player.x, y: player.y };
  game.world.resolveCircle(pos, PLAYER.radius);
  player.x = pos.x; player.y = pos.y;
  // Cars are solid to walk into.
  for (const car of game.cars) {
    const rr = carRadius(car) + PLAYER.radius - 4;
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < rr && d > 0) {
      player.x = car.x + ((player.x - car.x) / d) * rr;
      player.y = car.y + ((player.y - car.y) / d) * rr;
    }
  }
  // Aim at the mouse; when the mouse has never moved, face the way we walk.
  if (game.mouseWorld.moved) {
    player.angle = Math.atan2(game.mouseWorld.y - player.y, game.mouseWorld.x - player.x);
  } else if (moving) {
    player.angle = Math.atan2(my, mx);
  }
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      const need = COMBAT.magazine - player.inMag;
      const take = Math.min(need, player.ammo);
      player.inMag += take;
      player.ammo -= take;
    }
  }
  if (input.firing() && player.fireTimer <= 0 && player.reloading <= 0) {
    if (player.inMag <= 0) {
      startReload(game);
    } else {
      player.inMag -= 1;
      player.fireTimer = COMBAT.pistolCooldown;
      const spread = (game.rng() - 0.5) * 2 * COMBAT.spread;
      fireBullet(game, 'player', player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18, player.angle + spread);
      game.events.push({ kind: 'shot', x: player.x, y: player.y });
      game.threat.x = player.x; game.threat.y = player.y; game.threat.timer = 2.5;
    }
  }
  tickPlayerTimers(game, dt);
}

/** Reload if there is anything to gain and anything in reserve. */
export function startReload(game) {
  const player = game.player;
  if (player.reloading > 0 || player.inMag >= COMBAT.magazine || player.ammo <= 0) return;
  player.reloading = COMBAT.reloadTime;
  game.events.push({ kind: 'reload', x: player.x, y: player.y });
}

/** Timers that run whether the player walks or drives: hurt, grace, regen. */
export function tickPlayerTimers(game, dt) {
  const player = game.player;
  player.hurtTimer += dt;
  player.graceTimer = Math.max(0, player.graceTimer - dt);
  if (player.health > 0 && player.health < PLAYER.health && player.hurtTimer > PLAYER.regenDelay) {
    player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
  }
}

/** Spawn the city's pedestrians on random blocks' sidewalks. */
export function spawnPeds(game) {
  const rng = game.rng;
  for (let n = 0; n < TRAFFIC.peds; n += 1) {
    const col = rng.int(0, CITY.cols - 1);
    const row = rng.int(0, CITY.rows - 1);
    const lot = blockRect(col, row);
    const corner = rng.int(0, 3);
    const ped = {
      x: 0, y: 0, angle: 0, corner,
      col, row,
      skin: rng.pick(PALETTE.pedSkin), shirt: rng.pick(PALETTE.pedShirt),
      health: 30, state: 'walk', fleeTimer: 0, walkPhase: rng.range(0, 6),
      down: false,
    };
    const point = sidewalkPoint(lot, corner);
    ped.x = point.x; ped.y = point.y;
    game.peds.push(ped);
  }
}

/** The four corners of a block's sidewalk loop, inset from the lot's edge. */
export function sidewalkPoint(lot, corner) {
  const inset = 13;
  const points = [
    { x: lot.x + inset, y: lot.y + inset },
    { x: lot.x + lot.w - inset, y: lot.y + inset },
    { x: lot.x + lot.w - inset, y: lot.y + lot.h - inset },
    { x: lot.x + inset, y: lot.y + lot.h - inset },
  ];
  return points[corner & 3];
}

/** Advance every pedestrian: stroll the loop, dodge cars, flee trouble. */
export function updatePeds(game, dt) {
  const threat = game.threat;
  for (const ped of game.peds) {
    if (ped.down) continue;
    // Dodge anything with wheels that is close and moving.
    let dodge = null;
    for (const car of game.cars) {
      if (Math.abs(car.speed) < 30) continue;
      const d = distance(ped.x, ped.y, car.x, car.y);
      if (d < 58) { dodge = car; break; }
    }
    if (dodge !== null) {
      const away = Math.atan2(ped.y - dodge.y, ped.x - dodge.x);
      ped.x += Math.cos(away) * 190 * dt;
      ped.y += Math.sin(away) * 190 * dt;
      ped.angle = away;
      ped.walkPhase += dt * 14;
      continue;
    }
    if (threat.timer > 0 && distance(ped.x, ped.y, threat.x, threat.y) < 240) {
      ped.state = 'flee';
      ped.fleeTimer = Math.max(ped.fleeTimer, 1.6);
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      ped.x += Math.cos(away) * 178 * dt;
      ped.y += Math.sin(away) * 178 * dt;
      ped.angle = away;
      ped.walkPhase += dt * 15;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    } else {
      const lot = blockRect(ped.col, ped.row);
      const target = sidewalkPoint(lot, ped.corner);
      const d = distance(ped.x, ped.y, target.x, target.y);
      if (d < 6) {
        ped.corner = (ped.corner + 1) & 3;
      } else {
        const step = 64 * dt;
        ped.x += ((target.x - ped.x) / d) * step;
        ped.y += ((target.y - ped.y) / d) * step;
        ped.angle = Math.atan2(target.y - ped.y, target.x - ped.x);
        ped.walkPhase += dt * 8;
      }
    }
    const pos = { x: ped.x, y: ped.y };
    game.world.resolveCircle(pos, 11);
    ped.x = pos.x; ped.y = pos.y;
  }
  game.threat.timer = Math.max(0, game.threat.timer - dt);
}

/** Fire one bullet; `from` is 'player' or 'cop'. */
export function fireBullet(game, from, x, y, angle) {
  const speed = 920;
  game.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    life: (from === 'player' ? COMBAT.pistolRange : COMBAT.copRange) / speed,
    from,
  });
}

/** Step every bullet and apply its hit: buildings stop them, people and cars don't. */
export function updateBullets(game, dt) {
  const player = game.player;
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && game.world.circleHitsBuilding(b.x, b.y, 3)) {
      game.events.push({ kind: 'spark', x: b.x, y: b.y });
      dead = true;
    }
    if (!dead && b.from === 'player') {
      for (const ped of game.peds) {
        if (ped.down) continue;
        if (distance(b.x, b.y, ped.x, ped.y) < 13) {
          ped.health -= COMBAT.pistolDamage;
          if (ped.health <= 0) {
            ped.down = true;
            game.events.push({ kind: 'crimeDownPed', x: ped.x, y: ped.y });
          }
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const cop of game.footCops) {
          if (cop.down) continue;
          if (distance(b.x, b.y, cop.x, cop.y) < 14) {
            cop.health -= COMBAT.pistolDamage;
            if (cop.health <= 0) {
              cop.down = true;
              game.events.push({ kind: 'crimeDownCop', x: cop.x, y: cop.y });
            } else {
              game.events.push({ kind: 'crimeShootAt', x: cop.x, y: cop.y });
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of game.cars) {
          if (car === player.car) continue;
          if (distance(b.x, b.y, car.x, car.y) < carRadius(car)) {
            car.health = Math.max(0, car.health - COMBAT.pistolDamage * 0.5);
            game.events.push({ kind: 'spark', x: b.x, y: b.y });
            game.events.push({ kind: 'crimeShootAt', x: car.x, y: car.y });
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'cop') {
      if (player.car !== null) {
        if (distance(b.x, b.y, player.car.x, player.car.y) < carRadius(player.car)) {
          player.car.health = Math.max(0, player.car.health - 4);
          if (game.rng() < 0.3) hurtPlayer(game, COMBAT.copDamage);
          dead = true;
        }
      } else if (distance(b.x, b.y, player.x, player.y) < PLAYER.radius + 3) {
        hurtPlayer(game, COMBAT.copDamage);
        dead = true;
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}
