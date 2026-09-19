/* ============================================================
 *  魂斗罗 CLASSIC CONTRA  -  Canvas HTML5 横版射击
 *  --------------------------------------------------------------
 *  · 玩家：跑/跳/蹲/上下射/4 种武器
 *  · 敌人：步兵、奔跑兵、炮台、飞行炮手、Boss
 *  · 关卡：3 关（丛林 / 冰雪基地 / 异形要塞），主题、Boss、敌人全变
 *  · 强化：粒子爆炸、屏幕震动、视差、Konami 秘籍
 *  · 兼容：键盘 + 触屏 + LocalStorage 最高分
 * ============================================================ */
(() => {
'use strict';

// ============================================================
// 0.  画布 & 基础常量
// ============================================================
const C  = document.getElementById('game');
const ctx = C.getContext('2d');
ctx.imageSmoothingEnabled = false;

const VW = C.width;   // 512 逻辑宽度
const VH = C.height;  // 320 逻辑高度

const GRAVITY   = 0.55;
const MAX_FALL  = 8;
const PLAYER_SPEED = 2.0;
const JUMP_V    = -8.6;

const FIRE_COOLDOWN = {
  default: 10,
  rapid:    5,
  spread:  14,
  laser:    6,
};

const W = {
  default: 'default',
  rapid:   'rapid',
  spread:  'spread',
  laser:   'laser',
};
const WPN_LABEL = { default: 'M', rapid: 'F', spread: 'S', laser: 'L' };
const WPN_COLOR = { default: '#fff7c0', rapid: '#a0ffa0', spread: '#ffd84d', laser: '#ff5be0' };

const rnd  = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const sign  = v => v < 0 ? -1 : (v > 0 ? 1 : 0);

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ============================================================
// 1.  Web Audio  -  8-bit 风格程序合成音效
// ============================================================
const Sound = (() => {
  let actx = null;
  function getCtx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    }
    return actx;
  }
  function beep(freq, dur, type = 'square', gain = 0.06, slide = 0) {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  }
  function noiseBurst(dur = 0.18, gain = 0.08) {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = gain;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 800;
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start();
  }
  return {
    shoot:   () => beep(880, 0.06, 'square', 0.05, -300),
    shoot2:  () => beep(660, 0.04, 'square', 0.04, -200),
    laser:   () => beep(1400, 0.10, 'sawtooth', 0.05, -800),
    hit:     () => { beep(180, 0.10, 'square', 0.07, -100); noiseBurst(0.10, 0.05); },
    explode: () => { noiseBurst(0.32, 0.10); beep(80, 0.25, 'square', 0.08, -40); },
    jump:    () => beep(420, 0.08, 'square', 0.04, 200),
    powerup: () => { beep(880, 0.07, 'square', 0.06); setTimeout(() => beep(1320, 0.10, 'square', 0.06), 80); },
    death:   () => { beep(440, 0.25, 'sawtooth', 0.10, -300); setTimeout(() => beep(110, 0.40, 'sawtooth', 0.10, -60), 250); },
    clear:   () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.10, 'square', 0.07), i * 90)); },
    boss:    () => { beep(110, 0.30, 'square', 0.10, -60); noiseBurst(0.30, 0.10); },
    over:    () => { [392, 330, 294, 196].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'square', 0.08), i * 160)); },
    start:   () => { [330, 392, 523].forEach((f, i) => setTimeout(() => beep(f, 0.10, 'square', 0.08), i * 110)); },
    shoot3:  () => beep(550, 0.05, 'triangle', 0.06, -100),
  };
})();

// ============================================================
// 2.  输入管理  -  键盘 + 触屏 统一抽象
// ============================================================
const Input = {
  keys: new Set(),
  pressed: new Set(),     // 单帧触发 (防止连按)
  touch: new Set(),       // 当前按住的触屏按钮 id
  touchPressed: new Set(),
  konami: [],
  enabled: true,

  bind() {
    // 自动检测触屏
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
      document.body.classList.add('touch');
    }
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { passive: true });

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.konami.push(k);
      if (this.konami.length > 12) this.konami.shift();
      // Konami code: 上上下下左右左右BA
      const kc = this.konami.join(',');
      if (kc.endsWith('arrowup,arrowup,arrowdown,arrowdown,arrowleft,arrowright,arrowleft,arrowright,b,a') ||
          kc.endsWith('w,w,s,s,a,d,a,d,b,a')) {
        if (Game.state === 'menu' || Game.state === 'playing' || Game.state === 'paused') {
          Game.activateCheat();
          this.konami = [];
        }
      }
      // 防止方向键滚屏
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    // 焦点丢失释放所有键
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.clear(); });

    // 触屏按钮绑定
    const map = {
      't-left':  'arrowleft',
      't-right': 'arrowright',
      't-up':    'arrowup',
      't-down':  'arrowdown',
      't-jump':  'x',
      't-fire':  'z',
    };
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const press = (e) => {
        e.preventDefault();
        if (!this.touch.has(key)) this.touchPressed.add(key);
        this.touch.add(key);
        el.classList.add('pressed');
        // 第一次触摸时初始化音频
        try { Sound.getCtx && Sound.getCtx(); } catch (_) {}
      };
      const release = (e) => {
        if (e) e.preventDefault();
        this.touch.delete(key);
        el.classList.remove('pressed');
      };
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
      el.addEventListener('mousedown', press);
      el.addEventListener('mouseup', release);
      el.addEventListener('mouseleave', release);
    }
  },

  // 综合判定：键盘 ∪ 触屏
  isDown(...keys) {
    return keys.some(k => this.keys.has(k) || this.touch.has(k));
  },

  // 只在按下瞬间触发一次
  consume(key) {
    if (this.pressed.has(key) || this.touchPressed.has(key)) {
      this.pressed.delete(key);
      this.touchPressed.delete(key);
      return true;
    }
    return false;
  },

  endFrame() {
    this.pressed.clear();
    this.touchPressed.clear();
  },
};

// ============================================================
// 3.  相机  -  平滑跟随 + 屏幕震动
// ============================================================
class Camera {
  constructor() { this.x = 0; this.y = 0; this.shake = 0; }
  follow(target) {
    const tx = target.x + target.w / 2 - VW / 2;
    const ty = target.y + target.h / 2 - VH / 2;
    this.x += (tx - this.x) * 0.18;
    this.y = clamp(this.y + (ty - this.y) * 0.12, -80, 60);
    if (this.x < 0) this.x = 0;
    const maxX = Math.max(0, Game.levelW() - VW);
    if (this.x > maxX) this.x = maxX;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 1);
  }
  addShake(n) { this.shake = Math.max(this.shake, n); }
  apply(fn) {
    const sx = this.shake > 0 ? irnd(-this.shake, this.shake + 1) : 0;
    const sy = this.shake > 0 ? irnd(-this.shake, this.shake + 1) : 0;
    ctx.save();
    ctx.translate(-Math.floor(this.x) + sx, -Math.floor(this.y) + sy);
    fn();
    ctx.restore();
  }
}

// ============================================================
// 4.  粒子 / 子弹 / 掉宝 / 平台
// ============================================================
class Particle {
  constructor(x, y, vx, vy, life, color, size = 2, gravity = 0.2) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color;
    this.size = size; this.gravity = gravity; this.dead = false;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.96;
    this.life--;
    if (this.life <= 0) this.dead = true;
  }
  draw() {
    const a = this.life / this.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);
    ctx.globalAlpha = 1;
  }
}
function explode(x, y, color = '#ffae3a', n = 14, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    const s = rnd(1, 3) * power;
    Game.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 1, irnd(14, 28), color, irnd(2, 4)));
  }
}
function spark(x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    Game.particles.push(new Particle(x, y, Math.cos(a) * 2, Math.sin(a) * 2, 12, '#ffd84d', 2, 0));
  }
}
function smoke(x, y, n = 4) {
  for (let i = 0; i < n; i++) {
    Game.particles.push(new Particle(x + rnd(-4, 4), y + rnd(-4, 4),
      rnd(-0.3, 0.3), rnd(-0.5, -0.1), irnd(20, 40), '#888888', irnd(2, 4), 0));
  }
}

class Bullet {
  constructor(x, y, vx, vy, friendly, kind = 'default') {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = 6; this.h = 4;
    this.friendly = friendly;
    this.kind = kind;
    this.dead = false;
    this.life = 80;
    this.pierce = (kind === 'laser');
    this.damage = kind === 'laser' ? 2 : 1;
    this.trailCD = 0;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    if (this.life <= 0) this.dead = true;
    if (this.x < Game.camera.x - 32 || this.x > Game.camera.x + VW + 32) this.dead = true;
    // 拖尾
    if (this.friendly && this.kind === 'laser') {
      if (this.trailCD-- <= 0) {
        this.trailCD = 2;
        Game.particles.push(new Particle(this.x, this.y + this.h/2, 0, 0, 8, '#ff5be0', 2, 0));
      }
    }
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    if (this.kind === 'laser') {
      ctx.fillStyle = '#ff5be0';
      ctx.fillRect(x - 2, y - 1, 8, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 4, 1);
    } else if (this.kind === 'spread') {
      ctx.fillStyle = '#ffd84d';
      ctx.fillRect(x, y, 6, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 1, y + 1, 3, 2);
    } else if (this.kind === 'rapid') {
      ctx.fillStyle = '#a0ffa0';
      ctx.fillRect(x, y + 1, 5, 2);
    } else {
      ctx.fillStyle = this.friendly ? '#fff7c0' : '#ff5050';
      ctx.fillRect(x, y, 5, 3);
    }
  }
}

class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.vy = -3; this.vx = 0;
    this.w = 12; this.h = 12;
    this.type = type;
    this.dead = false; this.life = 700;
    this.bobT = rnd(0, Math.PI * 2);
  }
  update() {
    this.vy += GRAVITY * 0.7;
    this.y += this.vy;
    if (this.y > Game.groundY() - this.h) {
      this.y = Game.groundY() - this.h;
      this.vy = 0;
    }
    this.bobT += 0.12;
    this.life--;
    if (this.life <= 0) this.dead = true;
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y + Math.sin(this.bobT) * 2);
    const flash = this.life < 120 && Math.floor(this.life / 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ffffff' : '#0b1330';
    ctx.fillRect(x - 1, y - 1, this.w + 2, this.h + 2);
    ctx.fillStyle = '#1c2a55';
    ctx.fillRect(x, y, this.w, this.h);
    if (this.type === 'health') {
      ctx.fillStyle = '#ff5577';
      ctx.fillRect(x + 4, y + 2, 4, 8);
      ctx.fillRect(x + 2, y + 4, 8, 4);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(WPN_LABEL[this.type] || '?', x + this.w / 2, y + this.h / 2 + 1);
    }
  }
}

class Platform {
  constructor(x, y, w, h, color = '#243a1f', top = '#3d6b2a') {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.color = color; this.top = top;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = this.top;
    ctx.fillRect(this.x, this.y, this.w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(this.x, this.y + this.h - 1, this.w, 1);
  }
}

// ============================================================
// 5.  敌人基类
// ============================================================
class Enemy {
  constructor(x, y, w, h, hp = 1, score = 100, palette = {}) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.hp = hp; this.maxHp = hp;
    this.score = score;
    this.dead = false; this.onGround = false;
    this.dir = -1; this.t = 0;
    this.fireCD = irnd(60, 200);
    this.flashT = 0;
    this.palette = palette;
  }
  hit(dmg = 1) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flashT = 6;
    spark(this.x + this.w / 2, this.y + this.h / 2, 5);
    Sound.hit();
    if (this.hp <= 0) {
      explode(this.x + this.w / 2, this.y + this.h / 2, this.palette.body || '#ff7a3a', 14, 1.2);
      smoke(this.x + this.w / 2, this.y + this.h / 2, 6);
      Sound.explode();
      Game.addScore(this.score);
      // 概率掉宝
      if (Math.random() < 0.18 && !(this instanceof BossBase)) {
        const r = Math.random();
        let type;
        if (r < 0.35) type = 'spread';
        else if (r < 0.65) type = 'rapid';
        else if (r < 0.9) type = 'laser';
        else type = 'health';
        Game.powerups.push(new PowerUp(this.x + this.w / 2 - 6, this.y - 4, type));
      }
      this.dead = true;
    }
  }
  physics(groundY) {
    this.vy += GRAVITY;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
    this.y += this.vy;
    this.onGround = false;
    if (this.y + this.h >= groundY) {
      this.y = groundY - this.h;
      this.vy = 0;
      this.onGround = true;
    }
    if (this.collidesPlatforms) {
      for (const p of Game.platforms) {
        if (this.vy > 0 &&
            this.x + this.w > p.x && this.x < p.x + p.w &&
            this.y + this.h > p.y && this.y + this.h - this.vy <= p.y + 1) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
        }
      }
    }
    this.x += this.vx;
  }
}

// ---- 5.1 Grunt ----
class Grunt extends Enemy {
  constructor(x, y, palette = { body: '#2d6b3a', head: '#3d8a4a', eye: '#ff4040' }) {
    super(x, y, 14, 20, 1, 100, palette);
    this.fireCD = irnd(50, 140);
    this.dir = -1;
    this.collidesPlatforms = true;
  }
  update(player) {
    this.t++;
    const dx = player.x - this.x;
    this.dir = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    if (dist > 80) this.vx = this.dir * 0.6;
    else this.vx *= 0.7;
    this.fireCD--;
    if (this.fireCD <= 0 && dist < 320) {
      this.fire(player);
      this.fireCD = irnd(70, 160);
    }
    this.physics(Game.groundY());
  }
  fire(player) {
    const cx = this.x + this.w / 2, cy = this.y + 8;
    const dx = player.x - cx, dy = (player.y + player.h / 2) - cy;
    const len = Math.hypot(dx, dy) || 1;
    const sp = 3.2;
    Game.bullets.push(new Bullet(cx, cy, dx / len * sp, dy / len * sp, false, 'default'));
    Sound.shoot2();
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    const legSwing = Math.floor(Math.sin(this.t * 0.3) * 2);
    ctx.fillStyle = f || this.palette.body;
    ctx.fillRect(x + 2, y + 4, 10, 12);
    ctx.fillStyle = f || this.palette.head;
    ctx.fillRect(x + 3, y, 8, 6);
    ctx.fillStyle = this.palette.eye || '#ff4040';
    ctx.fillRect(x + 7, y + 2, 3, 2);
    ctx.fillStyle = '#222';
    const gx = this.dir > 0 ? x + 10 : x - 2;
    ctx.fillRect(gx, y + 8, 6, 2);
    ctx.fillStyle = '#1a3a1f';
    ctx.fillRect(x + 3, y + 16, 3, 4 + legSwing);
    ctx.fillRect(x + 8, y + 16, 3, 4 - legSwing);
  }
}

// ---- 5.2 Runner ----
class Runner extends Enemy {
  constructor(x, y, palette = { body: '#a04a1a', head: '#5a2a10' }) {
    super(x, y, 12, 14, 1, 60, palette);
    this.dir = -1;
    this.collidesPlatforms = true;
  }
  update(player) {
    this.t++;
    this.vx = this.dir * 2.4;
    this.physics(Game.groundY());
    if (this.x < Game.camera.x - 20) this.dead = true;
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    ctx.fillStyle = f || this.palette.body;
    ctx.fillRect(x + 2, y + 2, 8, 8);
    ctx.fillStyle = this.palette.head || '#5a2a10';
    ctx.fillRect(x + 2, y + 10, 8, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + (this.dir > 0 ? 10 : 0), y + 3, 2, 2);
  }
}

// ---- 5.3 Turret ----
class Turret extends Enemy {
  constructor(x, y, palette = { body: '#888', base: '#555' }) {
    super(x, y, 16, 16, 2, 200, palette);
    this.fireCD = irnd(40, 90);
  }
  update(player) {
    this.t++;
    this.fireCD--;
    if (this.fireCD <= 0) {
      this.fireCD = irnd(80, 140);
      const dx = player.x - this.x, dy = (player.y + player.h / 2) - (this.y + 4);
      const len = Math.hypot(dx, dy) || 1;
      const sp = 3.0;
      Game.bullets.push(new Bullet(this.x + this.w / 2, this.y + 4, dx / len * sp, dy / len * sp, false, 'default'));
      for (let i = 1; i <= 2; i++) {
        Game.bullets.push(new Bullet(this.x + this.w / 2, this.y + 4,
          (dx + i * 6) / len * sp, (dy + i * 3) / len * sp, false, 'default'));
      }
      Sound.shoot2();
    }
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    ctx.fillStyle = this.palette.base;
    ctx.fillRect(x, y + 10, this.w, 6);
    ctx.fillStyle = f || this.palette.body;
    ctx.fillRect(x + 4, y + 4, 8, 8);
    ctx.fillStyle = '#222';
    const ax = Math.sin(this.t * 0.02) * 2;
    ctx.fillRect(x + 5, y + 6 + ax, 10, 3);
  }
}

// ---- 5.4 Flyer ----
class Flyer extends Enemy {
  constructor(x, y, palette = { body: '#c25a2a', wing: '#a04020' }) {
    super(x, y, 18, 14, 1, 150, palette);
    this.vy = 0;
    this.baseY = y;
    this.fireCD = irnd(60, 160);
    this.dir = -1;
  }
  update(player) {
    this.t++;
    this.dir = player.x >= this.x ? 1 : -1;
    this.vx = this.dir * 1.3;
    this.y = this.baseY + Math.sin(this.t * 0.05) * 16;
    this.fireCD--;
    if (this.fireCD <= 0) {
      this.fireCD = irnd(90, 180);
      Game.bullets.push(new Bullet(this.x + this.w / 2, this.y + this.h / 2, this.dir * 3.2, 0, false, 'default'));
      Sound.shoot2();
    }
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    const wing = Math.sin(this.t * 0.6) > 0 ? 1 : 0;
    ctx.fillStyle = f || this.palette.body;
    ctx.fillRect(x + 4, y + 3, 10, 8);
    ctx.fillStyle = f || this.palette.wing;
    ctx.fillRect(x + 1, y + (wing ? 0 : 3), 3, 4);
    ctx.fillRect(x + 14, y + (wing ? 0 : 3), 3, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + (this.dir > 0 ? 11 : 4), y + 5, 2, 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + (this.dir > 0 ? 12 : 5), y + 5, 1, 2);
  }
}

// ============================================================
// 6.  Boss 基类与三个关底
// ============================================================
class BossBase extends Enemy {
  constructor(x, y, w, h, hp, score) {
    super(x, y, w, h, hp, score);
    this.baseY = y;
    this.t = 0;
    this.fireCD = 30;
    this.phase = 0;
    this.collidesPlatforms = false;
    this.dir = -1;
  }
  hit(dmg = 1) {
    this.hp -= dmg;
    this.flashT = 4;
    spark(this.x + this.w / 2, this.y + this.h / 2, 4);
    Sound.hit();
    if (this.hp <= 0) {
      explode(this.x + this.w / 2, this.y + this.h / 2, '#ff7a3a', 50, 2.5);
      explode(this.x + 20, this.y + 20, '#ffd84d', 30, 1.8);
      explode(this.x + this.w - 20, this.y + this.h - 20, '#ff4040', 30, 1.8);
      for (let i = 0; i < 20; i++) smoke(this.x + rnd(0, this.w), this.y + rnd(0, this.h), 1);
      Sound.clear();
      Game.addScore(this.score);
      this.dead = true;
      Game.triggerWin();
    }
  }
  drawHpBar() {
    const hpw = this.w, hpx = this.x, hpy = this.y - 10;
    ctx.fillStyle = '#000';
    ctx.fillRect(hpx - 1, hpy - 1, hpw + 2, 6);
    ctx.fillStyle = '#330';
    ctx.fillRect(hpx, hpy, hpw, 4);
    ctx.fillStyle = this.phase === 1 ? '#ff4040' : (this.phase === 2 ? '#ff00ff' : '#ff8a3a');
    ctx.fillRect(hpx, hpy, hpw * (this.hp / this.maxHp), 4);
  }
}

// ---- 6.1 Boss 1:  丛林堡垒 (Jungle Fortress) ----
class BossJungle extends BossBase {
  constructor(x, y) {
    super(x, y, 96, 64, 80, 5000);
  }
  update(player) {
    this.t++;
    this.bodyPulse = Math.sin(this.t * 0.1) * 2;
    this.y = this.baseY + Math.sin(this.t * 0.04) * 8;
    this.dir = player.x >= this.x ? 1 : -1;

    this.fireCD--;
    if (this.fireCD <= 0) {
      const dx = player.x - (this.x + this.w / 2);
      const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
      const len = Math.hypot(dx, dy) || 1;
      const N = this.phase === 0 ? 3 : 5;
      const spread = 0.5;
      for (let i = 0; i < N; i++) {
        const a = Math.atan2(dy, dx) + (i - (N - 1) / 2) * spread;
        Game.bullets.push(new Bullet(this.x + this.w / 2, this.y + this.h / 2,
          Math.cos(a) * 3.0, Math.sin(a) * 3.0, false, 'default'));
      }
      this.fireCD = this.phase === 0 ? 55 : 35;
      if (this.t % 200 === 0) Sound.boss();
      else Sound.shoot2();
    }
    if (this.hp < this.maxHp * 0.5) this.phase = 1;
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    // 主体
    ctx.fillStyle = '#2a1a1a';
    ctx.fillRect(x + 4, y + 8, this.w - 8, this.h - 8);
    ctx.fillStyle = f || '#5a2222';
    ctx.fillRect(x + 8, y + 12, this.w - 16, this.h - 18);
    // 装甲
    ctx.fillStyle = '#3a1414';
    ctx.fillRect(x + 6, y + 20, 4, 24);
    ctx.fillRect(x + this.w - 10, y + 20, 4, 24);
    // 炮台
    ctx.fillStyle = f || '#4a1010';
    ctx.fillRect(x + 18, y + 24, 24, 14);
    ctx.fillRect(x + this.w - 42, y + 24, 24, 14);
    // 炮管（朝向玩家）
    const gunX = this.dir > 0 ? x + this.w - 16 : x - 16;
    ctx.fillStyle = '#222';
    ctx.fillRect(gunX, y + 28, 16, 6);
    // 核心
    const coreColor = this.phase === 1 ? '#ff4040' : '#ff8a3a';
    ctx.fillStyle = coreColor;
    ctx.fillRect(x + 36, y + 22 + this.bodyPulse, 24, 18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 44, y + 28 + this.bodyPulse, 8, 6);
    // 触角
    ctx.fillStyle = '#3a1010';
    ctx.fillRect(x + 20, y + 4, 4, 6);
    ctx.fillRect(x + this.w - 24, y + 4, 4, 6);
    this.drawHpBar();
  }
}

// ---- 6.2 Boss 2:  冰雪机甲 (Ice Mecha) ----
class BossIce extends BossBase {
  constructor(x, y) {
    super(x, y, 88, 72, 100, 2600);
  }
  update(player) {
    this.t++;
    this.bodyPulse = Math.sin(this.t * 0.12) * 2;
    this.y = this.baseY + Math.sin(this.t * 0.06) * 6;
    this.dir = player.x >= this.x ? 1 : -1;
    this.fireCD--;
    if (this.fireCD <= 0) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      const dx = player.x - cx;
      const dy = (player.y + player.h / 2) - cy;
      const len = Math.hypot(dx, dy) || 1;
      // 三向弹
      const angles = this.phase === 0
        ? [-0.4, 0, 0.4]
        : [-0.6, -0.3, 0, 0.3, 0.6];
      const speed = this.phase === 0 ? 3.0 : 3.6;
      for (const off of angles) {
        const a = Math.atan2(dy, dx) + off;
        Game.bullets.push(new Bullet(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, false, 'default'));
      }
      this.fireCD = this.phase === 0 ? 50 : 32;
      if (this.t % 180 === 0) Sound.boss();
      else Sound.shoot3();
    }
    // 冰晶掉落 (阶段 1)
    if (this.phase >= 1 && this.t % 60 === 0) {
      const cx = player.x + irnd(-40, 40);
      Game.bullets.push(new Bullet(cx, this.y + this.h, 0, 4.0, false, 'default'));
      Sound.shoot2();
    }
    if (this.hp < this.maxHp * 0.6) this.phase = 1;
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    // 主体 蓝白
    ctx.fillStyle = '#1a2a52';
    ctx.fillRect(x + 4, y + 8, this.w - 8, this.h - 8);
    ctx.fillStyle = f || '#aac8ff';
    ctx.fillRect(x + 8, y + 12, this.w - 16, this.h - 18);
    // 装甲板
    ctx.fillStyle = '#3a5a8a';
    ctx.fillRect(x + 6, y + 22, 6, 28);
    ctx.fillRect(x + this.w - 12, y + 22, 6, 28);
    // 头
    ctx.fillStyle = '#e0eaff';
    ctx.fillRect(x + 24, y + 4, this.w - 48, 16);
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(x + 40, y + 10, 8, 4);
    // 炮管
    const gunX = this.dir > 0 ? x + this.w - 18 : x - 16;
    ctx.fillStyle = '#0e1c34';
    ctx.fillRect(gunX, y + 32, 18, 6);
    // 核心
    const coreColor = this.phase === 1 ? '#ff4040' : '#aac8ff';
    ctx.fillStyle = coreColor;
    ctx.fillRect(x + 32, y + 32 + this.bodyPulse, 24, 16);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 40, y + 38 + this.bodyPulse, 8, 4);
    // 冰晶装饰
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 10, y + this.h - 4, 4, 6);
    ctx.fillRect(x + this.w - 14, y + this.h - 4, 4, 6);
    this.drawHpBar();
  }
}

// ---- 6.3 Boss 3:  异形母体 (Alien Hive) ----
class BossAlien extends BossBase {
  constructor(x, y) {
    super(x, y, 112, 80, 140, 10000);
  }
  update(player) {
    this.t++;
    this.bodyPulse = Math.sin(this.t * 0.08) * 3;
    this.y = this.baseY + Math.sin(this.t * 0.03) * 10;
    this.dir = player.x >= this.x ? 1 : -1;
    this.fireCD--;
    if (this.fireCD <= 0) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      // 扇形弹幕
      const N = this.phase === 2 ? 12 : (this.phase === 1 ? 8 : 5);
      const baseAngle = Math.atan2(player.y + player.h/2 - cy, player.x - cx);
      for (let i = 0; i < N; i++) {
        const a = baseAngle + (i - (N - 1) / 2) * 0.22;
        const sp = 2.8 + this.phase * 0.3;
        Game.bullets.push(new Bullet(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, false, 'default'));
      }
      this.fireCD = this.phase === 2 ? 30 : (this.phase === 1 ? 40 : 55);
      if (this.t % 180 === 0) Sound.boss();
      else Sound.shoot2();
    }
    // 阶段切换
    if (this.hp < this.maxHp * 0.66 && this.phase === 0) { this.phase = 1; Game.camera.addShake(8); Sound.boss(); }
    if (this.hp < this.maxHp * 0.33 && this.phase === 1) { this.phase = 2; Game.camera.addShake(10); Sound.boss(); }
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    // 外壳
    ctx.fillStyle = '#1a0a2a';
    ctx.fillRect(x + 4, y + 8, this.w - 8, this.h - 8);
    ctx.fillStyle = f || '#5a1a7a';
    ctx.fillRect(x + 8, y + 12, this.w - 16, this.h - 18);
    // 触须
    ctx.fillStyle = '#aa3aff';
    ctx.fillRect(x + 6, y + this.h / 2 - 4, 4, 8 + Math.sin(this.t * 0.1) * 2);
    ctx.fillRect(x + this.w - 10, y + this.h / 2 - 4, 4, 8 + Math.sin(this.t * 0.1 + 1) * 2);
    // 触角
    ctx.fillStyle = '#ff5be0';
    ctx.fillRect(x + 20, y + 4, 4, 8 + Math.sin(this.t * 0.15) * 3);
    ctx.fillRect(x + this.w - 24, y + 4, 4, 8 + Math.sin(this.t * 0.15 + 2) * 3);
    // 多个核心眼
    const cores = this.phase === 2 ? 3 : (this.phase === 1 ? 2 : 1);
    const coreW = 28, gap = 4;
    const totalW = cores * coreW + (cores - 1) * gap;
    const sx = x + (this.w - totalW) / 2;
    const pulse = Math.sin(this.t * 0.2) * 2;
    for (let i = 0; i < cores; i++) {
      const cx = sx + i * (coreW + gap);
      const cy = y + 28 + pulse;
      ctx.fillStyle = this.phase === 2 ? '#ff00ff' : '#ff5be0';
      ctx.fillRect(cx, cy, coreW, 20);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx + 6, cy + 6, 8, 8);
      ctx.fillStyle = '#000';
      ctx.fillRect(cx + 9, cy + 9, 2, 2);
    }
    // 牙齿
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(x + 16 + i * 12, y + this.h - 10, 6, 4);
    }
    this.drawHpBar();
  }
}

// ============================================================
// 7.  玩家
// ============================================================
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 14; this.h = 18;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.onGround = false;
    this.fireCD = 0;
    this.aimY = 0;
    this.fireMode = W.default;
    this.weaponTimer = 0;
    this.hp = 3;
    this.maxHp = 3;
    this.t = 0;
    this.alive = true;
    this.deathT = 0;
    this.invuln = 60;
    this.firing = false;
    this.runFrame = 0;
  }
  setWeapon(w) {
    this.fireMode = w;
    this.weaponTimer = 60 * 30;
    Sound.powerup();
  }
  hit() {
    if (this.invuln > 0 || !this.alive) return;
    this.hp--;
    this.invuln = 90;
    Sound.death();
    explode(this.x + this.w / 2, this.y + this.h / 2, '#ff5577', 18, 1.4);
    Game.camera.addShake(8);
    if (this.hp <= 0) {
      this.alive = false;
      this.deathT = 90;
    } else {
      this.vy = -4;
      this.vx = -this.dir * 3;
    }
  }
  update() {
    if (!this.alive) {
      this.deathT--;
      if (this.deathT % 4 === 0) explode(this.x + this.w / 2, this.y + this.h / 2, '#ff8a3a', 4, 0.7);
      if (this.deathT <= 0) Game.loseLife();
      return;
    }
    this.t++;
    if (this.invuln > 0) this.invuln--;
    if (this.weaponTimer > 0) {
      this.weaponTimer--;
      if (this.weaponTimer <= 0) this.fireMode = W.default;
    }
    if (this.fireCD > 0) this.fireCD--;

    const left  = Input.isDown('arrowleft', 'a');
    const right = Input.isDown('arrowright', 'd');
    const up    = Input.isDown('arrowup', 'w');
    const down  = Input.isDown('arrowdown', 's');
    const jump  = Input.isDown('x', 'k', ' ');
    const shoot = Input.isDown('z', 'j');

    this.vx = 0;
    if (left && !right)  { this.vx = -PLAYER_SPEED; this.dir = -1; }
    if (right && !left)  { this.vx =  PLAYER_SPEED; this.dir = 1; }

    if (up && !down)      this.aimY = -1;
    else if (down && !up) this.aimY = 1;
    else                  this.aimY = 0;

    if (jump && this.onGround) {
      this.vy = JUMP_V;
      this.onGround = false;
      Sound.jump();
    }

    this.vy += GRAVITY;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    // 水平
    this.x += this.vx;
    for (const p of Game.platforms) {
      if (aabb(this, p)) {
        if (this.vx > 0) this.x = p.x - this.w;
        else if (this.vx < 0) this.x = p.x + p.w;
      }
    }
    // 垂直
    this.y += this.vy;
    this.onGround = false;
    const gy = Game.groundY();
    if (this.y + this.h >= gy) {
      this.y = gy - this.h;
      this.vy = 0;
      this.onGround = true;
    }
    for (const p of Game.platforms) {
      if (this.vy > 0 &&
          this.x + this.w > p.x && this.x < p.x + p.w &&
          this.y + this.h > p.y && this.y + this.h - this.vy <= p.y + 1) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.onGround = true;
      } else if (this.vy <= 0 &&
                 this.x + this.w > p.x && this.x < p.x + p.w &&
                 this.y < p.y + p.h && this.y - this.vy >= p.y + p.h - 1) {
        this.y = p.y + p.h;
        this.vy = 0;
      }
    }

    if (this.x < 0) this.x = 0;
    if (this.x > Game.levelW() - this.w) this.x = Game.levelW() - this.w;

    if (this.onGround && this.vx !== 0) this.runFrame += 0.25;
    else this.runFrame = 0;

    if (shoot) this.fire();
  }

  fire() {
    if (this.fireCD > 0) return;
    this.fireCD = FIRE_COOLDOWN[this.fireMode] ?? 10;
    const cx = this.x + this.w / 2 + this.dir * 6;
    const cy = this.y + 8 + (this.aimY === -1 ? -6 : this.aimY === 1 ? 6 : 0);
    let vx = this.dir * 6, vy = 0;
    if (this.aimY === -1) vy = -2.5;
    else if (this.aimY === 1) vy = 2.5;

    const spawn = (vx_, vy_, kind) => {
      Game.bullets.push(new Bullet(cx, cy, vx_, vy_, true, kind));
    };
    if (this.fireMode === W.default) {
      spawn(vx, vy, 'default');
      Sound.shoot();
    } else if (this.fireMode === W.rapid) {
      spawn(vx * 1.2, vy, 'rapid');
      Sound.shoot();
    } else if (this.fireMode === W.spread) {
      for (let i = -2; i <= 2; i++) {
        const a = Math.atan2(vy, vx) + i * 0.16;
        spawn(Math.cos(a) * 6, Math.sin(a) * 6, 'spread');
      }
      Sound.shoot();
    } else if (this.fireMode === W.laser) {
      spawn(vx * 1.6, vy * 1.4, 'laser');
      Sound.laser();
    }
  }

  draw() {
    if (!this.alive) return;
    if (this.invuln > 0 && this.t % 4 < 2) return;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const flip = this.dir < 0;

    ctx.save();
    if (flip) { ctx.translate(x + this.w, y); ctx.scale(-1, 1); }
    else { ctx.translate(x, y); }

    // 腿
    const legA = Math.sin(this.runFrame) * 2.5;
    ctx.fillStyle = '#1f5b30';
    ctx.fillRect(2, 14 + legA, 3, 4 - legA);
    ctx.fillRect(9, 14 - legA, 3, 4 + legA);

    // 身体
    ctx.fillStyle = '#1a4ea0';
    ctx.fillRect(2, 5, 10, 9);
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(2, 11, 10, 1);
    // 头
    ctx.fillStyle = '#ffd6a0';
    ctx.fillRect(3, 0, 8, 6);
    // 头盔
    ctx.fillStyle = '#1f7bcc';
    ctx.fillRect(2, -1, 10, 3);
    ctx.fillStyle = '#0e3b66';
    ctx.fillRect(2, -1, 10, 1);
    // 眼
    ctx.fillStyle = '#000';
    ctx.fillRect(8, 2, 2, 2);
    // 嘴
    ctx.fillStyle = '#a04020';
    ctx.fillRect(8, 5, 2, 1);

    // 武器颜色
    if (this.fireMode !== W.default) {
      ctx.fillStyle = WPN_COLOR[this.fireMode];
      ctx.fillRect(2, 5, 10, 1);
    }

    if (this.aimY === -1) {
      ctx.fillStyle = '#ffd6a0';
      ctx.fillRect(5, 2, 3, 4);
      ctx.fillStyle = '#333';
      ctx.fillRect(7, 1, 2, 6);
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        ctx.fillStyle = WPN_COLOR[this.fireMode] || '#ffd84d';
        ctx.fillRect(6, -3, 5, 4);
      }
    } else if (this.aimY === 1 && this.onGround) {
      ctx.fillStyle = '#ffd6a0';
      ctx.fillRect(7, 10, 6, 2);
      ctx.fillStyle = '#333';
      ctx.fillRect(11, 9, 6, 3);
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        ctx.fillStyle = WPN_COLOR[this.fireMode] || '#ffd84d';
        ctx.fillRect(16, 9, 4, 3);
      }
    } else {
      ctx.fillStyle = '#ffd6a0';
      ctx.fillRect(7, 6, 4, 3);
      ctx.fillStyle = '#333';
      ctx.fillRect(10, 7, 6, 3);
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        ctx.fillStyle = WPN_COLOR[this.fireMode] || '#ffd84d';
        ctx.fillRect(15, 7, 4, 3);
      }
    }

    ctx.fillStyle = '#222';
    ctx.fillRect(2, 18 + legA, 3, 1);
    ctx.fillRect(9, 18 - legA, 3, 1);

    ctx.restore();
  }
}

// ============================================================
// 8.  关卡定义  -  3 关不同主题 + 平台 + 刷怪
// ============================================================
const STAGES = [
  {
    name: '热带丛林',
    subtitle: 'JUNGLE — STAGE 1',
    width: 4096,
    groundY: VH - 40,
    sky1: '#0a1838', sky2: '#16234a',
    mountain1: '#142544', mountain2: '#1a2c52',
    tree: '#0e1c34',
    ground: '#2d4a1f', dirt: '#5a3a1a', grass: '#3d6b2a',
    platformColor: '#243a1f', platformTop: '#3d6b2a',
    palettes: {
      grunt:  { body: '#2d6b3a', head: '#3d8a4a', eye: '#ff4040' },
      runner: { body: '#a04a1a', head: '#5a2a10' },
      turret: { body: '#888', base: '#555' },
      flyer:  { body: '#c25a2a', wing: '#a04020' },
    },
    platforms: [
      new Platform(360,  VH - 90,  96, 12, '#243a1f', '#3d6b2a'),
      new Platform(560,  VH - 130, 80, 12, '#243a1f', '#3d6b2a'),
      new Platform(720,  VH - 90,  80, 12, '#243a1f', '#3d6b2a'),
      new Platform(960,  VH - 120, 96, 12, '#243a1f', '#3d6b2a'),
      new Platform(1180, VH - 160, 80, 12, '#243a1f', '#3d6b2a'),
      new Platform(1380, VH - 100, 100, 12, '#243a1f', '#3d6b2a'),
      new Platform(1580, VH - 160, 80, 12, '#243a1f', '#3d6b2a'),
      new Platform(1780, VH - 100, 96, 12, '#243a1f', '#3d6b2a'),
      new Platform(2000, VH - 140, 120, 12, '#243a1f', '#3d6b2a'),
      new Platform(2200, VH - 90,  80, 12, '#243a1f', '#3d6b2a'),
      new Platform(2400, VH - 150, 96, 12, '#243a1f', '#3d6b2a'),
      new Platform(2620, VH - 100, 80, 12, '#243a1f', '#3d6b2a'),
      new Platform(2840, VH - 170, 100, 12, '#243a1f', '#3d6b2a'),
      new Platform(3060, VH - 110, 100, 12, '#243a1f', '#3d6b2a'),
      new Platform(3260, VH - 170, 80, 12, '#243a1f', '#3d6b2a'),
      new Platform(3460, VH - 100, 120, 12, '#243a1f', '#3d6b2a'),
    ],
    BossClass: BossJungle,
    spawnPattern: [
      ['grunt', 6], ['runner', 3], ['flyer', 3], ['turret', 2],
    ],
  },
  {
    name: '冰雪基地',
    subtitle: 'ICE BASE — STAGE 2',
    width: 4096,
    groundY: VH - 40,
    sky1: '#0e1c34', sky2: '#1a2c52',
    mountain1: '#3a5a8a', mountain2: '#5a7aaa',
    tree: '#aac8ff',
    ground: '#cce4ff', dirt: '#aabfd9', grass: '#e0eaff',
    platformColor: '#aac8ff', platformTop: '#ffffff',
    palettes: {
      grunt:  { body: '#3a4a7a', head: '#5a6a9a', eye: '#ff4040' },
      runner: { body: '#5a6aaa', head: '#3a4a7a' },
      turret: { body: '#8888cc', base: '#3a3a6a' },
      flyer:  { body: '#88aaff', wing: '#3a5a8a' },
    },
    platforms: [
      // 多层高低差的冰雪平台
      new Platform(280,  VH - 90,  96, 12, '#aac8ff', '#ffffff'),
      new Platform(460,  VH - 130, 80, 12, '#aac8ff', '#ffffff'),
      new Platform(620,  VH - 90,  64, 12, '#aac8ff', '#ffffff'),
      new Platform(820,  VH - 140, 100, 12, '#aac8ff', '#ffffff'),
      new Platform(1020, VH - 100, 80, 12, '#aac8ff', '#ffffff'),
      new Platform(1200, VH - 170, 80, 12, '#aac8ff', '#ffffff'),
      new Platform(1380, VH - 110, 100, 12, '#aac8ff', '#ffffff'),
      new Platform(1600, VH - 160, 80, 12, '#aac8ff', '#ffffff'),
      new Platform(1800, VH - 100, 96, 12, '#aac8ff', '#ffffff'),
      new Platform(2000, VH - 150, 100, 12, '#aac8ff', '#ffffff'),
      new Platform(2200, VH - 90,  80, 12, '#aac8ff', '#ffffff'),
      new Platform(2380, VH - 130, 96, 12, '#aac8ff', '#ffffff'),
      new Platform(2580, VH - 100, 80, 12, '#aac8ff', '#ffffff'),
      new Platform(2800, VH - 170, 100, 12, '#aac8ff', '#ffffff'),
      new Platform(3020, VH - 110, 80, 12, '#aac8ff', '#ffffff'),
      new Platform(3220, VH - 150, 96, 12, '#aac8ff', '#ffffff'),
      new Platform(3440, VH - 100, 120, 12, '#aac8ff', '#ffffff'),
    ],
    BossClass: BossIce,
    spawnPattern: [
      ['grunt', 5], ['runner', 4], ['flyer', 4], ['turret', 3],
    ],
  },
  {
    name: '异形要塞',
    subtitle: 'ALIEN HIVE — STAGE 3',
    width: 4096,
    groundY: VH - 40,
    sky1: '#1a0a2a', sky2: '#3a1a4a',
    mountain1: '#3a1a4a', mountain2: '#5a2a6a',
    tree: '#aa3aff',
    ground: '#2a1a4a', dirt: '#5a2a6a', grass: '#7a2aaa',
    platformColor: '#4a1a6a', platformTop: '#aa3aff',
    palettes: {
      grunt:  { body: '#7a2a4a', head: '#aa2a6a', eye: '#ff00ff' },
      runner: { body: '#aa2a7a', head: '#5a1a4a' },
      turret: { body: '#aa3aff', base: '#5a1a7a' },
      flyer:  { body: '#ff5be0', wing: '#aa2a7a' },
    },
    platforms: [
      // 异形生物平台 (发光)
      new Platform(320,  VH - 100, 96, 12, '#4a1a6a', '#aa3aff'),
      new Platform(520,  VH - 160, 80, 12, '#4a1a6a', '#aa3aff'),
      new Platform(680,  VH - 100, 64, 12, '#4a1a6a', '#aa3aff'),
      new Platform(880,  VH - 130, 100, 12, '#4a1a6a', '#aa3aff'),
      new Platform(1080, VH - 170, 80, 12, '#4a1a6a', '#aa3aff'),
      new Platform(1260, VH - 100, 96, 12, '#4a1a6a', '#aa3aff'),
      new Platform(1460, VH - 150, 80, 12, '#4a1a6a', '#aa3aff'),
      new Platform(1660, VH - 100, 100, 12, '#4a1a6a', '#aa3aff'),
      new Platform(1880, VH - 140, 96, 12, '#4a1a6a', '#aa3aff'),
      new Platform(2080, VH - 90,  80, 12, '#4a1a6a', '#aa3aff'),
      new Platform(2260, VH - 130, 100, 12, '#4a1a6a', '#aa3aff'),
      new Platform(2480, VH - 100, 80, 12, '#4a1a6a', '#aa3aff'),
      new Platform(2680, VH - 170, 96, 12, '#4a1a6a', '#aa3aff'),
      new Platform(2900, VH - 110, 100, 12, '#4a1a6a', '#aa3aff'),
      new Platform(3100, VH - 160, 80, 12, '#4a1a6a', '#aa3aff'),
      new Platform(3300, VH - 100, 100, 12, '#4a1a6a', '#aa3aff'),
      new Platform(3500, VH - 140, 96, 12, '#4a1a6a', '#aa3aff'),
    ],
    BossClass: BossAlien,
    spawnPattern: [
      ['grunt', 4], ['runner', 5], ['flyer', 5], ['turret', 4],
    ],
  },
];

// ============================================================
// 9.  关卡
// ============================================================
class Level {
  constructor(stageIdx) {
    this.stageIdx = stageIdx;
    this.def = STAGES[stageIdx];
    this.width = this.def.width;
    this.ground = this.def.groundY;
    this.platforms = this.def.platforms;
    this.spawns = [];
    this.generateSpawns();
    this.bossSpawned = false;
    this.bossX = this.width - 200;
  }
  generateSpawns() {
    let x = 320;
    while (x < this.width - 500) {
      // 按本关 spawnPattern 加权随机
      const total = this.def.spawnPattern.reduce((s, [, n]) => s + n, 0);
      let r = Math.random() * total;
      let type = 'grunt';
      for (const [t, n] of this.def.spawnPattern) {
        if ((r -= n) <= 0) { type = t; break; }
      }
      const groundY = this.ground - 20;
      const y = type === 'flyer' ? irnd(60, 140)
              : type === 'turret' ? this.ground - 16
              : groundY;
      this.spawns.push({ x, y, type, delay: 0 });
      x += irnd(160, 280);
    }
    // Boss 战前双小怪
    this.spawns.push({ x: this.width - 380, y: this.ground - 20, type: 'grunt', delay: 0 });
    this.spawns.push({ x: this.width - 340, y: irnd(60, 130), type: 'flyer', delay: 0 });
    if (this.stageIdx >= 1) this.spawns.push({ x: this.width - 300, y: this.ground - 20, type: 'turret', delay: 0 });
  }
  update(player) {
    for (const sp of this.spawns) {
      if (sp.x < 0) continue;
      if (sp.x < Game.camera.x + VW + 40) {
        const cls = { grunt: Grunt, runner: Runner, turret: Turret, flyer: Flyer }[sp.type];
        const e = new cls(sp.x, sp.y, this.def.palettes[sp.type]);
        e.dir = -1;
        Game.enemies.push(e);
        sp.x = -9999;
      }
    }
    if (!this.bossSpawned && player.x > this.width - 600) {
      this.bossSpawned = true;
      const b = new this.def.BossClass(this.bossX, this.ground - 80);
      Game.enemies.push(b);
      Game.camera.addShake(6);
      Sound.boss();
      flash('BOSS!', 80);
    }
  }
}

// ============================================================
// 10.  主游戏 (状态机 + 渲染)
// ============================================================
const flashQueue = [];
function flash(text, frames = 80) {
  flashQueue.push({ text, t: frames });
}

// UI overlay helpers
function setOverlay(state) {
  const ov = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const text  = document.getElementById('overlay-text');
  if (!ov) return;
  if (state === 'hidden') {
    ov.classList.add('hidden');
    return;
  }
  ov.classList.remove('hidden');
  if (state === 'menu') {
    title.textContent = '魂斗罗';
    text.innerHTML  = '按 ENTER 开始';
  } else if (state === 'over') {
    title.textContent = 'GAME OVER';
    text.innerHTML  = `分数 ${Game.score} · 按 ENTER 重开`;
  } else if (state === 'complete') {
    title.textContent = '全部通关!';
    text.innerHTML  = `最终分数 ${Game.score} · ENTER 重玩`;
  } else if (state === 'paused') {
    title.textContent = 'PAUSE';
    text.innerHTML  = '按 P 继续 · R 重开';
  }
}

const Game = {
  state: 'menu',          // menu / playing / paused / stage / over / win / complete
  stateTimer: 0,
  score: 0,
  highScore: Number(localStorage.getItem('contra_hs') || 0),
  lives: 3,
  stageIdx: 0,
  player: null,
  levelObj: null,
  camera: new Camera(),
  bullets: [],
  enemies: [],
  particles: [],
  powerups: [],
  platforms: [],
  groundY() { return this.levelObj ? this.levelObj.ground : VH - 40; },
  levelW()  { return this.levelObj ? this.levelObj.width : VW; },

  start() {
    this.state = 'playing';
    this.score = 0;
    this.lives = 3;
    this.stageIdx = 0;
    this.loadStage(this.stageIdx);
    Sound.start();
    flash('STAGE 1 — 热带丛林', 120);
  },

  loadStage(idx) {
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.powerups = [];
    this.levelObj = new Level(idx);
    this.platforms = this.levelObj.platforms;
    this.player = new Player(40, this.levelObj.ground - 18);
    this.camera.x = 0; this.camera.y = 0;
  },

  addScore(s) {
    this.score += s;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try { localStorage.setItem('contra_hs', String(this.highScore)); } catch (_) {}
    }
  },

  activateCheat() {
    if (!this.player) return;
    this.lives = 30;
    flash('秘籍激活! 30 条命', 100);
  },

  loseLife() {
    this.lives--;
    if (this.lives <= 0) {
      this.state = 'over';
      this.stateTimer = 0;
      Sound.over();
    } else {
      this.player = new Player(Math.max(20, this.player ? this.player.x - 60 : 40), this.levelObj.ground - 18);
      this.player.invuln = 100;
    }
  },

  triggerWin() {
    if (this.stageIdx < STAGES.length - 1) {
      this.state = 'stage';
      this.stateTimer = 180;   // 3 秒过渡
      this.addScore(2000);
      Sound.clear();
    } else {
      this.state = 'complete';
      this.stateTimer = 0;
      this.addScore(10000);
      Sound.clear();
    }
  },

  update() {
    // ---- 菜单 ----
    if (this.state === 'menu') {
      if (Input.consume('enter') || Input.consume(' ')) this.start();
      return;
    }
    // ---- 关卡过渡 ----
    if (this.state === 'stage') {
      this.stateTimer--;
      if (this.stateTimer <= 0) {
        this.stageIdx++;
        this.loadStage(this.stageIdx);
        this.state = 'playing';
        flash('STAGE ' + (this.stageIdx + 1) + ' — ' + STAGES[this.stageIdx].name, 120);
      }
      return;
    }
    // ---- 暂停 ----
    if (this.state === 'paused') {
      if (Input.consume('p') || Input.consume('enter')) this.state = 'playing';
      return;
    }
    if (this.state === 'playing' && Input.consume('p')) { this.state = 'paused'; return; }
    if (Input.consume('r')) { this.start(); return; }

    // ---- 通关 / 结束 ----
    if (this.state === 'over' || this.state === 'complete') {
      this.stateTimer++;
      if (Math.random() < 0.4) {
        this.particles.push(new Particle(rnd(0, VW), rnd(0, VH), rnd(-0.3, 0.3), rnd(-0.3, 0.3), 60, pick(['#ffd84d', '#ff5b3a', '#4ab8ff']), 2, 0));
      }
      for (const p of this.particles) p.update();
      this.particles = this.particles.filter(p => !p.dead);
      if (this.stateTimer > 90 && (Input.consume('enter') || Input.consume(' '))) {
        this.start();
      }
      return;
    }

    // ---- 游戏中 ----
    if (this.state !== 'playing') return;

    this.levelObj.update(this.player);
    this.player.update();

    for (const b of this.bullets) b.update();
    this.bullets = this.bullets.filter(b => !b.dead);

    for (const e of this.enemies) e.update(this.player);
    this.enemies = this.enemies.filter(e => !e.dead && e.x > this.camera.x - 60);

    for (const p of this.powerups) p.update();
    this.powerups = this.powerups.filter(p => !p.dead);

    for (const p of this.particles) p.update();
    this.particles = this.particles.filter(p => !p.dead);

    // 子弹碰撞
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.friendly) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (aabb(b, e)) {
            e.hit(b.damage);
            if (!b.pierce) b.dead = true;
          }
        }
      } else {
        if (this.player.alive && aabb(b, this.player)) {
          this.player.hit();
          b.dead = true;
        }
      }
    }

    // 敌人触碰玩家
    if (this.player.alive) {
      for (const e of this.enemies) {
        if (!e.dead && aabb(e, this.player)) {
          this.player.hit();
          e.hit(99);
          break;
        }
      }
    }

    // 掉宝拾取
    if (this.player.alive) {
      for (const p of this.powerups) {
        if (aabb(p, this.player)) {
          if (p.type === 'health') {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
            Sound.powerup();
          } else {
            this.player.setWeapon(p.type);
          }
          explode(p.x + p.w / 2, p.y + p.h / 2, '#ffd84d', 12, 0.8);
          p.dead = true;
        }
      }
    }

    this.camera.follow(this.player);

    // 关卡完成 (走到最右)
    if (this.player.x >= this.levelObj.width - 16 && !this.levelObj.bossSpawned) {
      this.triggerWin();
    }
  },

  render() {
    const def = this.levelObj ? this.levelObj.def : STAGES[0];

    // 同步 overlay UI 状态
    if (this.state === 'menu')        setOverlay('menu');
    else if (this.state === 'playing' || this.state === 'stage') setOverlay('hidden');
    else if (this.state === 'paused') setOverlay('paused');
    else if (this.state === 'over')   setOverlay('over');
    else if (this.state === 'complete') setOverlay('complete');

    // 背景渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, VH);
    skyGrad.addColorStop(0, def.sky1);
    skyGrad.addColorStop(1, def.sky2);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, VW, VH);

    if (this.state === 'menu') {
      this.drawTitle();
      return;
    }

    // 星辰闪烁 (Stage 3)
    if (this.stageIdx === 2) {
      this.drawStars();
    }

    // 游戏世界
    this.camera.apply(() => {
      this.drawParallax(def);
      for (const p of this.platforms) p.draw();
      this.drawGround(def);
      for (const p of this.powerups) p.draw();
      for (const e of this.enemies) e.draw();
      for (const b of this.bullets) b.draw();
      if (this.player) this.player.draw();
      for (const p of this.particles) p.draw();
    });

    // HUD
    this.drawHUD(def);

    // 关卡过渡黑幕
    if (this.state === 'stage') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#ffcc33';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STAGE CLEAR!', VW / 2, VH / 2 - 18);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      const next = STAGES[this.stageIdx + 1];
      if (next) ctx.fillText('下一关: ' + next.name, VW / 2, VH / 2 + 6);
      ctx.fillText('分数 +2000', VW / 2, VH / 2 + 24);
    }
    if (this.state === 'paused') this.drawCenterText('PAUSE', '按 P 继续 · R 重开');
    if (this.state === 'over')   this.drawCenterText('GAME OVER', `分数 ${this.score}  ·  按 ENTER 重开`);
    if (this.state === 'complete') this.drawCenterText('全部通关!', `最终分数 ${this.score}  ·  ENTER 重玩`);

    // 中央 flash 文字 (类似 "STAGE 1")
    if (flashQueue.length > 0) {
      const f = flashQueue[0];
      const a = Math.min(1, f.t / 18);
      const a2 = Math.min(1, (f.t - 30) / 12);
      ctx.fillStyle = `rgba(255,204,51,${a})`;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, VW / 2, VH / 2 - 20);
      f.t--;
      if (f.t <= 0) flashQueue.shift();
    }
  },

  drawStars() {
    // 简单的静态星点
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const cx = this.camera.x;
    for (let i = 0; i < 40; i++) {
      const sx = (i * 73 + cx * 0.05) % VW;
      const sy = (i * 47) % (VH - 60);
      const tw = (Math.sin(this.camera.x * 0.01 + i) + 1) * 0.5;
      ctx.globalAlpha = tw;
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;
  },

  drawTitle() {
    const t = performance.now() / 1000;
    const def = STAGES[0];
    // 山
    ctx.fillStyle = def.mountain1;
    for (let i = 0; i < 6; i++) {
      const h = 30 + Math.sin(i * 0.9 + t) * 10;
      ctx.fillRect(i * 96, VH - 60 - h, 96, VH);
    }
    ctx.fillStyle = def.mountain2;
    for (let i = 0; i < 8; i++) {
      const h = 20 + Math.sin(i * 1.1 + t * 1.3) * 6;
      ctx.fillRect(i * 80, VH - 50 - h, 80, VH);
    }
    // 标题
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTRA', VW / 2, 80);
    ctx.fillStyle = '#ff5b3a';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('CLASSIC — 1987', VW / 2, 102);

    // 角色剪影
    const px = VW / 2 - 24, py = 130;
    ctx.fillStyle = '#1a4ea0';
    ctx.fillRect(px, py, 12, 18);
    ctx.fillStyle = '#1f7bcc';
    ctx.fillRect(px - 1, py - 2, 14, 4);
    ctx.fillStyle = '#ffd6a0';
    ctx.fillRect(px + 1, py + 1, 10, 8);
    ctx.fillStyle = '#000';
    ctx.fillRect(px + 7, py + 4, 2, 2);
    ctx.fillStyle = '#1f5b30';
    ctx.fillRect(px + 1, py + 18, 4, 6);
    ctx.fillRect(px + 7, py + 18, 4, 6);
    // 武器
    ctx.fillStyle = '#333';
    ctx.fillRect(px + 12, py + 6, 8, 3);

    // 操作提示
    ctx.fillStyle = '#aac8ff';
    ctx.font = '10px monospace';
    ctx.fillText('↑↑↓↓←→←→BA = 30 LIVES', VW / 2, 175);

    // 最高分
    if (this.highScore > 0) {
      ctx.fillStyle = '#ffcc33';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('HI  ' + String(this.highScore).padStart(6, '0'), VW / 2, 200);
    }

    // 闪烁
    const blink = Math.floor(t * 2) % 2;
    if (blink) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS ENTER TO START', VW / 2, VH - 50);
    }

    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.fillText('3 STAGES  ·  3 BOSSES  ·  4 WEAPONS', VW / 2, VH - 26);
  },

  drawParallax(def) {
    const cx = this.camera.x;
    // 远山
    ctx.fillStyle = def.mountain1;
    for (let i = 0; i < 12; i++) {
      const h = 30 + Math.sin(i * 1.3 + cx * 0.001) * 8;
      const x = i * 90 - (cx * 0.3 % 90);
      ctx.fillRect(x, VH - 60 - h, 90, VH);
    }
    ctx.fillStyle = def.mountain2;
    for (let i = 0; i < 14; i++) {
      const h = 20 + Math.sin(i * 1.1 + cx * 0.002) * 6;
      const x = i * 80 - (cx * 0.5 % 80);
      ctx.fillRect(x, VH - 50 - h, 80, VH);
    }
    // 树 / 装饰
    ctx.fillStyle = def.tree;
    for (let i = 0; i < 16; i++) {
      const x = i * 70 - (cx * 0.7 % 70);
      if (this.stageIdx === 2) {
        // 异形: 紫色荧光柱
        ctx.fillStyle = '#1a0a2a';
        ctx.fillRect(x, VH - 70, 4, 30);
        ctx.fillStyle = '#aa3aff';
        ctx.fillRect(x + 4, VH - 80, 12, 6);
      } else {
        ctx.fillStyle = def.tree;
        ctx.fillRect(x, VH - 70, 6, 30);
        ctx.fillRect(x - 6, VH - 80, 18, 12);
      }
    }
  },

  drawGround(def) {
    const gy = this.groundY();
    const x0 = Math.floor(this.camera.x / 16) * 16 - 16;
    const x1 = x0 + VW + 48;
    ctx.fillStyle = def.ground;
    ctx.fillRect(x0, gy, x1 - x0, VH - gy);
    // 草顶
    ctx.fillStyle = def.grass;
    for (let x = x0; x < x1; x += 8) {
      ctx.fillRect(x, gy - 1, 6, 2);
      ctx.fillRect(x + 4, gy - 3, 4, 3);
    }
    // 土层
    ctx.fillStyle = def.dirt;
    ctx.fillRect(x0, gy + 6, x1 - x0, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x0, gy + 10, x1 - x0, VH);
  },

  drawHUD(def) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, VW, 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('P' + (this.stageIdx + 1), 4, 4);
    // 生命
    ctx.fillStyle = '#ff5577';
    for (let i = 0; i < this.player.hp; i++) {
      const x = 24 + i * 12;
      ctx.fillRect(x + 2, 6, 2, 6);
      ctx.fillRect(x + 6, 6, 2, 6);
      ctx.fillRect(x + 1, 8, 8, 3);
      ctx.fillRect(x + 2, 11, 6, 2);
      ctx.fillRect(x + 3, 13, 4, 1);
    }
    // 武器
    if (this.player.fireMode !== W.default && this.player.weaponTimer > 0) {
      const remain = (this.player.weaponTimer / 60).toFixed(1);
      ctx.fillStyle = WPN_COLOR[this.player.fireMode];
      ctx.fillText(WPN_LABEL[this.player.fireMode] + '  ' + remain + 's', 80, 4);
    }
    // 关卡名
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aac8ff';
    ctx.font = '8px monospace';
    ctx.fillText('STAGE ' + (this.stageIdx + 1) + '/' + STAGES.length + '  ' + (def ? def.name : ''), VW / 2, 5);
    // 分数
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(String(this.score).padStart(6, '0'), VW / 2, 14);
    // 命数
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4ab8ff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('× ' + this.lives, VW - 4, 4);
    ctx.fillStyle = '#888';
    ctx.font = '8px monospace';
    ctx.fillText('HI ' + String(this.highScore).padStart(6, '0'), VW - 4, 14);
  },

  drawCenterText(title, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, VH / 2 - 40, VW, 80);
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, VW / 2, VH / 2 - 8);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(sub, VW / 2, VH / 2 + 14);
  },
};

// ============================================================
// 11.  主循环  -  固定 60Hz 逻辑 + 渲染
// ============================================================
const FIXED_DT = 1000 / 60;
let last = performance.now();
let acc = 0;

function loop(now) {
  const elapsed = Math.min(100, now - last);   // 防止后台标签页时间爆炸
  last = now;
  acc += elapsed;
  // 固定步长更新 (最多 5 帧防卡死)
  let safety = 5;
  while (acc >= FIXED_DT && safety-- > 0) {
    Game.update();
    acc -= FIXED_DT;
  }
  Game.render();
  requestAnimationFrame(loop);
}

// ============================================================
// 12.  启动
// ============================================================
Input.bind();
requestAnimationFrame(loop);

})();