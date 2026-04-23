/* =============================================
   NEONDRIVE — RACING GAME SCRIPT
   Author: NeonDrive Team
   Features: Arrow-key movement, Fly Mode (Space),
             Pause (P), progressive speed, neon HUD
============================================= */

"use strict";

// ───────────────────────────────────────────
// 1. CANVAS SETUP
// ───────────────────────────────────────────
const canvas  = document.getElementById("gameCanvas");
const ctx     = canvas.getContext("2d");

// Road is a fixed logical width; we scale to fit the screen
const ROAD_W  = 520;   // logical road width (px)
let   ROAD_H  = 600;   // logical road height – updated on resize

let scaleX = 1, scaleY = 1;  // canvas→screen scale factors

function resizeCanvas() {
  const wrapper   = document.getElementById("gameWrapper");
  const hudH      = document.getElementById("hud").offsetHeight;
  const available = wrapper.clientHeight - hudH;
  const screenW   = wrapper.clientWidth;

  // Fill the available viewport while keeping aspect ratio
  scaleX = screenW  / ROAD_W;
  scaleY = available / ROAD_H;
  const s = Math.min(scaleX, scaleY);

  canvas.style.width  = (ROAD_W * s) + "px";
  canvas.style.height = (ROAD_H * s) + "px";
  canvas.width  = ROAD_W;   // logical size stays constant
  canvas.height = ROAD_H;
  ROAD_H = canvas.height;
}

window.addEventListener("resize", resizeCanvas);

// ───────────────────────────────────────────
// 2. CAR IMAGE LOADER
//    Using SVG data-URLs so no external deps
// ───────────────────────────────────────────

// Inline SVG player car (cyan race car, top-down)
const PLAYER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 90">
  <!-- body -->
  <rect x="8" y="10" width="34" height="70" rx="10" fill="#00c8ff"/>
  <!-- cockpit -->
  <rect x="14" y="24" width="22" height="26" rx="6" fill="#001a2e"/>
  <!-- windshield shine -->
  <rect x="16" y="26" width="8" height="10" rx="3" fill="#33eeff" opacity="0.5"/>
  <!-- front bumper -->
  <rect x="12" y="5" width="26" height="10" rx="5" fill="#0096cc"/>
  <!-- rear bumper -->
  <rect x="12" y="75" width="26" height="10" rx="5" fill="#0096cc"/>
  <!-- left wheels -->
  <rect x="0"  y="14" width="10" height="18" rx="4" fill="#222"/>
  <rect x="0"  y="58" width="10" height="18" rx="4" fill="#222"/>
  <!-- right wheels -->
  <rect x="40" y="14" width="10" height="18" rx="4" fill="#222"/>
  <rect x="40" y="58" width="10" height="18" rx="4" fill="#222"/>
  <!-- neon stripe -->
  <rect x="22" y="10" width="6" height="70" rx="3" fill="#00fff7" opacity="0.3"/>
  <!-- headlights -->
  <ellipse cx="20" cy="9"  rx="4" ry="3" fill="#ffe600"/>
  <ellipse cx="30" cy="9"  rx="4" ry="3" fill="#ffe600"/>
  <!-- tail lights -->
  <ellipse cx="20" cy="81" rx="4" ry="3" fill="#ff2d78"/>
  <ellipse cx="30" cy="81" rx="4" ry="3" fill="#ff2d78"/>
</svg>`;

// Inline SVG enemy car (pink/red, slightly different shape)
const ENEMY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 90">
  <!-- body -->
  <rect x="7" y="10" width="36" height="70" rx="9" fill="#ff2d78"/>
  <!-- cockpit -->
  <rect x="13" y="25" width="24" height="24" rx="5" fill="#1a0010"/>
  <!-- windshield shine -->
  <rect x="15" y="27" width="7" height="9" rx="3" fill="#ff6fa8" opacity="0.4"/>
  <!-- front bumper -->
  <rect x="11" y="5"  width="28" height="10" rx="5" fill="#cc1a55"/>
  <!-- rear bumper -->
  <rect x="11" y="75" width="28" height="10" rx="5" fill="#cc1a55"/>
  <!-- left wheels -->
  <rect x="0"  y="14" width="9"  height="18" rx="4" fill="#111"/>
  <rect x="0"  y="58" width="9"  height="18" rx="4" fill="#111"/>
  <!-- right wheels -->
  <rect x="41" y="14" width="9"  height="18" rx="4" fill="#111"/>
  <rect x="41" y="58" width="9"  height="18" rx="4" fill="#111"/>
  <!-- neon stripe -->
  <rect x="22" y="10" width="6"  height="70" rx="3" fill="#ff80aa" opacity="0.3"/>
  <!-- headlights -->
  <ellipse cx="20" cy="9"  rx="4" ry="3" fill="#fff"/>
  <ellipse cx="30" cy="9"  rx="4" ry="3" fill="#fff"/>
  <!-- tail lights -->
  <ellipse cx="20" cy="81" rx="4" ry="3" fill="#ff0"/>
  <ellipse cx="30" cy="81" rx="4" ry="3" fill="#ff0"/>
</svg>`;

// Convert SVG string → Image object
function svgToImage(svgStr) {
  const img  = new Image();
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  img.src    = URL.createObjectURL(blob);
  return img;
}

const playerImg = svgToImage(PLAYER_SVG);
const enemyImg  = svgToImage(ENEMY_SVG);

// ───────────────────────────────────────────
// 3. CONSTANTS & CONFIG
// ───────────────────────────────────────────
const CAR_W         = 42;   // player car width (logical px)
const CAR_H         = 72;   // player car height
const ENEMY_W       = 42;
const ENEMY_H       = 72;
const LANE_COUNT    = 3;
const LANE_MARGIN   = 20;   // side margin from road edge
const BASE_SPEED    = 3;    // road scroll speed
const SPEED_INC     = 0.0008; // speed increase per frame
const FLY_DURATION  = 2000; // ms
const ENEMY_SPAWN_RATE = 80; // frames between spawns (decreases)

// Lane X centres (computed after canvas size known)
function getLaneCentres() {
  const usable = ROAD_W - LANE_MARGIN * 2;
  const laneW  = usable / LANE_COUNT;
  return [0, 1, 2].map(i => LANE_MARGIN + laneW * i + laneW / 2);
}

// ───────────────────────────────────────────
// 4. GAME STATE
// ───────────────────────────────────────────
let state = {
  running:    false,
  paused:     false,
  score:      0,
  bestScore:  0,
  speed:      BASE_SPEED,
  frameCount: 0,

  // Road stripes (dashes)
  stripes: [],

  // Player
  player: {
    x: 0, y: 0,       // top-left of car
    lane: 1,           // current lane index 0-2
    targetX: 0,        // smooth movement target
    flying:   false,
    flyTimer: 0,       // ms remaining
    flyOffset: 0,      // vertical lift
    glowAlpha: 0,      // boost glow opacity
  },

  // Enemies
  enemies: [],

  // Particle effects
  particles: [],
};

// ───────────────────────────────────────────
// 5. INPUT
// ───────────────────────────────────────────
const keys = {};

document.addEventListener("keydown", (e) => {
  if (keys[e.code]) return; // ignore held keys repeating
  keys[e.code] = true;

  if (!state.running) return;

  switch (e.code) {
    case "ArrowLeft":
      moveLane(-1);
      break;
    case "ArrowRight":
      moveLane(+1);
      break;
    case "ArrowUp":
      moveVertical(-1);
      break;
    case "ArrowDown":
      moveVertical(+1);
      break;
    case "Space":
      e.preventDefault();
      activateFly();
      break;
    case "KeyP":
      togglePause();
      break;
  }
});

document.addEventListener("keyup", (e) => { delete keys[e.code]; });

// ───────────────────────────────────────────
// 6. PLAYER MOVEMENT
// ───────────────────────────────────────────
function moveLane(dir) {
  const p = state.player;
  p.lane = Math.max(0, Math.min(LANE_COUNT - 1, p.lane + dir));
  p.targetX = getLaneCentres()[p.lane] - CAR_W / 2;
}

// Arrow Up/Down move car vertically on screen
function moveVertical(dir) {
  const p   = state.player;
  const step = 20;
  p.y = clamp(p.y + dir * step, ROAD_H * 0.35, ROAD_H - CAR_H - 10);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ───────────────────────────────────────────
// 7. FLY MODE
// ───────────────────────────────────────────
function activateFly() {
  if (state.player.flying) return; // already flying
  state.player.flying   = true;
  state.player.flyTimer = FLY_DURATION;
  state.player.glowAlpha = 1;
  playFlySound();
  document.getElementById("flyIndicator").classList.remove("hidden");
}

function updateFly(dt) {
  const p = state.player;
  if (!p.flying) {
    // Smoothly return shadow to 0
    p.flyOffset = lerp(p.flyOffset, 0, 0.12);
    p.glowAlpha = lerp(p.glowAlpha, 0, 0.08);
    return;
  }

  p.flyTimer -= dt;
  const t = 1 - (p.flyTimer / FLY_DURATION); // 0→1 progress

  // Fly arc: lift up then come back down
  p.flyOffset = Math.sin(t * Math.PI) * 30;
  p.glowAlpha = 1 - t;

  if (p.flyTimer <= 0) {
    p.flying    = false;
    p.flyTimer  = 0;
    p.flyOffset = 0;
    p.glowAlpha = 0;
    document.getElementById("flyIndicator").classList.add("hidden");
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ───────────────────────────────────────────
// 8. ROAD STRIPES
// ───────────────────────────────────────────
function initStripes() {
  state.stripes = [];
  const gapH   = 80;
  const cols   = [ROAD_W * 0.34, ROAD_W * 0.67]; // two dividers
  for (const x of cols) {
    let y = -gapH;
    while (y < ROAD_H) {
      state.stripes.push({ x, y });
      y += gapH * 2;
    }
  }
}

function updateStripes() {
  const spd = state.speed;
  for (const s of state.stripes) {
    s.y += spd;
    if (s.y > ROAD_H) s.y -= ROAD_H + 80;
  }
}

function drawRoad() {
  // Background (sky/ground gradient drawn outside canvas via CSS)
  ctx.fillStyle = "#16172b";
  ctx.fillRect(0, 0, ROAD_W, ROAD_H);

  // Road surface
  const grad = ctx.createLinearGradient(0, 0, ROAD_W, 0);
  grad.addColorStop(0,   "#0d0e20");
  grad.addColorStop(0.5, "#18192e");
  grad.addColorStop(1,   "#0d0e20");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ROAD_W, ROAD_H);

  // Neon edge lines
  ctx.strokeStyle = "rgba(255, 45, 120, 0.4)";
  ctx.lineWidth   = 3;
  ctx.shadowColor = "#ff2d78";
  ctx.shadowBlur  = 8;
  ctx.beginPath(); ctx.moveTo(LANE_MARGIN, 0); ctx.lineTo(LANE_MARGIN, ROAD_H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ROAD_W - LANE_MARGIN, 0); ctx.lineTo(ROAD_W - LANE_MARGIN, ROAD_H); ctx.stroke();
  ctx.shadowBlur = 0;

  // Lane dividers (dashed white stripes)
  ctx.fillStyle  = "rgba(255,255,255,0.15)";
  ctx.shadowBlur = 0;
  const dashW = 4, dashH = 38;
  for (const s of state.stripes) {
    ctx.fillRect(s.x - dashW / 2, s.y, dashW, dashH);
  }
}

// ───────────────────────────────────────────
// 9. ENEMIES
// ───────────────────────────────────────────
function spawnEnemy() {
  const centres = getLaneCentres();
  const lane    = Math.floor(Math.random() * LANE_COUNT);
  state.enemies.push({
    x:    centres[lane] - ENEMY_W / 2,
    y:    -ENEMY_H - 10,
    lane,
    speed: state.speed * (0.6 + Math.random() * 0.5),
  });
}

function updateEnemies() {
  const spd = state.speed;
  for (const e of state.enemies) {
    e.y += spd * 0.9 + 1;
  }
  // Remove off-screen
  state.enemies = state.enemies.filter(e => e.y < ROAD_H + ENEMY_H + 20);

  // Spawn logic: spawn rate tightens as score rises
  const spawnEvery = Math.max(30, ENEMY_SPAWN_RATE - Math.floor(state.score / 200));
  if (state.frameCount % spawnEvery === 0) spawnEnemy();
}

function drawEnemies() {
  for (const e of state.enemies) {
    ctx.drawImage(enemyImg, e.x, e.y, ENEMY_W, ENEMY_H);
    // Neon underbody glow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle   = "#ff2d78";
    ctx.shadowColor = "#ff2d78";
    ctx.shadowBlur  = 18;
    ctx.fillRect(e.x + 6, e.y + ENEMY_H - 6, ENEMY_W - 12, 6);
    ctx.restore();
  }
}

// ───────────────────────────────────────────
// 10. COLLISION DETECTION
// ───────────────────────────────────────────
function checkCollisions() {
  if (state.player.flying) return; // immune while flying

  const p  = state.player;
  const px = p.x + 6, py = p.y + 6;
  const pw = CAR_W - 12, ph = CAR_H - 10;

  for (const e of state.enemies) {
    const ex = e.x + 6, ey = e.y + 6;
    const ew = ENEMY_W - 12, eh = ENEMY_H - 10;

    if (px < ex + ew && px + pw > ex &&
        py < ey + eh && py + ph > ey) {
      triggerGameOver();
      return;
    }
  }
}

// ───────────────────────────────────────────
// 11. PLAYER DRAW
// ───────────────────────────────────────────
function drawPlayer() {
  const p     = state.player;
  const drawY = p.y - p.flyOffset; // lift car during fly

  // --- Shadow beneath car (shows on ground) ---
  const shadowScale = 1 - p.flyOffset / 60;
  const shadowAlpha = 0.35 * shadowScale;
  if (shadowAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle   = "#000";
    ctx.shadowBlur  = 0;
    // Shadow ellipse on road level (always at original p.y)
    ctx.beginPath();
    ctx.ellipse(
      p.x + CAR_W / 2,
      p.y + CAR_H - 6,
      CAR_W / 2 * shadowScale,
      8 * shadowScale,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // --- Fly boost glow ring ---
  if (p.glowAlpha > 0.02) {
    ctx.save();
    ctx.globalAlpha = p.glowAlpha * 0.6;
    const rg = ctx.createRadialGradient(
      p.x + CAR_W / 2, drawY + CAR_H / 2, 10,
      p.x + CAR_W / 2, drawY + CAR_H / 2, 70
    );
    rg.addColorStop(0, "rgba(255,230,0,0.7)");
    rg.addColorStop(1, "rgba(255,230,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(p.x - 30, drawY - 30, CAR_W + 60, CAR_H + 60);
    ctx.restore();
  }

  // --- Exhaust particles ---
  if (state.frameCount % 4 === 0) {
    spawnParticle(p.x + CAR_W / 2 - 5 + Math.random() * 10, drawY + CAR_H);
  }

  // --- Draw car image ---
  ctx.save();
  if (p.flying) {
    // Slight bank tilt towards movement direction (optional)
    ctx.translate(p.x + CAR_W / 2, drawY + CAR_H / 2);
    ctx.translate(-(p.x + CAR_W / 2), -(drawY + CAR_H / 2));
  }
  ctx.drawImage(playerImg, p.x, drawY, CAR_W, CAR_H);
  ctx.restore();

  // Underbody cyan glow
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle   = "#00f5ff";
  ctx.shadowColor = "#00f5ff";
  ctx.shadowBlur  = 18;
  ctx.fillRect(p.x + 6, drawY + CAR_H - 5, CAR_W - 12, 4);
  ctx.restore();
}

// ───────────────────────────────────────────
// 12. EXHAUST PARTICLES
// ───────────────────────────────────────────
function spawnParticle(x, y) {
  state.particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 1.5,
    vy: state.speed * 0.4 + Math.random() * 1.5,
    life: 1,
    r: 3 + Math.random() * 3,
  });
}

function updateParticles() {
  for (const p of state.particles) {
    p.x   += p.vx;
    p.y   += p.vy;
    p.life -= 0.05;
    p.r   *= 0.97;
  }
  state.particles = state.particles.filter(p => p.life > 0);
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.6;
    ctx.fillStyle   = "#00f5ff";
    ctx.shadowColor = "#00f5ff";
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ───────────────────────────────────────────
// 13. HUD UPDATE
// ───────────────────────────────────────────
function updateHUD() {
  document.getElementById("scoreDisplay").textContent = Math.floor(state.score);
  document.getElementById("speedDisplay").textContent = state.speed.toFixed(1) + "×";
}

// ───────────────────────────────────────────
// 14. PAUSE
// ───────────────────────────────────────────
function togglePause() {
  state.paused = !state.paused;
  const ps = document.getElementById("pauseScreen");
  const ph = document.getElementById("pauseIndicator");
  if (state.paused) {
    ps.classList.add("active");
    ph.classList.remove("hidden");
  } else {
    ps.classList.remove("active");
    ph.classList.add("hidden");
    // restart the loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

document.getElementById("resumeBtn").addEventListener("click", () => {
  if (state.paused) togglePause();
});

// ───────────────────────────────────────────
// 15. GAME OVER
// ───────────────────────────────────────────
function triggerGameOver() {
  state.running = false;
  if (state.score > state.bestScore) state.bestScore = Math.floor(state.score);

  document.getElementById("finalScore").textContent = Math.floor(state.score);
  document.getElementById("bestScore").textContent  = "BEST: " + state.bestScore;
  showOverlay("gameOverScreen");
}

// ───────────────────────────────────────────
// 16. START / RESTART
// ───────────────────────────────────────────
function startGame() {
  resizeCanvas();
  initStripes();

  const centres = getLaneCentres();
  const startLane = 1;

  state.running    = true;
  state.paused     = false;
  state.score      = 0;
  state.frameCount = 0;
  state.speed      = BASE_SPEED;
  state.enemies    = [];
  state.particles  = [];

  state.player = {
    x:         centres[startLane] - CAR_W / 2,
    y:         ROAD_H - CAR_H - 30,
    lane:      startLane,
    targetX:   centres[startLane] - CAR_W / 2,
    flying:    false,
    flyTimer:  0,
    flyOffset: 0,
    glowAlpha: 0,
  };

  document.getElementById("flyIndicator").classList.add("hidden");
  document.getElementById("pauseIndicator").classList.add("hidden");

  hideAllOverlays();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

document.getElementById("startBtn").addEventListener("click",   startGame);
document.getElementById("restartBtn").addEventListener("click", startGame);

// ───────────────────────────────────────────
// 17. SMOOTH LATERAL MOVEMENT
// ───────────────────────────────────────────
function updatePlayerPosition() {
  const p = state.player;
  // Lerp toward target lane
  p.x = lerp(p.x, p.targetX, 0.18);
}

// ───────────────────────────────────────────
// 18. MAIN GAME LOOP
// ───────────────────────────────────────────
let lastTime = 0;

function gameLoop(timestamp) {
  if (!state.running) return;
  if (state.paused)   return; // loop halted; resumes from togglePause

  const dt = Math.min(timestamp - lastTime, 50); // cap delta at 50ms
  lastTime = timestamp;

  // --- Update ---
  state.frameCount++;
  state.score += state.speed * 0.08;
  state.speed  = BASE_SPEED + state.frameCount * SPEED_INC;

  updateStripes();
  updatePlayerPosition();
  updateFly(dt);
  updateEnemies();
  updateParticles();
  checkCollisions();
  updateHUD();

  // --- Draw ---
  ctx.clearRect(0, 0, ROAD_W, ROAD_H);
  drawRoad();
  drawParticles();
  drawEnemies();
  drawPlayer();

  requestAnimationFrame(gameLoop);
}

// ───────────────────────────────────────────
// 19. OVERLAY HELPERS
// ───────────────────────────────────────────
function showOverlay(id) {
  document.getElementById(id).classList.add("active");
}
function hideAllOverlays() {
  ["startScreen", "pauseScreen", "gameOverScreen"].forEach(id => {
    document.getElementById(id).classList.remove("active");
  });
}

// ───────────────────────────────────────────
// 20. AUDIO — WEB AUDIO API (no external deps)
// ───────────────────────────────────────────
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playFlySound() {
  try {
    const ac  = getAudioCtx();
    const osc = ac.createOscillator();
    const gain= ac.createGain();

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ac.currentTime + 0.3);
    osc.frequency.exponentialRampToValueAtTime(100, ac.currentTime + 0.9);

    gain.gain.setValueAtTime(0.12, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.0);

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 1.0);
  } catch (_) {
    // audio not supported — silently skip
  }
}

// ───────────────────────────────────────────
// 21. INIT — show start screen
// ───────────────────────────────────────────
resizeCanvas();
showOverlay("startScreen");
