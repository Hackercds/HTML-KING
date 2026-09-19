/* ============================================================
 *  魂斗罗 CLASSIC CONTRA  -  Canvas HTML5 横版射击 (HD 视觉增强版)
 *  --------------------------------------------------------------
 *  · 玩家/敌人/Boss 全部多色像素精灵 + 4 帧走跑动画
 *  · 粒子系统：多色渐变 + 拖尾 + 烟雾 + 火花分层
 *  · 屏幕特效：受击红屏、Boss 受击白屏、屏幕震动、扫描线 + 渐晕
 *  · HUD：发光字、脉冲生命、武器图标、火焰粒子
 *  · 背景：4 层视差 + 飞鸟 / 流星 / 水波 / 异星粒子
 *  · 关卡：3 个独立主题 + 专属 Boss + 专属粒子配色
 *  · 输入：键盘 + 触屏 + Konami 30 条命
 * ============================================================ */
(() => {
'use strict';

// ============================================================
// 0.  画布 & 基础常量
// ============================================================
const C = document.getElementById('game');
const ctx = C.getContext('2d');
ctx.imageSmoothingEnabled = false;

const VW = C.width;   // 512
const VH = C.height;  // 320

const GRAVITY   = 0.55;
const MAX_FALL  = 8;
const PLAYER_SPEED = 2.1;
const JUMP_V    = -8.8;

const FIRE_COOLDOWN = { default: 10, rapid: 5, spread: 14, laser: 6 };
const W = { default: 'default', rapid: 'rapid', spread: 'spread', laser: 'laser' };
const WPN_LABEL = { default: 'M', rapid: 'F', spread: 'S', laser: 'L' };
const WPN_COLOR = { default: '#fff7c0', rapid: '#a0ffa0', spread: '#ffd84d', laser: '#ff5be0' };
const WPN_MUZZLE = { default: '#ffe060', rapid: '#a0ffa0', spread: '#ffd84d', laser: '#ff5be0' };

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
// 1.  Web Audio  -  8-bit 程序合成音效
// ============================================================
const Sound = (() => {
  let actx = null;
  function getCtx() {
    if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
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
  function noise(dur = 0.18, gain = 0.08, freq = 800, q = 1) {
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
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start();
  }
  return {
    shoot:  () => beep(880, 0.06, 'square', 0.05, -300),
    shoot2: () => beep(660, 0.04, 'square', 0.04, -200),
    shoot3: () => beep(550, 0.05, 'triangle', 0.06, -100),
    laser:  () => beep(1400, 0.10, 'sawtooth', 0.05, -800),
    hit:    () => { beep(180, 0.10, 'square', 0.07, -100); noise(0.10, 0.05); },
    explode:() => { noise(0.32, 0.10, 400, 0.7); beep(80, 0.25, 'square', 0.08, -40); },
    bigboom:() => { noise(0.6, 0.15, 300, 0.5); beep(60, 0.5, 'square', 0.12, -30); },
    jump:   () => beep(420, 0.08, 'square', 0.04, 200),
    powerup:() => { beep(880, 0.07, 'square', 0.06); setTimeout(() => beep(1320, 0.10, 'square', 0.06), 80); },
    death:  () => { beep(440, 0.25, 'sawtooth', 0.10, -300); setTimeout(() => beep(110, 0.40, 'sawtooth', 0.10, -60), 250); },
    clear:  () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.10, 'square', 0.07), i * 90)); },
    boss:   () => { beep(110, 0.30, 'square', 0.10, -60); noise(0.30, 0.10, 200, 0.7); },
    over:   () => { [392, 330, 294, 196].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'square', 0.08), i * 160)); },
    start:  () => { [330, 392, 523].forEach((f, i) => setTimeout(() => beep(f, 0.10, 'square', 0.08), i * 110)); },
    muzzle: () => noise(0.04, 0.04, 1200, 0.4),
  };
})();

// ============================================================
// 2.  输入管理
// ============================================================
const Input = {
  keys: new Set(),
  pressed: new Set(),
  touch: new Set(),
  touchPressed: new Set(),
  konami: [],
  bind() {
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0)
      document.body.classList.add('touch');
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { passive: true });
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.konami.push(k);
      if (this.konami.length > 12) this.konami.shift();
      const kc = this.konami.join(',');
      if (kc.endsWith('arrowup,arrowup,arrowdown,arrowdown,arrowleft,arrowright,arrowleft,arrowright,b,a') ||
          kc.endsWith('w,w,s,s,a,d,a,d,b,a')) {
        if (Game.state === 'menu' || Game.state === 'playing' || Game.state === 'paused') {
          Game.activateCheat();
          this.konami = [];
        }
      }
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.clear(); });

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
        try { Sound.start(); } catch (_) {}
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
  isDown(...keys) { return keys.some(k => this.keys.has(k) || this.touch.has(k)); },
  consume(key) {
    if (this.pressed.has(key) || this.touchPressed.has(key)) {
      this.pressed.delete(key);
      this.touchPressed.delete(key);
      return true;
    }
    return false;
  },
  endFrame() { this.pressed.clear(); this.touchPressed.clear(); },
};

// ============================================================
// 3.  相机
// ============================================================
class Camera {
  constructor() { this.x = 0; this.y = 0; this.shake = 0; this.flashT = 0; this.flashColor = '#ffffff'; }
  follow(target) {
    const tx = target.x + target.w / 2 - VW / 2;
    const ty = target.y + target.h / 2 - VH / 2;
    this.x += (tx - this.x) * 0.18;
    this.y = clamp(this.y + (ty - this.y) * 0.12, -80, 60);
    if (this.x < 0) this.x = 0;
    const maxX = Math.max(0, Game.levelW() - VW);
    if (this.x > maxX) this.x = maxX;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 1);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - 1);
  }
  addShake(n) { this.shake = Math.max(this.shake, n); }
  addFlash(n, color = '#ffffff') { this.flashT = Math.max(this.flashT, n); this.flashColor = color; }
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
// 4.  粒子 (多色、渐变、大小可变 + 火花/烟雾/星屑/灰尘)
// ============================================================
class Particle {
  constructor(x, y, vx, vy, life, color, size = 2, gravity = 0.2, kind = 'spark') {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color;
    this.size = size; this.gravity = gravity; this.dead = false;
    this.kind = kind;  // spark / smoke / dust / star / glow
    this.rot = 0; this.rotV = 0;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.94;
    this.rot += this.rotV;
    this.life--;
    if (this.life <= 0) this.dead = true;
  }
  draw() {
    const a = this.life / this.maxLife;
    const s = this.kind === 'smoke' ? this.size + (1 - a) * 4 : this.size;
    if (this.kind === 'glow') {
      // 发光粒子：中心亮 + 外圈淡
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.floor(this.x - s), Math.floor(this.y - s), s * 2, s * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.floor(this.x - s/2), Math.floor(this.y - s/2), s, s);
      ctx.globalAlpha = 1;
    } else if (this.kind === 'star') {
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      ctx.fillRect(-s, -1, s * 2, 2);
      ctx.fillRect(-1, -s, 2, s * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (this.kind === 'smoke') {
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.floor(this.x - s/2), Math.floor(this.y - s/2), s, s);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.floor(this.x), Math.floor(this.y), s, s);
      ctx.globalAlpha = 1;
    }
  }
}

// 爆炸：火花 + 烟雾 + 星屑 + 发光中心
function explode(x, y, palette = ['#ffae3a', '#ffd84d', '#ff5b3a'], n = 18, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    const s = rnd(1.5, 3.5) * power;
    Game.particles.push(new Particle(x, y,
      Math.cos(a) * s, Math.sin(a) * s - 0.5, irnd(20, 40),
      pick(palette), irnd(2, 5), 0.15, 'spark'));
  }
  // 烟雾
  for (let i = 0; i < 6; i++) {
    Game.particles.push(new Particle(x + rnd(-6, 6), y + rnd(-6, 6),
      rnd(-0.5, 0.5), rnd(-1.2, -0.3), irnd(30, 60),
      pick(['#666', '#888', '#555']), irnd(4, 8), 0.02, 'smoke'));
  }
  // 中心发光
  for (let i = 0; i < 3; i++) {
    Game.particles.push(new Particle(x, y, 0, 0, irnd(8, 14), '#ffffff', 6, 0, 'glow'));
  }
}
function spark(x, y, n = 6, color = '#ffd84d') {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(2, 4);
    Game.particles.push(new Particle(x, y,
      Math.cos(a) * sp, Math.sin(a) * sp, 14, color, 2, 0, 'star'));
  }
}
function muzzleFlash(x, y, dir, color = '#ffe060') {
  // 枪口闪光：5-8 个粒子 + 1 个发光中心
  for (let i = 0; i < 8; i++) {
    const spread = rnd(-0.6, 0.6);
    const a = Math.atan2(0, dir) + spread;
    const sp = rnd(2, 5);
    Game.particles.push(new Particle(x, y,
      Math.cos(a) * sp, Math.sin(a) * sp, irnd(6, 12),
      pick([color, '#ffffff', '#ffe080']), irnd(2, 3), 0, 'star'));
  }
  Game.particles.push(new Particle(x, y, 0, 0, 4, '#ffffff', 4, 0, 'glow'));
  Game.particles.push(new Particle(x, y, 0, 0, 8, color, 6, 0, 'glow'));
  Sound.muzzle();
}
function dustKick(x, y, dir, n = 4) {
  for (let i = 0; i < n; i++) {
    Game.particles.push(new Particle(x + rnd(-2, 2), y,
      -dir * rnd(0.5, 1.5) + rnd(-0.3, 0.3), rnd(-1.5, -0.5), irnd(15, 30),
      pick(['#a08868', '#8a6e48', '#6a5028']), irnd(2, 3), 0.1, 'smoke'));
  }
}

// ============================================================
// 5.  子弹 (带拖尾)
// ============================================================
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
        this.trailCD = 1;
        Game.particles.push(new Particle(this.x, this.y + this.h/2,
          0, 0, 10, '#ff5be0', 2, 0, 'glow'));
      }
    } else if (this.friendly && this.kind === 'rapid') {
      if (this.trailCD-- <= 0) {
        this.trailCD = 1;
        Game.particles.push(new Particle(this.x, this.y + this.h/2, 0, 0, 6, '#a0ffa0', 1, 0, 'glow'));
      }
    } else if (this.kind === 'spread' && this.friendly) {
      if (this.trailCD-- <= 0) {
        this.trailCD = 2;
        Game.particles.push(new Particle(this.x, this.y, 0, 0, 8, '#ffd84d', 1, 0, 'glow'));
      }
    }
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    if (this.kind === 'laser') {
      // 激光：白色核心 + 紫色光晕
      ctx.fillStyle = 'rgba(255, 91, 224, 0.5)';
      ctx.fillRect(x - 4, y - 2, 12, 6);
      ctx.fillStyle = '#ff5be0';
      ctx.fillRect(x - 2, y - 1, 10, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 6, 2);
    } else if (this.kind === 'spread') {
      // 散弹：金色大弹
      ctx.fillStyle = 'rgba(255, 216, 77, 0.5)';
      ctx.fillRect(x - 1, y - 1, 8, 6);
      ctx.fillStyle = '#ffd84d';
      ctx.fillRect(x, y, 6, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y + 1, 3, 2);
    } else if (this.kind === 'rapid') {
      // 速射：细绿光束
      ctx.fillStyle = '#a0ffa0';
      ctx.fillRect(x, y + 1, 6, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y + 1, 3, 1);
    } else if (this.friendly) {
      // 普通弹：黄色
      ctx.fillStyle = 'rgba(255, 247, 192, 0.6)';
      ctx.fillRect(x - 1, y - 1, 7, 5);
      ctx.fillStyle = '#fff7c0';
      ctx.fillRect(x, y, 5, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y + 1, 2, 1);
    } else {
      // 敌方弹：红色
      ctx.fillStyle = 'rgba(255, 80, 80, 0.6)';
      ctx.fillRect(x - 1, y - 1, 7, 5);
      ctx.fillStyle = '#ff5050';
      ctx.fillRect(x, y, 5, 3);
      ctx.fillStyle = '#ffcc88';
      ctx.fillRect(x + 1, y + 1, 2, 1);
    }
  }
}

class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.vy = -3; this.vx = 0;
    this.w = 14; this.h = 14;
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
    // 发光阴影
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = flash ? '#ffffff' : '#ffd84d';
    ctx.fillRect(x - 3, y - 3, this.w + 6, this.h + 6);
    ctx.globalAlpha = 1;
    // 边框
    ctx.fillStyle = flash ? '#ffffff' : '#0b1330';
    ctx.fillRect(x - 1, y - 1, this.w + 2, this.h + 2);
    ctx.fillStyle = '#1c2a55';
    ctx.fillRect(x, y, this.w, this.h);
    // 内层高亮
    ctx.fillStyle = '#2c3e6e';
    ctx.fillRect(x + 1, y + 1, this.w - 2, 1);
    // 图标
    if (this.type === 'health') {
      ctx.fillStyle = '#ff5577';
      ctx.fillRect(x + 5, y + 2, 4, 10);
      ctx.fillRect(x + 2, y + 5, 10, 4);
      ctx.fillStyle = '#ff88aa';
      ctx.fillRect(x + 5, y + 2, 1, 10);
      ctx.fillRect(x + 2, y + 5, 10, 1);
    } else {
      const c = WPN_COLOR[this.type] || '#fff';
      ctx.fillStyle = c;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(WPN_LABEL[this.type] || '?', x + this.w / 2, y + this.h / 2 + 1);
    }
  }
}

class Platform {
  constructor(x, y, w, h, color = '#243a1f', top = '#3d6b2a', accent = '#0e1c0a') {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.color = color; this.top = top; this.accent = accent;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 高光顶
    ctx.fillStyle = this.top;
    ctx.fillRect(this.x, this.y, this.w, 3);
    // 顶部高亮
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(this.x, this.y, this.w, 1);
    // 阴影
    ctx.fillStyle = this.accent;
    ctx.fillRect(this.x, this.y + this.h - 2, this.w, 2);
    // 铆钉
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(this.x + 3, this.y + 5, 2, 2);
    ctx.fillRect(this.x + this.w - 5, this.y + 5, 2, 2);
  }
}

// ============================================================
// 6.  敌人
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
    this.walkFrame = 0;
  }
  hit(dmg = 1) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flashT = 6;
    spark(this.x + this.w / 2, this.y + this.h / 2, 6, '#ffd84d');
    Sound.hit();
    if (this.hp <= 0) {
      explode(this.x + this.w / 2, this.y + this.h / 2,
        this.palette.explode || ['#ff7a3a', '#ffae3a', '#ffd84d'], 18, 1.3);
      Sound.explode();
      Game.addScore(this.score);
      Game.camera.addShake(4);
      if (Math.random() < 0.20 && !(this instanceof BossBase)) {
        const r = Math.random();
        let type;
        if (r < 0.35) type = 'spread';
        else if (r < 0.65) type = 'rapid';
        else if (r < 0.9) type = 'laser';
        else type = 'health';
        Game.powerups.push(new PowerUp(this.x + this.w / 2 - 7, this.y - 6, type));
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
    if (this.onGround && Math.abs(this.vx) > 0.2) this.walkFrame += 0.18;
  }
}

// ---- 6.1 Grunt  绿色步兵 (4 帧走跑) ----
class Grunt extends Enemy {
  constructor(x, y, palette = null) {
    palette = palette || {
      body: '#5a8a4a', bodyL: '#7aaa6a', bodyD: '#3a5a2a',
      head: '#3a6a2a', headL: '#5a8a4a',
      eye: '#ff4040',
      gun: '#333', gunL: '#666',
      pants: '#2a3a1a', pantsL: '#3a4a2a',
      boots: '#1a2a0a',
      explode: ['#7aaa4a', '#aaca6a', '#ffd84d'],
    };
    super(x, y, 16, 22, 1, 100, palette);
    this.fireCD = irnd(50, 140);
    this.dir = -1;
    this.collidesPlatforms = true;
  }
  update(player) {
    this.t++;
    const dx = player.x - this.x;
    this.dir = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    if (dist > 90) this.vx = this.dir * 0.65;
    else this.vx *= 0.7;
    this.fireCD--;
    if (this.fireCD <= 0 && dist < 320) {
      this.fire(player);
      this.fireCD = irnd(70, 160);
    }
    this.physics(Game.groundY());
  }
  fire(player) {
    const cx = this.x + this.w / 2, cy = this.y + 10;
    const dx = player.x - cx, dy = (player.y + player.h / 2) - cy;
    const len = Math.hypot(dx, dy) || 1;
    const sp = 3.4;
    Game.bullets.push(new Bullet(cx, cy, dx / len * sp, dy / len * sp, false, 'default'));
    muzzleFlash(cx + dx / len * 6, cy + dy / len * 6, sign(dx), '#ff8888');
    Sound.shoot2();
  }
  draw() {
    const p = this.palette;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    const wf = Math.floor(this.walkFrame) % 4;
    const legA = wf === 0 ? 0 : wf === 1 ? 1 : wf === 2 ? 0 : -1;

    ctx.save();
    if (this.dir > 0) { ctx.translate(x + this.w, y); ctx.scale(-1, 1); }
    else { ctx.translate(x, y); }

    // 阴影
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(2, 22, 12, 1);
    ctx.globalAlpha = 1;

    // 腿 (带走路摆动)
    ctx.fillStyle = p.pants;
    ctx.fillRect(3, 14 + legA, 4, 5);
    ctx.fillRect(9, 14 - legA, 4, 5);
    ctx.fillStyle = p.pantsL;
    ctx.fillRect(3, 14 + legA, 1, 5);
    ctx.fillRect(9, 14 - legA, 1, 5);
    // 靴子
    ctx.fillStyle = p.boots;
    ctx.fillRect(3, 19 + legA, 4, 2);
    ctx.fillRect(9, 19 - legA, 4, 2);

    // 身体 (躯干)
    ctx.fillStyle = f || p.body;
    ctx.fillRect(2, 6, 12, 9);
    // 身体高光
    ctx.fillStyle = f || p.bodyL;
    ctx.fillRect(2, 6, 12, 1);
    ctx.fillRect(2, 6, 1, 9);
    // 身体阴影
    ctx.fillStyle = p.bodyD;
    ctx.fillRect(13, 6, 1, 9);
    ctx.fillRect(2, 14, 12, 1);

    // 腰带
    ctx.fillStyle = '#cc8822';
    ctx.fillRect(2, 13, 12, 1);
    ctx.fillStyle = '#ffcc55';
    ctx.fillRect(2, 13, 2, 1);

    // 头
    ctx.fillStyle = f || p.head;
    ctx.fillRect(3, 1, 10, 6);
    ctx.fillStyle = f || p.headL;
    ctx.fillRect(3, 1, 10, 1);
    ctx.fillStyle = p.bodyD;
    ctx.fillRect(3, 6, 10, 1);
    // 头盔带
    ctx.fillStyle = '#222';
    ctx.fillRect(3, 4, 10, 1);
    // 眼 (单眼罩)
    ctx.fillStyle = '#000';
    ctx.fillRect(8, 2, 4, 2);
    ctx.fillStyle = p.eye;
    ctx.fillRect(9, 2, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(10, 2, 1, 1);

    // 手臂 + 枪 (随方向)
    if (this.dir > 0) {
      // 右手持枪 (向左的视角)
      ctx.fillStyle = p.bodyL;
      ctx.fillRect(0, 8, 3, 6);
      ctx.fillStyle = '#3a5a2a';
      ctx.fillRect(0, 8, 1, 6);
      // 枪
      ctx.fillStyle = p.gun;
      ctx.fillRect(-4, 10, 6, 2);
      ctx.fillStyle = p.gunL;
      ctx.fillRect(-4, 10, 6, 1);
    } else {
      // 左手持枪 (向右的视角)
      ctx.fillStyle = p.bodyL;
      ctx.fillRect(13, 8, 3, 6);
      ctx.fillStyle = '#3a5a2a';
      ctx.fillRect(15, 8, 1, 6);
      // 枪
      ctx.fillStyle = p.gun;
      ctx.fillRect(14, 10, 6, 2);
      ctx.fillStyle = p.gunL;
      ctx.fillRect(14, 10, 6, 1);
    }
    // 枪口细节
    if (this.fireCD < 6) {
      ctx.fillStyle = '#ffe060';
      ctx.fillRect(this.dir > 0 ? -6 : 18, 10, 2, 2);
    }

    ctx.restore();
  }
}

// ---- 6.2 Runner 红色异形 (快速冲撞) ----
class Runner extends Enemy {
  constructor(x, y, palette = null) {
    palette = palette || {
      body: '#c25a2a', bodyL: '#e8804a', bodyD: '#8a3a0a',
      eye: '#ffcc00', eyeGlow: '#ffff80',
      explode: ['#ffaa5a', '#ffd07a', '#ffff80'],
    };
    super(x, y, 14, 16, 1, 60, palette);
    this.dir = -1;
    this.collidesPlatforms = true;
  }
  update(player) {
    this.t++;
    this.vx = this.dir * 2.6;
    this.physics(Game.groundY());
    if (this.x < Game.camera.x - 20) this.dead = true;
    // 跑动尘土
    if (this.t % 6 === 0 && Game.camera.x - 20 < this.x) {
      dustKick(this.x + (this.dir > 0 ? 0 : this.w), this.y + this.h, -this.dir, 2);
    }
  }
  draw() {
    const p = this.palette;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    const wf = Math.floor(this.walkFrame) % 4;

    ctx.save();
    if (this.dir > 0) { ctx.translate(x + this.w, y); ctx.scale(-1, 1); }
    else { ctx.translate(x, y); }

    // 腿 (4 帧)
    ctx.fillStyle = p.bodyD;
    if (wf === 0) {
      ctx.fillRect(2, 10, 4, 6); ctx.fillRect(8, 10, 4, 6);
    } else if (wf === 1) {
      ctx.fillRect(2, 11, 4, 5); ctx.fillRect(8, 9, 4, 7);
    } else if (wf === 2) {
      ctx.fillRect(2, 10, 4, 6); ctx.fillRect(8, 10, 4, 6);
    } else {
      ctx.fillRect(2, 9, 4, 7); ctx.fillRect(8, 11, 4, 5);
    }
    ctx.fillStyle = p.bodyL;
    ctx.fillRect(2, 10, 1, 6);
    ctx.fillRect(8, 10, 1, 6);

    // 身体 (粗壮)
    ctx.fillStyle = f || p.body;
    ctx.fillRect(1, 4, 12, 7);
    ctx.fillStyle = f || p.bodyL;
    ctx.fillRect(1, 4, 12, 1);
    ctx.fillStyle = p.bodyD;
    ctx.fillRect(1, 10, 12, 1);

    // 头
    ctx.fillStyle = f || p.body;
    ctx.fillRect(3, 0, 8, 5);
    ctx.fillStyle = f || p.bodyL;
    ctx.fillRect(3, 0, 8, 1);
    // 眼睛 (发光)
    ctx.fillStyle = p.eyeGlow;
    ctx.fillRect(8, 1, 3, 3);
    ctx.fillStyle = p.eye;
    ctx.fillRect(9, 1, 2, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 1, 1, 1);
    // 触角
    ctx.fillStyle = p.bodyD;
    ctx.fillRect(2, -1, 2, 2);
    ctx.fillRect(10, -1, 2, 2);

    ctx.restore();
  }
}

// ---- 6.3 Turret 灰色金属炮台 ----
class Turret extends Enemy {
  constructor(x, y, palette = null) {
    palette = palette || {
      body: '#777', bodyL: '#aaa', bodyD: '#444',
      base: '#555', baseL: '#777',
      rivet: '#222',
      eye: '#ff0000',
      explode: ['#aaa', '#888', '#ffcc55'],
    };
    super(x, y, 18, 18, 2, 200, palette);
    this.fireCD = irnd(40, 90);
    this.turretAngle = 0;
  }
  update(player) {
    this.t++;
    const targetAngle = Math.atan2((player.y + player.h/2) - (this.y + 8), player.x - (this.x + this.w/2));
    this.turretAngle = this.turretAngle + (targetAngle - this.turretAngle) * 0.12;
    this.fireCD--;
    if (this.fireCD <= 0) {
      this.fireCD = irnd(80, 140);
      const cx = this.x + this.w / 2, cy = this.y + 8;
      const sp = 3.0;
      Game.bullets.push(new Bullet(cx, cy, Math.cos(this.turretAngle) * sp, Math.sin(this.turretAngle) * sp, false, 'default'));
      for (let i = 1; i <= 2; i++) {
        const a = this.turretAngle + i * 0.15;
        Game.bullets.push(new Bullet(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, false, 'default'));
      }
      muzzleFlash(cx + Math.cos(this.turretAngle) * 8, cy + Math.sin(this.turretAngle) * 8, 1, '#ff8888');
      Sound.shoot2();
    }
  }
  draw() {
    const p = this.palette;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);

    // 底座
    ctx.fillStyle = p.base;
    ctx.fillRect(x, y + 12, this.w, 6);
    ctx.fillStyle = p.baseL;
    ctx.fillRect(x, y + 12, this.w, 1);
    ctx.fillStyle = p.rivet;
    ctx.fillRect(x + 2, y + 14, 2, 2);
    ctx.fillRect(x + this.w - 4, y + 14, 2, 2);

    // 炮塔主体 (圆形感)
    ctx.fillStyle = f || p.body;
    ctx.fillRect(x + 4, y + 4, 10, 10);
    ctx.fillStyle = f || p.bodyL;
    ctx.fillRect(x + 4, y + 4, 10, 2);
    ctx.fillRect(x + 4, y + 4, 2, 10);
    ctx.fillStyle = p.bodyD;
    ctx.fillRect(x + 4, y + 12, 10, 2);
    ctx.fillRect(x + 12, y + 4, 2, 10);

    // 旋转炮管
    ctx.save();
    ctx.translate(x + this.w / 2, y + 9);
    ctx.rotate(this.turretAngle);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, -2, 12, 4);
    ctx.fillStyle = '#555';
    ctx.fillRect(0, -2, 12, 1);
    ctx.fillStyle = '#222';
    ctx.fillRect(10, -3, 2, 6);
    ctx.restore();

    // 红色感应眼
    ctx.fillStyle = p.eye;
    ctx.fillRect(x + 8, y + 8, 2, 2);
    ctx.fillStyle = '#ffcc88';
    ctx.fillRect(x + 8, y + 8, 1, 1);

    // 阴影
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y + 18, this.w, 1);
    ctx.globalAlpha = 1;
  }
}

// ---- 6.4 Flyer 飞行异形 ----
class Flyer extends Enemy {
  constructor(x, y, palette = null) {
    palette = palette || {
      body: '#c25a2a', bodyL: '#ff8855', bodyD: '#8a3a0a',
      wing: '#a04020', wingL: '#cc5a30',
      eye: '#fff', pupil: '#000',
      explode: ['#ffaa5a', '#ff8866', '#ffff80'],
    };
    super(x, y, 20, 16, 1, 150, palette);
    this.vy = 0;
    this.baseY = y;
    this.fireCD = irnd(60, 160);
    this.dir = -1;
    this.wingFrame = 0;
  }
  update(player) {
    this.t++;
    this.wingFrame = (this.wingFrame + 0.4) % 4;
    this.dir = player.x >= this.x ? 1 : -1;
    this.vx = this.dir * 1.3;
    this.y = this.baseY + Math.sin(this.t * 0.05) * 16;
    this.fireCD--;
    if (this.fireCD <= 0) {
      this.fireCD = irnd(90, 180);
      const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, this.dir * 3.2, 0, false, 'default');
      Game.bullets.push(b);
      muzzleFlash(this.x + this.w / 2 + this.dir * 6, this.y + this.h / 2, this.dir, '#ff6666');
      Sound.shoot2();
    }
  }
  draw() {
    const p = this.palette;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);
    const wingUp = Math.floor(this.wingFrame) % 2 === 0;

    ctx.save();
    if (this.dir > 0) { ctx.translate(x + this.w, y); ctx.scale(-1, 1); }
    else { ctx.translate(x, y); }

    // 翅膀
    ctx.fillStyle = f || p.wing;
    if (wingUp) {
      ctx.fillRect(-1, 0, 4, 4);
      ctx.fillRect(17, 0, 4, 4);
      ctx.fillRect(0, -2, 2, 4);
      ctx.fillRect(18, -2, 2, 4);
    } else {
      ctx.fillRect(-1, 4, 4, 4);
      ctx.fillRect(17, 4, 4, 4);
      ctx.fillRect(0, 6, 2, 4);
      ctx.fillRect(18, 6, 2, 4);
    }
    ctx.fillStyle = p.wingL;
    if (wingUp) {
      ctx.fillRect(-1, 0, 4, 1);
      ctx.fillRect(17, 0, 4, 1);
    }

    // 主体
    ctx.fillStyle = f || p.body;
    ctx.fillRect(4, 4, 12, 10);
    ctx.fillStyle = f || p.bodyL;
    ctx.fillRect(4, 4, 12, 1);
    ctx.fillRect(4, 4, 1, 10);
    ctx.fillStyle = p.bodyD;
    ctx.fillRect(4, 13, 12, 1);
    ctx.fillRect(15, 4, 1, 10);

    // 眼
    ctx.fillStyle = '#000';
    ctx.fillRect(12, 6, 2, 4);
    ctx.fillStyle = f || p.eye;
    ctx.fillRect(12, 7, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(13, 7, 1, 1);

    // 尾巴
    ctx.fillStyle = p.bodyD;
    ctx.fillRect(0, 8, 4, 4);

    ctx.restore();
  }
}

// ============================================================
// 7.  Boss 基类与三个关底
// ============================================================
class BossBase extends Enemy {
  constructor(x, y, w, h, hp, score, palette = null) {
    super(x, y, w, h, hp, score, palette);
    this.baseY = y;
    this.t = 0;
    this.fireCD = 30;
    this.phase = 0;
    this.collidesPlatforms = false;
    this.dir = -1;
    this.hurtFlash = 0;
  }
  hit(dmg = 1) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flashT = 4;
    this.hurtFlash = 6;
    spark(this.x + this.w / 2, this.y + this.h / 2, 8, '#ffd84d');
    explode(this.x + this.w / 2, this.y + this.h / 2, ['#ffd84d', '#ff8a3a', '#ffffff'], 6, 0.6);
    Sound.hit();
    Game.camera.addShake(3);
    if (this.hp <= 0) {
      // 大爆炸序列
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          explode(this.x + rnd(0, this.w), this.y + rnd(0, this.h),
            ['#ff7a3a', '#ffae3a', '#ffd84d', '#ffffff'], 30, 2.5);
          Sound.bigboom();
          Game.camera.addShake(10);
        }, i * 120);
      }
      setTimeout(() => {
        for (let i = 0; i < 12; i++) {
          Game.particles.push(new Particle(this.x + this.w/2 + rnd(-this.w/2, this.w/2), this.y + this.h/2,
            rnd(-3, 3), rnd(-4, -1), irnd(60, 100), pick(['#ff5be0', '#ffd84d', '#ff8a3a']), irnd(3, 6), 0.15, 'spark'));
        }
        Sound.clear();
      }, 500);
      Game.addScore(this.score);
      this.dead = true;
      Game.camera.addFlash(20, '#ffffff');
      Game.camera.addShake(15);
      Game.triggerWin();
    }
  }
  drawHpBar() {
    const hpw = this.w, hpx = this.x, hpy = this.y - 12;
    // 边框
    ctx.fillStyle = '#000';
    ctx.fillRect(hpx - 2, hpy - 2, hpw + 4, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(hpx - 1, hpy - 1, hpw + 2, 6);
    // 底
    ctx.fillStyle = '#330';
    ctx.fillRect(hpx, hpy, hpw, 4);
    // 当前血量
    const ratio = Math.max(0, this.hp / this.maxHp);
    const c = this.phase === 2 ? '#ff00ff' : (this.phase === 1 ? '#ff4040' : '#ff8a3a');
    ctx.fillStyle = c;
    ctx.fillRect(hpx, hpy, hpw * ratio, 4);
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(hpx, hpy, hpw * ratio, 1);
  }
}

// ---- 7.1 Boss 1:  丛林堡垒 ----
class BossJungle extends BossBase {
  constructor(x, y) {
    super(x, y, 110, 76, 90, 5000, {
      shell: '#2a1a1a', shellL: '#3a2828', shellD: '#1a0a0a',
      armor: '#5a2222', armorL: '#7a3a3a', armorD: '#3a0a0a',
      core: '#ff8a3a', coreL: '#ffcc88',
      cannon: '#222', cannonL: '#555',
      explode: ['#ff8a3a', '#ffd84d', '#ff4040', '#ffffff'],
    });
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
      const N = this.phase === 0 ? 3 : 5;
      const spread = 0.5;
      for (let i = 0; i < N; i++) {
        const a = Math.atan2(dy, dx) + (i - (N - 1) / 2) * spread;
        Game.bullets.push(new Bullet(this.x + this.w / 2, this.y + this.h / 2,
          Math.cos(a) * 3.0, Math.sin(a) * 3.0, false, 'default'));
      }
      muzzleFlash(this.x + this.w / 2, this.y + this.h / 2, 1, '#ff6666');
      this.fireCD = this.phase === 0 ? 55 : 35;
      if (this.t % 200 === 0) Sound.boss();
      else Sound.shoot2();
    }
    if (this.hp < this.maxHp * 0.5) this.phase = 1;
  }
  draw() {
    const p = this.palette;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);

    // 阴影
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 20, y + this.h, this.w - 40, 2);
    ctx.globalAlpha = 1;

    // 主体外壳
    ctx.fillStyle = p.shell;
    ctx.fillRect(x + 4, y + 8, this.w - 8, this.h - 8);
    ctx.fillStyle = f || p.armor;
    ctx.fillRect(x + 8, y + 12, this.w - 16, this.h - 18);
    ctx.fillStyle = p.armorL;
    ctx.fillRect(x + 8, y + 12, this.w - 16, 2);
    ctx.fillStyle = p.armorD;
    ctx.fillRect(x + 8, y + this.h - 6, this.w - 16, 2);

    // 装甲板 + 铆钉
    ctx.fillStyle = p.shell;
    ctx.fillRect(x + 6, y + 20, 6, 28);
    ctx.fillRect(x + this.w - 12, y + 20, 6, 28);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 8, y + 24, 2, 2);
    ctx.fillRect(x + 8, y + 36, 2, 2);
    ctx.fillRect(x + 8, y + 48, 2, 2);
    ctx.fillRect(x + this.w - 10, y + 24, 2, 2);
    ctx.fillRect(x + this.w - 10, y + 36, 2, 2);
    ctx.fillRect(x + this.w - 10, y + 48, 2, 2);

    // 双侧炮塔
    ctx.fillStyle = f || '#4a1010';
    ctx.fillRect(x + 18, y + 24, 28, 16);
    ctx.fillRect(x + this.w - 46, y + 24, 28, 16);
    ctx.fillStyle = p.armorL;
    ctx.fillRect(x + 18, y + 24, 28, 2);
    ctx.fillRect(x + this.w - 46, y + 24, 28, 2);

    // 炮管 (朝向玩家)
    const gunX = this.dir > 0 ? x + this.w - 18 : x - 18;
    ctx.fillStyle = p.cannon;
    ctx.fillRect(gunX, y + 28, 18, 6);
    ctx.fillStyle = p.cannonL;
    ctx.fillRect(gunX, y + 28, 18, 1);

    // 中央核心 (脉动发光)
    const pulse = Math.sin(this.t * 0.15) * 1.5;
    ctx.fillStyle = this.phase === 1 ? '#ff4040' : p.core;
    ctx.fillRect(x + 40, y + 24 + this.bodyPulse, 30, 22 + pulse);
    ctx.fillStyle = p.coreL;
    ctx.fillRect(x + 40, y + 24 + this.bodyPulse, 30, 3);
    // 核心中心
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 50, y + 32 + this.bodyPulse, 10, 6);
    // 核心发光
    if (this.t % 4 < 2) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = p.core;
      ctx.fillRect(x + 36, y + 20 + this.bodyPulse, 38, 30 + pulse);
      ctx.globalAlpha = 1;
    }

    // 顶部触角 + 警示灯
    ctx.fillStyle = '#3a1010';
    ctx.fillRect(x + 22, y + 4, 4, 8);
    ctx.fillRect(x + this.w - 26, y + 4, 4, 8);
    ctx.fillStyle = (Math.floor(this.t / 8) % 2) ? '#ff0000' : '#660000';
    ctx.fillRect(x + 22, y + 2, 4, 4);
    ctx.fillRect(x + this.w - 26, y + 2, 4, 4);

    // 受伤闪烁
    if (this.hurtFlash > 0) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, this.w, this.h);
      ctx.globalAlpha = 1;
      this.hurtFlash--;
    }

    this.drawHpBar();
  }
}

// ---- 7.2 Boss 2:  冰雪机甲 ----
class BossIce extends BossBase {
  constructor(x, y) {
    super(x, y, 100, 84, 110, 2600, {
      shell: '#3a5a8a', shellL: '#5a7aaa', shellD: '#1a2a4a',
      armor: '#aac8ff', armorL: '#e0eaff', armorD: '#5a7aaa',
      core: '#aac8ff', coreL: '#ffffff',
      cannon: '#0e1c34',
      explode: ['#aac8ff', '#ffffff', '#88aaff'],
    });
  }
  update(player) {
    this.t++;
    this.bodyPulse = Math.sin(this.t * 0.12) * 2;
    this.y = this.baseY + Math.sin(this.t * 0.06) * 6;
    this.dir = player.x >= this.x ? 1 : -1;
    this.fireCD--;
    if (this.fireCD <= 0) {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      const dx = player.x - cx, dy = (player.y + player.h / 2) - cy;
      const angles = this.phase === 0 ? [-0.4, 0, 0.4] : [-0.6, -0.3, 0, 0.3, 0.6];
      const speed = this.phase === 0 ? 3.0 : 3.6;
      for (const off of angles) {
        const a = Math.atan2(dy, dx) + off;
        Game.bullets.push(new Bullet(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, false, 'default'));
      }
      muzzleFlash(cx, cy, 1, '#aac8ff');
      this.fireCD = this.phase === 0 ? 50 : 32;
      if (this.t % 180 === 0) Sound.boss();
      else Sound.shoot3();
    }
    if (this.phase >= 1 && this.t % 60 === 0) {
      const cx = player.x + irnd(-40, 40);
      Game.bullets.push(new Bullet(cx, this.y + this.h, 0, 4.0, false, 'default'));
      Sound.shoot2();
    }
    if (this.hp < this.maxHp * 0.6) this.phase = 1;
  }
  draw() {
    const p = this.palette;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);

    // 阴影
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 20, y + this.h, this.w - 40, 2);
    ctx.globalAlpha = 1;

    // 主体
    ctx.fillStyle = p.shell;
    ctx.fillRect(x + 4, y + 8, this.w - 8, this.h - 8);
    ctx.fillStyle = f || p.armor;
    ctx.fillRect(x + 8, y + 12, this.w - 16, this.h - 18);
    ctx.fillStyle = p.armorL;
    ctx.fillRect(x + 8, y + 12, this.w - 16, 2);
    ctx.fillStyle = p.armorD;
    ctx.fillRect(x + 8, y + this.h - 6, this.w - 16, 2);

    // 侧装甲
    ctx.fillStyle = p.shell;
    ctx.fillRect(x + 6, y + 22, 8, 32);
    ctx.fillRect(x + this.w - 14, y + 22, 8, 32);
    ctx.fillStyle = p.armorL;
    ctx.fillRect(x + 6, y + 22, 8, 2);
    ctx.fillRect(x + this.w - 14, y + 22, 8, 2);

    // 头部
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 28, y + 4, this.w - 56, 18);
    ctx.fillStyle = p.armor;
    ctx.fillRect(x + 28, y + 4, this.w - 56, 2);
    // 红色感应眼
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 36, y + 10, this.w - 72, 8);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x + 38, y + 12, this.w - 76, 4);
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(x + 40, y + 13, this.w - 80, 2);
    // 头部天线
    ctx.fillStyle = p.shell;
    ctx.fillRect(x + 44, y - 4, 2, 8);
    ctx.fillRect(x + this.w - 46, y - 4, 2, 8);
    ctx.fillStyle = (Math.floor(this.t / 8) % 2) ? '#00ffff' : '#006688';
    ctx.fillRect(x + 42, y - 6, 6, 4);
    ctx.fillRect(x + this.w - 48, y - 6, 6, 4);

    // 炮管
    const gunX = this.dir > 0 ? x + this.w - 20 : x - 20;
    ctx.fillStyle = p.cannon;
    ctx.fillRect(gunX, y + 34, 22, 8);
    ctx.fillStyle = '#3a5a8a';
    ctx.fillRect(gunX, y + 34, 22, 2);

    // 核心
    const coreColor = this.phase === 1 ? '#ff4040' : p.core;
    ctx.fillStyle = coreColor;
    ctx.fillRect(x + 36, y + 32 + this.bodyPulse, 28, 20);
    ctx.fillStyle = p.coreL;
    ctx.fillRect(x + 36, y + 32 + this.bodyPulse, 28, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 46, y + 40 + this.bodyPulse, 8, 4);
    // 核心发光
    if (this.t % 4 < 2) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = coreColor;
      ctx.fillRect(x + 32, y + 28 + this.bodyPulse, 36, 28);
      ctx.globalAlpha = 1;
    }

    // 冰晶 (从身体伸出)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 10, y + this.h - 8, 5, 10);
    ctx.fillRect(x + 12, y + this.h - 4, 1, 4);
    ctx.fillRect(x + this.w - 15, y + this.h - 8, 5, 10);
    ctx.fillRect(x + this.w - 13, y + this.h - 4, 1, 4);

    // 受伤闪烁
    if (this.hurtFlash > 0) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, this.w, this.h);
      ctx.globalAlpha = 1;
      this.hurtFlash--;
    }

    this.drawHpBar();
  }
}

// ---- 7.3 Boss 3:  异形母体 ----
class BossAlien extends BossBase {
  constructor(x, y) {
    super(x, y, 130, 96, 160, 10000, {
      shell: '#1a0a2a', shellL: '#3a1a4a', shellD: '#0a001a',
      armor: '#5a1a7a', armorL: '#aa3aff', armorD: '#3a0a4a',
      core: '#ff5be0', coreL: '#ffffff',
      tentacle: '#aa3aff',
      explode: ['#ff5be0', '#ff00ff', '#aa3aff', '#ffffff'],
    });
  }
  update(player) {
    this.t++;
    this.bodyPulse = Math.sin(this.t * 0.08) * 3;
    this.y = this.baseY + Math.sin(this.t * 0.03) * 10;
    this.dir = player.x >= this.x ? 1 : -1;
    this.fireCD--;
    if (this.fireCD <= 0) {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      const N = this.phase === 2 ? 12 : (this.phase === 1 ? 8 : 5);
      const baseAngle = Math.atan2(player.y + player.h/2 - cy, player.x - cx);
      for (let i = 0; i < N; i++) {
        const a = baseAngle + (i - (N - 1) / 2) * 0.22;
        const sp = 2.8 + this.phase * 0.3;
        Game.bullets.push(new Bullet(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, false, 'default'));
      }
      muzzleFlash(cx, cy, 1, '#ff5be0');
      this.fireCD = this.phase === 2 ? 30 : (this.phase === 1 ? 40 : 55);
      if (this.t % 180 === 0) Sound.boss();
      else Sound.shoot2();
    }
    if (this.hp < this.maxHp * 0.66 && this.phase === 0) {
      this.phase = 1; Game.camera.addShake(8); Sound.boss();
      flash('PHASE 2!', 80);
    }
    if (this.hp < this.maxHp * 0.33 && this.phase === 1) {
      this.phase = 2; Game.camera.addShake(10); Sound.boss();
      flash('PHASE 3! 狂暴!', 100);
    }
  }
  draw() {
    const p = this.palette;
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const f = this.flashT > 0 ? '#ffffff' : null;
    this.flashT = Math.max(0, this.flashT - 1);

    // 阴影
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 30, y + this.h, this.w - 60, 2);
    ctx.globalAlpha = 1;

    // 主体
    ctx.fillStyle = p.shell;
    ctx.fillRect(x + 4, y + 8, this.w - 8, this.h - 8);
    ctx.fillStyle = f || p.armor;
    ctx.fillRect(x + 8, y + 12, this.w - 16, this.h - 18);
    ctx.fillStyle = p.armorL;
    ctx.fillRect(x + 8, y + 12, this.w - 16, 2);
    ctx.fillStyle = p.armorD;
    ctx.fillRect(x + 8, y + this.h - 6, this.w - 16, 2);

    // 两侧触须 (脉动)
    const tw = Math.sin(this.t * 0.1) * 2;
    ctx.fillStyle = p.tentacle;
    ctx.fillRect(x + 6, y + this.h / 2 - 4, 4, 12 + tw);
    ctx.fillRect(x + this.w - 10, y + this.h / 2 - 4, 4, 12 + tw);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y + this.h / 2 - 4, 1, 12 + tw);
    ctx.fillRect(x + this.w - 10, y + this.h / 2 - 4, 1, 12 + tw);

    // 顶部触角
    ctx.fillStyle = p.tentacle;
    ctx.fillRect(x + 20, y + 4, 4, 12 + Math.sin(this.t * 0.15) * 3);
    ctx.fillRect(x + this.w - 24, y + 4, 4, 12 + Math.sin(this.t * 0.15 + 2) * 3);
    ctx.fillStyle = '#ff5be0';
    ctx.fillRect(x + 20, y + 4, 2, 12 + Math.sin(this.t * 0.15) * 3);
    ctx.fillRect(x + this.w - 24, y + 4, 2, 12 + Math.sin(this.t * 0.15 + 2) * 3);

    // 多核心眼 (1/2/3 个)
    const cores = this.phase === 2 ? 3 : (this.phase === 1 ? 2 : 1);
    const coreW = 32, gap = 4;
    const totalW = cores * coreW + (cores - 1) * gap;
    const sx = x + (this.w - totalW) / 2;
    const pulse = Math.sin(this.t * 0.2) * 2;
    for (let i = 0; i < cores; i++) {
      const cx = sx + i * (coreW + gap);
      const cy = y + 28 + pulse;
      // 核心外壳
      ctx.fillStyle = '#1a0a2a';
      ctx.fillRect(cx - 2, cy - 2, coreW + 4, 24);
      // 核心球
      ctx.fillStyle = this.phase === 2 ? '#ff00ff' : p.core;
      ctx.fillRect(cx, cy, coreW, 20);
      ctx.fillStyle = p.coreL;
      ctx.fillRect(cx, cy, coreW, 3);
      // 眼仁
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 8, cy + 6, 16, 8);
      ctx.fillStyle = '#000';
      ctx.fillRect(cx + 13, cy + 8, 6, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 15, cy + 9, 2, 2);
      // 瞳孔收缩
      if (this.t % 30 < 15) {
        ctx.fillStyle = '#000';
        ctx.fillRect(cx + 10, cy + 6, 12, 8);
      }
      // 发光
      if (this.t % 4 < 2) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = this.phase === 2 ? '#ff00ff' : p.core;
        ctx.fillRect(cx - 2, cy - 2, coreW + 4, 24);
        ctx.globalAlpha = 1;
      }
    }

    // 牙齿 (底部)
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(x + 14 + i * 11, y + this.h - 12, 8, 5);
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(x + 14 + i * 11, y + this.h - 12, 8, 1);
    }
    ctx.fillStyle = '#ff5577';
    ctx.fillRect(x + 16, y + this.h - 8, this.w - 32, 2);

    // 受伤闪烁
    if (this.hurtFlash > 0) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, this.w, this.h);
      ctx.globalAlpha = 1;
      this.hurtFlash--;
    }

    this.drawHpBar();
  }
}

// ============================================================
// 8.  玩家 (16x20 多色精灵 + 4 帧动画 + 状态机)
// ============================================================
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 16; this.h = 22;
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
    this.animT = 0;
  }
  setWeapon(w) {
    this.fireMode = w;
    this.weaponTimer = 60 * 30;
    Sound.powerup();
    flash('武器升级: ' + (WPN_LABEL[w] || '?'), 80);
  }
  hit() {
    if (this.invuln > 0 || !this.alive) return;
    this.hp--;
    this.invuln = 90;
    Sound.death();
    explode(this.x + this.w / 2, this.y + this.h / 2, ['#ff5577', '#ff88aa', '#ffffff'], 18, 1.4);
    Game.camera.addShake(8);
    Game.camera.addFlash(15, '#ff2030');
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
      if (this.deathT % 3 === 0)
        explode(this.x + this.w / 2, this.y + this.h / 2, ['#ff8a3a', '#ffd84d', '#ffffff'], 6, 0.8);
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

    this.x += this.vx;
    for (const p of Game.platforms) {
      if (aabb(this, p)) {
        if (this.vx > 0) this.x = p.x - this.w;
        else if (this.vx < 0) this.x = p.x + p.w;
      }
    }

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

    if (this.onGround && this.vx !== 0) this.runFrame += 0.28;
    else if (this.onGround) this.runFrame = 0;
    else this.runFrame = 0;

    // 跑步尘土
    if (this.onGround && this.vx !== 0 && this.t % 12 === 0) {
      dustKick(this.x + this.w / 2, this.y + this.h, -this.dir, 2);
    }

    this.firing = shoot;
    if (shoot) this.fire();
  }

  fire() {
    if (this.fireCD > 0) return;
    this.fireCD = FIRE_COOLDOWN[this.fireMode] ?? 10;
    const cx = this.x + this.w / 2 + this.dir * 8;
    const cy = this.y + 10 + (this.aimY === -1 ? -8 : this.aimY === 1 ? 6 : 0);
    let vx = this.dir * 6, vy = 0;
    if (this.aimY === -1) vy = -2.5;
    else if (this.aimY === 1) vy = 2.5;

    const muzzleColor = WPN_MUZZLE[this.fireMode] || '#ffe060';
    const spawn = (vx_, vy_, kind) => {
      Game.bullets.push(new Bullet(cx, cy, vx_, vy_, true, kind));
    };
    if (this.fireMode === W.default) {
      spawn(vx, vy, 'default');
      muzzleFlash(cx + this.dir * 4, cy, this.dir, muzzleColor);
      Sound.shoot();
    } else if (this.fireMode === W.rapid) {
      spawn(vx * 1.2, vy, 'rapid');
      muzzleFlash(cx + this.dir * 4, cy, this.dir, muzzleColor);
      Sound.shoot();
    } else if (this.fireMode === W.spread) {
      for (let i = -2; i <= 2; i++) {
        const a = Math.atan2(vy, vx) + i * 0.16;
        spawn(Math.cos(a) * 6, Math.sin(a) * 6, 'spread');
      }
      muzzleFlash(cx + this.dir * 4, cy, this.dir, muzzleColor);
      Sound.shoot();
    } else if (this.fireMode === W.laser) {
      spawn(vx * 1.6, vy * 1.4, 'laser');
      muzzleFlash(cx + this.dir * 4, cy, this.dir, muzzleColor);
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

    // 阴影
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(2, 22, 12, 1);
    ctx.globalAlpha = 1;

    // === 腿 (4 帧走跑) ===
    const wf = Math.floor(this.runFrame) % 4;
    let legA = 0, legB = 0;
    if (wf === 0) { legA = 0; legB = 0; }
    else if (wf === 1) { legA = -1; legB = 1; }
    else if (wf === 2) { legA = 0; legB = 0; }
    else { legA = 1; legB = -1; }

    // 裤子
    ctx.fillStyle = '#0a2a6a';
    ctx.fillRect(3, 14 + legA, 4, 5);
    ctx.fillRect(9, 14 + legB, 4, 5);
    ctx.fillStyle = '#1f5fc4';
    ctx.fillRect(3, 14 + legA, 4, 1);
    ctx.fillRect(9, 14 + legB, 4, 1);
    // 靴子
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(2, 19 + legA, 5, 2);
    ctx.fillRect(9, 19 + legB, 5, 2);
    ctx.fillStyle = '#4a2a1a';
    ctx.fillRect(2, 19 + legA, 5, 1);
    ctx.fillRect(9, 19 + legB, 5, 1);

    // === 身体 (蓝色装甲) ===
    ctx.fillStyle = '#1a4ea0';
    ctx.fillRect(2, 5, 12, 10);
    // 高光
    ctx.fillStyle = '#4a8fe8';
    ctx.fillRect(2, 5, 12, 1);
    ctx.fillRect(2, 5, 1, 10);
    // 阴影
    ctx.fillStyle = '#0a2a6a';
    ctx.fillRect(13, 5, 1, 10);
    ctx.fillRect(2, 14, 12, 1);
    // 肩甲
    ctx.fillStyle = '#2a8add';
    ctx.fillRect(1, 4, 3, 4);
    ctx.fillRect(12, 4, 3, 4);
    ctx.fillStyle = '#5ab0ee';
    ctx.fillRect(1, 4, 3, 1);
    ctx.fillRect(12, 4, 3, 1);

    // 腰带 (黄)
    ctx.fillStyle = '#aa8822';
    ctx.fillRect(2, 12, 12, 2);
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(2, 12, 12, 1);
    ctx.fillStyle = '#ffdd55';
    ctx.fillRect(3, 12, 2, 1);

    // 武器颜色条
    if (this.fireMode !== W.default) {
      ctx.fillStyle = WPN_COLOR[this.fireMode];
      ctx.fillRect(2, 9, 12, 1);
    }

    // === 头部 ===
    // 头盔
    ctx.fillStyle = '#2a8add';
    ctx.fillRect(2, -1, 12, 4);
    ctx.fillStyle = '#5ab0ee';
    ctx.fillRect(2, -1, 12, 1);
    ctx.fillStyle = '#0a2a6a';
    ctx.fillRect(2, 2, 12, 1);
    // 帽檐
    ctx.fillStyle = '#1a4ea0';
    ctx.fillRect(1, 2, 14, 1);
    ctx.fillStyle = '#0e3b66';
    ctx.fillRect(1, 2, 14, 1);
    // 面罩 (皮肤)
    ctx.fillStyle = '#ffd6a0';
    ctx.fillRect(3, 3, 10, 4);
    ctx.fillStyle = '#c08850';
    ctx.fillRect(3, 6, 10, 1);
    // 黄色护目镜
    ctx.fillStyle = '#000';
    ctx.fillRect(7, 3, 6, 2);
    ctx.fillStyle = '#ffe060';
    ctx.fillRect(8, 3, 4, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 3, 1, 1);
    // 嘴
    ctx.fillStyle = '#a04020';
    ctx.fillRect(11, 6, 2, 1);

    // === 武器 + 手臂 (根据 aimY) ===
    if (this.aimY === -1) {
      // 向上射击
      ctx.fillStyle = '#ffd6a0';
      ctx.fillRect(5, 2, 3, 4);
      ctx.fillStyle = '#c08850';
      ctx.fillRect(5, 2, 1, 4);
      ctx.fillStyle = '#444';
      ctx.fillRect(7, -1, 2, 8);
      ctx.fillStyle = '#888';
      ctx.fillRect(7, -1, 2, 1);
      // 枪口火光 (实时)
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        ctx.fillStyle = WPN_MUZZLE[this.fireMode] || '#ffd84d';
        ctx.fillRect(6, -5, 5, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(7, -4, 3, 3);
      }
    } else if (this.aimY === 1 && this.onGround) {
      // 趴下 (俯射)
      ctx.fillStyle = '#ffd6a0';
      ctx.fillRect(7, 10, 6, 2);
      ctx.fillStyle = '#444';
      ctx.fillRect(11, 9, 8, 4);
      ctx.fillStyle = '#888';
      ctx.fillRect(11, 9, 8, 1);
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        ctx.fillStyle = WPN_MUZZLE[this.fireMode] || '#ffd84d';
        ctx.fillRect(18, 9, 5, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(19, 10, 3, 2);
      }
    } else {
      // 平射
      ctx.fillStyle = '#ffd6a0';
      ctx.fillRect(7, 6, 4, 3);
      ctx.fillStyle = '#c08850';
      ctx.fillRect(7, 6, 1, 3);
      ctx.fillStyle = '#444';
      ctx.fillRect(10, 7, 8, 4);
      ctx.fillStyle = '#888';
      ctx.fillRect(10, 7, 8, 1);
      ctx.fillStyle = '#222';
      ctx.fillRect(16, 7, 2, 4);
      // 枪口火光
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        ctx.fillStyle = WPN_MUZZLE[this.fireMode] || '#ffd84d';
        ctx.fillRect(17, 7, 5, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(18, 8, 3, 2);
      }
    }

    ctx.restore();
  }
}

// ============================================================
// 9.  关卡定义  -  3 关 + 主题色
// ============================================================
const STAGES = [
  {
    name: '热带丛林', subtitle: 'JUNGLE — STAGE 1',
    width: 4096, groundY: VH - 40,
    sky1: '#0a1838', sky2: '#16234a',
    mountain1: '#142544', mountain2: '#1a2c52',
    tree: '#0e1c34', treeLight: '#1a3055',
    ground: '#2d4a1f', dirt: '#5a3a1a', grass: '#3d6b2a',
    platformColor: '#243a1f', platformTop: '#3d6b2a', platformAccent: '#0e1c0a',
    bgParticles: 'dust',
    palettes: {
      grunt: null,
      runner: null,
      turret: null,
      flyer: null,
    },
    platforms: [
      new Platform(360,  VH - 90,  96, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(560,  VH - 130, 80, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(720,  VH - 90,  80, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(960,  VH - 120, 96, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(1180, VH - 160, 80, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(1380, VH - 100, 100, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(1580, VH - 160, 80, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(1780, VH - 100, 96, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(2000, VH - 140, 120, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(2200, VH - 90,  80, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(2400, VH - 150, 96, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(2620, VH - 100, 80, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(2840, VH - 170, 100, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(3060, VH - 110, 100, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(3260, VH - 170, 80, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
      new Platform(3460, VH - 100, 120, 12, '#243a1f', '#3d6b2a', '#0e1c0a'),
    ],
    BossClass: BossJungle,
    spawnPattern: [['grunt', 6], ['runner', 3], ['flyer', 3], ['turret', 2]],
  },
  {
    name: '冰雪基地', subtitle: 'ICE BASE — STAGE 2',
    width: 4096, groundY: VH - 40,
    sky1: '#0e1c34', sky2: '#1a2c52',
    mountain1: '#3a5a8a', mountain2: '#5a7aaa',
    tree: '#aac8ff', treeLight: '#ffffff',
    ground: '#cce4ff', dirt: '#aabfd9', grass: '#e0eaff',
    platformColor: '#aac8ff', platformTop: '#ffffff', platformAccent: '#88aacc',
    bgParticles: 'snow',
    palettes: {
      grunt: { body: '#3a4a7a', bodyL: '#5a6a9a', bodyD: '#1a2a4a', head: '#1a2a4a', headL: '#3a4a7a', eye: '#ff4040', gun: '#222', gunL: '#444', pants: '#1a2a4a', pantsL: '#3a4a7a', boots: '#0a1a3a', explode: ['#aac8ff', '#ffffff', '#88aaff'] },
      runner: { body: '#5a6aaa', bodyL: '#7a8aaa', bodyD: '#3a4a7a', eye: '#00ffff', eyeGlow: '#88ffff', explode: ['#aac8ff', '#ffffff'] },
      turret: { body: '#8888cc', bodyL: '#aaaaff', bodyD: '#5a5a8a', base: '#3a3a6a', baseL: '#5a5a8a', rivet: '#222', eye: '#ff0000', explode: ['#aaaaff', '#ffffff', '#aac8ff'] },
      flyer: { body: '#88aaff', bodyL: '#aaccff', bodyD: '#5a7aaa', wing: '#3a5a8a', wingL: '#5a7aaa', eye: '#fff', pupil: '#000', explode: ['#aaccff', '#ffffff'] },
    },
    platforms: [
      new Platform(280,  VH - 90,  96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(460,  VH - 130, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(620,  VH - 90,  64, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(820,  VH - 140, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1020, VH - 100, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1200, VH - 170, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1380, VH - 110, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1600, VH - 160, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1800, VH - 100, 96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2000, VH - 150, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2200, VH - 90,  80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2380, VH - 130, 96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2580, VH - 100, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2800, VH - 170, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(3020, VH - 110, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(3220, VH - 150, 96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(3440, VH - 100, 120, 12, '#aac8ff', '#ffffff', '#88aacc'),
    ],
    BossClass: BossIce,
    spawnPattern: [['grunt', 5], ['runner', 4], ['flyer', 4], ['turret', 3]],
  },
  {
    name: '异形要塞', subtitle: 'ALIEN HIVE — STAGE 3',
    width: 4096, groundY: VH - 40,
    sky1: '#1a0a2a', sky2: '#3a1a4a',
    mountain1: '#3a1a4a', mountain2: '#5a2a6a',
    tree: '#aa3aff', treeLight: '#ff5be0',
    ground: '#2a1a4a', dirt: '#5a2a6a', grass: '#7a2aaa',
    platformColor: '#4a1a6a', platformTop: '#aa3aff', platformAccent: '#2a0a4a',
    bgParticles: 'ember',
    palettes: {
      grunt: { body: '#7a2a4a', bodyL: '#aa4a7a', bodyD: '#4a0a2a', head: '#4a0a2a', headL: '#7a2a4a', eye: '#ff00ff', gun: '#222', gunL: '#444', pants: '#3a1a4a', pantsL: '#5a2a6a', boots: '#1a0a2a', explode: ['#ff5be0', '#aa3aff', '#ffffff'] },
      runner: { body: '#aa2a7a', bodyL: '#cc4a9a', bodyD: '#7a1a4a', eye: '#ff00ff', eyeGlow: '#ff88ff', explode: ['#ff5be0', '#aa3aff'] },
      turret: { body: '#aa3aff', bodyL: '#cc66ff', bodyD: '#7a1aaa', base: '#5a1a7a', baseL: '#7a2aaa', rivet: '#1a0a2a', eye: '#ff0000', explode: ['#ff5be0', '#aa3aff', '#ffffff'] },
      flyer: { body: '#ff5be0', bodyL: '#ff88cc', bodyD: '#aa2a7a', wing: '#aa2a7a', wingL: '#cc4a9a', eye: '#fff', pupil: '#000', explode: ['#ff88cc', '#aa3aff', '#ffffff'] },
    },
    platforms: [
      new Platform(320,  VH - 100, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(520,  VH - 160, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(680,  VH - 100, 64, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(880,  VH - 130, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1080, VH - 170, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1260, VH - 100, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1460, VH - 150, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1660, VH - 100, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1880, VH - 140, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2080, VH - 90,  80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2260, VH - 130, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2480, VH - 100, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2680, VH - 170, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2900, VH - 110, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(3100, VH - 160, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(3300, VH - 100, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(3500, VH - 140, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
    ],
    BossClass: BossAlien,
    spawnPattern: [['grunt', 4], ['runner', 5], ['flyer', 5], ['turret', 4]],
  },
];

// ============================================================
// 10. 关卡
// ============================================================
class Level {
  constructor(stageIdx) {
    this.stageIdx = stageIdx;
    this.def = STAGES[stageIdx];
    this.width = this.def.width;
    this.ground = this.def.groundY;
    this.platforms = this.def.platforms;
    this.spawns = [];
    this.bossSpawned = false;
    this.bossX = this.width - 220;
    this.bgParticles = [];
    this.initBgParticles();
    this.generateSpawns();
  }
  initBgParticles() {
    this.bgParticles = [];
    const kind = this.def.bgParticles;
    for (let i = 0; i < 40; i++) {
      if (kind === 'snow') {
        this.bgParticles.push({
          x: rnd(0, VW), y: rnd(0, VH),
          vx: rnd(-0.3, -0.1), vy: rnd(0.3, 1.0),
          size: irnd(1, 3), color: '#ffffff',
          alpha: rnd(0.5, 1.0),
        });
      } else if (kind === 'ember') {
        this.bgParticles.push({
          x: rnd(0, VW), y: rnd(0, VH),
          vx: rnd(-0.4, 0.4), vy: rnd(-1.0, -0.3),
          size: irnd(1, 2), color: pick(['#ff5be0', '#aa3aff', '#ff88cc']),
          alpha: rnd(0.4, 0.9),
        });
      } else {
        this.bgParticles.push({
          x: rnd(0, VW), y: rnd(0, VH),
          vx: rnd(-0.2, 0.2), vy: rnd(0, 0.2),
          size: irnd(1, 2), color: '#a08868',
          alpha: rnd(0.2, 0.4),
        });
      }
    }
  }
  updateBgParticles() {
    for (const p of this.bgParticles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = VW;
      if (p.x > VW) p.x = 0;
      if (p.y > VH) { p.y = 0; p.x = rnd(0, VW); }
      if (p.y < 0) { p.y = VH; p.x = rnd(0, VW); }
    }
  }
  generateSpawns() {
    let x = 320;
    while (x < this.width - 500) {
      const total = this.def.spawnPattern.reduce((s, [, n]) => s + n, 0);
      let r = Math.random() * total;
      let type = 'grunt';
      for (const [t, n] of this.def.spawnPattern) {
        if ((r -= n) <= 0) { type = t; break; }
      }
      const y = type === 'flyer' ? irnd(60, 140)
              : type === 'turret' ? this.ground - 18
              : this.ground - 22;
      this.spawns.push({ x, y, type });
      x += irnd(160, 280);
    }
    this.spawns.push({ x: this.width - 380, y: this.ground - 22, type: 'grunt' });
    this.spawns.push({ x: this.width - 340, y: irnd(60, 130), type: 'flyer' });
    if (this.stageIdx >= 1) this.spawns.push({ x: this.width - 300, y: this.ground - 18, type: 'turret' });
  }
  update(player) {
    this.updateBgParticles();
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
      const b = new this.def.BossClass(this.bossX, this.ground - 100);
      Game.enemies.push(b);
      Game.camera.addShake(8);
      Game.camera.addFlash(20, '#ffffff');
      Sound.boss();
      flash('⚠ BOSS ⚠', 100);
    }
  }
}

// ============================================================
// 11. 主游戏 (状态机 + 渲染 + 后处理)
// ============================================================
const flashQueue = [];
function flash(text, frames = 80) {
  flashQueue.push({ text, t: frames });
}
function setOverlay(state) {
  const ov = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const text  = document.getElementById('overlay-text');
  if (!ov) return;
  if (state === 'hidden') { ov.classList.add('hidden'); return; }
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
  state: 'menu',
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
    this.player = new Player(40, this.levelObj.ground - 22);
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
    explode(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2,
      ['#ffd84d', '#ff8a3a', '#ffffff'], 30, 2);
  },
  loseLife() {
    this.lives--;
    if (this.lives <= 0) {
      this.state = 'over';
      this.stateTimer = 0;
      this.camera.addFlash(40, '#ff0000');
      Sound.over();
    } else {
      this.player = new Player(Math.max(20, this.player ? this.player.x - 60 : 40), this.levelObj.ground - 22);
      this.player.invuln = 120;
    }
  },
  triggerWin() {
    if (this.stageIdx < STAGES.length - 1) {
      this.state = 'stage';
      this.stateTimer = 200;
      this.addScore(2000);
      Sound.clear();
    } else {
      this.state = 'complete';
      this.stateTimer = 0;
      this.addScore(10000);
      Sound.clear();
      this.camera.addFlash(50, '#ffffff');
    }
  },

  update() {
    if (this.state === 'menu') {
      if (Input.consume('enter') || Input.consume(' ')) this.start();
      return;
    }
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
    if (this.state === 'paused') {
      if (Input.consume('p') || Input.consume('enter')) this.state = 'playing';
      return;
    }
    if (this.state === 'playing' && Input.consume('p')) { this.state = 'paused'; return; }
    if (Input.consume('r')) { this.start(); return; }

    if (this.state === 'over' || this.state === 'complete') {
      this.stateTimer++;
      if (Math.random() < 0.4) {
        this.particles.push(new Particle(rnd(0, VW), rnd(0, VH), rnd(-0.3, 0.3), rnd(-0.3, 0.3), 60,
          pick(['#ffd84d', '#ff5b3a', '#4ab8ff']), 2, 0, 'spark'));
      }
      for (const p of this.particles) p.update();
      this.particles = this.particles.filter(p => !p.dead);
      if (this.stateTimer > 90 && (Input.consume('enter') || Input.consume(' '))) this.start();
      return;
    }

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

    if (this.player.alive) {
      for (const e of this.enemies) {
        if (!e.dead && aabb(e, this.player)) {
          this.player.hit();
          e.hit(99);
          break;
        }
      }
    }

    if (this.player.alive) {
      for (const p of this.powerups) {
        if (aabb(p, this.player)) {
          if (p.type === 'health') {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
            Sound.powerup();
            flash('HP +1', 60);
          } else {
            this.player.setWeapon(p.type);
          }
          explode(p.x + p.w / 2, p.y + p.h / 2, ['#ffd84d', '#ff8a3a', '#ffffff'], 14, 1);
          p.dead = true;
        }
      }
    }

    this.camera.follow(this.player);

    if (this.player.x >= this.levelObj.width - 16 && !this.levelObj.bossSpawned) {
      this.triggerWin();
    }
  },

  render() {
    const def = this.levelObj ? this.levelObj.def : STAGES[0];

    if (this.state === 'menu')        setOverlay('menu');
    else if (this.state === 'playing' || this.state === 'stage') setOverlay('hidden');
    else if (this.state === 'paused') setOverlay('paused');
    else if (this.state === 'over')   setOverlay('over');
    else if (this.state === 'complete') setOverlay('complete');

    // 背景天空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, VH);
    skyGrad.addColorStop(0, def.sky1);
    skyGrad.addColorStop(1, def.sky2);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, VW, VH);

    if (this.state === 'menu') {
      this.drawTitle();
      return;
    }

    this.camera.apply(() => {
      // 视差背景 (4 层)
      this.drawParallax(def);
      // 背景粒子
      this.drawBgParticles(def);
      // 平台
      for (const p of this.platforms) p.draw();
      // 地面
      this.drawGround(def);
      // 掉宝
      for (const p of this.powerups) p.draw();
      // 敌人
      for (const e of this.enemies) e.draw();
      // 子弹
      for (const b of this.bullets) b.draw();
      // 玩家
      if (this.player) this.player.draw();
      // 粒子
      for (const p of this.particles) p.draw();
    });

    // 后处理: 屏幕震动闪光
    this.drawScreenFlash();
    // HUD
    this.drawHUD(def);

    // 关卡过渡
    if (this.state === 'stage') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#ffcc33';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STAGE CLEAR!', VW / 2, VH / 2 - 22);
      ctx.fillStyle = '#fff';
      ctx.font = '13px monospace';
      const next = STAGES[this.stageIdx + 1];
      if (next) {
        ctx.fillText('下一关: ' + next.name, VW / 2, VH / 2 + 4);
        ctx.fillStyle = '#aac8ff';
        ctx.fillText(next.subtitle, VW / 2, VH / 2 + 22);
      }
      ctx.fillStyle = '#ffd84d';
      ctx.fillText('分数 +2000', VW / 2, VH / 2 + 42);
    }
    if (this.state === 'paused') this.drawCenterText('PAUSE', '按 P 继续 · R 重开');
    if (this.state === 'over')   this.drawCenterText('GAME OVER', `分数 ${Game.score}  ·  按 ENTER 重开`);
    if (this.state === 'complete') this.drawCenterText('全部通关!', `最终分数 ${Game.score}  ·  ENTER 重玩`);

    // 中央 flash 文字
    if (flashQueue.length > 0) {
      const f = flashQueue[0];
      const a = Math.min(1, f.t / 18);
      ctx.fillStyle = `rgba(255,204,51,${a})`;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, VW / 2, VH / 2 - 28);
      f.t--;
      if (f.t <= 0) flashQueue.shift();
    }

    // CRT 扫描线 + 渐晕 (始终叠加)
    this.drawPostFx();
  },

  drawPostFx() {
    // 扫描线
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for (let y = 0; y < VH; y += 2) ctx.fillRect(0, y, VW, 1);
    ctx.globalAlpha = 1;
    // 渐晕 (vignette)
    const vg = ctx.createRadialGradient(VW/2, VH/2, VH * 0.4, VW/2, VH/2, VH * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VW, VH);
  },

  drawScreenFlash() {
    if (this.camera.flashT > 0) {
      const a = Math.min(0.5, this.camera.flashT / 30);
      ctx.fillStyle = this.camera.flashColor;
      ctx.globalAlpha = a;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
  },

  drawBgParticles(def) {
    if (!this.levelObj) return;
    for (const p of this.levelObj.bgParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  },

  drawTitle() {
    const t = performance.now() / 1000;
    const def = STAGES[0];
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
    // 标题发光
    ctx.save();
    ctx.shadowColor = '#ffcc33';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTRA', VW / 2, 80);
    ctx.restore();
    ctx.fillStyle = '#ff5b3a';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('CLASSIC — 1987', VW / 2, 102);

    // 角色剪影 (大)
    const px = VW / 2 - 40, py = 130;
    // 阴影
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(px - 2, py + 38, 44, 2);
    ctx.globalAlpha = 1;
    // 腿
    ctx.fillStyle = '#0a2a6a';
    ctx.fillRect(px + 4, py + 28, 8, 10);
    ctx.fillRect(px + 18, py + 28, 8, 10);
    ctx.fillStyle = '#1f5fc4';
    ctx.fillRect(px + 4, py + 28, 8, 2);
    ctx.fillRect(px + 18, py + 28, 8, 2);
    // 靴子
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(px + 3, py + 36, 10, 3);
    ctx.fillRect(px + 17, py + 36, 10, 3);
    // 身体
    ctx.fillStyle = '#1a4ea0';
    ctx.fillRect(px + 2, py + 12, 22, 18);
    ctx.fillStyle = '#4a8fe8';
    ctx.fillRect(px + 2, py + 12, 22, 2);
    ctx.fillRect(px + 2, py + 12, 2, 18);
    ctx.fillStyle = '#0a2a6a';
    ctx.fillRect(px + 22, py + 12, 2, 18);
    // 肩甲
    ctx.fillStyle = '#2a8add';
    ctx.fillRect(px + 0, py + 10, 6, 8);
    ctx.fillRect(px + 22, py + 10, 6, 8);
    // 腰带
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(px + 2, py + 24, 22, 2);
    // 头
    ctx.fillStyle = '#ffd6a0';
    ctx.fillRect(px + 4, py + 4, 18, 9);
    // 头盔
    ctx.fillStyle = '#2a8add';
    ctx.fillRect(px + 2, py + 0, 22, 6);
    ctx.fillStyle = '#5ab0ee';
    ctx.fillRect(px + 2, py + 0, 22, 2);
    // 护目镜
    ctx.fillStyle = '#000';
    ctx.fillRect(px + 14, py + 4, 8, 4);
    ctx.fillStyle = '#ffe060';
    ctx.fillRect(px + 16, py + 4, 4, 4);
    // 嘴
    ctx.fillStyle = '#a04020';
    ctx.fillRect(px + 18, py + 10, 3, 1);
    // 武器
    ctx.fillStyle = '#444';
    ctx.fillRect(px + 24, py + 16, 18, 6);
    ctx.fillStyle = '#888';
    ctx.fillRect(px + 24, py + 16, 18, 1);

    // 操作提示
    ctx.fillStyle = '#aac8ff';
    ctx.font = '10px monospace';
    ctx.fillText('↑↑↓↓←→←→BA = 30 LIVES', VW / 2, 175);

    if (this.highScore > 0) {
      ctx.fillStyle = '#ffcc33';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('HI  ' + String(this.highScore).padStart(6, '0'), VW / 2, 200);
    }

    const blink = Math.floor(t * 2) % 2;
    if (blink) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS ENTER TO START', VW / 2, VH - 50);
    }

    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.fillText('3 STAGES  ·  3 BOSSES  ·  4 WEAPONS  ·  KONAMI CHEAT', VW / 2, VH - 26);
  },

  drawParallax(def) {
    const cx = this.camera.x;
    // 远山 (最慢)
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
    // 树/装饰 (较快)
    ctx.fillStyle = def.tree;
    for (let i = 0; i < 16; i++) {
      const x = i * 70 - (cx * 0.7 % 70);
      if (this.stageIdx === 2) {
        ctx.fillStyle = def.tree;
        ctx.fillRect(x, VH - 70, 4, 30);
        ctx.fillStyle = def.treeLight;
        ctx.fillRect(x + 4, VH - 80, 12, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 6, VH - 78, 2, 2);
      } else {
        ctx.fillStyle = def.tree;
        ctx.fillRect(x, VH - 70, 6, 30);
        ctx.fillRect(x - 6, VH - 80, 18, 12);
        ctx.fillStyle = def.treeLight;
        ctx.fillRect(x - 6, VH - 80, 18, 2);
      }
    }
  },

  drawGround(def) {
    const gy = this.groundY();
    const x0 = Math.floor(this.camera.x / 16) * 16 - 16;
    const x1 = x0 + VW + 48;
    // 主体
    ctx.fillStyle = def.ground;
    ctx.fillRect(x0, gy, x1 - x0, VH - gy);
    // 草顶
    ctx.fillStyle = def.grass;
    for (let x = x0; x < x1; x += 8) {
      ctx.fillRect(x, gy - 1, 6, 2);
      ctx.fillRect(x + 4, gy - 3, 4, 3);
      ctx.fillRect(x + 2, gy - 5, 2, 2);
    }
    // 土层
    ctx.fillStyle = def.dirt;
    ctx.fillRect(x0, gy + 6, x1 - x0, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x0, gy + 10, x1 - x0, VH);
    // 土层纹理
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let x = x0; x < x1; x += 24) {
      ctx.fillRect(x, gy + 12, 8, 2);
      ctx.fillRect(x + 12, gy + 20, 4, 1);
    }
  },

  drawHUD(def) {
    // 顶部血条背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, VW, 20);
    // 底部边框
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, VH - 14, VW, 14);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('P' + (this.stageIdx + 1), 4, 5);

    // 生命 (脉冲心)
    for (let i = 0; i < this.player.hp; i++) {
      const x = 22 + i * 13;
      const pulse = Math.sin((this.t || 0) * 0.1 + i) * 0.5 + 0.5;
      // 阴影/外发光
      ctx.fillStyle = `rgba(255,85,119,${0.3 + pulse * 0.3})`;
      ctx.fillRect(x - 1, 4, 12, 13);
      // 心形
      ctx.fillStyle = '#ff5577';
      ctx.fillRect(x + 1, 5, 4, 5);
      ctx.fillRect(x + 5, 5, 4, 5);
      ctx.fillRect(x, 7, 10, 4);
      ctx.fillRect(x + 1, 11, 8, 2);
      ctx.fillRect(x + 2, 13, 6, 1);
      // 高光
      ctx.fillStyle = '#ff88aa';
      ctx.fillRect(x + 2, 6, 1, 2);
      ctx.fillRect(x + 6, 6, 1, 2);
    }

    // 武器
    if (this.player.fireMode !== W.default && this.player.weaponTimer > 0) {
      const remain = (this.player.weaponTimer / 60).toFixed(1);
      // 发光背景
      ctx.fillStyle = 'rgba(255,216,77,0.2)';
      ctx.fillRect(76, 3, 56, 14);
      ctx.fillStyle = WPN_COLOR[this.player.fireMode];
      ctx.font = 'bold 10px monospace';
      ctx.fillText(WPN_LABEL[this.player.fireMode] + '  ' + remain + 's', 80, 5);
    }

    // 关卡名
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aac8ff';
    ctx.font = '8px monospace';
    ctx.fillText('STAGE ' + (this.stageIdx + 1) + '/' + STAGES.length + '  ' + (def ? def.name : ''), VW / 2, 5);
    // 分数 (带发光)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(String(this.score).padStart(6, '0'), VW / 2 + 1, 13);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(this.score).padStart(6, '0'), VW / 2, 12);

    // 命数
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4ab8ff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('× ' + this.lives, VW - 4, 5);
    ctx.fillStyle = '#888';
    ctx.font = '8px monospace';
    ctx.fillText('HI ' + String(this.highScore).padStart(6, '0'), VW - 4, 14);

    // 底部武器切换提示 (如有 spread/rapid/laser)
    if (this.player.fireMode !== W.default) {
      ctx.fillStyle = WPN_COLOR[this.player.fireMode];
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('武器: ' + WPN_LABEL[this.player.fireMode], 4, VH - 11);
    }

    // Boss 血条 (顶部居中)
    const boss = this.enemies.find(e => e instanceof BossBase && !e.dead);
    if (boss && this.state === 'playing') {
      const hpw = 200, hpx = (VW - hpw) / 2, hpy = 22;
      ctx.fillStyle = '#000';
      ctx.fillRect(hpx - 2, hpy - 2, hpw + 4, 8);
      ctx.fillStyle = '#fff';
      ctx.fillRect(hpx - 1, hpy - 1, hpw + 2, 6);
      ctx.fillStyle = '#330';
      ctx.fillRect(hpx, hpy, hpw, 4);
      const ratio = Math.max(0, boss.hp / boss.maxHp);
      const c = boss.phase === 2 ? '#ff00ff' : (boss.phase === 1 ? '#ff4040' : '#ff8a3a');
      ctx.fillStyle = c;
      ctx.fillRect(hpx, hpy, hpw * ratio, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(hpx, hpy, hpw * ratio, 1);
    }
  },

  drawCenterText(title, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
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
// 12. 主循环  -  固定 60Hz 逻辑
// ============================================================
const FIXED_DT = 1000 / 60;
let last = performance.now();
let acc = 0;

function loop(now) {
  const elapsed = Math.min(100, now - last);
  last = now;
  acc += elapsed;
  let safety = 5;
  while (acc >= FIXED_DT && safety-- > 0) {
    Game.update();
    acc -= FIXED_DT;
  }
  Game.render();
  requestAnimationFrame(loop);
}

// ============================================================
// 13. 启动
// ============================================================
Input.bind();
requestAnimationFrame(loop);

})();