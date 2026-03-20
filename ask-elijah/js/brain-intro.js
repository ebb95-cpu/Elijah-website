/* ── Brain Intro — "Every Dot is a Moment" ──
   Scattered dots across the screen. A light connects them one by one,
   zigging and zagging like life's journey. Once connected, the dots
   drift into a brain outline — the chaos becomes meaning.
   ~8s total, then fades to auth screen.                               */
(function () {
  'use strict';

  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;

  var overlay = document.getElementById('brain-intro');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var W, H, cx, cy, scale;

  // ── Brain outline target — side view (lateral profile) ──
  var brainTarget = [
    [-0.05, 0.32], [-0.20, 0.26], [-0.32, 0.20], [-0.40, 0.14],
    [-0.44, 0.06], [-0.46, -0.04], [-0.44, -0.14],
    [-0.40, -0.24], [-0.34, -0.32],
    [-0.26, -0.38], [-0.16, -0.42],
    [-0.06, -0.44], [0.04, -0.44], [0.14, -0.42],
    [0.24, -0.40], [0.32, -0.36],
    [0.38, -0.30], [0.42, -0.22], [0.44, -0.12],
    [0.42, -0.02],
    [0.38, 0.06], [0.34, 0.12],
    [0.30, 0.18], [0.28, 0.24], [0.22, 0.28],
    [0.14, 0.30], [0.06, 0.30], [-0.05, 0.32]
  ];

  var NUM_BRAIN_DOTS = brainTarget.length;
  var NUM_EXTRA_DOTS = 60; // additional scattered dots for atmosphere
  var TOTAL_DOTS = NUM_BRAIN_DOTS + NUM_EXTRA_DOTS;

  // ── Timing ──
  var SCATTER_HOLD = 800;     // hold scattered state
  var CONNECT_DURATION = 4000; // connecting phase
  var MORPH_DELAY = 400;       // pause before morphing
  var MORPH_DURATION = 2000;   // dots drift to brain shape
  var HOLD_COMPLETE = 800;     // hold final brain
  var FADE_DURATION = 800;

  // ── Dot state ──
  var dots = [];
  var connections = []; // { from, to, progress(0-1) }
  var connectOrder = []; // indices into dots[] for connection order

  // ── Animation state ──
  var startTime = null;
  var animating = true;
  var fadingOut = false;
  var fadeStart = null;
  var phase = 'scatter'; // scatter → connect → morph → hold → fade

  // ── Sizing ──
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2;
    cy = H / 2;
    scale = Math.min(W, H) * 0.38;
  }

  resize();
  window.addEventListener('resize', resize);

  // ── Seed random (deterministic feel) ──
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // ── Initialize dots ──
  function initDots() {
    dots = [];

    // Brain dots — scattered randomly, will morph to brain positions
    for (var i = 0; i < NUM_BRAIN_DOTS; i++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = 0.2 + Math.random() * 0.55;
      dots.push({
        // Scattered position (normalized)
        sx: Math.cos(angle) * dist,
        sy: Math.sin(angle) * dist,
        // Target position (brain outline)
        tx: brainTarget[i][0],
        ty: brainTarget[i][1],
        // Current position
        x: 0, y: 0,
        // Visual
        radius: rand(2, 3.5),
        baseAlpha: rand(0.3, 0.6),
        alpha: 0,
        connected: false,
        pulseTime: 0,
        isBrain: true
      });
    }

    // Extra atmosphere dots — scattered, stay in place, just for texture
    for (var j = 0; j < NUM_EXTRA_DOTS; j++) {
      var ea = Math.random() * Math.PI * 2;
      var ed = 0.15 + Math.random() * 0.65;
      var ex = Math.cos(ea) * ed;
      var ey = Math.sin(ea) * ed;
      dots.push({
        sx: ex, sy: ey,
        tx: ex, ty: ey, // stay in place
        x: 0, y: 0,
        radius: rand(1, 2),
        baseAlpha: rand(0.1, 0.25),
        alpha: 0,
        connected: false,
        pulseTime: 0,
        isBrain: false
      });
    }

    // Set initial positions to scattered
    for (var k = 0; k < dots.length; k++) {
      dots[k].x = dots[k].sx;
      dots[k].y = dots[k].sy;
    }

    // Build connection order — start from a bottom dot, zig-zag to nearest
    buildConnectionOrder();
  }

  // ── Build connection order using nearest-neighbor traversal ──
  function buildConnectionOrder() {
    connectOrder = [];
    var visited = {};

    // Start from the bottom-left-ish dot
    var startIdx = 0;
    var bestY = -Infinity;
    for (var i = 0; i < TOTAL_DOTS; i++) {
      if (dots[i].sy > bestY && dots[i].sx < 0) {
        bestY = dots[i].sy;
        startIdx = i;
      }
    }

    connectOrder.push(startIdx);
    visited[startIdx] = true;

    // Greedy nearest neighbor — but with some randomness for organic feel
    var current = startIdx;
    for (var step = 1; step < TOTAL_DOTS; step++) {
      var bestDist = Infinity;
      var bestIdx = -1;
      var candidates = [];

      // Find 5 nearest unvisited
      for (var j = 0; j < TOTAL_DOTS; j++) {
        if (visited[j]) continue;
        var dx = dots[j].sx - dots[current].sx;
        var dy = dots[j].sy - dots[current].sy;
        var d = Math.sqrt(dx * dx + dy * dy);
        candidates.push({ idx: j, dist: d });
      }

      candidates.sort(function (a, b) { return a.dist - b.dist; });

      // Pick from top 3 nearest with some randomness
      var pick = Math.min(candidates.length - 1, Math.floor(Math.random() * Math.min(3, candidates.length)));
      bestIdx = candidates[pick].idx;

      if (bestIdx === -1) break;
      connectOrder.push(bestIdx);
      visited[bestIdx] = true;
      current = bestIdx;
    }
  }

  initDots();

  // ── Screen position from normalized ──
  function toScreen(nx, ny) {
    return { x: cx + nx * scale, y: cy + ny * scale };
  }

  // ── Draw frame ──
  function draw(now) {
    if (!animating) return;
    if (!startTime) startTime = now;
    var elapsed = now - startTime;

    ctx.clearRect(0, 0, W, H);

    // ── Phase management ──
    var connectStart = SCATTER_HOLD;
    var connectEnd = connectStart + CONNECT_DURATION;
    var morphStart = connectEnd + MORPH_DELAY;
    var morphEnd = morphStart + MORPH_DURATION;
    var holdEnd = morphEnd + HOLD_COMPLETE;

    // Fade out
    var globalAlpha = 1;
    if (fadingOut) {
      if (!fadeStart) fadeStart = now;
      globalAlpha = 1 - Math.min((now - fadeStart) / FADE_DURATION, 1);
      if (globalAlpha <= 0) {
        animating = false;
        overlay.style.display = 'none';
        window.__brainIntroDone = true;
        window.dispatchEvent(new Event('brain-intro-done'));
        return;
      }
    }
    ctx.globalAlpha = globalAlpha;

    // ── Phase: scatter (dots fade in) ──
    if (elapsed < connectStart) {
      var fadeIn = Math.min(elapsed / SCATTER_HOLD, 1);
      for (var i = 0; i < dots.length; i++) {
        dots[i].alpha = dots[i].baseAlpha * fadeIn;
        dots[i].x = dots[i].sx;
        dots[i].y = dots[i].sy;
      }
    }

    // ── Phase: connect (light travels between dots) ──
    var numConnected = 0;
    if (elapsed >= connectStart && elapsed < connectEnd) {
      phase = 'connect';
      var connectElapsed = elapsed - connectStart;
      var connectProgress = Math.min(connectElapsed / CONNECT_DURATION, 1);
      // Ease: start slow, speed up, slow at end
      var eased = connectProgress < 0.5
        ? 4 * connectProgress * connectProgress * connectProgress
        : 1 - Math.pow(-2 * connectProgress + 2, 3) / 2;

      numConnected = Math.floor(eased * TOTAL_DOTS);

      // Mark connected dots
      for (var c = 0; c < numConnected && c < connectOrder.length; c++) {
        var di = connectOrder[c];
        if (!dots[di].connected) {
          dots[di].connected = true;
          dots[di].pulseTime = now;
        }
      }
    } else if (elapsed >= connectEnd) {
      // All connected
      numConnected = TOTAL_DOTS;
      for (var ac = 0; ac < connectOrder.length; ac++) {
        if (!dots[connectOrder[ac]].connected) {
          dots[connectOrder[ac]].connected = true;
          dots[connectOrder[ac]].pulseTime = now;
        }
      }
    }

    // ── Phase: morph (brain dots drift to brain outline) ──
    if (elapsed >= morphStart) {
      phase = 'morph';
      var morphProgress = Math.min((elapsed - morphStart) / MORPH_DURATION, 1);
      // Smooth ease-in-out
      var morphEased = morphProgress < 0.5
        ? 2 * morphProgress * morphProgress
        : 1 - Math.pow(-2 * morphProgress + 2, 2) / 2;

      for (var m = 0; m < dots.length; m++) {
        var dot = dots[m];
        dot.x = dot.sx + (dot.tx - dot.sx) * morphEased;
        dot.y = dot.sy + (dot.ty - dot.sy) * morphEased;
      }
    }

    // ── Phase: hold complete, then fade ──
    if (elapsed >= holdEnd && !fadingOut) {
      fadingOut = true;
    }

    // ── RENDER ──

    // Draw connection lines
    for (var cl = 1; cl < numConnected && cl < connectOrder.length; cl++) {
      var fromDot = dots[connectOrder[cl - 1]];
      var toDot = dots[connectOrder[cl]];
      var fromS = toScreen(fromDot.x, fromDot.y);
      var toS = toScreen(toDot.x, toDot.y);

      // Older lines fade more
      var lineAge = (numConnected - cl) / TOTAL_DOTS;
      var lineAlpha = 0.08 + 0.14 * (1 - lineAge);

      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * lineAlpha;
      ctx.beginPath();
      ctx.moveTo(fromS.x, fromS.y);
      ctx.lineTo(toS.x, toS.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Draw partial line to current position (the traveling light)
    if (phase === 'connect' && numConnected > 0 && numConnected < TOTAL_DOTS) {
      var connectElapsed2 = elapsed - connectStart;
      var connectProgress2 = Math.min(connectElapsed2 / CONNECT_DURATION, 1);
      var eased2 = connectProgress2 < 0.5
        ? 4 * connectProgress2 * connectProgress2 * connectProgress2
        : 1 - Math.pow(-2 * connectProgress2 + 2, 3) / 2;

      var fractional = eased2 * TOTAL_DOTS - numConnected;
      if (fractional > 0 && numConnected < connectOrder.length) {
        var prevDot = dots[connectOrder[numConnected - 1]];
        var nextDot = dots[connectOrder[numConnected]];
        var prevS = toScreen(prevDot.x, prevDot.y);
        var nextS = toScreen(nextDot.x, nextDot.y);
        var partialX = prevS.x + (nextS.x - prevS.x) * fractional;
        var partialY = prevS.y + (nextS.y - prevS.y) * fractional;

        // Faint line to partial
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * 0.2;
        ctx.beginPath();
        ctx.moveTo(prevS.x, prevS.y);
        ctx.lineTo(partialX, partialY);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // Leading light
        var grad = ctx.createRadialGradient(partialX, partialY, 0, partialX, partialY, 20);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(partialX, partialY, 20, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(partialX, partialY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    // Draw all dots
    for (var dd = 0; dd < dots.length; dd++) {
      var dot2 = dots[dd];
      var sp = toScreen(dot2.x, dot2.y);

      // Pulse effect when just connected
      var pulse = 0;
      if (dot2.pulseTime > 0) {
        var sincePulse = now - dot2.pulseTime;
        if (sincePulse < 600) {
          pulse = Math.sin(sincePulse / 600 * Math.PI); // 0→1→0
        }
      }

      var dotAlpha = dot2.connected ? Math.min(dot2.baseAlpha + 0.4 + pulse * 0.4, 1) : dot2.alpha;
      var dotRadius = dot2.radius + pulse * 2;

      // Glow (bigger when pulsing)
      if (dotAlpha > 0.1) {
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * dotAlpha * 0.2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, dotRadius * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }

      // Solid dot
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * dotAlpha;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // ── Brain outline lines (appear during/after morph) ──
    if (elapsed >= morphStart) {
      var morphProgress2 = Math.min((elapsed - morphStart) / MORPH_DURATION, 1);
      // Only show brain outline lines once morph is well underway
      if (morphProgress2 > 0.4) {
        var outlineAlpha = (morphProgress2 - 0.4) / 0.6; // 0→1 over last 60%
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * outlineAlpha * 0.3;
        ctx.beginPath();
        for (var ol = 0; ol < NUM_BRAIN_DOTS; ol++) {
          var op = toScreen(dots[ol].x, dots[ol].y);
          if (ol === 0) ctx.moveTo(op.x, op.y);
          else ctx.lineTo(op.x, op.y);
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Three-dot logo ──
    var logoAppear = morphStart + MORPH_DURATION * 0.5;
    if (elapsed > logoAppear) {
      var logoAlpha = Math.min((elapsed - logoAppear) / 1000, 1);
      drawThreeDotLogo(logoAlpha);
    }

    ctx.globalAlpha = 1;
    scheduleFrame();
  }

  function drawThreeDotLogo(alpha) {
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;

    var dotR = 5;
    var gap = 16;
    var logoY = cy + scale * 0.60;

    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * gap, logoY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(cx - gap + dotR, logoY);
    ctx.lineTo(cx - dotR, logoY);
    ctx.moveTo(cx + dotR, logoY);
    ctx.lineTo(cx + gap - dotR, logoY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "300 14px 'Cormorant Garamond', serif";
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Ask Elijah', cx, logoY + 28);

    ctx.restore();
  }

  // ── Kick off ──
  var authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.classList.remove('visible');

  function scheduleFrame() {
    var scheduled = false;
    requestAnimationFrame(function (ts) {
      if (!scheduled) { scheduled = true; draw(ts); }
    });
    setTimeout(function () {
      if (!scheduled) { scheduled = true; draw(performance.now()); }
    }, 50);
  }

  overlay.style.display = 'flex';
  scheduleFrame();

  // Skip on click/tap
  overlay.addEventListener('click', function () {
    if (!fadingOut) fadingOut = true;
  });

})();
