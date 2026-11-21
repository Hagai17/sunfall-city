// The story of Sunfall City, in three jobs for fixer Delfina "Del" Reyes, and the
// endless little earners that follow. A mission is a list of steps; each step has
// a kind the update loop checks (goto, steal, deliver, rob, escape), a label the
// HUD shows, and a point or car the minimap marks. Failing is possible — a timer
// runs out, the target car burns, or the player is busted or wasted mid-job —
// and a failed job can simply be picked up again at the club.
import { WANTED } from './config.js';
import { distance } from './random.js';
import { addHeat } from './police.js';
import { spawnTargetCar } from './vehicles.js';

export function createMissionSystem() {
  return {
    storyIndex: 0,
    active: null,
    jobsDone: 0,
    storyDone: false,
  };
}

function say(game, speaker, text, seconds) {
  game.dialogue = { speaker, text, timer: seconds || 4.5 };
}

function banner(game, title, sub) {
  game.banner = { title, sub: sub || '', timer: 3.4 };
  game.events.push({ kind: 'missionCard', title });
}

/** The three story missions, built against this world's landmarks. */
function storyMission(game, index) {
  const L = game.world.landmarks;
  if (index === 0) {
    return {
      id: 'first-wheels', title: 'First Wheels', reward: 500,
      intro: [
        ['Del', 'You must be Jace. I run this club, and half the wheels in Sunfall.'],
        ['Del', 'A teal Vireo GT is sitting on the Marina Lot. Bring it to my garage.'],
      ],
      steps: [
        { kind: 'steal', label: 'Steal the teal Vireo GT on the Marina Lot' },
        { kind: 'deliver', label: "Deliver the coupe to Del's Garage", at: { x: L.garage.door.x, y: L.garage.door.y + 44 }, radius: 58, timer: 185 },
      ],
    };
  }
  if (index === 1) {
    return {
      id: 'hot-cargo', title: 'Hot Cargo', reward: 900,
      intro: [
        ['Del', 'Pier 9 has a package with my name on it. Quiet hands, fast feet.'],
        ['Del', 'The moment you lift it, every badge in Sunfall will smell it.'],
      ],
      steps: [
        { kind: 'goto', label: 'Pick up the package at Pier 9 Warehouse', at: L.docks.door, radius: 44, onFoot: true },
        { kind: 'deliverAny', label: 'Drop the package at Hotel Marisol', at: { x: L.hotel.door.x, y: L.hotel.door.y + 20 }, radius: 54, timer: 240 },
      ],
    };
  }
  return {
    id: 'the-sunfall-job', title: 'The Sunfall Job', reward: 1800,
    intro: [
      ['Del', 'Last one, Jace. The Sunfall Bank keeps my money in its vault.'],
      ['Del', 'Take it back, shake the heat, and come home to the garage.'],
    ],
    steps: [
      { kind: 'goto', label: 'Go to the Sunfall Bank', at: L.bank.door, radius: 46, onFoot: true },
      { kind: 'rob', label: 'Rob the bank: hold the vault point', at: L.bank.door, radius: 42, duration: 9 },
      { kind: 'escape', label: "Escape to Del's Garage — lose the heat first", at: { x: L.garage.door.x, y: L.garage.door.y + 44 }, radius: 62 },
    ],
  };
}

/** A repeatable little earner: lift a marked car, drop it somewhere across town. */
function oddJob(game) {
  const L = game.world.landmarks;
  const spots = [L.bank.door, L.hotel.door, L.docks.door, L.supply.door, L.club.door, L.hospital.door];
  const at = game.rng.pick(spots);
  let target = null;
  for (const car of game.cars) {
    if (car.mode === 'parked' && !car.target) { target = car; break; }
  }
  if (target === null) target = spawnTargetCar(game);
  target.target = true;
  const dist = distance(target.x, target.y, at.x, at.y);
  return {
    id: 'odd-job', title: 'Odd Job', reward: Math.round(140 + dist * 0.16),
    intro: [['Del', 'Quick earner, Jace. Marked car, marked door. Try not to scratch it.']],
    steps: [
      { kind: 'steal', label: 'Steal the marked car', car: target },
      { kind: 'deliver', label: 'Deliver the car to the marked door', at: { x: at.x, y: at.y + 26 }, radius: 58, timer: Math.round(60 + dist / 9) },
    ],
    jobTarget: target,
  };
}

function startMission(game, def) {
  const missions = game.missions;
  missions.active = { def, stepIndex: 0, stepTimer: def.steps[0].timer || 0, robTimer: 0, targetCar: null };
  banner(game, def.title, def.id === 'odd-job' ? 'Odd job' : `Story job ${missions.storyIndex + 1} of 3`);
  if (def.intro.length > 0) say(game, def.intro[0][0], def.intro[0][1], 4.5);
  game.dialogueQueue = def.intro.slice(1).map((line) => ({ speaker: line[0], text: line[1], timer: 4.5 }));
  prepareStep(game);
  game.events.push({ kind: 'missionStart', id: def.id });
}

function prepareStep(game) {
  const active = game.missions.active;
  if (active === null) return;
  const step = active.def.steps[active.stepIndex];
  active.stepTimer = step.timer || 0;
  active.robTimer = 0;
  if (step.kind === 'steal') {
    if (step.car) {
      active.targetCar = step.car;
    } else if (active.targetCar === null) {
      active.targetCar = spawnTargetCar(game);
    }
    if (active.targetCar !== null) active.targetCar.target = true;
  }
}

function completeStep(game) {
  const missions = game.missions;
  const active = missions.active;
  active.stepIndex += 1;
  game.events.push({ kind: 'stepDone', x: game.player.x, y: game.player.y });
  if (active.stepIndex >= active.def.steps.length) {
    completeMission(game);
  } else {
    prepareStep(game);
  }
}

function completeMission(game) {
  const missions = game.missions;
  const def = missions.active.def;
  // Clean work pays: a delivered car that arrives nearly unmarked earns a bonus.
  let bonus = 0;
  const target = missions.active.targetCar;
  const isDelivery = def.steps.some((s) => s.kind === 'deliver');
  if (isDelivery && target !== null && target.health >= target.maxHealth * 0.7) {
    bonus = Math.round(def.reward * 0.3);
  }
  game.money += def.reward + bonus;
  const paid = `+$${def.reward + bonus}${bonus > 0 ? ' — clean work bonus' : ''}`;
  if (missions.active.targetCar !== null) {
    missions.active.targetCar.target = false;
    // A delivered car changes hands: main steps the player out of it.
    if (game.player.car === missions.active.targetCar) game.deliverCar = missions.active.targetCar;
  }
  if (def.jobTarget) def.jobTarget.target = false;
  missions.active = null;
  if (def.id === 'odd-job') {
    missions.jobsDone += 1;
    banner(game, 'Job done', paid);
  } else {
    missions.storyIndex += 1;
    banner(game, `${def.title} — done`, paid);
    if (missions.storyIndex >= 3) {
      missions.storyDone = true;
      say(game, 'Del', 'That is the whole pie, Jace. Sunfall is yours now. Odd jobs at the garage, any time.', 6);
    }
  }
  game.events.push({ kind: 'missionComplete', id: def.id, reward: def.reward });
  game.wantSave = true;
}

/** End the active job without pay; the reason is told to the player. */
export function failMission(game, reason) {
  const missions = game.missions;
  if (missions.active === null) return;
  if (missions.active.targetCar !== null) missions.active.targetCar.target = false;
  if (missions.active.def.jobTarget) missions.active.def.jobTarget.target = false;
  missions.active = null;
  banner(game, 'Job failed', reason);
  if (reason === 'Out of time' || reason === 'The car was wrecked') {
    say(game, 'Del', 'Heard it went sideways, Jace. Come back and we run it again.', 4.5);
  }
  game.events.push({ kind: 'missionFailed', reason });
}

/** The point the world marker and minimap should show right now, if any. */
export function objectivePoint(game) {
  const missions = game.missions;
  const L = game.world.landmarks;
  if (missions.active === null) {
    const door = missions.storyDone ? L.garage.door : L.club.door;
    return { x: door.x, y: door.y };
  }
  const active = missions.active;
  const step = active.def.steps[active.stepIndex];
  if (step.kind === 'steal' && active.targetCar !== null) {
    return { x: active.targetCar.x, y: active.targetCar.y };
  }
  return step.at || null;
}

/** The objective line for the HUD, with a live distance or timer folded in. */
export function objectiveText(game) {
  const missions = game.missions;
  if (missions.active === null) {
    return missions.storyDone
      ? "Odd jobs: see Del at the garage"
      : 'See Del at the Coral Club';
  }
  const active = missions.active;
  const step = active.def.steps[active.stepIndex];
  let text = step.label;
  if (step.kind === 'rob') {
    text += ` — ${Math.ceil(step.duration - active.robTimer)}s`;
  } else if (active.stepTimer > 0) {
    text += ` — ${Math.ceil(active.stepTimer)}s`;
  } else {
    const point = objectivePoint(game);
    if (point !== null) {
      const d = Math.round(distance(game.player.x, game.player.y, point.x, point.y) / 10);
      text += ` — ${d}m`;
    }
  }
  return text;
}

/** Advance the mission state for one step. */
export function updateMissions(game, dt) {
  const missions = game.missions;
  const player = game.player;
  const L = game.world.landmarks;

  if (missions.active === null) {
    // Standing at the giver's door starts the next job.
    const door = missions.storyDone ? L.garage.door : L.club.door;
    if (player.car === null && distance(player.x, player.y, door.x, door.y) < 46) {
      if (missions.storyIndex < 3) startMission(game, storyMission(game, missions.storyIndex));
      else startMission(game, oddJob(game));
    }
    return;
  }

  const active = missions.active;
  const step = active.def.steps[active.stepIndex];

  if (active.stepTimer > 0) {
    active.stepTimer -= dt;
    if (active.stepTimer <= 0) {
      failMission(game, 'Out of time');
      return;
    }
  }
  if ((step.kind === 'steal' || step.kind === 'deliver') && active.targetCar !== null && active.targetCar.health <= 0) {
    failMission(game, 'The car was wrecked');
    return;
  }

  const px = player.car !== null ? player.car.x : player.x;
  const py = player.car !== null ? player.car.y : player.y;

  if (step.kind === 'goto') {
    if ((!step.onFoot || player.car === null) && distance(px, py, step.at.x, step.at.y) < step.radius) {
      if (active.def.id === 'hot-cargo' && active.stepIndex === 0) {
        addHeat(game, WANTED.missionSpike);
        say(game, 'Del', 'That is the stuff. Now move — Hotel Marisol, and do not stop.', 4.5);
        game.events.push({ kind: 'pickupPackage', x: px, y: py });
      }
      completeStep(game);
    }
  } else if (step.kind === 'steal') {
    if (active.targetCar !== null && player.car === active.targetCar) completeStep(game);
  } else if (step.kind === 'deliver') {
    // A delivery is a hand-over, not a fly-by: arrive in the car and stop.
    if (player.car === active.targetCar && Math.abs(player.car.speed) < 25 && distance(px, py, step.at.x, step.at.y) < step.radius) {
      completeStep(game);
    }
  } else if (step.kind === 'deliverAny') {
    const slowEnough = player.car === null || Math.abs(player.car.speed) < 45;
    if (slowEnough && distance(px, py, step.at.x, step.at.y) < step.radius) completeStep(game);
  } else if (step.kind === 'rob') {
    if (player.car === null && distance(px, py, step.at.x, step.at.y) < step.radius) {
      const before = active.robTimer;
      active.robTimer += dt;
      if (before < step.duration / 2 && active.robTimer >= step.duration / 2) {
        addHeat(game, WANTED.missionSpike);
        say(game, 'Jace', 'Half the vault. Sirens already — keep going.', 3.5);
      }
      if (active.robTimer >= step.duration) {
        addHeat(game, WANTED.perStar);
        completeStep(game);
      }
    } else {
      active.robTimer = Math.max(0, active.robTimer - dt * 1.5);
    }
  } else if (step.kind === 'escape') {
    if (distance(px, py, step.at.x, step.at.y) < step.radius && game.police.stars <= 1) {
      completeStep(game);
    }
  }
}
