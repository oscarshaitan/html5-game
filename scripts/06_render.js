// --- Rendering ---

function draw() {
    const perfDraw = perfBegin('draw');
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
    const viewCullMargin = GRID_SIZE * 3;
    const viewMinX = startX - viewCullMargin;
    const viewMaxX = endX + viewCullMargin;
    const viewMinY = startY - viewCullMargin;
    const viewMaxY = endY + viewCullMargin;

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

    const perfDrawWorld = perfBegin('drawWorld');

    // --- Spatial Zoning Overlay (Debug) ---
    if (showNoBuildOverlay && paths.length > 0 && paths[0].points.length > 0) {
        const base = paths[0].points[paths[0].points.length - 1];

        // 1. Draw Concentric Zones
        ctx.save();
        ctx.setLineDash([10, 5]);
        ctx.lineWidth = 2;

        // Zone 0 (No Rift Zone)
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(base.x, base.y, ZONE0_RADIUS_CELLS * GRID_SIZE, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.05)';
        ctx.fill();

        // Extended Zones (every 3 units)
        for (let r = ZONE0_RADIUS_CELLS + 3; r < 60; r += 3) {
            const zi = Math.floor((r - ZONE0_RADIUS_CELLS) / 3);
            ctx.strokeStyle = (zi === selectedZone) ? 'rgba(250, 238, 10, 0.8)' : 'rgba(0, 243, 255, 0.2)';
            ctx.lineWidth = (zi === selectedZone) ? 4 : 2;
            ctx.beginPath();
            ctx.arc(base.x, base.y, r * GRID_SIZE, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        // 2. Draw Path Buffers (No Build Zone - 1.5 units)
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.lineWidth = GRID_SIZE * 3; // 1.5 units each side = 3 units total
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let pathData of paths) {
            const path = pathData.points;
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }
            ctx.stroke();
        }
        ctx.restore();
    }
    for (let pathData of paths) {
        const path = pathData.points;
        const pathBounds = getPathBoundsCached(pathData);
        if (!isBoundsVisible(pathBounds, viewMinX, viewMaxX, viewMinY, viewMaxY)) continue;
        const riftLevel = pathData.level || 1;
        const mutation = pathData.mutation;

        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // HIGHLIGHTING LOGIC: 
        // Individual selection always glows. Zone selection only glows if debug overlay is active.
        const isIndividualSelected = (pathData === selectedRift);
        const isZoneSelected = showNoBuildOverlay && (pathData.zone === selectedZone);
        const isHighlighted = isIndividualSelected || isZoneSelected;

        ctx.lineWidth = GRID_SIZE * (isHighlighted ? 1.6 : 0.8);
        ctx.shadowBlur = isHighlighted ? 30 : 10;

        let pathColor = mutation ? mutation.color : (riftLevel > 1 ? 'rgba(255, 0, 172, 0.4)' : 'rgba(0, 243, 255, 0.1)');
        if (isHighlighted) pathColor = mutation ? mutation.color : (riftLevel > 1 ? '#ff00ac' : '#00f3ff');

        ctx.shadowColor = pathColor;
        ctx.strokeStyle = mutation ? `${mutation.color}11` : (riftLevel > 1 ? 'rgba(255, 0, 172, 0.1)' : 'rgba(0, 243, 255, 0.05)');
        if (isHighlighted) ctx.strokeStyle = pathColor + '33';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Center Line
        ctx.lineWidth = isHighlighted ? 4 : 2;
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
        if (mutation && (isIndividualSelected || isZoneSelected)) {
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

    drawHardpoints();

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
        if (!isWorldPointVisible(t.x, t.y, 120)) continue;
        drawTowerOne(t.type, t.x, t.y, t.color, t.hardpointScale || 1);
        // Draw Level Pips
        if (t.level > 1) {
            drawLevelPips(t.level, t.x, t.y + 20);
        }
    }
    drawArcTowerLinks();

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
        if (!isWorldPointVisible(e.x, e.y, 140)) continue;
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

        // Elite Visuals (Veteran Rifts): compact single marker above unit.
        if (e.riftLevel > 1) {
            const markerY = e.y - (e.width ? e.width / 2 : 10) - 8;
            const markerSize = Math.min(6, 4 + Math.floor((e.riftLevel - 1) / 2));

            ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
            ctx.beginPath();
            ctx.moveTo(e.x, markerY - markerSize);
            ctx.lineTo(e.x + markerSize, markerY);
            ctx.lineTo(e.x, markerY + markerSize);
            ctx.lineTo(e.x - markerSize, markerY);
            ctx.closePath();
            ctx.fill();
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
        if (!isWorldPointVisible(p.x, p.y, 90)) continue;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    drawArcLightningBursts();

    // Draw Particles
    for (let p of particles) {
        if (!isWorldPointVisible(p.x, p.y, 80)) continue;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
        ctx.globalAlpha = 1.0;
    }
    perfEnd('drawWorld', perfDrawWorld);

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
    const perfDrawStatus = perfBegin('drawStatus');
    // Frozen pulse on enemies
    const renderStaticStatus = activeStaticStatusCount > 0;
    const useHalfRateStatus = PERFORMANCE_RULES.enabled
        && renderStaticStatus
        && enemies.length >= PERFORMANCE_RULES.statusHalfRateEnemyThreshold
        && ((frameCount & 1) === 1);
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

        if (!renderStaticStatus) return;

        const staticCharges = e.staticCharges || 0;
        const hasStatic = staticCharges > 0;
        const isStaticStunned = (e.staticStunTimer || 0) > 0;
        if (!hasStatic && !isStaticStunned) return;
        if (!isWorldPointVisible(e.x, e.y, 90)) return;

        let nearCursor = false;
        if (isHovering && PERFORMANCE_RULES.enabled) {
            const dx = e.x - mouseX;
            const dy = e.y - mouseY;
            const maxDist = PERFORMANCE_RULES.staticLabelNearCursorRadius;
            nearCursor = ((dx * dx) + (dy * dy)) <= (maxDist * maxDist);
        }

        // Under pressure, update static status visuals every other frame except near cursor.
        if (useHalfRateStatus && !nearCursor) return;

        const r = (e.width ? e.width / 2 : 10) + 8;
        const pulse = 1 + Math.sin(frameCount * 0.35 + e.x * 0.01) * 0.12;

        if (hasStatic) {
            ctx.strokeStyle = 'rgba(124, 215, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 5]);
            ctx.lineDashOffset = -frameCount * 0.8;
            ctx.beginPath();
            ctx.arc(e.x, e.y, r * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            const showStaticLabel = nearCursor;
            if (showStaticLabel && ((frameCount & 1) === 0 || isStaticStunned)) {
                ctx.fillStyle = '#b8e9ff';
                ctx.font = 'bold 10px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText(`S:${staticCharges}`, e.x, e.y - r - 7);
            }
        }

        if (isStaticStunned) {
            ctx.strokeStyle = '#e6f8ff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(e.x, e.y, (r + 4) * pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Electric starburst around stunned target
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 * i / 6) + (frameCount * 0.06);
                const x1 = e.x + Math.cos(a) * (r + 1);
                const y1 = e.y + Math.sin(a) * (r + 1);
                const x2 = e.x + Math.cos(a) * (r + 9 + (i % 2 ? 2 : 0));
                const y2 = e.y + Math.sin(a) * (r + 9 + (i % 2 ? 2 : 0));
                ctx.strokeStyle = 'rgba(196, 236, 255, 0.9)';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }
    });

    // Overclock pulse on towers
    towers.forEach(t => {
        if (t.overclocked) {
            if (!isWorldPointVisible(t.x, t.y, 120)) return;
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
    perfEnd('drawStatus', perfDrawStatus);

    // --- Dynamic Lighting Rendering ---
    const perfDrawLighting = perfBegin('drawLighting');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const light of lightSources) {
        if (!isWorldPointVisible(light.x, light.y, light.radius + 40)) continue;
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
    perfEnd('drawLighting', perfDrawLighting);

    ctx.restore(); // Restore from camera transform

    // Re-apply camera transform for UI overlays so they match world coordinates
    ctx.save();
    ctx.translate(camera.x + sx, camera.y + sy);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw Placement Preview (Overlay on top of lighting)
    // Locked to buildTarget if it exists and a tower is selected
    if (gameState === 'playing' && selectedTowerType && buildTarget) {
        const towerConfig = TOWERS[selectedTowerType];

        // Use buildTarget coordinates instead of mouseX/mouseY
        const validation = isValidPlacement(buildTarget.x, buildTarget.y, towerConfig);
        const snap = buildTarget;
        const previewHardpoint = validation.hardpoint || null;
        const previewScale = previewHardpoint
            ? (previewHardpoint.type === 'core' ? HARDPOINT_RULES.core.sizeScale : HARDPOINT_RULES.micro.sizeScale)
            : 1;

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
        drawTowerOne(selectedTowerType, snap.x, snap.y, color, previewScale);

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
    perfEnd('draw', perfDraw);
    perfMaybeReport();
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

function drawHardpoints() {
    if (!hardpoints.length) return;

    const occupiedSlots = new Set();
    for (const t of towers) {
        occupiedSlots.add(`${Math.floor(t.x / GRID_SIZE)},${Math.floor(t.y / GRID_SIZE)}`);
    }

    let activeBuildKey = null;
    if (buildTarget) {
        activeBuildKey = `${Math.floor(buildTarget.x / GRID_SIZE)},${Math.floor(buildTarget.y / GRID_SIZE)}`;
    }

    for (const hp of hardpoints) {
        if (!isWorldPointVisible(hp.x, hp.y, 90)) continue;
        const key = `${hp.c},${hp.r}`;
        const isOccupied = occupiedSlots.has(key);
        const isSelected = activeBuildKey === key;
        const isCore = hp.type === 'core';

        const radius = isCore ? GRID_SIZE * 0.36 : GRID_SIZE * 0.25;
        const ringColor = isCore ? '#00ff41' : '#fcee0a';
        const fillColor = isCore ? 'rgba(0, 255, 65, 0.09)' : 'rgba(252, 238, 10, 0.08)';

        ctx.save();
        ctx.shadowBlur = isSelected ? 18 : 10;
        ctx.shadowColor = ringColor;
        ctx.lineWidth = isSelected ? 3 : (isCore ? 2.4 : 1.8);
        ctx.strokeStyle = isOccupied ? 'rgba(255,255,255,0.3)' : ringColor;
        ctx.fillStyle = isOccupied ? 'rgba(255,255,255,0.06)' : fillColor;

        ctx.beginPath();
        ctx.arc(hp.x, hp.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (!isOccupied) {
            ctx.beginPath();
            ctx.moveTo(hp.x - radius * 0.45, hp.y);
            ctx.lineTo(hp.x + radius * 0.45, hp.y);
            ctx.moveTo(hp.x, hp.y - radius * 0.45);
            ctx.lineTo(hp.x, hp.y + radius * 0.45);
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = isCore ? 'rgba(0, 255, 65, 0.75)' : 'rgba(252, 238, 10, 0.65)';
            ctx.stroke();
        }

        ctx.restore();
    }
}

function drawTowerOne(type, x, y, color, scale = 1) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    const s = Math.max(0.5, scale || 1);

    ctx.beginPath();
    if (type === 'basic') {
        // Square
        ctx.rect(x - 13 * s, y - 13 * s, 26 * s, 26 * s);
    } else if (type === 'rapid') {
        // Circle
        ctx.arc(x, y, 13 * s, 0, Math.PI * 2);
    } else if (type === 'sniper') {
        // Diamond (Rotated Square)
        ctx.moveTo(x, y - 15 * s);
        ctx.lineTo(x + 15 * s, y);
        ctx.lineTo(x, y + 15 * s);
        ctx.lineTo(x - 15 * s, y);
    } else if (type === 'arc') {
        // Hex shell + core for an electric relay look
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i / 6) - Math.PI / 2;
            const px = x + Math.cos(a) * 14 * s;
            const py = y + Math.sin(a) * 14 * s;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
    ctx.fill();

    if (type === 'arc') {
        ctx.fillStyle = '#e9f9ff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#b8ebff';
        ctx.beginPath();
        ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
        ctx.fill();
    }
}

function isWorldPointVisible(x, y, margin = 120) {
    const sx = x * camera.zoom + camera.x;
    const sy = y * camera.zoom + camera.y;
    return sx >= -margin && sx <= width + margin && sy >= -margin && sy <= height + margin;
}

function isBoundsVisible(bounds, minX, maxX, minY, maxY) {
    return !(bounds.maxX < minX || bounds.minX > maxX || bounds.maxY < minY || bounds.minY > maxY);
}

function getPathBoundsCached(pathData) {
    if (pathData._bounds && pathData._boundsVersion === pathData.points.length) {
        return pathData._bounds;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pt of pathData.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    }

    pathData._bounds = { minX, minY, maxX, maxY };
    pathData._boundsVersion = pathData.points.length;
    return pathData._bounds;
}

function drawArcTowerLinks() {
    if (ARC_TOWER_RULES.disableCalculationsForPerfTest) return;
    if (!arcTowerLinks || arcTowerLinks.length === 0) return;

    if (ARC_TOWER_RULES.lowAnimationMode) {
        ctx.save();
        ctx.lineCap = 'round';
        for (const link of arcTowerLinks) {
            if (!link || !link.a || !link.b) continue;
            if (!isWorldPointVisible(link.a.x, link.a.y, 120) && !isWorldPointVisible(link.b.x, link.b.y, 120)) continue;

            const intensity = Math.max(1, Math.min(ARC_TOWER_RULES.maxBonus, link.strength || 1));
            ctx.strokeStyle = `rgba(176, 233, 255, ${0.18 + intensity * 0.08})`;
            ctx.lineWidth = 0.8 + intensity * 0.32;
            ctx.beginPath();
            ctx.moveTo(link.a.x, link.a.y);
            ctx.lineTo(link.b.x, link.b.y);
            ctx.stroke();
        }
        ctx.restore();
        return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const linkCount = arcTowerLinks.length;
    const heavyMode = linkCount > 80;
    const ultraMode = linkCount > 140;

    for (const link of arcTowerLinks) {
        if (!link || !link.a || !link.b) continue;
        if (!isWorldPointVisible(link.a.x, link.a.y, 140) && !isWorldPointVisible(link.b.x, link.b.y, 140)) continue;
        const intensity = Math.max(1, Math.min(ARC_TOWER_RULES.maxBonus, link.strength || 1));
        const dashOffset = -(frameCount * (1.6 + intensity * 0.42));
        const coreWidth = 0.8 + intensity * 0.45;

        if (!ultraMode) {
            // Soft outer glow
            ctx.strokeStyle = `rgba(124, 215, 255, ${0.16 + intensity * 0.07})`;
            ctx.lineWidth = coreWidth + 2.2;
            ctx.beginPath();
            ctx.moveTo(link.a.x, link.a.y);
            ctx.lineTo(link.b.x, link.b.y);
            ctx.stroke();
        }

        // Racing electric dash
        ctx.strokeStyle = `rgba(214, 244, 255, ${0.35 + intensity * 0.08})`;
        ctx.lineWidth = coreWidth;
        ctx.setLineDash(heavyMode ? [6, 10] : [8, Math.max(5, 16 - intensity)]);
        ctx.lineDashOffset = dashOffset;
        ctx.beginPath();
        ctx.moveTo(link.a.x, link.a.y);
        ctx.lineTo(link.b.x, link.b.y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (!heavyMode) {
            // Travel pulse marker
            const phase = (frameCount * 0.018 + ((link.a.x + link.a.y + link.b.x + link.b.y) * 0.0007)) % 1;
            const px = link.a.x + (link.b.x - link.a.x) * phase;
            const py = link.a.y + (link.b.y - link.a.y) * phase;
            ctx.fillStyle = '#e6f8ff';
            ctx.shadowBlur = 10 + intensity * 2;
            ctx.shadowColor = '#9fe3ff';
            ctx.beginPath();
            ctx.arc(px, py, 1.5 + intensity * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

function drawArcLightningBursts() {
    if (ARC_TOWER_RULES.disableCalculationsForPerfTest) return;
    if (!arcLightningBursts || arcLightningBursts.length === 0) return;

    if (ARC_TOWER_RULES.lowAnimationMode) {
        ctx.save();
        ctx.lineCap = 'round';
        for (const burst of arcLightningBursts) {
            if (!isWorldPointVisible(burst.x1, burst.y1, 120) && !isWorldPointVisible(burst.x2, burst.y2, 120)) continue;

            const alpha = Math.max(0, Math.min(1, burst.life / (burst.isChain ? 7 : 8)));

            // Keep direct tower shots visible every frame with fixed-cost styling.
            if (!burst.isChain) {
                const dx = burst.x2 - burst.x1;
                const dy = burst.y2 - burst.y1;
                const len = Math.hypot(dx, dy);

                if (len > 0.001) {
                    const nx = -dy / len;
                    const ny = dx / len;
                    const midX = burst.x1 + dx * 0.5 + nx * 2.5;
                    const midY = burst.y1 + dy * 0.5 + ny * 2.5;

                    ctx.strokeStyle = `rgba(225, 250, 255, ${0.62 * alpha})`;
                    ctx.lineWidth = 1.9;
                    ctx.beginPath();
                    ctx.moveTo(burst.x1, burst.y1);
                    ctx.lineTo(midX, midY);
                    ctx.lineTo(burst.x2, burst.y2);
                    ctx.stroke();

                    // Thin core line for readability without expensive glow passes.
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.78 * alpha})`;
                    ctx.lineWidth = 0.9;
                    ctx.beginPath();
                    ctx.moveTo(burst.x1, burst.y1);
                    ctx.lineTo(midX, midY);
                    ctx.lineTo(burst.x2, burst.y2);
                    ctx.stroke();
                }
                continue;
            }

            // Bounce arcs stay cheaper: single segment and half-rate updates.
            if ((frameCount & 1) === 1) continue;
            ctx.strokeStyle = `rgba(204, 244, 255, ${0.28 * alpha})`;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(burst.x1, burst.y1);
            ctx.lineTo(burst.x2, burst.y2);
            ctx.stroke();
        }
        ctx.restore();
        return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const burstCount = arcLightningBursts.length;
    const heavyMode = burstCount > 160;

    for (const burst of arcLightningBursts) {
        if (!isWorldPointVisible(burst.x1, burst.y1, 140) && !isWorldPointVisible(burst.x2, burst.y2, 140)) continue;
        const alpha = Math.max(0, Math.min(1, burst.life / (burst.isChain ? 7 : 8)));
        const intensity = Math.max(1, Math.min(ARC_TOWER_RULES.maxBonus, burst.intensity || 1));
        const jitter = 2 + intensity * 0.65;

        const dx = burst.x2 - burst.x1;
        const dy = burst.y2 - burst.y1;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;

        const nx = -dy / len;
        const ny = dx / len;
        const points = heavyMode ? 3 : 5;

        ctx.beginPath();
        ctx.moveTo(burst.x1, burst.y1);
        for (let i = 1; i < points; i++) {
            const t = i / points;
            const bx = burst.x1 + dx * t;
            const by = burst.y1 + dy * t;
            const wave = Math.sin((frameCount * 0.4) + i * 2.5) * jitter;
            ctx.lineTo(bx + nx * wave, by + ny * wave);
        }
        ctx.lineTo(burst.x2, burst.y2);

        ctx.strokeStyle = `rgba(236, 250, 255, ${(heavyMode ? 0.55 : 0.7) * alpha})`;
        ctx.lineWidth = (heavyMode ? 0.9 : 1) + intensity * 0.15;
        ctx.stroke();

        if (!heavyMode) {
            ctx.strokeStyle = `rgba(130, 220, 255, ${0.26 * alpha})`;
            ctx.lineWidth = 3 + intensity * 0.45;
            ctx.stroke();
        }
    }

    ctx.restore();
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
