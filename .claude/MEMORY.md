# The Neon Defense — Session Memory

## Project
HTML5 tower defense game. Vanilla JS, Canvas, Web Audio. No framework.
Game name: **The Neon Defense**
Folder was originally named `html5-game`; may be renamed to `the-neon-defense`.

## Key Files
- `scripts/00_core.js` — constants, TOWERS, ARC_TOWER_RULES, QUALITY_GOVERNOR, PERFORMANCE_RULES
- `scripts/01_init.js` — canvas/world setup
- `scripts/02_game_control.js` — input, camera, placement
- `scripts/03_abilities.js` — EMP, Overclock, worker management, saveGame
- `scripts/04_tutorial.js` — tutorial flow, upgrade/sell logic
- `scripts/05_loop.js` — main game loop, spatial grid, tower firing, wave logic
- `scripts/06_render.js` — all rendering: enemies, towers, particles, arc links, UI
- `scripts/workers/path_worker.js` — Web Worker: async rift/path generation (off main thread)
- `styles/00_base_ui.css` — main UI styles including `.auto-drop-btn`
- `index.html` — entry point, `#details-stepper` holds quality buttons

## Architecture Notes
- `GRID_SIZE = 40` px per cell; `WORLD_MIN_COLS=140`, `WORLD_MIN_ROWS=90`
- `ENEMY_SPATIAL_GRID` cellSize=200. Grid is ~29×19 cells at min world size.
- Tower ranges: basic=100, rapid=80, sniper=250, arc=100 (world units)
- `MAX_TOWER_RANGE = 800` — hard cap applied at upgrade time (see bugs section)
- Arc tower: 100 static charges → 0.5s stun; chain bounces fixed at 3; network bonus capped at 5
- Camera zoom: 0.1× min → 1.0× max (clamped in wheel + pinch handlers in 01_init.js)
- `resetCamera()` in 06_render.js snaps zoom to 1.0

## Arc Link Rendering (06_render.js)
- `_linkBuckets[5]` pre-allocated; single O(N) bucketing pass per frame
- `_LINK_STYLES` const (module-level, never per-frame): 4 entries for levels 1–4
  - `lineCap='round'` + short dash `[1,16]` → renders as dots; longer dashes emerge at higher levels
  - Level 5: double-stroke same path (no second beginPath): wide soft halo + narrow bright core
  - No shadowBlur, no quality-mode gate — same visual at all quality levels

## Quality Governor
- 3 presets: HIGH(0) / MED(1) / LOW(2) stored as `QUALITY_GOVERNOR.profileIndex`
- `PERFORMANCE_RULES.autoDropEnabled` (localStorage) gates all auto-downgrade/upgrade logic
- `toggleAutoDrop()` exposed on window; button `#auto-drop-btn` in `#details-stepper`
- `ARC_TOWER_RULES.lowAnimationMode` true when qualityFloor>0; affects chain-burst stride only

## Bugs Fixed
- **Spatial grid loop explosion** (05_loop.js): `range *= 1.1` per upgrade with no cap → at level
  143, range ≈ 188M world units → `cr = ceil(188M/200) = 940K` → ~3.5T loop iterations/frame.
  Fix: `const cr = Math.min(Math.ceil(radius / cs), Math.max(cols, rows))` in both
  `queryEnemiesInRadius` and `queryTauntersInRadius`. Also added `MAX_TOWER_RANGE=800` cap
  at upgrade time in `04_tutorial.js`.

## Phase D — Async Rift Generation (C4-17) & Deferred Save (C4-18)
- `scripts/workers/path_worker.js` — self-contained Web Worker; receives `generate_batch` message, posts `path_ready` per path + `batch_done` when finished
- Worker contains full copies of: `tryGenerateAtLevel`, `findPathOnGrid`, and all 8 helper functions from `01_init.js`
- Main-thread management in `03_abilities.js`: `_pathWorker`, `_pathWorkerBusy`, `_requestRiftGeneration`, `_applyGeneratedRift`, `_onPathWorkerMessage`
- `startPrepPhase()` now calls `_requestRiftGeneration` instead of sync loop
- `resetGame` in `05_loop.js`: removed sync while loop; `startPrepPhase` handles generation via worker
- `saveGame()`: snapshot data sync, defer `JSON.stringify + localStorage.setItem` via `requestIdleCallback({ timeout: 5000 })`
- C5-19 (OffscreenCanvas) and C5-20 (ECS) deferred — documented in Improvements.md with rationale

## LocalStorage Keys
- `neonDefenseSave` — main save slot (intentionally NOT renamed to avoid breaking saves)
- `neonDefenseAutoDropEnabled` — quality governor preference

## User Preferences
- Concise responses, no emojis
- Prefers fixes with clear diagnosis before code changes
- Docs (README, manual.html, technical_docs.html) should be updated after significant changes
