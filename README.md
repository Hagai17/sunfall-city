# Sunfall City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Hagai17/sunfall-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Hagai17/sunfall-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Sunfall City** is an original open-world crime game that runs in a desktop browser from static files — no build step, no network requests, no libraries. You are Jace Marlowe, a wheelman new in a sun-soaked coastal city of pastel blocks, palm-lined streets and one long beach. Steal cars, run jobs for fixer Delfina "Del" Reyes at the Coral Club, rob the Sunfall Bank, and try to stay ahead of the Sunfall PD.

Built by an AI agent for make.fun's "Make GTA 6" bounty ($1,666 USDC).

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. (`serve.ts` is a tiny static server for `game/`; any static file server pointed at `game/` works just as well.)

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Walk, drive, steer menus |
| Mouse | Aim |
| Left mouse button (hold) | Shoot |
| E / F | Get into / out of a car |
| Shift | Sprint on foot |
| Space | Handbrake |
| R | Reload |
| Esc / P | Pause |
| M | Mute |

## What's in the city

- **A living open world** — 8×6 blocks of named landmarks (Sunfall Bank, The Coral Club, Del's Garage, St. Solana Hospital, Sunfall PD, Hotel Marisol, Sunfall Supply, Pier 9 Warehouse), a marina parking lot, and a beach with a shoreline you cannot drive past.
- **Traffic and pedestrians** — civilian cars follow lanes, keep right, turn at intersections, brake for each other and for you; pedestrians stroll the sidewalks, dodge traffic and flee gunfire.
- **Cars to steal and drive** — seven civilian models plus the PD's Interceptor, each with its own speed, grip and toughness. Parked cars, moving traffic (the driver bails out screaming), even police cars are fair game.
- **A wanted system with teeth** — crimes add heat only when witnessed; stars follow the heat. Patrol cars spawn out of sight and hunt you, officers pile out to shoot or grab you, and standing still next to one fills the bust meter. Break line of sight and the heat drains.
- **A three-job story** — *First Wheels* (steal the teal Vireo GT), *Hot Cargo* (a dock pickup that lights up every badge in the city), and *The Sunfall Job* (rob the bank, lose the heat, get home). Clean deliveries pay a bonus; failed jobs can be retried. Afterwards, Del always has odd jobs at the garage.
- **Combat** — a pistol with magazines, reloads and ammunition pickups, on foot or from behind the wheel; cars smoke, burn and explode, and explosions hurt everyone nearby.
- **HUD and minimap** — health, cash, wanted stars, a live objective line with distance or timer, and a minimap with the objective, police and target-car blips.
- **Day and night** — a full clock: dusk warms the sky, windows light up, street lamps glow and headlights switch on.
- **Procedural sound** — engine note tied to speed, a two-tone siren that closes in, gunshots, crashes, pickups and mission jingles, all synthesized with Web Audio. No audio files.
- **Saving** — pause-menu saves (and automatic saves after each job) keep your money, story progress and place in the city in `localStorage`; the title screen offers Continue.

## How it is built

Plain ES modules under `game/src/`, one job each: `world.js` grows the seeded city and answers collision questions, `vehicles.js` drives traffic and the player's car, `actors.js` walks people and flies bullets, `police.js` runs heat, pursuit and the bust, `missions.js` holds Del's story, `audio.js` synthesizes every sound, `hud.js` and `render.js` paint the HUD and the world, and `main.js` wires it together at a fixed 60 steps a second. `shots.js` stages the four deterministic scenes in `shots.json`, which is how the screenshots in `screenshots/` were taken — real renders of the game itself, reproducible from their seeds.

Everything in Sunfall City is original: its city, characters, vehicles, names, story, art and sounds were made for this entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=8pf8m8ra&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
