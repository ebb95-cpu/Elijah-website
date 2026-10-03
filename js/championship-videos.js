(function () {
  'use strict';
  var screen = document.getElementById('intro-screen');
  var host = document.getElementById('championship-window');
  var toggle = document.getElementById('championship-toggle');
  var loadingStatus = document.getElementById('video-loading-status');
  var loadingRetry = document.getElementById('video-loading-retry');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var clips = [
    { id: 'b8TRAbiS3XY', title: 'WE WON THE NBA CHAMPIONSHIP!!!' },
    { id: 'ZVlqyBLVCso', title: 'Euroleague Final 4 in Serbia' },
    { id: '41KO9GVNT3k', title: 'We are NBA Eastern Conference Champs!' },
    { id: 'xpQVrnmWQMU', title: 'Life of a EuroLeague Player' },
    { id: 'FyMs2ZnzJIY', title: 'Panathinaikos Gameday' },
    { id: 'z67K4GkYcLQ', title: 'Shooting Workout with Elijah Bryant' },
    { id: 'dZ0QLLrw1gk', title: 'Pre-Season with Anadolu Efes in Antalya' },
    { id: '5_s3kuLV6nY', title: 'Inside Zalgiris' },
    { id: 'eQGqUC9VRD8', title: 'I Play Basketball in Turkey' },
    { id: 'Dm13mzizIxg', title: 'My First NBA Preseason Games' },
    { id: '-gIR8eO3oPE', title: 'Training for My EuroLeague Season' },
    { id: 'yvupQzsyWxk', title: 'Cyprus with Milwaukee Bucks' },
    { id: 'JuB5TOBGuoY', title: 'Leaving Israel for the NBA' },
    { id: 'GUnna725P7Y', title: 'Preseason Shenanigans with the Efes Squad' },
    { id: 'jD2vnfjKxEQ', title: 'EuroLeague Basketball Travel Vlog: Panathinaikos' },
    { id: 'ev2BC96xRts', title: 'If We Win This, We Face the Champs' },
    { id: 'Ys1Kia_u6Uk', title: 'Preparing for Panathinaikos - A FULL DAY with Elijah Bryant' },
    { id: 'GGl1BLJ_RoU', title: 'I Had the Best Game of My EuroLeague Career' },
    { id: 'yL2z0Qdc4Kg', title: 'OLYMPIACOS Got a New Stadium? (+Gameday Vlog)' },
    { id: '2-ZmUXcfV70', title: "Inside Europe's Most LUXURIOUS Basketball Arena" },
    { id: 'FMNcmYuC7ZA', title: 'MACCABI: Huge Derby Match against my old team' },
    { id: 'a7k0_p-2yvE', title: 'EFES: Playing Against My Old Team For The First Time' },
    { id: '-THV_hsYxg4', title: 'First EVER Euroleague Win for my New Team Hapoel Tel Aviv' },
    { id: 'Pl5Nsvay0u8', title: 'Euroleague Begins: Getting to Know My New Team' }
  ];
  var visitClips;
  var previousKey = 'elijah-background-videos';
  var paused = reduced.matches;
  var resizeTimer;
  var layout = '';
  var active = false;
  var players = [];
  var apiRequested = false;
  var revealTimer;
  var revealed = false;
  var autoplayBlocked = false;
  var wasAway = false;
  var startupTimers = [];

  function updateToggle() {
    toggle.textContent = paused || autoplayBlocked ? 'Play videos' : 'Pause videos';
    toggle.setAttribute('aria-pressed', String(!paused && !autoplayBlocked));
  }

  function reveal() {
    if (revealed) return;
    clearTimeout(revealTimer);
    revealed = true;
    loadingRetry.hidden = true;
    screen.classList.remove('videos-loading');
    screen.setAttribute('aria-busy', 'false');
    host.inert = false;
    document.getElementById('intro-inner').inert = false;
  }

  function fallback() {
    if (revealed) return;
    loadingStatus.textContent = 'Waiting for videos to start.';
    loadingRetry.hidden = false;
  }

  function loadAPI() {
    if (apiRequested) return;
    apiRequested = true;
    window.onYouTubeIframeAPIReady = sync;
    var script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = function () { apiRequested = false; fallback(); };
    document.head.appendChild(script);
  }

  function shuffleVisit() {
    var previous = [];
    try {
      var saved = JSON.parse(localStorage.getItem(previousKey) || '[]');
      if (Array.isArray(saved)) previous = saved;
    } catch (_) { /* Storage may be unavailable in private browsing. */ }
    var shuffled = clips.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var clip = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = clip;
    }
    // Prioritize videos absent from the last visit, then fill with shuffled favorites.
    visitClips = shuffled.filter(function (clip) { return !previous.includes(clip.id); })
      .concat(shuffled.filter(function (clip) { return previous.includes(clip.id); }));
    layout = '';
  }
  shuffleVisit();

  function stop() {
    startupTimers.forEach(clearTimeout);
    startupTimers = [];
    players.forEach(function (player) { player.destroy(); });
    players = [];
    host.querySelectorAll('iframe').forEach(function (frame) { frame.remove(); });
    active = false;
  }

  function buildGrid() {
    // A narrow desktop preview must keep the desktop video wall.
    var phonePreview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('preview') === 'phone';
    var phone = phonePreview || matchMedia('(pointer: coarse) and (hover: none)').matches &&
      (screen.clientWidth <= 600 || (screen.clientWidth <= 950 && screen.clientHeight <= 500));
    var columns = phone ? 1 : Math.min(5, Math.max(3, Math.floor(screen.clientWidth / 300)));
    var tileHeight = (screen.clientWidth - (columns - 1) * 8) / columns * 9 / 16;
    var rows = phone ? 3 : Math.min(Math.floor(clips.length / columns), Math.ceil((screen.clientHeight + 8) / (tileHeight + 8)));
    host.classList.toggle('phone-video-wall', phone);
    host.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(0, 1fr))';
    host.style.gridTemplateRows = phone ? 'repeat(3, minmax(0, 1fr))' : 'repeat(' + rows + ', ' + tileHeight + 'px)';
    var nextLayout = columns + ':' + rows;
    if (layout === nextLayout) return;
    stop();
    layout = nextLayout;
    host.replaceChildren();
    for (var i = 0; i < columns * rows; i++) {
      var clip = visitClips[i];
      var tile = document.createElement('a');
      tile.className = 'championship-tile';
      tile.href = 'https://www.youtube.com/watch?v=' + clip.id;
      tile.target = '_blank';
      tile.rel = 'noopener noreferrer';
      tile.setAttribute('aria-label', 'Watch ' + clip.title + ' on YouTube (opens in a new tab)');
      tile.title = 'Watch ' + clip.title + ' on YouTube';
      tile.dataset.clip = String(i);
      tile.dataset.start = String(Math.floor(Math.random() * 91));
      var poster = document.createElement('img');
      poster.src = 'https://i.ytimg.com/vi/' + clip.id + '/hqdefault.jpg';
      poster.alt = '';
      tile.appendChild(poster);
      host.appendChild(tile);
    }
    host.hidden = false;
    try {
      localStorage.setItem(previousKey, JSON.stringify(visitClips.slice(0, columns * rows).map(function (clip) { return clip.id; })));
    } catch (_) { /* Randomization still works without persistent storage. */ }
  }

  function playGrid() {
    host.querySelectorAll('.championship-tile').forEach(function (tile, index) {
      var clip = visitClips[Number(tile.dataset.clip)];
      var mount = document.createElement('div');
      tile.appendChild(mount);
      var frame;
      var player = new YT.Player(mount, {
        videoId: clip.id,
        playerVars: {
          autoplay: 1, mute: 1, playsinline: 1, controls: 0, rel: 0,
          loop: 1, playlist: clip.id, start: Number(tile.dataset.start), origin: location.origin
        },
        events: {
        onReady: function (event) {
          frame = event.target.getIframe();
          if (!frame.isConnected || !active) return;
          frame.dataset.ready = 'true';
          event.target.mute();
          event.target.playVideo();
        },
        onStateChange: function (event) {
          if (!frame.isConnected) return;
          frame.dataset.state = String(event.data);
          frame.dataset.playing = String(event.data === YT.PlayerState.PLAYING);
          if (event.data !== YT.PlayerState.PLAYING) return;
          frame.dataset.playing = 'true';
          autoplayBlocked = false;
          updateToggle();
          if (!revealed && host.querySelectorAll('iframe[data-playing="true"]').length === host.children.length) reveal();
        },
        onAutoplayBlocked: function () {
          if (!frame.isConnected) return;
          frame.dataset.blocked = 'true';
          autoplayBlocked = true;
          updateToggle();
          fallback();
        },
        onError: function (event) {
          if (!frame.isConnected) return;
          frame.dataset.error = String(event.data);
          frame.style.visibility = 'hidden';
          fallback();
        }
      } });
      frame = player.getIframe();
      frame.title = clip.title;
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.allow = 'autoplay; encrypted-media';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      players.push(player);
      [1500, 4000, 8000].forEach(function (delay) {
        startupTimers.push(setTimeout(function () {
          if (!active || paused || document.hidden || !frame.isConnected ||
              frame.dataset.blocked || frame.dataset.error || frame.dataset.playing === 'true') return;
          if (typeof player.playVideo === 'function') { player.mute(); player.playVideo(); }
        }, delay));
      });
    });
  }

  function sync() {
    var home = !screen.classList.contains('fading') && getComputedStyle(screen).display !== 'none';
    if (!home || document.hidden) wasAway = true;
    if (home && !document.hidden && wasAway) {
      stop();
      shuffleVisit();
      autoplayBlocked = false;
      wasAway = false;
    }
    toggle.hidden = !home;
    updateToggle();
    if (home) buildGrid();
    if (!home || paused || document.hidden) {
      stop();
      if (paused || !home) reveal();
      return;
    }
    if (!revealed && !revealTimer) revealTimer = setTimeout(fallback, 15000);
    if (!window.YT || !window.YT.Player) { loadAPI(); return; }
    if (!active) { active = true; playGrid(); }
  }
  loadingRetry.addEventListener('click', function () {
    loadingStatus.textContent = 'Loading videos...';
    loadingRetry.hidden = true;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(fallback, 15000);
    if (autoplayBlocked) {
      players.forEach(function (player) {
        if (typeof player.playVideo === 'function') { player.mute(); player.playVideo(); }
      });
    } else {
      stop();
      sync();
    }
  });
  toggle.addEventListener('click', function () {
    if (autoplayBlocked && !paused) {
      autoplayBlocked = false;
      players.forEach(function (player) {
        if (typeof player.playVideo === 'function') { player.mute(); player.playVideo(); }
      });
      sync();
    } else {
      paused = !paused;
      sync();
    }
  });
  // Browsers that block muted autoplay can retry on the visitor's first interaction.
  function retryAutoplay(event) {
    if (!autoplayBlocked || paused || !active || toggle.contains(event.target)) return;
    players.forEach(function (player) {
      if (typeof player.playVideo === 'function') { player.mute(); player.playVideo(); }
    });
  }
  screen.addEventListener('pointerdown', retryAutoplay);
  screen.addEventListener('keydown', retryAutoplay);
  reduced.addEventListener('change', function () { paused = reduced.matches; sync(); });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', function () {
    clearTimeout(revealTimer);
    revealTimer = null;
    stop();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      stop();
      shuffleVisit();
      wasAway = false;
      paused = reduced.matches;
      autoplayBlocked = false;
      revealed = false;
      revealTimer = null;
      screen.classList.add('videos-loading');
      screen.setAttribute('aria-busy', 'true');
      host.inert = true;
      document.getElementById('intro-inner').inert = true;
    }
    sync();
  });
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sync, 200);
  });
  var observer = new MutationObserver(sync);
  observer.observe(screen, { attributes: true, attributeFilter: ['class', 'style'] });
  sync();
}());
