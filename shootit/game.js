// ====================================================
//  霓虹战机 - NEON FIGHTER
//  Cyberpunk space shooter with synthwave aesthetics
// ====================================================
'use strict';

// === CONSTANTS ===
const WIDTH = 960;
const HEIGHT = 720;

// === CANVAS SETUP ===
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// === GAME STATE ===
let state = 'menu';                 // 'menu' | 'playing' | 'paused' | 'gameover'
let score = 0;
let highScore = parseInt(localStorage.getItem('neonFighterHigh') || '0', 10);
let lives = 3;
let level = 1;
let combo = 0;
let comboTimer = 0;
let bombs = 3;
let screenShake = 0;
let flashAmount = 0;
let lastTime = 0;
let menuAnimTimer = 0;

let player, bullets, enemyBullets, enemies, particles, powerups, stars, boss, messages;
let enemySpawnTimer, levelTimer;

// === INPUT ===
const keys = {};
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!keys[k]) keys[k] = true;            // edge trigger prevention for some keys
  if (e.key === ' ') e.preventDefault();
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();

  initAudio();

  if (state === 'menu' && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    startGame();
  } else if (state === 'gameover' && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    startGame();
  } else if (state === 'playing' && (e.key === 'p' || e.key === 'Escape')) {
    state = 'paused';
  } else if (state === 'paused' && (e.key === 'p' || e.key === 'Escape')) {
    state = 'playing';
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});
canvas.addEventListener('click', () => {
  initAudio();
  if (state === 'menu' || state === 'gameover') startGame();
});
window.addEventListener('blur', () => {
  if (state === 'playing') state = 'paused';
});

// === AUDIO (procedural via Web Audio API) ===
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* no audio */ }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;
  try {
    switch (type) {
      case 'shoot': {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(880, now);
        o.frequency.exponentialRampToValueAtTime(220, now + 0.08);
        g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        o.connect(g).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.08);
        break;
      }
      case 'explosion': {
        const len = audioCtx.sampleRate * 0.35;
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        const s = audioCtx.createBufferSource(); s.buffer = buf;
        const g = audioCtx.createGain(); g.gain.setValueAtTime(0.22, now);
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1500, now);
        f.frequency.exponentialRampToValueAtTime(80, now + 0.35);
        s.connect(f).connect(g).connect(audioCtx.destination);
        s.start(now);
        break;
      }
      case 'explosionBig': {
        const len = audioCtx.sampleRate * 1.2;
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
        const s = audioCtx.createBufferSource(); s.buffer = buf;
        const g = audioCtx.createGain(); g.gain.setValueAtTime(0.4, now);
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2000, now);
        f.frequency.exponentialRampToValueAtTime(40, now + 1.2);
        s.connect(f).connect(g).connect(audioCtx.destination);
        s.start(now);
        // bass thump
        const o = audioCtx.createOscillator();
        const og = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(80, now);
        o.frequency.exponentialRampToValueAtTime(20, now + 0.5);
        og.gain.setValueAtTime(0.4, now);
        og.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        o.connect(og).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.5);
        break;
      }
      case 'powerup': {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(440, now);
        o.frequency.exponentialRampToValueAtTime(1320, now + 0.2);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        o.connect(g).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.25);
        break;
      }
      case 'hit': {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, now);
        o.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.connect(g).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.2);
        break;
      }
      case 'enemyShoot': {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(400, now);
        o.frequency.exponentialRampToValueAtTime(200, now + 0.06);
        g.gain.setValueAtTime(0.04, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        o.connect(g).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.06);
        break;
      }
      case 'bomb': {
        const len = audioCtx.sampleRate * 0.8;
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
        const s = audioCtx.createBufferSource(); s.buffer = buf;
        const g = audioCtx.createGain(); g.gain.setValueAtTime(0.5, now);
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(4000, now);
        f.frequency.exponentialRampToValueAtTime(40, now + 0.8);
        s.connect(f).connect(g).connect(audioCtx.destination);
        s.start(now);
        // sweep
        const o = audioCtx.createOscillator();
        const og = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, now);
        o.frequency.exponentialRampToValueAtTime(20, now + 0.6);
        og.gain.setValueAtTime(0.2, now);
        og.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        o.connect(og).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.6);
        break;
      }
      case 'bossShoot': {
        const o1 = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o1.type = 'sawtooth';
        o2.type = 'square';
        o1.frequency.setValueAtTime(180, now);
        o2.frequency.setValueAtTime(270, now);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
        o1.start(now); o2.start(now);
        o1.stop(now + 0.2); o2.stop(now + 0.2);
        break;
      }
      case 'shield': {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(800, now);
        o.frequency.exponentialRampToValueAtTime(1600, now + 0.15);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        o.connect(g).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.15);
        break;
      }
      case 'levelup': {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(523, now);          // C5
        o.frequency.setValueAtTime(659, now + 0.1);    // E5
        o.frequency.setValueAtTime(784, now + 0.2);    // G5
        o.frequency.setValueAtTime(1047, now + 0.3);   // C6
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        o.connect(g).connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.5);
        break;
      }
    }
  } catch (e) { /* swallow audio errors */ }
}

// === UTILITIES ===
function randomRange(min, max) { return min + Math.random() * (max - min); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function randInt(min, max) { return Math.floor(randomRange(min, max + 1)); }

// ============== STARS (background) ==============
class Star {
  constructor(layer) {
    this.layer = layer;
    this.reset(true);
  }
  reset(initial) {
    this.x = Math.random() * WIDTH;
    this.y = initial ? Math.random() * HEIGHT : 0;
    this.size = (3 - this.layer) * 0.4 + Math.random() * 1.4;
    this.speed = (3 - this.layer) * 30 + Math.random() * 30;
    this.brightness = Math.random() * 0.5 + 0.4;
    this.twinkle = Math.random() * Math.PI * 2;
  }
  update(dt) {
    this.y += this.speed * dt;
    this.twinkle += dt * 3;
    if (this.y > HEIGHT) {
      this.y = 0;
      this.x = Math.random() * WIDTH;
    }
  }
  draw(ctx) {
    const a = this.brightness * (0.6 + Math.sin(this.twinkle) * 0.4);
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

// ============== PARTICLE ==============
class Particle {
  constructor(x, y, vx, vy, color, life, size) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.alive = true;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.05, dt);
    this.vy *= Math.pow(0.05, dt);
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const a = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * (0.3 + a * 0.7), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ============== BULLET ==============
class Bullet {
  constructor(x, y, vx, vy, color, isEnemy = false) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.isEnemy = isEnemy;
    this.w = isEnemy ? 6 : 4;
    this.h = isEnemy ? 12 : 14;
    this.alive = true;
    this.trail = [];
  }
  update(dt) {
    this.trail.push({ x: this.x, y: this.y, life: 0.25 });
    if (this.trail.length > 8) this.trail.shift();
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter(t => t.life > 0);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -30 || this.y > HEIGHT + 30 || this.x < -30 || this.x > WIDTH + 30) {
      this.alive = false;
    }
  }
  draw(ctx) {
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const a = t.life / 0.25;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = a * 0.45;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.w / 2 * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = this.color;
    if (this.isEnemy) {
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.w / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ============== POWERUP ==============
const POWERUP_CONFIG = {
  power:  { color: '#00f0ff', symbol: 'P', name: '火力提升' },
  shield: { color: '#00ff88', symbol: 'S', name: '护盾激活' },
  bomb:   { color: '#ff3366', symbol: 'B', name: '炸弹 +1' },
  speed:  { color: '#ffff00', symbol: 'Z', name: '极速模式' },
  life:   { color: '#ff00ff', symbol: '+', name: '生命 +1' },
};

class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.vy = 70;
    this.alive = true;
    this.time = 0;
    const c = POWERUP_CONFIG[type];
    this.color = c.color;
    this.symbol = c.symbol;
    this.name = c.name;
  }
  update(dt) {
    this.time += dt;
    this.y += this.vy * dt;
    this.x += Math.sin(this.time * 3) * 30 * dt;
    if (this.y > HEIGHT + 30) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 0.85 + Math.sin(this.time * 5) * 0.15;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 20;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.symbol, 0, 0);

    ctx.restore();
  }
  collect() {
    this.alive = false;
    explode(this.x, this.y, this.color, 20);
    addCombo();
    switch (this.type) {
      case 'power':
        player.power = Math.min(3, player.power + 1);
        showMessage('火力提升!', this.color);
        break;
      case 'shield':
        player.shield = true;
        player.shieldHP = 15;
        showMessage('护盾激活', this.color);
        break;
      case 'bomb':
        bombs = Math.min(5, bombs + 1);
        showMessage('炸弹 +1', this.color);
        break;
      case 'speed':
        player.speedBoost = 8;
        showMessage('极速模式!', this.color);
        break;
      case 'life':
        lives = Math.min(5, lives + 1);
        showMessage('生命 +1', this.color);
        break;
    }
    playSound('powerup');
    score += 5;
  }
}

// ============== ENEMY ==============
const ENEMY_CONFIG = {
  scout:   { w: 20, h: 20, hp: 1, vy: 180, color: '#ff3366', points: 10,  shootInt: null },
  weaver:  { w: 24, h: 24, hp: 2, vy: 130, color: '#cc33ff', points: 25,  shootInt: null },
  bomber:  { w: 30, h: 30, hp: 3, vy: 100, color: '#ff8800', points: 50,  shootInt: 2.5 },
  sweeper: { w: 32, h: 28, hp: 5, vy: 80,  color: '#33ff66', points: 75,  shootInt: 1.8 },
  tank:    { w: 38, h: 38, hp: 8, vy: 60,  color: '#ffff00', points: 150, shootInt: 1.2 },
};

class Enemy {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.alive = true;
    this.flash = 0;
    this.time = 0;
    const c = ENEMY_CONFIG[type];
    this.w = c.w; this.h = c.h;
    this.hp = c.hp; this.maxHp = c.hp;
    this.vy = c.vy;
    this.color = c.color;
    this.points = c.points;
    this.shootInt = c.shootInt;
    this.shootCD = c.shootInt ? c.shootInt * 0.6 : 0;
  }
  update(dt) {
    this.time += dt;
    if (this.flash > 0) this.flash -= dt;

    if (this.type === 'weaver') {
      this.x += Math.sin(this.time * 3) * 100 * dt;
    } else if (this.type === 'sweeper') {
      this.x += Math.sin(this.time * 1.5) * 90 * dt;
    } else if (this.type === 'tank') {
      this.x += Math.cos(this.time * 2) * 60 * dt;
    }

    this.y += this.vy * dt;
    this.x = clamp(this.x, this.w / 2, WIDTH - this.w / 2);

    if (this.y > HEIGHT + 50) this.alive = false;

    if (this.shootInt && this.y > 30 && this.y < HEIGHT - 200) {
      this.shootCD -= dt;
      if (this.shootCD <= 0) {
        this.shoot();
        this.shootCD = this.shootInt;
      }
    }
  }
  shoot() {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 280;
    if (this.type === 'tank') {
      for (let i = -1; i <= 1; i++) {
        const a = Math.atan2(dy, dx) + i * 0.2;
        enemyBullets.push(new Bullet(this.x, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed, '#ff8800', true));
      }
    } else if (this.type === 'sweeper') {
      for (let i = -1; i <= 1; i++) {
        const a = Math.atan2(dy, dx) + i * 0.3;
        enemyBullets.push(new Bullet(this.x, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed, '#33ff66', true));
      }
    } else {
      enemyBullets.push(new Bullet(this.x, this.y + this.h / 2, dx / len * speed, dy / len * speed, '#ff3366', true));
    }
    playSound('enemyShoot');
  }
  hit() {
    this.hp--;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      explode(this.x, this.y, this.color, 25);
      const multiplier = 1 + Math.floor(combo / 5);
      score += this.points * multiplier;
      addCombo();
      if (Math.random() < 0.15) spawnPowerup(this.x, this.y);
      playSound('explosion');
      screenShake = Math.max(screenShake, this.type === 'tank' ? 12 : 6);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.color;

    ctx.beginPath();
    if (this.type === 'scout') {
      ctx.moveTo(0, -this.h / 2);
      ctx.lineTo(this.w / 2, 0);
      ctx.lineTo(0, this.h / 2);
      ctx.lineTo(-this.w / 2, 0);
    } else if (this.type === 'weaver') {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 2;
        const px = Math.cos(a) * this.w / 2;
        const py = Math.sin(a) * this.h / 2;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (this.type === 'bomber') {
      ctx.moveTo(0, this.h / 2);
      ctx.lineTo(this.w / 2, this.h / 4);
      ctx.lineTo(this.w / 3, -this.h / 2);
      ctx.lineTo(-this.w / 3, -this.h / 2);
      ctx.lineTo(-this.w / 2, this.h / 4);
      ctx.closePath();
    } else if (this.type === 'sweeper') {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const px = Math.cos(a) * this.w / 2;
        const py = Math.sin(a) * this.h / 2;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (this.type === 'tank') {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const px = Math.cos(a) * this.w / 2;
        const py = Math.sin(a) * this.h / 2;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(0, 0, this.w * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // HP bar for multi-HP enemies
    if (this.maxHp > 1) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2 - 8, this.w, 3);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 5;
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2 - 8, this.w * (this.hp / this.maxHp), 3);
      ctx.shadowBlur = 0;
    }
  }
}

// ============== BOSS ==============
class Boss {
  constructor(level) {
    this.x = WIDTH / 2;
    this.y = -120;
    this.targetY = 160;
    this.w = 110 + level * 8;
    this.h = 90 + level * 4;
    this.hp = 60 + level * 40;
    this.maxHp = this.hp;
    this.color = '#ff00ff';
    this.alive = true;
    this.time = 0;
    this.shootCD = 2;
    this.entering = true;
    this.flash = 0;
    this.angle = 0;
    this.pattern = 0;
  }
  update(dt) {
    this.time += dt;
    if (this.flash > 0) this.flash -= dt;

    if (this.entering) {
      this.y += (this.targetY - this.y) * 0.03;
      if (Math.abs(this.y - this.targetY) < 2) this.entering = false;
      return;
    }

    this.x = WIDTH / 2 + Math.sin(this.time * 0.7) * (WIDTH / 3 - this.w / 2);
    this.angle = Math.sin(this.time * 1.5) * 0.1;

    this.shootCD -= dt;
    if (this.shootCD <= 0) {
      this.shoot();
      const hpPercent = this.hp / this.maxHp;
      this.shootCD = hpPercent > 0.6 ? 1.5 : (hpPercent > 0.3 ? 1.0 : 0.6);
    }
  }
  shoot() {
    const baseNum = 16 + Math.floor(level / 5) * 4;
    const pattern = this.pattern % 3;
    if (pattern === 0) {
      // Ring
      for (let i = 0; i < baseNum; i++) {
        const a = (i / baseNum) * Math.PI * 2;
        enemyBullets.push(new Bullet(this.x, this.y, Math.cos(a) * 200, Math.sin(a) * 200, '#ff00ff', true));
      }
    } else if (pattern === 1) {
      // Aimed spread
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const baseA = Math.atan2(dy, dx);
      for (let i = -3; i <= 3; i++) {
        const a = baseA + i * 0.12;
        enemyBullets.push(new Bullet(this.x, this.y, Math.cos(a) * 280, Math.sin(a) * 280, '#ff00ff', true));
      }
    } else {
      // Spiral
      const n = 20;
      for (let i = 0; i < n; i++) {
        const a = this.time * 3 + (i / n) * Math.PI * 2;
        enemyBullets.push(new Bullet(this.x, this.y, Math.cos(a) * 220, Math.sin(a) * 220, '#ff00ff', true));
      }
    }
    this.pattern++;
    playSound('bossShoot');
  }
  hit() {
    if (this.entering) return;
    this.hp--;
    this.flash = 0.08;
    if (this.hp % 3 === 0) {
      explode(this.x + randomRange(-30, 30), this.y + randomRange(-20, 20), this.color, 8);
    }
    if (this.hp <= 0) {
      this.alive = false;
      for (let i = 0; i < 150; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = randomRange(80, 500);
        const c = ['#ff00ff', '#ffff00', '#00f0ff', '#ff3366'][i % 4];
        particles.push(new Particle(this.x, this.y, Math.cos(a) * s, Math.sin(a) * s, c, randomRange(1.5, 3), randomRange(4, 8)));
      }
      score += 1000 * level;
      screenShake = 35;
      flashAmount = 0.6;
      playSound('explosionBig');
      for (let i = 0; i < 3; i++) {
        spawnPowerup(this.x + randomRange(-60, 60), this.y + randomRange(-40, 40));
      }
      addCombo();
      showMessage('★ BOSS 击败! ★', '#ffff00');
      playSound('levelup');
      level++;
      levelTimer = 25;
      showMessage('LEVEL ' + level, '#00f0ff');
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 30;

    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.color;
    ctx.beginPath();
    ctx.moveTo(0, -this.h / 2);
    ctx.lineTo(this.w / 2, -this.h / 4);
    ctx.lineTo(this.w / 2, this.h / 4);
    ctx.lineTo(this.w / 3, this.h / 2);
    ctx.lineTo(-this.w / 3, this.h / 2);
    ctx.lineTo(-this.w / 2, this.h / 4);
    ctx.lineTo(-this.w / 2, -this.h / 4);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w * 0.3, this.h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : '#ffff00';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff0066';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // HP bar at top
    ctx.fillStyle = 'rgba(20, 0, 40, 0.85)';
    ctx.fillRect(WIDTH / 2 - 130, 22, 260, 14);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(WIDTH / 2 - 130, 22, 260, 14);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.fillRect(WIDTH / 2 - 130, 22, 260 * (this.hp / this.maxHp), 14);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ BOSS · LEVEL ' + level + ' ⚠', WIDTH / 2, 50);
  }
}

// ============== PLAYER ==============
class Player {
  constructor() {
    this.x = WIDTH / 2;
    this.y = HEIGHT - 100;
    this.vx = 0; this.vy = 0;
    this.w = 22; this.h = 28;
    this.power = 1;
    this.shield = false;
    this.shieldHP = 0;
    this.invuln = 0;
    this.shootCD = 0;
    this.engineFlame = 0;
    this.angle = 0;
    this.targetAngle = 0;
    this.trail = [];
    this.usedBomb = false;
    this.speedBoost = 0;
  }
  update(dt) {
    const ax = ((keys['a'] || keys['arrowleft']) ? -1 : 0) + ((keys['d'] || keys['arrowright']) ? 1 : 0);
    const ay = ((keys['w'] || keys['arrowup']) ? -1 : 0) + ((keys['s'] || keys['arrowdown']) ? 1 : 0);

    const maxV = this.speedBoost > 0 ? 620 : 420;
    let tvx = ax * maxV;
    let tvy = ay * maxV;
    const tlen = Math.hypot(tvx, tvy);
    if (tlen > maxV) { tvx = tvx / tlen * maxV; tvy = tvy / tlen * maxV; }
    const accel = 14;
    this.vx += (tvx - this.vx) * accel * dt;
    this.vy += (tvy - this.vy) * accel * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, this.w / 2, WIDTH - this.w / 2);
    this.y = clamp(this.y, this.h / 2, HEIGHT - this.h / 2);

    this.targetAngle = ax * 0.3;
    this.angle += (this.targetAngle - this.angle) * 0.18;

    if (this.invuln > 0) this.invuln -= dt;
    if (this.shieldHP > 0) {
      this.shieldHP -= dt;
      if (this.shieldHP <= 0) this.shield = false;
    }
    if (this.speedBoost > 0) this.speedBoost -= dt;

    this.shootCD -= dt;
    if (keys[' '] || keys['j'] || keys['z']) {
      if (this.shootCD <= 0) {
        this.shoot();
        this.shootCD = 0.11;
      }
    }

    if ((keys['shift'] || keys['k'] || keys['x']) && bombs > 0 && !this.usedBomb) {
      this.usedBomb = true;
      bombs--;
      activateBomb();
    }
    if (!keys['shift'] && !keys['k'] && !keys['x']) this.usedBomb = false;

    if (ay > 0) this.engineFlame = Math.min(1, this.engineFlame + dt * 5);
    else this.engineFlame = Math.max(0, this.engineFlame - dt * 3);

    this.trail.push({ x: this.x, y: this.y + this.h / 2, life: 0.6 });
    if (this.trail.length > 25) this.trail.shift();
    for (const t of this.trail) t.life -= dt * 2;
    this.trail = this.trail.filter(t => t.life > 0);
  }
  shoot() {
    playSound('shoot');
    const bs = -720;
    if (this.power >= 3) {
      bullets.push(new Bullet(this.x, this.y - this.h / 2 - 5, 0, bs, '#00f0ff'));
      bullets.push(new Bullet(this.x - 8, this.y - this.h / 2, -80, bs, '#00f0ff'));
      bullets.push(new Bullet(this.x + 8, this.y - this.h / 2, 80, bs, '#00f0ff'));
      bullets.push(new Bullet(this.x - 16, this.y - this.h / 2, -160, bs, '#00f0ff'));
      bullets.push(new Bullet(this.x + 16, this.y - this.h / 2, 160, bs, '#00f0ff'));
    } else if (this.power === 2) {
      bullets.push(new Bullet(this.x, this.y - this.h / 2 - 5, 0, bs, '#00f0ff'));
      bullets.push(new Bullet(this.x - 7, this.y - this.h / 2, -100, bs, '#00f0ff'));
      bullets.push(new Bullet(this.x + 7, this.y - this.h / 2, 100, bs, '#00f0ff'));
    } else {
      bullets.push(new Bullet(this.x - 4, this.y - this.h / 2, -30, bs, '#00f0ff'));
      bullets.push(new Bullet(this.x + 4, this.y - this.h / 2, 30, bs, '#00f0ff'));
    }
  }
  hit() {
    if (this.invuln > 0) return false;
    if (this.shield) {
      this.shield = false;
      this.shieldHP = 0;
      this.invuln = 1.5;
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = randomRange(100, 250);
        particles.push(new Particle(this.x, this.y, Math.cos(a) * s, Math.sin(a) * s, '#00ff88', 1, 4));
      }
      screenShake = 8;
      playSound('shield');
      return false;
    }
    lives--;
    this.invuln = 2.5;
    this.power = Math.max(1, this.power - 1);
    screenShake = 20;
    flashAmount = 0.4;
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = randomRange(200, 400);
      particles.push(new Particle(this.x, this.y, Math.cos(a) * s, Math.sin(a) * s, '#ff0066', 1.5, 5));
    }
    playSound('hit');
    if (lives <= 0) {
      for (let i = 0; i < 100; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = randomRange(100, 400);
        const c = ['#00f0ff', '#ffffff', '#ff0066'][i % 3];
        particles.push(new Particle(this.x, this.y, Math.cos(a) * s, Math.sin(a) * s, c, randomRange(1, 2.5), randomRange(3, 6)));
      }
      gameOver();
    }
    return true;
  }
  draw(ctx) {
    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const a = t.life / 0.6;
      ctx.save();
      ctx.fillStyle = '#00f0ff';
      ctx.globalAlpha = a * 0.4;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4 * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Engine flame
    if (this.engineFlame > 0.1 || ay_held()) {
      ctx.save();
      ctx.translate(this.x, this.y + this.h / 2);
      const flameLen = 12 + this.engineFlame * 18 + (Math.random() * 3);
      const grad = ctx.createLinearGradient(0, 0, 0, flameLen);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(0, 240, 255, 1)');
      grad.addColorStop(0.7, 'rgba(0, 150, 255, 0.8)');
      grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = grad;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(0, flameLen);
      ctx.lineTo(5, 0);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (!(this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0)) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(0, -this.h / 2);
      ctx.lineTo(-this.w / 2, this.h / 2);
      ctx.lineTo(-this.w / 4, this.h / 3);
      ctx.lineTo(0, this.h / 4);
      ctx.lineTo(this.w / 4, this.h / 3);
      ctx.lineTo(this.w / 2, this.h / 2);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -this.h / 2 + 4);
      ctx.lineTo(-this.w / 4, this.h / 4);
      ctx.lineTo(this.w / 4, this.h / 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.ellipse(0, -2, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Shield
    if (this.shield) {
      ctx.save();
      ctx.strokeStyle = `rgba(0, 255, 136, ${0.5 + Math.sin(Date.now() * 0.01) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 32, 0, Math.PI * 2);
      ctx.stroke();
      // second ring
      ctx.strokeStyle = `rgba(0, 255, 136, ${0.2 + Math.sin(Date.now() * 0.01 + 1) * 0.15})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Speed boost ring
    if (this.speedBoost > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = `rgba(255, 255, 0, ${0.4 + Math.sin(Date.now() * 0.02) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function ay_held() {
  return keys['w'] || keys['s'] || keys['arrowup'] || keys['arrowdown'];
}

// ============== HELPERS ==============
function explode(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = randomRange(50, 280);
    particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, randomRange(0.5, 1.3), randomRange(2, 5)));
  }
}

function spawnPowerup(x, y) {
  const types = ['power', 'shield', 'bomb', 'speed', 'life'];
  const weights = [40, 25, 15, 15, 5];
  let r = Math.random() * 100;
  let type = types[0];
  for (let i = 0; i < types.length; i++) {
    r -= weights[i];
    if (r <= 0) { type = types[i]; break; }
  }
  powerups.push(new PowerUp(x, y, type));
}

function addCombo() {
  combo++;
  comboTimer = 3;
}

function showMessage(text, color) {
  messages.push({ text, color, life: 2, y: HEIGHT / 2 });
}

function activateBomb() {
  flashAmount = 0.7;
  screenShake = 35;
  let kills = 0;
  for (const e of enemies) {
    e.alive = false;
    explode(e.x, e.y, e.color, 10);
    score += 3;
    kills++;
  }
  for (const b of enemyBullets) b.alive = false;
  if (boss && !boss.entering) {
    boss.hp -= 15;
    if (boss.hp <= 0) {
      boss.hit();
    } else {
      explode(boss.x + randomRange(-30, 30), boss.y + randomRange(-30, 30), boss.color, 30);
    }
  }
  for (let i = 0; i < 200; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = randomRange(100, 600);
    const c = ['#ff3366', '#ffff00', '#ff8800'][i % 3];
    particles.push(new Particle(WIDTH / 2, HEIGHT / 2, Math.cos(a) * s, Math.sin(a) * s, c, randomRange(1, 2.5), randomRange(3, 7)));
  }
  playSound('bomb');
  if (kills > 0) addCombo();
}

// ============== STATE MANAGEMENT ==============
function startGame() {
  state = 'playing';
  score = 0;
  lives = 3;
  level = 1;
  combo = 0;
  bombs = 3;
  screenShake = 0;
  flashAmount = 0;
  player = new Player();
  bullets = [];
  enemyBullets = [];
  enemies = [];
  particles = [];
  powerups = [];
  messages = [];
  boss = null;
  enemySpawnTimer = 0;
  levelTimer = 25;
  showMessage('LEVEL 1', '#00f0ff');
  playSound('levelup');
}

function gameOver() {
  state = 'gameover';
  if (score > highScore) {
    highScore = score;
    try { localStorage.setItem('neonFighterHigh', String(highScore)); } catch (e) { /* */ }
  }
}

// ============== SPAWN LOGIC ==============
function spawnEnemies(dt) {
  if (boss && boss.entering) return;
  if (boss) return;

  enemySpawnTimer -= dt;
  const difficulty = 1 + (level - 1) * 0.25;
  if (enemySpawnTimer <= 0) {
    let type;
    const r = Math.random();
    if (level < 3) {
      type = r < 0.7 ? 'scout' : 'weaver';
    } else if (level < 5) {
      type = r < 0.5 ? 'scout' : (r < 0.8 ? 'weaver' : 'bomber');
    } else if (level < 8) {
      type = r < 0.4 ? 'scout' : (r < 0.65 ? 'weaver' : (r < 0.85 ? 'bomber' : 'sweeper'));
    } else {
      type = r < 0.3 ? 'scout' : (r < 0.5 ? 'weaver' : (r < 0.7 ? 'bomber' : (r < 0.88 ? 'sweeper' : 'tank')));
    }
    const x = randomRange(50, WIDTH - 50);
    enemies.push(new Enemy(x, -30, type));
    enemySpawnTimer = randomRange(0.5, 1.1) / difficulty;
  }

  levelTimer -= dt;
  if (levelTimer <= 0 && !boss) {
    level++;
    levelTimer = 25;
    showMessage('LEVEL ' + level, '#ffff00');
    playSound('levelup');
  }

  if (level % 5 === 0 && !boss && levelTimer < 20) {
    boss = new Boss(level);
    showMessage('⚠ BOSS 来袭! ⚠', '#ff00ff');
  }
}

// ============== COLLISIONS ==============
function checkCollisions() {
  for (const b of bullets) {
    if (!b.alive) continue;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.abs(b.x - e.x) < (e.w + b.w) / 2 && Math.abs(b.y - e.y) < (e.h + b.h) / 2) {
        b.alive = false;
        e.hit();
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = randomRange(50, 150);
          particles.push(new Particle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s, e.color, 0.4, 2));
        }
        break;
      }
    }
    if (boss && boss.alive && !boss.entering && b.alive) {
      if (Math.abs(b.x - boss.x) < (boss.w + b.w) / 2 && Math.abs(b.y - boss.y) < (boss.h + b.h) / 2) {
        b.alive = false;
        boss.hit();
      }
    }
  }

  for (const b of enemyBullets) {
    if (!b.alive) continue;
    if (Math.abs(b.x - player.x) < (player.w + b.w) / 2 && Math.abs(b.y - player.y) < (player.h + b.h) / 2) {
      b.alive = false;
      player.hit();
    }
  }

  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - player.x) < (e.w + player.w) / 2 && Math.abs(e.y - player.y) < (e.h + player.h) / 2) {
      e.alive = false;
      explode(e.x, e.y, e.color, 20);
      player.hit();
    }
  }

  for (const p of powerups) {
    if (!p.alive) continue;
    if (Math.abs(p.x - player.x) < 30 && Math.abs(p.y - player.y) < 30) {
      p.collect();
    }
  }
}

// ============== UPDATE ==============
function update(dt) {
  for (const s of stars) s.update(dt);
  menuAnimTimer += dt;

  if (state === 'playing') {
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }

    player.update(dt);
    for (const b of bullets) b.update(dt);
    for (const b of enemyBullets) b.update(dt);
    for (const e of enemies) e.update(dt);
    for (const p of particles) p.update(dt);
    for (const p of powerups) p.update(dt);
    if (boss) {
      boss.update(dt);
      if (!boss.alive) boss = null;
    }

    spawnEnemies(dt);
    checkCollisions();

    bullets = bullets.filter(b => b.alive);
    enemyBullets = enemyBullets.filter(b => b.alive);
    enemies = enemies.filter(e => e.alive);
    particles = particles.filter(p => p.alive);
    powerups = powerups.filter(p => p.alive);

    screenShake *= 0.9;
    if (screenShake < 0.1) screenShake = 0;
    flashAmount *= 0.92;
    if (flashAmount < 0.01) flashAmount = 0;

    for (const m of messages) {
      m.life -= dt;
      m.y -= 40 * dt;
    }
    messages = messages.filter(m => m.life > 0);
  } else {
    for (const p of particles) p.update(dt);
    particles = particles.filter(p => p.alive);
    for (const m of messages) {
      m.life -= dt;
      m.y -= 30 * dt;
    }
    messages = messages.filter(m => m.life > 0);

    // Demo particles on menu
    if (state === 'menu' && Math.random() < 0.1) {
      particles.push(new Particle(
        randomRange(0, WIDTH), HEIGHT,
        randomRange(-30, 30), randomRange(-200, -100),
        ['#00f0ff', '#ff00ff', '#ffff00'][Math.floor(Math.random() * 3)],
        randomRange(2, 4), randomRange(2, 4)
      ));
    }
  }
}

// ============== DRAW ==============
function draw() {
  if (screenShake > 0) {
    ctx.save();
    ctx.translate(
      randomRange(-screenShake, screenShake),
      randomRange(-screenShake, screenShake)
    );
  }

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, '#0a0028');
  grad.addColorStop(0.4, '#1a0040');
  grad.addColorStop(0.7, '#3d0050');
  grad.addColorStop(1, '#000010');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Stars
  for (const s of stars) s.draw(ctx);

  // Sun
  drawSun();

  // Grid
  drawGrid();

  // Game objects
  if (state === 'playing' || state === 'paused' || state === 'gameover') {
    for (const p of powerups) p.draw(ctx);
    for (const b of bullets) b.draw(ctx);
    for (const b of enemyBullets) b.draw(ctx);
    for (const e of enemies) e.draw(ctx);
    if (boss) boss.draw(ctx);
    if (state !== 'gameover') player.draw(ctx);
  }

  // Particles
  for (const p of particles) p.draw(ctx);

  if (screenShake > 0) ctx.restore();

  // Flash overlay
  if (flashAmount > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAmount})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Vignette
  const vGrad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.4, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.8);
  vGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vGrad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // UI
  drawUI();
  drawOverlay();
}

function drawSun() {
  ctx.save();
  const x = WIDTH / 2;
  const y = HEIGHT * 0.55;
  const r = 100;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
  glow.addColorStop(0, 'rgba(255, 100, 200, 0.5)');
  glow.addColorStop(0.4, 'rgba(255, 50, 100, 0.2)');
  glow.addColorStop(1, 'rgba(255, 0, 100, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);

  const sunGrad = ctx.createLinearGradient(0, y - r, 0, y + r);
  sunGrad.addColorStop(0, '#ffeb3b');
  sunGrad.addColorStop(0.4, '#ff9800');
  sunGrad.addColorStop(0.8, '#ff0066');
  sunGrad.addColorStop(1, '#9c00ff');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Stripes (synthwave style)
  ctx.fillStyle = '#0a0028';
  for (let i = 0; i < 6; i++) {
    const sy = y + r * 0.3 + i * 12;
    const sw = Math.sqrt(Math.max(0, r * r - (sy - y) * (sy - y)));
    ctx.fillRect(x - sw, sy, sw * 2, 5);
  }

  ctx.restore();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 0, 200, 0.4)';
  ctx.lineWidth = 1;
  ctx.shadowColor = '#ff00aa';
  ctx.shadowBlur = 8;

  const horizon = HEIGHT * 0.7;
  for (let i = 0; i < 20; i++) {
    const t = i / 20;
    const y = horizon + Math.pow(t, 2.5) * (HEIGHT - horizon);
    ctx.globalAlpha = 1 - t * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.6;
  for (let i = -12; i <= 12; i++) {
    if (i === 0) continue;
    const x1 = WIDTH / 2 + i * 60;
    const x2 = WIDTH / 2 + i * 800;
    ctx.beginPath();
    ctx.moveTo(x1, horizon);
    ctx.lineTo(x2, HEIGHT);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawUI() {
  if (state !== 'playing' && state !== 'paused' && state !== 'gameover') return;

  ctx.save();
  ctx.font = 'bold 18px "Courier New", monospace';

  // Score
  ctx.textAlign = 'left';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#00f0ff';
  ctx.fillText('SCORE  ' + score.toString().padStart(8, '0'), 20, 35);

  ctx.shadowColor = '#ff00ff';
  ctx.fillStyle = '#ff00ff';
  ctx.font = '14px "Courier New", monospace';
  ctx.fillText('HIGH   ' + highScore.toString().padStart(8, '0'), 20, 55);

  // Level
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffff00';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#ffff00';
  ctx.fillText('LEVEL ' + level, WIDTH / 2, 38);

  // Level progress
  if (state === 'playing' && !boss) {
    const prog = 1 - (levelTimer / 25);
    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.fillRect(WIDTH / 2 - 50, 50, 100, 4);
    ctx.fillStyle = '#ffff00';
    ctx.shadowBlur = 5;
    ctx.fillRect(WIDTH / 2 - 50, 50, 100 * prog, 4);
  }

  // Lives & Bombs
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.shadowColor = '#ff3366';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff3366';
  ctx.fillText('LIVES  ' + '♥'.repeat(lives), WIDTH - 20, 35);

  ctx.shadowColor = '#ff00ff';
  ctx.fillStyle = '#ff00ff';
  ctx.font = '14px "Courier New", monospace';
  ctx.fillText('BOMBS  ' + '◆'.repeat(bombs), WIDTH - 20, 55);

  // Combo
  if (combo > 1 && state === 'playing') {
    const cSize = Math.min(48, 24 + combo);
    ctx.font = 'bold ' + cSize + 'px "Courier New", monospace';
    ctx.textAlign = 'center';
    const cColor = combo >= 20 ? '#ff00ff' : (combo >= 10 ? '#ff3366' : '#ffff00');
    ctx.shadowColor = cColor;
    ctx.shadowBlur = 30;
    ctx.fillStyle = cColor;
    ctx.fillText('x' + combo + ' COMBO', WIDTH / 2, HEIGHT - 60);

    const ctProg = comboTimer / 3;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(WIDTH / 2 - 50, HEIGHT - 45, 100, 3);
    ctx.fillStyle = cColor;
    ctx.fillRect(WIDTH / 2 - 50, HEIGHT - 45, 100 * ctProg, 3);
  }

  // Messages
  for (const m of messages) {
    const a = Math.min(1, m.life * 1.5);
    ctx.globalAlpha = a;
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = m.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, WIDTH / 2, m.y);
  }
  ctx.globalAlpha = 1;

  // Power indicator
  if (state === 'playing' && player.power > 1) {
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('PWR  ' + '★'.repeat(player.power), 20, 85);
  }

  ctx.restore();
}

function drawOverlay() {
  if (state === 'menu') {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 20, 0.5)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    const titleY = HEIGHT / 2 - 140;

    // NEON (cyan)
    ctx.font = 'bold 110px "Courier New", monospace';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('NEON', WIDTH / 2, titleY);
    ctx.shadowBlur = 60;
    ctx.fillText('NEON', WIDTH / 2, titleY);

    // FIGHTER (magenta)
    ctx.font = 'bold 110px "Courier New", monospace';
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ff00ff';
    ctx.fillText('FIGHTER', WIDTH / 2, titleY + 100);
    ctx.shadowBlur = 60;
    ctx.fillText('FIGHTER', WIDTH / 2, titleY + 100);

    // Subtitle
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffff00';
    ctx.fillText('霓  虹  战  机', WIDTH / 2, titleY + 150);

    // Start prompt
    if (Math.sin(menuAnimTimer * 4) > 0) {
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 25;
      ctx.fillStyle = '#00ff88';
      ctx.fillText('> PRESS SPACE TO START <', WIDTH / 2, HEIGHT / 2 + 110);
    }

    // Instructions box
    ctx.font = '15px "Courier New", monospace';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#cccccc';
    ctx.fillText('WASD / 方向键     移动', WIDTH / 2, HEIGHT - 110);
    ctx.fillText('SPACE / J / Z     射击', WIDTH / 2, HEIGHT - 90);
    ctx.fillText('SHIFT / K / X     炸弹 (清屏)', WIDTH / 2, HEIGHT - 70);
    ctx.fillText('P / ESC           暂停', WIDTH / 2, HEIGHT - 50);

    if (highScore > 0) {
      ctx.font = 'bold 17px "Courier New", monospace';
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff00ff';
      ctx.fillText('HIGH SCORE: ' + highScore, WIDTH / 2, HEIGHT - 20);
    }

    ctx.restore();
  } else if (state === 'paused') {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 30, 0.85)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 80px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('PAUSED', WIDTH / 2, HEIGHT / 2 - 10);

    ctx.font = '20px "Courier New", monospace';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Press P / ESC to resume', WIDTH / 2, HEIGHT / 2 + 40);
    ctx.restore();
  } else if (state === 'gameover') {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 20, 0.8)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 90px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0033';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ff0033';
    ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT / 2 - 70);

    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('SCORE  ' + score, WIDTH / 2, HEIGHT / 2);

    ctx.font = '20px "Courier New", monospace';
    ctx.shadowColor = '#ff00ff';
    ctx.fillStyle = '#ff00ff';
    ctx.fillText('HIGH   ' + highScore, WIDTH / 2, HEIGHT / 2 + 35);

    if (score === highScore && score > 0 && Math.sin(menuAnimTimer * 5) > 0) {
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur = 25;
      ctx.fillStyle = '#ffff00';
      ctx.fillText('★ NEW RECORD ★', WIDTH / 2, HEIGHT / 2 + 80);
    }

    if (Math.sin(menuAnimTimer * 4) > 0) {
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#00ff88';
      ctx.fillText('> PRESS SPACE TO RESTART <', WIDTH / 2, HEIGHT / 2 + 135);
    }
    ctx.restore();
  }
}

// ============== GAME LOOP ==============
function gameLoop(timestamp) {
  const dt = Math.min(0.05, (timestamp - lastTime) / 1000) || 0.016;
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ============== INIT ==============
function init() {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  stars = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 100; j++) {
      stars.push(new Star(i));
    }
  }
  player = new Player();
  bullets = [];
  enemyBullets = [];
  enemies = [];
  particles = [];
  powerups = [];
  messages = [];
  boss = null;
  menuAnimTimer = 0;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('load', init);
