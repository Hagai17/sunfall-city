// Drawing for Sunfall City: the city from above — roads and pastel blocks, the
// beach and the sea — then cars, people, bullets and particles, then the light:
// a day/night tint with lamp glow and headlight cones after dark. Screens (title,
// pause, busted/wasted) are drawn over the world. Nothing here changes the game;
// it reads the state main.js keeps and paints it.
import { CITY, FONT, PALETTE, VIEW, WORLD_H, WORLD_W } from './config.js';
import { roadCenterX, roadCenterY } from './world.js';
import { clamp, lerp } from './random.js';
import { drawHud } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Sunlight for an hour of the day: 1 at noon, 0 in the small hours. */
export function daylightFor(hour) {
  const sun = Math.sin(((hour - 6) / 12) * Math.PI);
  return clamp(sun * 1.6, 0, 1);
}

/** Multiply a #rrggbb colour by a factor (walls are their roof, shaded). */
function shade(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * factor), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * factor), 0, 255);
  const b = clamp(Math.round((n & 255) * factor), 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || 400}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || 400} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  /** Convert a canvas-relative CSS-pixel point to world coordinates. */
  function toWorld(relX, relY, camera) {
    const rect = canvas.getBoundingClientRect();
    const lx = ((relX * (canvas.width / rect.width)) - view.x) / view.scale;
    const ly = ((relY * (canvas.height / rect.height)) - view.y) / view.scale;
    return { x: camera.x + (lx - VIEW.width / 2), y: camera.y + (ly - VIEW.height / 2) };
  }

  function drawGround(game, bounds) {
    const cityBottom = CITY.rows * CITY.pitch + CITY.roadW;
    // Sea first: it fills everything past the shore and laps at the sand.
    context.fillStyle = PALETTE.sea;
    context.fillRect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
    const wavePhase = game.time * 1.4;
    context.strokeStyle = 'rgba(255,255,255,0.20)';
    context.lineWidth = 2;
    for (let row = 0; row < 3; row += 1) {
      const y = WORLD_H + 18 + row * 30;
      if (y < bounds.y0 - 20 || y > bounds.y1 + 20) continue;
      context.beginPath();
      for (let x = Math.max(0, bounds.x0 - 40); x < Math.min(WORLD_W + 400, bounds.x1 + 40); x += 46) {
        const yy = y + Math.sin(x / 60 + wavePhase + row) * 3;
        if (x === Math.max(0, bounds.x0 - 40)) context.moveTo(x, yy);
        else context.lineTo(x, yy);
      }
      context.stroke();
    }
    // Land: lots, then the beach strip.
    context.fillStyle = PALETTE.lot;
    context.fillRect(0, 0, WORLD_W, cityBottom);
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, cityBottom, WORLD_W, WORLD_H - cityBottom);
    context.fillStyle = PALETTE.sandDark;
    for (let x = 26; x < WORLD_W; x += 150) {
      context.beginPath();
      context.ellipse(x, cityBottom + 96, 34, 7, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Wet sand and a foam line where the sea takes over.
    context.fillStyle = 'rgba(186,158,104,0.4)';
    context.fillRect(0, WORLD_H - 18, WORLD_W, 18);
    context.strokeStyle = 'rgba(255,255,255,0.55)';
    context.lineWidth = 2.4;
    context.beginPath();
    for (let x = 0; x <= WORLD_W; x += 38) {
      const yy = WORLD_H - 3 + Math.sin(x / 52 + wavePhase * 1.7) * 2.4;
      if (x === 0) context.moveTo(x, yy);
      else context.lineTo(x, yy);
    }
    context.stroke();
    // Roads.
    context.fillStyle = PALETTE.asphalt;
    for (let i = 0; i <= CITY.cols; i += 1) {
      context.fillRect(i * CITY.pitch, 0, CITY.roadW, cityBottom);
    }
    for (let j = 0; j <= CITY.rows; j += 1) {
      context.fillRect(0, j * CITY.pitch, WORLD_W, CITY.roadW);
    }
    context.fillStyle = PALETTE.asphaltDark;
    for (let i = 0; i <= CITY.cols; i += 1) {
      for (let j = 0; j <= CITY.rows; j += 1) {
        context.fillRect(i * CITY.pitch, j * CITY.pitch, CITY.roadW, CITY.roadW);
      }
    }
    // Lane dashes down the middle of every road.
    context.fillStyle = PALETTE.lanePaint;
    for (let i = 0; i <= CITY.cols; i += 1) {
      const cx = roadCenterX(i);
      for (let y = 14; y < cityBottom; y += 44) {
        if (y % CITY.pitch < CITY.roadW - 6 && (y + 22) % CITY.pitch > 20) continue;
        context.fillRect(cx - 2, y, 4, 22);
      }
    }
    for (let j = 0; j <= CITY.rows; j += 1) {
      const cy = roadCenterY(j);
      for (let x = 14; x < WORLD_W; x += 44) {
        if (x % CITY.pitch < CITY.roadW - 6 && (x + 22) % CITY.pitch > 20) continue;
        context.fillRect(x, cy - 2, 22, 4);
      }
    }
    // Crosswalks: zebra bands on every approach to every intersection.
    context.fillStyle = 'rgba(207,212,216,0.42)';
    for (let i = 0; i <= CITY.cols; i += 1) {
      for (let j = 0; j <= CITY.rows; j += 1) {
        const rx = i * CITY.pitch;
        const ry = j * CITY.pitch;
        if (j > 0) for (let k = 0; k < 5; k += 1) context.fillRect(rx + 9 + k * 17, ry - 15, 9, 11);
        if (j < CITY.rows) for (let k = 0; k < 5; k += 1) context.fillRect(rx + 9 + k * 17, ry + CITY.roadW + 4, 9, 11);
        if (i > 0) for (let k = 0; k < 5; k += 1) context.fillRect(rx - 15, ry + 9 + k * 17, 11, 9);
        if (i < CITY.cols) for (let k = 0; k < 5; k += 1) context.fillRect(rx + CITY.roadW + 4, ry + 9 + k * 17, 11, 9);
      }
    }
    // The marina lot: asphalt, parking bays.
    const lot = game.world.lot;
    context.fillStyle = PALETTE.asphaltDark;
    context.fillRect(lot.x, lot.y, lot.w, lot.h);
    context.strokeStyle = 'rgba(233,228,210,0.55)';
    context.lineWidth = 2;
    for (let c = 0; c < 5; c += 1) {
      for (let r = 0; r < 2; r += 1) {
        context.strokeRect(lot.x + 26 + c * 56, lot.y + 34 + r * 128, 52, 96);
      }
    }
    // Sidewalk rims around every block lot.
    context.strokeStyle = PALETTE.sidewalk;
    context.lineWidth = 5;
    for (let col = 0; col < CITY.cols; col += 1) {
      for (let row = 0; row < CITY.rows; row += 1) {
        const x = col * CITY.pitch + CITY.roadW;
        const y = row * CITY.pitch + CITY.roadW;
        context.strokeRect(x + 2, y + 2, CITY.pitch - CITY.roadW - 4, CITY.pitch - CITY.roadW - 4);
      }
    }
  }

  function drawBuildings(game, bounds, daylight) {
    const night = daylight < 0.5;
    for (const b of game.world.buildings) {
      if (b.x > bounds.x1 || b.x + b.w < bounds.x0 || b.y > bounds.y1 || b.y + b.h < bounds.y0) continue;
      const wallH = 5 + b.floors * 2.1;
      // Shadow, then the south wall, then the roof.
      context.fillStyle = 'rgba(20,24,18,0.28)';
      context.fillRect(b.x + 7, b.y + 9 + wallH, b.w, b.h);
      context.fillStyle = shade(b.roof, 0.62);
      context.fillRect(b.x, b.y + b.h, b.w, wallH);
      // Windows on the south wall: faint by day, warm and lit after dark.
      const cols = Math.max(2, Math.floor(b.w / 17));
      const rows = Math.max(1, Math.floor(wallH / 9));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const lit = ((cx * 31 + cy * 17 + b.x) % 7) < 3;
          context.fillStyle = night && lit ? '#ffd98a' : 'rgba(30,36,48,0.5)';
          context.fillRect(b.x + 6 + cx * 17, b.y + b.h + 3 + cy * 9, 7, 5);
        }
      }
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = shade(b.roof, 0.78);
      context.lineWidth = 2;
      context.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // A parapet line inside the roof edge and the roof-access box.
      context.strokeStyle = shade(b.roof, 0.9);
      context.lineWidth = 3;
      context.strokeRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
      context.fillStyle = shade(b.roof, 0.88);
      context.fillRect(b.x + b.w * 0.18, b.y + b.h * 0.2, b.w * 0.3, b.h * 0.24);
      if (b.name !== '') {
        // A striped awning over the door, in the building's own colours.
        for (let s = 0; s * 12 < b.w; s += 1) {
          context.fillStyle = s % 2 === 0 ? '#f5f2e8' : shade(b.roof, 0.85);
          context.fillRect(b.x + s * 12, b.y + b.h, Math.min(12, b.w - s * 12), 6);
        }
        context.save();
        context.font = `700 ${Math.max(11, Math.min(17, b.w / 11))}px ${FONT}`;
        context.fillStyle = 'rgba(24,28,38,0.78)';
        context.textAlign = 'center';
        context.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 5);
        context.restore();
      }
    }
  }

  function drawProps(game, bounds) {
    for (const p of game.world.props) {
      if (p.x < bounds.x0 - 30 || p.x > bounds.x1 + 30 || p.y < bounds.y0 - 30 || p.y > bounds.y1 + 30) continue;
      if (p.kind === 'palm') {
        context.fillStyle = 'rgba(20,24,18,0.25)';
        context.beginPath();
        context.ellipse(p.x + 4, p.y + 6, 13, 6, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.palmTrunk;
        context.beginPath();
        context.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = PALETTE.palmLeaf;
        context.lineWidth = 3;
        for (let f = 0; f < 7; f += 1) {
          const a = (f / 7) * Math.PI * 2 + p.x * 0.01;
          context.beginPath();
          context.moveTo(p.x, p.y);
          context.quadraticCurveTo(
            p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11 - 3,
            p.x + Math.cos(a) * 19, p.y + Math.sin(a) * 19 + 3,
          );
          context.stroke();
        }
      } else {
        context.fillStyle = PALETTE.lampPost;
        context.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        context.fillStyle = '#cfd4d8';
        context.beginPath();
        context.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawPickups(game) {
    for (const p of game.world.pickups) {
      if (p.taken) continue;
      const bob = Math.sin(game.time * 3.4 + p.x) * 3;
      const y = p.y + bob;
      context.fillStyle = 'rgba(20,24,18,0.25)';
      context.beginPath();
      context.ellipse(p.x, p.y + 10, 12, 4.5, 0, 0, Math.PI * 2);
      context.fill();
      if (p.kind === 'health') {
        context.fillStyle = '#f5f2e8';
        context.fillRect(p.x - 10, y - 10, 20, 20);
        context.fillStyle = '#e63946';
        context.fillRect(p.x - 3, y - 7, 6, 14);
        context.fillRect(p.x - 7, y - 3, 14, 6);
      } else if (p.kind === 'ammo') {
        context.fillStyle = '#2b2d42';
        context.fillRect(p.x - 11, y - 8, 22, 16);
        context.fillStyle = '#ffd23f';
        for (let b = 0; b < 3; b += 1) context.fillRect(p.x - 7 + b * 6, y - 5, 3.4, 9);
      } else {
        context.fillStyle = '#3f9e4d';
        context.fillRect(p.x - 12, y - 7, 24, 14);
        context.fillStyle = '#f5f2e8';
        context.font = `800 12px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('$', p.x, y + 4.5);
      }
    }
  }

  function drawMarker(game) {
    const target = game.objectiveCache;
    if (target === null || game.screen !== 'play') return;
    const pulse = 1 + Math.sin(game.time * 4.4) * 0.16;
    context.save();
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(target.x, target.y, 26 * pulse, 0, Math.PI * 2);
    context.stroke();
    const grad = context.createLinearGradient(0, target.y - 190, 0, target.y);
    grad.addColorStop(0, 'rgba(255,210,63,0)');
    grad.addColorStop(1, 'rgba(255,210,63,0.34)');
    context.fillStyle = grad;
    context.fillRect(target.x - 13, target.y - 190, 26, 190);
    const bobY = target.y - 52 + Math.sin(game.time * 4.4) * 6;
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.moveTo(target.x, bobY + 14);
    context.lineTo(target.x - 10, bobY);
    context.lineTo(target.x + 10, bobY);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawCar(game, car, daylight) {
    const t = car.type;
    context.save();
    context.translate(car.x, car.y);
    context.fillStyle = 'rgba(15,18,14,0.3)';
    context.beginPath();
    context.ellipse(3, 5, t.length * 0.52, t.width * 0.58, car.angle, 0, Math.PI * 2);
    context.fill();
    context.rotate(car.angle);
    const L = t.length;
    const W = t.width;
    // Wheels.
    context.fillStyle = '#14161a';
    const wy = W / 2 - 2;
    context.fillRect(L * 0.26, -wy - 2.4, 11, 4.6);
    context.fillRect(L * 0.26, wy - 2.2, 11, 4.6);
    context.fillRect(-L * 0.36, -wy - 2.4, 11, 4.6);
    context.fillRect(-L * 0.36, wy - 2.2, 11, 4.6);
    // Body.
    context.fillStyle = car.mode === 'police' ? PALETTE.copCar : car.color;
    context.beginPath();
    context.roundRect(-L / 2, -W / 2, L, W, 6);
    context.fill();
    if (car.mode === 'police') {
      context.fillStyle = PALETTE.copTrim;
      context.fillRect(-L * 0.16, -W / 2, L * 0.3, W);
    }
    // Glasshouse and roof.
    context.fillStyle = 'rgba(18,26,38,0.88)';
    context.beginPath();
    context.roundRect(-L * 0.3, -W * 0.4, L * 0.52, W * 0.8, 4);
    context.fill();
    context.fillStyle = shade(car.mode === 'police' ? '#3a4152' : car.color, 1.18);
    context.beginPath();
    context.roundRect(-L * 0.22, -W * 0.34, L * 0.34, W * 0.68, 3);
    context.fill();
    // Nose and tail trim.
    context.fillStyle = 'rgba(245,242,232,0.85)';
    context.fillRect(L / 2 - 3, -W * 0.36, 3, W * 0.2);
    context.fillRect(L / 2 - 3, W * 0.16, 3, W * 0.2);
    context.fillStyle = 'rgba(200,40,40,0.9)';
    context.fillRect(-L / 2, -W * 0.36, 3, W * 0.2);
    context.fillRect(-L / 2, W * 0.16, 3, W * 0.2);
    if (car.braking) {
      // Brake lights flare: brighter blocks and a soft red halo at the tail.
      context.fillStyle = 'rgba(255,70,55,0.4)';
      context.beginPath();
      context.arc(-L / 2 - 2, 0, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ff5040';
      context.fillRect(-L / 2 - 1.5, -W * 0.38, 4, W * 0.22);
      context.fillRect(-L / 2 - 1.5, W * 0.16, 4, W * 0.22);
    }
    if (t.taxi) {
      context.fillStyle = '#14161a';
      context.fillRect(-4, -4.5, 9, 9);
      context.fillStyle = '#ffd23f';
      context.fillRect(-2.5, -3, 6, 6);
    }
    if (car.mode === 'police') {
      const flash = Math.sin(game.time * 11 + car.sirenPhase) > 0;
      context.fillStyle = flash ? PALETTE.copLightA : '#5a1f1c';
      context.fillRect(-7, -W / 2 + 1.5, 6, 4.4);
      context.fillStyle = flash ? '#5a76c9' : PALETTE.copLightB;
      context.fillRect(1.5, -W / 2 + 1.5, 6, 4.4);
      context.fillStyle = flash ? '#5a76c9' : PALETTE.copLightB;
      context.fillRect(-7, W / 2 - 5.9, 6, 4.4);
      context.fillStyle = flash ? PALETTE.copLightA : '#5a1f1c';
      context.fillRect(1.5, W / 2 - 5.9, 6, 4.4);
    }
    if (car.target) {
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 2.4;
      context.beginPath();
      context.roundRect(-L / 2 - 4, -W / 2 - 4, L + 8, W + 8, 8);
      context.stroke();
    }
    context.restore();
    // Damage smoke is particles' job, but a wreck gets a scorched tint.
    if (car.health <= 0) {
      context.fillStyle = 'rgba(12,12,12,0.35)';
      context.beginPath();
      context.ellipse(car.x, car.y, t.length * 0.5, t.width * 0.55, car.angle, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPerson(x, y, angle, shirt, skin, phase, down) {
    context.save();
    context.translate(x, y);
    if (down) {
      context.rotate(angle + Math.PI / 2);
      context.fillStyle = shirt;
      context.beginPath();
      context.ellipse(0, 0, 15, 7.5, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = skin;
      context.beginPath();
      context.arc(13, 0, 5.4, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    const bob = Math.sin(phase) * 1.6;
    context.fillStyle = 'rgba(15,18,14,0.28)';
    context.beginPath();
    context.ellipse(1.5, 3.5, 10, 5.4, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(angle);
    context.fillStyle = shirt;
    context.beginPath();
    context.arc(0, bob * 0.3, 8.6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = skin;
    context.beginPath();
    context.arc(2.6, bob * 0.3, 5.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawWorld(game) {
    const camera = game.camera;
    const daylight = daylightFor(game.timeHours);
    context.save();
    context.translate(VIEW.width / 2 - camera.x + game.shakeX, VIEW.height / 2 - camera.y + game.shakeY);
    const bounds = {
      x0: camera.x - VIEW.width / 2 - 90, x1: camera.x + VIEW.width / 2 + 90,
      y0: camera.y - VIEW.height / 2 - 90, y1: camera.y + VIEW.height / 2 + 90,
    };
    drawGround(game, bounds);
    drawBuildings(game, bounds, daylight);
    drawProps(game, bounds);
    drawPickups(game);
    // Skid marks under everything that moves.
    for (const s of game.skids) {
      context.save();
      context.translate(s.x, s.y);
      context.rotate(s.angle);
      context.fillStyle = `rgba(20,20,22,${0.34 * s.life})`;
      context.fillRect(-7, -2.4, 14, 4.8);
      context.restore();
    }
    drawMarker(game);
    for (const car of game.cars) {
      if (car.x < bounds.x0 - 70 || car.x > bounds.x1 + 70 || car.y < bounds.y0 - 70 || car.y > bounds.y1 + 70) continue;
      if (game.player.car === car) continue;
      drawCar(game, car, daylight);
    }
    for (const ped of game.peds) drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, ped.down);
    for (const cop of game.footCops) {
      drawPerson(cop.x, cop.y, cop.angle, '#232c3f', '#e0ac69', cop.walkPhase, cop.down);
      if (!cop.down) {
        context.strokeStyle = '#14161a';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(cop.x, cop.y);
        context.lineTo(cop.x + Math.cos(cop.angle) * 17, cop.y + Math.sin(cop.angle) * 17);
        context.stroke();
      }
    }
    const player = game.player;
    if (player.car !== null) drawCar(game, player.car, daylight);
    else {
      drawPerson(player.x, player.y, player.angle, PALETTE.player, '#c68642', player.walkPhase, false);
      // The pistol arm and a muzzle flash on the frame a shot leaves.
      context.strokeStyle = '#2b2d42';
      context.lineWidth = 3.4;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16);
      context.stroke();
      if (player.fireTimer > 0.17) {
        context.fillStyle = 'rgba(255,190,60,0.9)';
        context.beginPath();
        const fx = player.x + Math.cos(player.angle) * 21;
        const fy = player.y + Math.sin(player.angle) * 21;
        context.arc(fx, fy, 5.5, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Bullets as short bright tracers.
    context.strokeStyle = 'rgba(255,226,150,0.95)';
    context.lineWidth = 2.2;
    for (const b of game.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // Particles.
    for (const p of game.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === 'smoke') {
        context.fillStyle = `rgba(70,72,78,${0.34 * a})`;
        context.beginPath();
        context.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
        context.fill();
      } else if (p.kind === 'flame') {
        context.fillStyle = a > 0.5 ? `rgba(255,150,40,${a})` : `rgba(230,57,70,${a})`;
        context.beginPath();
        context.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = `rgba(255,205,90,${a})`;
        context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    context.restore();

    // The day/night wash, then the lights that cut through it.
    const dark = 1 - daylight;
    if (dark > 0.02) {
      const sunset = clamp(1 - Math.abs(game.timeHours - 18.6) / 1.3, 0, 1);
      context.fillStyle = `rgba(255,110,50,${sunset * 0.19})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      context.fillStyle = `rgba(7,11,38,${dark * 0.44})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      context.save();
      context.translate(VIEW.width / 2 - camera.x + game.shakeX, VIEW.height / 2 - camera.y + game.shakeY);
      context.globalCompositeOperation = 'lighter';
      for (const p of game.world.props) {
        if (p.kind !== 'lamp') continue;
        if (p.x < bounds.x0 || p.x > bounds.x1 || p.y < bounds.y0 || p.y > bounds.y1) continue;
        const g = context.createRadialGradient(p.x, p.y, 2, p.x, p.y, 44);
        g.addColorStop(0, `rgba(255,214,140,${0.30 * dark})`);
        g.addColorStop(1, 'rgba(255,214,140,0)');
        context.fillStyle = g;
        context.beginPath();
        context.arc(p.x, p.y, 44, 0, Math.PI * 2);
        context.fill();
      }
      for (const car of game.cars) {
        if (car.x < bounds.x0 || car.x > bounds.x1 || car.y < bounds.y0 || car.y > bounds.y1) continue;
        if (car.mode !== 'traffic' && car.mode !== 'police' && game.player.car !== car) continue;
        headlight(context, car, dark);
      }
      context.restore();
    }
    return daylight;
  }

  function headlight(context2, car, dark) {
    const t = car.type;
    const nx = car.x + Math.cos(car.angle) * (t.length / 2);
    const ny = car.y + Math.sin(car.angle) * (t.length / 2);
    const spread = 0.30;
    for (const side of [-1, 1]) {
      const base = car.angle + side * 0.16;
      const gx = nx + Math.cos(base) * 118;
      const gy = ny + Math.sin(base) * 118;
      const g = context2.createRadialGradient(nx, ny, 4, gx, gy, 96);
      g.addColorStop(0, `rgba(255,236,180,${0.20 * dark})`);
      g.addColorStop(1, 'rgba(255,236,180,0)');
      context2.fillStyle = g;
      context2.beginPath();
      context2.moveTo(nx, ny);
      context2.arc(gx, gy, 96, base + Math.PI - spread - 0.5, base + Math.PI + spread + 0.5);
      context2.closePath();
      context2.fill();
    }
  }

  function drawMenu(game) {
    const grad = context.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, 'rgba(8,12,26,0.52)');
    grad.addColorStop(0.55, 'rgba(8,12,26,0.30)');
    grad.addColorStop(1, 'rgba(8,12,26,0.72)');
    context.fillStyle = grad;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.textAlign = 'center';
    context.fillStyle = 'rgba(10,14,24,0.35)';
    context.font = `900 118px ${FONT}`;
    context.fillText('SUNFALL', VIEW.width / 2 + 4, 190 + 4);
    context.fillStyle = '#f5f2e8';
    context.fillText('SUNFALL', VIEW.width / 2, 190);
    context.fillStyle = PALETTE.gold;
    context.fillText('CITY', VIEW.width / 2, 302);
    context.font = `600 21px ${FONT}`;
    context.fillStyle = '#e8e2cf';
    context.fillText('An original open-world crime game — steal, race, rob, outrun', VIEW.width / 2, 348);
    context.font = `400 17px ${FONT}`;
    context.fillStyle = 'rgba(232,226,207,0.8)';
    context.fillText(game.titleLine, VIEW.width / 2, 382);
    const menu = game.menu;
    menu.items.forEach((item, index) => {
      const y = 428 + index * 52;
      const selected = index === menu.selected;
      if (selected) {
        context.fillStyle = 'rgba(255,210,63,0.92)';
        context.beginPath();
        context.roundRect(VIEW.width / 2 - 168, y - 33, 336, 44, 10);
        context.fill();
      }
      context.font = `800 25px ${FONT}`;
      context.fillStyle = selected ? '#1c2030' : '#f5f2e8';
      context.fillText(item.label, VIEW.width / 2, y);
    });
    context.font = `400 15px ${FONT}`;
    context.fillStyle = 'rgba(245,242,232,0.75)';
    context.fillText('WASD drive & walk · Mouse aim · Click shoot · E enter car · Shift sprint · Space handbrake · Esc pause · M mute', VIEW.width / 2, VIEW.height - 26);
    context.textAlign = 'left';
  }

  function drawOver(game) {
    const busted = game.overKind === 'busted';
    context.fillStyle = busted ? 'rgba(16,24,54,0.55)' : 'rgba(54,10,10,0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.textAlign = 'center';
    context.font = `900 104px ${FONT}`;
    context.fillStyle = busted ? '#7fb2ff' : '#ff5d5d';
    context.fillText(busted ? 'BUSTED' : 'WASTED', VIEW.width / 2, 300);
    context.font = `600 22px ${FONT}`;
    context.fillStyle = '#f5f2e8';
    context.fillText(game.overText, VIEW.width / 2, 356);
    context.font = `700 20px ${FONT}`;
    context.fillStyle = PALETTE.gold;
    context.fillText('Press Enter to carry on', VIEW.width / 2, 420);
    context.textAlign = 'left';
  }

  /** Paint one frame of the given screen. */
  function draw(game) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const screen = game.screen;
    drawWorld(game);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(context, game);
    if (screen === SCREEN_TITLE) drawMenu(game);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8,12,26,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      context.textAlign = 'center';
      context.font = `900 54px ${FONT}`;
      context.fillStyle = '#f5f2e8';
      context.fillText('PAUSED', VIEW.width / 2, 218);
      game.menu.items.forEach((item, index) => {
        const y = 300 + index * 48;
        const selected = index === game.menu.selected;
        if (selected) {
          context.fillStyle = 'rgba(255,210,63,0.92)';
          context.beginPath();
          context.roundRect(VIEW.width / 2 - 150, y - 31, 300, 42, 10);
          context.fill();
        }
        context.font = `800 23px ${FONT}`;
        context.fillStyle = selected ? '#1c2030' : '#f5f2e8';
        context.fillText(item.label, VIEW.width / 2, y);
      });
      context.textAlign = 'left';
    }
    if (screen === SCREEN_OVER) drawOver(game);
    // Fresh damage flashes the edges red.
    if (game.player.hurtTimer < 0.28 && screen === SCREEN_PLAY) {
      const a = (0.28 - game.player.hurtTimer) * 1.5;
      const g = context.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.36, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.78);
      g.addColorStop(0, 'rgba(200,30,30,0)');
      g.addColorStop(1, `rgba(200,30,30,${clamp(a, 0, 0.42)})`);
      context.fillStyle = g;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld, view };
}
