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

const ENEMIES = {
    basic: { hp: 30, speed: 1.5, color: '#ff0000', reward: 10, width: 20 },
    fast: { hp: 20, speed: 2.5, color: '#ffff00', reward: 15, width: 16 },
    tank: { hp: 100, speed: 0.8, color: '#ff00ff', reward: 30, width: 24 },
    boss: { hp: 500, speed: 0.5, color: '#ff8800', reward: 200, width: 40 }
};

// --- Game State ---
let canvas, ctx;
let width, height;
let lastTime = 0;
let gameState = 'start'; // start, playing, gameover
let wave = 1;
let money = 100;
let lives = 20;

let selectedTowerType = null; // null means we might be selecting an existing tower
let selectedPlacedTower = null; // Reference to a placed tower object
let selectedRift = null; // Reference to a selected rift object

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

// --- Wave State ---
let isWaveActive = false;
let prepTimer = 30; // seconds
let frameCount = 0;


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
        normal: {
            lead: ['C4', 'E4', 'G4', 0, 'F4', 'A4', 'C5', 0, 'G4', 'B4', 'D5', 0, 'C5', 'G4', 'E4', 'D4'],
            bass: ['C2', 0, 'G2', 'C2', 'F2', 0, 'C3', 'F2', 'G2', 0, 'D3', 'G2', 'C2', 'G2', 'E2', 'D2']
        },
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
        localStorage.setItem('neonAudioSettings', JSON.stringify({ music: this.musicVol, sfx: this.sfxVol }));
    },

    loadSettings() {
        const saved = localStorage.getItem('neonAudioSettings');
        if (saved) {
            const data = JSON.parse(saved);
            this.musicVol = data.music ?? 0.5;
            this.sfxVol = data.sfx ?? 0.7;
        }
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.1);
        }
        return this.isMuted;
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

        if (this.musicType === targetType) return;
        this.musicType = targetType;
        this.musicStep = 0;

        if (this.currentMusic) clearInterval(this.currentMusic);

        const stepTime = targetType === 'threat' ? 0.125 : 0.2; // 16th note equivalent
        const melody = this.melodies[targetType];

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
        newZoom = Math.max(0.5, Math.min(newZoom, 1.5));

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

    // Touch support (Basic tap) - Touches need similar transform
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const rawX = touch.clientX - rect.left;
            const rawY = touch.clientY - rect.top;

            const worldPos = screenToWorld(rawX, rawY);
            mouseX = worldPos.x;
            mouseY = worldPos.y;

            handleClick();
            isHovering = false; // sticky hover on touch is annoying
        }
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
    // Base is at center
    const cols = Math.floor(width / GRID_SIZE);
    const rows = Math.floor(height / GRID_SIZE);
    const baseX = Math.floor(cols / 2) * GRID_SIZE + GRID_SIZE / 2;
    const baseY = Math.floor(rows / 2) * GRID_SIZE + GRID_SIZE / 2;

    if (Math.hypot(mouseX - baseX, mouseY - baseY) < 30) {
        selectBase();
        return;
    }

    // If not clicking a tower, attempt to BUILD if one is selected
    if (selectedTowerType) {
        buildTower(mouseX, mouseY);
        return;
    }

    // If clicking on empty space (no tower, no build), deselect
    deselectTower();
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
        // Use base world coordinates for particles
        const cols = Math.floor(width / GRID_SIZE);
        const rows = Math.floor(height / GRID_SIZE);
        const baseX = Math.floor(cols / 2) * GRID_SIZE + GRID_SIZE / 2;
        const baseY = Math.floor(rows / 2) * GRID_SIZE + GRID_SIZE / 2;
        createParticles(baseX, baseY, '#00ff41', 20); // Green heal
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
        // Use base world coordinates for particles
        const cols = Math.floor(width / GRID_SIZE);
        const rows = Math.floor(height / GRID_SIZE);
        const baseX = Math.floor(cols / 2) * GRID_SIZE + GRID_SIZE / 2;
        const baseY = Math.floor(rows / 2) * GRID_SIZE + GRID_SIZE / 2;
        createParticles(baseX, baseY, '#00f3ff', 30); // Blue upgrade
        AudioEngine.playSFX('build');
        updateUI();
        updateSelectionUI();
    }
}

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    calculatePath();
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

window.togglePause = function () {
    AudioEngine.init();
    if (gameState !== 'playing') return;
    isPaused = !isPaused;

    const menu = document.getElementById('pause-menu');
    if (isPaused) {
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
};

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
    const text = `SOUND: ${muted ? 'OFF' : 'ON'}`;
    if (document.getElementById('mute-btn-hud')) document.getElementById('mute-btn-hud').innerText = text;
    if (document.getElementById('mute-btn-pause')) document.getElementById('mute-btn-pause').innerText = text;
    if (document.getElementById('master-mute-btn')) document.getElementById('master-mute-btn').innerText = text;
};

window.setMusicVolume = function (val) {
    AudioEngine.setVolume('music', val);
};

window.setSFXVolume = function (val) {
    AudioEngine.setVolume('sfx', val);
};

window.saveGame = function () {
    if (gameState !== 'playing') return;

    // Simple serialization
    const data = {
        money, lives, wave, isWaveActive, prepTimer, spawnQueue, paths,
        towers: towers.map(t => ({
            type: t.type, x: t.x, y: t.y, level: t.level,
            damage: t.damage, range: t.range, cooldown: t.cooldown, maxCooldown: t.maxCooldown,
            color: t.color, cost: t.cost, totalCost: t.totalCost
        })),
        baseLevel, baseCooldown
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

    // Restore towers
    towers = data.towers.map(t => ({
        ...t,
        cooldown: t.cooldown || 0, // Ensure cooldown is set
        maxCooldown: t.maxCooldown || t.cooldown // Ensure maxCooldown is set, fallback to current cooldown if not saved
    }));

    // Reset transient state
    enemies = [];
    projectiles = [];
    particles = [];
    selectedPlacedTower = null;
    selectedTowerType = null;
    selectedBase = false; // Ensure base is not selected on load

    document.getElementById('start-screen').classList.add('hidden');
    gameState = 'playing';

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

function resetGameLogic() {
    money = 100;
    lives = 20;
    wave = 1;
    baseLevel = 0; // Reset base
    towers = [];
    selectedPlacedTower = null;
    selectedBase = false;
    selectedTowerType = 'basic'; // Reset to build mode by default
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
            if (r < 0.3) type = 'fast';
            else if (r < 0.5) type = 'tank';
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

    enemies.push({
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
    });
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];

        // Move towards next waypoint
        const path = e.currentPath || paths[0].points;
        const target = path[e.pathIndex + 1];
        if (!target) {
            // Reached end
            lives--;
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
    }
}

function updateTowers() {
    // Update Towers
    for (let t of towers) {
        if (t.cooldown > 0) t.cooldown--;

        // Find Target
        // Simple: closest enemy in range
        const range = t.range;
        let target = null;
        let minDist = Infinity;

        for (let e of enemies) {
            const dist = Math.hypot(e.x - t.x, e.y - t.y);
            if (dist <= range && dist < minDist) {
                target = e;
                minDist = dist;
            }
        }

        if (target && t.cooldown <= 0) {
            shoot(t, target);
            t.cooldown = t.maxCooldown;
        }
    }

    // Base Turret Logic
    if (baseLevel > 0) {
        const cols = Math.floor(width / GRID_SIZE);
        const rows = Math.floor(height / GRID_SIZE);
        const baseX = Math.floor(cols / 2) * GRID_SIZE + GRID_SIZE / 2;
        const baseY = Math.floor(rows / 2) * GRID_SIZE + GRID_SIZE / 2;

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
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
        const index = enemies.indexOf(enemy);
        if (index > -1) {
            enemies.splice(index, 1);
            money += enemy.reward;
            createParticles(enemy.x, enemy.y, enemy.color, 8);
            AudioEngine.playSFX('explosion');
            updateUI();
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
        const counts = { BASIC: 0, FAST: 0, TANK: 0, BOSS: 0, MUTANT: 0 };

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
        if (counts['BASIC']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-basic"></div>${counts['BASIC']}</div>`;
        if (counts['FAST']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-fast"></div>${counts['FAST']}</div>`;
        if (counts['TANK']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-tank"></div>${counts['TANK']}</div>`;
        if (counts['BOSS']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-boss"></div>${counts['BOSS']}</div>`;
        if (counts['MUTANT']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-mutant"></div>${counts['MUTANT']}</div>`;

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
}

// --- Rendering ---

function draw() {
    // Clear Background (Fill whole canvas regardless of camera)
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Apply Camera
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw Grid (Infinite feel? Or just huge?)
    // Drawing just the game bounds grid for now, but extending it a bit might be nice
    // Or just draw the normal grid, and since we pan "infinite", users see empty space outside
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += GRID_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += GRID_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw World Borders (to show where grid ends)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

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

        // Level text
        if (riftLevel > 1) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(`T${riftLevel}`, spawn.x, spawn.y + 4);
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

    // Draw Towers
    for (let t of towers) {
        drawTowerOne(t.type, t.x, t.y, t.color);
        // Draw Level Pips
        if (t.level > 1) {
            drawLevelPips(t);
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
        } else {
            // Basic
            ctx.arc(e.x, e.y, e.width ? e.width / 2 : 10, 0, Math.PI * 2);
        }
        ctx.fill();

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

    ctx.restore(); // Restore from camera transform

    ctx.shadowBlur = 0;
}

window.resetCamera = function () {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
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

function drawLevelPips(t) {
    const level = t.level;
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

    let currentX = t.x - totalW / 2;
    const y = t.y + 20;

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
