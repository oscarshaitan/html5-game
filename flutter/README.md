# The Neon Defense — Flutter Edition

A Flutter/Flame port of [the original JS game](../js/), targeting web (CanvasKit), Android, and iOS from a single codebase.

**Status: Active development — core gameplay loop is functional.**

---

## What Works

### Game World
- White infinite-looking grid (60-cell margin beyond world bounds)
- Core crystal — green diamond at world center with glow
- Hardpoint system — core ring (green, 6 slots) and micro rings (yellow, 24 slots) with crosshair indicators
- Rift path rendering — wide glow background + dashed cyan center line + pulsing red spawn circle

### Towers
- All four tower types: **Basic** (square), **Rapid** (circle), **Sniper** (diamond), **Arc** (hexagon)
- Hardpoint snapping and scale/stat multipliers per ring
- Tower targeting via spatial grid
- Projectile system
- Tower upgrade and sell flow
- Arc tower network links and static charge accumulation
- Overclock ability buff (yellow pulsing)

### Enemies
- Eight enemy types: Basic, Fast, Tank, Boss, Splitter, Mini, Bulwark, Shifter
- Path following with interpolated movement
- HP bars, freeze status effect
- Spatial grid registration for O(1) tower targeting

### Wave System
- Prep phase (countdown timer + START WAVE button)
- Active wave (enemy spawning queue, 1/60 frames)
- Rift path generation via `compute()` (parallel isolate on mobile, sync on web)
- A* pathfinding with zone-0 commitment and core repulsion costs

### Abilities
- **EMP Burst** — freeze all enemies in radius, cooldown system
- **Overclock** — boost nearest tower's fire rate
- Targeting overlay rendered in world space (crosshair / pulse ring)
- Vertical energy bar with per-frame regeneration

### HUD
- Full-width stats bar (Wave · Lives · Enemies/Timer · Credits · Pause)
- Tower selector bar with shaped icons and green selection highlight
- Abilities bar (center-right) with cooldown fill and energy bar
- Tower info panel (bottom-left) with stacked Upgrade / Sell / Close buttons
- Recenter button (bottom-right circle)

### Infrastructure
- Camera pan (drag) and pinch zoom (0.1× – 1.0×), zoom-to-cursor
- Quality governor — EMA frame time → HIGH / BALANCED / LOW profiles
- Particle system, arc lightning, light source system (pooled)
- Save system wired (`SharedPreferences`, JSON snapshot)
- Audio manager wired (`flame_audio` wrapper, safe no-op without assets)
- Pause menu, Game Over screen, Start screen
- Orbitron font bundled locally (no CDN dependency)

---

## What's Missing / Pending

| Feature | Notes |
|---|---|
| Audio assets | `AudioManager` is wired but `assets/audio/` is empty — needs SFX/music files |
| Save/load UI | `SaveSystem` is wired but no save/load trigger in pause menu yet |
| Wave Intelligence panel | Not implemented (JS has threat preview with enemy distribution) |
| Tutorial / onboarding | Not implemented |
| Quality toast | Auto-downgrade notification not shown yet |
| Mutation events | Wave mutations defined in JS but not ported to Dart |
| Full enemy behaviors | Shifter invisibility, Splitter split-on-death not yet ported |
| GitHub Pages deploy | `flutter build web` works locally; CI deploy not set up |

---

## Run

```bash
flutter pub get
flutter run -d chrome --web-renderer canvaskit
```

Build for web:

```bash
flutter build web --base-href /the-neon-defense/flutter/ --web-renderer canvaskit
```

> **CanvasKit is required.** The HTML renderer does not produce game-quality Canvas output.

---

## Architecture

```
lib/
  main.dart                     — App entry, GameWidget, _HudLayer (Ticker-driven)
  game/
    neon_defense_game.dart      — FlameGame root, TapCallbacks, ScaleDetector
    config/
      constants.dart            — All game constants (mirrors JS 00_core.js)
    world/
      game_world.dart           — World component, rift path rendering, entity API
      tile_grid.dart            — Infinite-looking grid (white, 60-cell margin)
      hardpoint_manager.dart    — Core + micro ring hardpoints, crosshair render
    entities/
      towers/tower.dart         — Targeting, firing, upgrade, overclock
      enemies/enemy.dart        — Path following, HP bar, freeze effect
      projectiles/projectile.dart
      base/core_base.dart       — Green diamond, turret at level > 0
    systems/
      pathfinding/
        a_star.dart             — A* with zone-0 commitment + core repulsion
        rift_generator.dart     — compute()-based async rift generation
      wave_system.dart          — Prep countdown, spawn queue, wave progression
      spatial_grid.dart         — 200-unit cell buckets for O(1) enemy lookup
      ability_system.dart       — EMP + Overclock state machine
      quality_governor.dart     — EMA frame time → quality profile
      save_system.dart          — SharedPreferences JSON snapshot
    vfx/
      particle_system.dart      — Object pool, alpha-quantized batching
      arc_lightning.dart        — Jittered segment lightning
      light_source.dart         — Fade-out gradient blobs
    audio/
      audio_manager.dart        — flame_audio wrapper (no-op safe)
    camera/
      game_camera.dart          — ScaleDetector pan + pinch zoom
  ui/
    hud/
      stats_bar.dart            — Full-width, spaceBetween layout
      tower_bar.dart            — 60×80 buttons, shaped icons, green selection
      abilities_bar.dart        — Vertical column, energy bar
    panels/
      selection_panel.dart      — Bottom-left, pink border, stacked buttons
      pause_menu.dart
    screens/
      start_screen.dart
      game_over_screen.dart
```

---

## Dependencies

```yaml
flame: ^1.35.1          # Game engine
flame_audio: ^2.x       # SFX + music (assets pending)
shared_preferences: ^2.x # Save/load
google_fonts: ^8.x      # Kept as dep; Orbitron is now bundled in assets/fonts/
```
