// ====================================================
//  霓虹迷宫潜行 · Neon Maze Infiltration
//  第一人称 3D 潜行 — Three.js
//  迷宫探索 / 视线躲避 / 暴露值 / 手电筒 / 雾与光影
// ====================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

'use strict';

// ===== 常量 =====
const CELL = 6;              // 每个迷宫单元尺寸
const WALL_H = 5;            // 墙高
const PLAYER_R = 0.9;        // 玩家碰撞半径
const PLAYER_H_STAND = 3.4;  // 站立视角高度
const PLAYER_H_CROUCH = 2.0; // 蹲伏视角高度
const WALK_SPEED = 7.5;
const RUN_SPEED = 12.5;
const CROUCH_SPEED = 4.0;
const EXPOSURE_MAX = 100;    // 暴露值满即失败
const HUNTER_VIEW_DIST = 18; // 猎手视线距离
const HUNTER_VIEW_HALF_ANGLE = Math.PI / 5; // 视线半锥角 36°

// ===== 存储 =====
const STORE_KEY = 'neon-maze-v1';
const defaultStore = { best: 0, cleared: 0, last: 0, sound: true, quality: true, sensHigh: false };
let store = loadStore();
function loadStore() { try { return Object.assign({}, defaultStore, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { return { ...defaultStore }; } }
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {} }

// ===== 音效（Web Audio）=====
let audioCtx = null;
function ensureAudio() { if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); return audioCtx; }
function beep(freq, dur, type, vol, slide) {
  if (!store.sound) return; const ac = ensureAudio(); if (!ac) return; const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol, lp) {
  if (!store.sound) return; const ac = ensureAudio(); if (!ac) return; const t = ac.currentTime;
  const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ac.createBufferSource(); src.buffer = buf; const filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = lp || 1200;
  const g = ac.createGain(); g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + dur + 0.02);
}
const sfx = {
  click: () => beep(900, 0.04, 'square', 0.04),
  start: () => { beep(440, 0.1, 'triangle', 0.06); setTimeout(() => beep(660, 0.12, 'triangle', 0.06), 100); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.07), i * 90)); },
  lose: () => { beep(330, 0.25, 'sawtooth', 0.08, -180); setTimeout(() => beep(180, 0.4, 'sawtooth', 0.08, -100), 200); },
  alert: () => beep(880, 0.08, 'square', 0.05),
  step: () => beep(120, 0.04, 'sine', 0.03),
  torch: () => beep(600, 0.06, 'triangle', 0.05),
};

// ===== DOM =====
const canvas = document.getElementById('game');
const loadingEl = document.getElementById('loading');
const fatalEl = document.getElementById('fatal');
const hudEl = document.getElementById('hud');
const toastEl = document.getElementById('toast');
const dangerVig = document.getElementById('danger-vignette');
const expWrap = document.getElementById('exposure-wrap');
const expFill = document.getElementById('exposure-fill');
const hintEl = document.getElementById('hint');
const chipLight = document.getElementById('chip-light');
const chipLightTxt = document.getElementById('chip-light-txt');
const chipStance = document.getElementById('chip-stance');
const chipStanceTxt = document.getElementById('chip-stance-txt');
const minimapCanvas = document.getElementById('minimap');
const mctx = minimapCanvas.getContext('2d');

// ===== 工具 =====
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let toastTimer = 0;
function toast(text, em) { toastEl.innerHTML = em ? `<span class="em">${em}</span> ${text}` : text; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800); }
function showHint(text, ms) { hintEl.textContent = text; hintEl.classList.add('show'); clearTimeout(showHint._t); showHint._t = setTimeout(() => hintEl.classList.remove('show'), ms || 2000); }

// ===== Three.js 全局 =====
let renderer, scene, camera, controls, composer, bloomPass;
let flashlight, ambient, hemi, playerLight;
let mazeGroup, floorMesh, ceilingMesh, exitMesh, exitLight;
let hunters = [];
let mazeGrid;          // 二维数组：1=墙 0=通路
let mazeW, mazeH;      // 迷宫单元数
let exitCell = { x: 0, y: 0 };
let startCell = { x: 0, y: 0 };
let exitPillarMesh;

// ===== 游戏状态 =====
let gameState = 'menu'; // menu | playing | paused | win | lose
let level = 1, score = 0, levelStartTime = 0, levelTime = 0;
let exposure = 0;          // 0..100
let detected = false;      // 当前是否被某猎手视线锁定
let torchOn = true;
let crouching = false;
let running = false;
let stepTimer = 0;
let prevExposureAlert = false;
const keys = {};
const playerVel = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

// ===== 迷宫生成（递归回溯）=====
function generateMaze(w, h) {
  // w,h 必须为奇数
  if (w % 2 === 0) w++; if (h % 2 === 0) h++;
  const g = Array.from({ length: h }, () => new Array(w).fill(1));
  const stack = [];
  const sx = 1, sy = 1;
  g[sy][sx] = 0; stack.push([sx, sy]);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]].sort(() => Math.random() - 0.5);
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && g[ny][nx] === 1) {
        g[ny][nx] = 0; g[cy + dy / 2][cx + dx / 2] = 0; stack.push([nx, ny]); moved = true; break;
      }
    }
    if (!moved) stack.pop();
  }
  return { grid: g, w, h };
}

// 找最远的通路单元作为出口（BFS）
function findFarthestCell(grid, w, h, sx, sy) {
  const dist = Array.from({ length: h }, () => new Array(w).fill(-1));
  dist[sy][sx] = 0; const q = [[sx, sy]]; let far = [sx, sy], farD = 0;
  while (q.length) {
    const [cx, cy] = q.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] === 0 && dist[ny][nx] === -1) {
        dist[ny][nx] = dist[cy][cx] + 1; q.push([nx, ny]);
        if (dist[ny][nx] > farD) { farD = dist[ny][nx]; far = [nx, ny]; }
      }
    }
  }
  return { x: far[0], y: far[1], dist: farD };
}

// ===== 场景构建 =====
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03021a);
  scene.fog = new THREE.FogExp2(0x03021a, 0.017); // 适中雾，保留纵深但能看清远处墙体轮廓

  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 220);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 光照：足够看清墙体霓虹结构 + 半球光 + 手电筒 + 玩家随身光
  ambient = new THREE.AmbientLight(0x2a2358, 0.55);
  scene.add(ambient);
  hemi = new THREE.HemisphereLight(0x3a2a6a, 0x0a0418, 0.6);
  scene.add(hemi);

  // 玩家随身柔光（确保周边墙体始终可见，不依赖手电筒）
  playerLight = new THREE.PointLight(0x6fd8ff, 2.2, 16, 1.6);
  scene.add(playerLight);

  // 手电筒（聚光灯，跟随相机方向，更宽更亮）
  flashlight = new THREE.SpotLight(0xc8f4ff, 9.0, 34, Math.PI / 5, 0.45, 1.0);
  flashlight.position.set(0, 0, 0);
  flashlight.target.position.set(0, 0, -1);
  scene.add(flashlight);
  scene.add(flashlight.target);

  // PointerLockControls
  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  // 后处理
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.95, 0.7, 0.5);
  composer.addPass(bloomPass);
  // Vignette
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, offset: { value: 1.1 }, darkness: { value: 0.85 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float offset; uniform float darkness; varying vec2 vUv;
      void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 uv=(vUv-0.5)*offset; float d=length(uv); c.rgb*=smoothstep(1.0,0.2,d)*darkness; gl_FragColor=c; }`
  }));

  applyQuality();
  window.addEventListener('resize', onResize);
  onResize();
  loadingEl.classList.add('hide');
}

function applyQuality() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(store.quality ? dpr : Math.min(1.25, dpr));
  bloomPass.enabled = store.quality;
  composer.setSize(window.innerWidth, window.innerHeight);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}

// 构建迷宫几何（合并墙壁以提升性能）
function buildMaze() {
  // 清理旧迷宫
  if (mazeGroup) { scene.remove(mazeGroup); mazeGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); }
  mazeGroup = new THREE.Group(); scene.add(mazeGroup);
  // 清理旧猎手
  for (const ht of hunters) { scene.remove(ht.group); ht.dispose(); }
  hunters = [];

  // 难度递增：迷宫变大
  const baseN = 9 + Math.min(10, level - 1) * 2;
  const { grid, w, h } = generateMaze(baseN, baseN);
  mazeGrid = grid; mazeW = w; mazeH = h;
  startCell = { x: 1, y: 1 };
  const far = findFarthestCell(grid, w, h, 1, 1);
  exitCell = { x: far.x, y: far.y };

  // 地板
  const fw = w * CELL, fh = h * CELL;
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x080418, metalness: 0.5, roughness: 0.7, emissive: 0x040210, emissiveIntensity: 0.5 });
  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(fw / 2, 0, fh / 2);
  mazeGroup.add(floorMesh);

  // 地板霓虹网格线（亮青，Bloom 发光）
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1a8ab8, transparent: true, opacity: 0.55 });
  const gridPts = [];
  for (let i = 0; i <= w; i++) { gridPts.push(i * CELL, 0.02, 0, i * CELL, 0.02, fh); }
  for (let j = 0; j <= h; j++) { gridPts.push(0, 0.02, j * CELL, fw, 0.02, j * CELL); }
  const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  mazeGroup.add(new THREE.LineSegments(gridGeo, gridMat));

  // 天花板（半透明，营造压迫感但不封死）
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x05010f, metalness: 0.3, roughness: 0.9, transparent: true, opacity: 0.5 });
  ceilingMesh = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), ceilMat);
  ceilingMesh.rotation.x = Math.PI / 2;
  ceilingMesh.position.set(fw / 2, WALL_H, fh / 2);
  mazeGroup.add(ceilingMesh);

  // 墙壁：实体面板（霓虹自发光）+ 明亮线框边
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== 1) continue;
      const cx = x * CELL + CELL / 2, cz = y * CELL + CELL / 2;
      // 实体墙面板：深紫底 + 强青色自发光，Bloom 会让它发光
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x140a3a, emissive: 0x00a8d8, emissiveIntensity: 0.85,
        metalness: 0.5, roughness: 0.4, transparent: true, opacity: 0.9
      });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallMat);
      wall.position.set(cx, WALL_H / 2, cz);
      mazeGroup.add(wall);
      // 明亮发光线框（青色，Bloom 核心光源）
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL, WALL_H, CELL));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x33faff, transparent: true, opacity: 1.0 });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.position.copy(wall.position);
      mazeGroup.add(edges);
    }
  }

  // 出口光柱
  const ex = exitCell.x * CELL + CELL / 2, ez = exitCell.y * CELL + CELL / 2;
  const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, WALL_H, 16, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff3aef, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  exitPillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
  exitPillarMesh.position.set(ex, WALL_H / 2, ez);
  mazeGroup.add(exitPillarMesh);
  // 出口光柱内芯
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xff8bff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, WALL_H, 12), coreMat);
  core.position.set(ex, WALL_H / 2, ez);
  mazeGroup.add(core);
  exitLight = new THREE.PointLight(0xff3aef, 3.5, 22, 1.5);
  exitLight.position.set(ex, WALL_H / 2, ez);
  mazeGroup.add(exitLight);
  exitMesh = { pillar: exitPillarMesh, core, x: ex, z: ez };

  // 玩家初始位置
  const px = startCell.x * CELL + CELL / 2, pz = startCell.y * CELL + CELL / 2;
  controls.getObject().position.set(px, PLAYER_H_STAND, pz);
  camera.rotation.set(0, 0, 0);

  // 生成猎手（数量随关卡递增）
  const hunterCount = Math.min(6, 1 + Math.floor((level - 1) / 2));
  const pathCells = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (grid[y][x] === 0) pathCells.push([x, y]);
  // 猎手出生点远离玩家起点
  const candidates = pathCells.filter(([x, y]) => Math.hypot(x - startCell.x, y - startCell.y) > 5);
  for (let i = 0; i < hunterCount; i++) {
    const cell = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : pathCells[Math.floor(Math.random() * pathCells.length)];
    const speed = 3.5 + Math.min(2.5, (level - 1) * 0.3);
    hunters.push(createHunter(cell[0] * CELL + CELL / 2, cell[1] * CELL + CELL / 2, speed));
  }
}

// ===== 猎手 =====
function createHunter(x, z, speed) {
  const group = new THREE.Group();
  // 球体身体
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x300818, emissive: 0xff2a5a, emissiveIntensity: 1.5, metalness: 0.3, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), bodyMat);
  group.add(body);
  // 视线锥（半透明圆锥，锥尖朝 -z 即前方）
  const coneGeo = new THREE.ConeGeometry(Math.tan(HUNTER_VIEW_HALF_ANGLE) * HUNTER_VIEW_DIST, HUNTER_VIEW_DIST, 24, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xff3a5a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.rotation.x = -Math.PI / 2; // ConeGeometry 锥尖默认 +y，绕 x 轴 -90° 后锥尖朝 -z（前方）
  cone.position.set(0, 0, -HUNTER_VIEW_DIST / 2); // 锥体中心位于前方半距处
  group.add(cone);
  // 点光
  const light = new THREE.PointLight(0xff3a5a, 1.8, 10, 1.2);
  group.add(light);
  group.position.set(x, 1.6, z);
  scene.add(group);

  const hunter = {
    group, body, cone, coneMat, bodyMat, light,
    x, z, speed, angle: Math.random() * Math.PI * 2,
    targetAngle: 0, turnTimer: 0,
    alert: 0, // 警觉度 0..1（发现玩家时升高）
    seenPlayer: false,
    dispose() { scene.remove(group); body.geometry.dispose(); bodyMat.dispose(); cone.geometry.dispose(); coneMat.dispose(); }
  };
  return hunter;
}

// 猎手 AI：在通路中游走，定期变向；发现玩家时追击
function updateHunter(ht, dt) {
  // 选择新方向
  ht.turnTimer -= dt;
  if (ht.turnTimer <= 0) {
    ht.targetAngle = Math.random() * Math.PI * 2;
    ht.turnTimer = 1.5 + Math.random() * 2;
  }
  // 平滑转向
  let da = ht.targetAngle - ht.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  ht.angle += da * Math.min(1, dt * 3);

  // 视线检测玩家（用点积判断是否在视线锥内）
  const pobj = controls.getObject();
  const px = pobj.position.x, pz = pobj.position.z;
  const dx = px - ht.x, dz = pz - ht.z;
  const dist = Math.hypot(dx, dz);
  // 猎手朝向向量（angle 0 朝 -z，与 Three.js 默认一致）
  const fwdX = -Math.sin(ht.angle), fwdZ = -Math.cos(ht.angle);
  // 玩家方向单位向量
  const toX = dist > 0.001 ? dx / dist : 0, toZ = dist > 0.001 ? dz / dist : 0;
  const dot = fwdX * toX + fwdZ * toZ; // 1=正前 0=侧 -1=正后
  const inCone = dot > Math.cos(HUNTER_VIEW_HALF_ANGLE) && dist < HUNTER_VIEW_DIST;
  // 视线是否被墙遮挡（网格步进 DDA，比射线检测 mesh 更快更准）
  let blocked = false;
  if (inCone) {
    const stepLen = 0.5;
    const steps = Math.floor(dist / stepLen);
    for (let i = 1; i < steps; i++) {
      const cx = ht.x + toX * i * stepLen, cz = ht.z + toZ * i * stepLen;
      if (isWallAt(cx, cz)) { blocked = true; break; }
    }
  }
  // 玩家可见性：蹲伏/关灯降低被发现概率
  const visibility = (crouching ? 0.5 : 1) * (torchOn ? 1.0 : 0.45) * (running ? 1.3 : 1);
  const canSee = inCone && !blocked && dist < HUNTER_VIEW_DIST * (0.7 + visibility * 0.3);

  if (canSee) {
    ht.alert = Math.min(1, ht.alert + dt * 1.5);
    ht.seenPlayer = true;
    // 转向玩家：计算使朝向对准玩家的目标 angle
    ht.targetAngle = Math.atan2(-dx, -dz);
    ht.turnTimer = 0.3;
  } else {
    ht.alert = Math.max(0, ht.alert - dt * 0.5);
    if (ht.alert <= 0) ht.seenPlayer = false;
  }

  // 移动：警觉时加速追玩家，否则巡逻（朝向 -z 体系）
  const moveSpeed = ht.speed * (ht.alert > 0.3 ? 1.8 : 1);
  let mvx, mvz;
  if (ht.alert > 0.5) {
    mvx = dx / (dist || 1); mvz = dz / (dist || 1);
  } else {
    mvx = fwdX; mvz = fwdZ;
  }
  const nx = ht.x + mvx * moveSpeed * dt;
  const nz = ht.z + mvz * moveSpeed * dt;
  // 碰撞：检查目标格是否通路
  if (!isWallAt(nx, ht.z)) ht.x = nx; else ht.targetAngle = Math.random() * Math.PI * 2;
  if (!isWallAt(ht.x, nz)) ht.z = nz; else ht.targetAngle = Math.random() * Math.PI * 2;

  // 更新 mesh
  ht.group.position.set(ht.x, 1.6, ht.z);
  ht.group.rotation.y = ht.angle;
  // 警觉时变红更亮、锥更明显
  const alertBoost = ht.alert;
  ht.bodyMat.emissiveIntensity = 1.5 + alertBoost * 2;
  ht.coneMat.opacity = 0.12 + alertBoost * 0.25;
  ht.coneMat.color.setHex(alertBoost > 0.5 ? 0xff1a3a : 0xff3a5a);
  ht.body.rotation.y += dt * (1 + alertBoost * 3);
  ht.body.rotation.x += dt * 0.7;
}

// 判断世界坐标是否在墙内
function isWallAt(wx, wz) {
  const cx = Math.floor(wx / CELL), cy = Math.floor(wz / CELL);
  if (cx < 0 || cy < 0 || cx >= mazeW || cy >= mazeH) return true;
  return mazeGrid[cy][cx] === 1;
}

// 玩家碰撞：圆与网格墙，分轴检测
function tryMovePlayer(dx, dz) {
  const pobj = controls.getObject();
  const px = pobj.position.x, pz = pobj.position.z, py = pobj.position.y;
  const r = PLAYER_R;
  // X 轴
  let nx = px + dx;
  if (isWallAt(nx + Math.sign(dx) * r, pz)) nx = px;
  // Z 轴
  let nz = pz + dz;
  if (isWallAt(nx, nz + Math.sign(dz) * r)) nz = pz;
  // 避免卡墙角：再检查对角
  if (isWallAt(nx + Math.sign(dx) * r, nz + Math.sign(dz) * r)) { nx = px; }
  pobj.position.x = nx; pobj.position.z = nz;
}

// ===== 输入 =====
function setupInput() {
  // 键盘
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyF' && gameState === 'playing') { torchOn = !torchOn; sfx.torch(); updateChips(); showHint(torchOn ? '手电筒 开' : '手电筒 关', 1000); }
    if (e.code === 'Escape') {
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // PointerLock
  controls.addEventListener('lock', () => { if (gameState === 'paused') resumeGame(); });
  controls.addEventListener('unlock', () => { if (gameState === 'playing') pauseGame(); });

  // 灵敏度
  applySensitivity();
}

function applySensitivity() {
  // r160 PointerLockControls 暴露 pointerSpeed 属性，直接生效
  if (controls) controls.pointerSpeed = store.sensHigh ? 1.7 : 1.0;
}

// ===== 游戏流程 =====
function startGame() {
  level = 1; score = 0;
  startLevel();
}
function startLevel() {
  buildMaze();
  exposure = 0; detected = false; torchOn = true; crouching = false; running = false;
  levelStartTime = performance.now(); levelTime = 0;
  gameState = 'playing';
  showOverlay(null); hudEl.classList.add('show');
  updateChips();
  controls.lock();
  sfx.start();
  showHint('找到品红色出口光柱', 2500);
}
function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused'; showOverlay('pauseMenu'); hudEl.classList.remove('show');
  controls.unlock();
  sfx.click();
}
function resumeGame() {
  if (gameState !== 'paused') return;
  gameState = 'playing'; showOverlay(null); hudEl.classList.add('show');
  controls.lock();
  sfx.click();
}
function winLevel() {
  gameState = 'win'; controls.unlock(); hudEl.classList.remove('show');
  const time = levelTime;
  const noDetect = exposure < 30;
  const bonus = Math.max(0, Math.round(500 - time * 5)) + (noDetect ? 300 : 0) + level * 100;
  score += bonus;
  store.cleared = Math.max(store.cleared, level);
  if (score > store.best) store.best = score;
  store.last = score; saveStore();
  document.getElementById('win-time').textContent = time.toFixed(1);
  document.getElementById('win-score').textContent = score;
  document.getElementById('win-bonus').textContent = '+' + bonus;
  document.getElementById('win-title').textContent = '第 ' + level + ' 层 · 潜入成功';
  document.getElementById('win-sub').textContent = noDetect ? '完美潜行！额外加分' : '进入下一层';
  showOverlay('winMenu'); sfx.win();
}
function loseLevel() {
  gameState = 'lose'; controls.unlock(); hudEl.classList.remove('show');
  if (score > store.best) store.best = score;
  store.last = score; saveStore();
  document.getElementById('lose-level').textContent = level;
  document.getElementById('lose-time').textContent = levelTime.toFixed(1);
  document.getElementById('lose-score').textContent = score;
  showOverlay('loseMenu'); sfx.lose();
}
function nextLevel() {
  level++; startLevel();
}

// ===== UI =====
function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show'));
  if (id) document.getElementById(id).classList.add('show');
}
function refreshMenuStats() {
  document.getElementById('menu-best').textContent = store.best;
  document.getElementById('menu-cleared').textContent = store.cleared;
  document.getElementById('menu-last').textContent = store.last;
}
function refreshSettingsUI() {
  document.getElementById('sw-sound').classList.toggle('on', !!store.sound);
  document.getElementById('sw-quality').classList.toggle('on', !!store.quality);
  document.getElementById('sw-sens').classList.toggle('on', !!store.sensHigh);
}
function updateChips() {
  chipLight.classList.toggle('on', torchOn);
  chipLightTxt.textContent = '手电 ' + (torchOn ? '开' : '关');
  chipStance.classList.toggle('crouch', crouching);
  chipStance.classList.toggle('on', !crouching && running);
  chipStanceTxt.textContent = crouching ? '蹲伏' : (running ? '跑步' : '站立');
}
function updateHUD() {
  document.getElementById('hud-level').textContent = level;
  document.getElementById('hud-time').textContent = levelTime.toFixed(1);
  document.getElementById('hud-score').textContent = score;
  expFill.style.width = exposure + '%';
  expWrap.classList.toggle('danger', exposure > 60);
  dangerVig.classList.toggle('alert', detected && exposure > 40);
}

// 小地图：显示迷宫、玩家、猎手、出口
function drawMinimap() {
  const W = minimapCanvas.width, H = minimapCanvas.height;
  mctx.clearRect(0, 0, W, H);
  if (!mazeGrid) return;
  const cw = W / mazeW, ch = H / mazeH;
  // 墙
  mctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
  for (let y = 0; y < mazeH; y++) for (let x = 0; x < mazeW; x++) if (mazeGrid[y][x] === 1) mctx.fillRect(x * cw, y * ch, cw, ch);
  // 出口
  mctx.fillStyle = '#ff3aef';
  mctx.fillRect(exitCell.x * cw, exitCell.y * ch, cw, ch);
  // 猎手
  for (const ht of hunters) {
    mctx.fillStyle = ht.alert > 0.3 ? '#ff1a3a' : '#ff5a7a';
    const hx = (ht.x / CELL) * cw, hz = (ht.z / CELL) * ch;
    mctx.beginPath(); mctx.arc(hx, hz, 3, 0, Math.PI * 2); mctx.fill();
    // 视线锥（canvas 角度 = atan2(朝向z, 朝向x)，朝向 = (-sin,-cos)）
    mctx.fillStyle = 'rgba(255, 58, 90, 0.15)';
    mctx.beginPath();
    mctx.moveTo(hx, hz);
    const centerAng = Math.atan2(-Math.cos(ht.angle), -Math.sin(ht.angle));
    const a1 = centerAng - HUNTER_VIEW_HALF_ANGLE, a2 = centerAng + HUNTER_VIEW_HALF_ANGLE;
    const rd = (HUNTER_VIEW_DIST / CELL) * cw;
    mctx.lineTo(hx + Math.cos(a1) * rd, hz + Math.sin(a1) * rd);
    mctx.arc(hx, hz, rd, a1, a2);
    mctx.closePath(); mctx.fill();
  }
  // 玩家
  const pobj = controls.getObject();
  const px = (pobj.position.x / CELL) * cw, pz = (pobj.position.z / CELL) * ch;
  mctx.fillStyle = '#00f0ff';
  mctx.beginPath(); mctx.arc(px, pz, 4, 0, Math.PI * 2); mctx.fill();
  // 玩家朝向
  const camAng = camera.rotation.y;
  mctx.strokeStyle = '#00f0ff'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(px, pz); mctx.lineTo(px - Math.sin(camAng) * 10, pz - Math.cos(camAng) * 10); mctx.stroke();
}

// ===== 主更新 =====
function update(dt) {
  if (gameState !== 'playing') return;
  levelTime = (performance.now() - levelStartTime) / 1000;

  // 姿态
  crouching = !!keys['ControlLeft'] || !!keys['ControlRight'] || !!keys['KeyC'];
  running = !!keys['ShiftLeft'] && !crouching;
  const targetEyeH = crouching ? PLAYER_H_CROUCH : PLAYER_H_STAND;
  const pobj = controls.getObject();
  pobj.position.y += (targetEyeH - pobj.position.y) * Math.min(1, dt * 8);

  // 移动
  const speed = crouching ? CROUCH_SPEED : (running ? RUN_SPEED : WALK_SPEED);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, camera.up).normalize();
  let mx = 0, mz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) { mx += fwd.x; mz += fwd.z; }
  if (keys['KeyS'] || keys['ArrowDown']) { mx -= fwd.x; mz -= fwd.z; }
  if (keys['KeyD'] || keys['ArrowRight']) { mx += right.x; mz += right.z; }
  if (keys['KeyA'] || keys['ArrowLeft']) { mx -= right.x; mz -= right.z; }
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx = mx / ml * speed * dt; mz = mz / ml * speed * dt; tryMovePlayer(mx, mz); }

  // 脚步声
  if (ml > 0) { stepTimer -= dt; if (stepTimer <= 0) { sfx.step(); stepTimer = crouching ? 0.6 : (running ? 0.28 : 0.42); } }

  // 手电筒 + 玩家随身光跟随相机
  const cp = pobj.position;
  playerLight.position.set(cp.x, cp.y - 0.5, cp.z);
  flashlight.position.copy(cp);
  const tgt = new THREE.Vector3(); camera.getWorldDirection(tgt);
  flashlight.target.position.copy(cp).add(tgt);
  flashlight.intensity = torchOn ? 9.0 : 0.0;

  // 猎手更新
  detected = false;
  for (const ht of hunters) {
    updateHunter(ht, dt);
    if (ht.seenPlayer) detected = true;
  }

  // 暴露值：被照射累积，否则衰减
  if (detected) {
    exposure = Math.min(EXPOSURE_MAX, exposure + dt * (running ? 28 : (crouching ? 10 : 18)) * (torchOn ? 1.2 : 0.7));
    if (exposure > 30 && !prevExposureAlert) { sfx.alert(); prevExposureAlert = true; }
  } else {
    exposure = Math.max(0, exposure - dt * 12);
    if (exposure < 15) prevExposureAlert = false;
  }
  if (exposure >= EXPOSURE_MAX) { loseLevel(); return; }

  // 出口检测
  const dx = pobj.position.x - exitMesh.x, dz = pobj.position.z - exitMesh.z;
  if (Math.hypot(dx, dz) < 2) { winLevel(); return; }

  // 出口光柱动画
  if (exitPillarMesh) { exitPillarMesh.rotation.y += dt * 1.2; exitLight.intensity = 3.0 + Math.sin(levelTime * 3) * 0.8; }

  updateChips();
}

function render() {
  composer.render();
}

// ===== 主循环 =====
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  if (gameState === 'playing' || gameState === 'paused') { updateHUD(); drawMinimap(); }
  render();
  requestAnimationFrame(loop);
}

// ===== 启动 =====
try {
  initThree();
  setupInput();
  refreshMenuStats();
  refreshSettingsUI();
  requestAnimationFrame(loop);
} catch (err) {
  console.error(err);
  loadingEl.classList.add('hide');
  fatalEl.classList.add('show');
}

// ===== 按钮绑定 =====
document.getElementById('btn-play').addEventListener('click', () => { ensureAudio(); sfx.click(); startGame(); });
document.getElementById('btn-help').addEventListener('click', () => { showOverlay('helpMenu'); sfx.click(); });
document.getElementById('btn-help-back').addEventListener('click', () => { showOverlay('mainMenu'); sfx.click(); });
document.getElementById('btn-settings').addEventListener('click', () => { showOverlay('settingsMenu'); sfx.click(); });
document.getElementById('btn-settings-back').addEventListener('click', () => { saveStore(); showOverlay('mainMenu'); sfx.click(); });
document.getElementById('btn-reset').addEventListener('click', () => {
  if (confirm('确定要清空进度吗？')) { localStorage.removeItem(STORE_KEY); store = loadStore(); refreshMenuStats(); refreshSettingsUI(); toast('已重置进度', 'OK'); }
});
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', () => { sfx.click(); startGame(); });
document.getElementById('btn-next').addEventListener('click', () => { sfx.click(); nextLevel(); });
document.getElementById('btn-retry').addEventListener('click', () => { sfx.click(); level = 1; score = 0; startLevel(); });
document.getElementById('toggle-sound').addEventListener('click', () => { store.sound = !store.sound; saveStore(); refreshSettingsUI(); sfx.click(); });
document.getElementById('toggle-quality').addEventListener('click', () => { store.quality = !store.quality; saveStore(); refreshSettingsUI(); applyQuality(); sfx.click(); });
document.getElementById('toggle-sensitivity').addEventListener('click', () => { store.sensHigh = !store.sensHigh; saveStore(); refreshSettingsUI(); sfx.click(); });

// 点击 canvas 时请求 pointer lock（菜单到游戏的衔接）
canvas.addEventListener('click', () => { if (gameState === 'playing' && !controls.isLocked) controls.lock(); });

window.addEventListener('pointerdown', () => ensureAudio(), { once: true });
