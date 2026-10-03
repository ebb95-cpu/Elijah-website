(function () {
  'use strict';
  var screen = document.getElementById('intro-screen'), host = document.getElementById('championship-window');
  var toggle = document.getElementById('championship-toggle'), status = document.getElementById('video-loading-status');
  var retry = document.getElementById('video-loading-retry'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var saveData = !!(connection && connection.saveData);
  var manifest, videos = [], paused = reduced.matches || saveData, blocked = false, away = false, layout, timer, revealed = false;
  var previous = [], key = 'elijah-native-selection';
  var startupTimers = [];
  var phoneUsed = new Set(), phoneActive = [], phoneGeneration = 0;
  function nextPhoneClip(slot) {
    var occupied = phoneActive.filter(function (_, index) { return index !== slot; });
    var available = manifest.clips.filter(function (clip) {
      return !occupied.some(function (other) { return other.sourceId === clip.sourceId; }) &&
        (!phoneActive[slot] || clip.src !== phoneActive[slot].src);
    });
    var unseen = available.filter(function (clip) { return !phoneUsed.has(clip.src); });
    if (!unseen.length && manifest.clips.every(function (clip) { return phoneUsed.has(clip.src); })) {
      phoneUsed.clear();
      phoneActive.forEach(function (clip) { phoneUsed.add(clip.src); });
      unseen = available.filter(function (clip) { return !phoneUsed.has(clip.src); });
    }
    var clip = unseen[Math.floor(Math.random() * unseen.length)];
    if (clip) { phoneUsed.add(clip.src); phoneActive[slot] = clip; }
    return clip;
  }
  function mountPhoneClip(clip, slot, oldTile, generation) {
    var tile = link(clip), media = video(clip.src);
    var container = oldTile ? oldTile.parentElement : document.createElement('div');
    container.className = 'native-phone-tile';
    container.style.position = 'relative';
    Object.assign(tile.style, { position: 'absolute', inset: '0', display: 'block' });
    tile.appendChild(media);
    media.loop = false;
    media.playbackRate = 0.75;
    if (oldTile) {
      // Keep the last decoded frame visible until the replacement is playing.
      tile.style.opacity = '0';
      container.appendChild(tile);
      var oldMedia = oldTile.querySelector('video');
      videos = videos.filter(function (v) { return v !== oldMedia; });
      media.addEventListener('playing', function swap() {
        if (generation !== phoneGeneration || !oldTile.isConnected) return;
        tile.style.opacity = '1'; oldTile.remove();
        oldMedia.pause(); oldMedia.removeAttribute('src'); oldMedia.load();
      }, { once: true });
    } else { container.appendChild(tile); host.appendChild(container); }
    function advance() {
      if (paused || away || document.hidden || generation !== phoneGeneration) return;
      var next = nextPhoneClip(slot);
      if (next) { mountPhoneClip(next, slot, tile, generation); play(); }
      else setTimeout(advance, 500);
    }
    media.addEventListener('ended', advance);
    media.addEventListener('play', function () { if (media.ended) advance(); });
  }
  function clearStartup() { startupTimers.forEach(clearTimeout); startupTimers = []; }
  try { previous = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) {}
  if (!Array.isArray(previous)) previous = [];
  function phone() {
    return location.hostname === 'localhost' && new URLSearchParams(location.search).get('preview') === 'phone' ||
      matchMedia('(pointer: coarse) and (hover: none)').matches && (innerWidth <= 600 || innerWidth <= 950 && innerHeight <= 500);
  }
  function choose(items, count) {
    var list = items.slice();
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
    list = list.filter(function (x) { return !previous.includes(x.src); }).concat(list.filter(function (x) { return previous.includes(x.src); }));
    if (count > 1) {
      var sources = [];
      list = list.filter(function (x) {
        if (!x.sourceId) return true;
        if (sources.includes(x.sourceId)) return false;
        sources.push(x.sourceId); return true;
      });
    }
    list = list.slice(0, count);
    previous = list.map(function (x) { return x.src; });
    try { localStorage.setItem(key, JSON.stringify(previous)); } catch (_) {}
    return list;
  }
  function update() { toggle.textContent = paused || blocked ? 'Play videos' : 'Pause videos'; toggle.setAttribute('aria-pressed', String(!paused && !blocked)); }
  function reveal() {
    revealed = true; clearTimeout(timer); clearStartup(); retry.hidden = true;
    screen.classList.remove('videos-loading', 'videos-stalled'); screen.setAttribute('aria-busy', 'false');
    host.inert = false;
    var inner = document.getElementById('intro-inner');
    if (inner) inner.inert = false;
  }
  function stalled() {
    if (revealed) return;
    screen.classList.add('videos-stalled');
    status.textContent = blocked ? 'Tap to start the videos.' : 'Waiting for videos to load.';
    retry.hidden = false;
  }
  function play() {
    if (paused || document.hidden || away) return;
    blocked = false;
    videos.forEach(function (v) { if (!v.paused) return; v.muted = true; v.play().catch(function (e) {
      if (!v.isConnected || e.name === 'AbortError') return;
      blocked = true; update(); stalled();
    }); }); update();
  }
  function startPlayback() {
    clearStartup();
    // Allow the newly inserted media to reach layout before requesting playback.
    requestAnimationFrame(function () { requestAnimationFrame(play); });
    startupTimers = [300, 1000, 2500].map(function (delay) { return setTimeout(play, delay); });
  }
  function video(src) {
    var v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.autoplay = !paused; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.preload = paused ? 'none' : 'auto';
    v.addEventListener('loadeddata', function () { if (v.isConnected && !revealed) play(); });
    v.addEventListener('playing', function () {
      if (!v.isConnected) return;
      blocked = false; update();
      if (videos.length && videos.every(function (x) { return !x.paused && x.readyState >= 2; })) reveal();
    });
    v.addEventListener('error', stalled); v.src = src; videos.push(v); return v;
  }
  function link(clip) {
    if (!clip.href) { var tile = document.createElement('div'); tile.setAttribute('aria-hidden', 'true'); return tile; }
    var a = document.createElement('a'); a.href = clip.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.title = 'Watch ' + clip.title + ' on YouTube'; a.setAttribute('aria-label', 'Watch ' + clip.title + ' on YouTube (opens in a new tab)'); return a;
  }
  function render() {
    clearStartup();
    phoneGeneration++;
    videos.forEach(function (v) { v.pause(); v.removeAttribute('src'); v.load(); }); videos = [];
    host.replaceChildren(); host.removeAttribute('style'); layout = phone();
    host.className = layout ? 'native-video-wall phone-video-wall' : 'native-video-wall desktop-video-wall';
    revealed = false; blocked = false; screen.classList.add('videos-loading'); screen.classList.remove('videos-stalled'); screen.setAttribute('aria-busy', 'true');
    host.inert = true; status.textContent = ''; retry.hidden = true;
    var featured = manifest.clips.find(function (clip) { return clip.featured; });
    var pool = layout && featured ? manifest.clips.filter(function (clip) { return clip.sourceId !== featured.sourceId; }) : manifest.clips;
    var selected = choose(layout ? pool : manifest.variants, layout ? (featured ? 2 : 3) : 1);
    if (layout && featured) selected.splice(Math.floor(Math.random() * 3), 0, featured);
    if (layout) {
      // Start with the championship trophy and a different EuroLeague source.
      var euro = manifest.clips.find(function (clip) { return clip.id === 'ZVlqyBLVCso-3'; });
      if (featured && euro) {
        var third = selected.find(function (clip) { return clip.sourceId !== featured.sourceId && clip.sourceId !== euro.sourceId; });
        if (!third) third = manifest.clips.find(function (clip) { return clip.sourceId !== featured.sourceId && clip.sourceId !== euro.sourceId; });
        selected = [featured, euro, third].filter(Boolean);
      }
      phoneActive = selected.slice(); phoneUsed = new Set(selected.map(function (clip) { return clip.src; }));
      selected.forEach(function (clip, slot) { mountPhoneClip(clip, slot, null, phoneGeneration); });
    }
    else {
      var plane = document.createElement('div'); plane.className = 'native-mosaic';
      var source = video(selected[0].src); plane.appendChild(source);
      plane.style.width = '100%';
      plane.style.height = '100%';
      var canvas = document.createElement('canvas'); plane.appendChild(canvas);
      var context = canvas.getContext('2d');
      var tiles = [];
      selected[0].order.forEach(function (index, cell) {
        var a = link(manifest.clips[index]); a.className = 'native-mosaic-link';
        var box = selected[0].cells ? selected[0].cells[cell] : {x:cell % 4 * 324,y:Math.floor(cell / 4) * 184,width:320,height:180};
        tiles.push({element:a,box:box}); plane.appendChild(a);
      }); host.appendChild(plane);
      // Reframe one decoded video into responsive, undistorted thumbnail tiles.
      function paint() {
        if (!plane.isConnected) return;
        var width = plane.clientWidth, height = plane.clientHeight;
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        var columns = width < 900 ? 3 : 4, rows = Math.ceil(tiles.length / columns), gap = 8;
        var tileWidth = Math.max((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows * 16 / 9);
        var tileHeight = tileWidth * 9 / 16;
        var left = (width - columns * tileWidth - (columns - 1) * gap) / 2;
        var top = (height - rows * tileHeight - (rows - 1) * gap) / 2;
        context.fillStyle = '#080808'; context.fillRect(0,0,width,height);
        tiles.forEach(function (tile,i) {
          var x = left + i % columns * (tileWidth + gap), y = top + Math.floor(i / columns) * (tileHeight + gap);
          Object.assign(tile.element.style,{left:x+'px',top:y+'px',width:tileWidth+'px',height:tileHeight+'px'});
          if (source.readyState >= 2) {
            context.save(); context.beginPath(); context.roundRect(x,y,tileWidth,tileHeight,6); context.clip();
            var b = tile.box; context.drawImage(source,b.x,b.y,b.width,b.height,x,y,tileWidth,tileHeight); context.restore();
          }
        });
        requestAnimationFrame(paint);
      }
      paint();
    }
    host.hidden = false; toggle.hidden = false; clearTimeout(timer); timer = setTimeout(stalled, 12000);
    if (paused) reveal(); else startPlayback(); update();
  }
  function introHidden() {
    return document.hidden || screen.classList.contains('fading') || getComputedStyle(screen).display === 'none';
  }
  function sync() {
    if (introHidden()) {
      away = true; clearStartup(); videos.forEach(function (v) { v.pause(); }); return;
    }
    if (!manifest) { load(); return; }
    if (away || layout !== phone()) { away = false; render(); }
  }
  var loadingManifest = false;
  function load() {
    if (introHidden() || manifest || loadingManifest) return;
    loadingManifest = true;
    fetch('videos/background/manifest.json').then(function (r) { if (!r.ok) throw Error('Unavailable'); return r.json(); })
      .then(function (data) { manifest = data; if (!introHidden()) render(); }).catch(function () { screen.classList.add('videos-stalled'); status.textContent = 'Unable to load videos. Please retry.'; retry.hidden = false; });
  }
  retry.addEventListener('click', function () { retry.hidden = true; if (!manifest) load(); else { videos.forEach(function (v) { if (v.error) v.load(); }); play(); } });
  toggle.addEventListener('click', function () {
    if (!manifest) { paused = false; saveData = false; load(); return; }
    paused = blocked ? false : !paused; if (paused) videos.forEach(function (v) { v.pause(); }); else play(); update();
  });
  screen.addEventListener('pointerdown', function (e) { if (blocked && !paused && e.target !== toggle && e.target !== retry) play(); });
  reduced.addEventListener('change', function () { paused = reduced.matches; if (manifest) render(); });
  document.addEventListener('visibilitychange', sync); window.addEventListener('resize', sync);
  window.addEventListener('pagehide', function () { away = true; videos.forEach(function (v) { v.pause(); }); }); window.addEventListener('pageshow', sync);
  new MutationObserver(sync).observe(screen, { attributes: true, attributeFilter: ['class', 'style'] });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (saveData) { paused = true; toggle.hidden = false; update(); }
  else load();
}());
