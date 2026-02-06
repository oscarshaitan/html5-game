# 🗺️ Neon Defense - Development Roadmap

This document outlines planned features and improvements for future development.

## 📱 Phase 1: Mobile Support

### Priority: High
**Goal**: Make the game fully playable on mobile devices with touch controls

#### Features
- [ ] **Touch Controls**
  - Tap to select towers
  - Tap to place towers
  - Pinch to zoom
  - Two-finger drag to pan camera
  - Long-press for tower info/upgrade menu

- [ ] **Responsive UI**
  - Redesign HUD for smaller screens
  - Larger touch targets for buttons
  - Collapsible panels to save screen space
  - Portrait and landscape mode support

- [ ] **Performance Optimization**
  - Reduce particle effects on mobile
  - Optimize canvas rendering for mobile GPUs
  - Implement quality settings (Low/Medium/High)
  - Battery-saving mode

- [ ] **Mobile-Specific Features**
  - Haptic feedback for tower placement and enemy kills
  - Simplified ability activation (larger buttons)
  - Auto-pause when app goes to background

#### Technical Considerations
- Detect mobile devices and adjust UI accordingly
- Test on various screen sizes (phones, tablets)
- Ensure localStorage works across mobile browsers
- Handle orientation changes gracefully

---

## 👤 Phase 2: Player Name Persistence Fix

### Priority: High
**Goal**: Improve player name handling to never re-ask once saved

#### Current Issue
- Game re-prompts for player name at the end of each session
- Name should persist permanently once entered

#### Solution
- [ ] **Fix Name Persistence Logic**
  - Only show name modal if `localStorage.getItem('playerName')` is null/undefined
  - Remove any code that clears playerName on game over
  - Add "Change Name" option in settings menu instead

- [ ] **Settings Menu Enhancement**
  - Add "Player Profile" section
  - Allow manual name change
  - Show lifetime statistics (total kills, highest wave, etc.)
  - Add "Reset Profile" option with confirmation

- [ ] **Testing**
  - Verify name persists across browser sessions
  - Test with browser cache clearing
  - Ensure name appears correctly in share function

---

## 🎮 Phase 3: Additional Game Mechanics

### Priority: Medium
**Goal**: Expand gameplay depth with new mechanics and content

#### New Tower Types
- [ ] **Laser Tower**
  - Continuous beam damage
  - Pierces through multiple enemies
  - Expensive but powerful

- [ ] **Freeze Tower**
  - Slows enemies in radius
  - No direct damage
  - Synergizes with other towers

- [ ] **Artillery Tower**
  - Long range, area damage
  - Slow fire rate
  - Splash damage

#### New Enemy Types
- [ ] **Healer Enemy**
  - Restores HP to nearby enemies
  - Priority target
  - Low HP but fast

- [ ] **Shield Enemy**
  - Temporary invulnerability
  - Requires sustained damage
  - Protects nearby enemies

- [ ] **Teleporter Enemy**
  - Randomly jumps forward on path
  - Unpredictable movement
  - Medium HP

#### Advanced Mechanics
- [ ] **Weather System**
  - Random weather events affect gameplay
  - Rain: Slows all enemies
  - Storm: Reduces tower range
  - Clear: Bonus credits

- [ ] **Tower Synergies**
  - Towers gain bonuses when placed near specific types
  - Visual indicators for synergy zones
  - Encourages strategic placement

- [ ] **Commander Abilities**
  - Unlock passive bonuses
  - Choose specialization (Offense/Defense/Economy)
  - Skill tree progression

- [ ] **Challenge Modes**
  - Endless mode (current)
  - Time attack (survive X waves in Y minutes)
  - Limited resources (fixed starting credits)
  - Boss rush (only boss enemies)

#### Quality of Life
- [ ] **Tower Templates**
  - Save tower configurations
  - Quick deploy saved layouts
  - Share templates with friends

- [ ] **Replay System**
  - Record and replay games
  - Share epic moments
  - Learn from mistakes

---

## ⚔️ Phase 4: Multiplayer - 1v1 PvP Mode

### Priority: Low (Complex Implementation)
**Goal**: Create an asymmetric PvP mode where one player defends and another attacks

#### Game Mode: "Rift Commander vs Defense Commander"

##### Core Concept
- **Defense Commander** (Player 1): Places towers to defend base
- **Rift Commander** (Player 2): Plans enemy waves and spawn patterns
- Turn-based or simultaneous gameplay
- Best of 3 rounds, players swap roles

##### Defense Commander Mechanics
- Limited budget per round
- Place towers before wave starts
- Can use abilities during wave
- Goal: Survive all waves with maximum lives remaining

##### Rift Commander Mechanics
- Limited "threat budget" to spend on enemies
- Choose enemy types and spawn timing
- Select spawn points (Rifts)
- Apply mutations to enemies
- Goal: Destroy all lives before waves end

##### Implementation Approach

**Option 1: Real-time Multiplayer (Complex)**
- Requires backend server (Node.js + WebSocket)
- Real-time synchronization
- Matchmaking system
- Hosting: Heroku, Railway, or Vercel

**Option 2: Asynchronous Multiplayer (Simpler)**
- No real-time connection needed
- Player 1 creates a challenge (tower setup)
- Challenge saved to database (Firebase/Supabase)
- Player 2 loads challenge and plans attack
- Results compared automatically
- Share challenges via link

**Option 3: Local Multiplayer (Simplest)**
- Hot-seat mode (same device)
- Player 1 sets up defense (screen hidden)
- Player 2 plans attack (screen hidden)
- Game runs automatically
- Great for testing mechanics before online

##### Technical Requirements
- [ ] **Backend Infrastructure**
  - Database for storing challenges/matches
  - User authentication (optional)
  - API for challenge CRUD operations
  - Leaderboard system

- [ ] **Game Logic Changes**
  - Separate "setup phase" from "execution phase"
  - AI to execute Rift Commander's plan
  - Scoring system (lives remaining, credits spent, etc.)
  - Replay generation

- [ ] **UI/UX**
  - Lobby system
  - Challenge browser
  - Match history
  - Player profiles and stats

##### Recommended Tech Stack
```
Frontend: Current HTML5/JS/CSS
Backend: Firebase (easiest) or Node.js + Express
Database: Firestore or PostgreSQL
Auth: Firebase Auth or Auth0
Hosting: GitHub Pages (frontend) + Firebase Functions (backend)
```

##### Development Phases
1. **Prototype**: Local hot-seat mode
2. **Alpha**: Asynchronous multiplayer with Firebase
3. **Beta**: Add matchmaking and leaderboards
4. **Release**: Real-time multiplayer (if demand exists)

---

## 🎯 Priority Order

1. **Phase 2** - Player Name Fix (Quick win, improves UX)
2. **Phase 1** - Mobile Support (Expands audience significantly)
3. **Phase 3** - New Mechanics (Keeps existing players engaged)
4. **Phase 4** - Multiplayer (Long-term goal, high complexity)

---

## 📊 Success Metrics

- **Mobile Support**: 50%+ of players on mobile devices
- **Name Persistence**: Zero complaints about re-entering name
- **New Mechanics**: Average session time increases by 30%
- **Multiplayer**: 1000+ challenges created in first month

---

## 🔄 Iteration Strategy

1. Implement one phase at a time
2. Gather player feedback after each phase
3. Iterate based on data and feedback
4. Don't move to next phase until current is stable

---

## 💡 Additional Ideas (Backlog)

- **Achievements System**: Unlock badges for milestones
- **Daily Challenges**: Special wave configurations with rewards
- **Cosmetic Skins**: Different visual themes for towers/enemies
- **Sound Effects**: Add impact sounds for hits, explosions
- **Particle Effects**: More visual polish for abilities
- **Tutorial Mode**: Interactive guide for new players
- **Difficulty Levels**: Easy/Normal/Hard/Nightmare
- **Custom Maps**: Different base layouts and path configurations

---

**Last Updated**: 2026-02-06

**Status**: Planning Phase - Ready for Implementation
