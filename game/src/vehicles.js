// Cars: the types Sunfall drives, the traffic that follows lanes and turns at
// intersections, the parked cars waiting to be borrowed, and the arcade physics
// of the car the player is driving. A car is a plain object; its mode says who
// is driving it ('traffic', 'parked', 'player', 'police' or nobody, 'empty').
import { CAR_COLORS, CITY, TRAFFIC } from './config.js';
import { axisAngle, laneCoordinate, roadCenterX, roadCenterY } from './world.js';
import { clamp, distance, turnToward } from './random.js';

export const CAR_TYPES = {
  compact: { name: 'Pigeon', length: 40, width: 20, topSpeed: 305, accel: 195, grip: 3.6, health: 70 },
  sedan: { name: 'Meridian', length: 46, width: 21, topSpeed: 335, accel: 205, grip: 3.3, health: 95 },
  taxi: { name: 'Meridian Cab', length: 46, width: 21, topSpeed: 330, accel: 200, grip: 3.3, health: 95, taxi: true },
  sports: { name: 'Vireo GT', length: 44, width: 21, topSpeed: 435, accel: 295, grip: 3.9, health: 80 },
  wagon: { name: 'Voyager', length: 49, width: 22, topSpeed: 315, accel: 185, grip: 3.0, health: 110 },
  van: { name: 'Hauler', length: 53, width: 23, topSpeed: 272, accel: 160, grip: 2.7, health: 135 },
  pickup: { name: 'Dune Runner', length: 50, width: 23, topSpeed: 318, accel: 215, grip: 3.0, health: 120 },
  cop: { name: 'Interceptor', length: 47, width: 21, topSpeed: 398, accel: 275, grip: 3.7, health: 130 },
};

const TRAFFIC_TYPES = ['compact', 'sedan', 'sedan', 'taxi', 'wagon', 'van', 'pickup', 'sports'];
let nextCarId = 1;

export function createCar(typeKey, color, x, y, angle) {
  const type = CAR_TYPES[typeKey];
  return {
    id: nextCarId++,
    typeKey, type, color,
    x, y, angle, speed: 0,
    health: type.health, maxHealth: type.health,
    mode: 'empty',
    axis: 'v', road: 0, dirSign: 1, lastCross: '',
    stuckTimer: 0, honkTimer: 0, reverseTimer: 0,
    target: false, driverOut: false, sirenPhase: Math.random() * 6,
  };
}

/** The circle other things collide with, centred on the car. */
export function carRadius(car) {
  return car.type.length * 0.42;
}

/** A point `ahead` pixels in front of the car's centre, and one behind. */
export function carNose(car, ahead) {
  return { x: car.x + Math.cos(car.angle) * ahead, y: car.y + Math.sin(car.angle) * ahead };
}

function randomRoadPoint(rng) {
  const axis = rng.chance(0.5) ? 'v' : 'h';
  const road = axis === 'v' ? rng.int(0, CITY.cols) : rng.int(0, CITY.rows);
  const dirSign = rng.chance(0.5) ? -1 : 1;
  const along = axis === 'v'
    ? rng.range(80, CITY.rows * CITY.pitch)
    : rng.range(80, CITY.cols * CITY.pitch);
  return { axis, road, dirSign, along };
}

/** Spawn the moving traffic and the parked cars for a fresh city. */
export function populateTraffic(game) {
  const rng = game.rng;
  const cars = game.cars;
  for (let n = 0; n < TRAFFIC.cars; n += 1) {
    const spot = randomRoadPoint(rng);
    let x; let y;
    if (spot.axis === 'v') { x = laneCoordinate('v', spot.road, spot.dirSign); y = spot.along; }
    else { x = spot.along; y = laneCoordinate('h', spot.road, spot.dirSign); }
    if (distance(x, y, game.player.x, game.player.y) < 260) continue;
    const typeKey = rng.pick(TRAFFIC_TYPES);
    const car = createCar(typeKey, typeKey === 'taxi' ? '#ffb703' : rng.pick(CAR_COLORS), x, y, axisAngle(spot.axis, spot.dirSign));
    car.mode = 'traffic';
    car.axis = spot.axis; car.road = spot.road; car.dirSign = spot.dirSign;
    car.speed = car.type.topSpeed * 0.4;
    cars.push(car);
  }
  // Parked cars: a neat double row on the marina lot, the rest along curbs.
  const lot = game.world.lot;
  const lotSpots = [];
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      lotSpots.push({ x: lot.x + 52 + c * 56, y: lot.y + 66 + r * 128, angle: -Math.PI / 2 });
    }
  }
  let parkedCount = 0;
  for (const spot of lotSpots) {
    if (parkedCount >= 10) break;
    const typeKey = rng.pick(TRAFFIC_TYPES);
    const car = createCar(typeKey, rng.pick(CAR_COLORS), spot.x, spot.y, spot.angle);
    car.mode = 'parked';
    cars.push(car);
    parkedCount += 1;
  }
  let guard = 0;
  while (parkedCount < TRAFFIC.parked && guard < 300) {
    guard += 1;
    const road = rng.int(0, CITY.cols);
    const row = rng.int(0, CITY.rows - 1);
    const west = rng.chance(0.5);
    const x = roadCenterX(road) + (west ? -CITY.roadW / 2 + 14 : CITY.roadW / 2 - 14);
    const y = rng.range(row * CITY.pitch + CITY.roadW + 44, (row + 1) * CITY.pitch - 44);
    let clear = true;
    for (const other of cars) if (distance(x, y, other.x, other.y) < 58) { clear = false; break; }
    if (!clear) continue;
    const typeKey = rng.pick(TRAFFIC_TYPES);
    const car = createCar(typeKey, rng.pick(CAR_COLORS), x, y, west ? -Math.PI / 2 : Math.PI / 2);
    car.mode = 'parked';
    cars.push(car);
    parkedCount += 1;
  }
}

/** The marked coupe a mission sends the player to steal, parked on the marina lot. */
export function spawnTargetCar(game) {
  const lot = game.world.lot;
  const car = createCar('sports', '#14c8b8', lot.x + lot.w - 52, lot.y + 66, -Math.PI / 2);
  car.mode = 'parked';
  car.target = true;
  game.cars.push(car);
  return car;
}

/** Decide a traffic car's turn as it reaches a crossing; returns the new route. */
function chooseTurn(game, car, crossRoad) {
  const roll = game.rng();
  const straight = { axis: car.axis, road: car.road, dirSign: car.dirSign };
  if (roll < 0.55) return straight;
  const left = roll < 0.78;
  if (car.axis === 'v') {
    // Northbound: left is west, right is east. Southbound: the mirror.
    const dirSign = car.dirSign < 0 ? (left ? -1 : 1) : (left ? 1 : -1);
    return { axis: 'h', road: crossRoad, dirSign };
  }
  // Eastbound: left is north, right is south. Westbound: the mirror.
  const dirSign = car.dirSign > 0 ? (left ? -1 : 1) : (left ? 1 : -1);
  return { axis: 'v', road: crossRoad, dirSign };
}

/** The crossing road index a car is passing right now, or -1. */
function crossingNow(car) {
  if (car.axis === 'v') {
    const j = Math.round((car.y - CITY.roadW / 2) / CITY.pitch);
    if (j < 0 || j > CITY.rows) return -1;
    return Math.abs(car.y - roadCenterY(j)) < 16 ? j : -1;
  }
  const i = Math.round((car.x - CITY.roadW / 2) / CITY.pitch);
  if (i < 0 || i > CITY.cols) return -1;
  return Math.abs(car.x - roadCenterX(i)) < 16 ? i : -1;
}

/** Anything solid in front of a traffic car: another car, or the player. */
function obstacleAhead(game, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let nearest = Infinity;
  function probe(x, y, radius) {
    const dx = x - car.x;
    const dy = y - car.y;
    const fwd = dx * fx + dy * fy;
    const lat = Math.abs(dx * -fy + dy * fx);
    if (fwd > 0 && fwd < 74 && lat < 17 + radius) nearest = Math.min(nearest, fwd);
  }
  for (const other of game.cars) {
    if (other === car) continue;
    probe(other.x, other.y, 8);
  }
  const p = game.player;
  if (p.car === null) probe(p.x, p.y, 2);
  return nearest;
}

/** Advance one traffic car: follow its lane, turn at crossings, mind the traffic. */
export function updateTrafficCar(game, car, dt) {
  const cross = crossingNow(car);
  if (cross !== -1) {
    const key = `${car.axis}:${cross}:${Math.round(car.x / 40)}:${Math.round(car.y / 40)}`;
    if (car.lastCross !== key) {
      car.lastCross = key;
      const next = chooseTurn(game, car, cross);
      car.axis = next.axis; car.road = next.road; car.dirSign = next.dirSign;
    }
  }
  let tx; let ty;
  if (car.axis === 'v') { tx = laneCoordinate('v', car.road, car.dirSign); ty = car.y + car.dirSign * 150; }
  else { tx = car.x + car.dirSign * 150; ty = laneCoordinate('h', car.road, car.dirSign); }
  const desired = Math.atan2(ty - car.y, tx - car.x);
  car.angle = turnToward(car.angle, desired, car.type.grip * 0.62 * dt);

  const cruise = car.type.topSpeed * 0.52;
  const gap = obstacleAhead(game, car);
  let target = cruise;
  if (gap < 40) target = 0;
  else if (gap < 74) target = cruise * 0.4;
  car.braking = target < car.speed - 4;
  if (car.speed < target) car.speed = Math.min(target, car.speed + car.type.accel * 0.7 * dt);
  else car.speed = Math.max(target, car.speed - 320 * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const pos = { x: car.x, y: car.y };
  if (game.world.resolveCircle(pos, car.type.width * 0.8)) {
    car.x = pos.x; car.y = pos.y;
    car.speed *= 0.4;
  }
  if (Math.abs(car.speed) < 6) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.2 && car.honkTimer <= 0) {
      car.honkTimer = 3;
      game.events.push({ kind: 'honk', x: car.x, y: car.y });
    }
  } else car.stuckTimer = 0;
  car.honkTimer = Math.max(0, car.honkTimer - dt);
  // A car wedged for good is quietly recycled to a far road so the city keeps moving.
  if (car.stuckTimer > 6) {
    const spot = randomRoadPoint(game.rng);
    if (spot.axis === 'v') { car.x = laneCoordinate('v', spot.road, spot.dirSign); car.y = spot.along; }
    else { car.x = spot.along; car.y = laneCoordinate('h', spot.road, spot.dirSign); }
    car.axis = spot.axis; car.road = spot.road; car.dirSign = spot.dirSign;
    car.angle = axisAngle(spot.axis, spot.dirSign);
    car.speed = cruise * 0.5;
    car.stuckTimer = 0;
  }
}

/**
 * Drive the player's car for one step. Returns the impact speed of the hardest
 * building hit this step (0 for none) so the caller can shake, damage and report.
 */
export function drivePlayerCar(game, car, input, dt) {
  const type = car.type;
  const throttle = input.throttle();
  const steer = input.steer();
  car.braking = throttle < 0 || input.handbrake();
  if (throttle > 0) car.speed += type.accel * dt;
  else if (throttle < 0) {
    car.speed -= (car.speed > 4 ? 300 : type.accel * 0.62) * dt;
  }
  const drag = input.handbrake() ? 1.9 : 0.55;
  car.speed -= car.speed * drag * dt;
  if (!input.handbrake()) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -138, type.topSpeed * (car.health < car.maxHealth * 0.3 ? 0.72 : 1));

  const speedRatio = clamp(car.speed / 190, -1, 1);
  const turnRate = 2.35 * speedRatio * (input.handbrake() ? 1.45 : 1);
  car.angle += steer * turnRate * dt;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  let impact = 0;
  for (const ahead of [type.length * 0.36, -type.length * 0.36]) {
    const point = carNose(car, ahead);
    const pos = { x: point.x, y: point.y };
    if (game.world.resolveCircle(pos, type.width * 0.52)) {
      const shiftX = pos.x - point.x;
      const shiftY = pos.y - point.y;
      car.x += shiftX; car.y += shiftY;
      impact = Math.max(impact, Math.abs(car.speed));
      car.speed *= -0.18;
    }
  }
  if (impact > 60) {
    car.health = Math.max(0, car.health - (impact - 60) * 0.09);
    game.events.push({ kind: 'crash', x: car.x, y: car.y, power: impact });
  }
  return impact;
}

/** Push overlapping cars apart, trading speed and health; wrecked cars stop dead. */
export function collideCars(game) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      const rr = carRadius(a) + carRadius(b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      const aParked = a.mode === 'parked' || a.mode === 'empty';
      const bParked = b.mode === 'parked' || b.mode === 'empty';
      if (!aParked) { a.x -= nx * push; a.y -= ny * push; }
      if (!bParked) { b.x += nx * push; b.y += ny * push; }
      const relative = Math.abs(a.speed - b.speed);
      if (relative > 40) {
        const damage = (relative - 40) * 0.06;
        a.health = Math.max(0, a.health - damage);
        b.health = Math.max(0, b.health - damage);
        if (a.mode === 'player' || b.mode === 'player') {
          game.events.push({ kind: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: relative });
          game.events.push({ kind: 'crimeHitCar', x: a.x, y: a.y, other: b });
        }
      }
      const swap = (a.speed + b.speed) / 2;
      if (!aParked) a.speed = swap * 0.6;
      if (!bParked) b.speed = swap * 0.6;
    }
  }
  for (const car of cars) {
    if (car.health <= 0 && car.mode !== 'player') car.speed = 0;
  }
}
