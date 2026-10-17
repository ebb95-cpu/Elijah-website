/* Guide orbit: drag the heartbeat dot along a spoke line to a guide to open it.
   The dot snaps to the spoke nearest the pointer's angle and can only travel along that line
   (center -> guide). It can switch spokes only while it is near the center. Release near the guide
   opens it; release anywhere else slides the dot back to the center. */
(function () {
  var orbit = document.getElementById('guide-orbit');
  if (!orbit || !window.PointerEvent) return;
  var dot = orbit.querySelector('.orbit-center span');
  if (!dot) return;
  var nodes = Array.prototype.slice.call(orbit.querySelectorAll('.guide-node'));
  var lines = Array.prototype.slice.call(orbit.querySelectorAll('.orbit-line'));
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // Pack every guide on one ring; circle size shrinks as the library grows.
  function layoutOrbit() {
    var n = nodes.length;
    if (!n) return;
    var R = n > 10 ? 40 : 42; // % from center
    var size = n > 12 ? 'clamp(64px, 14vw, 96px)' : (n > 8 ? 'clamp(72px, 16vw, 110px)' : '');
    for (var i = 0; i < n; i++) {
      // Start at top (-90deg), even spacing around full circle.
      var ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      var x = 50 + R * Math.cos(ang);
      var y = 50 + R * Math.sin(ang);
      nodes[i].style.left = x.toFixed(2) + '%';
      nodes[i].style.top = y.toFixed(2) + '%';
      if (size) nodes[i].style.width = size;
      if (lines[i]) {
        var deg = (ang * 180 / Math.PI);
        lines[i].style.transform = 'rotate(' + deg.toFixed(2) + 'deg)';
        lines[i].style.width = R + '%';
      }
    }
    // Hide spare lines if any
    for (var j = n; j < lines.length; j++) lines[j].style.display = 'none';
  }
  layoutOrbit();
  window.addEventListener('resize', layoutOrbit);
  var SWITCH_RADIUS = 24;   // px from the center where the dot may change spokes
  var OPEN_FRACTION = 0.85; // how far along the line counts as "at the guide"
  var NEAR_FRACTION = 0.5;  // start hinting the guide from here
  var drag = null, target = null, near = null;

  function centerOf(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }
  function buildSpokes(cx, cy) {
    return nodes.map(function (n, i) {
      var c = centerOf(n), vx = c.x - cx, vy = c.y - cy, len = Math.sqrt(vx * vx + vy * vy) || 1;
      var rad = (n.offsetWidth || c.w) / 2;
      return { node: n, line: lines[i] || null, ux: vx / len, uy: vy / len, len: len, ang: Math.atan2(vy, vx),
               open: Math.min(len * OPEN_FRACTION, len - rad), active: n.hasAttribute('href') };
    });
  }
  function angleDiff(a, b) { var d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; }
  function nearestSpoke(x, y) {
    var a = Math.atan2(y, x), best = null, bd = Infinity;
    for (var i = 0; i < drag.spokes.length; i++) { var d = angleDiff(a, drag.spokes[i].ang); if (d < bd) { bd = d; best = drag.spokes[i]; } }
    return best;
  }
  function setClass(cur, n, cls) { if (cur === n) return cur; if (cur) cur.classList.remove(cls); if (n) n.classList.add(cls); return n; }
  function setSpokeLine(s) {
    lines.forEach(function (l) { l.classList.toggle('is-drag-line', !!(s && s.line === l)); });
  }
  function place(t) { var s = drag.spoke; dot.style.translate = s ? (s.ux * t).toFixed(2) + 'px ' + (s.uy * t).toFixed(2) + 'px' : '0px 0px'; }
  function springBack() {
    dot.classList.toggle('is-returning', !(reduce && reduce.matches));
    dot.style.translate = '0px 0px';
  }
  function finish(e, cancelled) {
    if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    var id = drag.id; drag = null;
    try { if (dot.hasPointerCapture && dot.hasPointerCapture(id)) dot.releasePointerCapture(id); } catch (err) {}
    dot.classList.remove('is-dragging');
    orbit.classList.remove('is-dragging');
    var hit = cancelled ? null : target;
    target = setClass(target, null, 'is-drop-target');
    near = setClass(near, null, 'is-drop-near');
    setSpokeLine(null);
    springBack();
    if (hit) hit.click(); // same as clicking that guide circle
  }

  dot.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dot.classList.remove('is-returning');
    dot.style.translate = '0px 0px';
    var c = centerOf(dot);
    drag = { id: e.pointerId, cx: c.x, cy: c.y, px: e.clientX, py: e.clientY, spokes: buildSpokes(c.x, c.y), spoke: null, t: 0 };
    try { dot.setPointerCapture(e.pointerId); } catch (err) {}
    dot.classList.add('is-dragging');
    orbit.classList.add('is-dragging');
  });
  dot.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    // Where the pointer wants the dot to be, relative to the center (grab offset removed).
    var x = e.clientX - drag.px, y = e.clientY - drag.py;
    var dist = Math.sqrt(x * x + y * y);
    if (!drag.spoke || drag.t < SWITCH_RADIUS) {
      if (dist > 4) drag.spoke = nearestSpoke(x, y);
    }
    var s = drag.spoke;
    if (!s) return;
    var t = Math.max(0, Math.min(s.len, x * s.ux + y * s.uy)); // project onto the line, clamp center..guide
    drag.t = t;
    place(t);
    setSpokeLine(t > 2 ? s : null);
    target = setClass(target, s.active && t >= s.open ? s.node : null, 'is-drop-target');
    near = setClass(near, s.active && t >= s.len * NEAR_FRACTION && t < s.open ? s.node : null, 'is-drop-near');
  });
  dot.addEventListener('pointerup', function (e) { finish(e, false); });
  dot.addEventListener('pointercancel', function (e) { finish(e, true); });
  dot.addEventListener('lostpointercapture', function (e) { if (drag) finish(e, true); });
  dot.addEventListener('transitionend', function (e) { if (e.propertyName === 'translate') dot.classList.remove('is-returning'); });
  dot.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // Keep the page from scrolling while a finger is dragging the dot (iOS ignores touch-action in some cases).
  document.addEventListener('touchmove', function (e) { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', function (e) { if (drag && e.key === 'Escape') finish(null, true); });
  // Coming back with the browser Back button: make sure the dot is home.
  window.addEventListener('pageshow', function () {
    drag = null; target = setClass(target, null, 'is-drop-target'); near = setClass(near, null, 'is-drop-near'); setSpokeLine(null);
    dot.classList.remove('is-dragging', 'is-returning'); orbit.classList.remove('is-dragging'); dot.style.translate = '0px 0px';
  });
})();
