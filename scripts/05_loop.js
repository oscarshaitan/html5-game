// --- Main Loop ---
let updateParticleBudgetUsed = false;
const UI_SYNC_INTERVAL_FRAMES = 6;
let nextUISyncFrame = 0;
let lastBuildAffordMoney = null;
let lastFrameDtMs = 16.7;
let towerSelectorNodes = null;
const AUTO_SAVE_RULES = {
    minFrameGap: 120,
    maxDelayFrames: 360
};
let autoSavePending = false;
let autoSaveRequestedAt = 0;
let lastAutoSaveFrame = -1000000;
let lastShootSfxFrame = -1000000;

const QUALITY_PROFILES = [
    {
        name: 'HIGH',
        maxParticles: 900,
        particleSpawnBudget: 120,
        particleBurstOverdraft: 22,
        particleLowPriorityStride: 1,
        maxLights: 140,
        lightSpawnBudget: 18,
        lightBurstOverdraft: 6,
        lightLowPriorityStride: 1,
        maxArcBursts: 180,
        arcBurstSpawnBudget: 34,
        arcBurstOverdraft: 8,
        chainBurstUpdateStride: 1,
        forceLowAnimation: false
    },
    {
        name: 'BALANCED',
        maxParticles: 620,
        particleSpawnBudget: 90,
        particleBurstOverdraft: 14,
        particleLowPriorityStride: 2,
        maxLights: 90,
        lightSpawnBudget: 14,
        lightBurstOverdraft: 4,
        lightLowPriorityStride: 2,
        maxArcBursts: 140,
        arcBurstSpawnBudget: 22,
        arcBurstOverdraft: 6,
        chainBurstUpdateStride: 2,
        forceLowAnimation: true
    },
    {
        name: 'LOW',
        maxParticles: 420,
        particleSpawnBudget: 58,
        particleBurstOverdraft: 10,
        particleLowPriorityStride: 3,
        maxLights: 65,
        lightSpawnBudget: 9,
        lightBurstOverdraft: 3,
        lightLowPriorityStride: 3,
        maxArcBursts: 96,
        arcBurstSpawnBudget: 14,
        arcBurstOverdraft: 4,
        chainBurstUpdateStride: 3,
        forceLowAnimation: true
    }
];

const QUALITY_GOVERNOR = {
    profileIndex: PERFORMANCE_RULES.enabled ? 1 : 0,
    appliedIndex: -1,
    appliedPerformanceMode: PERFORMANCE_RULES.enabled,
    emaFrameMs: 16.7,
    downgradeFrameMs: 22,
    downgradeEmaMs: 19.5,
    upgradeFrameMs: 15.8,
    upgradeEmaMs: 15.3,
    downgradeFramesRequired: 45,
    upgradeFramesRequired: 240,
    downgradeCount: 0,
    upgradeCount: 0
};

const EFFECT_POOLS = {
    particles: [],
    projectiles: [],
    lights: []
};

const EFFECT_POOL_LIMITS = {
    particles: 2200,
    projectiles: 900,
    lights: 260
};

const EFFECT_BUDGET = {
    frame: -1,
    particles: 0,
    lights: 0,
    bursts: 0
};

const ENEMY_FRAME_CACHE = {
    targetable: [],
    taunters: [],
    aliveSet: new Set(),
    hasThreat: false
};

function getMinimumQualityProfileIndex() {
    return PERFORMANCE_RULES.enabled ? 1 : 0;
}

function getQualityProfile() {
    const i = Math.max(0, Math.min(QUALITY_PROFILES.length - 1, QUALITY_GOVERNOR.profileIndex));
    return QUALITY_PROFILES[i];
}

function applyQualityProfile(force = false) {
    const minIdx = getMinimumQualityProfileIndex();
    if (QUALITY_GOVERNOR.profileIndex < minIdx) {
        QUALITY_GOVERNOR.profileIndex = minIdx;
    }

    const profile = getQualityProfile();
    const shouldUseLowAnimation = PERFORMANCE_RULES.enabled || profile.forceLowAnimation;
    const unchanged = !force
        && QUALITY_GOVERNOR.appliedIndex === QUALITY_GOVERNOR.profileIndex
        && QUALITY_GOVERNOR.appliedPerformanceMode === PERFORMANCE_RULES.enabled
        && ARC_TOWER_RULES.lowAnimationMode === shouldUseLowAnimation;
    if (unchanged) return;

    QUALITY_GOVERNOR.appliedIndex = QUALITY_GOVERNOR.profileIndex;
    QUALITY_GOVERNOR.appliedPerformanceMode = PERFORMANCE_RULES.enabled;
    ARC_TOWER_RULES.lowAnimationMode = shouldUseLowAnimation;
}

window.refreshQualitySettings = function () {
    QUALITY_GOVERNOR.profileIndex = getMinimumQualityProfileIndex();
    QUALITY_GOVERNOR.downgradeCount = 0;
    QUALITY_GOVERNOR.upgradeCount = 0;
    applyQualityProfile(true);
};

function updateQualityGovernor(frameDtMs) {
    applyQualityProfile();
    if (!Number.isFinite(frameDtMs) || frameDtMs <= 0) return;

    const alpha = 0.1;
    QUALITY_GOVERNOR.emaFrameMs = (QUALITY_GOVERNOR.emaFrameMs * (1 - alpha)) + (frameDtMs * alpha);

    const stressed = frameDtMs > QUALITY_GOVERNOR.downgradeFrameMs
        || QUALITY_GOVERNOR.emaFrameMs > QUALITY_GOVERNOR.downgradeEmaMs;
    const stable = frameDtMs < QUALITY_GOVERNOR.upgradeFrameMs
        && QUALITY_GOVERNOR.emaFrameMs < QUALITY_GOVERNOR.upgradeEmaMs;

    QUALITY_GOVERNOR.downgradeCount = stressed ? (QUALITY_GOVERNOR.downgradeCount + 1) : 0;
    QUALITY_GOVERNOR.upgradeCount = stable ? (QUALITY_GOVERNOR.upgradeCount + 1) : 0;

    let changed = false;
    if (QUALITY_GOVERNOR.downgradeCount >= QUALITY_GOVERNOR.downgradeFramesRequired
        && QUALITY_GOVERNOR.profileIndex < (QUALITY_PROFILES.length - 1)) {
        QUALITY_GOVERNOR.profileIndex++;
        QUALITY_GOVERNOR.downgradeCount = 0;
        QUALITY_GOVERNOR.upgradeCount = 0;
        changed = true;
    } else if (QUALITY_GOVERNOR.upgradeCount >= QUALITY_GOVERNOR.upgradeFramesRequired
        && QUALITY_GOVERNOR.profileIndex > getMinimumQualityProfileIndex()) {
        QUALITY_GOVERNOR.profileIndex--;
        QUALITY_GOVERNOR.downgradeCount = 0;
        QUALITY_GOVERNOR.upgradeCount = 0;
        changed = true;
    }

    if (changed) {
        applyQualityProfile(true);
        if (PERF_MONITOR.enabled) {
            console.log(`[QUALITY] ${getQualityProfile().name} | dt=${frameDtMs.toFixed(2)}ms ema=${QUALITY_GOVERNOR.emaFrameMs.toFixed(2)}ms`);
        }
    }
}

const PERF_MONITOR = {
    enabled: localStorage.getItem('neonDefensePerfMonitor') === 'on',
    reportEveryFrames: 120,
    budgets: {
        update: 8.0,
        updateEnemies: 2.5,
        updateTowers: 2.5,
        updateProjectiles: 1.6,
        updateParticles: 1.2,
        updateLights: 0.9,
        updateArcEffects: 0.8,
        updateUI: 1.4,
        draw: 8.0,
        drawWorld: 5.8,
        drawStatus: 1.6,
        drawLighting: 1.2
    },
    samples: Object.create(null)
};

window.togglePerfMonitor = function () {
    PERF_MONITOR.enabled = !PERF_MONITOR.enabled;
    localStorage.setItem('neonDefensePerfMonitor', PERF_MONITOR.enabled ? 'on' : 'off');
    if (!PERF_MONITOR.enabled) PERF_MONITOR.samples = Object.create(null);
    console.log(`Perf monitor: ${PERF_MONITOR.enabled ? 'ON' : 'OFF'}`);
};

function perfNow() {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
}

function perfBegin() {
    if (!PERF_MONITOR.enabled) return 0;
    return perfNow();
}

function perfEnd(label, startTime) {
    if (!PERF_MONITOR.enabled || startTime === 0) return;
    const dt = perfNow() - startTime;
    const entry = PERF_MONITOR.samples[label] || (PERF_MONITOR.samples[label] = {
        sum: 0,
        count: 0,
        max: 0,
        over: 0
    });

    entry.sum += dt;
    entry.count++;
    if (dt > entry.max) entry.max = dt;

    const budget = PERF_MONITOR.budgets[label] || Infinity;
    if (dt > budget) entry.over++;
}

function perfMaybeReport() {
    if (!PERF_MONITOR.enabled) return;
    if (frameCount === 0 || (frameCount % PERF_MONITOR.reportEveryFrames) !== 0) return;

    const labels = Object.keys(PERF_MONITOR.samples);
    if (labels.length === 0) return;

    const summary = labels.map((label) => {
        const s = PERF_MONITOR.samples[label];
        const avg = s.count > 0 ? (s.sum / s.count) : 0;
        return `${label}: avg ${avg.toFixed(2)}ms / max ${s.max.toFixed(2)}ms / over ${s.over}`;
    }).join(' | ');

    console.log(`[PERF] ${summary}`);
    PERF_MONITOR.samples = Object.create(null);
}

function ensureEffectBudgetFrame() {
    if (EFFECT_BUDGET.frame === frameCount) return;
    EFFECT_BUDGET.frame = frameCount;
    EFFECT_BUDGET.particles = 0;
    EFFECT_BUDGET.lights = 0;
    EFFECT_BUDGET.bursts = 0;
}

function canSpawnParticle(priority) {
    ensureEffectBudgetFrame();
    const profile = getQualityProfile();
    const budget = profile.particleSpawnBudget;
    if (EFFECT_BUDGET.particles >= budget) {
        const hardCap = budget + profile.particleBurstOverdraft;
        if (priority < 2 || EFFECT_BUDGET.particles >= hardCap) return false;
    }
    EFFECT_BUDGET.particles++;
    return true;
}

function canSpawnLight(priority) {
    ensureEffectBudgetFrame();
    const profile = getQualityProfile();
    const budget = profile.lightSpawnBudget;
    if (EFFECT_BUDGET.lights >= budget) {
        const hardCap = budget + profile.lightBurstOverdraft;
        if (priority < 2 || EFFECT_BUDGET.lights >= hardCap) return false;
    }
    EFFECT_BUDGET.lights++;
    return true;
}

function canSpawnArcBurst(priority) {
    ensureEffectBudgetFrame();
    const profile = getQualityProfile();
    const budget = profile.arcBurstSpawnBudget;
    if (EFFECT_BUDGET.bursts >= budget) {
        const hardCap = budget + profile.arcBurstOverdraft;
        if (priority < 2 || EFFECT_BUDGET.bursts >= hardCap) return false;
    }
    EFFECT_BUDGET.bursts++;
    return true;
}

function removeAtSwap(arr, index) {
    if (index < 0 || index >= arr.length) return null;
    const removed = arr[index];
    const last = arr.pop();
    if (index < arr.length) arr[index] = last;
    return removed;
}

function releaseParticleAt(index) {
    const p = removeAtSwap(particles, index);
    if (!p) return;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.color = '';
    p.priority = 0;
    p.phase = 0;
    if (EFFECT_POOLS.particles.length < EFFECT_POOL_LIMITS.particles) EFFECT_POOLS.particles.push(p);
}

function releaseProjectileAt(index) {
    const p = removeAtSwap(projectiles, index);
    if (!p) return;
    p.x = 0;
    p.y = 0;
    p.target = null;
    p.speed = 0;
    p.damage = 0;
    p.color = '';
    p.type = '';
    if (EFFECT_POOLS.projectiles.length < EFFECT_POOL_LIMITS.projectiles) EFFECT_POOLS.projectiles.push(p);
}

function releaseLightAt(index) {
    const light = removeAtSwap(lightSources, index);
    if (!light) return;
    light.x = 0;
    light.y = 0;
    light.radius = 0;
    light.color = '';
    light.life = 0;
    light.priority = 0;
    light.phase = 0;
    if (EFFECT_POOLS.lights.length < EFFECT_POOL_LIMITS.lights) EFFECT_POOLS.lights.push(light);
}

function reserveParticleSlot(priority) {
    const maxParticles = getQualityProfile().maxParticles;
    if (particles.length < maxParticles) return true;
    if (priority <= 0) return false;

    let victim = -1;
    let victimPriority = Infinity;
    let victimLife = Infinity;
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const pPriority = Number.isFinite(p.priority) ? p.priority : 1;
        if (pPriority >= priority) continue;
        const pLife = Number.isFinite(p.life) ? p.life : 1;
        if (pPriority < victimPriority || (pPriority === victimPriority && pLife < victimLife)) {
            victim = i;
            victimPriority = pPriority;
            victimLife = pLife;
        }
    }

    if (victim < 0) return false;
    releaseParticleAt(victim);
    return true;
}

function reserveLightSlot(priority) {
    const maxLights = getQualityProfile().maxLights;
    if (lightSources.length < maxLights) return true;
    if (priority <= 0) return false;

    let victim = -1;
    let victimPriority = Infinity;
    let victimLife = Infinity;
    for (let i = 0; i < lightSources.length; i++) {
        const light = lightSources[i];
        const lPriority = Number.isFinite(light.priority) ? light.priority : 1;
        if (lPriority >= priority) continue;
        const lLife = Number.isFinite(light.life) ? light.life : 0;
        if (lPriority < victimPriority || (lPriority === victimPriority && lLife < victimLife)) {
            victim = i;
            victimPriority = lPriority;
            victimLife = lLife;
        }
    }

    if (victim < 0) return false;
    releaseLightAt(victim);
    return true;
}

function reserveArcBurstSlot(priority) {
    const profile = getQualityProfile();
    const cap = Math.min(ARC_TOWER_RULES.maxLightningBursts, profile.maxArcBursts);
    if (arcLightningBursts.length < cap) return true;

    for (let i = 0; i < arcLightningBursts.length; i++) {
        const burst = arcLightningBursts[i];
        const burstPriority = Number.isFinite(burst.priority) ? burst.priority : (burst.isChain ? 0 : 2);
        if (burstPriority >= priority) continue;
        arcLightningBursts.splice(i, 1);
        return true;
    }

    if (priority >= 2 && arcLightningBursts.length > 0) {
        arcLightningBursts.shift();
        return true;
    }
    return false;
}

function spawnProjectile(x, y, target, speed, damage, color, type = 'tower') {
    const p = EFFECT_POOLS.projectiles.pop() || {};
    p.x = x;
    p.y = y;
    p.target = target;
    p.speed = speed;
    p.damage = damage;
    p.color = color;
    p.type = type;
    projectiles.push(p);
    return p;
}

function addLightSource(x, y, radius, color, life = 1, priority = 1) {
    if (!canSpawnLight(priority)) return false;
    if (!reserveLightSlot(priority)) return false;

    const light = EFFECT_POOLS.lights.pop() || {};
    light.x = x;
    light.y = y;
    light.radius = radius;
    light.color = color;
    light.life = life;
    light.priority = priority;
    light.phase = Math.floor(Math.random() * 3);
    lightSources.push(light);
    return true;
}

function refreshThreatPresenceFromAliveSet() {
    ENEMY_FRAME_CACHE.hasThreat = false;
    for (const e of ENEMY_FRAME_CACHE.aliveSet) {
        if (!e) continue;
        if (e.type === 'boss' || e.isMutant) {
            ENEMY_FRAME_CACHE.hasThreat = true;
            return;
        }
    }
}

function rebuildEnemyFrameCache() {
    const targetable = ENEMY_FRAME_CACHE.targetable;
    const taunters = ENEMY_FRAME_CACHE.taunters;
    targetable.length = 0;
    taunters.length = 0;
    ENEMY_FRAME_CACHE.aliveSet.clear();
    ENEMY_FRAME_CACHE.hasThreat = false;

    for (const enemy of enemies) {
        if (!enemy || enemy.hp <= 0) continue;
        ENEMY_FRAME_CACHE.aliveSet.add(enemy);
        if (enemy.type === 'boss' || enemy.isMutant) ENEMY_FRAME_CACHE.hasThreat = true;
        if (enemy.isInvisible) continue;

        targetable.push(enemy);
        if (enemy.type === 'bulwark') taunters.push(enemy);
    }
}

function getCachedThreatPresence() {
    return ENEMY_FRAME_CACHE.hasThreat;
}

function updateLightSources() {
    const lightLowStride = getQualityProfile().lightLowPriorityStride;
    let i = lightSources.length - 1;
    while (i >= 0) {
        const light = lightSources[i];
        if (!light) {
            i--;
            continue;
        }
        const priority = Number.isFinite(light.priority) ? light.priority : 1;
        let step = 1;

        if (priority <= 0 && lightLowStride > 1) {
            const phase = Number.isFinite(light.phase) ? light.phase : 0;
            if (((frameCount + phase) % lightLowStride) !== 0) {
                i--;
                continue;
            }
            step = lightLowStride;
        }

        light.life -= 0.1 * step;
        if (light.life <= 0) {
            releaseLightAt(i);
            continue;
        }

        i--;
    }
}

function getTowerSelectorNodes() {
    if (!towerSelectorNodes || towerSelectorNodes.length === 0) {
        towerSelectorNodes = Array.from(document.querySelectorAll('.tower-selector'));
    }
    return towerSelectorNodes;
}

function queueAutoSave() {
    if (!autoSavePending) {
        autoSavePending = true;
        autoSaveRequestedAt = frameCount;
    }
}

function flushQueuedAutoSave(force = false) {
    if (!autoSavePending) return false;
    if (!force) {
        const framesSinceLast = frameCount - lastAutoSaveFrame;
        const framesWaiting = frameCount - autoSaveRequestedAt;
        const canSaveNow = framesSinceLast >= AUTO_SAVE_RULES.minFrameGap
            || framesWaiting >= AUTO_SAVE_RULES.maxDelayFrames;
        if (!canSaveNow) return false;
    }

    saveGame();
    lastAutoSaveFrame = frameCount;
    autoSavePending = false;
    return true;
}

function playShootSFX() {
    const profile = getQualityProfile();
    let minInterval = 1;
    if (profile.name === 'BALANCED') minInterval = 2;
    if (profile.name === 'LOW') minInterval = 3;

    if ((frameCount - lastShootSfxFrame) < minInterval) return;
    lastShootSfxFrame = frameCount;
    AudioEngine.playSFX('shoot');
}

applyQualityProfile(true);

function emitUpdateParticleOnce(x, y, color, count = 1) {
    if (updateParticleBudgetUsed) return;
    updateParticleBudgetUsed = true;
    createParticles(x, y, color, count, { priority: 0 });
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.max(0, timestamp - lastTime); // could be used for delta time
    lastTime = timestamp;
    if (dt > 0) lastFrameDtMs = dt;

    if (gameState === 'playing' && !isPaused) {
        updateQualityGovernor(lastFrameDtMs);
        update();
    } else {
        applyQualityProfile();
    }
    positionSelectionPanel();
    draw();

    requestAnimationFrame(gameLoop);
}

function update() {
    const perfUpdate = perfBegin('update');
    frameCount++;
    updateParticleBudgetUsed = false;

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
    const perfUpdateEnemies = perfBegin('updateEnemies');
    updateEnemies();
    perfEnd('updateEnemies', perfUpdateEnemies);

    const perfUpdateTowers = perfBegin('updateTowers');
    updateTowers();
    perfEnd('updateTowers', perfUpdateTowers);

    const perfUpdateProjectiles = perfBegin('updateProjectiles');
    updateProjectiles();
    perfEnd('updateProjectiles', perfUpdateProjectiles);

    const perfUpdateParticles = perfBegin('updateParticles');
    updateParticles();
    perfEnd('updateParticles', perfUpdateParticles);

    const perfUpdateLights = perfBegin('updateLights');
    updateLightSources();
    perfEnd('updateLights', perfUpdateLights);

    const perfUpdateArc = perfBegin('updateArcEffects');
    updateArcEffects();
    perfEnd('updateArcEffects', perfUpdateArc);

    if (lives <= 0) {
        flushQueuedAutoSave(true);
        gameState = 'gameover';
        AudioEngine.playSFX('hit');
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    // Update music state based on bosses/mutants
    AudioEngine.updateMusic();
    flushQueuedAutoSave(false);
    perfEnd('update', perfUpdate);
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
        staticCharges: 0,
        staticStunTimer: 0,
        type: enemyType // Store the type for drawing/logic
    };

    if (enemyType === 'boss') addLightSource(e.x, e.y, 150, '#ff8800', 2.0, 2);

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
            staticCharges: 0,
            staticStunTimer: 0,
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
        staticCharges: 0,
        staticStunTimer: 0,
        type: type
    });

    isWaveActive = true; // Ensure systems process it
    updateUI();
};

window.debugCreateRift = function () {
    const created = generateNewPath();
    // Force path recalculation or visual update if needed
    // generateNewPath updates 'paths' array and handles tower removal
    // It doesn't trigger path recalculation for existing enemies immediately unless they check currentPath

    if (created) {
        AudioEngine.playSFX('build');
        console.log("Debug: Created new rift");
    } else {
        console.warn("Debug: Rift generation failed.");
    }

    // Update UI to show new rift count/intel
    if (document.getElementById('wave-info-panel') && !document.getElementById('wave-info-panel').classList.contains('hidden')) {
        updateWavePanel();
    }
};

window.debugLevelUpRift = function () {
    if (paths.length === 0) return;

    // Pick random rift
    const rift = paths[Math.floor(Math.random() * paths.length)];
    rift.level = (rift.level || 1) + 1;

    // Visuals at start of rift
    if (rift.points.length > 0) {
        const start = rift.points[0];
        createParticles(start.x, start.y, '#ff00ac', 30);
        addLightSource(start.x, start.y, 200, '#ff00ac', 1.0, 1);
    }

    AudioEngine.playSFX('build');
    console.log(`Debug: Leveled up rift to T${rift.level}`);

    // Update UI
    if (document.getElementById('wave-info-panel') && !document.getElementById('wave-info-panel').classList.contains('hidden')) {
        updateWavePanel();
    }

    // If this rift is selected, update selection UI
    if (selectedRift === rift) {
        updateSelectionUI();
    }
};

window.debugIncreaseWave = function (steps = 1, autoStart = true) {
    if (gameState !== 'playing') return;

    const count = Math.max(1, Math.floor(Number(steps) || 1));

    // Reset active combat state so wave jump is deterministic.
    enemies = [];
    projectiles = [];
    particles = [];
    arcLightningBursts = [];
    arcTowerLinks = [];
    markArcNetworkDirty();
    spawnQueue = [];
    isWaveActive = false;

    // Advance one wave at a time and simulate intermediate wave-start systems
    // so progression matches normal gameplay pacing (rift evolution, mutation checks, etc.).
    for (let i = 0; i < count; i++) {
        const isFinalStep = i === count - 1;
        wave++;
        startPrepPhase();

        if (!isFinalStep) {
            // Simulate wave-start effects for skipped waves, then instantly resolve the wave.
            startWave({ silent: true, persist: false, tutorialProgress: false });
            enemies = [];
            projectiles = [];
            particles = [];
            arcLightningBursts = [];
            arcTowerLinks = [];
            markArcNetworkDirty();
            spawnQueue = [];
            isWaveActive = false;
        }
    }

    if (autoStart) {
        startWave({ persist: false, tutorialProgress: false });
    } else {
        updateUI();
    }

    saveGame();
    console.log(`Debug: Advanced ${count} wave(s) to W${wave}${autoStart ? ' and started wave' : ''}.`);
};

window.debugRebuildRiftsByWave = function () {
    if (gameState !== 'playing') return;

    // Stabilize state before topology rewrite.
    enemies = [];
    projectiles = [];
    particles = [];
    arcLightningBursts = [];
    arcTowerLinks = [];
    markArcNetworkDirty();
    spawnQueue = [];
    isWaveActive = false;
    selectedRift = null;
    selectedZone = -1;

    const expectedRifts = getExpectedRiftCountByWave(wave);

    // Destroy current rifts and regenerate baseline topology.
    paths = [];
    calculatePath(); // Creates initial rift and hardpoints

    pendingRiftGenerations = Math.max(0, expectedRifts - paths.length);
    let attempts = 0;
    let failStreak = 0;
    const maxAttempts = Math.min(1800, 120 + pendingRiftGenerations * 40);
    while (pendingRiftGenerations > 0 && attempts < maxAttempts) {
        const relaxedLevel = failStreak >= 10 ? 2 : (failStreak >= 4 ? 1 : 0);
        const aggressivePlacement = failStreak >= 16;
        const created = generateNewPath({ relaxedLevel, aggressivePlacement, suppressLogs: true });
        if (created) {
            pendingRiftGenerations--;
            failStreak = 0;
        } else {
            failStreak++;
        }
        attempts++;
    }

    // Enter clean prep state; prep flow keeps retrying backlog if any remains.
    startPrepPhase();
    AudioEngine.playSFX('build');
    updateSelectionUI();
    saveGame();

    if (pendingRiftGenerations > 0) {
        console.warn(`Debug: Rebuilt rifts to ${paths.length}/${expectedRifts}. Pending ${pendingRiftGenerations} for future prep retries.`);
    } else {
        console.log(`Debug: Rebuilt rifts successfully. ${paths.length}/${expectedRifts} ready for W${wave}.`);
    }
};

function updateEnemies() {
    const qualityProfile = getQualityProfile();
    const lowPriorityStride = Math.max(1, qualityProfile.particleLowPriorityStride);
    const arcCalcEnabled = !ARC_TOWER_RULES.disableCalculationsForPerfTest;
    const frozenTrailInterval = (PERFORMANCE_RULES.enabled ? 30 : 16) * lowPriorityStride;
    const bulwarkPulseInterval = (PERFORMANCE_RULES.enabled ? 54 : 40) * lowPriorityStride;
    const bulwarkPulseCount = PERFORMANCE_RULES.enabled ? 1 : 1;
    let staticStatusCount = 0;

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        const hasStaticStatus = arcCalcEnabled
            && (((e.staticCharges || 0) > 0) || ((e.staticStunTimer || 0) > 0));

        if (!arcCalcEnabled && ((e.staticCharges || 0) > 0 || (e.staticStunTimer || 0) > 0)) {
            e.staticCharges = 0;
            e.staticStunTimer = 0;
        }

        // Handle Status Effects
        if (e.frozen) {
            if (arcCalcEnabled && hasStaticStatus) staticStatusCount++;
            if (arcCalcEnabled && e.staticStunTimer > 0) e.staticStunTimer--;
            e.frozenTimer--;
            if (e.frozenTimer <= 0) e.frozen = false;
            // Draw frozen particles with reduced update cost.
            if (frameCount % frozenTrailInterval === 0) {
                emitUpdateParticleOnce(e.x, e.y, '#00f3ff', 1);
            }
            continue; // Frozen enemies don't move
        }

        if (arcCalcEnabled && e.staticStunTimer > 0) {
            staticStatusCount++;
            e.staticStunTimer--;
            if (frameCount % PERFORMANCE_RULES.staticStunTrailInterval === 0) emitUpdateParticleOnce(e.x, e.y, '#7cd7ff', 1);
            continue; // Stunned enemies don't move
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
        if (e.type === 'bulwark' && frameCount % bulwarkPulseInterval === 0) {
            emitUpdateParticleOnce(e.x, e.y, '#fcee0a', bulwarkPulseCount);
        }

        // --- Phase Shifter Logic ---
        if (e.type === 'shifter') {
            // Toggle invisibility every 180 frames (~3 secs)
            e.isInvisible = (frameCount % 360) > 180;
        }

        if (arcCalcEnabled && hasStaticStatus) staticStatusCount++;
    }

    activeStaticStatusCount = arcCalcEnabled ? staticStatusCount : 0;
    rebuildEnemyFrameCache();
}

function updateArcEffects() {
    if (ARC_TOWER_RULES.disableCalculationsForPerfTest) {
        if (arcLightningBursts.length > 0) arcLightningBursts = [];
        return;
    }

    const chainStride = Math.max(1, getQualityProfile().chainBurstUpdateStride);
    for (let i = arcLightningBursts.length - 1; i >= 0; i--) {
        const burst = arcLightningBursts[i];
        let step = 1;

        if (burst.isChain && chainStride > 1) {
            const phase = Number.isFinite(burst.phase) ? burst.phase : 0;
            if (((frameCount + phase) % chainStride) !== 0) continue;
            step = chainStride;
        }

        burst.life -= step;
        if (burst.life <= 0) arcLightningBursts.splice(i, 1);
    }
}

function isArcLinkPair(a, b) {
    const ac = Math.floor(a.x / GRID_SIZE);
    const ar = Math.floor(a.y / GRID_SIZE);
    const bc = Math.floor(b.x / GRID_SIZE);
    const br = Math.floor(b.y / GRID_SIZE);
    const dc = Math.abs(ac - bc);
    const dr = Math.abs(ar - br);
    const spacing = dc + dr;
    const aligned = (dc === 0 && dr > 0) || (dr === 0 && dc > 0);
    if (!aligned) return false;

    return spacing >= ARC_TOWER_RULES.minLinkSpacingCells
        && spacing <= ARC_TOWER_RULES.maxLinkSpacingCells;
}

function refreshArcTowerNetwork() {
    if (ARC_TOWER_RULES.disableCalculationsForPerfTest) {
        if (arcTowerLinks.length > 0) arcTowerLinks = [];
        return;
    }

    if (!arcNetworkDirty) return;
    arcNetworkDirty = false;

    const arcTowers = towers.filter(t => t.type === 'arc');
    arcTowerLinks = [];

    if (arcTowers.length === 0) return;

    const adjacency = new Map();
    for (const tower of arcTowers) adjacency.set(tower, []);

    for (let i = 0; i < arcTowers.length; i++) {
        for (let j = i + 1; j < arcTowers.length; j++) {
            const a = arcTowers[i];
            const b = arcTowers[j];
            if (!isArcLinkPair(a, b)) continue;
            adjacency.get(a).push(b);
            adjacency.get(b).push(a);
            arcTowerLinks.push({ a, b, strength: 1 });
        }
    }

    const visited = new Set();
    for (const tower of arcTowers) {
        if (visited.has(tower)) continue;

        const stack = [tower];
        const component = [];
        visited.add(tower);

        while (stack.length > 0) {
            const node = stack.pop();
            component.push(node);
            const nextNodes = adjacency.get(node) || [];
            for (const next of nextNodes) {
                if (visited.has(next)) continue;
                visited.add(next);
                stack.push(next);
            }
        }

        const bonus = Math.max(1, Math.min(ARC_TOWER_RULES.maxBonus, component.length));
        for (const node of component) {
            node.arcNetworkBonus = bonus;
            node.arcNetworkSize = component.length;
        }
    }

    for (const link of arcTowerLinks) {
        link.strength = Math.max(1, Math.min(
            ARC_TOWER_RULES.maxBonus,
            Math.max(link.a.arcNetworkBonus || 1, link.b.arcNetworkBonus || 1)
        ));
    }
}

function addArcLightningBurst(x1, y1, x2, y2, intensity = 1, isChain = false) {
    if (ARC_TOWER_RULES.disableCalculationsForPerfTest) return;
    const priority = isChain ? 0 : 2;
    if (!canSpawnArcBurst(priority)) return;
    if (!reserveArcBurstSlot(priority)) return;
    arcLightningBursts.push({
        x1,
        y1,
        x2,
        y2,
        intensity: Math.max(1, Math.min(ARC_TOWER_RULES.maxBonus, intensity || 1)),
        isChain: !!isChain,
        life: isChain ? 7 : 8,
        priority: priority,
        phase: Math.floor(Math.random() * 3)
    });
}

function applyStaticCharges(enemy, amount) {
    if (ARC_TOWER_RULES.disableCalculationsForPerfTest) return;
    if (!enemy || amount <= 0) return;

    enemy.staticCharges = Math.max(0, (enemy.staticCharges || 0) + amount);
    const hitParticles = PERFORMANCE_RULES.enabled
        ? Math.max(1, Math.floor((Math.min(6, 2 + amount)) * PERFORMANCE_RULES.staticHitParticleScale))
        : Math.min(6, 2 + amount);
    createParticles(enemy.x, enemy.y, '#7cd7ff', hitParticles);

    while (enemy.staticCharges >= ARC_TOWER_RULES.staticThreshold) {
        enemy.staticCharges -= ARC_TOWER_RULES.staticThreshold;
        enemy.staticStunTimer = Math.max(enemy.staticStunTimer || 0, ARC_TOWER_RULES.stunFrames);
        createParticles(enemy.x, enemy.y, '#b7eaff', PERFORMANCE_RULES.enabled ? PERFORMANCE_RULES.staticStunParticleCount : 5);
        addLightSource(enemy.x, enemy.y, 70, '#7cd7ff', 1.0, 1);
    }
}

function findArcBounceTarget(fromX, fromY, visited) {
    let target = null;
    let minDist = Infinity;
    const candidates = ENEMY_FRAME_CACHE.targetable;
    for (const enemy of candidates) {
        if (!enemy || enemy.hp <= 0 || enemy.isInvisible || visited.has(enemy)) continue;
        const dist = Math.hypot(enemy.x - fromX, enemy.y - fromY);
        if (dist <= ARC_TOWER_RULES.chainRange && dist < minDist) {
            minDist = dist;
            target = enemy;
        }
    }
    return target;
}

function fireArcTower(tower, target) {
    if (ARC_TOWER_RULES.disableCalculationsForPerfTest) {
        // Fall back to a basic projectile path while Arc systems are disabled.
        spawnProjectile(tower.x, tower.y, target, 10, tower.damage, tower.color, 'tower');
        addLightSource(tower.x, tower.y, 40, tower.color, 1.0, 1);
        playShootSFX();
        return;
    }

    const bonus = Math.max(1, Math.min(ARC_TOWER_RULES.maxBonus, tower.arcNetworkBonus || 1));
    const directDamage = tower.damage;
    const bounceDamage = Math.max(1, tower.damage * ARC_TOWER_RULES.bounceDamageMult);

    addArcLightningBurst(tower.x, tower.y, target.x, target.y, bonus, false);
    hitEnemy(target, directDamage, { staticCharges: bonus });

    const visited = new Set();
    visited.add(target);

    let fromX = target.x;
    let fromY = target.y;
    const maxBounces = ARC_TOWER_RULES.baseChainTargets;

    for (let i = 0; i < maxBounces; i++) {
        const bounceTarget = findArcBounceTarget(fromX, fromY, visited);
        if (!bounceTarget) break;

        addArcLightningBurst(fromX, fromY, bounceTarget.x, bounceTarget.y, bonus, true);
        hitEnemy(bounceTarget, bounceDamage, { staticCharges: 1 });

        visited.add(bounceTarget);
        fromX = bounceTarget.x;
        fromY = bounceTarget.y;
    }

    addLightSource(tower.x, tower.y, 46, tower.color, 1.0, 1);
    playShootSFX();
}

function updateTowers() {
    const overclockTrailInterval = PERFORMANCE_RULES.enabled ? 24 : 14;
    const targetableEnemies = ENEMY_FRAME_CACHE.targetable;
    const taunterEnemies = ENEMY_FRAME_CACHE.taunters;

    refreshArcTowerNetwork();

    // Update Towers
    for (let t of towers) {
        // Handle Cooldown & Overclock
        let cdRate = 1;
        if (t.overclocked) {
            cdRate = 2; // Double fire rate
            t.overclockTimer--;
            if (t.overclockTimer <= 0) t.overclocked = false;
            if (frameCount % overclockTrailInterval === 0) emitUpdateParticleOnce(t.x, t.y, '#fcee0a', 1);
        }

        if (t.cooldown > 0) t.cooldown -= cdRate;

        // Find Target
        const range = t.range;
        let target = null;
        let minDist = Infinity;

        // Taunt Check first
        let taunterInRange = false;
        for (const e of taunterEnemies) {
            const dist = Math.hypot(e.x - t.x, e.y - t.y);
            if (dist <= range) {
                taunterInRange = true;
                if (dist < minDist) {
                    target = e;
                    minDist = dist;
                }
            }
        }

        if (!taunterInRange) {
            for (const e of targetableEnemies) {
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

        for (const e of ENEMY_FRAME_CACHE.aliveSet) {
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

            spawnProjectile(baseX, baseY, target, 12, currentDamage, '#00ff41', 'base');
            baseCooldown = currentCooldown;
            playShootSFX();
        }
    }
}

function shoot(tower, target) {
    if (tower.type === 'arc') {
        fireArcTower(tower, target);
        return;
    }

    spawnProjectile(tower.x, tower.y, target, 10, tower.damage, tower.color, 'tower');
    // Muzzle Flash
    addLightSource(tower.x, tower.y, 40, tower.color, 1.0, 1);
    playShootSFX();
}

function updateProjectiles() {
    let i = projectiles.length - 1;
    while (i >= 0) {
        const p = projectiles[i];
        if (!p) {
            i--;
            continue;
        }
        const t = p.target;

        if (!ENEMY_FRAME_CACHE.aliveSet.has(t)) {
            // Target dead/gone
            releaseProjectileAt(i);
            continue;
        }

        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < p.speed) {
            // Hit
            hitEnemy(t, p.damage, null);
            releaseProjectileAt(i);
        } else {
            p.x += (dx / dist) * p.speed;
            p.y += (dy / dist) * p.speed;
            i--;
        }
    }
}

function hitEnemy(enemy, damage, hitData = null) {
    if (hitData && hitData.staticCharges) {
        applyStaticCharges(enemy, hitData.staticCharges);
    }

    if (enemy.frozen) damage *= 1.2;
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
        const index = enemies.indexOf(enemy);
        if (index > -1) {
            enemies.splice(index, 1);
            ENEMY_FRAME_CACHE.aliveSet.delete(enemy);
            if (enemy.type === 'boss' || enemy.isMutant) refreshThreatPresenceFromAliveSet();
            money += enemy.reward;

            // Track Lifetime Kills
            if (totalKills[enemy.type] !== undefined) {
                totalKills[enemy.type]++;
            }

            // Gain Energy
            energy = Math.min(maxEnergy, energy + 1);

            createParticles(enemy.x, enemy.y, enemy.color, 4, { priority: 2 });
            addLightSource(enemy.x, enemy.y, 60, enemy.color, 1.0, 1);

            AudioEngine.playSFX('explosion');

            // Splitter Logic
            if (enemy.type === 'splitter') {
                spawnSubUnits(enemy);
            }

            updateUI();
            queueAutoSave(); // Batch combat saves to avoid frame hitches on each kill.
        }
    }
}

function createParticles(x, y, color, count, options = null) {
    const opts = options || {};
    const priority = Number.isFinite(opts.priority) ? opts.priority : 1;
    const baseSpeed = Number.isFinite(opts.speed) ? Math.max(0.2, opts.speed) : 5;
    const baseLife = Number.isFinite(opts.life) ? Math.max(0.05, opts.life) : 1.0;
    const spread = Number.isFinite(opts.spread) ? Math.max(0.2, opts.spread) : 1.0;
    const total = Math.max(0, Math.floor(count || 0));

    for (let i = 0; i < total; i++) {
        if (!canSpawnParticle(priority)) break;
        if (!reserveParticleSlot(priority)) break;

        const p = EFFECT_POOLS.particles.pop() || {};
        p.x = x;
        p.y = y;
        p.vx = (Math.random() - 0.5) * baseSpeed * spread;
        p.vy = (Math.random() - 0.5) * baseSpeed * spread;
        p.life = baseLife;
        p.color = color;
        p.priority = priority;
        p.phase = Math.floor(Math.random() * 3);
        particles.push(p);
    }
}

function updateParticles() {
    const lowStride = Math.max(1, getQualityProfile().particleLowPriorityStride);
    let i = particles.length - 1;
    while (i >= 0) {
        const p = particles[i];
        if (!p) {
            i--;
            continue;
        }
        const priority = Number.isFinite(p.priority) ? p.priority : 1;
        let step = 1;

        if (priority <= 0 && lowStride > 1) {
            const phase = Number.isFinite(p.phase) ? p.phase : 0;
            if (((frameCount + phase) % lowStride) !== 0) {
                i--;
                continue;
            }
            step = lowStride;
        }

        p.x += p.vx * step;
        p.y += p.vy * step;
        p.life -= 0.05 * step;
        if (p.life <= 0) {
            releaseParticleAt(i);
            continue;
        }

        i--;
    }
}

function setTextIfChanged(el, value) {
    if (!el) return;
    const next = String(value);
    if (el.dataset.uiText === next) return;
    el.dataset.uiText = next;
    el.innerText = next;
}

function updateUI(force = false) {
    const perfUpdateUI = perfBegin('updateUI');
    const shouldThrottle = !force && gameState === 'playing';
    if (shouldThrottle && frameCount < nextUISyncFrame) {
        perfEnd('updateUI', perfUpdateUI);
        return;
    }

    if (shouldThrottle) {
        nextUISyncFrame = frameCount + UI_SYNC_INTERVAL_FRAMES;
    }

    setTextIfChanged(document.getElementById('money-display'), money);
    setTextIfChanged(document.getElementById('lives-display'), lives);
    setTextIfChanged(document.getElementById('wave-display'), wave);

    const remainingEnemies = spawnQueue.length + enemies.length;
    const enemyInfoEl = document.getElementById('enemy-info');
    if (isWaveActive) {
        if (remainingEnemies > currentWaveTotalEnemies) currentWaveTotalEnemies = remainingEnemies;
        setTextIfChanged(enemyInfoEl, `REMAINING: ${remainingEnemies}`);
    } else {
        setTextIfChanged(enemyInfoEl, 'REMAINING: 0');
    }

    const timerEl = document.getElementById('timer-display');
    if (isWaveActive) {
        setTextIfChanged(timerEl, 'WAVE ACTIVE');
        if (timerEl && timerEl.dataset.uiColor !== '#ff4444') {
            timerEl.dataset.uiColor = '#ff4444';
            timerEl.style.color = '#ff4444';
        }
    } else {
        setTextIfChanged(timerEl, `NEXT WAVE: ${prepTimer}s`);
        if (timerEl && timerEl.dataset.uiColor !== '#00ff41') {
            timerEl.dataset.uiColor = '#00ff41';
            timerEl.style.color = '#00ff41';
        }
    }

    // --- Ability UI Synchronization ---
    const energyFill = document.getElementById('energy-bar-fill');
    const energyVal = document.getElementById('energy-value');
    if (energyFill) {
        const nextHeight = `${(energy / maxEnergy) * 100}%`;
        if (energyFill.dataset.uiHeight !== nextHeight) {
            energyFill.dataset.uiHeight = nextHeight;
            energyFill.style.height = nextHeight;
        }
        setTextIfChanged(energyVal, `${Math.floor(energy)} / ${maxEnergy}`);
    }

    // Ability Slots
    for (let key in abilities) {
        const ability = abilities[key];
        const btn = document.getElementById(`ability-${key}`);
        if (btn) {
            const canAfford = energy >= ability.cost;
            const reloaded = ability.cooldown <= 0;
            const isActive = targetingAbility === key;
            const cooldownText = ability.cooldown > 0 ? String(ability.cooldown) : '';
            const stateKey = `${canAfford ? 1 : 0}${reloaded ? 1 : 0}${isActive ? 1 : 0}:${cooldownText}`;

            if (btn.dataset.uiState !== stateKey) {
                btn.dataset.uiState = stateKey;
                btn.classList.toggle('disabled', !canAfford || !reloaded);
                btn.classList.toggle('active', isActive);

                if (ability.cooldown > 0) {
                    btn.setAttribute('data-cooldown', ability.cooldown);
                } else {
                    btn.removeAttribute('data-cooldown');
                }
            }
        }
    }

    maybeShowAbilityHint();

    // Build Panel: Disable unaffordable towers
    if (lastBuildAffordMoney !== money || force) {
        lastBuildAffordMoney = money;
        getTowerSelectorNodes().forEach(el => {
            const type = el.getAttribute('data-type');
            const cost = TOWERS[type].cost;
            const disabled = money < cost;
            if ((el.dataset.uiDisabled === '1') !== disabled) {
                el.dataset.uiDisabled = disabled ? '1' : '0';
                el.classList.toggle('disabled', disabled);
            }
        });
    }

    perfEnd('updateUI', perfUpdateUI);
}

