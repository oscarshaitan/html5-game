// --- Main Loop ---

function gameLoop(timestamp) {
    const dt = timestamp - lastTime; // could be used for delta time
    lastTime = timestamp;

    if (gameState === 'playing' && !isPaused) {
        update(dt);
    }
    positionSelectionPanel();
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
        lightSources.push({ x: start.x, y: start.y, radius: 200, color: '#ff00ac', life: 1.0 });
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

    const remainingEnemies = spawnQueue.length + enemies.length;
    const enemyInfoEl = document.getElementById('enemy-info');
    if (isWaveActive) {
        if (remainingEnemies > currentWaveTotalEnemies) currentWaveTotalEnemies = remainingEnemies;
        enemyInfoEl.innerText = `REMAINING: ${remainingEnemies}`;
    } else {
        enemyInfoEl.innerText = `REMAINING: 0`;
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

    maybeShowAbilityHint();

    // Build Panel: Disable unaffordable towers
    document.querySelectorAll('.tower-selector').forEach(el => {
        const type = el.getAttribute('data-type');
        const cost = TOWERS[type].cost;
        if (money < cost) {
            el.classList.add('disabled');
        } else {
            el.classList.remove('disabled');
        }
    });
}

