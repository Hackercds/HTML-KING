/* ============================================================
 *  魂斗罗 CONTRA  -  4K 高清像素版 (致敬 1987 NES 原版)
 *  --------------------------------------------------------------
 *  · 内部 1920×1080 渲染 (devicePixelRatio 2 = 真 4K 3840×2160)
 *  · NES 原作风精灵: 橙色头发 + 蓝色军装 + 红围巾
 *  · 红贝雷帽士兵 (Red Falcon) + 关底 Wall Boss
 *  · Stage 1 丛林瀑布背景 + Stage 2 冰雪基地 + Stage 3 异形要塞
 *  · 4 武器 (M/F/S/L) + Konami 30 条命 + 触屏 + CRT 后处理
 * ============================================================ */
(() => {
'use strict';

// ============================================================
// 0.  画布与坐标系统
//     GW × GH = 游戏世界坐标 (逻辑单位)
//     VW × VH = 画布坐标 (实际像素, 1920×1080 内部)
//     S = VW / GW 缩放系数
// ============================================================
const C = document.getElementById('game');
const ctx = C.getContext('2d');
ctx.imageSmoothingEnabled = false;

// 内部渲染分辨率 (HD, 配合 devicePixelRatio 即为 4K)
const VW = 1920, VH = 1080;
// 游戏世界逻辑分辨率 (NES 风 512×320)
const GW = 512, GH = 320;
const S = VW / GW;  // 3.75x

C.width = VW; C.height = VH;

// 物理量全部按世界坐标计算
// 物理量保持世界坐标单位 (不要乘 S, 否则位置+速度双重缩放导致游戏快进)
const GRAVITY   = 0.55;
const MAX_FALL  = 8;
const PLAYER_SPEED = 2.1;
const JUMP_V    = -8.6;

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

// 在世界坐标下绘制一个矩形 (自动按 S 缩放)
function r(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * S, y * S, w * S, h * S);
}
function rAlpha(a) { ctx.globalAlpha = a; }
function rReset() { ctx.globalAlpha = 1; }

// ============================================================
// 1.  音效 (Web Audio 程序合成)
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
  keys: new Set(), pressed: new Set(),
  touch: new Set(), touchPressed: new Set(),
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
    const map = { 't-left':'arrowleft', 't-right':'arrowright', 't-up':'arrowup', 't-down':'arrowdown', 't-jump':'x', 't-fire':'z' };
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const press = (e) => { e.preventDefault(); if (!this.touch.has(key)) this.touchPressed.add(key); this.touch.add(key); el.classList.add('pressed'); try { Sound.start(); } catch (_) {} };
      const release = (e) => { if (e) e.preventDefault(); this.touch.delete(key); el.classList.remove('pressed'); };
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
      this.pressed.delete(key); this.touchPressed.delete(key); return true;
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
    const tx = target.x + target.w / 2 - GW / 2;
    const ty = target.y + target.h / 2 - GH / 2;
    this.x += (tx - this.x) * 0.18;
    this.y = clamp(this.y + (ty - this.y) * 0.12, -80, 60);
    if (this.x < 0) this.x = 0;
    const maxX = Math.max(0, Game.levelW() - GW);
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
    ctx.translate(sx - this.x * S, sy - this.y * S);
    fn();
    ctx.restore();
  }
}

// ============================================================
// 4.  粒子
// ============================================================
class Particle {
  constructor(x, y, vx, vy, life, color, size = 2, gravity = 0.2, kind = 'spark') {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color;
    this.size = size; this.gravity = gravity; this.dead = false;
    this.kind = kind; this.rot = 0; this.rotV = 0;
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
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = this.color;
      r(this.x - s, this.y - s, s * 2, s * 2, this.color);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      r(this.x - s/2, this.y - s/2, s, s, '#ffffff');
      ctx.globalAlpha = 1;
    } else if (this.kind === 'star') {
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(this.x * S, this.y * S);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      ctx.fillRect(-s * S, -1, s * 2 * S, 2);
      ctx.fillRect(-1, -s * S, 2, s * 2 * S);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (this.kind === 'smoke') {
      ctx.globalAlpha = a * 0.4;
      r(this.x - s/2, this.y - s/2, s, s, this.color);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      r(this.x, this.y, s, s, this.color);
      ctx.globalAlpha = 1;
    }
  }
}
function explode(x, y, palette, n = 18, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    const s = rnd(1.5, 3.5) * power;
    Game.particles.push(new Particle(x, y,
      Math.cos(a) * s, Math.sin(a) * s - 0.5,
      irnd(20, 40), pick(palette), irnd(2, 5), 0.15, 'spark'));
  }
  for (let i = 0; i < 6; i++) {
    Game.particles.push(new Particle(x + rnd(-6, 6), y + rnd(-6, 6),
      rnd(-0.5, 0.5), rnd(-1.2, -0.3), irnd(30, 60),
      pick(['#666', '#888', '#555']), irnd(4, 8), 0.02, 'smoke'));
  }
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
// 5.  子弹 + 掉宝 + 平台
// ============================================================
class Bullet {
  constructor(x, y, vx, vy, friendly, kind = 'default') {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = 6; this.h = 4;
    this.friendly = friendly; this.kind = kind;
    this.dead = false; this.life = 80;
    this.pierce = (kind === 'laser');
    this.damage = kind === 'laser' ? 2 : 1;
    this.trailCD = 0;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.life--;
    if (this.life <= 0) this.dead = true;
    if (this.x < Game.camera.x - 32 || this.x > Game.camera.x + GW + 32) this.dead = true;
    if (this.friendly && this.kind === 'laser' && (this.trailCD-- <= 0)) {
      this.trailCD = 1;
      Game.particles.push(new Particle(this.x, this.y + this.h/2, 0, 0, 10, '#ff5be0', 2, 0, 'glow'));
    } else if (this.friendly && this.kind === 'rapid' && (this.trailCD-- <= 0)) {
      this.trailCD = 1;
      Game.particles.push(new Particle(this.x, this.y + this.h/2, 0, 0, 6, '#a0ffa0', 1, 0, 'glow'));
    } else if (this.friendly && this.kind === 'spread' && (this.trailCD-- <= 0)) {
      this.trailCD = 2;
      Game.particles.push(new Particle(this.x, this.y, 0, 0, 8, '#ffd84d', 1, 0, 'glow'));
    }
  }
  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    if (this.kind === 'laser') {
      r(x - 4, y - 2, 12, 6, '#ff5be0');
      r(x - 2, y - 1, 10, 4, '#ff5be0');
      r(x, y, 6, 2, '#ffffff');
    } else if (this.kind === 'spread') {
      r(x - 1, y - 1, 8, 6, '#ffd84d');
      r(x, y, 6, 4, '#ffd84d');
      r(x + 1, y + 1, 3, 2, '#ffffff');
    } else if (this.kind === 'rapid') {
      r(x, y + 1, 6, 2, '#a0ffa0');
      r(x + 1, y + 1, 3, 1, '#ffffff');
    } else if (this.friendly) {
      r(x - 1, y - 1, 7, 5, '#fff7c0');
      r(x, y, 5, 3, '#fff7c0');
      r(x + 1, y + 1, 2, 1, '#ffffff');
    } else {
      r(x - 1, y - 1, 7, 5, '#ff5050');
      r(x, y, 5, 3, '#ff5050');
      r(x + 1, y + 1, 2, 1, '#ffcc88');
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
    ctx.globalAlpha = 0.4;
    r(x - 3, y - 3, this.w + 6, this.h + 6, flash ? '#ffffff' : '#ffd84d');
    ctx.globalAlpha = 1;
    r(x - 1, y - 1, this.w + 2, this.h + 2, flash ? '#ffffff' : '#0b1330');
    r(x, y, this.w, this.h, '#1c2a55');
    r(x + 1, y + 1, this.w - 2, 1, '#2c3e6e');
    if (this.type === 'health') {
      r(x + 5, y + 2, 4, 10, '#ff5577');
      r(x + 2, y + 5, 10, 4, '#ff5577');
      r(x + 5, y + 2, 1, 10, '#ff88aa');
    } else {
      const c = WPN_COLOR[this.type] || '#fff';
      ctx.fillStyle = c;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 绘制在画布坐标 (不缩放)
      ctx.save();
      ctx.scale(1 / S, 1 / S);  // 反向缩放以保持字体大小
      ctx.fillText(WPN_LABEL[this.type] || '?', x * S + this.w * S / 2, y * S + this.h * S / 2 + 1);
      ctx.restore();
    }
  }
}

class Platform {
  constructor(x, y, w, h, color, top, accent) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.color = color; this.top = top; this.accent = accent;
  }
  draw() {
    r(this.x, this.y, this.w, this.h, this.color);
    r(this.x, this.y, this.w, 3, this.top);
    r(this.x, this.y, this.w, 1, 'rgba(255,255,255,0.18)');
    r(this.x, this.y + this.h - 2, this.w, 2, this.accent);
    r(this.x + 3, this.y + 5, 2, 2, 'rgba(0,0,0,0.3)');
    r(this.x + this.w - 5, this.y + 5, 2, 2, 'rgba(0,0,0,0.3)');
  }
}

// ============================================================
// 6.  敌人
// ============================================================
class Enemy {
  constructor(x, y, w, h, hp, score, palette) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.hp = hp; this.maxHp = hp; this.score = score;
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
        this.palette.explode, 18, 1.3);
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

// ---- 6.1 Grunt  红贝雷帽士兵 (NES Contra 经典敌人) ----
class Grunt extends Enemy {
  constructor(x, y, palette) {
    palette = palette || {
      beret: '#cc1a1a', beretL: '#ff4040', beretD: '#660a0a',
      skin: '#ffd6a0', skinD: '#a07050',
      body: '#1a4ea0', bodyL: '#4a8fe8', bodyD: '#0a2a6a',
      pants: '#0a2a6a', pantsL: '#1a4ea0',
      boots: '#0a0a00',
      gun: '#444', gunL: '#888',
      belt: '#cc8822',
      explode: ['#cc1a1a', '#ff8855', '#ffd84d'],
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
    if (this.dir > 0) { ctx.translate((x + this.w) * S, y * S); ctx.scale(-1, 1); }
    else { ctx.translate(x * S, y * S); }

    // 阴影
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(2 * S, 22 * S, 12 * S, 1 * S);
    ctx.globalAlpha = 1;

    // === 腿 (NES 风) ===
    r(3, 14 + legA, 4, 5, p.pants);
    r(9, 14 - legA, 4, 5, p.pants);
    r(3, 14 + legA, 1, 5, p.pantsL);
    r(9, 14 - legA, 1, 5, p.pantsL);
    // 靴子
    r(2, 19 + legA, 5, 2, p.boots);
    r(9, 19 - legA, 5, 2, p.boots);

    // === 身体 (蓝色军装) ===
    r(2, 6, 12, 9, f || p.body);
    r(2, 6, 12, 1, f || p.bodyL);
    r(2, 6, 1, 9, f || p.bodyL);
    r(13, 6, 1, 9, p.bodyD);
    r(2, 14, 12, 1, p.bodyD);
    // 腰带
    r(2, 13, 12, 1, p.belt);

    // === 头: 红贝雷帽 + 脸 ===
    // 脸
    r(4, 3, 8, 4, f || p.skin);
    r(4, 6, 8, 1, p.skinD);
    // 贝雷帽 (标志性!)
    r(3, 0, 10, 3, f || p.beret);
    r(3, 0, 10, 1, f || p.beretL);
    r(3, 2, 10, 1, p.beretD);
    // 帽徽
    r(8, 1, 2, 1, '#ffd84d');
    // 帽檐右侧下垂
    if (this.dir > 0) r(2, 3, 2, 1, p.beretD);
    else r(12, 3, 2, 1, p.beretD);
    // 眼 + 嘴
    r(8, 4, 2, 1, '#000');
    r(11, 6, 2, 1, p.skinD);

    // === 手臂 + 枪 ===
    if (this.dir > 0) {
      r(0, 8, 3, 6, p.bodyL);
      r(0, 8, 1, 6, p.bodyD);
      r(-4, 10, 6, 2, p.gun);
      r(-4, 10, 6, 1, p.gunL);
    } else {
      r(13, 8, 3, 6, p.bodyL);
      r(15, 8, 1, 6, p.bodyD);
      r(14, 10, 6, 2, p.gun);
      r(14, 10, 6, 1, p.gunL);
    }
    if (this.fireCD < 6) {
      if (this.dir > 0) r(-6, 10, 2, 2, '#ffe060');
      else r(18, 10, 2, 2, '#ffe060');
    }

    ctx.restore();
  }
}

// ---- 6.2 Runner 红色冲锋异形 ----
class Runner extends Enemy {
  constructor(x, y, palette) {
    palette = palette || {
      body: '#c25a2a', bodyL: '#ff8855', bodyD: '#8a3a0a',
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
    if (this.dir > 0) { ctx.translate((x + this.w) * S, y * S); ctx.scale(-1, 1); }
    else { ctx.translate(x * S, y * S); }

    // 腿 (4 帧)
    if (wf === 0)      { r(2, 10, 4, 6, p.bodyD); r(8, 10, 4, 6, p.bodyD); }
    else if (wf === 1) { r(2, 11, 4, 5, p.bodyD); r(8, 9, 4, 7, p.bodyD); }
    else if (wf === 2) { r(2, 10, 4, 6, p.bodyD); r(8, 10, 4, 6, p.bodyD); }
    else               { r(2, 9, 4, 7, p.bodyD); r(8, 11, 4, 5, p.bodyD); }
    r(2, 10, 1, 6, p.bodyL);
    r(8, 10, 1, 6, p.bodyL);

    r(1, 4, 12, 7, f || p.body);
    r(1, 4, 12, 1, f || p.bodyL);
    r(1, 10, 12, 1, p.bodyD);

    r(3, 0, 8, 5, f || p.body);
    r(3, 0, 8, 1, f || p.bodyL);
    r(8, 1, 3, 3, p.eyeGlow);
    r(9, 1, 2, 3, p.eye);
    r(10, 1, 1, 1, '#ffffff');
    r(2, -1, 2, 2, p.bodyD);
    r(10, -1, 2, 2, p.bodyD);

    ctx.restore();
  }
}

// ---- 6.3 Turret 灰色炮台 ----
class Turret extends Enemy {
  constructor(x, y, palette) {
    palette = palette || {
      body: '#777', bodyL: '#aaa', bodyD: '#444',
      base: '#555', baseL: '#777',
      rivet: '#222', eye: '#ff0000',
      explode: ['#aaa', '#888', '#ffcc55'],
    };
    super(x, y, 18, 18, 2, 200, palette);
    this.fireCD = irnd(40, 90);
    this.turretAngle = 0;
  }
  update(player) {
    this.t++;
    const targetAngle = Math.atan2((player.y + player.h/2) - (this.y + 8), player.x - (this.x + this.w/2));
    this.turretAngle += (targetAngle - this.turretAngle) * 0.12;
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
    r(x, y + 12, this.w, 6, p.base);
    r(x, y + 12, this.w, 1, p.baseL);
    r(x + 2, y + 14, 2, 2, p.rivet);
    r(x + this.w - 4, y + 14, 2, 2, p.rivet);

    // 主体
    r(x + 4, y + 4, 10, 10, f || p.body);
    r(x + 4, y + 4, 10, 2, f || p.bodyL);
    r(x + 4, y + 4, 2, 10, f || p.bodyL);
    r(x + 4, y + 12, 10, 2, p.bodyD);
    r(x + 12, y + 4, 2, 10, p.bodyD);

    // 炮管
    ctx.save();
    ctx.translate((x + this.w / 2) * S, (y + 9) * S);
    ctx.rotate(this.turretAngle);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, -2 * S, 12 * S, 4 * S);
    ctx.fillStyle = '#555';
    ctx.fillRect(0, -2 * S, 12 * S, S);
    ctx.fillStyle = '#222';
    ctx.fillRect(10 * S, -3 * S, 2 * S, 6 * S);
    ctx.restore();

    // 红眼
    r(x + 8, y + 8, 2, 2, p.eye);
    r(x + 8, y + 8, 1, 1, '#ffcc88');

    // 阴影
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(x * S, (y + 18) * S, this.w * S, S);
    ctx.globalAlpha = 1;
  }
}

// ---- 6.4 Flyer 飞行器 ----
class Flyer extends Enemy {
  constructor(x, y, palette) {
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
    if (this.dir > 0) { ctx.translate((x + this.w) * S, y * S); ctx.scale(-1, 1); }
    else { ctx.translate(x * S, y * S); }

    // 翅膀
    if (wingUp) {
      r(-1, 0, 4, 4, f || p.wing);
      r(17, 0, 4, 4, f || p.wing);
      r(0, -2, 2, 4, f || p.wing);
      r(18, -2, 2, 4, f || p.wing);
    } else {
      r(-1, 4, 4, 4, f || p.wing);
      r(17, 4, 4, 4, f || p.wing);
      r(0, 6, 2, 4, f || p.wing);
      r(18, 6, 2, 4, f || p.wing);
    }

    // 主体
    r(4, 4, 12, 10, f || p.body);
    r(4, 4, 12, 1, f || p.bodyL);
    r(4, 4, 1, 10, f || p.bodyL);
    r(4, 13, 12, 1, p.bodyD);
    r(15, 4, 1, 10, p.bodyD);

    // 眼
    r(12, 6, 2, 4, '#000');
    r(12, 7, 2, 2, f || p.eye);
    r(13, 7, 1, 1, '#ffffff');

    // 尾
    r(0, 8, 4, 4, p.bodyD);

    ctx.restore();
  }
}

// ============================================================
// 7.  Boss 基类与三个关底
// ============================================================
class BossBase extends Enemy {
  constructor(x, y, w, h, hp, score, palette) {
    super(x, y, w, h, hp, score, palette);
    this.baseY = y;
    this.t = 0;
    this.fireCD = 30;
    this.phase = 0;
    this.collidesPlatforms = false;
    this.dir = -1;
    this.hurtFlash = 0;
  }
  hit(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flashT = 4;
    this.hurtFlash = 6;
    spark(this.x + this.w / 2, this.y + this.h / 2, 8, '#ffd84d');
    explode(this.x + this.w / 2, this.y + this.h / 2, ['#ffd84d', '#ff8a3a', '#ffffff'], 6, 0.6);
    Sound.hit();
    Game.camera.addShake(3);
    if (this.hp <= 0) {
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
    r(hpx - 2, hpy - 2, hpw + 4, 8, '#000');
    r(hpx - 1, hpy - 1, hpw + 2, 6, '#fff');
    r(hpx, hpy, hpw, 4, '#330');
    const ratio = Math.max(0, this.hp / this.maxHp);
    const c = this.phase === 2 ? '#ff00ff' : (this.phase === 1 ? '#ff4040' : '#ff8a3a');
    r(hpx, hpy, hpw * ratio, 4, c);
    r(hpx, hpy, hpw * ratio, 1, 'rgba(255,255,255,0.4)');
  }
}

// ---- 7.1 Boss 1:  丛林 Wall Boss (NES Contra 原作风) ----
class BossJungle extends BossBase {
  constructor(x, y) {
    super(x, y, 160, 100, 120, 5000, {
      wall: '#5a3a1a', wallL: '#8a5a3a', wallD: '#3a1a0a',
      brick: '#aa6633', brickL: '#cc8855', brickD: '#663311',
      cannon: '#222', cannonL: '#555',
      core: '#ff4040', coreL: '#ff8855',
      gun: '#333', gunL: '#666',
      explode: ['#ff8a3a', '#ffd84d', '#ff4040', '#ffffff'],
    });
  }
  update(player) {
    this.t++;
    this.bodyPulse = Math.sin(this.t * 0.1) * 2;
    this.y = this.baseY + Math.sin(this.t * 0.04) * 4;
    this.dir = player.x >= this.x ? 1 : -1;
    this.fireCD--;
    if (this.fireCD <= 0) {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      const dx = player.x - cx, dy = (player.y + player.h / 2) - cy;
      const N = this.phase === 0 ? 5 : 8;
      const spread = 0.4;
      for (let i = 0; i < N; i++) {
        const a = Math.atan2(dy, dx) + (i - (N - 1) / 2) * spread;
        Game.bullets.push(new Bullet(cx, cy, Math.cos(a) * 3.2, Math.sin(a) * 3.2, false, 'default'));
      }
      muzzleFlash(cx, cy, 1, '#ff6666');
      this.fireCD = this.phase === 0 ? 60 : 35;
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
    ctx.fillRect((x + 20) * S, (y + this.h) * S, (this.w - 40) * S, 2 * S);
    ctx.globalAlpha = 1;

    // 石墙主体
    r(x, y, this.w, this.h, f || p.wall);
    r(x, y, this.w, 2, p.wallL);
    r(x, y, 2, this.h, p.wallL);
    r(x + this.w - 2, y, 2, this.h, p.wallD);
    r(x, y + this.h - 2, this.w, 2, p.wallD);

    // 砖块纹理
    for (let by = 0; by < this.h; by += 12) {
      for (let bx = 0; bx < this.w; bx += 16) {
        const offset = (by / 12) % 2 === 0 ? 0 : 8;
        r(x + offset + bx, y + by, 14, 10, 'rgba(0,0,0,0.18)');
        r(x + offset + bx, y + by, 14, 1, f || p.brickL);
      }
    }

    // 多个炮口 (上下两层)
    const cannonY1 = y + 18, cannonY2 = y + 60;
    const cannonXs = [x + 18, x + 60, x + this.w - 78, x + this.w - 36];
    for (const cx of cannonXs) {
      r(cx - 8, cannonY1 - 4, 16, 14, p.cannon);
      r(cx - 8, cannonY1 - 4, 16, 2, p.cannonL);
      // 炮管朝向玩家
      const gunLen = 14;
      const gx = this.dir > 0 ? cx + 6 : cx - 6 - gunLen;
      r(gx, cannonY1 + 1, gunLen, 5, p.cannon);
      r(gx, cannonY1 + 1, gunLen, 1, p.cannonL);

      r(cx - 8, cannonY2 - 4, 16, 14, p.cannon);
      r(cx - 8, cannonY2 - 4, 16, 2, p.cannonL);
      const gx2 = this.dir > 0 ? cx + 6 : cx - 6 - gunLen;
      r(gx2, cannonY2 + 1, gunLen, 5, p.cannon);
      r(gx2, cannonY2 + 1, gunLen, 1, p.cannonL);
    }

    // 中央红色弱点击破点 (经典 Wall Boss 特征)
    const pulse = Math.sin(this.t * 0.15) * 1;
    const coreX = x + this.w / 2 - 16, coreY = y + 32 + pulse;
    r(coreX - 4, coreY - 4, 40, 32, '#1a0a0a');
    r(coreX, coreY, 32, 24, this.phase === 1 ? '#ff4040' : p.core);
    r(coreX, coreY, 32, 3, p.coreL);
    r(coreX + 8, coreY + 8, 16, 8, '#ffffff');
    r(coreX + 12, coreY + 10, 8, 4, '#000');
    if (this.t % 4 < 2) {
      ctx.globalAlpha = 0.4;
      r(coreX - 6, coreY - 6, 44, 36, this.phase === 1 ? '#ff4040' : p.core);
      ctx.globalAlpha = 1;
    }

    // 顶部怪兽装饰 + 触角
    r(x + 8, y - 6, 8, 8, '#3a1a0a');
    r(x + this.w - 16, y - 6, 8, 8, '#3a1a0a');
    r(x + 10, y - 4, 2, 2, '#ff0000');
    r(x + this.w - 12, y - 4, 2, 2, '#ff0000');

    if (this.hurtFlash > 0) {
      ctx.globalAlpha = 0.4;
      r(x, y, this.w, this.h, '#ffffff');
      ctx.globalAlpha = 1;
      this.hurtFlash--;
    }

    this.drawHpBar();
  }
}

// ---- 7.2 Boss 2:  冰雪机甲 ----
class BossIce extends BossBase {
  constructor(x, y) {
    super(x, y, 140, 110, 140, 3000, {
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
      const angles = this.phase === 0 ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.7, -0.4, -0.2, 0, 0.2, 0.4, 0.7];
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

    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect((x + 20) * S, (y + this.h) * S, (this.w - 40) * S, 2 * S);
    ctx.globalAlpha = 1;

    r(x + 4, y + 8, this.w - 8, this.h - 8, p.shell);
    r(x + 8, y + 12, this.w - 16, this.h - 18, f || p.armor);
    r(x + 8, y + 12, this.w - 16, 2, p.armorL);
    r(x + 8, y + this.h - 6, this.w - 16, 2, p.armorD);

    // 侧装甲
    r(x + 6, y + 24, 8, 40, p.shell);
    r(x + this.w - 14, y + 24, 8, 40, p.shell);
    r(x + 6, y + 24, 8, 2, p.armorL);
    r(x + this.w - 14, y + 24, 8, 2, p.armorL);

    // 头
    r(x + 38, y + 4, this.w - 76, 20, '#ffffff');
    r(x + 38, y + 4, this.w - 76, 2, p.armor);
    r(x + 46, y + 10, this.w - 92, 10, '#000');
    r(x + 48, y + 12, this.w - 96, 6, '#ff0000');
    r(x + 50, y + 13, this.w - 100, 4, '#ffff00');
    r(x + 56, y - 4, 2, 8, p.shell);
    r(x + this.w - 58, y - 4, 2, 8, p.shell);
    const lampOn = Math.floor(this.t / 8) % 2;
    r(x + 54, y - 6, 6, 4, lampOn ? '#00ffff' : '#006688');
    r(x + this.w - 60, y - 6, 6, 4, lampOn ? '#00ffff' : '#006688');

    // 炮管
    const gunX = this.dir > 0 ? x + this.w - 20 : x - 20;
    r(gunX, y + 38, 22, 10, p.cannon);
    r(gunX, y + 38, 22, 2, '#3a5a8a');

    // 核心
    const coreColor = this.phase === 1 ? '#ff4040' : p.core;
    r(x + 46, y + 40 + this.bodyPulse, 40, 24, coreColor);
    r(x + 46, y + 40 + this.bodyPulse, 40, 2, p.coreL);
    r(x + 60, y + 48 + this.bodyPulse, 12, 8, '#ffffff');
    if (this.t % 4 < 2) {
      ctx.globalAlpha = 0.4;
      r(x + 42, y + 36 + this.bodyPulse, 48, 32, coreColor);
      ctx.globalAlpha = 1;
    }

    // 冰晶
    r(x + 12, y + this.h - 10, 6, 12, '#ffffff');
    r(x + 14, y + this.h - 4, 2, 4, '#88aacc');
    r(x + this.w - 18, y + this.h - 10, 6, 12, '#ffffff');
    r(x + this.w - 16, y + this.h - 4, 2, 4, '#88aacc');

    if (this.hurtFlash > 0) {
      ctx.globalAlpha = 0.4;
      r(x, y, this.w, this.h, '#ffffff');
      ctx.globalAlpha = 1;
      this.hurtFlash--;
    }

    this.drawHpBar();
  }
}

// ---- 7.3 Boss 3:  异形母体 ----
class BossAlien extends BossBase {
  constructor(x, y) {
    super(x, y, 170, 120, 200, 10000, {
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
      const N = this.phase === 2 ? 14 : (this.phase === 1 ? 9 : 5);
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

    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect((x + 30) * S, (y + this.h) * S, (this.w - 60) * S, 2 * S);
    ctx.globalAlpha = 1;

    r(x + 4, y + 8, this.w - 8, this.h - 8, p.shell);
    r(x + 8, y + 12, this.w - 16, this.h - 18, f || p.armor);
    r(x + 8, y + 12, this.w - 16, 2, p.armorL);
    r(x + 8, y + this.h - 6, this.w - 16, 2, p.armorD);

    const tw = Math.sin(this.t * 0.1) * 2;
    r(x + 6, y + this.h / 2 - 4, 4, 12 + tw, p.tentacle);
    r(x + this.w - 10, y + this.h / 2 - 4, 4, 12 + tw, p.tentacle);
    r(x + 6, y + this.h / 2 - 4, 1, 12 + tw, '#ffffff');
    r(x + this.w - 10, y + this.h / 2 - 4, 1, 12 + tw, '#ffffff');

    r(x + 20, y + 4, 4, 12 + Math.sin(this.t * 0.15) * 3, p.tentacle);
    r(x + this.w - 24, y + 4, 4, 12 + Math.sin(this.t * 0.15 + 2) * 3, p.tentacle);
    r(x + 20, y + 4, 2, 12 + Math.sin(this.t * 0.15) * 3, '#ff5be0');
    r(x + this.w - 24, y + 4, 2, 12 + Math.sin(this.t * 0.15 + 2) * 3, '#ff5be0');

    const cores = this.phase === 2 ? 3 : (this.phase === 1 ? 2 : 1);
    const coreW = 40, gap = 6;
    const totalW = cores * coreW + (cores - 1) * gap;
    const sx = x + (this.w - totalW) / 2;
    const pulse = Math.sin(this.t * 0.2) * 2;
    for (let i = 0; i < cores; i++) {
      const cx = sx + i * (coreW + gap);
      const cy = y + 32 + pulse;
      r(cx - 2, cy - 2, coreW + 4, 28, '#1a0a2a');
      r(cx, cy, coreW, 24, this.phase === 2 ? '#ff00ff' : p.core);
      r(cx, cy, coreW, 3, p.coreL);
      r(cx + 10, cy + 8, 20, 10, '#ffffff');
      r(cx + 16, cy + 11, 8, 4, '#000');
      r(cx + 18, cy + 12, 3, 2, '#ffffff');
      if (this.t % 30 < 15) r(cx + 12, cy + 8, 16, 10, '#000');
      if (this.t % 4 < 2) {
        ctx.globalAlpha = 0.5;
        r(cx - 2, cy - 2, coreW + 4, 28, this.phase === 2 ? '#ff00ff' : p.core);
        ctx.globalAlpha = 1;
      }
    }

    // 牙齿
    for (let i = 0; i < 12; i++) {
      r(x + 14 + i * 13, y + this.h - 14, 10, 6, '#ffffff');
      r(x + 14 + i * 13, y + this.h - 14, 10, 1, '#cccccc');
    }
    r(x + 16, y + this.h - 8, this.w - 32, 2, '#ff5577');

    if (this.hurtFlash > 0) {
      ctx.globalAlpha = 0.4;
      r(x, y, this.w, this.h, '#ffffff');
      ctx.globalAlpha = 1;
      this.hurtFlash--;
    }

    this.drawHpBar();
  }
}

// ============================================================
// 8.  玩家 (NES Contra Bill Rizer: 橙色头发 + 蓝军装 + 红围巾)
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
    this.hp = 3; this.maxHp = 3;
    this.t = 0; this.alive = true; this.deathT = 0;
    this.invuln = 60;
    this.firing = false;
    this.runFrame = 0;
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
    if (flip) { ctx.translate((x + this.w) * S, y * S); ctx.scale(-1, 1); }
    else { ctx.translate(x * S, y * S); }

    // 阴影
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(2 * S, 22 * S, 12 * S, 1 * S);
    ctx.globalAlpha = 1;

    // === 腿 (4 帧) ===
    const wf = Math.floor(this.runFrame) % 4;
    let legA = 0, legB = 0;
    if (wf === 1) { legA = -1; legB = 1; }
    else if (wf === 3) { legA = 1; legB = -1; }

    r(3, 14 + legA, 4, 5, '#0a2a6a');
    r(9, 14 + legB, 4, 5, '#0a2a6a');
    r(3, 14 + legA, 1, 5, '#1f5fc4');
    r(9, 14 + legB, 1, 5, '#1f5fc4');
    r(2, 19 + legA, 5, 2, '#1a0a00');
    r(9, 19 + legB, 5, 2, '#1a0a00');
    r(2, 19 + legA, 5, 1, '#4a2a1a');
    r(9, 19 + legB, 5, 1, '#4a2a1a');

    // === 身体 (原版特征: 赤裸上身 + 蓝色裤子) ===
    r(2, 5, 12, 10, '#e8a860');      // 古铜色躯干
    r(2, 5, 12, 1, '#ffd6a0');       // 高光
    r(2, 5, 1, 10, '#ffd6a0');
    r(13, 5, 1, 10, '#a86030');      // 暗部
    r(2, 14, 12, 1, '#a86030');
    // 胸肌 / 腹肌阴影
    r(4, 9, 8, 1, '#a86030');
    r(5, 12, 6, 1, '#c07840');
    // 肩
    r(1, 4, 3, 4, '#e8a860');
    r(12, 4, 3, 4, '#e8a860');
    r(1, 4, 3, 1, '#ffd6a0');
    r(12, 4, 3, 1, '#ffd6a0');

    // 白腰带
    r(2, 12, 12, 2, '#888888');
    r(2, 12, 12, 1, '#ffffff');
    r(3, 12, 2, 1, '#ffffff');

    // 武器颜色条
    if (this.fireMode !== W.default) {
      r(2, 9, 12, 1, WPN_COLOR[this.fireMode]);
    }

    // === 头部: 棕色头发 (原版 Bill Rizer 特征) ===
    // 头发
    r(2, -2, 12, 4, '#8a4a18');
    r(2, -2, 12, 1, '#c07830');
    r(2, 1, 12, 1, '#5a2a08');
    // 脸
    r(3, 2, 10, 4, '#ffd6a0');
    r(3, 5, 10, 1, '#c08850');
    // 眼
    r(8, 3, 2, 1, '#000');
    r(11, 3, 2, 1, '#000');
    r(9, 3, 1, 1, '#ffffff');
    r(12, 3, 1, 1, '#ffffff');
    // 嘴
    r(8, 6, 4, 1, '#a04020');

    // === 武器 + 手臂 (根据 aimY) ===
    if (this.aimY === -1) {
      r(5, 2, 3, 4, '#ffd6a0');
      r(5, 2, 1, 4, '#c08850');
      r(7, -1, 2, 8, '#444');
      r(7, -1, 2, 1, '#888');
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        r(6, -5, 5, 5, WPN_MUZZLE[this.fireMode] || '#ffd84d');
        r(7, -4, 3, 3, '#ffffff');
      }
    } else if (this.aimY === 1 && this.onGround) {
      r(7, 10, 6, 2, '#ffd6a0');
      r(11, 9, 8, 4, '#444');
      r(11, 9, 8, 1, '#888');
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        r(18, 9, 5, 4, WPN_MUZZLE[this.fireMode] || '#ffd84d');
        r(19, 10, 3, 2, '#ffffff');
      }
    } else {
      r(7, 6, 4, 3, '#ffd6a0');
      r(7, 6, 1, 3, '#c08850');
      r(10, 7, 8, 4, '#444');
      r(10, 7, 8, 1, '#888');
      r(16, 7, 2, 4, '#222');
      if (this.fireCD > (FIRE_COOLDOWN[this.fireMode] ?? 10) - 4) {
        r(17, 7, 5, 4, WPN_MUZZLE[this.fireMode] || '#ffd84d');
        r(18, 8, 3, 2, '#ffffff');
      }
    }

    ctx.restore();
  }
}

// ============================================================
// 9.  关卡定义
// ============================================================
const STAGES = [
  {
    name: '热带丛林', subtitle: 'JUNGLE — STAGE 1',
    width: 4096, groundY: GH - 40,
    sky1: '#050508', sky2: '#0d0d16',
    mountain1: '#101018', mountain2: '#1a1a26',
    tree: '#00a800', treeLight: '#58d858',
    ground: '#e0a848', dirt: '#a86818', grass: '#58d858',
    platformColor: '#c08038', platformTop: '#58d858', platformAccent: '#7a4810',
    bgParticles: 'dust',
    hasWaterfall: true,
    palettes: { grunt: null, runner: null, turret: null, flyer: null },
    platforms: [
      new Platform(360,  GH - 90,  96, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(560,  GH - 130, 80, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(720,  GH - 90,  80, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(960,  GH - 120, 96, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(1180, GH - 160, 80, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(1380, GH - 100, 100, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(1580, GH - 160, 80, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(1780, GH - 100, 96, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(2000, GH - 140, 120, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(2200, GH - 90,  80, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(2400, GH - 150, 96, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(2620, GH - 100, 80, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(2840, GH - 170, 100, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(3060, GH - 110, 100, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(3260, GH - 170, 80, 12, '#c08038', '#58d858', '#7a4810'),
      new Platform(3460, GH - 100, 120, 12, '#c08038', '#58d858', '#7a4810'),
    ],
    BossClass: BossJungle,
    spawnPattern: [['grunt', 6], ['runner', 3], ['flyer', 3], ['turret', 2]],
  },
  {
    name: '冰雪基地', subtitle: 'ICE BASE — STAGE 2',
    width: 4096, groundY: GH - 40,
    sky1: '#2a5a9a', sky2: '#86b8e8',
    mountain1: '#5a8ac8', mountain2: '#8ab4e4',
    tree: '#dceaff', treeLight: '#ffffff',
    ground: '#dceaff', dirt: '#a8c4e0', grass: '#ffffff',
    platformColor: '#aac8ff', platformTop: '#ffffff', platformAccent: '#88aacc',
    bgParticles: 'snow',
    hasWaterfall: false,
    waterColor: '#1a6ac8', waterLight: '#78c8ff',
    palettes: {
      grunt: { beret:'#5a6aaa', beretL:'#7a8aaa', beretD:'#3a4a7a', skin:'#e0eaff', skinD:'#88aacc', body:'#3a4a7a', bodyL:'#5a6a9a', bodyD:'#1a2a4a', pants:'#1a2a4a', pantsL:'#3a4a7a', boots:'#0a1a3a', gun:'#222', gunL:'#444', belt:'#88aacc', explode:['#aac8ff','#ffffff','#88aaff'] },
      runner: { body:'#5a6aaa', bodyL:'#7a8aaa', bodyD:'#3a4a7a', eye:'#00ffff', eyeGlow:'#88ffff', explode:['#aac8ff','#ffffff'] },
      turret: { body:'#8888cc', bodyL:'#aaaaff', bodyD:'#5a5a8a', base:'#3a3a6a', baseL:'#5a5a8a', rivet:'#222', eye:'#ff0000', explode:['#aaaaff','#ffffff','#aac8ff'] },
      flyer:  { body:'#88aaff', bodyL:'#aaccff', bodyD:'#5a7aaa', wing:'#3a5a8a', wingL:'#5a7aaa', eye:'#fff', pupil:'#000', explode:['#aaccff','#ffffff'] },
    },
    platforms: [
      new Platform(280,  GH - 90,  96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(460,  GH - 130, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(620,  GH - 90,  64, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(820,  GH - 140, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1020, GH - 100, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1200, GH - 170, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1380, GH - 110, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1600, GH - 160, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(1800, GH - 100, 96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2000, GH - 150, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2200, GH - 90,  80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2380, GH - 130, 96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2580, GH - 100, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(2800, GH - 170, 100, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(3020, GH - 110, 80, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(3220, GH - 150, 96, 12, '#aac8ff', '#ffffff', '#88aacc'),
      new Platform(3440, GH - 100, 120, 12, '#aac8ff', '#ffffff', '#88aacc'),
    ],
    BossClass: BossIce,
    spawnPattern: [['grunt', 5], ['runner', 4], ['flyer', 4], ['turret', 3]],
  },
  {
    name: '异形要塞', subtitle: 'ALIEN HIVE — STAGE 3',
    width: 4096, groundY: GH - 40,
    sky1: '#3a0a5a', sky2: '#8a2a9a',
    mountain1: '#5a2a6a', mountain2: '#8a3a9a',
    tree: '#c85aff', treeLight: '#ff8af0',
    ground: '#5a2a6a', dirt: '#8a3a9a', grass: '#c85aff',
    platformColor: '#4a1a6a', platformTop: '#aa3aff', platformAccent: '#2a0a4a',
    bgParticles: 'ember',
    hasWaterfall: false,
    waterColor: '#c81a2a', waterLight: '#ff8a3a',
    palettes: {
      grunt: { beret:'#aa2a7a', beretL:'#cc4a9a', beretD:'#7a1a4a', skin:'#ff88cc', skinD:'#aa2a7a', body:'#7a2a4a', bodyL:'#aa4a7a', bodyD:'#4a0a2a', pants:'#3a1a4a', pantsL:'#5a2a6a', boots:'#1a0a2a', gun:'#222', gunL:'#444', belt:'#cc66ff', explode:['#ff5be0','#aa3aff','#ffffff'] },
      runner: { body:'#aa2a7a', bodyL:'#cc4a9a', bodyD:'#7a1a4a', eye:'#ff00ff', eyeGlow:'#ff88ff', explode:['#ff5be0','#aa3aff'] },
      turret: { body:'#aa3aff', bodyL:'#cc66ff', bodyD:'#7a1aaa', base:'#5a1a7a', baseL:'#7a2aaa', rivet:'#1a0a2a', eye:'#ff0000', explode:['#ff5be0','#aa3aff','#ffffff'] },
      flyer:  { body:'#ff5be0', bodyL:'#ff88cc', bodyD:'#aa2a7a', wing:'#aa2a7a', wingL:'#cc4a9a', eye:'#fff', pupil:'#000', explode:['#ff88cc','#aa3aff','#ffffff'] },
    },
    platforms: [
      new Platform(320,  GH - 100, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(520,  GH - 160, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(680,  GH - 100, 64, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(880,  GH - 130, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1080, GH - 170, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1260, GH - 100, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1460, GH - 150, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1660, GH - 100, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(1880, GH - 140, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2080, GH - 90,  80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2260, GH - 130, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2480, GH - 100, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2680, GH - 170, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(2900, GH - 110, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(3100, GH - 160, 80, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(3300, GH - 100, 100, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
      new Platform(3500, GH - 140, 96, 12, '#4a1a6a', '#aa3aff', '#2a0a4a'),
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
    this.bossX = this.width - 240;
    this.bgParticles = [];
    this.initBgParticles();
    this.generateSpawns();
  }
  initBgParticles() {
    this.bgParticles = [];
    const kind = this.def.bgParticles;
    for (let i = 0; i < 50; i++) {
      if (kind === 'snow') {
        this.bgParticles.push({ x:rnd(0, GW), y:rnd(0, GH), vx:rnd(-0.3,-0.1), vy:rnd(0.3,1.0), size:irnd(1,3), color:'#ffffff', alpha:rnd(0.5,1.0) });
      } else if (kind === 'ember') {
        this.bgParticles.push({ x:rnd(0, GW), y:rnd(0, GH), vx:rnd(-0.4,0.4), vy:rnd(-1.0,-0.3), size:irnd(1,2), color:pick(['#ff5be0','#aa3aff','#ff88cc']), alpha:rnd(0.4,0.9) });
      } else {
        this.bgParticles.push({ x:rnd(0, GW), y:rnd(0, GH), vx:rnd(-0.2,0.2), vy:rnd(0,0.2), size:irnd(1,2), color:'#a08868', alpha:rnd(0.2,0.4) });
      }
    }
  }
  updateBgParticles() {
    for (const p of this.bgParticles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = GW; if (p.x > GW) p.x = 0;
      if (p.y > GH) { p.y = 0; p.x = rnd(0, GW); }
      if (p.y < 0) { p.y = GH; p.x = rnd(0, GW); }
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
      if (sp.x < Game.camera.x + GW + 40) {
        const cls = { grunt: Grunt, runner: Runner, turret: Turret, flyer: Flyer }[sp.type];
        const e = new cls(sp.x, sp.y, this.def.palettes[sp.type]);
        e.dir = -1;
        Game.enemies.push(e);
        sp.x = -9999;
      }
    }
    if (!this.bossSpawned && player.x > this.width - 600) {
      this.bossSpawned = true;
      const b = new this.def.BossClass(this.bossX, this.ground - 110);
      Game.enemies.push(b);
      Game.camera.addShake(8);
      Game.camera.addFlash(20, '#ffffff');
      Sound.boss();
      flash('⚠ BOSS ⚠', 100);
    }
  }
}

// ============================================================
// 11. 主游戏
// ============================================================
const flashQueue = [];
function flash(text, frames = 80) { flashQueue.push({ text, t: frames }); }
function setOverlay(state) {
  const ov = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const text  = document.getElementById('overlay-text');
  if (!ov) return;
  if (state === 'hidden') { ov.classList.add('hidden'); return; }
  ov.classList.remove('hidden');
  if (state === 'menu')         { title.textContent = '魂斗罗'; text.innerHTML  = '按 ENTER 开始'; }
  else if (state === 'over')    { title.textContent = 'GAME OVER'; text.innerHTML  = `分数 ${Game.score} · 按 ENTER 重开`; }
  else if (state === 'complete'){ title.textContent = '全部通关!'; text.innerHTML  = `最终分数 ${Game.score} · ENTER 重玩`; }
  else if (state === 'paused')  { title.textContent = 'PAUSE'; text.innerHTML  = '按 P 继续 · R 重开'; }
}

const Game = {
  state: 'menu', stateTimer: 0,
  score: 0,
  highScore: Number(localStorage.getItem('contra_hs') || 0),
  lives: 3, stageIdx: 0,
  player: null, levelObj: null,
  camera: new Camera(),
  bullets: [], enemies: [], particles: [], powerups: [],
  platforms: [],
  groundY() { return this.levelObj ? this.levelObj.ground : GH - 40; },
  levelW()  { return this.levelObj ? this.levelObj.width : GW; },

  start() {
    this.state = 'playing';
    this.score = 0; this.lives = 3; this.stageIdx = 0;
    this.loadStage(this.stageIdx);
    Sound.start();
    flash('STAGE 1 — 热带丛林', 120);
  },
  loadStage(idx) {
    this.bullets = []; this.enemies = []; this.particles = []; this.powerups = [];
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
      this.state = 'over'; this.stateTimer = 0;
      this.camera.addFlash(40, '#ff0000'); Sound.over();
    } else {
      this.player = new Player(Math.max(20, this.player ? this.player.x - 60 : 40), this.levelObj.ground - 22);
      this.player.invuln = 120;
    }
  },
  triggerWin() {
    if (this.stageIdx < STAGES.length - 1) {
      this.state = 'stage'; this.stateTimer = 200;
      this.addScore(2000); Sound.clear();
    } else {
      this.state = 'complete'; this.stateTimer = 0;
      this.addScore(10000); Sound.clear();
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
        this.particles.push(new Particle(rnd(0, GW), rnd(0, GH), rnd(-0.3, 0.3), rnd(-0.3, 0.3), 60,
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
          if (aabb(b, e)) { e.hit(b.damage); if (!b.pierce) b.dead = true; }
        }
      } else {
        if (this.player.alive && aabb(b, this.player)) { this.player.hit(); b.dead = true; }
      }
    }
    if (this.player.alive) {
      for (const e of this.enemies) {
        if (!e.dead && aabb(e, this.player)) { this.player.hit(); e.hit(99); break; }
      }
    }
    if (this.player.alive) {
      for (const p of this.powerups) {
        if (aabb(p, this.player)) {
          if (p.type === 'health') {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
            Sound.powerup(); flash('HP +1', 60);
          } else {
            this.player.setWeapon(p.type);
          }
          explode(p.x + p.w / 2, p.y + p.h / 2, ['#ffd84d', '#ff8a3a', '#ffffff'], 14, 1);
          p.dead = true;
        }
      }
    }
    this.camera.follow(this.player);
    if (this.player.x >= this.levelObj.width - 16 && !this.levelObj.bossSpawned) this.triggerWin();
  },

  render() {
    const def = this.levelObj ? this.levelObj.def : STAGES[0];
    if (this.state === 'menu')        setOverlay('menu');
    else if (this.state === 'playing' || this.state === 'stage') setOverlay('hidden');
    else if (this.state === 'paused') setOverlay('paused');
    else if (this.state === 'over')   setOverlay('over');
    else if (this.state === 'complete') setOverlay('complete');

    // 天空 (画布坐标)
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
      this.drawParallax(def);
      this.drawBgParticles(def);
      if (def.hasWaterfall) this.drawWaterfall();
      for (const p of this.platforms) p.draw();
      this.drawGround(def);
      for (const p of this.powerups) p.draw();
      for (const e of this.enemies) e.draw();
      for (const b of this.bullets) b.draw();
      if (this.player) this.player.draw();
      for (const p of this.particles) p.draw();
    });

    this.drawScreenFlash();
    this.drawHUD(def);

    if (this.state === 'stage') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#ffcc33';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STAGE CLEAR!', VW / 2, VH / 2 - 50);
      ctx.fillStyle = '#fff';
      ctx.font = '24px monospace';
      const next = STAGES[this.stageIdx + 1];
      if (next) {
        ctx.fillText('下一关: ' + next.name, VW / 2, VH / 2 + 10);
        ctx.fillStyle = '#aac8ff';
        ctx.fillText(next.subtitle, VW / 2, VH / 2 + 50);
      }
      ctx.fillStyle = '#ffd84d';
      ctx.fillText('分数 +2000', VW / 2, VH / 2 + 90);
    }
    if (this.state === 'paused') this.drawCenterText('PAUSE', '按 P 继续 · R 重开');
    if (this.state === 'over')   this.drawCenterText('GAME OVER', `分数 ${Game.score}  ·  按 ENTER 重开`);
    if (this.state === 'complete') this.drawCenterText('全部通关!', `最终分数 ${Game.score}  ·  ENTER 重玩`);

    if (flashQueue.length > 0) {
      const f = flashQueue[0];
      const a = Math.min(1, f.t / 18);
      ctx.fillStyle = `rgba(255,204,51,${a})`;
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, VW / 2, VH / 2 - 80);
      f.t--;
      if (f.t <= 0) flashQueue.shift();
    }

    this.drawPostFx();
  },

  drawPostFx() {
    // 保留极轻的扫描线做街机质感；去掉压暗画面的重暗角（原版是高对比、明亮的）
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = '#000';
    for (let y = 0; y < VH; y += 3) ctx.fillRect(0, y, VW, 1);
    ctx.globalAlpha = 1;
  },

  drawScreenFlash() {
    if (this.camera.flashT > 0) {
      const a = Math.min(0.4, this.camera.flashT / 30);
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
      r(p.x, p.y, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;
  },

  drawWaterfall() {
    // 经典丛林瀑布 (世界坐标, 固定在 Stage 1 起点附近 x=80)
    const t = performance.now() * 0.001;
    const wx = 80, wy = 0;            // 世界坐标
    const ww = 80, wh = GH - 40;
    // 岩石包围 (世界坐标, 用 r() 自动按 S 缩放)
    r(wx - 8, wy, 8, wh, '#4a4a58');
    r(wx + ww, wy, 8, wh, '#4a4a58');
    r(wx - 8, wy + wh - 16, ww + 16, 16, '#2a2a38');
    // 流水主体（原版是灰白色瀑布）
    for (let i = 0; i < 3; i++) {
      r(wx + i * 2, wy, ww - i * 4, wh, i % 2 === 0 ? '#b0b0c4' : '#dcdcec');
    }
    // 水花白线 (动画)
    ctx.globalAlpha = 0.7;
    for (let y = 0; y < wh; y += 4) {
      const xOff = Math.sin((y + t * 40) * 0.3) * 2;
      r(wx + 4 + xOff, y + (Math.sin(t * 4 + y * 0.3) > 0 ? 1 : 0), ww - 8, 1, '#ffffff');
    }
    ctx.globalAlpha = 1;
    // 顶部水雾粒子
    if (Math.random() < 0.4) {
      Game.particles.push(new Particle(wx + rnd(8, ww - 8), wy + 2,
        rnd(-0.3, 0.3), rnd(-1.5, -0.5), irnd(20, 40),
        pick(['#dcdcec', '#ffffff']), irnd(2, 4), 0.02, 'smoke'));
    }
  },

  drawTitle() {
    const t = performance.now() / 1000;
    const def = STAGES[0];
    // 背景：明亮丛林海报（不再是黑漆漆的远山）
    const skyG = ctx.createLinearGradient(0, 0, 0, VH);
    skyG.addColorStop(0, '#050508');
    skyG.addColorStop(0.55, '#0d1a12');
    skyG.addColorStop(1, '#0a1408');
    ctx.fillStyle = skyG;
    ctx.fillRect(0, 0, VW, VH);
    this.camera.apply(() => {
      this.drawJungleBg(120);
      this.drawGround(def);
    });
    // 压暗一层，保证标题可读
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.shadowColor = '#ffcc33';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 96px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTRA', VW / 2, 180);
    ctx.restore();
    ctx.fillStyle = '#ff5b3a';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('经典丛林 · JUNGLE', VW / 2, 220);

    // 角色剪影 (放大版)
    const px = GW / 2 - 22, py = GH - 170;   // 世界坐标（原为屏幕坐标，导致立绘被画到画布外）
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect((px - 4) * S, (py + 76) * S, 88 * S, 4 * S);
    ctx.globalAlpha = 1;
    // 腿
    r(px + 8, py + 56, 16, 20, '#0a2a6a');
    r(px + 36, py + 56, 16, 20, '#0a2a6a');
    r(px + 8, py + 56, 16, 4, '#1f5fc4');
    r(px + 36, py + 56, 16, 4, '#1f5fc4');
    r(px + 6, py + 72, 20, 6, '#1a0a00');
    r(px + 34, py + 72, 20, 6, '#1a0a00');
    // 身体（赤膊）
    r(px + 4, py + 24, 44, 36, '#e8a860');
    r(px + 4, py + 24, 44, 4, '#ffd6a0');
    r(px + 4, py + 24, 4, 36, '#ffd6a0');
    r(px + 44, py + 24, 4, 36, '#a86030');
    r(px + 0, py + 20, 12, 16, '#e8a860');
    r(px + 44, py + 20, 12, 16, '#e8a860');
    // 胸肌 / 腹肌
    r(px + 12, py + 34, 28, 3, '#a86030');
    r(px + 16, py + 44, 20, 3, '#c07840');
    // 腰带
    r(px + 4, py + 48, 44, 4, '#888888');
    r(px + 4, py + 48, 44, 2, '#ffffff');
    // 头
    r(px + 8, py + 4, 36, 18, '#ffd6a0');
    r(px + 8, py + 16, 36, 2, '#c08850');
    // 棕发
    r(px + 4, py - 4, 44, 14, '#8a4a18');
    r(px + 4, py - 4, 44, 4, '#c07830');
    r(px + 4, py + 8, 44, 2, '#5a2a08');
    // 眼
    r(px + 16, py + 10, 8, 4, '#000');
    r(px + 32, py + 10, 8, 4, '#000');
    r(px + 18, py + 11, 3, 2, '#fff');
    r(px + 34, py + 11, 3, 2, '#fff');
    // 嘴
    r(px + 18, py + 22, 16, 2, '#a04020');
    // 枪
    r(px + 48, py + 32, 36, 12, '#444');
    r(px + 48, py + 32, 36, 4, '#888');

    // 操作提示
    ctx.fillStyle = '#aac8ff';
    ctx.font = '20px monospace';
    ctx.fillText('↑↑↓↓←→←→BA = 30 LIVES', VW / 2, 400);

    if (this.highScore > 0) {
      ctx.fillStyle = '#ffcc33';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('HI  ' + String(this.highScore).padStart(6, '0'), VW / 2, 440);
    }

    const blink = Math.floor(t * 2) % 2;
    if (blink) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('PRESS ENTER TO START', VW / 2, VH - 110);
    }

    ctx.fillStyle = '#888';
    ctx.font = '18px monospace';
    ctx.fillText('3 STAGES  ·  3 BOSSES  ·  4 WEAPONS  ·  KONAMI CHEAT  ·  4K RENDER', VW / 2, VH - 60);
  },

  drawParallax(def) {
    const cx = Game.camera.x;
    if (this.stageIdx === 0) { this.drawJungleBg(cx); return; }
    // 远山
    for (let i = 0; i < 12; i++) {
      const h = 30 + Math.sin(i * 1.3 + cx * 0.001) * 8;
      const x = i * 90 - (cx * 0.3 % 90);
      r(x, GH - 60 - h, 90, GH, def.mountain1);
    }
    for (let i = 0; i < 14; i++) {
      const h = 20 + Math.sin(i * 1.1 + cx * 0.002) * 6;
      const x = i * 80 - (cx * 0.5 % 80);
      r(x, GH - 50 - h, 80, GH, def.mountain2);
    }
    // 树 / 装饰
    for (let i = 0; i < 16; i++) {
      const x = i * 70 - (cx * 0.7 % 70);
      if (this.stageIdx === 2) {
        r(x, GH - 70, 4, 30, def.tree);
        r(x + 4, GH - 80, 12, 6, def.treeLight);
        r(x + 6, GH - 78, 2, 2, '#ffffff');
      } else {
        r(x, GH - 70, 6, 30, def.tree);
        r(x - 6, GH - 80, 18, 12, def.tree);
        r(x - 6, GH - 80, 18, 2, def.treeLight);
      }
    }
  },

  // 原版丛林关标志性背景：顶部黑底灰白瀑布帘 + 翠绿棕榈树排 + 灌木丛
  drawJungleBg(cx) {
    const gy = this.groundY();
    const bandH = 58;
    // 顶部崖壁 + 瀑布帘（视差最慢）
    r(0, 0, GW, bandH, '#000000');
    for (let i = 0; i < 12; i++) {
      const x = i * 64 + (cx * 0.92) % 64;
      r(x + 2, 0, 15, bandH, '#2a2a38');
      r(x + 2, 0, 3, bandH, '#42425a');
      r(x + 49, 0, 15, bandH, '#2a2a38');
      r(x + 49, 0, 3, bandH, '#42425a');
      r(x + 17, 0, 30, bandH - 10, '#b0b0c4');
      r(x + 23, 0, 18, bandH - 4, '#dcdcec');
      r(x + 29, 0, 7, bandH, '#ffffff');
    }
    // 棕榈树排
    for (let i = 0; i < 20; i++) {
      const x = i * 58 + (cx * 0.55) % 58;
      const ty = gy - 30;
      r(x + 9, ty, 4, 30, '#7a4a10');
      r(x + 9, ty, 2, 30, '#c08a38');
      r(x - 3, ty - 11, 28, 7, '#00a800');
      r(x + 1, ty - 17, 18, 7, '#58d858');
      r(x - 7, ty - 5, 12, 5, '#00a800');
      r(x + 19, ty - 5, 12, 5, '#00a800');
      r(x + 7, ty - 19, 6, 4, '#7ae07a');
    }
    // 灌木丛排（最近的一层）
    for (let i = 0; i < 24; i++) {
      const x = i * 46 + (cx * 0.3) % 46;
      r(x, gy - 14, 16, 14, '#00a800');
      r(x + 4, gy - 19, 9, 7, '#58d858');
      r(x - 2, gy - 8, 22, 8, '#007800');
    }
  },

  drawGround(def) {
    const gy = this.groundY();
    const x0 = Math.floor(this.camera.x / 16) * 16 - 16;
    const x1 = x0 + GW + 48;
    const t = performance.now() * 0.002;
    // 岩壁主体
    r(x0, gy, x1 - x0, GH - gy, def.ground);
    // 块状岩石纹理
    ctx.globalAlpha = 0.45;
    for (let x = x0; x < x1; x += 16) {
      r(x + 1, gy + 9, 13, 7, def.dirt);
      r(x + 8, gy + 19, 13, 7, def.dirt);
    }
    ctx.globalAlpha = 1;
    // 明亮草沿
    for (let x = x0; x < x1; x += 8) {
      r(x, gy - 1, 6, 2, def.grass);
      r(x + 4, gy - 3, 4, 3, def.grass);
      r(x + 2, gy - 5, 2, 2, def.grass);
    }
    // 底部水面（原版丛林关的亮蓝水）
    const wy = GH - 11;
    r(x0, wy, x1 - x0, 11, def.waterColor || '#0058f8');
    ctx.globalAlpha = 0.8;
    for (let x = x0; x < x1; x += 12) {
      const off = Math.sin(t + x * 0.12) * 2;
      r(x + off, wy + 2, 6, 1, def.waterLight || '#58a8ff');
      r(x + 5 + off, wy + 6, 4, 1, '#ffffff');
    }
    ctx.globalAlpha = 1;
  },

  drawHUD(def) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, VW, 36);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, VH - 24, VW, 24);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('P' + (this.stageIdx + 1), 12, 10);

    for (let i = 0; i < this.player.hp; i++) {
      const x = 60 + i * 44;
      const pulse = Math.sin((this.t || 0) * 0.1 + i) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,85,119,${0.3 + pulse * 0.3})`;
      ctx.fillRect(x, 4, 40, 40);
      ctx.fillStyle = '#ff5577';
      ctx.fillRect(x + 4, 8, 14, 16);
      ctx.fillRect(x + 22, 8, 14, 16);
      ctx.fillRect(x, 14, 36, 14);
      ctx.fillRect(x + 4, 28, 28, 8);
      ctx.fillRect(x + 8, 36, 20, 4);
      ctx.fillStyle = '#ff88aa';
      ctx.fillRect(x + 6, 12, 4, 8);
      ctx.fillRect(x + 24, 12, 4, 8);
    }

    if (this.player.fireMode !== W.default && this.player.weaponTimer > 0) {
      const remain = (this.player.weaponTimer / 60).toFixed(1);
      ctx.fillStyle = 'rgba(255,216,77,0.2)';
      ctx.fillRect(240, 6, 200, 40);
      ctx.fillStyle = WPN_COLOR[this.player.fireMode];
      ctx.font = 'bold 28px monospace';
      ctx.fillText(WPN_LABEL[this.player.fireMode] + '  ' + remain + 's', 254, 12);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#aac8ff';
    ctx.font = '20px monospace';
    ctx.fillText('STAGE ' + (this.stageIdx + 1) + '/' + STAGES.length + '  ' + (def ? def.name : ''), VW / 2, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(String(this.score).padStart(6, '0'), VW / 2 + 1, 32);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(this.score).padStart(6, '0'), VW / 2, 30);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#4ab8ff';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('× ' + this.lives, VW - 12, 10);
    ctx.fillStyle = '#888';
    ctx.font = '18px monospace';
    ctx.fillText('HI ' + String(this.highScore).padStart(6, '0'), VW - 12, 36);

    // Boss 血条
    const boss = this.enemies.find(e => e instanceof BossBase && !e.dead);
    if (boss && this.state === 'playing') {
      const hpw = 400, hpx = (VW - hpw) / 2, hpy = 42;
      ctx.fillStyle = '#000';
      ctx.fillRect(hpx - 2, hpy - 2, hpw + 4, 14);
      ctx.fillStyle = '#fff';
      ctx.fillRect(hpx - 1, hpy - 1, hpw + 2, 12);
      ctx.fillStyle = '#330';
      ctx.fillRect(hpx, hpy, hpw, 8);
      const ratio = Math.max(0, boss.hp / boss.maxHp);
      const c = boss.phase === 2 ? '#ff00ff' : (boss.phase === 1 ? '#ff4040' : '#ff8a3a');
      ctx.fillStyle = c;
      ctx.fillRect(hpx, hpy, hpw * ratio, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(hpx, hpy, hpw * ratio, 2);
    }
  },

  drawCenterText(title, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, VH / 2 - 80, VW, 160);
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, VW / 2, VH / 2 - 16);
    ctx.fillStyle = '#fff';
    ctx.font = '24px monospace';
    ctx.fillText(sub, VW / 2, VH / 2 + 28);
  },
};

// ============================================================
// 12. 主循环
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