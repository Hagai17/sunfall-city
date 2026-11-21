// Sunfall City — every shared tuning number, colour and name in one place.
// The view is a fixed 1280x720 logical canvas; the renderer scales it to the window.
// The world is a grid of city blocks: roads run between the blocks, a sand beach
// and the sea close the south edge. All distances are world pixels.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second at any display rate. */
export const STEP = 1 / 60;

/** City layout: COLS x ROWS blocks, each block PITCH apart, roads ROAD_W wide. */
export const CITY = {
  cols: 8,
  rows: 6,
  pitch: 384,
  roadW: 96,
  /** Sand strip along the south edge, inside the playable bounds. */
  beachH: 168,
};

/** World width: one road, then (block + road) repeated. */
export const WORLD_W = CITY.cols * CITY.pitch + CITY.roadW;
/** World height: the block grid plus the beach strip. The sea is drawn past it. */
export const WORLD_H = CITY.rows * CITY.pitch + CITY.roadW + CITY.beachH;
/** The shoreline: nothing with wheels or feet may pass this y. */
export const SHORE_Y = WORLD_H - 26;

export const PLAYER = {
  radius: 13,
  walkSpeed: 172,
  sprintSpeed: 258,
  health: 100,
  /** Health regained per second after REGEN_DELAY seconds without damage. */
  regenRate: 5,
  regenDelay: 6,
  /** Seconds of mercy invulnerability after a respawn. */
  respawnGrace: 2,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 430,
  pistolCooldown: 0.24,
  magazine: 12,
  reloadTime: 1.1,
  spread: 0.045,
  copDamage: 7,
  copRange: 300,
  copCooldown: 0.9,
};

export const WANTED = {
  /** Heat points per star; stars are derived from heat, never set directly. */
  perStar: 100,
  maxStars: 5,
  /** Heat lost per second while no officer can see the player. */
  decayRate: 9,
  /** Seconds unseen before decay starts. */
  hideDelay: 4,
  /** Crime prices, in heat. */
  stealCar: 45,
  hitCar: 18,
  hitPed: 70,
  shootAt: 25,
  downCop: 120,
  downPed: 110,
  missionSpike: 200,
};

export const POLICE = {
  /** Cop cars the force tries to keep in play per star. */
  carsPerStar: 2,
  maxCars: 9,
  /** Foot officers that pile out per stopped car at three stars and up. */
  footPerCar: 1,
  spawnDistance: 640,
  despawnDistance: 1150,
  /** A bust fills in this many seconds of standing next to an officer. */
  bustTime: 1.4,
};

export const TRAFFIC = {
  cars: 15,
  parked: 26,
  peds: 20,
};

/** One full day in real seconds; the clock starts at START_HOUR. */
export const DAY_SECONDS = 300;
export const START_HOUR = 9.6;

/** Money and prices. */
export const ECONOMY = {
  bustFine: 0.25,
  wastedBill: 0.15,
  pickupCash: 25,
};

export const PALETTE = {
  backdrop: '#0d1420',
  grass: '#7fae5f',
  lot: '#b3aa97',
  sidewalk: '#d6cfbc',
  curb: '#9d9684',
  asphalt: '#3c414b',
  asphaltDark: '#33373f',
  lanePaint: '#e9e4d2',
  crosswalk: '#cfd4d8',
  sand: '#ecd9a0',
  sandDark: '#e0c78c',
  sea: '#1f7f9e',
  seaLight: '#35a3c2',
  palmTrunk: '#8a6b46',
  palmLeaf: '#3f9e4d',
  lampPost: '#565d66',
  player: '#ffd23f',
  playerTrim: '#2b2d42',
  pedSkin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'],
  pedShirt: ['#ef6f6c', '#56cbf9', '#f6f7eb', '#ffd23f', '#7fb069', '#bc4b51', '#5bc0eb', '#f9c74f'],
  copCar: '#20242e',
  copTrim: '#eef1f5',
  copLightA: '#ff3b30',
  copLightB: '#2f7bff',
  marker: '#ffd23f',
  markerBad: '#ff5d5d',
  health: '#5ad15a',
  healthLow: '#ff5d5d',
  text: '#f5f2e8',
  muted: '#b9bfae',
  panel: 'rgba(13, 20, 32, 0.82)',
  gold: '#ffd23f',
};

/** Roof colours for the city's pastel blocks, picked per building by the city seed. */
export const ROOF_COLORS = [
  '#f4f1de', '#f2cc8f', '#e07a5f', '#81b29a', '#f2e6cf',
  '#ef6f9c', '#8ecae6', '#ffb703', '#90be6d', '#f9c74f',
  '#e5b25d', '#cdb4db', '#a2d2ff', '#ffc8dd', '#bde0fe',
];

/** Paint jobs for civilian cars. */
export const CAR_COLORS = [
  '#e63946', '#f1fa8c', '#457b9d', '#2a9d8f', '#e9c46a',
  '#f4a261', '#9d4edd', '#48cae4', '#ffffff', '#22223b',
  '#6a994e', '#bc4749', '#ffb703', '#3a86ff', '#8338ec',
];

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** localStorage keys: the save game and the settings. */
export const SAVE_KEY = 'sunfall-city.save.v1';
export const MUTE_KEY = 'sunfall-city.muted';
