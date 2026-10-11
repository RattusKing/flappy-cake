// Game Configuration
const CONFIG = {
    canvas: {
        width: 480,
        height: 640,
        // Height of the floor strip at the bottom of the screen
        ground: 22
    },
    cake: {
        x: 120,
        size: 40,
        gravity: 0.6,
        jump: -10,
        maxVelocity: 12
    },
    candles: {
        width: 60,
        gap: 180,
        spacing: 250,
        speed: 2.5,
        minHeight: 100,
        maxHeight: 350,
        // Space between the wax and the edge of the gap, occupied by the wick
        // and flame. Touching the flame counts as a hit.
        flameZone: 30
    },
    powerups: {
        radius: 16,
        // Minimum candles between pickups, then a per-candle roll
        cooldown: 5,
        chance: 0.2,
        // While the magnet is active the cooldown is skipped and the roll is higher
        magnetChance: 0.35,
        magnetRange: 220,
        // Brief invulnerability after a shield pops, a revive, or ghost/shrink ending
        graceFrames: 90,
        speedFactor: 1.3,
        ghostSpeedFactor: 1.5,
        shrinkScale: 0.6
    },
    colors: {
        cake: '#ff6b9d',
        frosting: '#feca57',
        candle: '#ee5a6f',
        flame: '#feca57',
        background: ['#1a1a2e', '#16213e'],
        neon: ['#48dbfb', '#0abde3', '#10ac84', '#00d2d3']
    }
};

// Power-ups. weight = relative spawn odds; duration is in frames (60 = 1s),
// and items without one are instant or held until used.
const POWERUPS = {
    speedUp:    { icon: '⚡', label: 'SPEED UP',       color: '#feca57', weight: 14, duration: 360 },
    slowDown:   { icon: '🐢', label: 'SLOW DOWN',      color: '#1dd1a1', weight: 14, duration: 360 },
    shrink:     { icon: '🧁', label: 'MINI CAKE',      color: '#ff9ff3', weight: 12, duration: 420 },
    multiplier: { icon: '🍦', label: 'DOUBLE SCOOP',   color: '#ffeaa7', weight: 12, duration: 480 },
    preview:    { icon: '🔮', label: 'X-RAY FROSTING', color: '#a29bfe', weight: 10, duration: 600 },
    magnet:     { icon: '🧲', label: 'MAGNET',         color: '#ff6b6b', weight: 10, duration: 600 },
    shield:     { icon: '🛡️', label: 'SHIELD',         color: '#48dbfb', weight: 8 },
    snuffer:    { icon: '💨', label: 'CANDLE SNUFFER', color: '#dfe6e9', weight: 8 },
    ghost:      { icon: '👻', label: 'GHOST RUSH',     color: '#c8d6e5', weight: 6, duration: 300 },
    revive:     { icon: '❤️', label: 'EXTRA LIFE',     color: '#ff4757', weight: 4 }
};

// Game State
const game = {
    canvas: null,
    ctx: null,
    running: false,
    hasStarted: false,
    score: 0,
    highScore: 0,
    frames: 0,
    // Backing-store scale: canvas pixels per logical pixel (see resizeCanvas)
    scale: { x: 1, y: 1 },
    cake: {
        y: CONFIG.canvas.height / 2,
        velocity: 0,
        rotation: 0
    },
    candles: [],
    particles: [],
    // Pre-rolled top heights for upcoming candles (lets X-ray preview them)
    gapQueue: [],
    spawnDistance: 0,
    pickups: [],
    candlesSincePickup: 0,
    // Timed power-ups: type -> frames remaining
    effects: {},
    shield: false,
    revive: false,
    grace: 0,
    pendingSnuff: 0,
    toasts: [],
    background: {
        stars: [],
        bokeh: []
    }
};

// Y coordinate of the floor surface
function groundY() {
    return CONFIG.canvas.height - CONFIG.canvas.ground;
}

// Initialize Game
function init() {
    game.canvas = document.getElementById('gameCanvas');
    game.ctx = game.canvas.getContext('2d');

    // Match the backing store to the on-screen size so the game stays crisp
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Load high score
    game.highScore = parseInt(localStorage.getItem('flappyCakeHighScore') || '0');
    updateHighScoreDisplay();

    // Initialize background
    initBackground();

    // Event listeners
    document.getElementById('startButton').addEventListener('click', startGame);
    document.getElementById('restartButton').addEventListener('click', startGame);

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && game.running) {
            e.preventDefault();
            jump();
        }
    });

    // pointerdown covers mouse, touch and pen without the tap delay
    game.canvas.addEventListener('pointerdown', (e) => {
        if (game.running) {
            e.preventDefault();
            jump();
        }
    });

    // Start animation loop
    gameLoop();
}

// Resize Canvas
// The game logic always works in CONFIG.canvas units (480x640). The canvas
// element is scaled by CSS to fill the viewport, so here we size the backing
// store to the real on-screen pixel count (including device pixel ratio) and
// remember the scale factor, which render() applies as a transform.
function resizeCanvas() {
    const rect = game.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (game.canvas.width !== width || game.canvas.height !== height) {
        game.canvas.width = width;
        game.canvas.height = height;
    }

    game.scale.x = width / CONFIG.canvas.width;
    game.scale.y = height / CONFIG.canvas.height;
}

// Initialize Background Elements
function initBackground() {
    // Create stars
    for (let i = 0; i < 100; i++) {
        game.background.stars.push({
            x: Math.random() * CONFIG.canvas.width,
            y: Math.random() * CONFIG.canvas.height,
            size: Math.random() * 2,
            brightness: Math.random()
        });
    }

    // Create soft out-of-focus lights that drift upward
    const bokehColors = [CONFIG.colors.cake, CONFIG.colors.frosting, CONFIG.colors.neon[0], '#ffffff'];
    for (let i = 0; i < 14; i++) {
        game.background.bokeh.push({
            x: Math.random() * CONFIG.canvas.width,
            y: Math.random() * CONFIG.canvas.height,
            radius: Math.random() * 14 + 8,
            alpha: Math.random() * 0.09 + 0.05,
            speed: Math.random() * 0.25 + 0.12,
            drift: Math.random() * Math.PI * 2,
            color: bokehColors[Math.floor(Math.random() * bokehColors.length)]
        });
    }
}

// Start Game
function startGame() {
    // Browsers suspend audio until a user gesture; the button click is one
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    game.running = true;
    game.hasStarted = false;
    game.score = 0;
    game.frames = 0;
    game.cake.y = CONFIG.canvas.height / 2;
    game.cake.velocity = 0;
    game.cake.rotation = 0;
    game.candles = [];
    game.particles = [];
    game.gapQueue = [];
    game.spawnDistance = CONFIG.candles.spacing / 2;
    game.pickups = [];
    game.candlesSincePickup = 0;
    game.effects = {};
    game.shield = false;
    game.revive = false;
    game.grace = 0;
    game.pendingSnuff = 0;
    game.toasts = [];

    // Hide screens
    document.getElementById('startScreen').classList.remove('active');
    document.getElementById('gameOverScreen').classList.remove('active');

    updateScoreDisplay();
}

// Jump
function jump() {
    game.hasStarted = true;
    game.cake.velocity = CONFIG.cake.jump;
    createParticles(CONFIG.cake.x, game.cake.y, 5, CONFIG.colors.frosting);
    playSound('jump');
}

// Game Loop
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// Update Game State
function update() {
    if (!game.running) return;

    game.frames++;

    updateEffects();
    const speedMul = speedMultiplier();

    // Update cake physics (only if game has started)
    if (game.hasStarted) {
        game.cake.velocity += CONFIG.cake.gravity;
        game.cake.velocity = Math.min(game.cake.velocity, CONFIG.cake.maxVelocity);
        game.cake.y += game.cake.velocity;

        // Update rotation based on velocity
        game.cake.rotation = Math.min(Math.max(game.cake.velocity * 3, -30), 90);
    }

    // Check boundaries (only if game has started)
    const half = cakeHalf();
    if (game.hasStarted && (game.cake.y + half > groundY() || game.cake.y - half < 0)) {
        const hitFloor = game.cake.y + half > groundY();
        game.cake.y = Math.min(Math.max(game.cake.y, half), groundY() - half);
        if (game.grace <= 0 && takeHit()) return;
        // Survived: bounce off the floor or ceiling
        game.cake.velocity = hitFloor ? CONFIG.cake.jump : 2;
    }

    // Spawn candles by distance travelled so spacing stays constant at any speed
    if (game.hasStarted) {
        game.spawnDistance += getDifficulty().speed * speedMul;
        if (game.spawnDistance >= CONFIG.candles.spacing) {
            game.spawnDistance -= CONFIG.candles.spacing;
            spawnCandle();
        }
    }

    // Ghost trail
    if (game.effects.ghost && game.frames % 2 === 0) {
        createParticles(CONFIG.cake.x - half, game.cake.y, 1, POWERUPS.ghost.color);
    }

    const ignoreCandles = game.effects.ghost || game.grace > 0;

    // Update candles
    for (let i = game.candles.length - 1; i >= 0; i--) {
        const candle = game.candles[i];
        candle.x -= candle.speed * speedMul;

        // Remove off-screen candles
        if (candle.x + CONFIG.candles.width < 0) {
            game.candles.splice(i, 1);
            continue;
        }

        // Score point
        if (!candle.scored && candle.x + CONFIG.candles.width < CONFIG.cake.x) {
            candle.scored = true;
            game.score += game.effects.multiplier ? 2 : 1;
            updateScoreDisplay();
            createParticles(CONFIG.cake.x, game.cake.y, 15, CONFIG.colors.frosting);
            createParticles(CONFIG.cake.x, game.cake.y, 10, CONFIG.colors.cake);
            animateScorePop();
            playSound('score');
        }

        // Collision detection
        if (!candle.snuffed && !ignoreCandles && checkCollision(candle)) {
            if (takeHit()) return;
            break;
        }
    }

    updatePickups(speedMul);
    updateToasts();

    // Update particles
    updateParticles();

    // Update background
    updateBackground();
}

// Get Difficulty Multipliers Based on Score
function getDifficulty() {
    const level = Math.floor(game.score / 10);

    // Gap shrinks: 180 -> 120 (33% reduction at level 5)
    const gapReduction = Math.min(level * 12, 60);
    const gap = CONFIG.candles.gap - gapReduction;

    // Speed increases: 2.5 -> 4.5 (80% faster at level 5)
    const speedIncrease = Math.min(level * 0.4, 2);
    const speed = CONFIG.candles.speed + speedIncrease;

    // Height randomness increases (more extreme heights)
    const heightVariance = Math.min(level * 15, 75);
    const minHeight = CONFIG.candles.minHeight - heightVariance;
    const maxHeight = CONFIG.candles.maxHeight + heightVariance;

    return { gap, speed, minHeight, maxHeight };
}

function rollTopHeight() {
    const difficulty = getDifficulty();
    return Math.random() * (difficulty.maxHeight - difficulty.minHeight) + difficulty.minHeight;
}

// Spawn Candle
function spawnCandle() {
    const difficulty = getDifficulty();
    while (game.gapQueue.length < 3) {
        game.gapQueue.push(rollTopHeight());
    }
    const topHeight = game.gapQueue.shift();
    game.gapQueue.push(rollTopHeight());

    const candle = {
        x: CONFIG.canvas.width,
        topHeight: topHeight,
        bottomY: topHeight + difficulty.gap,
        scored: false,
        snuffed: false,
        speed: difficulty.speed,
        // Random phase so the flames don't all flicker in sync
        flicker: Math.random() * Math.PI * 2
    };
    if (game.pendingSnuff > 0) {
        candle.snuffed = true;
        game.pendingSnuff--;
    }
    game.candles.push(candle);

    maybeSpawnPickup(candle);
}

// Half the cake's current hitbox size (smaller while shrunk)
function cakeHalf() {
    const scale = game.effects.shrink ? CONFIG.powerups.shrinkScale : 1;
    return CONFIG.cake.size * scale / 2;
}

function speedMultiplier() {
    const P = CONFIG.powerups;
    let mul = 1;
    if (game.effects.speedUp) mul *= P.speedFactor;
    if (game.effects.slowDown) mul /= P.speedFactor;
    if (game.effects.ghost) mul *= P.ghostSpeedFactor;
    return mul;
}

function updateEffects() {
    for (const type in game.effects) {
        game.effects[type]--;
        if (game.effects[type] <= 0) {
            delete game.effects[type];
            // Don't kill the player the instant they turn solid or grow back
            if (type === 'ghost' || type === 'shrink') {
                game.grace = Math.max(game.grace, CONFIG.powerups.graceFrames);
            }
        }
    }
    if (game.grace > 0) game.grace--;
}

function rollPowerupType() {
    const types = Object.keys(POWERUPS).filter(type =>
        !(type === 'shield' && game.shield) &&
        !(type === 'revive' && game.revive) &&
        !(type === 'magnet' && game.effects.magnet)
    );
    const total = types.reduce((sum, type) => sum + POWERUPS[type].weight, 0);
    let roll = Math.random() * total;
    for (const type of types) {
        roll -= POWERUPS[type].weight;
        if (roll < 0) return type;
    }
    return types[types.length - 1];
}

// Maybe drop a pickup halfway between this candle and the next one, roughly
// on the line between their two gaps so it's reachable with a bit of effort.
function maybeSpawnPickup(candle) {
    const P = CONFIG.powerups;
    game.candlesSincePickup++;

    if (game.pickups.length > 0) return;
    const magnet = !!game.effects.magnet;
    if (!magnet && game.candlesSincePickup < P.cooldown) return;
    if (Math.random() >= (magnet ? P.magnetChance : P.chance)) return;

    const gap = getDifficulty().gap;
    const here = candle.topHeight + gap / 2;
    const next = game.gapQueue[0] + gap / 2;
    const margin = 60;
    const y = Math.min(Math.max((here + next) / 2 + (Math.random() - 0.5) * 80, margin), groundY() - margin);

    game.pickups.push({
        type: rollPowerupType(),
        x: candle.x + CONFIG.candles.width / 2 + CONFIG.candles.spacing / 2,
        baseY: y,
        y: y,
        speed: candle.speed,
        bob: Math.random() * Math.PI * 2
    });
    game.candlesSincePickup = 0;
}

function updatePickups(speedMul) {
    const P = CONFIG.powerups;
    for (let i = game.pickups.length - 1; i >= 0; i--) {
        const p = game.pickups[i];
        p.x -= p.speed * speedMul;
        p.bob += 0.08;

        if (game.effects.magnet) {
            const dx = CONFIG.cake.x - p.x;
            const dy = game.cake.y - p.baseY;
            if (Math.hypot(dx, dy) < P.magnetRange) {
                p.x += dx * 0.12;
                p.baseY += dy * 0.12;
            }
        }
        p.y = p.baseY + Math.sin(p.bob) * 6;

        if (p.x + P.radius < 0) {
            game.pickups.splice(i, 1);
            continue;
        }

        if (Math.hypot(CONFIG.cake.x - p.x, game.cake.y - p.y) < cakeHalf() + P.radius) {
            game.pickups.splice(i, 1);
            collectPowerup(p);
        }
    }
}

function collectPowerup(pickup) {
    const type = pickup.type;
    const def = POWERUPS[type];

    if (def.duration) game.effects[type] = def.duration;
    if (type === 'speedUp') delete game.effects.slowDown;
    if (type === 'slowDown') delete game.effects.speedUp;
    if (type === 'shield') game.shield = true;
    if (type === 'revive') game.revive = true;
    if (type === 'snuffer') snuffNextCandle();

    showToast(def.icon + ' ' + def.label, def.color);
    createParticles(pickup.x, pickup.y, 20, def.color);
    createParticles(pickup.x, pickup.y, 8, '#ffffff');
    playSound('powerup');
}

// Blow out the next candle ahead of the cake (or the next one to spawn)
function snuffNextCandle() {
    const front = CONFIG.cake.x + cakeHalf();
    const candle = game.candles.find(c => !c.snuffed && c.x > front);
    if (candle) {
        snuffCandle(candle);
    } else {
        game.pendingSnuff++;
    }
}

function snuffCandle(candle) {
    candle.snuffed = true;
    const x = candle.x + CONFIG.candles.width / 2;
    createParticles(x, candle.topHeight, 8, '#b2bec3');
    createParticles(x, candle.bottomY, 8, '#b2bec3');
}

// Something hit the cake. Shield absorbs it, then a revive, otherwise game
// over. Returns true if the run ended.
function takeHit() {
    if (game.shield) {
        game.shield = false;
        game.grace = CONFIG.powerups.graceFrames;
        createParticles(CONFIG.cake.x, game.cake.y, 25, POWERUPS.shield.color);
        showToast('SHIELD POPPED!', POWERUPS.shield.color);
        playSound('shield');
        return false;
    }

    if (game.revive) {
        game.revive = false;
        reviveCake();
        return false;
    }

    gameOver();
    return true;
}

// Second chance: score and timers are kept, the candles right in front of the
// cake are blown out, and it gets a moment of invulnerability.
function reviveCake() {
    const reach = CONFIG.cake.x + 220;
    game.candles.forEach(c => {
        if (!c.snuffed && c.x + CONFIG.candles.width > CONFIG.cake.x - cakeHalf() && c.x < reach) {
            snuffCandle(c);
        }
    });

    const nextCandle = game.candles.find(c => !c.snuffed && c.x > CONFIG.cake.x);
    game.cake.y = nextCandle ? (nextCandle.topHeight + nextCandle.bottomY) / 2 : CONFIG.canvas.height / 2;
    game.cake.velocity = CONFIG.cake.jump * 0.6;
    game.grace = CONFIG.powerups.graceFrames * 1.5;

    createParticles(CONFIG.cake.x, game.cake.y, 30, POWERUPS.revive.color);
    createParticles(CONFIG.cake.x, game.cake.y, 15, '#ffffff');
    showToast('❤️ REVIVED!', POWERUPS.revive.color);
    playSound('revive');
}

function showToast(text, color) {
    game.toasts.push({ text, color, life: 80, maxLife: 80 });
    if (game.toasts.length > 3) game.toasts.shift();
}

function updateToasts() {
    for (let i = game.toasts.length - 1; i >= 0; i--) {
        if (--game.toasts[i].life <= 0) game.toasts.splice(i, 1);
    }
}

// Check Collision
function checkCollision(candle) {
    const half = cakeHalf();
    const cakeLeft = CONFIG.cake.x - half;
    const cakeRight = CONFIG.cake.x + half;
    const cakeTop = game.cake.y - half;
    const cakeBottom = game.cake.y + half;

    const candleLeft = candle.x;
    const candleRight = candle.x + CONFIG.candles.width;

    // Check if cake is in candle's x range
    if (cakeRight > candleLeft && cakeLeft < candleRight) {
        // Check if cake hits top or bottom candle
        if (cakeTop < candle.topHeight || cakeBottom > candle.bottomY) {
            return true;
        }
    }

    return false;
}

// Create Particles
function createParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        game.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 40,
            maxLife: 40,
            size: Math.random() * 5 + 2,
            color: color,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.2
        });
    }
}

// Update Particles
function updateParticles() {
    for (let i = game.particles.length - 1; i >= 0; i--) {
        const p = game.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.rotation += p.rotationSpeed;
        p.life--;

        if (p.life <= 0) {
            game.particles.splice(i, 1);
        }
    }
}

// Update Background
function updateBackground() {
    // Twinkle stars
    game.background.stars.forEach(star => {
        star.brightness += (Math.random() - 0.5) * 0.1;
        star.brightness = Math.max(0, Math.min(1, star.brightness));
    });

    // Float bokeh lights upward with a gentle sideways wobble
    game.background.bokeh.forEach(light => {
        light.y -= light.speed;
        light.drift += 0.01;
        light.x += Math.sin(light.drift) * 0.15;
        if (light.y + light.radius < 0) {
            light.y = CONFIG.canvas.height + light.radius;
            light.x = Math.random() * CONFIG.canvas.width;
        }
    });
}

// Render Game
function render() {
    const ctx = game.ctx;

    // Map logical 480x640 coordinates onto the (possibly much larger) backing store
    ctx.setTransform(game.scale.x, 0, 0, game.scale.y, 0, 0);

    // Clear canvas
    ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    // Draw background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.canvas.height);
    gradient.addColorStop(0, CONFIG.colors.background[0]);
    gradient.addColorStop(1, CONFIG.colors.background[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    // Draw stars
    game.background.stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });

    // Draw bokeh lights
    game.background.bokeh.forEach(light => {
        const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
        glow.addColorStop(0, light.color);
        glow.addColorStop(0.7, light.color);
        glow.addColorStop(1, light.color + '00');
        ctx.globalAlpha = light.alpha;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Draw floor
    drawFloor(ctx);

    // Draw candles
    game.candles.forEach(candle => {
        drawCandle(ctx, candle);
    });

    if (game.effects.preview) {
        drawPreview(ctx);
    }

    game.pickups.forEach(p => drawPickup(ctx, p));

    // Draw particles
    game.particles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life / p.maxLife;

        // Particle glow
        const particleGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
        particleGlow.addColorStop(0, p.color);
        particleGlow.addColorStop(0.5, p.color + '80');
        particleGlow.addColorStop(1, p.color + '00');
        ctx.fillStyle = particleGlow;
        ctx.fillRect(-p.size * 2, -p.size * 2, p.size * 4, p.size * 4);

        // Particle core
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);

        ctx.globalAlpha = 1;
        ctx.restore();
    });

    // Draw cake
    if (game.running) {
        drawCake(ctx);
        drawPowerupHud(ctx);
    }

    drawToasts(ctx);
}

// Pickup: glowing orb in the item's colour with its icon inside
function drawPickup(ctx, p) {
    const def = POWERUPS[p.type];
    const r = CONFIG.powerups.radius;
    const pulse = 1 + Math.sin(p.bob * 1.5) * 0.08;

    ctx.save();
    ctx.translate(p.x, p.y);

    const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.2);
    glow.addColorStop(0, def.color + 'aa');
    glow.addColorStop(1, def.color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(20, 16, 40, 0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Colour emoji ignore fillStyle; this keeps monochrome fallbacks visible
    ctx.fillStyle = '#fff';
    ctx.fillText(def.icon, 0, 1);
    ctx.restore();
}

// X-ray frosting: glowing markers on the right edge showing where the next
// two (not yet visible) gaps will be
function drawPreview(ctx) {
    const gap = getDifficulty().gap;
    const color = POWERUPS.preview.color;
    ctx.save();
    game.gapQueue.slice(0, 2).forEach((top, i) => {
        const x = CONFIG.canvas.width - 10 - i * 12;
        ctx.globalAlpha = i === 0 ? 0.85 : 0.4;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + gap);
        ctx.stroke();
        ctx.setLineDash([]);
        [top, top + gap].forEach(y => {
            ctx.beginPath();
            ctx.moveTo(x - 7, y);
            ctx.lineTo(x + 3, y);
            ctx.stroke();
        });
    });
    ctx.restore();
}

// Active power-ups under the Best pill: timed ones show a draining ring
function drawPowerupHud(ctx) {
    const badges = Object.keys(game.effects).map(type => ({
        type, fraction: game.effects[type] / POWERUPS[type].duration
    }));
    if (game.shield) badges.push({ type: 'shield', fraction: 1 });
    if (game.revive) badges.push({ type: 'revive', fraction: 1 });

    const r = 14;
    badges.forEach((badge, i) => {
        const def = POWERUPS[badge.type];
        const x = 24 + r + i * (r * 2 + 8);
        const y = 92;
        // Blink during the last two seconds
        const ending = badge.fraction < 1 && game.effects[badge.type] < 120;
        ctx.save();
        ctx.globalAlpha = ending && Math.floor(game.frames / 8) % 2 ? 0.4 : 1;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = def.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * badge.fraction);
        ctx.stroke();

        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(def.icon, x, y + 1);
        ctx.restore();
    });
}

// Floating "you got X" labels in the middle of the screen
function drawToasts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 26px Fredoka, 'Arial Rounded MT Bold', Arial, sans-serif";
    game.toasts.forEach((toast, i) => {
        const age = 1 - toast.life / toast.maxLife;
        const y = 200 - age * 30 + i * 34;
        ctx.globalAlpha = Math.min(1, toast.life / 20);
        ctx.shadowColor = toast.color;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.strokeText(toast.text, CONFIG.canvas.width / 2, y);
        ctx.fillStyle = '#fff';
        ctx.fillText(toast.text, CONFIG.canvas.width / 2, y);
    });
    ctx.restore();
}

// Draw Cake
// A kawaii slice of strawberry cake: two pink sponge layers with a cream
// filling, white frosting dripping over the top, a cherry, and a happy face.
function drawCake(ctx) {
    ctx.save();
    ctx.translate(CONFIG.cake.x, game.cake.y);

    // Shield bubble (drawn unrotated so it stays round)
    if (game.shield) {
        const br = cakeHalf() + 12 + Math.sin(game.frames * 0.1) * 1.5;
        const bubble = ctx.createRadialGradient(0, 0, br * 0.6, 0, 0, br);
        bubble.addColorStop(0, 'rgba(72, 219, 251, 0)');
        bubble.addColorStop(0.85, 'rgba(72, 219, 251, 0.22)');
        bubble.addColorStop(1, 'rgba(72, 219, 251, 0.6)');
        ctx.fillStyle = bubble;
        ctx.beginPath();
        ctx.arc(0, 0, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.ellipse(-br * 0.4, -br * 0.45, br * 0.22, br * 0.1, -0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.rotate(game.cake.rotation * Math.PI / 180);
    if (game.effects.shrink) {
        ctx.scale(CONFIG.powerups.shrinkScale, CONFIG.powerups.shrinkScale);
    }
    if (game.effects.ghost) {
        ctx.globalAlpha = 0.55;
    } else if (game.grace > 0 && Math.floor(game.frames / 5) % 2) {
        ctx.globalAlpha = 0.35;
    }

    const s = CONFIG.cake.size;
    const half = s / 2;
    const top = -half + 4;          // top of the sponge (frosting sits above)
    const bottom = half;
    const bodyH = bottom - top;
    const r = 6;                    // corner radius

    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ff6b9d';
    roundedRect(ctx, -half, top, s, bodyH, r);
    ctx.fill();
    ctx.restore();

    // Sponge body, clipped to the rounded shape
    ctx.save();
    roundedRect(ctx, -half, top, s, bodyH, r);
    ctx.clip();

    const sponge = ctx.createLinearGradient(-half, 0, half, 0);
    sponge.addColorStop(0, '#ff8fb5');
    sponge.addColorStop(0.5, '#ff6b9d');
    sponge.addColorStop(1, '#e64a80');
    ctx.fillStyle = sponge;
    ctx.fillRect(-half, top, s, bodyH);

    // Cream filling between the layers
    ctx.fillStyle = '#fff4f7';
    ctx.fillRect(-half, top + bodyH * 0.48, s, 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(-half, top + bodyH * 0.48 + 4, s, 2);

    // Frosting cap with drips
    ctx.fillStyle = '#fff7fa';
    ctx.fillRect(-half, top, s, 7);
    const drips = [[-half + 5, 7], [-half + 15, 12], [-half + 24, 6], [half - 8, 10]];
    drips.forEach(([dx, len]) => {
        ctx.beginPath();
        ctx.rect(dx - 3, top + 6, 6, len - 3);
        ctx.arc(dx, top + 6 + len - 3, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Sprinkles on the frosting
    const sprinkles = [
        [-half + 4, top + 2, '#48dbfb'], [-half + 11, top + 4, '#feca57'],
        [-half + 20, top + 2, '#ff6b9d'], [-half + 29, top + 4, '#10ac84'],
        [half - 5, top + 2, '#feca57']
    ];
    sprinkles.forEach(([sx, sy, color]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 3, sy + 1.5);
        ctx.stroke();
    });

    // Glossy highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(-half, top, s * 0.35, bodyH);
    ctx.restore();

    // Cherry stem and cherry on top
    ctx.strokeStyle = '#5b8c3a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, top - 5);
    ctx.quadraticCurveTo(3, top - 10, 5, top - 12);
    ctx.stroke();

    const cherry = ctx.createRadialGradient(-1.5, top - 6.5, 1, 0, top - 5, 5);
    cherry.addColorStop(0, '#ff5c8a');
    cherry.addColorStop(1, '#c81e4f');
    ctx.fillStyle = cherry;
    ctx.beginPath();
    ctx.arc(0, top - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(-1.8, top - 7, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Face: eyes
    const eyeY = top + bodyH * 0.3;
    [-7, 7].forEach(ex => {
        ctx.fillStyle = '#2b1a24';
        ctx.beginPath();
        ctx.arc(ex, eyeY, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex - 1.1, eyeY - 1.1, 1.2, 0, Math.PI * 2);
        ctx.fill();
    });

    // Rosy cheeks
    ctx.fillStyle = 'rgba(255, 120, 150, 0.55)';
    [-11, 11].forEach(cx => {
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 5, 3.2, 2, 0, 0, Math.PI * 2);
        ctx.fill();
    });

    // Smile
    ctx.strokeStyle = '#2b1a24';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, eyeY + 4, 3.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    ctx.restore();
}

// Path helper: rounded rectangle
function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Draw Candle
// Each obstacle is a pair of birthday candles: one standing up from the floor
// and one hanging from the ceiling. The wax ends CONFIG.candles.flameZone short
// of the gap edge; the wick and flame fill that zone so the visible obstacle
// matches the collision box.
function drawCandle(ctx, candle) {
    const x = candle.x;
    const width = CONFIG.candles.width;
    const zone = CONFIG.candles.flameZone;
    const lit = !candle.snuffed;

    ctx.save();
    if (!lit) ctx.globalAlpha = 0.35;

    // Hanging candle (flipped vertically so the flame points down into the gap)
    ctx.save();
    ctx.translate(x, candle.topHeight - zone);
    ctx.scale(1, -1);
    drawCandleStick(ctx, width, candle.topHeight - zone, candle.flicker, lit);
    ctx.restore();

    // Standing candle
    ctx.save();
    ctx.translate(x, candle.bottomY + zone);
    drawCandleStick(ctx, width, groundY() - candle.bottomY - zone, candle.flicker + 1.3, lit);
    ctx.restore();

    ctx.restore();
}

// Draw Floor: a dark tabletop the candles stand on
function drawFloor(ctx) {
    const y = groundY();
    const h = CONFIG.canvas.ground;

    const floor = ctx.createLinearGradient(0, y, 0, y + h);
    floor.addColorStop(0, '#2e2148');
    floor.addColorStop(1, '#1b1433');
    ctx.fillStyle = floor;
    ctx.fillRect(0, y, CONFIG.canvas.width, h);

    // Edge highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(0, y, CONFIG.canvas.width, 2);

    // Soft pink light catching the edge
    const sheen = ctx.createLinearGradient(0, y, 0, y + 8);
    sheen.addColorStop(0, 'rgba(255, 107, 157, 0.25)');
    sheen.addColorStop(1, 'rgba(255, 107, 157, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, y, CONFIG.canvas.width, 8);
}

// Draw Candle Stick
// Local coordinates: origin at the centre of the wax rim (wick end), the body
// extends toward +y, and the flame extends toward -y.
function drawCandleStick(ctx, w, len, phase, lit) {
    const cx = w / 2;
    const rimRy = w * 0.16;
    const zone = CONFIG.candles.flameZone;

    // --- Wax body ---------------------------------------------------------
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 5;
    const body = ctx.createLinearGradient(0, 0, w, 0);
    body.addColorStop(0, '#b52c58');
    body.addColorStop(0.16, '#ff7aa2');
    body.addColorStop(0.38, '#ffb6cb');
    body.addColorStop(0.68, '#ff6b9d');
    body.addColorStop(1, '#9c2149');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, w, len);
    ctx.restore();

    // Diagonal birthday-candle stripes, clipped to the body
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, len);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    const stripeH = 11;
    const stripeStep = 34;
    const slant = w * 0.55;
    for (let s = -slant; s < len + slant; s += stripeStep) {
        ctx.beginPath();
        ctx.moveTo(0, s + slant);
        ctx.lineTo(w, s);
        ctx.lineTo(w, s + stripeH);
        ctx.lineTo(0, s + slant + stripeH);
        ctx.closePath();
        ctx.fill();
    }
    // Soft vertical highlight to sell the cylinder
    const sheen = ctx.createLinearGradient(0, 0, w, 0);
    sheen.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
    sheen.addColorStop(0.22, 'rgba(255, 255, 255, 0.10)');
    sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0.22)');
    sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, len);
    ctx.restore();

    // --- Melted rim and drips -------------------------------------------
    // Drips run down the side from the rim
    ctx.fillStyle = '#ffd6e2';
    drawDrip(ctx, w * 0.22, rimRy - 1, 5, 16);
    drawDrip(ctx, w * 0.74, rimRy - 1, 4, 26);
    drawDrip(ctx, w * 0.50, rimRy - 1, 3.5, 9);

    // Rim (top face of the cylinder)
    const cap = ctx.createLinearGradient(0, 0, w, 0);
    cap.addColorStop(0, '#ffc2d3');
    cap.addColorStop(0.5, '#ffe4ec');
    cap.addColorStop(1, '#ff9fbd');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(cx, 0, w / 2, rimRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pool of melted wax inside the rim, lit by the flame
    const pool = ctx.createRadialGradient(cx, 0, 1, cx, 0, w / 2 - 4);
    pool.addColorStop(0, 'rgba(255, 236, 200, 0.95)');
    pool.addColorStop(0.6, 'rgba(255, 210, 225, 0.8)');
    pool.addColorStop(1, 'rgba(255, 190, 210, 0.4)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(cx, 0, w / 2 - 4, rimRy - 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- Wick ------------------------------------------------------------
    ctx.strokeStyle = '#3b2323';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, -1);
    ctx.quadraticCurveTo(cx + 2, -5, cx, -8);
    ctx.stroke();

    const t = performance.now() / 1000;

    if (!lit) {
        // Wisp of smoke curling off the blown-out wick
        ctx.strokeStyle = 'rgba(220, 220, 230, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, -8);
        for (let i = 1; i <= 6; i++) {
            ctx.lineTo(cx + Math.sin(t * 3 + phase + i * 0.9) * 3, -8 - i * 3.5);
        }
        ctx.stroke();
        return;
    }

    // --- Flame -----------------------------------------------------------
    const flick = Math.sin(t * 13 + phase) * 0.07 + Math.sin(t * 21 + phase * 1.7) * 0.04;
    const sway = Math.sin(t * 9 + phase) * 1.2;
    const baseY = -6;
    const fh = (zone - 4) * (1 + flick);
    const fw = w * 0.18 * (1 - flick * 0.5);

    // Ambient glow spilling onto the wax and into the gap
    const glowY = baseY - fh * 0.45;
    const glow = ctx.createRadialGradient(cx, glowY, 2, cx, glowY, w * 0.85);
    glow.addColorStop(0, 'rgba(255, 196, 92, 0.55)');
    glow.addColorStop(0.45, 'rgba(255, 150, 60, 0.18)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, glowY, w * 0.85, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(sway, 0);

    // Outer flame
    const outer = ctx.createLinearGradient(0, baseY, 0, baseY - fh);
    outer.addColorStop(0, '#ff5a2b');
    outer.addColorStop(0.55, '#ff9a2e');
    outer.addColorStop(1, '#ffd166');
    ctx.fillStyle = outer;
    drawTeardrop(ctx, cx, baseY, fw, fh);
    ctx.fill();

    // Inner flame
    ctx.fillStyle = '#ffe680';
    drawTeardrop(ctx, cx, baseY - 1.5, fw * 0.58, fh * 0.62);
    ctx.fill();

    // Hot core
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    drawTeardrop(ctx, cx, baseY - 2.5, fw * 0.3, fh * 0.34);
    ctx.fill();

    ctx.restore();
}

// Draw Teardrop (flame silhouette): round at baseY, pointed at baseY - h
function drawTeardrop(ctx, cx, baseY, w, h) {
    const r = Math.min(w, h * 0.4);
    const top = baseY - h;
    const belly = baseY - r;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx + w * 0.15, top + h * 0.3, cx + w, top + h * 0.55, cx + w, belly);
    ctx.arc(cx, belly, w, 0, Math.PI, false);
    ctx.bezierCurveTo(cx - w, top + h * 0.55, cx - w * 0.15, top + h * 0.3, cx, top);
    ctx.closePath();
}

// Draw Drip: a rounded run of wax starting at (x, y) and flowing toward +y
function drawDrip(ctx, x, y, radius, length) {
    ctx.beginPath();
    ctx.rect(x - radius, y, radius * 2, length - radius);
    ctx.arc(x, y + length - radius, radius, 0, Math.PI * 2);
    ctx.fill();
}

// Game Over
function gameOver() {
    game.running = false;
    game.toasts = [];

    // Update high score
    if (game.score > game.highScore) {
        game.highScore = game.score;
        localStorage.setItem('flappyCakeHighScore', game.highScore.toString());
        updateHighScoreDisplay();
    }

    // Show game over screen
    document.getElementById('finalScore').textContent = game.score;
    document.getElementById('finalHighScore').textContent = game.highScore;
    document.getElementById('gameOverScreen').classList.add('active');

    // Create explosion particles
    createParticles(CONFIG.cake.x, game.cake.y, 30, CONFIG.colors.cake);
    createParticles(CONFIG.cake.x, game.cake.y, 20, CONFIG.colors.frosting);

    playSound('gameOver');
}

// Update Score Display
function updateScoreDisplay() {
    document.getElementById('score').textContent = game.score;
}

// Animate Score Pop
function animateScorePop() {
    const scoreElement = document.getElementById('score');
    scoreElement.style.animation = 'none';
    setTimeout(() => {
        scoreElement.style.animation = 'scorePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    }, 10);
}

// Update High Score Display
function updateHighScoreDisplay() {
    document.getElementById('highScore').textContent = 'Best: ' + game.highScore;
}

// Simple Sound Effects (using Web Audio API)
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'jump') {
        oscillator.frequency.value = 400;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } else if (type === 'score') {
        oscillator.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } else if (type === 'powerup' || type === 'revive') {
        // Rising chime; the revive one is longer and higher
        const end = type === 'revive' ? 0.45 : 0.25;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(type === 'revive' ? 1600 : 1200, audioContext.currentTime + end);
        gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + end);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + end);
    } else if (type === 'shield') {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(700, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } else if (type === 'gameOver') {
        oscillator.frequency.value = 200;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }
}

// Initialize on load
window.addEventListener('load', init);
