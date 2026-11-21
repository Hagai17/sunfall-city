// Keyboard and mouse input for Sunfall City.
// Held keys drive movement and driving; one-shot presses are queued as ACTION_* flags and
// taken once by the loop, so a press between frames is never lost or counted twice.
// The mouse aims: its position is kept in canvas pixels and converted by the renderer,
// and holding the left button is the trigger.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_RELOAD = 8;
export const ACTION_MUTE = 16;
export const ACTION_SAVE = 32;

const CONFIRM = new Set(['Enter', 'NumpadEnter']);
const PAUSE = new Set(['Escape', 'KeyP']);
const INTERACT = new Set(['KeyE', 'KeyF']);
const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
]);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let clicked = false;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (CONFIRM.has(event.code) || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      clicked = true;
      actions |= ACTION_CONFIRM;
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function axis(negative, positive) {
    return (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
  }

  return {
    mouse,
    /** On-foot movement, each axis -1..1: WASD or the arrow keys. */
    moveX() {
      return axis('ArrowLeft', 'ArrowRight') || axis('KeyA', 'KeyD');
    },
    moveY() {
      return axis('ArrowUp', 'ArrowDown') || axis('KeyW', 'KeyS');
    },
    /** Driving: throttle -1..1 (reverse/brake..accelerate) and steering -1..1. */
    throttle() {
      return axis('KeyS', 'KeyW') || axis('ArrowDown', 'ArrowUp');
    },
    steer() {
      return axis('KeyA', 'KeyD') || axis('ArrowLeft', 'ArrowRight');
    },
    sprint() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    handbrake() {
      return held.has('Space');
    },
    firing() {
      return mouse.down;
    },
    /** True once per physical click, then false until the next one. */
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
