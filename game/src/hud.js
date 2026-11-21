// The HUD: everything drawn in the 1280x720 logical screen space over the world —
// health and the bust meter, money and wanted stars, the objective line, the
// minimap with its blips, weapon and speed readouts, dialogue and banners.
import { CITY, FONT, PALETTE, VIEW, WORLD_H, WORLD_W } from './config.js';
import { roadCenterX, roadCenterY } from './world.js';
import { objectiveText } from './missions.js';

const MAP = { x: 18, y: VIEW.height - 176, w: 196, h: 158 };

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function star(context, cx, cy, r, filled) {
  context.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  if (filled) {
    context.fillStyle = PALETTE.gold;
    context.fill();
  } else {
    context.strokeStyle = 'rgba(245,242,232,0.55)';
    context.lineWidth = 1.6;
    context.stroke();
  }
}

function wrapText(context, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (context.measureText(next).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

function drawMinimap(context, game) {
  const sx = MAP.w / WORLD_W;
  const sy = MAP.h / WORLD_H;
  context.save();
  roundRect(context, MAP.x, MAP.y, MAP.w, MAP.h, 10);
  context.fillStyle = '#123c4a';
  context.fill();
  context.clip();
  context.fillStyle = '#57785a';
  context.fillRect(MAP.x, MAP.y, MAP.w, MAP.h - CITY.beachH * sy - 6);
  context.fillStyle = PALETTE.sand;
  context.fillRect(MAP.x, MAP.y + MAP.h - CITY.beachH * sy - 6, MAP.w, CITY.beachH * sy);
  context.strokeStyle = 'rgba(233,228,210,0.5)';
  context.lineWidth = 2;
  for (let i = 0; i <= CITY.cols; i += 1) {
    context.beginPath();
    context.moveTo(MAP.x + roadCenterX(i) * sx, MAP.y);
    context.lineTo(MAP.x + roadCenterX(i) * sx, MAP.y + MAP.h);
    context.stroke();
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    context.beginPath();
    context.moveTo(MAP.x, MAP.y + roadCenterY(j) * sy);
    context.lineTo(MAP.x + MAP.w, MAP.y + roadCenterY(j) * sy);
    context.stroke();
  }
  const blink = Math.floor(game.time * 3) % 2 === 0;
  for (const car of game.cars) {
    if (car.mode !== 'police') continue;
    context.fillStyle = blink ? PALETTE.copLightA : PALETTE.copLightB;
    context.fillRect(MAP.x + car.x * sx - 2.5, MAP.y + car.y * sy - 2.5, 5, 5);
  }
  for (const cop of game.footCops) {
    if (cop.down) continue;
    context.fillStyle = '#ff5d5d';
    context.fillRect(MAP.x + cop.x * sx - 2, MAP.y + cop.y * sy - 2, 4, 4);
  }
  const target = game.objectiveCache;
  if (target !== null) {
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.arc(MAP.x + target.x * sx, MAP.y + target.y * sy, 4 + Math.sin(game.time * 5) * 1.2, 0, Math.PI * 2);
    context.fill();
  }
  // The player: a white arrow that turns with them.
  const p = game.player;
  const px = MAP.x + (p.car !== null ? p.car.x : p.x) * sx;
  const py = MAP.y + (p.car !== null ? p.car.y : p.y) * sy;
  const angle = p.car !== null ? p.car.angle : p.angle;
  context.translate(px, py);
  context.rotate(angle);
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(7, 0);
  context.lineTo(-5, -4.5);
  context.lineTo(-5, 4.5);
  context.closePath();
  context.fill();
  context.restore();
  roundRect(context, MAP.x, MAP.y, MAP.w, MAP.h, 10);
  context.strokeStyle = 'rgba(245,242,232,0.6)';
  context.lineWidth = 1.5;
  context.stroke();
}

/** Draw the whole HUD for the play screen. `game` carries every readout. */
export function drawHud(context, game) {
  const player = game.player;
  context.textBaseline = 'alphabetic';

  // Health, top-left, with the bust meter under it while an officer has a grip.
  context.fillStyle = PALETTE.panel;
  roundRect(context, 18, 16, 252, 46, 8);
  context.fill();
  context.font = `700 13px ${FONT}`;
  context.fillStyle = PALETTE.muted;
  context.textAlign = 'left';
  context.fillText('JACE MARLOWE', 30, 34);
  context.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(context, 30, 40, 228, 12, 6);
  context.fill();
  context.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.healthLow;
  roundRect(context, 30, 40, 228 * Math.max(0, player.health / 100), 12, 6);
  context.fill();
  if (player.bustMeter > 0.02) {
    context.fillStyle = 'rgba(255,59,48,0.85)';
    roundRect(context, 30, 56, 228 * player.bustMeter, 5, 2.5);
    context.fill();
    context.font = `700 11px ${FONT}`;
    context.fillStyle = '#ff8f88';
    context.fillText('BUSTED…', 30, 76);
  }

  // Money and stars, top-right.
  context.font = `800 30px ${FONT}`;
  context.textAlign = 'right';
  context.fillStyle = PALETTE.gold;
  context.fillText(`$${game.money.toLocaleString('en-US')}`, VIEW.width - 24, 48);
  for (let s = 0; s < 5; s += 1) {
    const filled = s < game.police.stars;
    // While unseen with heat draining, earned stars blink as they cool.
    const cooling = !game.police.seen && game.police.heat > 0 && filled;
    if (!cooling || Math.floor(game.time * 2.4) % 2 === 0) {
      star(context, VIEW.width - 40 - (4 - s) * 34, 78, 13, filled);
    }
  }

  // Objective, top-centre.
  const objective = objectiveText(game);
  context.font = `600 17px ${FONT}`;
  const width = Math.min(620, context.measureText(objective).width + 40);
  context.fillStyle = PALETTE.panel;
  roundRect(context, (VIEW.width - width) / 2, 14, width, 38, 9);
  context.fill();
  context.fillStyle = PALETTE.text;
  context.textAlign = 'center';
  context.fillText(objective, VIEW.width / 2, 39);

  drawMinimap(context, game);

  // Bottom-right: the pistol and, while driving, the car's speed and health.
  context.textAlign = 'right';
  if (player.car !== null) {
    const mph = Math.round(Math.abs(player.car.speed) * 0.19);
    context.font = `800 34px ${FONT}`;
    context.fillStyle = PALETTE.text;
    context.fillText(`${mph}`, VIEW.width - 66, VIEW.height - 26);
    context.font = `600 13px ${FONT}`;
    context.fillStyle = PALETTE.muted;
    context.fillText('MPH', VIEW.width - 24, VIEW.height - 26);
    context.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(context, VIEW.width - 224, VIEW.height - 52, 200, 8, 4);
    context.fill();
    context.fillStyle = player.car.health > player.car.maxHealth * 0.3 ? '#7fd4ff' : '#ff5d5d';
    roundRect(context, VIEW.width - 224, VIEW.height - 52, 200 * Math.max(0, player.car.health / player.car.maxHealth), 8, 4);
    context.fill();
  } else {
    context.font = `800 24px ${FONT}`;
    context.fillStyle = PALETTE.text;
    context.fillText(player.reloading > 0 ? 'RELOADING' : `${player.inMag} / ${player.ammo}`, VIEW.width - 24, VIEW.height - 26);
    context.font = `600 12px ${FONT}`;
    context.fillStyle = PALETTE.muted;
    context.fillText('PISTOL — R RELOADS', VIEW.width - 24, VIEW.height - 48);
  }

  // The interaction prompt, bottom-centre.
  if (game.prompt !== '') {
    context.font = `700 18px ${FONT}`;
    const w = context.measureText(game.prompt).width + 36;
    context.fillStyle = PALETTE.panel;
    roundRect(context, (VIEW.width - w) / 2, VIEW.height - 118, w, 36, 9);
    context.fill();
    context.fillStyle = PALETTE.gold;
    context.textAlign = 'center';
    context.fillText(game.prompt, VIEW.width / 2, VIEW.height - 94);
  }

  // Dialogue: a named box along the bottom.
  if (game.dialogue !== null && game.dialogue.timer > 0) {
    const boxW = 640;
    const boxX = (VIEW.width - boxW) / 2;
    const boxY = VIEW.height - 84;
    context.fillStyle = PALETTE.panel;
    roundRect(context, boxX, boxY, boxW, 66, 10);
    context.fill();
    context.font = `800 14px ${FONT}`;
    context.fillStyle = PALETTE.gold;
    context.textAlign = 'left';
    context.fillText(game.dialogue.speaker.toUpperCase(), boxX + 18, boxY + 24);
    context.font = `400 16px ${FONT}`;
    context.fillStyle = PALETTE.text;
    const lines = wrapText(context, game.dialogue.text, boxW - 36);
    context.fillText(lines[0] || '', boxX + 18, boxY + 48);
    if (lines[1]) context.fillText(lines[1], boxX + 18, boxY + 66);
  }

  // Mission banner: a title card that fades.
  if (game.banner !== null && game.banner.timer > 0) {
    const alpha = Math.min(1, game.banner.timer / 0.8);
    context.save();
    context.globalAlpha = alpha;
    context.textAlign = 'center';
    context.font = `900 44px ${FONT}`;
    context.fillStyle = PALETTE.gold;
    context.fillText(game.banner.title.toUpperCase(), VIEW.width / 2, 168);
    if (game.banner.sub !== '') {
      context.font = `600 20px ${FONT}`;
      context.fillStyle = PALETTE.text;
      context.fillText(game.banner.sub, VIEW.width / 2, 200);
    }
    context.restore();
  }

  // A fading centre toast for small news (pickups, warnings).
  if (game.toast !== null && game.toast.timer > 0) {
    context.save();
    context.globalAlpha = Math.min(1, game.toast.timer / 0.5);
    context.font = `700 19px ${FONT}`;
    context.textAlign = 'center';
    context.fillStyle = PALETTE.text;
    context.fillText(game.toast.text, VIEW.width / 2, VIEW.height - 150);
    context.restore();
  }
}
