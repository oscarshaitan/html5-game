# Neon Defense

Neon Defense is a fast, neon-styled HTML5 tower defense game built with Canvas and vanilla JavaScript.
You defend the core against escalating waves, expanding Rift networks, elite path mutations, and high-pressure late game scenarios.

## Current Status

- Single-player endless defense
- Desktop and mobile touch support
- Camera pan and zoom
- Save/load with local storage
- Interactive onboarding tutorial
- Inline gameplay hints

## Core Features

### Combat Loop
- Three tower classes: Basic, Rapid, Sniper
- Tower upgrades and sell flow
- Base upgrades and life repair
- Enemy variety including Boss, Splitter, Bulwark, and Shifter behaviors

### Rift and Wave Systems
- Multi-path Rift spawning
- Rift tier progression after high waves
- Mutation profiles that temporarily alter enemy stats/rewards
- Wave Intelligence panel for threat visibility

### Commander Tools
- Active abilities: EMP and Overclock
- Energy economy tied to kills
- Pause menu controls for save/audio/debug

### Presentation
- Neon UI with animated effects
- Dynamic VFX (particles, flashes, pulses)
- Procedural Web Audio soundtrack

## Controls

### Desktop
- Left click: select/interact/place
- Drag: pan camera
- Mouse wheel: zoom
- `Q` / `W` / `E`: select tower type
- `1` / `2`: ability targeting
- `U`: upgrade selected tower
- `Delete` / `Backspace`: sell selected tower
- `Esc`: deselect or pause

### Touch
- Tap: select/interact
- Drag: pan camera
- Pinch: zoom

## Run Locally

1. Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
```

2. Open `http://localhost:8000`.

## Project Structure

```text
html5-game/
  index.html
  game.js
  style.css
  manual.html
  technical_docs.html
  ROADMAP.md
  GAME_BALANCE_ANALYSIS.md
```

## Documentation

- Player Manual: `manual.html`
- Technical Docs: `technical_docs.html`
- Product and feature planning: `ROADMAP.md`
- Design and balance critique: `GAME_BALANCE_ANALYSIS.md`

## Technology

- HTML5 Canvas
- Vanilla JavaScript (ES6+)
- CSS3
- Web Audio API
- Local Storage

## Notes

- This project is framework-free by design.
- Most gameplay logic is centralized in `game.js`.
- Visual identity and layout behavior are defined in `style.css`.
