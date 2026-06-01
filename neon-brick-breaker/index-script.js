
"use strict";
const GW = 800, GH = 600;
const PADDLE_W = 110, PADDLE_H = 14;
const PADDLE_Y = GH - 50;
const BALL_R = 8;
const BRICK_W = 70, BRICK_H = 22;
const BRICK_GAP = 4;
const BRICK_OFFSET_X = (GW - (10 * BRICK_W + 9 * BRICK_GAP)) / 2;
const BRICK_OFFSET_Y = 90;
const POWERUP_DROP_CHANCE = 0.16;

const COLORS = {
  bgTop: "#0a0420", bgBot: "#150630",
  grid: "rgba(120, 90, 220, 0.07)",
  paddle: "#00f0ff", paddleGlow: "rgba(0, 240, 255, 0.55)",
  ball: "#ffffff", ballGlow: "rgba(0, 240, 255, 0.7)",
  rowColors: ["#ff5af7","#ff8b5a","#ffd86b","#9eff5a","#5af7c8","#5ab9ff","#7a5aff","#ff5ad1"],
  silver: ["#d0d6e0","#a9b0bd"],
  gold: ["#ffe27a","#ffae3b"],
  steel: ["#3a3a52","#22223a"]
};

const POWERUP_TYPES = [
  { id:"E", label:"扩", color:"#5af7c8", desc:"挡板变长" },
  { id:"S", label:"缩", color:"#ff5a5a", desc:"挡板变短" },
  { id:"M", label:"多", color:"#ffd86b", desc:"多球齐发" },
  { id:"B", label:"慢", color:"#5ab9ff", desc:"球速减半" },
  { id:"T", label:"穿", color:"#ff8bff", desc:"穿透弹" },
  { id:"L", label:"射", color:"#ff5a5a", desc:"激光炮" }
];

const LEVELS = [
  { name:"序章 · 第一关", pattern:[
    "..........",
    "..........",
    "1111111111",
    "1111111111",
    "1111111111",
    "1111111111",
    "1111111111",
    ".........."
  ]},
  { name:"三角阵", pattern:[
    "..........",
    "....11....",
    "...1111...",
    "..111111..",
    ".11111111.",
    "1111111111",
    "2222222222",
    ".........."
  ]},
  { name:"菱形之舞", pattern:[
    "..........",
    "....11....",
    "...1331...",
    "..122221..",
    "..122221..",
    "...1331...",
    "....11....",
    ".........."
  ]},
  { name:"霓虹心", pattern:[
    "..........",
    ".11...11..",
    "1111.1111.",
    "111211111.",
    ".12222221.",
    "..122221..",
    "...1221...",
    "....11...."
  ]},
  { name:"堡垒", pattern:[
    "..........",
    ".4444444..",
    ".4222224..",
    ".4211124..",
    ".4211124..",
    ".4211124..",
    ".4222224..",
    ".4444444.."
  ]},
  { name:"星星坠落", pattern:[
    "..........",
    "....33....",
    "...1331...",
    "..113311..",
    "1113333111",
    "..111111..",
    "..11..11..",
    ".11....11."
  ]},
  { name:"螺旋回廊", pattern:[
    "..........",
    "1111111...",
    "1......1..",
    "1.1111.1..",
    "1.1..1.1..",
    "1.1.11.1..",
    "1.1....1..",
    ".1111111.."
  ]},
  { name:"终章 · 终极挑战", pattern:[
    "..........",
    ".33333333.",
    "3222222223",
    "3211111123",
    "3211555123",
    "3211111123",
    "3222222223",
    ".33333333."
  ]}
];

const STORE_KEY = "neon-brick-breaker-v1";
const defaultStore = { bestScore:0, unlockedLevel:0, lastScore:0, sound:true, haptics:true, particles:true, highQuality:true };
function loadStore() {
  try { return Object.assign({}, defaultStore, JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); }
  catch { return { ...defaultStore }; }
}
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {} }
let store = loadStore();

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; } }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function beep(freq, dur, type, vol, slide) {
  if (!store.sound) return;
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type || "square"; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol || 0.08, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol, lp) {
  if (!store.sound) return;
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ac.createBufferSource(); src.buffer = buf;
  const filt = ac.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = lp || 1200;
  const g = ac.createGain(); g.gain.setValueAtTime(vol || 0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(ac.destination);
  src.start(t); src.stop(t + dur + 0.02);
}
const sfx = {
  hit:   () => beep(720, 0.05, "square", 0.06),
  brick: () => { beep(620, 0.05, "square", 0.05); setTimeout(() => beep(820, 0.06, "square", 0.05), 30); },
  metal: () => noiseBurst(0.1, 0.07, 600),
  power: () => { beep(660,0.07,"triangle",0.07); setTimeout(() => beep(880,0.07,"triangle",0.07), 70); setTimeout(() => beep(1320,0.1,"triangle",0.07), 140); },
  lose:  () => { beep(440,0.2,"sawtooth",0.07,-200); setTimeout(() => beep(220,0.3,"sawtooth",0.07,-120), 180); },
  win:   () => { [523,659,784,1046].forEach((f,i) => setTimeout(() => beep(f, 0.13, "triangle", 0.08), i * 90)); },
  shoot: () => beep(1500, 0.05, "square", 0.04, -800),
  combo: (n) => beep(700 + n * 40, 0.07, "triangle", 0.07),
  click: () => beep(900, 0.04, "square", 0.04)
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const wrap = document.getElementById("wrap");
let scale = 1;
function getDpr() {
  const native = Math.max(1, window.devicePixelRatio || 1);
  return store.highQuality === false ? Math.min(2, native) : native;
}
function resize() {
  const dpr = getDpr();
  const maxW = window.innerWidth - 24;
  const maxH = window.innerHeight - 24;
  scale = Math.min(maxW / GW, maxH / GH);
  // Canvas internal resolution matches actual device pixels (no browser upscaling)
  canvas.width = Math.floor(GW * scale * dpr);
  canvas.height = Math.floor(GH * scale * dpr);
  canvas.style.width = (GW * scale) + "px";
  canvas.style.height = (GH * scale) + "px";
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}
window.addEventListener("resize", resize); window.addEventListener("orientationchange", () => setTimeout(resize, 200)); resize();

const input = { mouseX: GW / 2, keys: new Set(), touchActive: false };
function clientToGame(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left) * (GW / r.width), y: (clientY - r.top) * (GH / r.height) };
}
canvas.addEventListener("mousemove", e => { input.mouseX = clientToGame(e.clientX, e.clientY).x; });
canvas.addEventListener("mousedown", e => {
  input.mouseX = clientToGame(e.clientX, e.clientY).x;
  if (state.mode === "playing" && !ballLaunched) launchBall();
});
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  const t = e.touches[0]; input.mouseX = clientToGame(t.clientX, t.clientY).x; input.touchActive = true;
  if (state.mode === "playing" && !ballLaunched) launchBall();
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  const t = e.touches[0]; input.mouseX = clientToGame(t.clientX, t.clientY).x;
}, { passive: false });
canvas.addEventListener("touchend", e => { e.preventDefault(); input.touchActive = false; }, { passive: false });
window.addEventListener("keydown", e => {
  input.keys.add(e.key);
  if (e.key === " " || e.key === "Enter") {
    if (state.mode === "menu") startGame();
    else if (state.mode === "playing" && !ballLaunched) launchBall();
    e.preventDefault();
  }
  if (e.key === "p" || e.key === "P" || e.key === "Escape") {
    if (state.mode === "playing") pauseGame();
    else if (state.mode === "paused") resumeGame();
  }
  if (e.key === "m" || e.key === "M") { store.sound = !store.sound; saveStore(); refreshSettingsUI(); }
  if (["ArrowLeft","ArrowRight","a","A","d","D"].includes(e.key)) e.preventDefault();
});
window.addEventListener("keyup", e => input.keys.delete(e.key));

const state = {
  mode: "menu",
  levelIndex: 0, score: 0, lives: 3,
  combo: 0, comboTimer: 0, shake: 0,
  slowTimer: 0, throughTimer: 0, laserTimer: 0, laserCooldown: 0,
  time: 0
};
let paddle, balls, bricks, particles, powerups, lasers, ballTrail;
let ballLaunched = false;
let bgParticles = [];
for (let i = 0; i < 40; i++) {
  bgParticles.push({
    x: Math.random() * GW, y: Math.random() * GH,
    r: Math.random() * 1.6 + 0.4,
    vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
    c: Math.random() < 0.5 ? "rgba(0, 240, 255," : "rgba(255, 90, 247,"
  });
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function vibrate(ms) { if (store.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch {} }

const toastEl = document.getElementById("toast");
let toastTimer = 0;
function toast(text, em) {
  toastEl.innerHTML = em ? `<span class="em">${em}</span> ${text}` : text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
}

function buildLevel(idx) {
  const lv = LEVELS[idx]; bricks = [];
  for (let r = 0; r < lv.pattern.length; r++) {
    for (let c = 0; c < lv.pattern[r].length; c++) {
      const ch = lv.pattern[r][c];
      if (ch === ".") continue;
      const x = BRICK_OFFSET_X + c * (BRICK_W + BRICK_GAP);
      const y = BRICK_OFFSET_Y + r * (BRICK_H + BRICK_GAP);
      let hits = 1, type = "normal", color = COLORS.rowColors[r % COLORS.rowColors.length];
      if (ch === "1") { hits = 1; }
      else if (ch === "2") { hits = 2; type = "strong"; color = null; }
      else if (ch === "3") { hits = 3; type = "tough"; color = null; }
      else if (ch === "4") { hits = Infinity; type = "steel"; color = null; }
      bricks.push({ x, y, w: BRICK_W, h: BRICK_H, hits, maxHits: hits, type, color, time: Math.random() * Math.PI * 2 });
    }
  }
}

function burst(x, y, color, n, speed, life, size) {
  if (!store.particles) return;
  n = n || 14;
  // Quality-aware particle count: lower density on non-HD for older GPUs
  if (store.highQuality === false) n = Math.max(1, Math.round(n * 0.6));
  speed = speed || 180; life = life || 0.7; size = size || 2.6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.4, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, maxLife: life, color, size: rand(size * 0.5, size) });
  }
}

function spawnPowerup(x, y) {
  if (Math.random() > POWERUP_DROP_CHANCE) return;
  const t = pick(POWERUP_TYPES);
  powerups.push({ x, y, w: 28, h: 28, vy: 110, type: t, alive: true, time: 0 });
}

function startGame() {
  state.levelIndex = store.unlockedLevel || 0;
  state.score = 0; state.lives = 3;
  state.combo = 0; state.comboTimer = 0;
  state.slowTimer = 0; state.throughTimer = 0; state.laserTimer = 0; state.laserCooldown = 0;
  state.shake = 0;
  beginLevel();
  state.mode = "playing";
  showOverlay(null);
  sfx.click();
}
function beginLevel() {
  paddle = { x: GW/2 - PADDLE_W/2, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H, baseW: PADDLE_W };
  balls = []; ballTrail = []; particles = []; powerups = []; lasers = [];
  ballLaunched = false;
  buildLevel(state.levelIndex);
  resetBallOnPaddle();
}
function resetBallOnPaddle() {
  balls = [{ x: paddle.x + paddle.w/2, y: paddle.y - BALL_R - 2, vx: 0, vy: 0, r: BALL_R, stuck: true }];
  ballTrail = [];
}
function launchBall() {
  if (!balls.length) return;
  const b = balls[0];
  b.stuck = false;
  const angle = rand(-Math.PI * 0.78, -Math.PI * 0.22);
  const speed = 380;
  b.vx = Math.cos(angle) * speed;
  b.vy = Math.sin(angle) * speed;
  ballLaunched = true;
  sfx.hit();
}
function pauseGame() { if (state.mode === "playing") { state.mode = "paused"; showOverlay("pauseMenu"); } }
function resumeGame() { state.mode = "playing"; showOverlay(null); sfx.click(); }
function quitToMenu() { state.mode = "menu"; showOverlay("mainMenu"); refreshMenuStats(); }
function nextLevel() {
  state.levelIndex++;
  if (state.levelIndex >= LEVELS.length) {
    state.levelIndex = LEVELS.length - 1; state.mode = "gameover"; finalizeGame(true); return;
  }
  store.unlockedLevel = Math.max(store.unlockedLevel, state.levelIndex);
  saveStore();
  beginLevel(); state.mode = "playing"; showOverlay(null);
}
function loseLife() {
  state.lives--; state.combo = 0; sfx.lose(); vibrate(120);
  if (state.lives <= 0) { state.mode = "gameover"; finalizeGame(false); }
  else { resetBallOnPaddle(); ballLaunched = false; state.shake = 12; }
}
function finalizeGame(victory) {
  if (state.score > store.bestScore) store.bestScore = state.score;
  store.lastScore = state.score; saveStore();
  document.getElementById("goTag").textContent = victory ? "YOU WIN" : "GAME OVER";
  document.getElementById("goTitle").textContent = victory ? "通关达成！" : "挑战结束";
  document.getElementById("goScore").textContent = state.score;
  document.getElementById("goLevel").textContent = (state.levelIndex + 1) + " / " + LEVELS.length;
  document.getElementById("goBest").textContent = store.bestScore;
  showOverlay("gameOver");
  if (victory) sfx.win(); else sfx.lose();
}
function levelClear() {
  const bonus = state.lives * 200 + (state.levelIndex + 1) * 100;
  state.score += bonus; state.combo = 0;
  if (state.score > store.bestScore) store.bestScore = state.score;
  store.unlockedLevel = Math.max(store.unlockedLevel, state.levelIndex + 1);
  saveStore();
  sfx.win(); vibrate(60); state.shake = 8;
  document.getElementById("lcTitle").textContent = `第 ${state.levelIndex + 1} 关 · ${LEVELS[state.levelIndex].name}`;
  document.getElementById("lcSub").textContent = state.levelIndex + 1 >= LEVELS.length ? "这是最后一关，准备好迎接终极挑战！" : "准备进入下一关";
  document.getElementById("lcScore").textContent = state.score;
  document.getElementById("lcBonus").textContent = "+" + bonus;
  document.getElementById("lcLives").textContent = state.lives;
  state.mode = "levelclear"; showOverlay("levelClear");
}

function update(dt) {
  state.time += dt;
  for (const p of bgParticles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < 0) p.x += GW; if (p.x > GW) p.x -= GW;
    if (p.y < 0) p.y += GH; if (p.y > GH) p.y -= GH;
  }
  if (state.mode !== "playing") return;

  state.shake = Math.max(0, state.shake - dt * 40);
  if (state.comboTimer > 0) { state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 0; }
  if (state.slowTimer > 0) state.slowTimer -= dt;
  if (state.throughTimer > 0) state.throughTimer -= dt;
  if (state.laserTimer > 0) state.laserTimer -= dt;
  if (state.laserCooldown > 0) state.laserCooldown -= dt;

  // Paddle movement
  let target = input.mouseX;
  if (input.keys.has("ArrowLeft") || input.keys.has("a") || input.keys.has("A")) target -= 220 * dt * 6;
  if (input.keys.has("ArrowRight") || input.keys.has("d") || input.keys.has("D")) target += 220 * dt * 6;
  const desiredX = clamp(target - paddle.w/2, 0, GW - paddle.w);
  paddle.x = paddle.x + (desiredX - paddle.x) * Math.min(1, dt * 18);

  // Trail
  for (const b of balls) ballTrail.push({ x: b.x, y: b.y, life: 0.18 });
  for (let i = ballTrail.length - 1; i >= 0; i--) { ballTrail[i].life -= dt; if (ballTrail[i].life <= 0) ballTrail.splice(i, 1); }

  // Lasers
  if (state.laserTimer > 0 && state.laserCooldown <= 0) {
    lasers.push({ x: paddle.x + 8, y: paddle.y - 8, w: 3, h: 14, vy: -620 });
    lasers.push({ x: paddle.x + paddle.w - 11, y: paddle.y - 8, w: 3, h: 14, vy: -620 });
    state.laserCooldown = 0.22; sfx.shoot();
  }
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.y += l.vy * dt;
    if (l.y + l.h < 0) { lasers.splice(i, 1); continue; }
    for (const bk of bricks) {
      if (bk.hits === Infinity) continue;
      if (rectsOverlap({ x: l.x, y: l.y, w: l.w, h: l.h }, bk)) {
        damageBrick(bk, l.x + l.w/2, l.y); lasers.splice(i, 1); break;
      }
    }
  }

  // Balls
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (b.stuck) { b.x = paddle.x + paddle.w/2; b.y = paddle.y - BALL_R - 2; continue; }
    const slowFactor = state.slowTimer > 0 ? 0.55 : 1;
    b.x += b.vx * dt * slowFactor; b.y += b.vy * dt * slowFactor;
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); sfx.hit(); }
    if (b.x + b.r > GW) { b.x = GW - b.r; b.vx = -Math.abs(b.vx); sfx.hit(); }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); sfx.hit(); }
    if (b.y - b.r > GH) { balls.splice(i, 1); continue; }
    // paddle
    const p = paddle;
    if (b.vy > 0 && b.x > p.x - b.r && b.x < p.x + p.w + b.r && b.y + b.r > p.y && b.y - b.r < p.y + p.h) {
      b.y = p.y - b.r - 0.1;
      const hit = (b.x - (p.x + p.w/2)) / (p.w/2);
      const speed = Math.min(620, Math.hypot(b.vx, b.vy) * 1.02 + 6);
      const angle = hit * (Math.PI * 0.34);
      b.vx = Math.sin(angle) * speed; b.vy = -Math.abs(Math.cos(angle) * speed);
      sfx.hit(); burst(b.x, p.y, COLORS.paddle, 6, 120, 0.4, 2);
    }
    // bricks
    for (const bk of bricks) {
      if (rectsOverlap({ x: b.x - b.r, y: b.y - b.r, w: b.r*2, h: b.r*2 }, bk)) {
        if (bk.hits === Infinity) {
          if (Math.abs(b.vx) > Math.abs(b.vy)) b.vx = -b.vx; else b.vy = -b.vy;
          sfx.metal(); break;
        }
        if (state.throughTimer > 0) { damageBrick(bk, b.x, b.y); break; }
        const prevX = b.x - b.vx * dt * slowFactor;
        const prevY = b.y - b.vy * dt * slowFactor;
        const fromLeft  = prevX + b.r <= bk.x;
        const fromRight = prevX - b.r >= bk.x + bk.w;
        const fromTop   = prevY + b.r <= bk.y;
        const fromBot   = prevY - b.r >= bk.y + bk.h;
        if (fromLeft || fromRight) b.vx = -b.vx;
        else if (fromTop || fromBot) b.vy = -b.vy;
        else b.vy = -b.vy;
        damageBrick(bk, b.x, b.y); break;
      }
    }
  }
  if (balls.length === 0) loseLife();

  // Power-ups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i]; p.time += dt; p.y += p.vy * dt;
    if (p.y > GH + 40) { powerups.splice(i, 1); continue; }
    const pad = paddle;
    if (p.x > pad.x - 6 && p.x < pad.x + pad.w + 6 && p.y + p.h*0.5 > pad.y && p.y < pad.y + pad.h + 18) {
      applyPowerup(p.type); burst(p.x, p.y, p.type.color, 18, 180, 0.6, 2.5);
      powerups.splice(i, 1); sfx.power(); continue;
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const pa = particles[i]; pa.life -= dt;
    if (pa.life <= 0) { particles.splice(i, 1); continue; }
    pa.x += pa.vx * dt; pa.y += pa.vy * dt;
    pa.vx *= 0.985; pa.vy *= 0.985; pa.vy += 60 * dt;
  }

  const destructible = bricks.filter(b => b.hits !== Infinity).length;
  if (destructible === 0) levelClear();
}

function damageBrick(bk, hx, hy) {
  if (bk.hits === Infinity) return;
  bk.hits--;
  state.combo++; state.comboTimer = 1.6;
  const mult = Math.min(8, 1 + Math.floor(state.combo / 5) * 0.5);
  const baseScore = bk.type === "tough" ? 80 : bk.type === "strong" ? 50 : 30;
  state.score += Math.round(baseScore * mult);
  sfx.combo(Math.min(8, state.combo));
  if (bk.hits <= 0) {
    const c = bk.color || (bk.type === "strong" ? "#d0d6e0" : bk.type === "tough" ? "#ffd86b" : "#aaa");
    burst(bk.x + bk.w/2, bk.y + bk.h/2, c, 16, 220, 0.7, 3);
    state.shake = Math.max(state.shake, bk.type === "tough" ? 6 : 3);
    spawnPowerup(bk.x + bk.w/2, bk.y + bk.h/2);
    if (state.combo > 0 && state.combo % 8 === 0) toast("连击！", "x" + state.combo);
    const idx = bricks.indexOf(bk); if (idx >= 0) bricks.splice(idx, 1);
  } else {
    burst(bk.x + bk.w/2, bk.y + bk.h/2, bk.color || "#fff", 4, 100, 0.3, 1.6);
  }
}

function applyPowerup(type) {
  toast(type.desc, type.label);
  switch (type.id) {
    case "E": paddle.w = Math.min(220, paddle.w + 28); break;
    case "S": paddle.w = Math.max(60, paddle.w - 22); break;
    case "M": {
      const existing = balls.slice();
      for (const b of existing) {
        if (b.stuck) continue;
        const speed = Math.hypot(b.vx, b.vy) || 380;
        for (const off of [-0.35, 0.35]) {
          const a = Math.atan2(b.vy, b.vx) + off;
          balls.push({ x: b.x, y: b.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: BALL_R, stuck: false });
        }
      }
      if (balls.length === 0) resetBallOnPaddle();
      break;
    }
    case "B": state.slowTimer = 8; break;
    case "T": state.throughTimer = 8; break;
    case "L": state.laserTimer = 10; break;
  }
}

function roundRect(x, y, w, h, r) {
  if (w < 2*r) r = w/2; if (h < 2*r) r = h/2;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
function shade(hex, p) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0,2), 16), g = parseInt(c.substring(2,4), 16), b = parseInt(c.substring(4,6), 16);
  const f = p < 0 ? 1 + p : 1 - p;
  const t = p < 0 ? 0 : 255;
  const rr = Math.round((t - r) * f + r), gg = Math.round((t - g) * f + g), bb = Math.round((t - b) * f + b);
  return "#" + [rr,gg,bb].map(v => v.toString(16).padStart(2,"0")).join("");
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, GH);
  g.addColorStop(0, COLORS.bgTop); g.addColorStop(1, COLORS.bgBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, GW, GH);
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  for (let x = 0; x < GW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GH); ctx.stroke(); }
  for (let y = 0; y < GH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GW, y); ctx.stroke(); }
  for (const p of bgParticles) {
    ctx.fillStyle = p.c + "0.4)";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBricks() {
  for (const b of bricks) {
    let fillA, fillB;
    if (b.type === "steel") { fillA = COLORS.steel[0]; fillB = COLORS.steel[1]; }
    else if (b.type === "strong") { fillA = COLORS.silver[0]; fillB = COLORS.silver[1]; }
    else if (b.type === "tough") { fillA = COLORS.gold[0]; fillB = COLORS.gold[1]; }
    else { fillA = b.color; fillB = shade(b.color, -0.4); }
    const ratio = b.hits === Infinity ? 1 : (b.maxHits - b.hits) / b.maxHits;
    const dmg = Math.min(0.6, ratio * 0.4);
    ctx.save();
    if (b.type === "steel") { ctx.shadowBlur = 0; }
    else { ctx.shadowBlur = 8; ctx.shadowColor = fillA; }
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    grad.addColorStop(0, fillA); grad.addColorStop(1, fillB);
    ctx.fillStyle = grad;
    roundRect(b.x, b.y, b.w, b.h, 4); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255," + (0.18 - dmg) + ")";
    roundRect(b.x + 3, b.y + 2, b.w - 6, (b.h - 4) * 0.4, 2); ctx.fill();
    if (b.hits !== Infinity && b.hits > 1) {
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("x" + b.hits, b.x + b.w/2, b.y + b.h/2 + 1);
    }
    ctx.restore();
  }
}

function drawPaddle() {
  ctx.save();
  ctx.shadowBlur = 18; ctx.shadowColor = COLORS.paddleGlow;
  const grad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  grad.addColorStop(0, "#7ff7ff"); grad.addColorStop(1, "#0090d8");
  ctx.fillStyle = grad;
  roundRect(paddle.x, paddle.y, paddle.w, paddle.h, paddle.h/2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  roundRect(paddle.x + 6, paddle.y + 3, paddle.w - 12, 3, 1.5); ctx.fill();
  if (state.laserTimer > 0) {
    ctx.fillStyle = "#ff5a5a"; ctx.shadowBlur = 12; ctx.shadowColor = "#ff5a5a";
    ctx.fillRect(paddle.x + 8, paddle.y - 8, 4, 8);
    ctx.fillRect(paddle.x + paddle.w - 12, paddle.y - 8, 4, 8);
  }
  ctx.restore();
}

function drawBalls() {
  for (const t of ballTrail) {
    const a = clamp(t.life / 0.18, 0, 1) * 0.4;
    ctx.fillStyle = `rgba(0, 240, 255, ${a})`;
    ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * 0.9, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of balls) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = state.throughTimer > 0 ? "#ff8bff" : COLORS.ballGlow;
    ctx.fillStyle = state.throughTimer > 0 ? "#ffd0ff" : COLORS.ball;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, b.r * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawPowerups() {
  for (const p of powerups) {
    const pulse = 1 + Math.sin(p.time * 6) * 0.06;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(pulse, pulse);
    ctx.shadowBlur = 14; ctx.shadowColor = p.type.color;
    const grad = ctx.createLinearGradient(-14, -14, 14, 14);
    grad.addColorStop(0, p.type.color); grad.addColorStop(1, shade(p.type.color, -0.5));
    ctx.fillStyle = grad;
    roundRect(-14, -14, 28, 28, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.type.label, 0, 1);
    ctx.restore();
  }
}

function drawLasers() {
  for (const l of lasers) {
    ctx.save();
    ctx.shadowBlur = 12; ctx.shadowColor = "#ff5a5a";
    ctx.fillStyle = "#ffd1d1";
    ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color; ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.save();
  ctx.textBaseline = "top";
  ctx.shadowBlur = 8; ctx.shadowColor = "rgba(255, 90, 247, 0.6)";
  ctx.fillStyle = "#ff5af7"; ctx.textAlign = "left";
  ctx.font = "bold 12px -apple-system, sans-serif";
  ctx.fillText("SCORE", 20, 18);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff"; ctx.font = "bold 22px -apple-system, sans-serif";
  ctx.fillText(state.score.toLocaleString(), 20, 36);

  ctx.textAlign = "center";
  ctx.shadowBlur = 8; ctx.shadowColor = "rgba(0, 240, 255, 0.6)";
  ctx.fillStyle = "#5ff0ff"; ctx.font = "bold 11px -apple-system, sans-serif";
  ctx.fillText("LEVEL " + (state.levelIndex + 1) + " · " + LEVELS[state.levelIndex].name.toUpperCase(), GW/2, 18);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff"; ctx.font = "bold 20px -apple-system, sans-serif";
  ctx.fillText("第 " + (state.levelIndex + 1) + " / " + LEVELS.length + " 关", GW/2, 36);

  ctx.textAlign = "right";
  ctx.shadowBlur = 8; ctx.shadowColor = "rgba(255, 216, 107, 0.6)";
  ctx.fillStyle = "#ffd86b"; ctx.font = "bold 11px -apple-system, sans-serif";
  ctx.fillText("BEST " + store.bestScore, GW - 20, 18);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff"; ctx.font = "bold 22px -apple-system, sans-serif";
  ctx.fillText("❤".repeat(state.lives), GW - 20, 36);

  if (state.combo > 1 && state.comboTimer > 0) {
    const mult = Math.min(8, 1 + Math.floor(state.combo / 5) * 0.5);
    ctx.textAlign = "center";
    ctx.shadowBlur = 14; ctx.shadowColor = "rgba(255, 90, 247, 0.7)";
    ctx.fillStyle = "#ff5af7"; ctx.font = "bold 16px -apple-system, sans-serif";
    ctx.fillText("COMBO x" + state.combo + "  ·  SCORE x" + mult.toFixed(1), GW/2, 68);
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "12px -apple-system, sans-serif";
  ctx.fillText(!ballLaunched ? "点击 / 触屏 / 空格 — 发射球" : "P 暂停  ·  M 静音", GW/2, GH - 18);
  ctx.restore();
}

function drawActiveEffects() {
  if (state.slowTimer > 0) { ctx.save(); ctx.fillStyle = "rgba(90, 185, 255, 0.18)"; ctx.fillRect(0, 0, GW, GH); ctx.restore(); }
  if (state.throughTimer > 0) { ctx.save(); ctx.fillStyle = "rgba(255, 139, 255, 0.10)"; ctx.fillRect(0, 0, GW, GH); ctx.restore(); }
}

function render() {
  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  drawBackground();
  if (state.mode === "playing" || state.mode === "paused" || state.mode === "levelclear" || state.mode === "gameover") {
    drawBricks(); drawPowerups(); drawLasers(); drawPaddle(); drawBalls(); drawParticles(); drawActiveEffects(); drawHUD();
  } else if (paddle) { drawPaddle(); }
  ctx.restore();
}

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function showOverlay(id) {
  document.querySelectorAll(".overlay").forEach(o => o.classList.remove("show"));
  if (id) document.getElementById(id).classList.add("show");
}
function refreshMenuStats() {
  document.getElementById("menuBest").textContent = store.bestScore.toLocaleString();
  document.getElementById("menuLevel").textContent = Math.min(LEVELS.length, (store.unlockedLevel || 0) + 1);
  document.getElementById("menuLast").textContent = store.lastScore.toLocaleString();
}
function refreshSettingsUI() {
  document.getElementById("swSound").classList.toggle("on", !!store.sound);
  document.getElementById("swHaptics").classList.toggle("on", !!store.haptics);
  document.getElementById("swParticles").classList.toggle("on", !!store.particles);
  document.getElementById("swHighQuality").classList.toggle("on", store.highQuality !== false);
}
refreshMenuStats(); refreshSettingsUI();

document.getElementById("btnPlay").addEventListener("click", () => { ensureAudio(); startGame(); });
document.getElementById("btnHelp").addEventListener("click", () => showOverlay("helpMenu"));
document.getElementById("btnHelpBack").addEventListener("click", () => showOverlay("mainMenu"));
document.getElementById("btnSettings").addEventListener("click", () => showOverlay("settingsMenu"));
document.getElementById("btnSettingsBack").addEventListener("click", () => { saveStore(); showOverlay("mainMenu"); });
document.getElementById("btnReset").addEventListener("click", () => {
  if (confirm("确定要清空最高分和进度吗？")) {
    localStorage.removeItem(STORE_KEY); store = loadStore();
    refreshMenuStats(); refreshSettingsUI(); toast("已重置进度", "OK");
  }
});
document.getElementById("btnResume").addEventListener("click", resumeGame);
document.getElementById("btnRestart").addEventListener("click", startGame);
// btnQuit removed: back-link in HTML now
document.getElementById("btnGoRetry").addEventListener("click", startGame);
// btnGoMenu removed: back-link in HTML now
document.getElementById("btnLcNext").addEventListener("click", nextLevel);

document.getElementById("toggleSound").addEventListener("click", () => { store.sound = !store.sound; saveStore(); refreshSettingsUI(); sfx.click(); });
document.getElementById("toggleHaptics").addEventListener("click", () => { store.haptics = !store.haptics; saveStore(); refreshSettingsUI(); if (store.haptics) vibrate(20); });
document.getElementById("toggleParticles").addEventListener("click", () => { store.particles = !store.particles; saveStore(); refreshSettingsUI(); });
document.getElementById("toggleHighQuality").addEventListener("click", () => { store.highQuality = !store.highQuality; saveStore(); refreshSettingsUI(); resize(); });

window.addEventListener("pointerdown", () => ensureAudio(), { once: true });
