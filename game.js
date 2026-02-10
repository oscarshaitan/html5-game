/**
 * Neon Defense - Game Logic
 */

// --- Constants & Config ---
const GRID_SIZE = 40;
const CANVAS_BG = '#050510';

const TOWERS = {
    basic: { cost: 50, range: 100, damage: 10, cooldown: 30, color: '#00f3ff', type: 'basic' },
    rapid: { cost: 120, range: 80, damage: 4, cooldown: 10, color: '#fcee0a', type: 'rapid' },
    sniper: { cost: 200, range: 250, damage: 50, cooldown: 90, color: '#ff00ac', type: 'sniper' }
};

window.addDebugMoney = function () {
    money += 1000000;
    updateUI();
    saveGame();
}

window.unlockDebug = async function () {
    const input = document.getElementById('debug-pass').value;
    const msgUint8 = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Salted/Persistent protection check
    if (hashHex === '73ceb15f18bb0a313c8880abe54bf61a529dd8f1e75b084dd39926a1518d3d2f') {
        document.getElementById('debug-security').classList.add('hidden');
        document.getElementById('command-center').classList.remove('hidden');
    } else {
        // Feedback on failure
        const btn = document.querySelector('#debug-security button');
        const oldText = btn.innerText;
        btn.innerText = "ACCESS DENIED";
        btn.style.borderColor = "#ff0000";
        setTimeout(() => {
            btn.innerText = oldText;
            btn.style.borderColor = "";
        }, 1000);
    }
}

const ENEMIES = {
    basic: { hp: 30, speed: 1.5, color: '#ff0000', reward: 10, width: 20 },
    fast: { hp: 20, speed: 2.5, color: '#ffff00', reward: 15, width: 16 },
    tank: { hp: 100, speed: 0.8, color: '#ff00ff', reward: 30, width: 24 },
    boss: { hp: 500, speed: 0.5, color: '#ff8800', reward: 200, width: 40 },
    splitter: { hp: 80, speed: 1.2, color: '#00ff41', reward: 40, width: 28, type: 'splitter' },
    mini: { hp: 20, speed: 2.0, color: '#00ff41', reward: 5, width: 12, type: 'mini' },
    bulwark: { hp: 350, speed: 0.6, color: '#fcee0a', reward: 60, width: 32, type: 'bulwark' },
    shifter: { hp: 60, speed: 1.5, color: '#ff00ac', reward: 60, width: 20, type: 'shifter' }
};

// --- Game State ---
let canvas, ctx;
let width, height;
let lastTime = 0;
let gameState = 'start'; // start, playing, gameover
let wave = 1;
let money = 115;
let lives = 20;

let selectedTowerType = null; // null means we might be selecting an existing tower
let selectedPlacedTower = null; // Reference to a placed tower object
let selectedRift = null; // Reference to a placed tower object
let buildTarget = null; // {x, y} for empty tile selection

let towers = [];
let enemies = [];
let projectiles = [];
let particles = [];
let paths = []; // Array of arrays of points

let spawnQueue = []; // New: Array of enemy types to spawn
let spawnTimer = 0;
let waveTimer = 0;
let currentEnemyType = 'basic'; // kept for potential legacy checks but main logic uses queue

// --- Camera State ---
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// --- New State for Hover ---
let mouseX = 0;
let mouseY = 0;
let isHovering = false;

// --- VFX State ---
let shakeAmount = 0;
let lightSources = []; // {x, y, radius, color, life}

function startShake(amt) {
    shakeAmount = Math.max(shakeAmount, amt);
}

// --- Wave State ---
let isWaveActive = false;
let totalKills = { basic: 0, fast: 0, tank: 0, boss: 0, splitter: 0, mini: 0, bulwark: 0, shifter: 0 };

// --- Player Profile & Stats ---
let playerName = null;
let prepTimer = 30; // seconds
let frameCount = 0;
let energy = 0;
const maxEnergy = 100;
let targetingAbility = null; // 'emp' or null
let abilities = {
    emp: { cost: 40, radius: 120, duration: 5 * 60, cooldown: 0, maxCooldown: 15 }, // duration in frames
    overclock: { cost: 25, duration: 10 * 60, cooldown: 0, maxCooldown: 10 } // duration in frames
};


let isPaused = false;

// --- Base State ---
let baseLevel = 0; // 0 = No turret, 1+ = Turret active
let baseCooldown = 0;
let baseRange = 150;
let baseDamage = 20;
let selectedBase = false; // Selection state

// --- Audio Engine ---
const AudioEngine = {
    ctx: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    isMuted: false,
    musicVol: 0.5,
    sfxVol: 0.7,
    currentMusic: null,
    musicType: 'none',
    musicStep: 0,

    // Frequencies
    notes: {
        C2: 65.41, G2: 98.00, A2: 110.00, F2: 87.31,
        C3: 130.81, Eb3: 155.56, Gb3: 185.00, G3: 196.00, Bb3: 233.08,
        C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
        C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, Gb5: 739.99, G5: 783.99
    },

    melodies: {
        normal: [
            { // 01: Original High-Tech
                lead: ['C4', 'E4', 'G4', 0, 'F4', 'A4', 'C5', 0, 'G4', 'B4', 'D5', 0, 'C5', 'G4', 'E4', 'D4'],
                bass: ['C2', 0, 'G2', 'C2', 'F2', 0, 'C3', 'F2', 'G2', 0, 'D3', 'G2', 'C2', 'G2', 'E2', 'D2']
            },
            { // 02: Aeolian Chill
                lead: ['A4', 'C5', 'E5', 0, 'F4', 'A4', 'C5', 0, 'C4', 'E4', 'G4', 0, 'G4', 'B4', 'D5', 0],
                bass: ['A2', 0, 'E2', 'A2', 'F2', 0, 'C3', 'F2', 'C2', 0, 'G2', 'C2', 'G2', 0, 'D3', 'G2']
            },
            { // 03: Dorian Tech
                lead: ['D4', 'F4', 'A4', 'C5', 'G4', 'Bb4', 'D5', 0, 'F4', 'A4', 'C5', 0, 'C4', 'E4', 'G4', 0],
                bass: ['D2', 0, 'A2', 'D2', 'G2', 0, 'D3', 'G2', 'F2', 0, 'C3', 'F2', 'C2', 0, 'G2', 'C2']
            },
            { // 04: Phrygian Edge
                lead: ['E4', 'F4', 'G4', 0, 'F4', 'G4', 'A4', 0, 'G4', 'Ab4', 'C5', 0, 'Eb5', 'D5', 'C5', 'Bb4'],
                bass: ['E2', 0, 'B2', 'E2', 'F2', 0, 'C3', 'F2', 'G2', 0, 'D3', 'G2', 'Ab2', 0, 'Eb3', 'Ab2']
            },
            { // 05: Pentatonic Pulse
                lead: ['C4', 'D4', 'E4', 'G4', 'A4', 'G4', 'E4', 'D4', 'C5', 'A4', 'G4', 'E4', 'D4', 'C4', 'D4', 'E4'],
                bass: ['C2', 'C2', 'G2', 'G2', 'A2', 'A2', 'F2', 'F2', 'C2', 'C2', 'G2', 'G2', 'A2', 'A2', 'F2', 'F2']
            },
            { // 06: Lydian Dream
                lead: ['C4', 'E4', 'G4', 'B4', 'D5', 'B4', 'G4', 'E4', 'F4', 'A4', 'C5', 'E5', 'D5', 'C5', 'A4', 'F4'],
                bass: ['C2', 0, 'G2', 'C2', 'D2', 0, 'A2', 'D2', 'F2', 0, 'C3', 'F2', 'G2', 0, 'D3', 'G2']
            },
            { // 07: Mixolydian Groove
                lead: ['G4', 'B4', 'D5', 'F5', 'E5', 'C5', 'B4', 'G4', 'A4', 'C5', 'E5', 'G4', 'F4', 'D4', 'B3', 'G3'],
                bass: ['G2', 0, 'D3', 'G2', 'F2', 0, 'C3', 'F2', 'C2', 0, 'G2', 'C2', 'Bb2', 0, 'F2', 'Bb2']
            },
            { // 08: Chromatic Tension
                lead: ['C4', 'Db4', 'D4', 'Eb4', 'E4', 'Eb4', 'D4', 'Db4', 'C4', 'G3', 'C4', 'Db4', 'D4', 'A3', 'D4', 'Eb4'],
                bass: ['C2', 'Db2', 'D2', 'Eb2', 'E2', 'Eb2', 'D2', 'Db2', 'C2', 'G1', 'C2', 'Db2', 'D2', 'A1', 'D2', 'Eb2']
            },
            { // 09: Arp Madness
                lead: ['C4', 'G4', 'C5', 'G4', 'E4', 'B4', 'E5', 'B4', 'F4', 'C5', 'F5', 'C5', 'G4', 'D5', 'G5', 'D5'],
                bass: ['C2', 0, 0, 0, 'E2', 0, 0, 0, 'F2', 0, 0, 0, 'G2', 0, 0, 0]
            },
            { // 10: Syncopated Flow
                lead: [0, 'C4', 0, 'E4', 'G4', 0, 'F4', 0, 0, 'A4', 0, 'C5', 'G4', 0, 'D5', 0],
                bass: ['C2', 0, 'G2', 0, 'C2', 0, 'F2', 0, 'F2', 0, 'C3', 0, 'G2', 0, 'D3', 0]
            },
            { // 11: Minor Gravity
                lead: ['G4', 'Bb4', 'D5', 'Eb5', 'D5', 'Bb4', 'G4', 'F4', 'G4', 'D4', 'G4', 'Bb4', 'C5', 'Bb4', 'A4', 'F4'],
                bass: ['G2', 0, 'D3', 'G2', 'Eb2', 0, 'Bb2', 'Eb2', 'C2', 0, 'G2', 'C2', 'F2', 0, 'C3', 'F2']
            },
            { // 12: Cyber Funk
                lead: ['C4', 0, 'C4', 'Eb4', 0, 'F4', 'Gb4', 'G4', 0, 'Bb4', 0, 'C5', 0, 'G4', 'Eb4', 'C4'],
                bass: ['C2', 'C2', 0, 'Eb2', 'Eb2', 0, 'F2', 'G2', 'C2', 'C2', 0, 'Bb1', 'Bb1', 0, 'G1', 'F1']
            },
            { // 13: Neon Echo
                lead: ['C5', 0, 'G4', 0, 'E4', 0, 'C4', 0, 'D5', 0, 'A4', 0, 'F4', 0, 'D4', 0],
                bass: ['C2', 'G2', 'C3', 'G2', 'A2', 'E3', 'A3', 'E3', 'F2', 'C3', 'F3', 'C3', 'G2', 'D3', 'G3', 'D3']
            },
            { // 14: Dark Wave
                lead: ['A3', 'C4', 'E4', 'A4', 'G4', 'E4', 'C4', 'B3', 'F3', 'A3', 'C4', 'F4', 'E4', 'C4', 'A3', 'G3'],
                bass: ['A1', 'A1', 'E2', 'E2', 'G1', 'G1', 'D2', 'D2', 'F1', 'F1', 'C2', 'C2', 'E1', 'E1', 'B1', 'B1']
            },
            { // 15: Final Stand
                lead: ['E4', 'E4', 'G4', 'A4', 'B4', 'B4', 'D5', 'E5', 'D5', 'D5', 'B4', 'A4', 'G4', 'G4', 'E4', 'D4'],
                bass: ['E2', 'E2', 'G2', 'G2', 'A2', 'A2', 'B2', 'B2', 'D3', 'D3', 'B2', 'B2', 'A2', 'A2', 'G2', 'F2']
            }
        ],
        threat: {
            lead: ['C5', 'Eb5', 'G5', 'Eb5', 'Gb5', 'Eb5', 'C5', 'Bb4', 'C5', 'Eb5', 'Gb5', 'Eb5', 'F5', 'Eb5', 'D5', 'Bb4'],
            bass: ['C2', 0, 'C2', 0, 'Eb2', 0, 'Eb2', 0, 'Gb2', 0, 'Gb2', 0, 'G2', 0, 'G2', 0]
        }
    },

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.musicVol, this.ctx.currentTime);
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);
    },

    setVolume(type, val) {
        this.init();
        const v = parseFloat(val);
        if (type === 'music') {
            this.musicVol = v;
            if (this.musicGain) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
        } else if (type === 'sfx') {
            this.sfxVol = v;
            if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
        }
        localStorage.setItem('neonAudioSettings', JSON.stringify({
            music: this.musicVol,
            sfx: this.sfxVol,
            muted: this.isMuted
        }));
    },

    loadSettings() {
        const saved = localStorage.getItem('neonAudioSettings');
        if (saved) {
            const data = JSON.parse(saved);
            this.musicVol = data.music ?? 0.5;
            this.sfxVol = data.sfx ?? 0.7;
            this.isMuted = data.muted ?? false; // Load mute state
        }
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.1);
        }
        // Save mute state
        localStorage.setItem('neonAudioSettings', JSON.stringify({
            music: this.musicVol,
            sfx: this.sfxVol,
            muted: this.isMuted
        }));
        return this.isMuted;
    },

    updateSoundUI() {
        const text = `SOUND: ${this.isMuted ? 'OFF' : 'ON'}`;
        if (document.getElementById('mute-btn-hud')) document.getElementById('mute-btn-hud').innerText = text;
        if (document.getElementById('mute-btn-pause')) document.getElementById('mute-btn-pause').innerText = text;
        if (document.getElementById('master-mute-btn')) document.getElementById('master-mute-btn').innerText = text;
    },

    playSFX(type) {
        if (!this.ctx || this.isMuted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        const now = this.ctx.currentTime;
        switch (type) {
            case 'shoot':
                osc.type = 'square';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case 'explosion':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'hit':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(50, now + 0.2);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
            case 'build':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
        }
    },

    updateMusic() {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const hasThreat = enemies.some(e => e.type === 'boss' || e.isMutant);
        const targetType = hasThreat ? 'threat' : 'normal';

        // Calculate which normal melody to use based on wave
        const normalMelodyIndex = (wave - 1) % this.melodies.normal.length;

        // Check if we need to change music
        // Change if: type changes OR (type is normal AND wave-index changes)
        if (this.musicType === targetType) {
            if (targetType === 'threat') return; // Threat stays threat
            if (this.currentNormalIndex === normalMelodyIndex) return; // Normal stays same wave melody
        }

        this.musicType = targetType;
        this.currentNormalIndex = normalMelodyIndex;
        this.musicStep = 0;

        if (this.currentMusic) clearInterval(this.currentMusic);

        const stepTime = targetType === 'threat' ? 0.125 : 0.2; // 16th note equivalent
        const melody = targetType === 'threat' ? this.melodies.threat : this.melodies.normal[normalMelodyIndex];

        this.currentMusic = setInterval(() => {
            if (this.isMuted || gameState !== 'playing') return;

            const step = this.musicStep % 16;
            this.musicStep++;

            // Play Bass
            const bassNote = melody.bass[step];
            if (bassNote) {
                this.playNote(this.notes[bassNote] || 60, 'triangle', 0.1, stepTime * 0.9);
            }

            // Play Lead
            const leadNote = melody.lead[step];
            if (leadNote) {
                // Chance for arpeggio on threat
                if (targetType === 'threat' && step % 4 === 0) {
                    this.playArp(this.notes[leadNote], 'square', 0.05, stepTime * 0.8);
                } else {
                    this.playNote(this.notes[leadNote], 'square', 0.05, stepTime * 0.7);
                }
            }
        }, stepTime * 1000);
    },

    playNote(freq, type, vol, duration) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.connect(g);
        g.connect(this.musicGain);

        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    playArp(baseFreq, type, vol, duration) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;

        const now = this.ctx.currentTime;
        const arpSpeed = 0.05;
        // Major arpeggio logic (root, 3rd, 5th)
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.setValueAtTime(baseFreq * 1.25, now + arpSpeed);
        osc.frequency.setValueAtTime(baseFreq * 1.5, now + arpSpeed * 2);
        osc.frequency.setValueAtTime(baseFreq * 2, now + arpSpeed * 3);

        osc.connect(g);
        g.connect(this.musicGain);

        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.start();
        osc.stop(now + duration);
    }
};

// --- Initialization ---
AudioEngine.loadSettings();
window.onload = () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    setupInput();
    calculatePath();

    // Check for save
    if (localStorage.getItem('neonDefenseSave')) {
        document.getElementById('start-screen').innerHTML = `
            <h1>NEON DEFENSE</h1>
            <p>SAVE DATA FOUND</p>
            <button onclick="loadGame()">CONTINUE</button>
            <br><br>
            <button style="font-size: 0.8rem; padding: 10px;" onclick="fullReset()">NEW GAME</button>
        `;
    }

    // Init Audio UI from saved settings
    AudioEngine.updateSoundUI();

    // Hotkeys
    window.addEventListener('keydown', (e) => {
        if (gameState !== 'playing') return;

        // Init audio on first interaction
        AudioEngine.init();

        switch (e.key.toLowerCase()) {
            case 'q': selectTower('basic'); break;
            case 'w': selectTower('rapid'); break;
            case 'e': selectTower('sniper'); break;
            case 'u':
                if (selectedPlacedTower) upgradeTower();
                break;
            case 'backspace':
            case 'delete':
                if (selectedPlacedTower) sellTower();
                break;
            case 'escape':
                if (selectedPlacedTower) deselectTower();
                else togglePause();
                break;
        }
    });

    // Start Loop
    requestAnimationFrame(gameLoop);
};

function setupInput() {
    // Mouse Down (Start Drag)
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left click
            // Check if clicking a tower (selection) vs dragging background
            // We'll treat it as a drag candidate, if they don't move much, it's a click
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    // Mouse Move (Pan & Hover)
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const rawMouseX = e.clientX - rect.left;
        const rawMouseY = e.clientY - rect.top;

        // Pan
        if (isDragging) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            camera.x += dx;
            camera.y += dy;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }

        // Apply Camera Transform to Mouse for Logic
        const worldPos = screenToWorld(rawMouseX, rawMouseY);
        mouseX = worldPos.x;
        mouseY = worldPos.y;

        // Update isHovering based on raw mouse being on canvas
        isHovering = true;
    });

    // Mouse Up (End Drag & Handle Click)
    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            isDragging = false;
            // If we barely moved, treat as click
            // (Simple implementation: just always handle click if not a distinct drag action? 
            //  For now, let's just handle click logic. If panning happens, it might click something. 
            //  Ideally we track delta distance.)

            // For now, allow click even if panned slightly, logic uses world coordinates
            handleClick();
        }
    });

    // Mouse Leave
    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        isHovering = false;
        selectedTowerType = null; // Hide ghost
    });

    // Wheel (Zoom)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        const zoomSpeed = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;
        let newZoom = camera.zoom + (direction * zoomSpeed);

        // Clamp
        newZoom = Math.max(0.1, Math.min(newZoom, 3.0));

        // Zoom towards mouse pointer logic
        const rect = canvas.getBoundingClientRect();
        const rawMouseX = e.clientX - rect.left;
        const rawMouseY = e.clientY - rect.top;

        // World pos before zoom
        const worldX = (rawMouseX - camera.x) / camera.zoom;
        const worldY = (rawMouseY - camera.y) / camera.zoom;

        // Update zoom
        camera.zoom = newZoom;

        // Calculate new camera.x/y such that worldPos matches rawMousePos
        // rawMouseX = worldX * newZoom + newCameraX
        // newCameraX = rawMouseX - (worldX * newZoom)
        camera.x = rawMouseX - (worldX * newZoom);
        camera.y = rawMouseY - (worldY * newZoom);

    }, { passive: false });

    // Touch support (Pan & Tap & Pinch Zoom)
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchDragging = false;
    let initialPinchDist = null;
    let lastZoom = 1;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault(); // Prevent scrolling/zooming
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            isTouchDragging = false;

            // Sync mouse pos for hover effects
            const rect = canvas.getBoundingClientRect();
            const rawX = touchStartX - rect.left;
            const rawY = touchStartY - rect.top;
            const worldPos = screenToWorld(rawX, rawY);
            mouseX = worldPos.x;
            mouseY = worldPos.y;
            isHovering = true;
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            lastZoom = camera.zoom;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;

            // Threshold to consider it a drag
            if (Math.hypot(dx, dy) > 5) {
                isTouchDragging = true;
                camera.x += dx;
                camera.y += dy;

                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
            }
        } else if (e.touches.length === 2 && initialPinchDist) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

            if (currentDist > 0) {
                const scale = currentDist / initialPinchDist;
                let newZoom = lastZoom * scale;
                newZoom = Math.max(0.1, Math.min(newZoom, 3.0));

                // Zoom center logic could be added here (complex), for now center screen zoom or just zoom
                // To zoom at center of pinch:
                // 1. Get midpoint
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                const rect = canvas.getBoundingClientRect();
                const rawMidX = midX - rect.left;
                const rawMidY = midY - rect.top;

                // Similar to wheel zoom logic
                const worldX = (rawMidX - camera.x) / camera.zoom;
                const worldY = (rawMidY - camera.y) / camera.zoom;

                camera.zoom = newZoom;

                camera.x = rawMidX - (worldX * newZoom);
                camera.y = rawMidY - (worldY * newZoom);
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (e.touches.length < 2) {
            initialPinchDist = null;
        }
        if (e.touches.length === 0) {
            if (!isTouchDragging && !initialPinchDist) { // Only click if not dragging and not finishing a pinch
                handleClick();
            }
            isHovering = false; // Stop hovering after touch ends
            isTouchDragging = false;
        }
    }, { passive: false });

    // Keydown for hotkeys
    window.addEventListener('keydown', (e) => {
        if (e.key === '1') activateAbility('emp');
        if (e.key === '2') activateAbility('overclock');
    });
}

function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - camera.x) / camera.zoom,
        y: (screenY - camera.y) / camera.zoom
    };
}

function handleClick() {
    if (gameState !== 'playing' || isPaused) return;

    // --- Ability Targeting Integration ---
    if (targetingAbility) {
        if (targetingAbility === 'overclock') {
            // Must target a tower
            let targetTower = null;
            for (let t of towers) {
                if (Math.hypot(t.x - mouseX, t.y - mouseY) < 20) {
                    targetTower = t;
                    break;
                }
            }
            if (targetTower) {
                useAbility('overclock', targetTower);
                return;
            }
        } else if (targetingAbility === 'emp') {
            // Target ground
            useAbility('emp', { x: mouseX, y: mouseY });
            return;
        }
        // If we clicked empty space while targeting, we don't necessarily want to cancel immediately?
        // Actually, let's treat it as a cancel if they clicked far away or just keep targeting.
        // For now, let's allow "right-click to cancel" logic in input setup, and keep targeting here.
    }

    // Check interaction with towers
    // Check if clicked ON a placed tower to select it
    let clickedTower = null;
    for (let t of towers) {
        // Simple circle check
        const dist = Math.hypot(t.x - mouseX, t.y - mouseY);
        if (dist < 20) { // Approx radius
            clickedTower = t;
            break;
        }
    }

    if (clickedTower) {
        selectPlacedTower(clickedTower);
        return;
    }

    // Check interaction with RIFTS (Spawns)
    let clickedRift = null;
    for (let rift of paths) {
        const spawn = rift.points[0];
        const dist = Math.hypot(spawn.x - mouseX, spawn.y - mouseY);
        if (dist < 30) { // Rift selection radius
            clickedRift = rift;
            break;
        }
    }

    if (clickedRift) {
        selectRift(clickedRift);
        return;
    }

    // Check interaction with BASE (Center)
    // Check interaction with BASE (Center)
    // Use the actual base position from the path data
    // (The base is always at the end of the paths)
    if (paths.length > 0) {
        const p = paths[0].points;
        const base = p[p.length - 1];

        if (Math.hypot(mouseX - base.x, mouseY - base.y) < 30) {
            selectBase();
            return;
        }
    }

    // If not clicking a tower, check if we have a build target or are selecting a new one
    // New UX: Tapping empty space selects the spot for potential building (opens panel)

    // 1. If we have a build target and click it again? (Maybe confirm? or just do nothing)
    // 2. If we have a selected tower type (from panel), we might be building?
    //    Actually, if panel is open, we select type then it should build immediately at buildTarget?
    //    Or does selecting type just set selectedTowerType and we have to click again?
    //    The plan says: "Select Tower -> Call buildTower(buildTarget.x, buildTarget.y) -> Hide Panel"
    //    So handleClick just handles the initial empty click.

    // If we are currently IN placement mode (legacy or drag-drop style? No, we are changing to Tap-Select-Build)
    // If selectedTowerType is set, it means we clicked a button in the panel. 
    // If we support "click panel -> click map" (old way), we might need to keep it or disable it.
    // The request implies "show build panel ONLY when user tap empty square".
    // So the flow is: Empty Click -> Panel Shows -> Select Tower -> Build.

    // Snap to grid
    const snap = snapToGrid(mouseX, mouseY);

    // Check if valid build spot (simplistic check for now, specific validation in build)
    // Just ensure it's not a path or tower (re-using validPlacement check logic or just simple check)
    let occupied = false;
    for (let t of towers) {
        if (Math.abs(t.x - snap.x) < 1 && Math.abs(t.y - snap.y) < 1) {
            occupied = true; break;
        }
    }

    if (!occupied) {
        // Double check path collision if we want to be strict, or just let them select and fail to build later?
        // Better to select.

        selectBuildTarget(snap.x, snap.y);
        return;
    }

    // If clicking on empty space (impossible to reach here logic-wise if occupied check covers everything?)
    // Actually towers/base/rifts checks above cover occupied objects.
    // So if we are here, it's effectively empty space but maybe "occupied" flag was for towers only?
    // We already checked towers/rifts/base above. 

    deselectTower();
}

function selectBuildTarget(x, y) {
    buildTarget = { x, y };
    selectedPlacedTower = null;
    selectedBase = false;
    selectedRift = null;
    selectedTowerType = null;

    // Show Panel
    document.getElementById('controls-bar').classList.remove('hidden');
    // Hide other panels
    document.getElementById('selection-panel').classList.add('hidden');

    // Play sound
    // AudioEngine.playSFX('click'); 
}

function selectBase() {
    selectedBase = true;
    selectedPlacedTower = null;
    selectedRift = null;
    selectedTowerType = null;
    // Clear any potential "ghost" selection from UI
    document.querySelectorAll('.tower-selector').forEach(el => el.classList.remove('selected'));

    updateSelectionUI();
}

function selectRift(rift) {
    selectedRift = rift;
    selectedPlacedTower = null;
    selectedBase = false;
    selectedTowerType = null;
    document.querySelectorAll('.tower-selector').forEach(el => el.classList.remove('selected'));
    updateSelectionUI();
}

function deselectTower() {
    selectedTowerType = null;
    selectedPlacedTower = null;
    selectedBase = false;
    selectedRift = null;
    targetingAbility = null; // Clear ability targeting
    buildTarget = null;

    // Hide Build Panel
    document.getElementById('controls-bar').classList.add('hidden');

    updateUI();
    updateSelectionUI();
}

// Global functions for Base UI
// Calculate dynamic repair cost: $50 base, +$25 for each life bought beyond 20
window.getRepairCost = function () {
    const baseline = 20;
    if (lives < baseline) return 50;
    return 50 + (lives - baseline + 1) * 25;
};

window.repairBase = function () {
    const cost = getRepairCost();
    if (money >= cost) {
        money -= cost;
        lives++;
        lives++;
        // Use base world coordinates for particles
        if (paths.length > 0) {
            const p = paths[0].points;
            const base = p[p.length - 1];
            createParticles(base.x, base.y, '#00ff41', 20); // Green heal
        }
        AudioEngine.playSFX('build');
        updateUI();
        updateSelectionUI(); // Update buttons just in case
    }
}

window.upgradeBase = function () {
    // Cost: 200 * (level + 1)
    const cost = 200 * (baseLevel + 1);

    if (money >= cost && baseLevel < 10) {
        money -= cost;
        baseLevel++;
        baseLevel++;
        // Use base world coordinates for particles
        if (paths.length > 0) {
            const p = paths[0].points;
            const base = p[p.length - 1];
            createParticles(base.x, base.y, '#00f3ff', 30); // Blue upgrade
        }
        AudioEngine.playSFX('build');
        updateUI();
        updateSelectionUI();
    }
}

function resize() {
    const dpr = window.devicePixelRatio || 1;

    // Game Logic Dimensions (Logical Pixels)
    width = window.innerWidth;
    height = window.innerHeight;

    // Rendering Dimensions (Physical Pixels)
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    // CSS scaling handled by style.css (width: 100%, height: 100%)
    // But explicitly setting style matches logical size
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Scale drawing context so we use logical coordinates
    ctx.scale(dpr, dpr);

    // Only regenerate paths on initial load, not during active gameplay
    if (gameState === 'start') {
        calculatePath();
    }
}

function snapToGrid(x, y) {
    const col = Math.floor(x / GRID_SIZE);
    const row = Math.floor(y / GRID_SIZE);
    return {
        x: col * GRID_SIZE + GRID_SIZE / 2,
        y: row * GRID_SIZE + GRID_SIZE / 2,
        col: col,
        row: row
    };
}

function calculatePath() {
    paths = [];

    // Grid dimensions
    const cols = Math.floor(width / GRID_SIZE);
    const rows = Math.floor(height / GRID_SIZE);

    // Target: Center of map
    const centerC = Math.floor(cols / 2);
    const centerR = Math.floor(rows / 2);
    const endNode = { c: centerC, r: centerR };

    // Start: Random point >= 10 units away
    let startC, startR;
    let validStart = false;
    let attempts = 0;

    while (!validStart && attempts < 100) {
        startC = Math.floor(Math.random() * cols);
        startR = Math.floor(Math.random() * rows);

        // Distance check
        const dist = Math.hypot(startC - centerC, startR - centerR);
        if (dist >= 10) {
            // Also ensure it's not ON the center
            if (startC !== centerC || startR !== centerR) {
                validStart = true;
            }
        }
        attempts++;
    }

    if (!validStart) {
        // Fallback to top-left corner
        startC = 0; startR = 0;
    }

    // Find path
    // Pass empty towers list since this is initial generation
    const pathPoints = findPathOnGrid({ c: startC, r: startR }, endNode, []);

    if (pathPoints && pathPoints.length > 0) {
        paths.push({ points: pathPoints, level: 1 });
    } else {
        // Fallback manual path if something fails
        console.warn("Failed to generate random path, using fallback");
        const fallbackPath = {
            points: [
                { x: 20, y: 20 },
                { x: width / 2, y: height / 2 }
            ],
            level: 1
        };
        paths.push(fallbackPath);
    }
}

// --- Game Control ---

window.startGame = function () {
    AudioEngine.init(); // Initialize audio context on start
    document.getElementById('start-screen').classList.add('hidden');
    resetGameLogic();
    gameState = 'playing';
    saveGame();
};

window.resetGame = function () {
    AudioEngine.init();
    // This is "Game Over" restart aka System Reboot
    // We can just wipe save and start fresh
    fullReset();
};

window.fullReset = function () {
    localStorage.removeItem('neonDefenseSave');
    location.reload();
};

function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        document.getElementById('pause-menu').classList.remove('hidden');
    } else {
        document.getElementById('pause-menu').classList.add('hidden');
    }
}

// --- Ability System Functions ---

function activateAbility(type) {
    if (gameState !== 'playing' || isPaused) return;
    const ability = abilities[type];

    // Check energy and cooldown
    if (energy < ability.cost || ability.cooldown > 0) {
        AudioEngine.playSFX('error'); // Need to ensure error SFX exists or handle gracefully
        return;
    }

    // Toggle targeting
    if (targetingAbility === type) {
        targetingAbility = null;
    } else {
        targetingAbility = type;
        selectedTowerType = null; // Deselect ghost tower
        selectedPlacedTower = null;
        selectedBase = false;
        selectedRift = null;
    }
    updateUI();
}

function useAbility(type, target) {
    const ability = abilities[type];
    if (energy < ability.cost) return;

    energy -= ability.cost;
    targetingAbility = null;
    ability.cooldown = ability.maxCooldown;

    if (type === 'emp') {
        // EMP Blast at target {x, y}
        createParticles(target.x, target.y, '#00f3ff', 20);
        AudioEngine.playSFX('explosion'); // maybe a 'zap' sfx later

        // Freeze enemies in radius
        enemies.forEach(e => {
            const dist = Math.hypot(e.x - target.x, e.y - target.y);
            if (dist < ability.radius) {
                e.frozen = true;
                e.frozenTimer = ability.duration;
            }
        });
        lightSources.push({ x: target.x, y: target.y, radius: 250, color: '#00f3ff', life: 2.0 });
    } else if (type === 'overclock') {
        // Overclock a specific tower
        createParticles(target.x, target.y, '#fcee0a', 15);
        AudioEngine.playSFX('repair'); // use repair sfx for buff for now

        target.overclocked = true;
        target.overclockTimer = ability.duration;
        // The boost happens in updateTowers
    }

    updateUI();
}

window.activateAbility = activateAbility;
window.togglePause = togglePause; // Expose togglePause globally

window.toggleWavePanel = function () {
    const panel = document.getElementById('wave-info-panel');
    if (panel.classList.contains('hidden')) {
        updateWavePanel();
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
};

function updateWavePanel() {
    const nextWave = wave;
    const baseCount = 5 + Math.floor(nextWave * 2.5);

    // Rift Stats
    const totalRifts = paths.length;
    const upgradedRiftsCount = paths.filter(p => p.level > 1).length;
    const mutatedRiftsCount = paths.filter(p => p.mutation).length;
    const maxTier = paths.reduce((max, p) => Math.max(max, p.level || 1), 1);

    document.getElementById('intel-count').innerText = baseCount;

    // Replace Mutant Chance with Rift Strategy Info
    const mutantChanceEl = document.getElementById('intel-mutant-chance');
    if (mutatedRiftsCount > 0) {
        mutantChanceEl.innerHTML = `<span style="color: #fff; font-weight: bold;">${mutatedRiftsCount} SECTORS MUTATED</span>`;
    } else {
        mutantChanceEl.innerText = "NO ANOMALIES";
    }

    const threatTitle = nextWave % 10 === 0 ? "CRITICAL (BOSS)" : (nextWave % 5 === 0 ? "ELEVATED" : "NORMAL");
    const threatSpan = document.getElementById('intel-threat');
    threatSpan.innerText = threatTitle;
    threatSpan.style.color = nextWave % 10 === 0 ? "var(--neon-pink)" : (nextWave % 5 === 0 ? "#ffcc00" : "white");

    // Add extra info to the panel
    const specialList = document.getElementById('intel-special-list');
    if (!specialList) return; // Guard clause for missing element

    specialList.innerHTML = "";

    if (nextWave % 10 === 0) specialList.innerHTML += "<li>Guaranteed BOSS arrival</li>";
    if (nextWave % 20 === 0) specialList.innerHTML += `<li style="color: #fff; font-weight: bold;">>>> INCOMING MUTATION EVENT <<<</li>`;

    // Show Upgrade Probability (Post Wave 50)
    if (nextWave >= 50) {
        specialList.innerHTML += `<li style="color: #00f3ff; font-weight: bold;">10% Chance for SECTOR EVOLUTION (Upgrade)</li>`;
    }

    if (upgradedRiftsCount > 0) {
        specialList.innerHTML += `<li style="color: var(--neon-pink)">${upgradedRiftsCount} VETERAN RIFTS (Max T${maxTier})</li>`;
        specialList.innerHTML += `<li>T${maxTier} Boosts: HP x${(1 + (maxTier - 1) * 0.5).toFixed(1)}</li>`;
    }

    if (mutatedRiftsCount > 0) {
        paths.filter(p => p.mutation).forEach(p => {
            specialList.innerHTML += `<li style="color: ${p.mutation.color}">SECTOR ${p.mutation.name} ACTIVE</li>`;
        });
    }

    if (nextWave > 50 && nextWave % 5 === 0 && nextWave % 10 !== 0) {
        specialList.innerHTML += "<li>SURPRISE BOSS possible (25%)</li>";
    }

    if (specialList.innerHTML === "") specialList.innerHTML = "<li>All monitoring clear.</li>";
}

window.toggleMute = function () {
    const muted = AudioEngine.toggleMute();
    AudioEngine.updateSoundUI();
};

window.setMusicVolume = function (val) {
    AudioEngine.setVolume('music', val);
};

window.setSFXVolume = function (val) {
    AudioEngine.setVolume('sfx', val);
};

window.saveGame = function () {
    // Simple serialization
    const data = {
        money, lives, wave, isWaveActive, prepTimer, spawnQueue, paths,
        towers: towers.map(t => ({
            type: t.type, x: t.x, y: t.y, level: t.level,
            damage: t.damage, range: t.range, cooldown: t.cooldown, maxCooldown: t.maxCooldown,
            color: t.color, cost: t.cost, totalCost: t.totalCost
        })),
        baseLevel, baseCooldown, energy,
        playerName, totalKills
    };

    localStorage.setItem('neonDefenseSave', JSON.stringify(data));
    console.log("Game Saved");
};

window.loadGame = function () {
    const raw = localStorage.getItem('neonDefenseSave');
    if (!raw) {
        startGame();
        return;
    }

    const data = JSON.parse(raw);
    money = data.money;
    lives = data.lives;
    wave = data.wave;
    isWaveActive = data.isWaveActive;
    prepTimer = data.prepTimer;
    spawnQueue = data.spawnQueue || []; // Load queue

    if (data.paths) {
        paths = data.paths.map(p => {
            if (Array.isArray(p)) return { points: p, level: 1, mutation: null };
            return p;
        });
    }

    baseLevel = data.baseLevel || 0;
    baseCooldown = data.baseCooldown || 0;
    energy = data.energy || 0;
    playerName = data.playerName || null;
    totalKills = data.totalKills || { basic: 0, fast: 0, tank: 0, boss: 0, splitter: 0, mini: 0, bulwark: 0, shifter: 0 };

    // Restore towers
    towers = (data.towers || []).map(t => ({
        ...t,
        cooldown: t.cooldown || 0,
        maxCooldown: t.maxCooldown || t.cooldown || 30
    }));

    // Reset transient state
    enemies = [];
    projectiles = [];
    particles = [];
    selectedPlacedTower = null;
    selectedTowerType = null;
    selectedBase = false;

    playerName = data.playerName || null;

    // Hide start screen immediately when loading
    document.getElementById('start-screen').classList.add('hidden');

    if (!playerName) {
        document.getElementById('name-entry-modal').classList.remove('hidden');
        // gameState will be set in savePlayerName
    } else {
        gameState = 'playing';
        AudioEngine.init(); // Init audio on continue click
    }

    // Initialize audio sliders
    if (document.getElementById('music-slider')) document.getElementById('music-slider').value = AudioEngine.musicVol;
    if (document.getElementById('sfx-slider')) document.getElementById('sfx-slider').value = AudioEngine.sfxVol;

    updateUI();
    // If we loaded into an active wave, we might want to just reset to prep phase
    // to avoid "instant death" upon loading or complex enemy state sync
    if (isWaveActive) {
        // Option: Restart the current wave
        isWaveActive = false;
        prepTimer = 5; // Give them 5s to get bearings
        document.getElementById('wave-display').innerText = wave;
        document.getElementById('skip-btn').style.display = 'block';
    } else {
        document.getElementById('skip-btn').style.display = 'block';
    }
    updateUI();
};

function checkPlayerName() {
    if (!playerName) {
        document.getElementById('name-entry-modal').classList.remove('hidden');
    } else {
        startGame();
    }
}

function savePlayerName() {
    const input = document.getElementById('player-name-input').value.trim();
    if (input) {
        playerName = input;
        document.getElementById('name-entry-modal').classList.add('hidden');
        saveGame();

        // If we were loading, start the game loop for real
        if (gameState === 'playing' || document.getElementById('start-screen').classList.contains('hidden')) {
            // Already in a game or start screen hidden, just resume
            // (Actually loadGame hasn't hidden start screen yet if name was missing)
        }

        // Standard start/resume path
        document.getElementById('start-screen').classList.add('hidden');
        gameState = 'playing';
        AudioEngine.init(); // Init audio on name confirm click
        updateUI();
    }
}

window.checkPlayerName = checkPlayerName;
window.savePlayerName = savePlayerName;

window.shareGame = async function () {
    // Generate Stats Text
    let killSummary = "";
    for (let type in totalKills) {
        if (totalKills[type] > 0) {
            killSummary += `\n- ${type.toUpperCase()}: ${totalKills[type]}`;
        }
    }

    // Count towers by type
    const towerCounts = { basic: 0, rapid: 0, sniper: 0 };
    towers.forEach(t => { if (towerCounts[t.type] !== undefined) towerCounts[t.type]++; });

    const shareText = `[NEON DEFENSE STATUS REPORT]\nCommander: ${playerName || "Unknown"}\nSector reached: WAVE ${wave}\nCredits secured: ${money}\nCommand Center: LEVEL ${baseLevel + 1}\nTowers: Basic(${towerCounts.basic}), Rapid(${towerCounts.rapid}), Sniper(${towerCounts.sniper})\nConfirmed Eliminations: ${killSummary}\n\nJoin the defense!`;

    try {
        // Create an offline canvas to render the full report (Game + UI Overlay)
        const borderPadding = 150;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = canvas.width + (borderPadding * 2);
        offCanvas.height = canvas.height + (borderPadding * 2);
        const octx = offCanvas.getContext('2d');

        // Fill background
        octx.fillStyle = '#050510';
        octx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        // Draw the main game canvas onto the offline canvas with padding
        octx.drawImage(canvas, borderPadding, borderPadding);

        // --- Render HUD Overlay onto the Screenshot ---
        const padding = 20 + borderPadding;
        const bannerHeight = 85;
        const textOffset = 75;

        // Fully opaque banner at the top (no border)
        octx.fillStyle = '#050510';
        octx.fillRect(0, 0, offCanvas.width, bannerHeight + textOffset);

        // Header Text
        octx.fillStyle = '#ff00ac';
        octx.font = 'bold 16px Orbitron, sans-serif';
        octx.textAlign = 'left';
        octx.fillText('NEON DEFENSE - COMMANDER REPORT', padding, 25 + textOffset);

        // Commander Name
        octx.fillStyle = '#00f3ff';
        octx.font = 'bold 22px Orbitron, sans-serif';
        octx.fillText(`COMMANDER: ${playerName || "UNIDENTIFIED"}`, padding, 55 + textOffset);

        // Wave & Credits (Right Aligned)
        octx.textAlign = 'right';
        octx.font = 'bold 18px Orbitron, sans-serif';
        octx.fillStyle = '#fcee0a';
        octx.fillText(`WAVE: ${wave}  |  CREDITS: $${money}`, offCanvas.width - padding, 45 + textOffset);

        // --- Render Panels ---
        const panelWidth = 220;

        // 1. ELIMINATIONS PANEL
        const elimHeight = 250;
        octx.fillStyle = 'rgba(5, 5, 16, 0.85)';
        octx.fillRect(offCanvas.width - panelWidth - padding, bannerHeight + padding, panelWidth, elimHeight);
        octx.strokeStyle = '#ff00ac';
        octx.strokeRect(offCanvas.width - panelWidth - padding, bannerHeight + padding, panelWidth, elimHeight);

        octx.textAlign = 'left';
        octx.fillStyle = '#ff00ac';
        octx.font = 'bold 14px Orbitron, sans-serif';
        octx.fillText('ELIMINATIONS', offCanvas.width - panelWidth - padding + 10, bannerHeight + padding + 25);

        let y = bannerHeight + padding + 55;
        for (let type in totalKills) {
            if (totalKills[type] > 0 || ['basic', 'fast', 'tank'].includes(type)) {
                // Draw Tiny Enemy Icon
                const color = ENEMIES[type].color;
                octx.fillStyle = color;
                octx.shadowBlur = 5;
                octx.shadowColor = color;

                const ix = offCanvas.width - panelWidth - padding + 20;
                const iy = y - 5;
                octx.beginPath();
                if (type === 'tank') octx.rect(ix - 6, iy - 6, 12, 12);
                else if (type === 'fast') { octx.moveTo(ix, iy - 8); octx.lineTo(ix + 4, iy); octx.lineTo(ix, iy + 6); octx.lineTo(ix - 4, iy); octx.closePath(); }
                else if (type === 'boss') { for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; octx.lineTo(ix + Math.cos(a) * 8, iy + Math.sin(a) * 8); } octx.closePath(); }
                else if (type === 'bulwark') { octx.rect(ix - 7, iy - 7, 14, 14); }
                else if (type === 'splitter') { octx.moveTo(ix, iy - 8); octx.lineTo(ix + 7, iy + 5); octx.lineTo(ix - 7, iy + 5); octx.closePath(); }
                else octx.arc(ix, iy, 6, 0, Math.PI * 2);
                octx.fill();
                octx.shadowBlur = 0;

                octx.font = '11px Orbitron, sans-serif';
                octx.fillStyle = '#fff';
                octx.fillText(type.toUpperCase(), ix + 15, y);
                octx.textAlign = 'right';
                octx.fillText(totalKills[type], offCanvas.width - padding - 15, y);
                octx.textAlign = 'left';
                y += 22;
            }
        }

        // 2. TOWERS PANEL
        const towerHeight = 140;
        const tx = padding;
        const ty = bannerHeight + padding;
        octx.fillStyle = 'rgba(5, 5, 16, 0.95)';
        octx.fillRect(tx, ty, panelWidth, towerHeight);
        octx.strokeStyle = '#00f3ff';
        octx.strokeRect(tx, ty, panelWidth, towerHeight);

        octx.fillStyle = '#00f3ff';
        octx.font = 'bold 14px Orbitron, sans-serif';
        octx.fillText('DEFENSE GRID', tx + 10, ty + 25);

        // Core Tower Stats
        octx.font = '11px Orbitron, sans-serif';
        octx.fillStyle = '#00ff41';
        octx.fillText(`CORE: LVL ${baseLevel + 1} | ${lives} LIVES`, tx + 10, ty + 45);

        let ty_off = ty + 70;
        ['basic', 'rapid', 'sniper'].forEach(type => {
            const config = TOWERS[type];
            const typeTowers = towers.filter(t => t.type === type);
            const avgLevel = typeTowers.length > 0 ? Math.round(typeTowers.reduce((sum, t) => sum + t.level, 0) / typeTowers.length) : 0;

            const ix = tx + 20;
            const iy = ty_off - 5;

            octx.fillStyle = config.color;
            octx.beginPath();
            if (type === 'basic') octx.rect(ix - 6, iy - 6, 12, 12);
            else if (type === 'rapid') octx.arc(ix, iy, 6, 0, Math.PI * 2);
            else { octx.save(); octx.translate(ix, iy); octx.rotate(Math.PI / 4); octx.rect(-6, -6, 12, 12); octx.restore(); }
            octx.fill();

            octx.font = '11px Orbitron, sans-serif';
            octx.fillStyle = '#fff';
            octx.fillText(type.toUpperCase(), ix + 15, ty_off);
            octx.textAlign = 'right';
            octx.fillText(`${typeTowers.length} (L${avgLevel})`, tx + panelWidth - 15, ty_off);
            octx.textAlign = 'left';
            ty_off += 22;
        });

        // Stylized watermark/border at the bottom
        octx.strokeStyle = '#00f3ff';
        octx.lineWidth = 4;
        octx.strokeRect(10, 10, offCanvas.width - 20, offCanvas.height - 20);

        // Capture the finished offline canvas
        const snapshot = offCanvas.toDataURL('image/png');

        // Check Web Share API
        if (navigator.share) {
            const blob = await (await fetch(snapshot)).blob();
            const file = new File([blob], 'neon_defense_status.png', { type: 'image/png' });

            await navigator.share({
                title: 'Neon Defense Status Report',
                text: shareText,
                files: [file]
            });
        } else {
            await navigator.clipboard.writeText(shareText);
            alert("Status report copied to clipboard! Opening enhanced snapshot...");
            const win = window.open();
            win.document.write(`<body style="background:#050510; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
                <img src="${snapshot}" style="max-width:95%; max-height:95%; border:2px solid #00f3ff; box-shadow:0 0 30px #00f3ff;">
                </body>`);
        }
    } catch (err) {
        console.error("Sharing failed:", err);
        alert("Transmission interrupted. Check logs.");
    }
};

function resetGameLogic() {
    money = 100;
    lives = 20;
    wave = 1;
    energy = 0; // Reset Energy
    isWaveActive = false;
    prepTimer = 30;
    frameCount = 0;
    targetingAbility = null;
    totalKills = { basic: 0, fast: 0, tank: 0, boss: 0, splitter: 0, mini: 0, bulwark: 0, shifter: 0 };

    // Reset ability cooldowns
    for (let k in abilities) abilities[k].cooldown = 0;

    baseLevel = 0; // Reset base
    towers = [];
    selectedTowerType = 'basic';
    selectedPlacedTower = null;
    selectedBase = false;
    selectedRift = null;
    document.getElementById('selection-panel').classList.add('hidden');
    selectTower('basic');

    enemies = [];
    projectiles = [];
    particles = [];
    spawnQueue = []; // Clear spawn queue on reset

    // Reset paths to initial state
    paths = [];
    calculatePath();

    startPrepPhase();
    updateUI();
}

function startPrepPhase() {
    isWaveActive = false;
    // Don't reset money/lives/towers here, just timer
    prepTimer = 30;
    spawnQueue = []; // Clear any remaining enemies from previous wave if it ended prematurely

    // UI Updates
    document.getElementById('skip-btn').style.display = 'block';
    document.getElementById('wave-display').innerText = wave; // Show incoming wave number

    // Auto-update Wave Intel if open
    const panel = document.getElementById('wave-info-panel');
    if (panel && !panel.classList.contains('hidden')) {
        updateWavePanel();
    }

    // New Path Generation
    // Up to Wave 50: Every 10 waves (11, 21, 31, 41, 51)
    // After Wave 50: Every 5 waves (56, 61, 66...)
    if (wave > 1) {
        if (wave <= 50) {
            if ((wave - 1) % 10 === 0) generateNewPath();
        } else {
            if ((wave - 1) % 5 === 0) generateNewPath();
        }
    }
}

window.skipPrep = function () {
    startWave();
};

function startWave() {
    isWaveActive = true;
    prepTimer = 0;
    document.getElementById('skip-btn').style.display = 'none';

    // Clear Temporal Mutations (Fleeting)
    // Unlike Rift Tiers, mutations only last for the wave they occur in.
    paths.forEach(p => p.mutation = null);

    // Rift Upgrades (Post Wave 50) - PERMANENT
    if (wave > 50) {
        paths.forEach(p => {
            if (Math.random() < 0.10) {
                p.level++;
                console.log(`!!! RIFT EVOLVED !!! Tier: ${p.level}`);
            }
        });
    }

    // Auto-update Wave Intel if open (to show Tier upgrades/mutations immediately)
    const panel = document.getElementById('wave-info-panel');
    if (panel && !panel.classList.contains('hidden')) {
        updateWavePanel();
    }

    saveGame(); // Save on wave start

    waveTimer = 0;
    spawnTimer = 0;
    spawnQueue = [];
    const baseCount = 5 + Math.floor(wave * 2.5);

    // Check for Mutation (Every 20 waves)
    if (wave % 20 === 0) {
        generateMutation();
    }

    // Play wave start sound
    AudioEngine.init();
    AudioEngine.playSFX('build');

    for (let i = 0; i < baseCount; i++) {
        let type = 'basic';
        const r = Math.random();

        if (wave < 3) {
            type = 'basic';
        } else if (wave < 5) {
            type = r < 0.3 ? 'fast' : 'basic';
        } else if (wave < 10) {
            if (wave % 5 === 0 && i < 2) type = 'tank';
            else if (r < 0.2) type = 'fast';
            else if (r < 0.25) type = 'tank';
            else type = 'basic';
        } else {
            const chance = Math.random();
            if (chance < 0.08 && wave >= 30) type = 'shifter';
            else if (chance < 0.15 && wave >= 20) type = 'bulwark';
            else if (chance < 0.30 && wave >= 15) type = 'splitter';
            else if (chance < 0.50) type = 'fast';
            else if (chance < 0.70) type = 'tank';
            else type = 'basic';
        }
        spawnQueue.push(type);
    }

    // Boss Handling
    if (wave % 10 === 0) {
        const randomIndex = Math.floor(Math.random() * (spawnQueue.length + 1));
        spawnQueue.splice(randomIndex, 0, 'boss');
    }

    if (wave > 50 && wave % 5 === 0 && wave % 10 !== 0) {
        if (Math.random() < 0.25) {
            console.log("!!! SURPRISE BOSS DETECTED !!!");
            const randomIndex = Math.floor(Math.random() * (spawnQueue.length + 1));
            spawnQueue.splice(randomIndex, 0, 'boss');
            AudioEngine.playSFX('hit');
        }
    }

    updateUI();
}

function generateMutation() {
    // Pick a random rift to mutate
    const targetRift = paths[Math.floor(Math.random() * paths.length)];

    // Mutation Profiles
    const profiles = [
        { name: 'CRIMSON', color: '#ff0033', hp: 1.6, speed: 1.2, reward: 2.0 },
        { name: 'VOID', color: '#aa00ff', hp: 1.4, speed: 1.5, reward: 2.5 },
        { name: 'TITAN', color: '#00ffaa', hp: 3.0, speed: 0.7, reward: 3.0 },
        { name: 'PHASE', color: '#ffffff', hp: 1.2, speed: 2.0, reward: 1.5 },
        { name: 'NEON', color: '#fcee0a', hp: 1.8, speed: 1.3, reward: 2.0 }
    ];

    const profile = profiles[Math.floor(Math.random() * profiles.length)];

    targetRift.mutation = {
        key: profile.name,
        name: profile.name,
        color: profile.color,
        hpMulti: profile.hp,
        speedMulti: profile.speed,
        rewardMulti: profile.reward
    };

    console.log(`!!! RIFT MUTATED !!! Sector: ${profile.name}`);
    AudioEngine.playSFX('hit'); // Alert sound
}

function generateNewPath() {
    // Generate an INDEPENDENT path to the base

    const cols = Math.floor(width / GRID_SIZE);
    const rows = Math.floor(height / GRID_SIZE);

    // Target: Center (Base)
    const centerC = Math.floor(cols / 2);
    const centerR = Math.floor(rows / 2);
    const endNode = { c: centerC, r: centerR }; // Always path to center

    // Helper to check if grid cell is occupied by any existing path
    const isLocationOnPath = (c, r) => {
        for (const path of paths) {
            for (const p of path.points) {
                const pc = Math.floor(p.x / GRID_SIZE);
                const pr = Math.floor(p.y / GRID_SIZE);
                if (pc === c && pr === r) return true;
            }
        }
        return false;
    };

    // 1. Pick Valid Start
    let startNode = null;
    let attempts = 0;

    while (!startNode && attempts < 200) {
        const c = Math.floor(Math.random() * cols);
        const r = Math.floor(Math.random() * rows);

        // Check 1: Distance >= 10 from base
        const dist = Math.hypot(c - centerC, r - centerR);

        // Check 2: Not on existing path
        if (dist >= 10 && !isLocationOnPath(c, r)) {
            startNode = { c: c, r: r };
        }
        attempts++;
    }

    if (!startNode) {
        console.warn("Could not find valid spawn location for new path.");
        return;
    }

    // 3. BFS - IGNORE TOWERS (Pass empty list)
    // Destructive pathing: The path overrides any towers
    const newPathPoints = findPathOnGrid(startNode, endNode, []);

    if (newPathPoints) {
        // No merging logic anymore - path goes all the way to base
        paths.push({ points: newPathPoints, level: 1 });

        // DESTROY TOWERS ON PATH
        // Check for collisions and sell
        // We iterate backwards to safely remove from array
        for (let i = towers.length - 1; i >= 0; i--) {
            const t = towers[i];
            const tolerance = GRID_SIZE / 2;
            let hit = false;

            // Generate grid coords for new path for reliable overlap check?
            // Or use existing segment overlap logic.
            // Existing segment logic works fine for grid alignment.

            for (let j = 0; j < newPathPoints.length - 1; j++) {
                const p1 = newPathPoints[j];
                const p2 = newPathPoints[j + 1];
                // Horizontal segment
                if (Math.abs(p1.y - p2.y) < 1) {
                    if (Math.abs(t.y - p1.y) < tolerance &&
                        t.x >= Math.min(p1.x, p2.x) - tolerance &&
                        t.x <= Math.max(p1.x, p2.x) + tolerance) {
                        hit = true;
                        break;
                    }
                }
                // Vertical segment
                else {
                    if (Math.abs(t.x - p1.x) < tolerance &&
                        t.y >= Math.min(p1.y, p2.y) - tolerance &&
                        t.y <= Math.max(p1.y, p2.y) + tolerance) {
                        hit = true;
                        break;
                    }
                }
            }

            if (hit) {
                // Sell logic (manual call to avoid UI dep or just direct removal)
                // Refund 70%
                money += Math.floor(t.totalCost || t.cost * 0.7); // Use totalCost if tracked, else estimate
                // Actually upgrade logic didn't track totalCost, just level.
                // Let's just do cost * level * 0.7 approx
                // towers have 'cost' (base cost).
                // upgrade cost is cost * 1.5 * (level-1) sum? 
                // Let's just refund current value logic: (cost * 0.7) * level for simplicity

                money += Math.floor((t.cost * t.level) * 0.2); // Bonus refund for upgrades? 
                // Actually let's just use the sellTower calculation if we can
                // const refund = Math.floor(t.cost * 0.7); -> This is base cost only.

                createParticles(t.x, t.y, '#fff', 10); // Explosion effect
                towers.splice(i, 1);
            }
        }

        updateUI();
    }
}

function findPathOnGrid(startNode, endNode, currentTowers) {
    const cols = Math.floor(width / GRID_SIZE);
    const rows = Math.floor(height / GRID_SIZE);

    // Build grid map of obstacles
    const grid = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) grid[r][c] = 0; // 0 = empty, 1 = obstacle
    }

    // Mark towers as obstacles
    for (let t of currentTowers) {
        let tc = Math.floor(t.x / GRID_SIZE);
        let tr = Math.floor(t.y / GRID_SIZE);
        if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) grid[tr][tc] = 1;
    }

    // BFS
    const queue = [];
    queue.push({ c: startNode.c, r: startNode.r, parent: null });
    const visited = new Set();
    visited.add(`${startNode.c},${startNode.r}`);

    let foundPathNode = null;

    // Heuristic optimization? Just BFS is fine for this size
    while (queue.length > 0) {
        const curr = queue.shift();

        if (curr.c === endNode.c && curr.r === endNode.r) {
            foundPathNode = curr;
            break;
        }

        const neighbors = [
            { c: curr.c + 1, r: curr.r }, { c: curr.c - 1, r: curr.r },
            { c: curr.c, r: curr.r + 1 }, { c: curr.c, r: curr.r - 1 }
        ];

        for (let n of neighbors) {
            if (n.c >= 0 && n.c < cols && n.r >= 0 && n.r < rows &&
                !visited.has(`${n.c},${n.r}`) && grid[n.r][n.c] === 0) {
                visited.add(`${n.c},${n.r}`);
                queue.push({ c: n.c, r: n.r, parent: curr });
            }
        }
    }

    if (foundPathNode) {
        // Reconstruct
        const pathPoints = [];
        let curr = foundPathNode;
        while (curr) {
            pathPoints.unshift({
                x: curr.c * GRID_SIZE + GRID_SIZE / 2,
                y: curr.r * GRID_SIZE + GRID_SIZE / 2
            });
            curr = curr.parent;
        }
        return pathPoints;
    }

    return null;
}

window.selectTower = function (type) {
    if (buildTarget) {
        // Immediate Build Mode
        // We temporarily set selectedTowerType just for buildTower to read it (or modify buildTower to accept type)
        // buildTower currently uses selectedTowerType. 
        selectedTowerType = type;
        buildTower(buildTarget.x, buildTarget.y);

        // After build, close panel? Or keep open for multi-build?
        // User said "show build panel only when user tap a empty square".
        // Usually in this UX (Kingdom Rush etc), it closes after build.
        deselectTower();
        return;
    }

    // Legacy/Fallback (if called without target, unlikely with new flow)
    selectedTowerType = type;
    selectedPlacedTower = null; // Deselect existing tower
    selectedBase = false;
    document.querySelectorAll('.tower-selector').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.tower-selector[data-type="${type}"]`).classList.add('selected');
};

function selectPlacedTower(tower) {
    selectedPlacedTower = tower;
    selectedTowerType = null; // Disable placement mode
    selectedBase = false;
    document.querySelectorAll('.tower-selector').forEach(el => el.classList.remove('selected'));
    updateSelectionUI();
}

window.deselectTower = function () {
    selectedPlacedTower = null;
    selectedBase = false;
    selectedRift = null;
    document.getElementById('selection-panel').classList.add('hidden');
};

window.upgradeTower = function () {
    if (!selectedPlacedTower) return;

    const cost = getUpgradeCost(selectedPlacedTower);
    if (money >= cost) {
        money -= cost;
        selectedPlacedTower.level++;
        selectedPlacedTower.damage *= 1.2;
        selectedPlacedTower.range *= 1.1;
        selectedPlacedTower.totalCost += cost;

        createParticles(selectedPlacedTower.x, selectedPlacedTower.y, '#00ff41', 15);
        updateSelectionUI();
        updateUI();
        saveGame(); // Save on upgrade
    }
};

window.sellTower = function () {
    if (!selectedPlacedTower) return;

    const refund = Math.floor(selectedPlacedTower.totalCost * 0.7);
    money += refund;

    // Remove tower
    const index = towers.indexOf(selectedPlacedTower);
    if (index > -1) {
        towers.splice(index, 1);
    }

    createParticles(selectedPlacedTower.x, selectedPlacedTower.y, '#ffffff', 10);
    deselectTower();
    updateUI();
    saveGame(); // Save on sell
};

function getUpgradeCost(tower) {
    return Math.floor(tower.cost * 0.5 * tower.level);
}

function updateSelectionUI() {
    const panel = document.getElementById('selection-panel');

    if (selectedRift) {
        const tier = selectedRift.level || 1;
        const mutation = selectedRift.mutation;

        let hpMulti = (1 + (tier - 1) * 0.5);
        let speedMulti = (1 + (tier - 1) * 0.15);
        let rewardMulti = (1 + (tier - 1) * 0.5);

        if (mutation) {
            hpMulti *= mutation.hpMulti;
            speedMulti *= mutation.speedMulti;
            rewardMulti *= mutation.rewardMulti;
        }

        panel.classList.remove('hidden');
        panel.innerHTML = `
            <h3>RIFT INTEL</h3>
            <div style="margin-bottom: 8px; font-size: 0.9rem; color: #aaa;">Sector Threat Profile</div>
            
            ${mutation ? `
                <div style="background: ${mutation.color}33; border: 1px solid ${mutation.color}; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                    <div style="font-size: 0.7rem; color: ${mutation.color}; font-weight: bold;">[ MUTATION DETECTED ]</div>
                    <div style="font-size: 1.1rem; color: #fff;">${mutation.name} VORTEX</div>
                </div>
            ` : ''}

            <div class="stats">Tier: <span class="highlight" style="color: var(--neon-pink)">T${tier}</span></div>
            <div class="stat-row"><span>HP Multiplier</span> <span style="color: var(--neon-pink)">x${hpMulti.toFixed(1)}</span></div>
            <div class="stat-row"><span>Speed Multi</span> <span style="color: var(--neon-pink)">x${speedMulti.toFixed(2)}</span></div>
            <div class="stat-row"><span>Cash Reward</span> <span style="color: var(--neon-pink)">x${rewardMulti.toFixed(1)}</span></div>
            
            <p style="font-size: 0.8rem; color: #888; margin-top: 15px; border-top: 1px solid #333; padding-top: 10px;">
                All anomalies from this rift inherit these veteran multipliers.
            </p>
            <div class="actions" style="margin-top: 10px;">
                <button class="action-btn close" onclick="deselectTower()" style="width: 100%;">CLOSE DISPATCH</button>
            </div>
        `;

        // Position panel near rift spawn
        const spawn = selectedRift.points[0];
        const screenPos = {
            x: spawn.x * camera.zoom + camera.x,
            y: spawn.y * camera.zoom + camera.y
        };
        panel.style.left = Math.min(window.innerWidth - 220, Math.max(20, screenPos.x + 50)) + 'px';
        panel.style.top = Math.min(window.innerHeight - 300, Math.max(20, screenPos.y - 100)) + 'px';
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.marginRight = '0';
        return;
    }

    if (selectedBase) {
        panel.classList.remove('hidden');
        panel.innerHTML = `
            <h3>HOME</h3>
            <div style="margin-bottom: 8px; font-size: 0.9rem; color: #aaa;">The Heart of Defense</div>
            <div class="stats">Level: <span class="highlight">${baseLevel}/10</span></div>
            ${baseLevel > 0 ? `
                <div class="stat-row"><span>Damage</span> <span>${baseDamage + (baseLevel - 1) * 10}</span></div>
                <div class="stat-row"><span>Range</span> <span>${baseRange + (baseLevel - 1) * 30}</span></div>
            ` : ''}
            
            <hr style="border: 0; border-top: 1px solid #444; margin: 10px 0;">
            
            <div class="actions">
                <!-- Repair -->
                <button onclick="repairBase()" class="action-btn" style="background: rgba(0, 255, 65, 0.2); border: 1px solid #00ff41; color: #00ff41; width: 100%; margin-bottom: 5px;">
                    REPAIR (+1 Life) <span style="float:right;">$${getRepairCost()}</span>
                </button>
                
                <!-- Upgrade -->
                ${baseLevel < 10 ? `
                <button onclick="upgradeBase()" class="action-btn" style="background: rgba(0, 243, 255, 0.2); border: 1px solid #00f3ff; color: #00f3ff; width: 100%;">
                    ${baseLevel === 0 ? 'INSTALL TURRET' : 'UPGRADE TURRET'} <span style="float:right;">$${200 * (baseLevel + 1)}</span>
                </button>
                ` : '<div style="color: #666; text-align: center; margin-top: 5px;">MAX LEVEL</div>'}

                <button class="action-btn close" onclick="deselectTower()" style="margin-top: 10px;">X</button>
            </div>
        `;

        // Position panel near base (center)
        const cols = Math.floor(width / GRID_SIZE);
        const rows = Math.floor(height / GRID_SIZE);
        const baseX = Math.floor(cols / 2) * GRID_SIZE + GRID_SIZE / 2;
        const baseY = Math.floor(rows / 2) * GRID_SIZE + GRID_SIZE / 2;

        const screenPos = {
            x: baseX * camera.zoom + camera.x,
            y: baseY * camera.zoom + camera.y
        };

        panel.style.left = Math.min(window.innerWidth - 220, Math.max(20, screenPos.x + 50)) + 'px';
        panel.style.top = Math.min(window.innerHeight - 300, Math.max(20, screenPos.y - 100)) + 'px';
        panel.style.bottom = 'auto';
        panel.style.right = 'auto'; // Reset potential CSS fixed positioning
        panel.style.marginRight = '0';
        return;
    }

    if (!selectedPlacedTower) {
        panel.classList.add('hidden');
        return;
    }

    // --- Render Tower Selection UI ---
    const t = selectedPlacedTower;
    const upgradeCost = getUpgradeCost(t);
    const refund = Math.floor(t.totalCost * 0.7);

    panel.classList.remove('hidden');
    panel.innerHTML = `
        <div id="selected-stats">
            <h3>TOWER INFO</h3>
            <div id="sel-type">Type: ${t.type.toUpperCase()}</div>
            <div id="sel-level">Level: ${t.level}</div>
            <div id="sel-damage">Damage: ${Math.floor(t.damage)}</div>
            <div id="sel-range">Range: ${Math.floor(t.range)}</div>
        </div>
        <div class="actions">
            <button class="action-btn upgrade" onclick="upgradeTower()">
                UPGRADE <span>($${upgradeCost})</span>
            </button>
            <button class="action-btn sell" onclick="sellTower()">
                SELL <span>($${refund})</span>
            </button>
            <button class="action-btn close" onclick="deselectTower()">X</button>
        </div>
    `;

    // Position panel near selected tower
    const screenPos = {
        x: t.x * camera.zoom + camera.x,
        y: t.y * camera.zoom + camera.y
    };

    panel.style.left = Math.min(window.innerWidth - 220, Math.max(20, screenPos.x + 50)) + 'px';
    panel.style.top = Math.min(window.innerHeight - 300, Math.max(20, screenPos.y - 100)) + 'px';
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.marginRight = '0';
}

function isValidPlacement(x, y, towerConfig) {
    const snap = snapToGrid(x, y);

    // Check UI bounds (approximate) - don't place under controls
    // These are world coordinates, so need to convert UI bounds to world
    const uiTopWorldY = screenToWorld(0, 60).y;
    const uiBottomWorldY = screenToWorld(0, height - 100).y;

    if (snap.y > uiBottomWorldY || snap.y < uiTopWorldY) return { valid: false, reason: 'ui' };

    // Check cost
    if (money < towerConfig.cost) return { valid: false, reason: 'cost' };

    // Check collision with path
    // Since everything is grid based, we can just check if the point intersects the path segments with a box check
    const tolerance = GRID_SIZE / 2; // Exact hit

    for (const rift of paths) {
        const path = rift.points;
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];

            // Horizontal segment
            if (Math.abs(p1.y - p2.y) < 1) {
                if (Math.abs(snap.y - p1.y) < tolerance &&
                    snap.x >= Math.min(p1.x, p2.x) - tolerance &&
                    snap.x <= Math.max(p1.x, p2.x) + tolerance) {
                    return { valid: false, reason: 'path' };
                }
            }
            // Vertical segment
            else {
                if (Math.abs(snap.x - p1.x) < tolerance &&
                    snap.y >= Math.min(p1.y, p2.y) - tolerance &&
                    snap.y <= Math.max(p1.y, p2.y) + tolerance) {
                    return { valid: false, reason: 'path' };
                }
            }
        }
    }

    // Check collision with other towers (grid based equality)
    for (let t of towers) {
        if (Math.abs(t.x - snap.x) < 1 && Math.abs(t.y - snap.y) < 1) {
            return { valid: false, reason: 'tower' };
        }
    }

    return { valid: true, snap: snap };
}

function buildTower(worldX, worldY) {
    if (gameState !== 'playing') return;

    if (selectedTowerType) {
        const towerConfig = TOWERS[selectedTowerType];
        const validation = isValidPlacement(worldX, worldY, towerConfig);

        if (!validation.valid) {
            if (validation.reason === 'path' || validation.reason === 'tower') {
                createParticles(validation.snap ? validation.snap.x : worldX, validation.snap ? validation.snap.y : worldY, '#ff0000', 5);
            }
            return;
        }

        // Place tower
        money -= towerConfig.cost;
        towers.push({
            x: validation.snap.x,
            y: validation.snap.y,
            ...towerConfig,
            level: 1,
            totalCost: towerConfig.cost,
            cooldown: 0, // Current cooldown
            maxCooldown: towerConfig.cooldown // Store original cooldown as max
        });

        createParticles(validation.snap.x, validation.snap.y, towerConfig.color, 10);
        updateUI();
        saveGame(); // Save on build
    }
}

// --- Main Loop ---

function gameLoop(timestamp) {
    const dt = timestamp - lastTime; // could be used for delta time
    lastTime = timestamp;

    if (gameState === 'playing' && !isPaused) {
        update(dt);
    }
    draw();

    requestAnimationFrame(gameLoop);
}

function update() {
    frameCount++;

    // --- Ability Cooldown Management ---
    if (frameCount % 60 === 0) { // Every ~1 sec
        for (let key in abilities) {
            if (abilities[key].cooldown > 0) {
                abilities[key].cooldown--;
                if (abilities[key].cooldown === 0) updateUI(); // Refresh when CD finishes
            }
        }
    }

    // Prep Phase Timer
    if (!isWaveActive) {
        if (frameCount % 60 === 0) { // Approx 1 sec
            if (prepTimer > 0) {
                prepTimer--;
            } else {
                startWave();
            }
            updateUI();
        }
    }

    // Spawning (Only if wave active)
    if (isWaveActive) {
        if (spawnQueue.length > 0) {
            spawnTimer++;
            if (spawnTimer > 60) { // spawn every 60 frames approx
                spawnEnemy();
                spawnTimer = 0;
                updateUI(); // Update enemy count
            }
        }
        // End Wave Check
        else if (enemies.length === 0) {
            // Wave Complete
            wave++;
            startPrepPhase();
            saveGame(); // Save on wave complete
        }
    }

    // Entities (Always update so projectiles finish etc, but mainly active during wave)
    updateEnemies();
    updateTowers();
    updateProjectiles();
    updateParticles();

    if (lives <= 0) {
        gameState = 'gameover';
        AudioEngine.playSFX('hit');
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    // Update light sources
    for (let i = lightSources.length - 1; i >= 0; i--) {
        lightSources[i].life -= 0.1;
        if (lightSources[i].life <= 0) lightSources.splice(i, 1);
    }

    // Update music state based on bosses/mutants
    AudioEngine.updateMusic();
}

function spawnEnemy() {
    if (spawnQueue.length === 0) return;
    const enemyType = spawnQueue.shift(); // Get next enemy type from the queue
    const config = ENEMIES[enemyType];

    // Pick a random path
    const pathIndex = Math.floor(Math.random() * paths.length);
    const chosenRift = paths[pathIndex];
    const chosenPathPoints = chosenRift.points;
    const riftLevel = chosenRift.level || 1;
    const mutation = chosenRift.mutation;

    // Base hp scaling with wave
    let hp = config.hp * (1 + (wave * 0.4));
    let speed = config.speed;
    let reward = config.reward;
    let color = config.color;
    let name = config.name || enemyType.toUpperCase();
    let isMutant = false;

    // Apply Rift Level multi (Elite Scaling)
    if (riftLevel > 1) {
        hp *= 1 + (riftLevel - 1) * 0.5; // +50% HP per level
        speed *= 1 + (riftLevel - 1) * 0.15; // +15% Speed per level
        reward = Math.floor(reward * (1 + (riftLevel - 1) * 0.5)); // +50% Reward
    }

    // Apply Rift Mutation (Mutation Scaling)
    if (mutation) {
        hp *= mutation.hpMulti;
        speed *= mutation.speedMulti;
        reward = Math.floor(reward * mutation.rewardMulti);
        color = mutation.color;
        name = `${mutation.name} ${name}`;
        isMutant = true;
    }

    const e = {
        ...config,
        name: name,
        maxHp: hp,
        hp: hp,
        speed: speed,
        reward: reward,
        color: color,
        pathIndex: 0,
        x: chosenPathPoints[0].x,
        y: chosenPathPoints[0].y,
        currentPath: chosenPathPoints, // Store reference to path
        riftLevel: riftLevel, // Track level for visuals
        isMutant: isMutant, // Track mutation status
        mutationKey: mutation ? mutation.key : null,
        frozen: 0,
        type: enemyType // Store the type for drawing/logic
    };

    if (enemyType === 'boss') {
        lightSources.push({ x: e.x, y: e.y, radius: 150, color: '#ff8800', life: 2.0 });
    }

    enemies.push(e);
}

function spawnSubUnits(parent) {
    const miniCount = 2 + Math.floor(Math.random() * 2); // 2 or 3 minis
    const config = ENEMIES.mini;

    for (let i = 0; i < miniCount; i++) {
        // Offset minis slightly
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;

        enemies.push({
            ...config,
            name: "MINI",
            maxHp: parent.maxHp * 0.2, // Minis have 20% of parent total hp
            hp: parent.maxHp * 0.2,
            speed: parent.speed * 1.5, // Minis are faster
            reward: config.reward,
            color: parent.color,
            pathIndex: parent.pathIndex,
            x: parent.x + offsetX,
            y: parent.y + offsetY,
            currentPath: parent.currentPath,
            riftLevel: parent.riftLevel,
            isMutant: parent.isMutant,
            mutationKey: parent.mutationKey,
            frozen: 0,
            type: 'mini'
        });
    }
}

window.debugSpawn = function (type) {
    // Clone logic from spawnEnemy for a specific type
    const config = ENEMIES[type];
    if (!config) return;

    const pathIndex = Math.floor(Math.random() * paths.length);
    const chosenRift = paths[pathIndex];
    const chosenPathPoints = chosenRift.points;
    const riftLevel = chosenRift.level || 1;

    let hp = config.hp * (1 + (wave * 0.4));
    if (riftLevel > 1) {
        hp *= 1 + (riftLevel - 1) * 0.5;
    }

    enemies.push({
        ...config,
        name: `DEBUG ${type.toUpperCase()}`,
        maxHp: hp,
        hp: hp,
        speed: config.speed,
        reward: config.reward,
        color: config.color,
        pathIndex: 0,
        x: chosenPathPoints[0].x,
        y: chosenPathPoints[0].y,
        currentPath: chosenPathPoints,
        riftLevel: riftLevel,
        isMutant: false,
        frozen: 0,
        type: type
    });

    isWaveActive = true; // Ensure systems process it
    updateUI();
};

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];

        // Handle Status Effects
        if (e.frozen) {
            e.frozenTimer--;
            if (e.frozenTimer <= 0) e.frozen = false;
            // Draw frozen particles?
            if (frameCount % 10 === 0) createParticles(e.x, e.y, '#00f3ff', 1);
            continue; // Frozen enemies don't move
        }

        // Move towards next waypoint
        const path = e.currentPath || paths[0].points;
        const target = path[e.pathIndex + 1];
        if (!target) {
            // Reached end
            lives--;
            startShake(20);
            AudioEngine.playSFX('hit');
            updateUI();
            enemies.splice(i, 1);
            continue;
        }

        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const dist = Math.hypot(dx, dy);

        if (dist < e.speed) {
            e.x = target.x;
            e.y = target.y;
            e.pathIndex++;
        } else {
            e.x += (dx / dist) * e.speed;
            e.y += (dy / dist) * e.speed;
        }


        // Bulwark pulsing visuals
        if (e.type === 'bulwark' && frameCount % 30 === 0) {
            createParticles(e.x, e.y, '#fcee0a', 2);
        }

        // --- Phase Shifter Logic ---
        if (e.type === 'shifter') {
            // Toggle invisibility every 180 frames (~3 secs)
            e.isInvisible = (frameCount % 360) > 180;
        }
    }
}

function updateTowers() {
    // Update Towers
    for (let t of towers) {
        // Handle Cooldown & Overclock
        let cdRate = 1;
        if (t.overclocked) {
            cdRate = 2; // Double fire rate
            t.overclockTimer--;
            if (t.overclockTimer <= 0) t.overclocked = false;
            if (frameCount % 10 === 0) createParticles(t.x, t.y, '#fcee0a', 1);
        }

        if (t.cooldown > 0) t.cooldown -= cdRate;

        // Find Target
        const range = t.range;
        let target = null;
        let minDist = Infinity;

        // Taunt Check first
        const taunters = enemies.filter(e => e.type === 'bulwark' && !e.isInvisible && Math.hypot(e.x - t.x, e.y - t.y) <= range);
        if (taunters.length > 0) {
            // Pick closest taunter
            taunters.forEach(e => {
                const dist = Math.hypot(e.x - t.x, e.y - t.y);
                if (dist < minDist) {
                    target = e;
                    minDist = dist;
                }
            });
        } else {
            for (let e of enemies) {
                if (e.isInvisible) continue; // Ignore stealth units
                const dist = Math.hypot(e.x - t.x, e.y - t.y);
                if (dist <= range && dist < minDist) {
                    target = e;
                    minDist = dist;
                }
            }
        }

        if (target && t.cooldown <= 0) {
            shoot(t, target);
            t.cooldown = t.maxCooldown;
        }
    }

    // Base Turret Logic
    if (baseLevel > 0 && paths.length > 0) {
        const p = paths[0].points;
        const base = p[p.length - 1];
        const baseX = base.x;
        const baseY = base.y;

        if (baseCooldown > 0) baseCooldown--;

        // Find target for base
        let target = null;
        let minDist = Infinity;
        // Base range increases with level: 150, 180, 210
        const currentBaseRange = baseRange + (baseLevel - 1) * 30;

        for (let e of enemies) {
            const dist = Math.hypot(e.x - baseX, e.y - baseY);
            if (dist <= currentBaseRange && dist < minDist) {
                target = e;
                minDist = dist;
            }
        }

        if (target && baseCooldown <= 0) {
            // Shoot
            // Damage increases with level: 20, 30, 40
            const currentDamage = baseDamage + (baseLevel - 1) * 10;
            // Cooldown decreases: floor at 8 (approx 7.5 shots/sec)
            const currentCooldown = Math.max(8, 35 - baseLevel * 5);

            projectiles.push({
                x: baseX,
                y: baseY,
                target: target,
                speed: 12,
                damage: currentDamage,
                color: '#00ff41',
                type: 'base' // Special projectile
            });
            baseCooldown = currentCooldown;
            AudioEngine.playSFX('shoot');
        }
    }
}

function shoot(tower, target) {
    projectiles.push({
        x: tower.x,
        y: tower.y,
        target: target,
        speed: 10,
        damage: tower.damage,
        color: tower.color
    });
    // Muzzle Flash
    lightSources.push({ x: tower.x, y: tower.y, radius: 40, color: tower.color, life: 1.0 });
    AudioEngine.playSFX('shoot');
}

function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        let t = p.target;

        if (!enemies.includes(t)) {
            // Target dead/gone
            projectiles.splice(i, 1);
            continue;
        }

        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < p.speed) {
            // Hit
            hitEnemy(t, p.damage);
            projectiles.splice(i, 1);
        } else {
            p.x += (dx / dist) * p.speed;
            p.y += (dy / dist) * p.speed;
        }
    }
}

function hitEnemy(enemy, damage) {
    if (enemy.frozen) damage *= 1.2;
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
        const index = enemies.indexOf(enemy);
        if (index > -1) {
            enemies.splice(index, 1);
            money += enemy.reward;

            // Track Lifetime Kills
            if (totalKills[enemy.type] !== undefined) {
                totalKills[enemy.type]++;
            }

            // Gain Energy
            energy = Math.min(maxEnergy, energy + 1);

            createParticles(enemy.x, enemy.y, enemy.color, 8);
            lightSources.push({ x: enemy.x, y: enemy.y, radius: 60, color: enemy.color, life: 1.0 });

            AudioEngine.playSFX('explosion');

            // Splitter Logic
            if (enemy.type === 'splitter') {
                spawnSubUnits(enemy);
            }

            updateUI();
            saveGame(); // Save on energy gain
        }
    }
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 1.0,
            color: color
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function updateUI() {
    document.getElementById('money-display').innerText = money;
    document.getElementById('lives-display').innerText = lives;
    document.getElementById('wave-display').innerText = wave;

    const count = spawnQueue.length + enemies.length;
    let typeText = '';

    if (isWaveActive && count > 0) {
        const counts = { BASIC: 0, FAST: 0, TANK: 0, BOSS: 0, MUTANT: 0, SPLITTER: 0, MINI: 0, BULWARK: 0, SHIFTER: 0 };

        // Count queue
        for (const t of spawnQueue) {
            const up = t.toUpperCase();
            if (t.startsWith('mutant_')) counts.MUTANT++;
            else if (counts[up] !== undefined) counts[up]++;
        }

        // Count active
        for (const e of enemies) {
            const up = (e.type || 'basic').toUpperCase();
            if (e.isMutant) counts.MUTANT++;
            else if (counts[up] !== undefined) counts[up]++;
        }

        let html = '';
        if (counts['BASIC']) html += `<div class="enemy-count-group" title="Basic"><div class="enemy-icon-small icon-basic"></div>${counts['BASIC']}</div>`;
        if (counts['FAST']) html += `<div class="enemy-count-group" title="Fast"><div class="enemy-icon-small icon-fast"></div>${counts['FAST']}</div>`;
        if (counts['TANK']) html += `<div class="enemy-count-group" title="Tank"><div class="enemy-icon-small icon-tank"></div>${counts['TANK']}</div>`;
        if (counts['SPLITTER']) html += `<div class="enemy-count-group" title="Splitter"><div class="enemy-icon-small icon-splitter"></div>${counts['SPLITTER']}</div>`;
        if (counts['MINI']) html += `<div class="enemy-count-group" title="Mini"><div class="enemy-icon-small icon-mini"></div>${counts['MINI']}</div>`;
        if (counts['BULWARK']) html += `<div class="enemy-count-group" title="Bulwark"><div class="enemy-icon-small icon-bulwark"></div>${counts['BULWARK']}</div>`;
        if (counts['SHIFTER']) html += `<div class="enemy-count-group" title="Shifter"><div class="enemy-icon-small icon-shifter"></div>${counts['SHIFTER']}</div>`;
        if (counts['BOSS']) html += `<div class="enemy-count-group" title="Boss"><div class="enemy-icon-small icon-boss"></div>${counts['BOSS']}</div>`;
        if (counts['MUTANT']) html += `<div class="enemy-count-group" title="Mutant"><div class="enemy-icon-small icon-mutant"></div>${counts['MUTANT']}</div>`;

        document.getElementById('enemy-info').innerHTML = html;
    } else {
        document.getElementById('enemy-info').innerText = 'CLEARED';
    }

    // Safety check
    if (!document.getElementById('enemy-info').innerHTML && isWaveActive) {
        document.getElementById('enemy-info').innerText = 'INCOMING...';
    }

    const timerEl = document.getElementById('timer-display');
    if (isWaveActive) {
        timerEl.innerText = 'WAVE ACTIVE';
        timerEl.style.color = '#ff4444';
    } else {
        timerEl.innerText = `NEXT WAVE: ${prepTimer}s`;
        timerEl.style.color = '#00ff41';
    }

    // --- Ability UI Synchronization ---
    const energyFill = document.getElementById('energy-bar-fill');
    const energyVal = document.getElementById('energy-value');
    if (energyFill) {
        energyFill.style.height = `${(energy / maxEnergy) * 100}%`;
        energyVal.innerText = `${Math.floor(energy)} / ${maxEnergy}`;
    }

    // Ability Slots
    for (let key in abilities) {
        const ability = abilities[key];
        const btn = document.getElementById(`ability-${key}`);
        if (btn) {
            const canAfford = energy >= ability.cost;
            const reloaded = ability.cooldown <= 0;
            const isActive = targetingAbility === key;

            btn.classList.toggle('disabled', !canAfford || !reloaded);
            btn.classList.toggle('active', isActive);

            // Optional: Cooldown overlay text?
            if (ability.cooldown > 0) {
                btn.setAttribute('data-cooldown', ability.cooldown);
            } else {
                btn.removeAttribute('data-cooldown');
            }
        }
    }
}

// --- Rendering ---

function draw() {
    // Update Screen Shake
    if (shakeAmount > 0) {
        shakeAmount *= 0.9; // Decay
        if (shakeAmount < 0.1) shakeAmount = 0;
    }

    // Clear Background
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Apply Camera + Shake
    const sx = (Math.random() - 0.5) * shakeAmount;
    const sy = (Math.random() - 0.5) * shakeAmount;
    ctx.translate(camera.x + sx, camera.y + sy);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw Grid (Infinite)
    // Calculate visible world bounds
    // screenX = worldX * zoom + cameraX  =>  worldX = (screenX - cameraX) / zoom
    const startX = Math.floor((-camera.x - sx) / camera.zoom / GRID_SIZE) * GRID_SIZE;
    const endX = Math.floor((width - camera.x - sx) / camera.zoom / GRID_SIZE + 1) * GRID_SIZE;
    const startY = Math.floor((-camera.y - sy) / camera.zoom / GRID_SIZE) * GRID_SIZE;
    const endY = Math.floor((height - camera.y - sy) / camera.zoom / GRID_SIZE + 1) * GRID_SIZE;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; // Slightly fainter for infinite grid
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Vertical lines
    for (let x = startX; x <= endX; x += GRID_SIZE) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
    }
    // Horizontal lines
    for (let y = startY; y <= endY; y += GRID_SIZE) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
    }
    ctx.stroke();



    // Draw Paths
    for (let pathData of paths) {
        const path = pathData.points;
        const riftLevel = pathData.level || 1;
        const mutation = pathData.mutation;

        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = GRID_SIZE * 0.8;
        ctx.shadowBlur = 10;

        let pathColor = mutation ? mutation.color : (riftLevel > 1 ? 'rgba(255, 0, 172, 0.4)' : 'rgba(0, 243, 255, 0.1)');
        ctx.shadowColor = pathColor;
        ctx.strokeStyle = mutation ? `${mutation.color}11` : (riftLevel > 1 ? 'rgba(255, 0, 172, 0.1)' : 'rgba(0, 243, 255, 0.05)');
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Center Line
        ctx.lineWidth = 2;
        ctx.strokeStyle = mutation ? mutation.color : (riftLevel > 1 ? '#ff00ac' : '#00f3ff');
        ctx.setLineDash([10, 10]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Spawn Point
        const spawn = path[0];
        const pulse = 1 + Math.sin(frameCount * 0.1) * 0.2;
        ctx.shadowBlur = 20 * pulse;

        const spawnColor = mutation ? mutation.color : (riftLevel > 1 ? '#ff00ac' : '#ff4444');
        ctx.shadowColor = spawnColor;
        ctx.fillStyle = spawnColor;

        ctx.beginPath();
        ctx.arc(spawn.x, spawn.y, 20 * (riftLevel > 1 || mutation ? 1.5 : 1) * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(spawn.x, spawn.y, 10, 0, Math.PI * 2);
        ctx.fill();

        // Level Pips (Aligned with Tower system)
        if (riftLevel > 1) {
            drawLevelPips(riftLevel, spawn.x, spawn.y + 30);
        }

        // Mutation Tag
        if (mutation) {
            ctx.fillStyle = mutation.color;
            ctx.font = 'bold 10px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(mutation.name, spawn.x, spawn.y - 30);
        }
    }

    // Draw Base (Core) - using end of first path (assume all lead to base)
    const base = paths[0].points[paths[0].points.length - 1]; // This should be safe now with center logic

    // Selection Ring for Base
    if (selectedBase) {
        ctx.beginPath();
        ctx.arc(base.x, base.y, 40, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Range indicator if upgraded
        if (baseLevel > 0) {
            const currentRange = baseRange + (baseLevel - 1) * 30;
            ctx.beginPath();
            ctx.arc(base.x, base.y, currentRange, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 255, 65, 0.1)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.3)';
            ctx.stroke();
        }
    }

    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00ff41'; // Green glow
    ctx.fillStyle = '#00ff41';   // Green core

    // Draw Crystal/Diamond Shape
    ctx.beginPath();
    ctx.moveTo(base.x, base.y - 18); // Top
    ctx.lineTo(base.x + 18, base.y); // Right
    ctx.lineTo(base.x, base.y + 18); // Bottom
    ctx.lineTo(base.x - 18, base.y); // Left
    ctx.fill();

    // Base Turret Visuals (if level > 0)
    if (baseLevel > 0) {
        // Distinct Look: Hexagon Forcefield + Drones
        const time = Date.now() / 800;

        // Draw Hexagon Shield - Multiple layers based on level
        const shieldLayers = Math.max(1, Math.floor(baseLevel / 3));
        for (let j = 0; j < shieldLayers; j++) {
            ctx.strokeStyle = '#00ff41';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.3 + (j * 0.2);
            ctx.beginPath();
            const radius = 22 + (j * 4);
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + time * (j % 2 === 0 ? 1 : -1);
                const hx = base.x + Math.cos(angle) * radius;
                const hy = base.y + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // Orbiting Defense Drones
        ctx.fillStyle = '#fff';
        const droneCount = baseLevel;
        for (let i = 0; i < droneCount; i++) {
            // Distribute drones in two orbits if many
            const orbitIndex = i < 5 ? 0 : 1;
            const orbitCount = i < 5 ? Math.min(droneCount, 5) : droneCount - 5;
            const orbitPos = i < 5 ? i : i - 5;

            const radius = orbitIndex === 0 ? 32 : 45;
            const orbitTime = orbitIndex === 0 ? time * 2 : -time * 1.5;

            const angle = orbitTime + (orbitPos * (Math.PI * 2 / orbitCount));
            const ox = base.x + Math.cos(angle) * radius;
            const oy = base.y + Math.sin(angle) * radius;

            ctx.beginPath();
            // Drone shape (triangle)
            ctx.moveTo(ox + Math.cos(angle) * 5, oy + Math.sin(angle) * 5);
            ctx.lineTo(ox + Math.cos(angle + 2.5) * 5, oy + Math.sin(angle + 2.5) * 5);
            ctx.lineTo(ox + Math.cos(angle - 2.5) * 5, oy + Math.sin(angle - 2.5) * 5);
            ctx.fill();
        }
    }

    // Core pulsing effect
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.3;
    ctx.beginPath();
    ctx.arc(base.x, base.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Draw Build Target Selection
    if (buildTarget) {
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        const btx = buildTarget.x - GRID_SIZE / 2;
        const bty = buildTarget.y - GRID_SIZE / 2;

        // pulsing
        const p = (Math.sin(frameCount * 0.2) + 1) / 2; // 0 to 1
        const gap = 5 + p * 5;

        // Corners style
        ctx.beginPath();
        // Top-Left
        ctx.moveTo(btx + 10, bty); ctx.lineTo(btx, bty); ctx.lineTo(btx, bty + 10);
        // Top-Right
        ctx.moveTo(btx + GRID_SIZE - 10, bty); ctx.lineTo(btx + GRID_SIZE, bty); ctx.lineTo(btx + GRID_SIZE, bty + 10);
        // Bot-Right
        ctx.moveTo(btx + GRID_SIZE, bty + GRID_SIZE - 10); ctx.lineTo(btx + GRID_SIZE, bty + GRID_SIZE); ctx.lineTo(btx + GRID_SIZE - 10, bty + GRID_SIZE);
        // Bot-Left
        ctx.moveTo(btx, bty + GRID_SIZE - 10); ctx.lineTo(btx, bty + GRID_SIZE); ctx.lineTo(btx + 10, bty + GRID_SIZE);

        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 243, 255, 0.2)';
        ctx.fillRect(btx, bty, GRID_SIZE, GRID_SIZE);
    }

    // Draw Towers
    for (let t of towers) {
        drawTowerOne(t.type, t.x, t.y, t.color);
        // Draw Level Pips
        if (t.level > 1) {
            drawLevelPips(t.level, t.x, t.y + 20);
        }
    }

    // Rift Selection Ring
    if (selectedRift) {
        const spawn = selectedRift.points[0];
        ctx.beginPath();
        ctx.arc(spawn.x, spawn.y, 40, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff00ac';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }


    // Draw Enemies
    for (let e of enemies) {
        ctx.save();

        let alpha = 1.0;
        if (e.type === 'shifter' && e.isInvisible) {
            alpha = 0.2; // Very transparent
        }
        ctx.globalAlpha = alpha;

        ctx.fillStyle = e.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = e.color;

        ctx.beginPath();
        if (e.type === 'tank') {
            ctx.rect(e.x - 10, e.y - 10, 20, 20);
        } else if (e.type === 'fast') {
            // Vertical Kite / Diamond (Looks better moving in all directions)
            ctx.moveTo(e.x, e.y - 12); // Top
            ctx.lineTo(e.x + 6, e.y);  // Right
            ctx.lineTo(e.x, e.y + 8);  // Bottom
            ctx.lineTo(e.x - 6, e.y);  // Left
        } else if (e.type === 'boss') {
            // Hexagon
            const size = e.width / 2;
            ctx.moveTo(e.x + size * Math.cos(0), e.y + size * Math.sin(0));
            for (let i = 1; i <= 6; i++) {
                ctx.lineTo(e.x + size * Math.cos(i * 2 * Math.PI / 6), e.y + size * Math.sin(i * 2 * Math.PI / 6));
            }
        } else if (e.type === 'healer') {
            // Circle with a pulsing outer ring
            ctx.arc(e.x, e.y, 14, 0, Math.PI * 2);
            ctx.fill();
            if (frameCount % 60 < 20) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.arc(e.x, e.y, 18, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (e.type === 'splitter') {
            // Triangle with a "cluster" look
            ctx.moveTo(e.x, e.y - 14);
            ctx.lineTo(e.x + 12, e.y + 10);
            ctx.lineTo(e.x - 12, e.y + 10);
            ctx.closePath();
        } else if (e.type === 'mini') {
            // Small fast dot
            ctx.arc(e.x, e.y, 6, 0, Math.PI * 2);
        } else {
            // Basic
            ctx.arc(e.x, e.y, e.width ? e.width / 2 : 10, 0, Math.PI * 2);
        }
        ctx.fill();

        // Restore context to reset alpha for health bar etc.
        ctx.globalAlpha = 1.0;

        // Elite Visuals (Veteran Rifts)
        if (e.riftLevel > 1) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(e.x, e.y, (e.width ? e.width / 2 : 10) + 4 + Math.sin(frameCount * 0.2) * 2, 0, Math.PI * 2);
            ctx.setLineDash([2, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Text indicator for very high tiers
            if (e.riftLevel >= 3) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px Orbitron';
                ctx.fillText(`ELITE`, e.x, e.y - 15);
            }
        }

        // Health bar
        const hpPct = e.hp / e.maxHp;
        ctx.fillStyle = 'red';
        ctx.fillRect(e.x - 10, e.y - 15, 20, 3);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(e.x - 10, e.y - 15, 20 * hpPct, 3);

        ctx.restore();
    }

    // Draw Projectiles
    for (let p of projectiles) {
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Particles
    for (let p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
        ctx.globalAlpha = 1.0;
    }

    // Draw Placement Preview


    // --- Ability Targeting Visuals ---
    if (targetingAbility === 'emp') {
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, abilities.emp.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 243, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = 'var(--neon-blue)';
        ctx.setLineDash([2, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Target crosshair
        ctx.beginPath();
        ctx.moveTo(mouseX - 20, mouseY); ctx.lineTo(mouseX + 20, mouseY);
        ctx.moveTo(mouseX, mouseY - 20); ctx.lineTo(mouseX, mouseY + 20);
        ctx.stroke();
    } else if (targetingAbility === 'overclock') {
        // Highlighting for tower targeting
        ctx.strokeStyle = 'var(--neon-yellow)';
        ctx.setLineDash([5, 2]);
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // --- Entity Status Visuals ---
    // Frozen pulse on enemies
    enemies.forEach(e => {
        if (e.frozen) {
            ctx.strokeStyle = '#00f3ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(e.x, e.y, (e.width / 2) + 2, 0, Math.PI * 2);
            ctx.stroke();
            // Frosty overlay
            ctx.fillStyle = 'rgba(0, 243, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Overclock pulse on towers
    towers.forEach(t => {
        if (t.overclocked) {
            ctx.strokeStyle = '#fcee0a';
            ctx.lineWidth = 2;
            const pulse = 1 + Math.sin(frameCount * 0.5) * 0.2;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 20 * pulse, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 18 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    });

    // --- Dynamic Lighting Rendering ---
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const light of lightSources) {
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
        gradient.addColorStop(0, light.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.globalAlpha = light.life * 0.5;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.restore(); // Restore from camera transform

    // Re-apply camera transform for UI overlays so they match world coordinates
    ctx.save();
    ctx.translate(camera.x + sx, camera.y + sy);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw Placement Preview (Overlay on top of lighting)
    if (isHovering && gameState === 'playing' && selectedTowerType) {
        const towerConfig = TOWERS[selectedTowerType];

        // Use validation logic to get snapped coordinates
        const validation = isValidPlacement(mouseX, mouseY, towerConfig);
        const snap = validation.snap || snapToGrid(mouseX, mouseY);

        ctx.save();

        // Grid Highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(snap.x - GRID_SIZE / 2, snap.y - GRID_SIZE / 2, GRID_SIZE, GRID_SIZE);

        // Range Indicator
        ctx.beginPath();
        ctx.arc(snap.x, snap.y, towerConfig.range, 0, Math.PI * 2);
        ctx.fillStyle = validation.valid ? 'rgba(0, 255, 65, 0.1)' : 'rgba(255, 0, 0, 0.1)';
        ctx.fill();
        ctx.strokeStyle = validation.valid ? 'rgba(0, 255, 65, 0.5)' : 'rgba(255, 0, 0, 0.5)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();

        // Tower Ghost
        ctx.globalAlpha = 0.5;
        const color = validation.valid ? towerConfig.color : '#ff0000';
        drawTowerOne(selectedTowerType, snap.x, snap.y, color);

        ctx.restore();
    }

    // Draw Selection Ring
    if (selectedPlacedTower) {
        ctx.beginPath();
        ctx.arc(selectedPlacedTower.x, selectedPlacedTower.y, selectedPlacedTower.range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.strokeRect(selectedPlacedTower.x - 18, selectedPlacedTower.y - 18, 36, 36);
    }

    ctx.restore(); // End UI overlay transform

    ctx.shadowBlur = 0;
}

window.resetCamera = function () {
    if (paths.length > 0) {
        const p = paths[0].points;
        const base = p[p.length - 1];

        camera.zoom = 1;
        camera.x = (width / 2) - (base.x * camera.zoom);
        camera.y = (height / 2) - (base.y * camera.zoom);
    } else {
        camera.x = 0;
        camera.y = 0;
        camera.zoom = 1;
    }
};

function drawTowerOne(type, x, y, color) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;

    ctx.beginPath();
    if (type === 'basic') {
        // Square
        ctx.rect(x - 13, y - 13, 26, 26);
    } else if (type === 'rapid') {
        // Circle
        ctx.arc(x, y, 13, 0, Math.PI * 2);
    } else if (type === 'sniper') {
        // Diamond (Rotated Square)
        ctx.moveTo(x, y - 15);
        ctx.lineTo(x + 15, y);
        ctx.lineTo(x, y + 15);
        ctx.lineTo(x - 15, y);
    }
    ctx.fill();
}

function drawLevelPips(level, x, y) {
    const fives = Math.floor(level / 5);
    const ones = level % 5;

    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#fff';

    // Config
    const fiveRadius = 4; // Diamond size
    const oneRadius = 2;  // Dot size
    const gap = 5;

    // Calculate total width
    // Width of a diamond = fiveRadius * 2
    // Width of a dot = oneRadius * 2
    let totalW = (fives * (fiveRadius * 2)) + (ones * (oneRadius * 2));
    // Add gaps
    const totalItems = fives + ones;
    if (totalItems > 1) {
        totalW += (totalItems - 1) * gap;
    }

    let currentX = x - totalW / 2;
    const posY = y;

    // Draw Fives (Diamonds)
    for (let i = 0; i < fives; i++) {
        const cx = currentX + fiveRadius;

        ctx.beginPath();
        ctx.moveTo(cx, y - fiveRadius); // Top
        ctx.lineTo(cx + fiveRadius, y); // Right
        ctx.lineTo(cx, y + fiveRadius); // Bottom
        ctx.lineTo(cx - fiveRadius, y); // Left
        ctx.fill();

        currentX += (fiveRadius * 2) + gap;
    }

    // Draw Ones (Dots)
    for (let i = 0; i < ones; i++) {
        const cx = currentX + oneRadius;

        ctx.beginPath();
        ctx.arc(cx, y, oneRadius, 0, Math.PI * 2);
        ctx.fill();

        currentX += (oneRadius * 2) + gap;
    }

    ctx.shadowBlur = 0;
}

// Helper: Distance from point (px,py) to segment (x1,y1)-(x2,y2)
function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}
