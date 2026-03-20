/* ── Brain Dot-Connect Intro Animation ──
   Dots pre-placed in brain outline, connected one by one.
   Plays for ~6s then fades out to reveal auth screen.        */
(function () {
  'use strict';

  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;

  var overlay = document.getElementById('brain-intro');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var W, H, cx, cy, scale;

  // ── Brain outline points — SIDE VIEW (lateral profile) ──
  // Face pointing LEFT. Frontal lobe left, occipital right, cerebellum bottom-right, stem bottom.
  var brainRaw = [
    // Brain stem (bottom, angled back-right)
    [-0.05, 0.32],                                                    // 0
    // Underside — frontal to temporal (left to middle)
    [-0.20, 0.26], [-0.32, 0.20], [-0.40, 0.14],                   // 1-3
    // Front face — frontal lobe (steep curve up)
    [-0.44, 0.06], [-0.46, -0.04], [-0.44, -0.14],                 // 4-6
    [-0.40, -0.24], [-0.34, -0.32],                                  // 7-8
    // Top of frontal lobe — dome
    [-0.26, -0.38], [-0.16, -0.42],                                  // 9-10
    // Top — parietal lobe (gently rolling across top)
    [-0.06, -0.44], [0.04, -0.44], [0.14, -0.42],                  // 11-13
    [0.24, -0.40], [0.32, -0.36],                                    // 14-15
    // Back top — occipital lobe curving down
    [0.38, -0.30], [0.42, -0.22], [0.44, -0.12],                   // 16-18
    [0.42, -0.02],                                                    // 19
    // Back — occipital to cerebellum gap
    [0.38, 0.06], [0.34, 0.12],                                      // 20-21
    // Cerebellum (rounded bump at back-bottom)
    [0.30, 0.18], [0.28, 0.24], [0.22, 0.28],                      // 22-24
    [0.14, 0.30], [0.06, 0.30],                                      // 25-26
    // Back to stem
    [-0.05, 0.32],                                                    // 27
    // Brain stem
    [-0.02, 0.36], [0.00, 0.40],                                     // 28-29
    [-0.08, 0.36]                                                     // 30
  ];

  // Build connections — outline only
  var connections = [];

  // Outer outline (sequential 0→27)
  for (var i = 0; i < 27; i++) {
    connections.push([i, i + 1]);
  }

  // Brain stem
  connections.push([28, 29]); connections.push([0, 30]);

  var totalConnections = connections.length;
  var totalDots = brainRaw.length;

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
    scale = Math.min(W, H) * 0.42;
  }

  resize();
  window.addEventListener('resize', resize);

  // ── Animation state ──
  var DURATION = 6000; // 6 seconds for the full draw
  var FADE_DURATION = 800;
  var startTime = null;
  var revealedDots = {};
  var animating = true;
  var fadingOut = false;
  var fadeStart = null;

  // Colors — black & white branding
  var ACCENT = '#ffffff';
  var LINE_COLOR = 'rgba(255, 255, 255, 0.30)';
  var DOT_GLOW = 'rgba(255, 255, 255, 0.10)';

  function worldPos(idx) {
    var p = brainRaw[idx];
    return { x: cx + p[0] * scale, y: cy + p[1] * scale };
  }

  function draw(now) {
    if (!animating) return;

    if (!startTime) startTime = now;
    var elapsed = now - startTime;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Global alpha for fade-out
    var globalAlpha = 1;
    if (fadingOut) {
      if (!fadeStart) fadeStart = now;
      var fadeElapsed = now - fadeStart;
      globalAlpha = 1 - Math.min(fadeElapsed / FADE_DURATION, 1);
      if (globalAlpha <= 0) {
        animating = false;
        overlay.style.display = 'none';
        // Signal that intro is done — auth.js listens for this
        window.__brainIntroDone = true;
        window.dispatchEvent(new Event('brain-intro-done'));
        return;
      }
    }

    ctx.globalAlpha = globalAlpha;

    // How many connections should be drawn by now
    var progress = Math.min(elapsed / DURATION, 1);
    // Ease-in-out for natural feel
    var eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    var connsToShow = Math.floor(eased * totalConnections);
    var partialFraction = (eased * totalConnections) - connsToShow;

    // Track which dots are revealed
    revealedDots = {};

    // Draw completed connections
    for (var c = 0; c < connsToShow && c < totalConnections; c++) {
      var conn = connections[c];
      var from = worldPos(conn[0]);
      var to = worldPos(conn[1]);
      revealedDots[conn[0]] = true;
      revealedDots[conn[1]] = true;
      drawLine(from, to, 1);
    }

    // Draw partial connection (currently animating)
    if (connsToShow < totalConnections) {
      var current = connections[connsToShow];
      var fromP = worldPos(current[0]);
      var toP = worldPos(current[1]);
      revealedDots[current[0]] = true;

      // Interpolate end point
      var partialEnd = {
        x: fromP.x + (toP.x - fromP.x) * partialFraction,
        y: fromP.y + (toP.y - fromP.y) * partialFraction
      };
      drawLine(fromP, partialEnd, partialFraction);

      // Leading dot (the one being drawn to)
      if (partialFraction > 0.3) {
        drawDot(partialEnd, 3, partialFraction);
      }
    }

    // Draw revealed dots
    var dotKeys = Object.keys(revealedDots);
    for (var d = 0; d < dotKeys.length; d++) {
      var idx = parseInt(dotKeys[d], 10);
      var pos = worldPos(idx);
      drawDot(pos, 3, 1);
    }

    // Three-dot logo pulse at center when nearly done
    if (progress > 0.85) {
      var logoAlpha = (progress - 0.85) / 0.15;
      drawThreeDotLogo(logoAlpha);
    }

    // Trigger fade-out after full draw
    if (progress >= 1 && !fadingOut) {
      setTimeout(function () { fadingOut = true; }, 600);
    }

    ctx.globalAlpha = 1;
    scheduleFrame();
  }

  function drawLine(from, to, opacity) {
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * Math.max(0.4, opacity);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawDot(pos, radius, opacity) {
    ctx.save();
    // Glow
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 3, 0, Math.PI * 2);
    ctx.fillStyle = DOT_GLOW;
    ctx.fill();

    // Solid dot
    ctx.globalAlpha = ctx.globalAlpha * opacity;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.restore();
  }

  function drawThreeDotLogo(alpha) {
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * alpha;

    var dotR = 5;
    var gap = 16;
    var logoY = cy + scale * 0.65;

    // Three dots
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * gap, logoY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
    }

    // Connecting lines
    ctx.beginPath();
    ctx.moveTo(cx - gap + dotR, logoY);
    ctx.lineTo(cx - dotR, logoY);
    ctx.moveTo(cx + dotR, logoY);
    ctx.lineTo(cx + gap - dotR, logoY);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();

    // "Ask Elijah" text
    ctx.font = "300 14px 'Cormorant Garamond', serif";
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Ask Elijah', cx, logoY + 28);

    ctx.globalAlpha = savedAlpha;
  }

  // ── Kick off ──
  // Don't show auth until animation finishes
  var authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.classList.remove('visible');

  // Use rAF with setTimeout fallback for background tabs
  function scheduleFrame() {
    var scheduled = false;
    requestAnimationFrame(function (ts) {
      if (!scheduled) { scheduled = true; draw(ts); }
    });
    // Fallback if rAF doesn't fire within 50ms (background tab)
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
