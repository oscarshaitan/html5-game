# 🎮 Neon Defense

A premium HTML5 tower defense game with stunning neon aesthetics, dynamic combat mechanics, and progressive difficulty scaling.

![Neon Defense](https://img.shields.io/badge/HTML5-Game-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-Neon-1572B6?style=for-the-badge&logo=css3&logoColor=white)

## 🌟 Features

### Core Gameplay
- **Strategic Tower Defense**: Deploy Basic, Rapid, and Sniper towers to defend your Command Center
- **Dynamic Enemy Types**: Face 8 unique enemy types including Splitters, Bulwarks, and Phase Shifters
- **Progressive Difficulty**: Waves scale in complexity with Elite Rifts and mutated enemy spawns
- **Tower Upgrades**: Upgrade towers up to Level 10 with increasing power and visual effects

### Advanced Mechanics
- **Rift System**: Multiple spawn points with tier progression and temporal mutations
- **Tactical Support**: Deploy EMP blasts, Overclock towers, or call in Airstrikes
- **Wave Intelligence**: Real-time analytics showing enemy composition and mutation chances
- **Meta-Progression**: Persistent kill tracking and Command Center upgrades

### Visual & Audio
- **Neon Aesthetic**: Vibrant colors, dynamic lighting, and smooth animations
- **Procedural Music**: 15 unique BGM tracks that rotate based on wave progression
- **Screen Effects**: Muzzle flashes, explosions, and strategic screen shake
- **Responsive UI**: Clean HUD with real-time stats and ability cooldowns

### Social Features
- **Player Profiles**: Custom commander names with persistent statistics
- **Enhanced Sharing**: Generate beautiful status reports with combat analytics
- **Kill Tracking**: Lifetime statistics for all enemy types eliminated

## 🚀 Play Now

**Live Demo**: [Play Neon Defense](https://YOUR-USERNAME.github.io/html5-game/)

## 🎯 Quick Start

### Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/html5-game.git
   cd html5-game
   ```

2. Open `index.html` in your browser or use a local server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js
   npx http-server
   ```

3. Navigate to `http://localhost:8000`

## 📖 Documentation

- **[Player Manual](manual.html)**: Complete gameplay guide with strategies and mechanics
- **[Technical Docs](technical_docs.html)**: API documentation and system architecture

## 🎮 Controls

- **Mouse**: Select towers, click to place, drag to pan camera
- **Scroll Wheel**: Zoom in/out
- **ESC**: Pause menu
- **Click Wave Info**: View detailed enemy composition and mutation data

## 🏗️ Project Structure

```
html5-game/
├── index.html          # Main game page
├── game.js             # Core game logic (3000+ lines)
├── style.css           # Neon-themed styling
├── manual.html         # Player documentation
├── technical_docs.html # Developer documentation
└── README.md          # This file
```

## 🔧 Technical Stack

- **Pure HTML5 Canvas**: No external game frameworks
- **Vanilla JavaScript**: ES6+ features, modular design
- **CSS3**: Custom animations and neon effects
- **Web Audio API**: Procedural music generation
- **LocalStorage**: Game state persistence

## 🎨 Key Systems

### Tower System
- 3 tower types with unique upgrade paths
- Visual level indicators (pips)
- Targeting algorithms (nearest, strongest, weakest)

### Enemy System
- 8 enemy types with distinct behaviors
- Mutation system for enhanced difficulty
- Splitter mechanics and phase shifting

### Rift System
- Multi-spawn point management
- Tier progression (Elite Rifts)
- Temporal mutations that reset each wave

### Ability System
- EMP: Stun all enemies
- Overclock: Boost tower fire rate
- Airstrike: Targeted area damage

## 📊 Game Statistics

- **Lines of Code**: ~3,000+ (game.js)
- **Enemy Types**: 8 unique variants
- **Tower Types**: 3 with 10 upgrade levels each
- **Music Tracks**: 15 procedurally generated
- **Max Wave**: Infinite scaling

## 🚀 Deployment to GitHub Pages

### Option 1: GitHub Web Interface
1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Source", select **main** branch
4. Click **Save**
5. Your game will be live at `https://YOUR-USERNAME.github.io/REPO-NAME/`

### Option 2: Command Line
```bash
# Ensure all files are committed
git add .
git commit -m "Prepare for GitHub Pages deployment"
git push origin main

# Enable GitHub Pages via GitHub CLI (if installed)
gh repo edit --enable-pages --pages-branch main
```

## 🎯 Future Enhancements

- [ ] Meta-Progression Research Tree
- [ ] Additional tower types
- [ ] Boss battle mechanics
- [ ] Multiplayer leaderboards
- [ ] Mobile touch controls

## 📝 License

This project is open source and available for educational purposes.

## 🙏 Credits

**Game Design & Development**: Built with passion for tower defense mechanics and neon aesthetics

**Music**: Procedurally generated using Web Audio API

---

**Enjoy defending the neon frontier!** 🎮✨
