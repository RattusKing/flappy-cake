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
    colors: {
        cake: '#ff6b9d',
        frosting: '#feca57',
        candle: '#ee5a6f',
        flame: '#feca57',
        background: ['#1a1a2e', '#16213e'],
        neon: ['#48dbfb', '#0abde3', '#10ac84', '#00d2d3']
    }
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

    // Update cake physics (only if game has started)
    if (game.hasStarted) {
        game.cake.velocity += CONFIG.cake.gravity;
        game.cake.velocity = Math.min(game.cake.velocity, CONFIG.cake.maxVelocity);
        game.cake.y += game.cake.velocity;

        // Update rotation based on velocity
        game.cake.rotation = Math.min(Math.max(game.cake.velocity * 3, -30), 90);
    }

    // Check boundaries (only if game has started)
    const half = CONFIG.cake.size / 2;
    if (game.hasStarted && (game.cake.y + half > groundY() || game.cake.y - half < 0)) {
        game.cake.y = Math.min(Math.max(game.cake.y, half), groundY() - half);
        gameOver();
        return;
    }

    // Spawn candles (only if game has started) - interval scales with current speed
    // so the pixel distance between candles stays constant as they get faster
    if (game.hasStarted && game.frames % Math.floor(CONFIG.candles.spacing / getDifficulty().speed) === 0) {
        spawnCandle();
    }

    // Update candles
    for (let i = game.candles.length - 1; i >= 0; i--) {
        const candle = game.candles[i];
        candle.x -= candle.speed;

        // Remove off-screen candles
        if (candle.x + CONFIG.candles.width < 0) {
            game.candles.splice(i, 1);
            continue;
        }

        // Score point
        if (!candle.scored && candle.x + CONFIG.candles.width < CONFIG.cake.x) {
            candle.scored = true;
            game.score++;
            updateScoreDisplay();
            createParticles(CONFIG.cake.x, game.cake.y, 15, CONFIG.colors.frosting);
            createParticles(CONFIG.cake.x, game.cake.y, 10, CONFIG.colors.cake);
            animateScorePop();
            playSound('score');
        }

        // Collision detection
        if (checkCollision(candle)) {
            gameOver();
            return;
        }
    }

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

// Spawn Candle
function spawnCandle() {
    const difficulty = getDifficulty();
    const topHeight = Math.random() * (difficulty.maxHeight - difficulty.minHeight) + difficulty.minHeight;

    game.candles.push({
        x: CONFIG.canvas.width,
        topHeight: topHeight,
        bottomY: topHeight + difficulty.gap,
        scored: false,
        speed: difficulty.speed,
        // Random phase so the flames don't all flicker in sync
        flicker: Math.random() * Math.PI * 2
    });
}

// Check Collision
function checkCollision(candle) {
    const cakeLeft = CONFIG.cake.x - CONFIG.cake.size / 2;
    const cakeRight = CONFIG.cake.x + CONFIG.cake.size / 2;
    const cakeTop = game.cake.y - CONFIG.cake.size / 2;
    const cakeBottom = game.cake.y + CONFIG.cake.size / 2;

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
    }
}

// Draw Cake
// A kawaii slice of strawberry cake: two pink sponge layers with a cream
// filling, white frosting dripping over the top, a cherry, and a happy face.
function drawCake(ctx) {
    ctx.save();
    ctx.translate(CONFIG.cake.x, game.cake.y);
    ctx.rotate(game.cake.rotation * Math.PI / 180);

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

    // Hanging candle (flipped vertically so the flame points down into the gap)
    ctx.save();
    ctx.translate(x, candle.topHeight - zone);
    ctx.scale(1, -1);
    drawCandleStick(ctx, width, candle.topHeight - zone, candle.flicker);
    ctx.restore();

    // Standing candle
    ctx.save();
    ctx.translate(x, candle.bottomY + zone);
    drawCandleStick(ctx, width, groundY() - candle.bottomY - zone, candle.flicker + 1.3);
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
function drawCandleStick(ctx, w, len, phase) {
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

    // --- Flame -----------------------------------------------------------
    const t = performance.now() / 1000;
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
