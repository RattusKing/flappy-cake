// Game Configuration
const CONFIG = {
    canvas: {
        width: 480,
        height: 640
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
        maxHeight: 350
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
    cake: {
        y: CONFIG.canvas.height / 2,
        velocity: 0,
        rotation: 0
    },
    candles: [],
    particles: [],
    background: {
        stars: [],
        neonLines: []
    }
};

// Initialize Game
function init() {
    game.canvas = document.getElementById('gameCanvas');
    game.ctx = game.canvas.getContext('2d');

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

    game.canvas.addEventListener('click', () => {
        if (game.running) jump();
    });

    // Start animation loop
    gameLoop();
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

    // Create neon lines
    for (let i = 0; i < 5; i++) {
        game.background.neonLines.push({
            x: Math.random() * CONFIG.canvas.width,
            y: Math.random() * CONFIG.canvas.height,
            length: Math.random() * 100 + 50,
            speed: Math.random() * 0.5 + 0.2,
            color: CONFIG.colors.neon[Math.floor(Math.random() * CONFIG.colors.neon.length)]
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
    if (game.hasStarted && (game.cake.y + CONFIG.cake.size > CONFIG.canvas.height || game.cake.y < 0)) {
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
        speed: difficulty.speed
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

    // Move neon lines
    game.background.neonLines.forEach(line => {
        line.y += line.speed;
        if (line.y > CONFIG.canvas.height) {
            line.y = -line.length;
            line.x = Math.random() * CONFIG.canvas.width;
        }
    });
}

// Render Game
function render() {
    const ctx = game.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    // Draw background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.canvas.height);
    gradient.addColorStop(0, CONFIG.colors.background[0]);
    gradient.addColorStop(1, CONFIG.colors.background[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    // Draw neon lines
    game.background.neonLines.forEach(line => {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(line.x, line.y + line.length);
        ctx.stroke();
        ctx.globalAlpha = 1;
    });

    // Draw stars
    game.background.stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });

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
function drawCake(ctx) {
    ctx.save();
    ctx.translate(CONFIG.cake.x, game.cake.y);
    ctx.rotate(game.cake.rotation * Math.PI / 180);

    const size = CONFIG.cake.size;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(-size/2 + 2, -size/2 + 4, size, size * 0.7);

    // Cake body with gradient
    const cakeGradient = ctx.createLinearGradient(-size/2, -size/2, size/2, size/2);
    cakeGradient.addColorStop(0, CONFIG.colors.cake);
    cakeGradient.addColorStop(1, '#e54d7d');
    ctx.fillStyle = cakeGradient;
    ctx.fillRect(-size/2, -size/2, size, size * 0.7);

    // Cake highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(-size/2, -size/2, size * 0.6, size * 0.3);

    // Frosting with gradient
    const frostingGradient = ctx.createLinearGradient(-size/2, -size/2, size/2, -size/2);
    frostingGradient.addColorStop(0, CONFIG.colors.frosting);
    frostingGradient.addColorStop(1, '#ffa502');
    ctx.fillStyle = frostingGradient;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const x = -size/2 + (i * size/4);
        ctx.arc(x, -size/2, size/8, 0, Math.PI * 2);
    }
    ctx.fill();

    // Cherry shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(1, -size/2 - 3, size/10, 0, Math.PI * 2);
    ctx.fill();

    // Cherry on top with gradient
    const cherryGradient = ctx.createRadialGradient(-2, -size/2 - 7, 1, 0, -size/2 - 5, size/10);
    cherryGradient.addColorStop(0, '#ff6b9d');
    cherryGradient.addColorStop(1, '#ee5a6f');
    ctx.fillStyle = cherryGradient;
    ctx.beginPath();
    ctx.arc(0, -size/2 - 5, size/10, 0, Math.PI * 2);
    ctx.fill();

    // Cherry highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(-2, -size/2 - 7, size/20, 0, Math.PI * 2);
    ctx.fill();

    // Eye outer
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-size/6, 0, size/12, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-size/6 - 2, -2, size/24, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(-size/6 - 3, -3, size/36, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// Draw Candle
function drawCandle(ctx, candle) {
    const x = candle.x;
    const width = CONFIG.candles.width;

    // Top candle
    drawSingleCandle(ctx, x, 0, width, candle.topHeight);

    // Bottom candle
    drawSingleCandle(ctx, x, candle.bottomY, width, CONFIG.canvas.height - candle.bottomY);
}

// Draw Single Candle
function drawSingleCandle(ctx, x, y, width, height) {
    // Candle shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x + 2, y + 2, width, height);

    // Candle body with gradient
    const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
    gradient.addColorStop(0, CONFIG.colors.candle);
    gradient.addColorStop(0.3, '#ff8fa3');
    gradient.addColorStop(0.7, '#ff8fa3');
    gradient.addColorStop(1, CONFIG.colors.candle);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);

    // Candle highlight
    const highlightGradient = ctx.createLinearGradient(x, 0, x + width/3, 0);
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlightGradient;
    ctx.fillRect(x, y, width/3, height);

    // Candle stripes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    for (let i = 0; i < height; i += 20) {
        ctx.fillRect(x, y + i, width, 4);
    }

    // Flame at bottom of top candle or top of bottom candle
    const flameY = y === 0 ? height - 20 : y + 10;

    // Outer flame glow
    const outerGlow = ctx.createRadialGradient(x + width/2, flameY, 2, x + width/2, flameY, 20);
    outerGlow.addColorStop(0, 'rgba(254, 202, 87, 0.6)');
    outerGlow.addColorStop(0.5, 'rgba(254, 202, 87, 0.3)');
    outerGlow.addColorStop(1, 'rgba(254, 202, 87, 0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(x + width/2, flameY, 20, 0, Math.PI * 2);
    ctx.fill();

    // Inner flame glow
    const flameGradient = ctx.createRadialGradient(x + width/2, flameY, 2, x + width/2, flameY, 12);
    flameGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    flameGradient.addColorStop(0.3, 'rgba(254, 202, 87, 0.8)');
    flameGradient.addColorStop(1, 'rgba(254, 202, 87, 0)');
    ctx.fillStyle = flameGradient;
    ctx.beginPath();
    ctx.arc(x + width/2, flameY, 12, 0, Math.PI * 2);
    ctx.fill();

    // Flame shape with animation
    const flameFlicker = Math.sin(Date.now() / 100) * 2;
    ctx.fillStyle = CONFIG.colors.flame;
    ctx.beginPath();
    ctx.moveTo(x + width/2, flameY - 12 + flameFlicker);
    ctx.lineTo(x + width/2 - 6, flameY + 5);
    ctx.lineTo(x + width/2 + 6, flameY + 5);
    ctx.closePath();
    ctx.fill();

    // Inner flame highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.moveTo(x + width/2, flameY - 8 + flameFlicker);
    ctx.lineTo(x + width/2 - 3, flameY + 2);
    ctx.lineTo(x + width/2 + 3, flameY + 2);
    ctx.closePath();
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
