/* ── Brain Intro — Constellation Trail ──
   A glowing particle traces the brain outline like a shooting star,
   leaving dots and faded lines in its wake. Then the three-dot logo
   fades in below. ~6s total, then fades to auth screen.              */
(function () {
  'use strict';

  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;

  var overlay = document.getElementById('brain-intro');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var W, H, cx, cy, scale;

  // ── Brain outline — side view (lateral profile) ──
  var brainRaw = [
    [-0.05, 0.32],                                                    // 0  stem
    [-0.20, 0.26], [-0.32, 0.20], [-0.40, 0.14],                   // 1-3
    [-0.44, 0.06], [-0.46, -0.04], [-0.44, -0.14],                 // 4-6
    [-0.40, -0.24], [-0.34, -0.32],                                  // 7-8
    [-0.26, -0.38], [-0.16, -0.42],                                  // 9-10
    [-0.06, -0.44], [0.04, -0.44], [0.14, -0.42],                  // 11-13
    [0.24, -0.40], [0.32, -0.36],                                    // 14-15
    [0.38, -0.30], [0.42, -0.22], [0.44, -0.12],                   // 16-18
    [0.42, -0.02],                                                    // 19
    [0.38, 0.06], [0.34, 0.12],                                      // 20-21
    [0.30, 0.18], [0.28, 0.24], [0.22, 0.28],                      // 22-24
    [0.14, 0.30], [0.06, 0.30],                                      // 25-26
    [-0.05, 0.32]                                                     // 27 close
  ];

  // Brain stem points (drawn after main outline)
  var stemRaw = [
    [-0.05, 0.32], [-0.02, 0.36], [0.00, 0.40]
  ];

  // ── Pre-compute the full path as a polyline with distances ──
  var pathPoints = [];  // {x, y} in normalized coords
  var pathDists = [];   // cumulative distance at each point
  var totalPathLen = 0;

  function buildPath() {
    pathPoints = [];
    pathDists = [];
    totalPathLen = 0;

    // Main outline
    for (var i = 0; i < brainRaw.length; i++) {
      pathPoints.push({ x: brainRaw[i][0], y: brainRaw[i][1] });
    }
    // Stem
    for (var s = 1; s < stemRaw.length; s++) {
      pathPoints.push({ x: stemRaw[s][0], y: stemRaw[s][1] });
    }

    // Compute cumulative distances
    pathDists.push(0);
    for (var j = 1; j < pathPoints.length; j++) {
      var dx = pathPoints[j].x - pathPoints[j - 1].x;
      var dy = pathPoints[j].y - pathPoints[j - 1].y;
      totalPathLen += Math.sqrt(dx * dx + dy * dy);
      pathDists.push(totalPathLen);
    }
  }

  buildPath();

  // ── Interpolate position along the path at distance d ──
  function posAtDist(d) {
    if (d <= 0) return pathPoints[0];
    if (d >= totalPathLen) return pathPoints[pathPoints.length - 1];

    for (var i = 1; i < pathDists.length; i++) {
      if (pathDists[i] >= d) {
        var segLen = pathDists[i] - pathDists[i - 1];
        var t = segLen > 0 ? (d - pathDists[i - 1]) / segLen : 0;
        return {
          x: pathPoints[i - 1].x + (pathPoints[i].x - pathPoints[i - 1].x) * t,
          y: pathPoints[i - 1].y + (pathPoints[i].y - pathPoints[i - 1].y) * t
        };
      }
    }
    return pathPoints[pathPoints.length - 1];
  }

  // ── Find which segment index a distance falls on ──
  function segAtDist(d) {
    for (var i = 1; i < pathDists.length; i++) {
      if (pathDists[i] >= d) return i - 1;
    }
    return pathPoints.length - 2;
  }

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

  // ── Convert normalized to screen ──
  function toScreen(p) {
    return { x: cx + p.x * scale, y: cy + p.y * scale };
  }

  // ── Animation state ──
  var TRACE_DURATION = 5000;  // 5s to trace the outline
  var HOLD_DURATION = 1000;   // 1s hold after complete
  var FADE_DURATION = 800;
  var startTime = null;
  var animating = true;
  var fadingOut = false;
  var fadeStart = null;

  // Trail particles (emitted by the leading light)
  var particles = [];
  var lastEmitDist = -1;

  // ── Draw frame ──
  function draw(now) {
    if (!animating) return;
    if (!startTime) startTime = now;
    var elapsed = now - startTime;

    ctx.clearRect(0, 0, W, H);

    // Fade-out phase
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

    // Trace progress (0→1 over TRACE_DURATION)
    var traceProgress = Math.min(elapsed / TRACE_DURATION, 1);
    // Smooth ease-out for the tracer (fast start, gentle finish)
    var eased = 1 - Math.pow(1 - traceProgress, 2.5);
    var traceDist = eased * totalPathLen;

    // Current segment the tracer has reached
    var currentSeg = segAtDist(traceDist);

    // ── Draw completed trail lines ──
    for (var i = 0; i <= currentSeg && i < pathPoints.length - 1; i++) {
      var a = toScreen(pathPoints[i]);
      var b;
      if (i < currentSeg) {
        b = toScreen(pathPoints[i + 1]);
      } else {
        // Partial segment
        b = toScreen(posAtDist(traceDist));
      }

      // Trail lines fade: older segments are dimmer
      var age = (currentSeg - i) / (pathPoints.length);
      var lineAlpha = 0.15 + 0.20 * (1 - age);
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * lineAlpha;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // ── Draw settled dots at each passed vertex ──
    for (var v = 0; v <= currentSeg && v < pathPoints.length; v++) {
      var dp = toScreen(pathPoints[v]);
      var dotAge = (currentSeg - v) / pathPoints.length;
      var dotAlpha = 0.4 + 0.6 * (1 - dotAge);

      // Soft glow
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * dotAlpha * 0.15;
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // Solid dot
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * dotAlpha;
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // ── Emit trail particles from the leading light ──
    if (traceProgress < 1) {
      var emitInterval = totalPathLen / 200; // ~200 particles over the full path
      while (lastEmitDist < traceDist) {
        lastEmitDist += emitInterval;
        if (lastEmitDist > traceDist) break;
        var ep = posAtDist(lastEmitDist);
        particles.push({
          x: ep.x, y: ep.y,
          life: 1.0,
          vx: (Math.random() - 0.5) * 0.002,
          vy: (Math.random() - 0.5) * 0.002
        });
      }
    }

    // ── Update & draw trail particles ──
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.life -= 0.015;
      pt.x += pt.vx;
      pt.y += pt.vy;
      if (pt.life <= 0) {
        particles.splice(p, 1);
        continue;
      }
      var sp = toScreen(pt);
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * pt.life * 0.4;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 1.5 * pt.life, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // ── Leading light (the "shooting star") ──
    if (traceProgress < 1) {
      var leadPos = toScreen(posAtDist(traceDist));

      // Outer glow
      var grad = ctx.createRadialGradient(leadPos.x, leadPos.y, 0, leadPos.x, leadPos.y, 24);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
      grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.beginPath();
      ctx.arc(leadPos.x, leadPos.y, 24, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Bright core
      ctx.beginPath();
      ctx.arc(leadPos.x, leadPos.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // ── Three-dot logo (fades in near completion) ──
    var logoStart = 0.80;
    if (traceProgress > logoStart) {
      var logoAlpha = (traceProgress - logoStart) / (1 - logoStart);
      drawThreeDotLogo(logoAlpha);
    }

    // ── Trigger fade-out after hold ──
    if (traceProgress >= 1 && !fadingOut) {
      if (elapsed > TRACE_DURATION + HOLD_DURATION) {
        fadingOut = true;
      }
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

    // Three dots
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * gap, logoY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // Connecting lines
    ctx.beginPath();
    ctx.moveTo(cx - gap + dotR, logoY);
    ctx.lineTo(cx - dotR, logoY);
    ctx.moveTo(cx + dotR, logoY);
    ctx.lineTo(cx + gap - dotR, logoY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // "Ask Elijah" text
    ctx.font = "300 14px 'Cormorant Garamond', serif";
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Ask Elijah', cx, logoY + 28);

    ctx.restore();
  }

  // ── Kick off ──
  var authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.classList.remove('visible');

  // rAF with setTimeout fallback for background tabs
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
