/* ============================================
   Realistic Fireworks — fireworks.js  v2
   Multi-shape explosions + Love You special
   ============================================ */

(() => {
  'use strict';

  // ─── Canvas Setup ───────────────────────────────────────────────────────────
  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');
  let W = 0, H = 0;
  const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
  window.addEventListener('resize', resize);
  resize();

  // ─── Constants ──────────────────────────────────────────────────────────────
  const GRAVITY        = 0.055;
  const DRAG           = 0.984;
  const TRAIL_LENGTH   = 7;
  const LAUNCH_INTERVAL = [1000, 2000];

  const COLORS = [
    () => `hsl(${rand(0,   30)},  100%, 65%)`,
    () => `hsl(${rand(45,  65)},  100%, 60%)`,
    () => `hsl(${rand(90, 150)},  100%, 55%)`,
    () => `hsl(${rand(175,210)},  100%, 60%)`,
    () => `hsl(${rand(215,250)},  100%, 70%)`,
    () => `hsl(${rand(270,310)},  100%, 70%)`,
    () => `hsl(${rand(315,355)},  100%, 65%)`,
  ];

  const SHAPES = ['sphere','heart','doublering','star','mandala','ring','willow','crossette','spiral'];

  // ─── Utilities ──────────────────────────────────────────────────────────────
  const rand      = (a, b) => Math.random() * (b - a) + a;
  const randInt   = (a, b) => Math.floor(rand(a, b + 1));
  const pickColor = ()     => COLORS[randInt(0, COLORS.length - 1)]();
  const pickShape = ()     => SHAPES[randInt(0, SHAPES.length - 1)];
  const TAU       = Math.PI * 2;

  // ─── Object Pool ────────────────────────────────────────────────────────────
  const pool   = [];
  const active = [];
  const acquire = () => pool.length ? pool.pop() : {};
  const release = (p) => { active.splice(active.indexOf(p), 1); pool.push(p); };

  // ─── Particle Init ──────────────────────────────────────────────────────────
  // opts.jitter : max angular noise added to the velocity direction (radians).
  //   Shaped explosions pass a small value (0.04–0.08) so particles follow the
  //   geometry tightly.  Sphere / willow pass higher values for organic spread.
  //   When omitted the default is 0 (pure directional velocity).
  const initParticle = (x, y, vx, vy, color, opts = {}) => {
    const p = acquire();

    // Apply optional directional jitter: rotate velocity vector by a tiny
    // random angle instead of adding independent x/y noise, so the speed
    // magnitude stays consistent and the shape outline stays crisp.
    const jitter = opts.jitter ?? 0;
    if (jitter > 0) {
      const angle  = Math.atan2(vy, vx) + rand(-jitter, jitter);
      const speed  = Math.sqrt(vx*vx + vy*vy);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    }

    p.x          = x;
    p.y          = y;
    p.vx         = vx;
    p.vy         = vy;
    p.color      = color;
    p.alpha      = 1;
    p.radius     = opts.radius  ?? 2.0;
    p.decay      = opts.decay   ?? 0.014;
    p.gravity    = opts.gravity ?? GRAVITY;
    p.drag       = opts.drag    ?? DRAG;
    p.trail      = [];
    p.isWillow      = opts.isWillow      ?? false;
    p.isCrossette   = opts.isCrossette   ?? false;
    p.crossetteFired = false;
    active.push(p);
  };

  // ─── Shape Generators ───────────────────────────────────────────────────────

  // 1. Sphere — fully random spread; jitter is intentionally high
  const shapeSphereDo = (x, y, color) => {
    const N = 130;
    for (let i = 0; i < N; i++) {
      const a = rand(0, TAU);
      const s = rand(2.5, 7);
      // No jitter opt needed — angle itself is already random
      initParticle(x, y, Math.cos(a)*s, Math.sin(a)*s, color,
        { radius: rand(1.6, 2.6), decay: rand(0.010, 0.016) });
    }
  };

  // 2. Heart — parametric outline; speed is proportional to distance from centre
  //    so all particles land on the heart silhouette at roughly the same time.
  const heartXY = (t) => ({
    x: 16 * Math.pow(Math.sin(t), 3),
    y: -(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t))
  });
  const shapeHeart = (x, y, color) => {
    const N      = 160;
    const SCALE  = 0.40;          // world-units per parametric unit
    const color2 = `hsl(${rand(340,360)},100%,70%)`;
    for (let i = 0; i < N; i++) {
      const t   = (i / N) * TAU;
      const pt  = heartXY(t);
      // Direction = normalised parametric point; magnitude = its distance * SCALE
      const dist = Math.sqrt(pt.x*pt.x + pt.y*pt.y) || 1;
      const spd  = dist * SCALE;
      initParticle(x, y, (pt.x / dist) * spd, (pt.y / dist) * spd,
        i % 4 === 0 ? '#fff' : (i % 6 === 0 ? color2 : color),
        { jitter: 0.04, radius: 2.2, decay: 0.012 });
    }
  };

  // 3. Double / Multiple Rings — each ring uses exact uniform speed
  const shapeDoubleRing = (x, y, color) => {
    const rings  = [
      { spd: 3.2, N: 70,  col: color },
      { spd: 5.2, N: 100, col: `hsl(${rand(0,360)},100%,65%)` },
      { spd: 7.0, N: 130, col: color },
    ];
    rings.forEach(({ spd, N, col }) => {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        initParticle(x, y, Math.cos(a)*spd, Math.sin(a)*spd, col,
          { jitter: 0.03, radius: 1.9, decay: 0.012 });
      }
    });
  };

  // 4. Star / Burst — sharp spikes with zero angular noise on tip particles
  const shapeStar = (x, y, color) => {
    const arms   = randInt(5, 8);
    const inner  = 2.5;
    const outer  = 7.8;
    const perArm = 28;
    for (let arm = 0; arm < arms; arm++) {
      const baseA = (arm / arms) * TAU - Math.PI / 2;
      // Main spike: speed peaks at tip (sin curve), angle is exact
      for (let j = 0; j < perArm; j++) {
        const t   = j / (perArm - 1);
        const spd = inner + (outer - inner) * Math.sin(t * Math.PI);
        // Tip particles get near-zero jitter; base particles get a little more
        const jitter = 0.02 + (1 - t) * 0.06;
        initParticle(x, y, Math.cos(baseA)*spd, Math.sin(baseA)*spd, color,
          { jitter, radius: 1.8 + t * 0.6, decay: 0.013 });
      }
      // Dim inter-arm fill (intentionally diffuse — no jitter needed, angle varies)
      const gapA = baseA + (TAU / arms) * 0.5;
      for (let j = 0; j < 6; j++) {
        const spd = inner * (j / 6);
        initParticle(x, y, Math.cos(gapA)*spd, Math.sin(gapA)*spd, '#fff',
          { radius: 1.1, decay: 0.026 });
      }
    }
  };

  // 5. Mandala — concentric rings at exact integer-speed steps + strict radial lines
  const shapeMandala = (x, y, color) => {
    const PETALS  = 12;
    const color2  = `hsl(${rand(0,360)},100%,65%)`;
    const palette = [color, color2, '#fff'];
    // Rings: each at a fixed, distinct speed so they stay separated
    [2.0, 3.8, 5.6, 7.2].forEach((spd, ri) => {
      const N = PETALS * (ri + 1);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        initParticle(x, y, Math.cos(a)*spd, Math.sin(a)*spd, palette[ri % 3],
          { jitter: 0.025, radius: 1.7, decay: 0.011 });
      }
    });
    // Radial spokes: same exact angle, speed increments linearly
    for (let i = 0; i < PETALS; i++) {
      const a = (i / PETALS) * TAU;
      for (let d = 1; d <= 18; d++) {
        initParticle(x, y, Math.cos(a)*(d*0.42), Math.sin(a)*(d*0.42), '#fff',
          { jitter: 0.015, radius: 1.0, decay: 0.016 });
      }
    }
  };

  // 6. Ring — single exact speed for all particles → perfect circle
  const shapeRing = (x, y, color) => {
    const N   = 200;
    const SPD = 6.5;   // fixed — no rand so every particle travels the same radius
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      initParticle(x, y, Math.cos(a)*SPD, Math.sin(a)*SPD, color,
        { jitter: 0.02, radius: 2.3, decay: 0.011 });
    }
  };

  // 7. Willow — organic droop: upper hemisphere only, graduated speeds
  //    Shape is intentionally loose (willow branches ≠ geometric), but we
  //    constrain to upper hemisphere so the "weeping" silhouette reads clearly.
  const shapeWillow = (x, y, color) => {
    const N = 90;
    for (let i = 0; i < N; i++) {
      // Spread across upper 240° arc (-210° … +30° from straight up)
      const a   = rand(-Math.PI * 1.15, Math.PI * 0.15) - Math.PI / 2;
      const spd = rand(3.0, 6.0);
      initParticle(x, y, Math.cos(a)*spd, Math.sin(a)*spd, color,
        // jitter is zero — direction already sampled randomly above
        { gravity: GRAVITY * 2.8, drag: 0.968, decay: 0.008, radius: 2.1 });
    }
  };

  // 8. Crossette — parent arms at fixed speed; children inherit parent direction
  const shapeCrossette = (x, y, color) => {
    const N   = 24;
    const SPD = 5.5;   // all arms same speed → clean spoke pattern before split
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      initParticle(x, y, Math.cos(a)*SPD, Math.sin(a)*SPD, color,
        { jitter: 0.03, isCrossette: true, decay: 0.014, radius: 2.5 });
    }
  };

  // 9. Spiral — Archimedean; speed grows linearly so outer particles travel
  //    farther and the arm stays a clean line rather than a smudge.
  const shapeSpiral = (x, y, color) => {
    const turns  = randInt(3, 5);
    const N      = 240;
    const MAX_V  = 7.0;   // fixed outer speed cap
    const color2 = `hsl(${rand(0,360)},100%,65%)`;
    for (let i = 0; i < N; i++) {
      const t   = i / (N - 1);
      const a   = t * TAU * turns;
      const spd = t * MAX_V;          // deterministic — no rand on speed
      const col = i % 5 === 0 ? '#fff' : (i % 9 === 0 ? color2 : color);
      initParticle(x, y, Math.cos(a)*spd, Math.sin(a)*spd, col,
        { jitter: 0.03, radius: 1.7 + t * 0.5, decay: 0.012 });
    }
  };

  // ─── "LOVE YOU ❤" text → pixel dots ────────────────────────────────────────
  const buildTextPoints = (text, size) => {
    const off     = document.createElement('canvas');
    const octx    = off.getContext('2d');
    off.width     = size * 10;
    off.height    = size * 2;
    octx.fillStyle = '#fff';
    octx.font      = `bold ${size}px Arial`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(text, off.width / 2, off.height / 2);
    const data   = octx.getImageData(0, 0, off.width, off.height).data;
    const pts    = [];
    const step   = 4;
    for (let py = 0; py < off.height; py += step) {
      for (let px = 0; px < off.width; px += step) {
        const idx = (py * off.width + px) * 4;
        if (data[idx + 3] > 128) {
          pts.push({ x: px - off.width / 2, y: py - off.height / 2 });
        }
      }
    }
    return pts;
  };

  let lovePoints = null;
  const getLovePoints = () => {
    if (!lovePoints) lovePoints = buildTextPoints('LOVE YOU ❤', 72);
    return lovePoints;
  };

  const shapeLoveYou = (cx, cy) => {
    const pts   = getLovePoints();
    const scale = Math.min(W, H) / 520;
    // core flash
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU);
      const s = rand(1, 4);
      initParticle(cx, cy, Math.cos(a)*s, Math.sin(a)*s, '#fff', { radius: 3, decay: 0.03 });
    }
    pts.forEach(pt => {
      const tx  = cx + pt.x * scale;
      const ty  = cy + pt.y * scale;
      const dx  = tx - cx;
      const dy  = ty - cy;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const launch = rand(6, 10);
      const dur    = dist / launch;
      const decay  = dur > 0 ? 1 / (dur * 1.6) : 0.02;
      const col    = pt.x > 0
        ? `hsl(${rand(0,30)},100%,65%)`
        : `hsl(${rand(320,360)},100%,70%)`;
      initParticle(cx, cy, (dx / dist) * launch * rand(0.85,1.15),
        (dy / dist) * launch * rand(0.85,1.15), col,
        { radius: rand(1.8, 3), decay, gravity: 0, drag: 0.96 });
    });
  };

  // ─── Dispatcher ─────────────────────────────────────────────────────────────
  const explode = (x, y, color, shape) => {
    // White core sparks on every explosion
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU);
      initParticle(x, y, Math.cos(a)*rand(0.5,2.5), Math.sin(a)*rand(0.5,2.5), '#fff',
        { radius: 2, decay: 0.03 });
    }
    switch (shape) {
      case 'heart':       shapeHeart(x, y, color);      break;
      case 'doublering':  shapeDoubleRing(x, y, color); break;
      case 'star':        shapeStar(x, y, color);       break;
      case 'mandala':     shapeMandala(x, y, color);    break;
      case 'ring':        shapeRing(x, y, color);       break;
      case 'willow':      shapeWillow(x, y, color);     break;
      case 'crossette':   shapeCrossette(x, y, color);  break;
      case 'spiral':      shapeSpiral(x, y, color);     break;
      default:            shapeSphereDo(x, y, color);   break;
    }
  };

  // ─── Rockets ────────────────────────────────────────────────────────────────
  const rockets = [];

  const pushRocket = (x, targetY, color, shape, isLove = false, isLarge = false) => {
    const travelTime = rand(55, 85);
    rockets.push({
      x, y: H,
      vx: rand(-0.6, 0.6),
      vy: (targetY - H) / travelTime,
      targetY,
      color,
      shape,
      isLove,
      isLarge,
      trail: [],
    });
  };

  const launchRocket = () => {
    pushRocket(rand(W*0.15, W*0.85), rand(H*0.10, H*0.42), pickColor(), pickShape());
  };

  // ─── Draw Helpers ───────────────────────────────────────────────────────────
  const drawGlowDot = (x, y, radius, color, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
    glow.addColorStop(0,   color);
    glow.addColorStop(0.3, color);
    glow.addColorStop(1,   'transparent');
    ctx.beginPath(); ctx.arc(x, y, radius*4, 0, TAU);
    ctx.fillStyle = glow; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  };

  // ─── Update Rockets ─────────────────────────────────────────────────────────
  const updateRockets = () => {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.trail.push({ x: r.x, y: r.y });
      if (r.trail.length > 12) r.trail.shift();
      r.vy += GRAVITY * 0.5;
      r.x  += r.vx;
      r.y  += r.vy;

      // Trail
      for (let t = 0; t < r.trail.length; t++) {
        const pt  = r.trail[t];
        const prg = t / r.trail.length;
        ctx.save();
        ctx.globalAlpha = prg * 0.65;
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, (r.isLarge ? 3 : 1.5) * prg, 0, TAU);
        ctx.fillStyle = r.color;
        ctx.fill();
        ctx.restore();
      }
      drawGlowDot(r.x, r.y, r.isLarge ? 4 : 2, r.color, 1);

      if (r.y <= r.targetY) {
        if (r.isLove) {
          shapeLoveYou(r.x, r.y);
          // Surrounding heart ring
          shapeHeart(r.x, r.y, `hsl(${rand(340,360)},100%,70%)`);
        } else {
          explode(r.x, r.y, r.color, r.shape);
        }
        rockets.splice(i, 1);
      }
    }
  };

  // ─── Update Particles ───────────────────────────────────────────────────────
  const updateParticles = () => {
    const toRelease = [];
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];

      // Crossette: fire children at mid-life branching off the parent's direction
      if (p.isCrossette && !p.crossetteFired && p.alpha < 0.55) {
        p.crossetteFired = true;
        const parentAngle = Math.atan2(p.vy, p.vx);
        const SPD = 3.0;
        // 4 branches: forward, backward, left, right relative to parent travel
        [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(offset => {
          const a = parentAngle + offset;
          initParticle(p.x, p.y, Math.cos(a)*SPD, Math.sin(a)*SPD, p.color,
            { jitter: 0.05, radius: 1.6, decay: 0.020 });
        });
      }

      p.trail.push({ x: p.x, y: p.y, alpha: p.alpha });
      if (p.trail.length > TRAIL_LENGTH) p.trail.shift();

      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.gravity;
      p.x  += p.vx;
      p.y  += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) { toRelease.push(p); continue; }

      // Trail
      for (let t = 0; t < p.trail.length; t++) {
        const pt  = p.trail[t];
        const prg = t / p.trail.length;
        ctx.save();
        ctx.globalAlpha = pt.alpha * prg * 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, p.radius * prg * 0.7, 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }

      drawGlowDot(p.x, p.y, p.radius, p.color, p.alpha);
    }
    toRelease.forEach(release);
  };

  // ─── Auto-Launch Timer ──────────────────────────────────────────────────────
  let nextLaunch = 0;
  const scheduleNext = () => { nextLaunch = performance.now() + rand(...LAUNCH_INTERVAL); };
  scheduleNext();

  // ─── Click / Hold Interaction ────────────────────────────────────────────────
  let holdTimer   = null;
  let holdFired   = false;
  let holdOriginX = 0;
  let holdOriginY = 0;

  const onPointerDown = (clientX, clientY) => {
    holdFired   = false;
    holdOriginX = clientX;
    holdOriginY = clientY;
    holdTimer = setTimeout(() => {
      holdFired = true;
      // Big "LOVE YOU" special firework
      const cx = W / 2;
      const cy = H * 0.38;
      pushRocket(cx, cy, `hsl(${rand(340,360)},100%,70%)`, 'love', true, true);
      // Escort rockets
      [-200, 200].forEach(dx => {
        setTimeout(() => pushRocket(cx + dx, cy + rand(-30,30), `hsl(${rand(0,30)},100%,65%)`, 'heart', false, false), rand(100,300));
      });
    }, 600);
  };

  const onPointerUp = (clientX, clientY) => {
    clearTimeout(holdTimer);
    if (!holdFired) {
      // Quick tap → single rocket at click position
      const shape = pickShape();
      pushRocket(clientX, clientY < H * 0.5 ? clientY : rand(H*0.1, H*0.4),
        pickColor(), shape);
    }
  };

  canvas.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
  canvas.addEventListener('mouseup',   (e) => onPointerUp(e.clientX, e.clientY));
  canvas.addEventListener('mouseleave', () => clearTimeout(holdTimer));

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    onPointerDown(t.clientX, t.clientY);
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onPointerUp(t.clientX, t.clientY);
  }, { passive: false });

  // ─── HUD label ──────────────────────────────────────────────────────────────
  const drawHUD = () => {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle   = '#fff';
    ctx.font        = `${Math.max(11, W * 0.013)}px monospace`;
    ctx.textAlign   = 'center';
    ctx.fillText('Click to launch  •  Hold to send LOVE YOU ❤', W / 2, H - 18);
    ctx.restore();
  };

  // ─── Render Loop ────────────────────────────────────────────────────────────
  const render = (now) => {
    requestAnimationFrame(render);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle   = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, W, H);

    if (now >= nextLaunch) {
      const burst = randInt(1, 3);
      for (let b = 0; b < burst; b++) setTimeout(launchRocket, b * rand(80, 220));
      scheduleNext();
    }

    updateRockets();
    updateParticles();
    drawHUD();
  };

  requestAnimationFrame(render);
})();
