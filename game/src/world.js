// The city of Sunfall: a seeded grid of pastel blocks between wide roads, a marina
// parking lot, named landmark buildings the story uses, palms and lamps as props,
// and the pickups scattered at sensible places. This module owns the static world:
// generation, road and lane geometry, and collision of circles against buildings.
// Nothing here knows about the player, cars or missions; it answers questions.
import { CITY, ROOF_COLORS, SHORE_Y, WORLD_H, WORLD_W } from './config.js';
import { clamp, createRandom } from './random.js';

/** Lane offset from a road's centre line: traffic keeps right. */
export const LANE_OFF = CITY.roadW / 4;
/** The block interior's size (the lot inside the roads). */
export const BLOCK_SIZE = CITY.pitch - CITY.roadW;

/** Centre x of vertical road i (0..CITY.cols). */
export function roadCenterX(i) {
  return i * CITY.pitch + CITY.roadW / 2;
}

/** Centre y of horizontal road j (0..CITY.rows). */
export function roadCenterY(j) {
  return j * CITY.pitch + CITY.roadW / 2;
}

/** The lot rectangle of block (col, row): the ground between the roads around it. */
export function blockRect(col, row) {
  return {
    x: col * CITY.pitch + CITY.roadW,
    y: row * CITY.pitch + CITY.roadW,
    w: BLOCK_SIZE,
    h: BLOCK_SIZE,
  };
}

/** True when the point is on any road (not on a lot, not on the beach). */
export function isRoad(x, y) {
  const onVertical = x % CITY.pitch < CITY.roadW;
  const onHorizontal = y % CITY.pitch < CITY.roadW;
  return onVertical || onHorizontal;
}

/** True when the point is on the sand strip at the south edge. */
export function isBeach(x, y) {
  return y > CITY.rows * CITY.pitch + CITY.roadW;
}

/**
 * The lane centre coordinate for a car on a road, keeping right:
 * axis 'v' moving with dirSign (-1 north, +1 south) along vertical road i,
 * axis 'h' moving with dirSign (-1 west, +1 east) along horizontal road j.
 */
export function laneCoordinate(axis, road, dirSign) {
  if (axis === 'v') return roadCenterX(road) + (dirSign < 0 ? LANE_OFF : -LANE_OFF);
  return roadCenterY(road) + (dirSign > 0 ? LANE_OFF : -LANE_OFF);
}

/** The heading angle for an axis and direction sign. */
export function axisAngle(axis, dirSign) {
  if (axis === 'v') return dirSign < 0 ? -Math.PI / 2 : Math.PI / 2;
  return dirSign > 0 ? 0 : Math.PI;
}

/** Landmark blocks: fixed (col, row) homes for the buildings the story names. */
const LANDMARK_BLOCKS = {
  bank: { col: 3, row: 1, name: 'Sunfall Bank', roof: '#f4f1de' },
  club: { col: 5, row: 4, name: 'The Coral Club', roof: '#ef6f9c' },
  garage: { col: 2, row: 4, name: "Del's Garage", roof: '#e07a5f' },
  hospital: { col: 1, row: 1, name: 'St. Solana Hospital', roof: '#eef1f5' },
  police: { col: 6, row: 1, name: 'Sunfall PD', roof: '#81b29a' },
  hotel: { col: 5, row: 2, name: 'Hotel Marisol', roof: '#f2cc8f' },
  supply: { col: 4, row: 3, name: 'Sunfall Supply', roof: '#8ecae6' },
  docks: { col: 7, row: 5, name: 'Pier 9 Warehouse', roof: '#a2d2ff' },
};

/** The marina lot block: painted asphalt, no building, room to park a row of cars. */
const LOT_BLOCK = { col: 6, row: 5 };

function makeBuilding(x, y, w, h, floors, roof, name, kind) {
  return { x, y, w, h, floors, roof, name: name || '', kind: kind || 'block' };
}

/**
 * Fill one ordinary block with buildings: one tower, a pair, or four walk-ups,
 * decided by the block's own random stream so the city is stable per seed.
 */
function fillBlock(buildings, col, row, rng) {
  const lot = blockRect(col, row);
  const pattern = rng.int(0, 2);
  const inset = 30;
  if (pattern === 0) {
    buildings.push(makeBuilding(
      lot.x + inset, lot.y + inset, lot.w - inset * 2, lot.h - inset * 2,
      rng.int(4, 12), rng.pick(ROOF_COLORS),
    ));
  } else if (pattern === 1) {
    const vertical = rng.chance(0.5);
    const gap = 26;
    for (let k = 0; k < 2; k += 1) {
      if (vertical) {
        const w = (lot.w - inset * 2 - gap) / 2;
        buildings.push(makeBuilding(lot.x + inset + k * (w + gap), lot.y + inset, w, lot.h - inset * 2, rng.int(2, 7), rng.pick(ROOF_COLORS)));
      } else {
        const h = (lot.h - inset * 2 - gap) / 2;
        buildings.push(makeBuilding(lot.x + inset, lot.y + inset + k * (h + gap), lot.w - inset * 2, h, rng.int(2, 7), rng.pick(ROOF_COLORS)));
      }
    }
  } else {
    const gap = 24;
    const w = (lot.w - inset * 2 - gap) / 2;
    const h = (lot.h - inset * 2 - gap) / 2;
    for (let kx = 0; kx < 2; kx += 1) {
      for (let ky = 0; ky < 2; ky += 1) {
        buildings.push(makeBuilding(lot.x + inset + kx * (w + gap), lot.y + inset + ky * (h + gap), w, h, rng.int(1, 5), rng.pick(ROOF_COLORS)));
      }
    }
  }
}

/** A landmark's front door: the point on the road just south of its building. */
function doorPoint(building) {
  return { x: building.x + building.w / 2, y: building.y + building.h + 26 };
}

/**
 * Build the whole static city for a seed. Returns the buildings, the named
 * landmarks (building plus door point), the props, the pickups and the marina
 * lot rectangle, plus the collision and query helpers bound to them.
 */
export function createWorld(seed) {
  const rng = createRandom(seed ^ 0x51ab);
  const buildings = [];
  const landmarks = {};

  for (let col = 0; col < CITY.cols; col += 1) {
    for (let row = 0; row < CITY.rows; row += 1) {
      if (col === LOT_BLOCK.col && row === LOT_BLOCK.row) continue;
      let landmarkKey = null;
      for (const key of Object.keys(LANDMARK_BLOCKS)) {
        const spec = LANDMARK_BLOCKS[key];
        if (spec.col === col && spec.row === row) landmarkKey = key;
      }
      if (landmarkKey !== null) {
        const spec = LANDMARK_BLOCKS[landmarkKey];
        const lot = blockRect(col, row);
        const building = makeBuilding(lot.x + 26, lot.y + 26, lot.w - 52, lot.h - 52, 5, spec.roof, spec.name, landmarkKey);
        buildings.push(building);
        landmarks[landmarkKey] = { building, door: doorPoint(building) };
      } else {
        fillBlock(buildings, col, row, rng);
      }
    }
  }

  // Props: palms along the beach and the promenade, lamps at intersection corners.
  const props = [];
  for (let x = 60; x < WORLD_W - 40; x += 118) {
    props.push({ kind: 'palm', x: x + rng.range(-16, 16), y: WORLD_H - CITY.beachH + 34 + rng.range(-8, 8), r: 6 });
    if (rng.chance(0.6)) props.push({ kind: 'palm', x: x + rng.range(20, 60), y: WORLD_H - 44 + rng.range(-8, 6), r: 6 });
  }
  for (let col = 0; col < CITY.cols; col += 1) {
    for (let row = 0; row < CITY.rows; row += 1) {
      const lot = blockRect(col, row);
      if (rng.chance(0.7)) props.push({ kind: 'palm', x: lot.x + 14, y: lot.y + 14, r: 6 });
      if (rng.chance(0.5)) props.push({ kind: 'palm', x: lot.x + lot.w - 14, y: lot.y + lot.h - 14, r: 6 });
    }
  }
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (let j = 0; j <= CITY.rows; j += 1) {
      props.push({ kind: 'lamp', x: roadCenterX(i) - CITY.roadW / 2 - 7, y: roadCenterY(j) - CITY.roadW / 2 - 7, r: 4 });
      props.push({ kind: 'lamp', x: roadCenterX(i) + CITY.roadW / 2 + 7, y: roadCenterY(j) + CITY.roadW / 2 + 7, r: 4 });
    }
  }

  // Pickups at places that make sense: care at the hospital, ammunition at the
  // supply store and the docks, cash where alleys and the lot leave it lying.
  const pickups = [];
  function addPickup(kind, x, y) {
    pickups.push({ kind, x, y, taken: false, timer: 0 });
  }
  addPickup('health', landmarks.hospital.door.x - 40, landmarks.hospital.door.y);
  addPickup('health', roadCenterX(4), roadCenterY(5) + 10);
  addPickup('ammo', landmarks.supply.door.x + 36, landmarks.supply.door.y);
  addPickup('ammo', landmarks.docks.door.x - 52, landmarks.docks.door.y);
  addPickup('ammo', landmarks.police.door.x + 120, landmarks.police.door.y + 6);
  const lotRect = blockRect(LOT_BLOCK.col, LOT_BLOCK.row);
  addPickup('cash', lotRect.x + lotRect.w - 38, lotRect.y + lotRect.h - 42);
  addPickup('cash', roadCenterX(2) + 30, roadCenterY(3) - 30);
  addPickup('cash', roadCenterX(7) - 26, roadCenterY(2) + 34);
  addPickup('cash', WORLD_W / 2, WORLD_H - 60);

  const lot = { x: lotRect.x, y: lotRect.y, w: lotRect.w, h: lotRect.h, name: 'Marina Lot' };

  /** Push a circle out of every building and prop it overlaps; reports contact. */
  function resolveCircle(pos, radius) {
    let hit = false;
    pos.x = clamp(pos.x, radius, WORLD_W - radius);
    if (pos.y < radius) pos.y = radius;
    if (pos.y > SHORE_Y - radius) pos.y = SHORE_Y - radius;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (pos.x < b.x - radius || pos.x > b.x + b.w + radius || pos.y < b.y - radius || pos.y > b.y + b.h + radius) continue;
      const nearX = clamp(pos.x, b.x, b.x + b.w);
      const nearY = clamp(pos.y, b.y, b.y + b.h);
      let dx = pos.x - nearX;
      let dy = pos.y - nearY;
      let d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      hit = true;
      if (d2 === 0) {
        // Centre inside the rect: leave by the shortest side.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = b.x - radius;
        else if (min === right) pos.x = b.x + b.w + radius;
        else if (min === top) pos.y = b.y - radius;
        else pos.y = b.y + b.h + radius;
        continue;
      }
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      pos.x = nearX + dx * radius;
      pos.y = nearY + dy * radius;
    }
    for (let i = 0; i < props.length; i += 1) {
      const p = props[i];
      const rr = radius + p.r;
      const dx = pos.x - p.x;
      const dy = pos.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      pos.x = p.x + (dx / d) * rr;
      pos.y = p.y + (dy / d) * rr;
      hit = true;
    }
    return hit;
  }

  /** True when a circle at (x, y) would touch any building (line-of-sight helper). */
  function circleHitsBuilding(x, y, radius) {
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      const nearX = clamp(x, b.x, b.x + b.w);
      const nearY = clamp(y, b.y, b.y + b.h);
      const dx = x - nearX;
      const dy = y - nearY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
    return false;
  }

  /** Rough line of sight: sample the segment; blocked if a sample enters a building. */
  function hasLineOfSight(x1, y1, x2, y2) {
    const steps = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 36));
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      if (circleHitsBuilding(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 6)) return false;
    }
    return true;
  }

  /** Bring pickups back a while after they are taken. */
  function updatePickups(dt) {
    for (const p of pickups) {
      if (!p.taken) continue;
      p.timer -= dt;
      if (p.timer <= 0) p.taken = false;
    }
  }

  return {
    buildings, landmarks, props, pickups, lot,
    resolveCircle, circleHitsBuilding, hasLineOfSight, updatePickups,
  };
}
