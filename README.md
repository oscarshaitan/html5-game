# The Neon Defense

A neon-styled tower defense game — defend the core crystal against escalating Rift waves, elite enemy mutations, and high-pressure late-game scenarios.

| Version | Platform | Status | Link |
|---|---|---|---|
| **JavaScript** | Web (HTML5 Canvas) | Live | [Play now](https://oscarshaitan.github.io/the-neon-defense/) |
| **Flutter** | Web · Android · iOS | In development | [Flutter build](https://oscarshaitan.github.io/the-neon-defense/flutter/) |

---

## Gameplay

### Combat Loop
- Four tower classes: **Basic**, **Rapid**, **Sniper**, **Arc**
- Hardpoint placement system — core ring (damage/range bonuses) and micro rings
- Tower upgrades, sell flow, and base crystal upgrades
- Arc tower network links with static charge accumulation

### Rift & Wave System
- Multi-path Rift spawning with A* pathfinding
- Rift tier progression and orbital zone biasing
- Mutation profiles that alter enemy stats and rewards mid-wave
- Wave Intelligence panel for threat visibility

### Enemies
- **Basic** · **Fast** · **Tank** · **Boss**
- **Splitter** — splits into minions on death
- **Bulwark** — high armor, slow
- **Shifter** — intermittently invisible

### Commander Abilities
- **EMP Burst** — freezes all enemies in a radius (energy cost: 40)
- **Overclock** — doubles fire rate on a single tower (energy cost: 25)
- Energy economy tied to kills and regeneration

---

## Controls

### Desktop (both versions)
| Input | Action |
|---|---|
| Left click / Tap | Select · place · interact |
| Drag | Pan camera |
| Scroll / Pinch | Zoom (0.1× – 1.0×) |
| `Q` `W` `E` `R` | Select tower type |
| `1` `2` | Ability targeting |
| `U` | Upgrade selected tower |
| `Del` / `Bksp` | Sell selected tower |
| `Esc` / `P` | Pause |

### Mobile / Touch
- Tower bar and ability slots are always visible as tap targets
- Pinch to zoom, drag to pan
- Recenter button (bottom-right) snaps camera back to core

---

## Run Locally

### JavaScript version

```bash
# Serve from the js/ folder, or the repo root:
python -m http.server 8000
# then open http://localhost:8000/js/
```

Or open `js/index.html` directly in a browser.

### Flutter version

```bash
cd flutter
flutter pub get
flutter run -d chrome --web-renderer canvaskit
```

Build for web:

```bash
flutter build web --base-href /the-neon-defense/flutter/ --web-renderer canvaskit
```

---

## Project Structure

```
the-neon-defense/
  index.html                  — Landing page (links to both versions)
  js/                         — JavaScript edition
    index.html
    scripts/
      00_core.js              — Constants, tower/arc/quality/pathing config
      01_init.js              — Canvas setup, input, camera, hardpoints
      02_game_control.js      — Placement, selection, build UI
      03_abilities.js         — EMP/Overclock, save/load, path worker
      04_tutorial.js          — Tutorial flow, path generation
      05_loop.js              — Main game loop, wave/enemy logic
      06_render.js            — All rendering (enemies, towers, VFX, UI)
      workers/
        path_worker.js        — Web Worker: async rift path generation
    styles/
      00_base_ui.css
      01_abilities_debug.css
      02_tutorial_and_responsive.css
    manual.html
    technical_docs.html
  flutter/                    — Flutter/Flame edition
    lib/
      main.dart               — App entry, GameWidget, HUD overlay layer
      game/
        neon_defense_game.dart
        config/
          constants.dart      — All game constants (mirrors JS 00_core.js)
        world/
          game_world.dart     — World component, entity managers
          tile_grid.dart      — Grid rendering (infinite, white lines)
          hardpoint_manager.dart
        entities/
          towers/tower.dart
          enemies/enemy.dart
          projectiles/projectile.dart
          base/core_base.dart
        systems/
          pathfinding/
            a_star.dart
            rift_generator.dart
          wave_system.dart
          spatial_grid.dart
          ability_system.dart
          quality_governor.dart
        vfx/
          particle_system.dart
          arc_lightning.dart
          light_source.dart
        camera/game_camera.dart
      ui/
        hud/
          stats_bar.dart      — Full-width stats (wave, lives, credits, enemies)
          tower_bar.dart      — Tower selector with shaped icons
          abilities_bar.dart  — EMP / Overclock slots + vertical energy bar
        panels/
          selection_panel.dart
          pause_menu.dart
        screens/
          start_screen.dart
          game_over_screen.dart
    assets/
      fonts/Orbitron.ttf      — Bundled locally (no CDN dependency)
      audio/
      images/
    pubspec.yaml
```

---

## Technology

### JavaScript Edition
- HTML5 Canvas API
- Vanilla JavaScript (ES6+)
- CSS3
- Web Audio API (procedural soundtrack)
- Web Workers (async rift path generation, off main thread)
- Local Storage (save/load)

### Flutter Edition
- Flutter 3.x + Dart
- [Flame](https://flame-engine.org/) game engine (v1.x)
- CanvasKit web renderer (Skia/WASM, required for game-quality rendering)
- `compute()` for rift path generation (parallel isolate on mobile, sync on web)
- SharedPreferences (save/load)
- Orbitron font bundled locally

---

## Documentation

- Player manual: `js/manual.html`
- Technical reference: `js/technical_docs.html`
- Feature roadmap: `ROADMAP.md`
- Balance analysis: `GAME_BALANCE_ANALYSIS.md`
