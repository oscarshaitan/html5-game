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

let towers = [];
let enemies = [];
let projectiles = [];
let particles = [];
let paths = []; // Array of arrays of points

let spawnQueue = []; // New: Array of enemy types to spawn
let spawnTimer = 0;
let waveTimer = 0;
let currentEnemyType = 'basic'; // kept for potential legacy checks but main logic uses queue

// --- New State for Hover ---
let mouseX = 0;
let mouseY = 0;
let isHovering = false;

// --- Wave State ---
let isWaveActive = false;
let prepTimer = 30; // seconds
let frameCount = 0;

let isPaused = false;

// --- Initialization ---
window.onload = () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

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

    // Interactions
    // Interactions
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        isHovering = true;
    });

    canvas.addEventListener('mouseout', () => {
        isHovering = false;
    });

    canvas.addEventListener('mousedown', (e) => {
        handleInput(e);
    });

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling
        isHovering = false; // Disable hover on touch to avoid stuck ghosts
        handleInput(e.touches[0]);
    }, { passive: false });

    // Hotkeys
    window.addEventListener('keydown', (e) => {
        if (gameState !== 'playing') return;

        switch (e.key.toLowerCase()) {
            case 'q': selectTower('basic'); break;
            case 'w': selectTower('rapid'); break;
            case 'e': selectTower('sniper'); break;
            case 'escape':
                if (selectedPlacedTower) deselectTower();
                else togglePause();
                break;
        }
    });

    // Start Loop
    requestAnimationFrame(gameLoop);
};

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
    // Generate a path that aligns with the grid
    const w = width;
    const h = height;

    // Grid
    const cols = width / GRID_SIZE;
    const rows = height / GRID_SIZE;

    // Initial Path (Simple winding path)
    // Start top left, go right, down, left, down, right
    paths = [];
    const mainPath = [];
    mainPath.push({ x: 20, y: 20 }); // Start
    mainPath.push({ x: width - 60, y: 20 });
    mainPath.push({ x: width - 60, y: height / 2 });
    mainPath.push({ x: 60, y: height / 2 });
    mainPath.push({ x: 60, y: height - 60 });
    mainPath.push({ x: width - 20, y: height - 60 }); // End (Base)
    paths.push(mainPath);
}

// --- Game Control ---

window.startGame = function () {
    document.getElementById('start-screen').classList.add('hidden');
    resetGameLogic();
    gameState = 'playing';
    saveGame();
};

window.resetGame = function () {
    // This is "Game Over" restart aka System Reboot
    // We can just wipe save and start fresh
    fullReset();
};

window.fullReset = function () {
    localStorage.removeItem('neonDefenseSave');
    location.reload();
};

window.togglePause = function () {
    if (gameState !== 'playing') return;
    isPaused = !isPaused;

    const menu = document.getElementById('pause-menu');
    if (isPaused) {
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
};

window.saveGame = function () {
    if (gameState !== 'playing') return;

    // Simple serialization
    const data = {
        money, lives, wave, isWaveActive, prepTimer, spawnQueue, paths,
        towers: towers.map(t => ({
            type: t.type, x: t.x, y: t.y, level: t.level,
            damage: t.damage, range: t.range, cooldown: t.cooldown,
            color: t.color, cost: t.cost, totalCost: t.totalCost
        }))
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
    paths = data.paths || paths; // Load paths or keep default if missing (backward compatibility)

    // Restore towers
    towers = data.towers.map(t => ({
        ...t,
        lastShot: 0
    }));

    // Reset transient state
    enemies = [];
    projectiles = [];
    particles = [];
    selectedPlacedTower = null;
    selectedTowerType = null;

    document.getElementById('start-screen').classList.add('hidden');
    gameState = 'playing';

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
    towers = [];
    selectedPlacedTower = null;
    selectedTowerType = 'basic'; // Reset to build mode by default
    document.getElementById('selection-panel').classList.add('hidden');
    selectTower('basic');

    enemies = [];
    projectiles = [];
    particles = [];
    spawnQueue = []; // Clear spawn queue on reset

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
}

window.skipPrep = function () {
    startWave();
};

function startWave() {
    isWaveActive = true;
    prepTimer = 0;
    document.getElementById('skip-btn').style.display = 'none';

    saveGame(); // Save on wave start

    waveTimer = 0;
    spawnTimer = 0;
    // Generate Mixed Wave
    spawnQueue = [];
    const baseCount = 5 + Math.floor(wave * 2.5); // INCREASED DIFFICULTY

    for (let i = 0; i < baseCount; i++) {
        let type = 'basic';
        const r = Math.random();

        if (wave < 3) {
            type = 'basic';
        } else if (wave < 5) {
            // Mix of basic and fast
            type = r < 0.3 ? 'fast' : 'basic';
        } else if (wave < 10) {
            // Basic, Fast, Tank introduction
            if (wave % 5 === 0 && i < 2) type = 'tank'; // Guaranteed tanks on multiples of 5
            else if (r < 0.2) type = 'fast';
            else if (r < 0.25) type = 'tank';
            else type = 'basic';
        } else {
            // High waves: chaotic mix
            if (r < 0.3) type = 'fast';
            else if (r < 0.5) type = 'tank';
            else type = 'basic';
        }
        spawnQueue.push(type);
    }

    // Boss Every 10 Waves
    if (wave % 10 === 0) {
        // Insert boss at random position
        const randomIndex = Math.floor(Math.random() * (spawnQueue.length + 1));
        spawnQueue.splice(randomIndex, 0, 'boss');
    }

    // Dynamic Path Generation (After Wave 10)
    if (wave > 10 && Math.random() < 0.5) {
        generateNewPath();
    }

    // Sort queue slightly so tanks come last (harder)
    // spawnQueue.sort((a,b) => (a === 'tank' ? 1 : -1)); 

    updateUI();
}

function generateNewPath() {
    // Attempt to generate a new path from a random edge point to an existing path point
    // Simple BFS on the grid

    // 1. Pick Start (Top, Left, Right edges)
    const side = Math.floor(Math.random() * 3); // 0: Top, 1: Left, 2: Right
    let startNode;
    const cols = width / GRID_SIZE;
    const rows = height / GRID_SIZE;

    if (side === 0) startNode = { c: Math.floor(Math.random() * cols), r: 0 };
    else if (side === 1) startNode = { c: 0, r: Math.floor(Math.random() * rows) };
    else startNode = { c: cols - 1, r: Math.floor(Math.random() * rows) };

    // Ensure start isn't too close to existing starts? (Skipped for simplicity)

    // 2. Pick End (Any point on the MAIN path, preferably later half)
    const mainPath = paths[0];
    // Find a grid cell corresponding to a point on the main path
    // Let's just target the BASE for guaranteed convergence if we can find it
    // Or target a random waypoint on the main path
    const targetWaypoint = mainPath[Math.floor(mainPath.length / 2) + Math.floor(Math.random() * (mainPath.length / 2))];
    const endNode = {
        c: Math.floor(targetWaypoint.x / GRID_SIZE),
        r: Math.floor(targetWaypoint.y / GRID_SIZE)
    };

    // 3. BFS
    // Build grid map of obstacles (Towers)
    const grid = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) grid[r][c] = 0; // 0 = empty, 1 = obstacle
    }
    for (let t of towers) {
        let tc = Math.floor(t.x / GRID_SIZE);
        let tr = Math.floor(t.y / GRID_SIZE);
        if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) grid[tr][tc] = 1;
    }

    const queue = [];
    queue.push({ c: startNode.c, r: startNode.r, parent: null });
    const visited = new Set();
    visited.add(`${startNode.c},${startNode.r}`);

    let foundPath = null;

    while (queue.length > 0) {
        const curr = queue.shift();

        // Check if close to existing path? For now just reach target
        if (curr.c === endNode.c && curr.r === endNode.r) {
            foundPath = curr;
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

    if (foundPath) {
        // Reconstruct
        const newPathPoints = [];
        let curr = foundPath;
        while (curr) {
            newPathPoints.unshift({
                x: curr.c * GRID_SIZE + GRID_SIZE / 2,
                y: curr.r * GRID_SIZE + GRID_SIZE / 2
            });
            curr = curr.parent;
        }
        // Append the rest of the main path from the connection point
        // Optimally we'd merge, but for now just having a path to the target waypoint is enough
        // The enemies will just follow this new path to the end node. 
        // If end node is mid-way in main path, we need to append the rest of main path to this new path? 
        // Actually, let's just make the new path go all the way to base if BFS found it.
        // Wait, BFS found path to 'endNode' which is on the main path.
        // So we should append points from main path after 'endNode' index.
        // For simplicity, let's just add the path we found. It connects to the main path.

        // BUT enemies need to know where to go AFTER reaching endNode.
        // Simple hack: Add the rest of the main waypoints to this new path
        // Find index of targetWaypoint in mainPath
        const idx = mainPath.indexOf(targetWaypoint);
        if (idx !== -1) {
            for (let i = idx + 1; i < mainPath.length; i++) {
                newPathPoints.push(mainPath[i]);
            }
        }

        paths.push(newPathPoints);

        // Notify
        // console.log("New Path Added!");
        // Visual flare?
    }
}

window.selectTower = function (type) {
    selectedTowerType = type;
    selectedPlacedTower = null; // Deselect existing tower
    document.getElementById('selection-panel').classList.add('hidden');

    document.querySelectorAll('.tower-selector').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.tower-selector[data-type="${type}"]`).classList.add('selected');
};

window.deselectTower = function () {
    selectedPlacedTower = null;
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
    if (!selectedPlacedTower) {
        document.getElementById('selection-panel').classList.add('hidden');
        return;
    }
    const t = selectedPlacedTower;

    document.getElementById('sel-type').innerText = `Type: ${t.type.toUpperCase()}`;
    document.getElementById('sel-level').innerText = `Level: ${t.level}`;
    document.getElementById('sel-damage').innerText = `Damage: ${Math.floor(t.damage)}`;
    document.getElementById('sel-range').innerText = `Range: ${Math.floor(t.range)}`;

    document.getElementById('upgrade-cost').innerText = `($${getUpgradeCost(t)})`;
    document.getElementById('sell-refund').innerText = `($${Math.floor(t.totalCost * 0.7)})`;

    const panel = document.getElementById('selection-panel');
    panel.classList.remove('hidden');

    // Fixed positioning handled by CSS now
    panel.style.left = '';
    panel.style.top = '';
    panel.style.transform = '';
}

function isValidPlacement(x, y, towerConfig) {
    const snap = snapToGrid(x, y);

    // Check UI bounds (approximate) - don't place under controls
    if (snap.y > height - 100 || snap.y < 60) return { valid: false, reason: 'ui' };

    // Check cost
    if (money < towerConfig.cost) return { valid: false, reason: 'cost' };

    // Check collision with path
    // Since everything is grid based, we can just check if the point intersects the path segments with a box check
    const tolerance = GRID_SIZE / 2; // Exact hit

    for (const path of paths) {
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

function handleInput(e) {
    if (gameState !== 'playing') return;

    let clientX, clientY;
    if (e.clientX !== undefined) {
        clientX = e.clientX;
        clientY = e.clientY;
    } else {
        clientX = e.clientX || 0;
        clientY = e.clientY || 0;
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // 1. Check if clicking UI (handled by DOM, but safeguard)

    // 2. Check if clicking an EXISTING TOWER
    for (let t of towers) {
        if (Math.abs(t.x - clickX) < 20 && Math.abs(t.y - clickY) < 20) {
            // Clicked a tower
            selectedPlacedTower = t;
            selectedTowerType = null; // Disable placement mode
            document.querySelectorAll('.tower-selector').forEach(el => el.classList.remove('selected'));
            updateSelectionUI();
            return;
        }
    }

    // 3. If in placement mode, try to place
    if (selectedTowerType) {
        const towerConfig = TOWERS[selectedTowerType];
        const validation = isValidPlacement(clickX, clickY, towerConfig);

        if (!validation.valid) {
            if (validation.reason === 'path' || validation.reason === 'tower') {
                createParticles(validation.snap ? validation.snap.x : clickX, validation.snap ? validation.snap.y : clickY, '#ff0000', 5);
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
            lastShot: 0
        });

        createParticles(validation.snap.x, validation.snap.y, towerConfig.color, 10);
        updateUI();
        saveGame(); // Save on build
    } else {
        // Not placing, and didn't click tower -> Deselect
        deselectTower();
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
        document.getElementById('game-over-screen').classList.remove('hidden');
    }
}

function spawnEnemy() {
    if (spawnQueue.length === 0) return;
    const enemyType = spawnQueue.shift(); // Get next enemy type from the queue
    const config = ENEMIES[enemyType];

    // Scale hp with wave
    const hp = config.hp * (1 + (wave * 0.4)); // INCREASED DIFFICULTY (was 0.2)

    // Pick a random path
    const pathIndex = Math.floor(Math.random() * paths.length);
    const chosenPath = paths[pathIndex];

    enemies.push({
        ...config,
        maxHp: hp,
        hp: hp,
        pathIndex: 0,
        x: chosenPath[0].x,
        y: chosenPath[0].y,
        currentPath: chosenPath, // Store reference to path
        frozen: 0,
        type: enemyType // Store the type for drawing/logic
    });
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];

        // Move towards next waypoint
        // Use e.currentPath instead of global waypoints
        const path = e.currentPath || paths[0]; // Fallback
        const target = path[e.pathIndex + 1];
        if (!target) {
            // Reached end
            lives--;
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
    for (let t of towers) {
        t.lastShot++;
        if (t.lastShot >= t.cooldown) {
            // Find target
            // Simple: First enemy in range
            let target = null;
            let maxDist = -1; // or closest to end? let's do closest to tower for now for simplicity or 'first'

            // find 'first' enemy in range (closest to finishing path usually means highest pathIndex)
            // A better heuristic is distance traveled, but let's stick to simple range check

            for (let e of enemies) {
                const dist = Math.hypot(e.x - t.x, e.y - t.y);
                if (dist <= t.range) {
                    target = e;
                    break; // Target first found
                }
            }

            if (target) {
                shoot(t, target);
                t.lastShot = 0;
            }
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
        const counts = {};
        // Count queue
        for (const t of spawnQueue) counts[t.toUpperCase()] = (counts[t.toUpperCase()] || 0) + 1;
        // Count active
        for (const e of enemies) {
            const t = e.type.toUpperCase();
            counts[t] = (counts[t] || 0) + 1;
        }

        let html = '';
        if (counts['BASIC']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-basic"></div>${counts['BASIC']}</div>`;
        if (counts['FAST']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-fast"></div>${counts['FAST']}</div>`;
        if (counts['TANK']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-tank"></div>${counts['TANK']}</div>`;
        if (counts['BOSS']) html += `<div class="enemy-count-group"><div class="enemy-icon-small icon-boss"></div>${counts['BOSS']}</div>`;

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
    // Clear Background
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);

    // Draw Grid (Faint)
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

    // Draw Paths
    for (let path of paths) {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = GRID_SIZE * 0.8;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0, 243, 255, 0.1)'; // Faint glow for all
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Center Line
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00f3ff';
        ctx.setLineDash([10, 10]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Spawn Point
        const spawn = path[0];
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff4444';
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(spawn.x, spawn.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(spawn.x, spawn.y, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Base (Core) - using end of first path (assume all lead to base)
    const base = paths[0][paths[0].length - 1];
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00f3ff';
    ctx.fillStyle = '#00f3ff'; // Blue core
    ctx.beginPath();
    ctx.rect(base.x - 15, base.y - 15, 30, 30);
    ctx.fill();
    // Core pulsing effect
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.3;
    ctx.beginPath();
    ctx.rect(base.x - 8, base.y - 8, 16, 16);
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

    // Draw Enemies
    for (let e of enemies) {
        ctx.fillStyle = e.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = e.color;

        ctx.beginPath();
        if (e.type === 'tank') {
            ctx.rect(e.x - 10, e.y - 10, 20, 20);
        } else if (e.type === 'fast') {
            ctx.moveTo(e.x + 10, e.y);
            ctx.lineTo(e.x - 5, e.y + 5);
            ctx.lineTo(e.x - 5, e.y - 5);
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(selectedPlacedTower.x - 18, selectedPlacedTower.y - 18, 36, 36);
    }

    ctx.shadowBlur = 0;
}

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
