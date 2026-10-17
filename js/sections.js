(function () {
  'use strict';

  var askScreen      = document.getElementById('ask-screen');
  var sectionsScreen = document.getElementById('sections-screen');
  var askClose       = document.getElementById('ask-close');
  var askSubmit      = document.getElementById('ask-submit');
  var askEmail       = document.getElementById('ask-email');
  var askResponse    = document.getElementById('ask-response');

  var journeySkipped = false;
  var requestedEntryLevel = new URLSearchParams(window.location.search).get('menu');
  var directEntryHandled = false;
  // History state survives both a cached Back navigation and a full page reload.
  function handleDirectEntry() {
    var returningToSections = window.history.state && window.history.state.returnToSections;
    if ((!returningToSections && requestedEntryLevel !== 'resources') || directEntryHandled) return;
    directEntryHandled = true;
    ['intro-screen', 'reflection-screen', 'journey-screen'].forEach(function (id) {
      document.getElementById(id).style.display = 'none';
    });
    showSections();
    if (returningToSections && requestedEntryLevel !== 'resources') {
      setTimeout(function () { document.getElementById('rbtn').click(); }, 140);
    }
  }
  window.addEventListener('pageshow', handleDirectEntry);
  handleDirectEntry();

  // ─── Core screen transitions ──────────────────────────────────────────────

  function showSections() {
    sectionsScreen.classList.add('visible');
    document.body.style.overflow = 'auto';
    setTimeout(initCanvas, 100);
  }

  // ─── Ask Elijah modal ─────────────────────────────────────────────────────

  function openAsk() {
    askScreen.classList.add('visible');
    askScreen.removeAttribute('inert');
    sectionsScreen.inert = true;
    askEmail.focus();
  }

  function closeAsk() {
    askScreen.classList.remove('visible');
    askScreen.setAttribute('inert', '');
    sectionsScreen.inert = false;
    document.getElementById('rbtn').click();
  }

  async function handleNotify() {
    if (askSubmit.disabled) return;
    var email = askEmail.value.trim();
    if (!email || !askEmail.reportValidity()) {
      return;
    }
    askSubmit.disabled = true;
    askSubmit.setAttribute('aria-busy', 'true');
    askResponse.textContent = 'Joining the waitlist...';
    askResponse.style.display = 'block';
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, website: document.getElementById('ask-website').value }),
        signal: AbortSignal.timeout(35000)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to sign up. Please try again.');
      askResponse.textContent = result.message;
      askEmail.value = '';
    } catch (error) {
      askResponse.textContent = error instanceof TypeError || error.name === 'TimeoutError'
        ? 'We could not reach the signup service. Please try again.'
        : error.message || 'Unable to sign up. Please try again.';
    } finally {
      askSubmit.disabled = false;
      askSubmit.removeAttribute('aria-busy');
    }
  }

  askClose.addEventListener('click', closeAsk);
  askScreen.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAsk();
  });
  askSubmit.addEventListener('click', handleNotify);
  askEmail.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleNotify();
  });

  askScreen.addEventListener('click', function (e) {
    if (e.target === askScreen) closeAsk();
  });

  // ─── Skip slider (during journey map animation) ───────────────────────────

  var skipBtn = document.getElementById('skip-btn');
  if (skipBtn) {
    var skipTrack = skipBtn.querySelector('.skip-slider-track');
    var skipFill = skipBtn.querySelector('.skip-slider-fill');
    var skipHandle = skipBtn.querySelector('.skip-slider-handle');
    var skipDragging = false;
    var skipProgress = 0;

    function setSkipProgress(progress) {
      var clamped = Math.max(0, Math.min(1, progress));
      var width = skipTrack.offsetWidth;
      var start = skipHandle.offsetWidth / 2;
      var end = width - start;
      var x = start + (end - start) * clamped;
      skipProgress = clamped;
      skipHandle.style.left = x + 'px';
      skipFill.style.width = Math.max(0, x - start) + 'px';
    }

    function resetSkipSlider() {
      skipHandle.style.transition = 'left 0.28s ease';
      skipFill.style.transition = 'width 0.28s ease';
      setSkipProgress(0);
      setTimeout(function () {
        skipHandle.style.transition = '';
        skipFill.style.transition = '';
      }, 300);
    }

    function runSkip() {
      journeySkipped = true;
      var journeyScreen = document.getElementById('journey-screen');
      journeyScreen.style.transition = 'opacity 0.6s ease';
      journeyScreen.style.opacity = '0';
      journeyScreen.style.pointerEvents = 'none';
      setTimeout(showSections, 650);
    }

    function getSkipClientX(event) {
      return event.touches && event.touches.length ? event.touches[0].clientX : event.clientX;
    }

    function startSkipDrag(event) {
      skipDragging = true;
      if (event.pointerId !== undefined && event.currentTarget && event.currentTarget.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      var rect = skipTrack.getBoundingClientRect();
      var inset = skipHandle.offsetWidth / 2;
      setSkipProgress((getSkipClientX(event) - rect.left - inset) / (rect.width - inset * 2));
      event.preventDefault();
    }

    skipHandle.addEventListener('pointerdown', startSkipDrag);
    skipTrack.addEventListener('pointerdown', startSkipDrag);
    skipHandle.addEventListener('mousedown', startSkipDrag);
    skipTrack.addEventListener('mousedown', startSkipDrag);
    skipHandle.addEventListener('touchstart', startSkipDrag, { passive: false });
    skipTrack.addEventListener('touchstart', startSkipDrag, { passive: false });

    function moveSkipDrag(event) {
      if (!skipDragging) return;
      var rect = skipTrack.getBoundingClientRect();
      var inset = skipHandle.offsetWidth / 2;
      setSkipProgress((getSkipClientX(event) - rect.left - inset) / (rect.width - inset * 2));
      event.preventDefault();
    }

    window.addEventListener('pointermove', moveSkipDrag);
    window.addEventListener('mousemove', moveSkipDrag);
    window.addEventListener('touchmove', moveSkipDrag, { passive: false });

    function endSkipDrag() {
      if (!skipDragging) return;
      skipDragging = false;
      if (skipProgress >= 0.95) {
        runSkip();
      } else {
        resetSkipSlider();
      }
    }

    window.addEventListener('pointerup', endSkipDrag);
    window.addEventListener('mouseup', endSkipDrag);
    window.addEventListener('touchend', endSkipDrag);
  }

  // ─── Journey complete → show sections ────────────────────────────────────

  document.addEventListener('journeyComplete', function () {
    if (journeySkipped) return;
    setTimeout(showSections, 800);
  });

  // ─── Canvas dot navigation ───────────────────────────────────────────────

  var canvasInited = false;

  // Level definitions (dot-based levels)
  var LEVELS = {
    main: [
      { id:'ask', label:'Ask Elijah', desc:'Advice from an NBA champion. Join the waitlist.', angle:-60 },
      { id:'news', label:'Newsletter', desc:'Faith, family, and consistency in your inbox.', angle:0 },
      { id:'social', label:'Socials', desc:'Life on and off the court.', angle:60 },
      { id:'res', label:'Player Tool Kit', desc:'Tools I use on and off the court.', angle:-120 },
      { id:'contact', label:'Contact', desc:'Partnerships, speaking, and other inquiries.', angle:120 },
      { id:'merch', label:'Merch', desc:'Consistency Club merch. Opens in a new tab.', angle:180, url:'/merch' },
    ],
    resources: [
      { id:'back',   label:'Back',   desc:'', angle:180, isBack:true },
      { id:'books',  label:'Books',  desc:'reads \u00b7 recommendations \u00b7 growth',  angle:-52 },
      { id:'guides', label:'Guides', desc:'frameworks \u00b7 plans \u00b7 resources',    angle:52  },
    ]
  };

  var GUIDE_RESOURCES = [
    { id:'agent-questions', title:'Agent Questions Guide', author:'Available', genre:'career', cover:'resources/guides/agent-questions/agent-questions-circle-thumbnail.png', url:'https://yourplaybook.beehiiv.com/products/agent-questions-guide-2026' },
    { id:'contract-checklist', title:'Contract Checklist Guide', author:'Available', genre:'career', cover:'resources/guides/contract-checklist/contract-checklist-circle-thumbnail.png', url:'https://yourplaybook.beehiiv.com/products/contract-checklist-guide-2026' },
    { id:'packing-guide', title:'Packing Guide', author:'Available', genre:'life', cover:'resources/guides/packing-guide/packing-guide-circle-thumbnail.png', url:'https://yourplaybook.beehiiv.com/products/overseas-packing-guide-2026' },
    { id:'financial-guide', title:'Financial Guide', author:'Available', genre:'life', cover:'resources/guides/money-overseas/money-overseas-circle-thumbnail.png?v=2', url:'https://yourplaybook.beehiiv.com/products/money-overseas-guide-2026' },
    { id:'film-study', title:'Film Study Guide', author:'Available', genre:'basketball', cover:'resources/guides/film-study/assets/film-study-circle-thumbnail.jpg?v=2', url:'https://yourplaybook.beehiiv.com/products/film-study-guide-2026' },
    { id:'body-tools', title:'Body Tools Guide', author:'Available', genre:'performance', cover:'resources/guides/body-tools/body-tools-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/body-tools-guide-2026' },
    { id:'tools-and-apps', title:'Tools and Apps Guide', author:'Available', genre:'life', cover:'resources/guides/tools-and-apps-guide/tools-and-apps-guide-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/tools-and-apps-guide-2026' },
    { id:'mental-health', title:'Mental Health Guide', author:'Available', genre:'mindset', cover:'resources/guides/mental-health-guide/mental-health-guide-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/mental-health-guide-2026' },
    { id:'reading-guide', title:'Reading Guide', author:'Available', genre:'mindset', cover:'resources/guides/reading-guide/reading-guide-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/reading-guide-2026' },
    { id:'consistency-club-tracker', title:'Consistency Club Tracker', author:'Available', genre:'performance', cover:'resources/guides/consistency-club-tracker/consistency-club-tracker-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/consistency-club-tracker-2026' },
    { id:'in-season-weight-room', title:'In-Season Weight Room Plan', author:'Available', genre:'performance', cover:'resources/guides/in-season-weight-room-plan/in-season-weight-room-plan-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/in-season-weight-room-plan-2026' },
    { id:'survival-guide', title:'Overseas Basketball Survival Guide', author:'Available', genre:'career', cover:'resources/guides/overseas-basketball-survival-guide/overseas-basketball-survival-guide-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/overseas-basketball-survival-guide-2026' },
    { id:'confidence-course', title:'How to Build Confidence On and Off the Court', author:'Free Video Course', genre:'mindset', cover:'resources/guides/confidence-course/confidence-course-circle-thumbnail.jpg', url:'https://www.youtube.com/watch?v=sAl5mZHsR6s', newTab:true },
    { id:'full-recovery-day', title:'Full Recovery Day', author:'Available', genre:'performance', cover:'resources/guides/full-recovery-day/full-recovery-day-circle-thumbnail.jpg', url:'https://yourplaybook.beehiiv.com/products/full-recovery-day' }
  ];

  var ALL_LABELS = ['lbl-ask','lbl-social','lbl-news','lbl-res','lbl-contact','lbl-merch','lbl-jour','lbl-books','lbl-guides','lbl-back'];

  function initCanvas() {
    if (canvasInited) return;
    canvasInited = true;

    var canvas = document.getElementById('c');
    var ctx    = canvas.getContext('2d');
    var wrap   = document.getElementById('wrap');
    var booksOrbit = document.getElementById('books-orbit');

    var currentLevel = requestedEntryLevel === 'resources' ? 'resources' : 'main';
    var isBookMode = false;
    var DESTS = LEVELS[currentLevel];
    var W, H, cx, cy, sc, dests=[];
    var src = { x:0, y:0, r:10 };
    var dragging=false, dragPos=null, snapDest=null, revealed=null, lineP=0;
    var t0 = Date.now();

    // Fade transition state
    var fading = false;
    var fadeAlpha = 1;

    function isMobileCanvas() {
      return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }

    // Book mode state
    var bookPositions = []; // {book, x, y, r, el}
    var orbitMode = 'books';
    var guideBaseR = 0;
    var snapBook = null;
    var revealedBook = null;
    var bookLineP = 0;

    function hb(t) {
      var ph = (t % 1.1) / 1.1;
      if (ph < 0.07) return Math.sin(ph / 0.07 * Math.PI);
      if (ph < 0.16) return 0.48 * Math.sin((ph-0.07)/0.09*Math.PI);
      return 0;
    }

    function hideAllLabels() {
      ALL_LABELS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.style.opacity = '0'; el.textContent = ''; el.tabIndex = -1; el.removeAttribute('role'); el.removeAttribute('aria-label'); el.removeAttribute('title'); el.onclick = null; el.onkeydown = null; el.classList.remove('lit'); }
      });
    }

    function clearBookThumbs() {
      booksOrbit.innerHTML = '';
      bookPositions = [];
      snapBook = null;
      revealedBook = null;
      bookLineP = 0;
    }

    function setup() {
      var r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width  = Math.round(W * devicePixelRatio);
      canvas.height = Math.round(H * devicePixelRatio);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
      sc = W / 460;
      cx = W/2; cy = H*0.44;
      src.x=cx; src.y=cy; src.r=isMobileCanvas() ? Math.max(10*sc, 11) : 10*sc;

      if (isBookMode) {
        setupBooks();
      } else {
        var arm = currentLevel === 'main' ? Math.min(W*0.43, H*0.39, 225) : Math.min(W*0.37, H*0.34, 180);
        dests = DESTS.map(function(d) {
          var rad = d.angle * Math.PI / 180;
          return { id:d.id, label:d.label, desc:d.desc, angle:d.angle, url:d.url, isBack:!!d.isBack, x:cx+Math.sin(rad)*arm, y:cy+Math.cos(rad)*arm*0.82, r:isMobileCanvas() ? Math.max(6*sc, 7) : 6*sc };
        });
        hideAllLabels();
        dests.forEach(function(d) {
          var lbl = document.getElementById('lbl-'+d.id);
          if (lbl) {
            lbl.style.left = (d.x/W*100)+'%';
            if (d.id === 'res' || d.id === 'contact' || d.id === 'merch') {
              lbl.style.top = (d.y - d.r - 12) + 'px';
            } else if (d.isBack) {
              lbl.style.top = ((d.y/H*100)-6)+'%';
            } else {
              lbl.style.top = ((d.y/H*100)+5.2)+'%';
            }
            lbl.textContent = d.label;
            lbl.style.opacity = '1';
            lbl.setAttribute('role', 'button');
            lbl.tabIndex = 0;
            lbl.setAttribute('aria-label', d.label + ': ' + d.desc);
            lbl.title = d.desc;
            lbl.onclick = function () { activateDestination(d); };
            lbl.onkeydown = function (event) {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); activateDestination(d);
              }
            };
          }
        });
      }
    }

    // ─── Book mode ──────────────────────────────────────────────────────────

    function setupBooks() {
      clearBookThumbs();
      hideAllLabels();

      // Use ALL books (no pagination)
      var allBooks = orbitMode === 'guides' ? GUIDE_RESOURCES : BOOKS;
      var bookR = 15 * sc;
      guideBaseR = 0;

      // Size the orbit stage from the real viewport so the ring fills the available room.
      wrap.classList.toggle('guides-orbit', orbitMode === 'guides');
      if (orbitMode === 'guides') {
        // Largest near-square that fits under header/footer — orbit then fills that square.
        var vw = window.innerWidth || document.documentElement.clientWidth;
        var vh = window.innerHeight || document.documentElement.clientHeight;
        if (isMobileCanvas()) {
          // Phone: full width; square stage so the ring can reach the side edges.
          var side = Math.floor(Math.min(vw, Math.max(360, Math.min(vh * 0.78, vw * 1.02))));
          wrap.style.width = vw + 'px';
          wrap.style.maxWidth = '100vw';
          wrap.style.height = side + 'px';
          wrap.style.minHeight = '';
        } else {
          // Desktop: largest square that fits the viewport (use most of the height).
          var side = Math.floor(Math.min(vw * 0.96, vh * 0.90, 980));
          wrap.style.width = side + 'px';
          wrap.style.maxWidth = '96vw';
          wrap.style.height = side + 'px';
          wrap.style.minHeight = '';
        }
      } else {
        wrap.style.width = '';
        wrap.style.maxWidth = '';
        wrap.style.height = 'min(90vh, 700px)';
        wrap.style.minHeight = '';
      }
      var r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * devicePixelRatio);
      canvas.height = Math.round(H * devicePixelRatio);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
      // Guides: center slightly below mid so Back clears a large ring.
      cx = W/2; cy = H*(orbitMode === 'guides' ? 0.54 : 0.55);
      src.x = cx; src.y = cy; src.r = 10*sc;

      var remaining = allBooks.slice();
      var ringRadius = 120 * sc;
      var ringGap = 42 * sc;
      var gapHalf = 0.55; // radians (~31°) on each side of straight-up to keep clear
      var arcSpan = (2 * Math.PI) - (2 * gapHalf);
      var arcCenter = Math.PI / 2; // bottom center

      if (orbitMode === 'guides') {
        // SINGLE RING + MAGNIFIER from measured W×H.
        // Fill the inscribed circle of the stage: ringRadius + bookR ≈ maxOuter.
        var guideCount = Math.max(1, allBooks.length);
        var edgePad = Math.max(6, Math.min(14, Math.min(W, H) * 0.018));
        var backReserve = Math.max(28, Math.min(42, H * 0.055));
        var maxOuter = Math.min(
          W / 2 - edgePad,
          cy - backReserve - edgePad,
          H - cy - edgePad
        );
        var fillOuter = maxOuter * 0.98;
        var gapPx = Math.max(2, Math.min(6, Math.min(W, H) * 0.006));
        // R + r = fillOuter; r = (arcSpan*R/n - gap)/2
        var denom = 1 + arcSpan / (2 * guideCount);
        ringRadius = (fillOuter + gapPx / 2) / denom;
        bookR = fillOuter - ringRadius;
        // Soft floor only — never force bigger than arc/edges allow.
        var minR = isMobileCanvas() ? Math.max(16, W * 0.055) : Math.max(28, W * 0.048);
        if (bookR < minR) {
          bookR = minR;
          ringRadius = Math.max(48, fillOuter - bookR);
          var fitR = (arcSpan * ringRadius / guideCount - gapPx) / 2;
          if (fitR > 0 && fitR < bookR) bookR = fitR;
        }
        // No small artificial maxR — viewport + arc packing set the rest size.
        var maxByWidth = W / 2 - bookR - edgePad;
        var maxByTop = cy - bookR - backReserve - edgePad;
        var maxByBottom = H - cy - bookR - edgePad;
        ringRadius = Math.min(ringRadius, maxByWidth, maxByTop, maxByBottom);
        var arcFit = (arcSpan * ringRadius / guideCount - gapPx) / 2;
        if (arcFit > 0) bookR = Math.min(bookR, arcFit);
        guideBaseR = bookR;
        remaining = allBooks.slice();
      }

      while (remaining.length > 0) {
        var spacing = (bookR * 2) + 6 * sc;
        var arcLength = arcSpan * ringRadius;
        // Guides: force entire library onto this single ring. Books: spill to outer rings.
        var count = orbitMode === 'guides'
          ? remaining.length
          : Math.min(Math.floor(arcLength / spacing), remaining.length);
        if (count < 1) count = 1;

        var batch = remaining.splice(0, count);
        batch.forEach(function(book, i) {
          // Center the distribution on the bottom, spread symmetrically
          var angle = arcCenter - (arcSpan / 2) + ((i + 0.5) / count) * arcSpan;
          var bx = cx + Math.cos(angle) * ringRadius;
          var by = cy + Math.sin(angle) * ringRadius;

          var el;
          var coverUrl = book.cover || getBookCover(book.isbn);

          if (coverUrl) {
            el = document.createElement('img');
            el.className = 'book-thumb' + (orbitMode === 'guides' ? ' guide-thumb' : '') + (book.read ? ' read-badge' : '');
            el.src = coverUrl;
            el.alt = book.title;
            el.onerror = function() {
              var ph = createPlaceholder(book);
              ph.style.left = el.style.left;
              ph.style.top = el.style.top;
              ph.style.width = el.style.width;
              ph.style.height = el.style.height;
              el.parentNode.replaceChild(ph, el);
              for (var k=0; k<bookPositions.length; k++) {
                if (bookPositions[k].book.id === book.id) {
                  bookPositions[k].el = ph;
                  break;
                }
              }
              setTimeout(function(){ ph.classList.add('visible'); }, 50);
            };
          } else {
            el = createPlaceholder(book);
          }

          el.style.left = (bx - bookR) + 'px';
          el.style.top = (by - bookR) + 'px';
          el.style.width = (bookR*2) + 'px';
          el.style.height = (bookR*2) + 'px';
          if (orbitMode === 'guides') {
            el.style.setProperty('--mag-scale', '1');
            el.style.setProperty('--mag-z', '1');
          } else {
            // Books keep the centered enlarge-on-hover preview.
            var previewSize = Math.min(280, W - 32, Math.max(80, H - 220));
            var previewHalf = previewSize / 2;
            var previewX = Math.max(previewHalf + 16, Math.min(W - previewHalf - 16, bx));
            var previewY = Math.max(previewHalf + 24, Math.min(H - 170 - previewHalf, by));
            el.style.setProperty('--preview-transform', 'translate(' + (previewX - bx) + 'px,' + (previewY - by) + 'px) scale(' + (previewSize / (bookR * 2)) + ')');
          }
          booksOrbit.appendChild(el);

          // Stagger fade-in
          (function(elem, delay) {
            setTimeout(function(){ elem.classList.add('visible'); }, delay);
          })(el, 30 + bookPositions.length * 8);

          bookPositions.push({ book:book, x:bx, y:by, r:bookR, el:el, angle:angle });
        });

        if (orbitMode === 'guides') break; // never spill to a second ring
        ringRadius += ringGap;
      }

      // Back dot — halfway between top of canvas and center, totally isolated
      var backLbl = document.getElementById('lbl-back');
      var backY = cy * 0.35; // well above center, below logo
      backLbl.style.left = '50%';
      backLbl.style.top = ((backY/H*100) + 3.5) + '%';
      backLbl.textContent = 'Back';
      backLbl.style.opacity = '1';
      bookPositions.backDot = { x:cx, y:backY, r:8*sc };

      document.getElementById('books-back-link').classList.add('show');
      document.getElementById('books-search').classList.toggle('show', orbitMode === 'books');
    }

    function createPlaceholder(book) {
      var ph = document.createElement('div');
      ph.className = 'book-placeholder' + (book.read ? ' read-badge' : '');
      var initials = book.title.split(' ').slice(0,2).map(function(w){ return w.charAt(0).toUpperCase(); }).join('');
      ph.textContent = initials;
      return ph;
    }

    function getSnapBook(pos) {
      // Check back dot first
      if (bookPositions.backDot) {
        var bd = bookPositions.backDot;
        var ddx = pos.x - bd.x, ddy = pos.y - bd.y;
        if (Math.sqrt(ddx*ddx+ddy*ddy) < 44*sc) return { isBack:true, x:bd.x, y:bd.y, r:bd.r };
      }
      if (orbitMode === 'guides') {
        // Snap by angle once the drag leaves the center — works with tiny rest circles.
        var gdx = pos.x - src.x, gdy = pos.y - src.y;
        var gdist = Math.sqrt(gdx*gdx + gdy*gdy);
        if (gdist < 36*sc) return null;
        var gang = Math.atan2(gdy, gdx);
        var best = null, bestDiff = Infinity;
        for (var gi = 0; gi < bookPositions.length; gi++) {
          var gbp = bookPositions[gi];
          if (!gbp.book || gbp.filtered) continue;
          var bang = gbp.angle != null ? gbp.angle : Math.atan2(gbp.y - src.y, gbp.x - src.x);
          var diff = Math.abs(gang - bang) % (Math.PI * 2);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff < bestDiff) { bestDiff = diff; best = gbp; }
        }
        // ~22° window, or near the guide center once magnified
        if (best && (bestDiff < 0.40 || Math.hypot(pos.x - best.x, pos.y - best.y) < Math.max(best.r * 3, 36*sc))) {
          return best;
        }
        return null;
      }
      for (var i = 0; i < bookPositions.length; i++) {
        var bp = bookPositions[i];
        if (bp.filtered) continue;
        var dx = pos.x - bp.x, dy = pos.y - bp.y;
        if (Math.sqrt(dx*dx+dy*dy) < bp.r + 15*sc) return bp;
      }
      return null;
    }

    function clearGuideMagnifier() {
      bookPositions.forEach(function(bp) {
        if (!bp.el) return;
        bp.el.style.setProperty('--mag-scale', '1');
        bp.el.style.setProperty('--mag-z', '1');
        bp.el.classList.remove('magnified', 'mag-near');
      });
    }

    function applyGuideMagnifier(focusX, focusY, active) {
      if (orbitMode !== 'guides') return;
      if (!active) { clearGuideMagnifier(); return; }
      var base = guideBaseR || 14;
      // Focused guide ~1.8–2.6× rest size, capped so it stays on-screen.
      var targetDiam = Math.min(Math.min(W, H) * 0.34, Math.max(130, base * 2 * 2.2));
      var maxScale = Math.max(1.7, Math.min(3.2, targetDiam / (base * 2)));
      var influence = Math.max(70, ringInfluence());
      var nearest = null, nearestDist = Infinity;
      bookPositions.forEach(function(bp) {
        if (!bp.book || !bp.el) return;
        var dist = Math.hypot(focusX - bp.x, focusY - bp.y);
        if (dist < nearestDist) { nearestDist = dist; nearest = bp; }
        var t = Math.max(0, 1 - dist / influence);
        t = t * t; // ease — sharp center, soft neighbors
        var scale = 1 + (maxScale - 1) * t;
        // Neighbors get a milder bump even if slightly outside core influence
        if (scale < 1.15 && dist < influence * 1.35) {
          var t2 = Math.max(0, 1 - dist / (influence * 1.35));
          scale = Math.max(scale, 1 + 0.55 * t2 * t2);
        }
        bp.el.style.setProperty('--mag-scale', scale.toFixed(3));
        bp.el.style.setProperty('--mag-z', String(Math.round(scale * 20)));
        bp.el.classList.toggle('magnified', scale > maxScale * 0.72);
        bp.el.classList.toggle('mag-near', scale > 1.25 && scale <= maxScale * 0.72);
      });
      return nearest;
    }

    function ringInfluence() {
      // About 1.1× the arc spacing between neighbors so 1–2 neighbors swell.
      if (!bookPositions.length) return 80 * sc;
      var n = 0;
      for (var i = 0; i < bookPositions.length; i++) if (bookPositions[i].book) n++;
      if (n < 2) return 80 * sc;
      // Approximate chord length between adjacent guides on the ring.
      var sample = bookPositions.find(function(bp){ return bp.book; });
      var rr = sample ? Math.hypot(sample.x - src.x, sample.y - src.y) : 120 * sc;
      var chord = 2 * rr * Math.sin(arcSpanSafe() / (2 * n));
      return Math.max(55 * sc, chord * 1.15);
    }

    function arcSpanSafe() {
      return (2 * Math.PI) - (2 * 0.55);
    }

    function navigateToBook(book) {
      if (orbitMode === 'guides') {
        if (book.url && book.newTab) {
          var win = window.open(book.url, '_blank');
          if (win) { try { win.opener = null; } catch (e) {} }
          else window.location.href = book.url;
        } else if (book.url) {
          window.location.href = book.url;
        }
        return;
      }
      window.location.href = 'book.html?id=' + book.id;
    }

    // ─── Hover detection (non-drag) ─────────────────────────────────────────

    var hoverTitleEl = null;
    var lastHoveredBp = null;

    function createHoverTitle() {
      hoverTitleEl = document.createElement('div');
      hoverTitleEl.className = 'book-title-hover';
      booksOrbit.appendChild(hoverTitleEl);
    }

    function updateHover(mousePos) {
      if (!isBookMode || dragging) {
        clearHover();
        return;
      }
      if (orbitMode === 'guides') {
        // Magnifier follows the pointer; widen hit radius so small rest circles are easy to find.
        var closest = null;
        var closestDist = Infinity;
        var hitR = Math.max((guideBaseR || 14) * 3.5, 36 * sc);
        for (var i = 0; i < bookPositions.length; i++) {
          var bp = bookPositions[i];
          if (!bp.book) continue;
          var dist = Math.hypot(mousePos.x - bp.x, mousePos.y - bp.y);
          if (dist < closestDist) { closestDist = dist; closest = bp; }
        }
        if (closest && closestDist < hitR) {
          applyGuideMagnifier(closest.x, closest.y, true);
          if (closest !== lastHoveredBp) {
            if (lastHoveredBp && lastHoveredBp.el) lastHoveredBp.el.classList.remove('hovered');
            lastHoveredBp = closest;
            if (closest.el) closest.el.classList.add('hovered');
          }
        } else {
          clearHover();
        }
        return;
      }
      var closestB = null;
      var closestDistB = Infinity;
      for (var j = 0; j < bookPositions.length; j++) {
        var bp2 = bookPositions[j];
        if (!bp2.book) continue;
        var dx = mousePos.x - bp2.x, dy = mousePos.y - bp2.y;
        var dist2 = Math.sqrt(dx*dx + dy*dy);
        if (dist2 < bp2.r + 25*sc && dist2 < closestDistB) {
          closestB = bp2;
          closestDistB = dist2;
        }
      }
      if (closestB && closestB !== lastHoveredBp) {
        clearHover();
        lastHoveredBp = closestB;
        if (closestB.el) closestB.el.classList.add('hovered');
        if (!hoverTitleEl) createHoverTitle();
        hoverTitleEl.innerHTML = '<span class="bth-title">' + closestB.book.title + '</span>' +
          (closestB.book.author ? '<span class="bth-author">' + closestB.book.author + '</span>' : '');
        hoverTitleEl.style.left = closestB.x + 'px';
        hoverTitleEl.style.top = (closestB.y + closestB.r*7 + 8*sc) + 'px';
        hoverTitleEl.classList.add('visible');
      } else if (!closestB && lastHoveredBp) {
        clearHover();
      }
    }

    function clearHover() {
      if (lastHoveredBp && lastHoveredBp.el) {
        lastHoveredBp.el.classList.remove('hovered');
      }
      lastHoveredBp = null;
      if (hoverTitleEl) hoverTitleEl.classList.remove('visible');
      if (orbitMode === 'guides') clearGuideMagnifier();
    }

    // Track mouse position for hover even when not dragging
    canvas.addEventListener('mousemove', function(e) {
      if (dragging || !isBookMode) return;
      var r = canvas.getBoundingClientRect();
      var mx = (e.clientX - r.left) * (W / r.width);
      var my = (e.clientY - r.top) * (H / r.height);
      updateHover({ x: mx, y: my });
    });

    canvas.addEventListener('mouseleave', function() {
      clearHover();
    });

    // Book search
    var searchInput = document.getElementById('books-search-input');
    searchInput.addEventListener('input', function() {
      var query = this.value.toLowerCase().trim();
      bookPositions.forEach(function(bp) {
        if (!bp.book || !bp.el) return;
        var match = !query || bp.book.title.toLowerCase().indexOf(query) !== -1 ||
                    bp.book.author.toLowerCase().indexOf(query) !== -1 ||
                    bp.book.genre.toLowerCase().indexOf(query) !== -1;
        bp.el.style.opacity = match ? '' : '0.1';
        bp.el.style.transform = match ? '' : 'scale(0.5)';
        bp.filtered = !match;
      });
    });

    // Prevent canvas drag when typing in search
    searchInput.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    searchInput.addEventListener('touchstart', function(e) { e.stopPropagation(); });

    // Books back link
    document.getElementById('books-back-link').addEventListener('click', function() {
      if (!fading && isBookMode) exitBookMode();
    });

    // ─── Level switching ────────────────────────────────────────────────────

    function enterBookMode(mode) {
      fading = true;
      var fadeOut = setInterval(function() {
        fadeAlpha -= 0.04;
        if (fadeAlpha <= 0) {
          fadeAlpha = 0;
          clearInterval(fadeOut);

          orbitMode = mode || 'books';
          isBookMode = true;
          currentLevel = orbitMode;
          revealed = null; lineP = 0; dragPos = null; snapDest = null;
          t0 = Date.now();

          document.getElementById('panel').classList.remove('show');
          document.getElementById('instr').textContent = orbitMode === 'guides' ? 'drag the dot \u00b7 connect to a guide' : 'drag the dot \u00b7 connect to a book';
          document.getElementById('instr').style.opacity = '1';
          document.getElementById('rbtn').style.display = 'none';
          document.getElementById('books-search').classList.toggle('show', orbitMode === 'books');

          setup();

          var fadeIn = setInterval(function() {
            fadeAlpha += 0.04;
            if (fadeAlpha >= 1) {
              fadeAlpha = 1;
              clearInterval(fadeIn);
              fading = false;
            }
          }, 16);
        }
      }, 16);
    }

    function exitBookMode() {
      fading = true;
      var fadeOut = setInterval(function() {
        fadeAlpha -= 0.04;
        if (fadeAlpha <= 0) {
          fadeAlpha = 0;
          clearInterval(fadeOut);

          clearBookThumbs();
          isBookMode = false;
          currentLevel = 'resources';
          DESTS = LEVELS.resources;
          revealed = null; lineP = 0; dragPos = null; snapDest = null;
          t0 = Date.now();

          // Reset wrap size, search, and back link
          wrap.classList.remove('guides-orbit');
          wrap.style.width = '';
          wrap.style.maxWidth = '';
          wrap.style.height = '';
          wrap.style.minHeight = '';
          document.getElementById('books-search-input').value = '';
          document.getElementById('books-back-link').classList.remove('show');
          document.getElementById('panel').classList.remove('show');
          document.getElementById('instr').textContent = 'drag the dot \u00b7 explore the player tool kit';
          document.getElementById('instr').style.opacity = '1';
          document.getElementById('rbtn').style.display = 'none';
          document.getElementById('books-search').classList.remove('show');

          setup();

          var fadeIn = setInterval(function() {
            fadeAlpha += 0.04;
            if (fadeAlpha >= 1) {
              fadeAlpha = 1;
              clearInterval(fadeIn);
              fading = false;
            }
          }, 16);
        }
      }, 16);
    }

    function switchLevel(levelName) {
      fading = true;
      var fadeOut = setInterval(function() {
        fadeAlpha -= 0.04;
        if (fadeAlpha <= 0) {
          fadeAlpha = 0;
          clearInterval(fadeOut);

          currentLevel = levelName;
          DESTS = LEVELS[levelName];
          revealed = null; lineP = 0; dragPos = null; snapDest = null;
          t0 = Date.now();

          document.getElementById('panel').classList.remove('show');
          if (levelName === 'main') {
            document.getElementById('instr').textContent = 'drag the dot \u00b7 continue your journey';
            document.getElementById('rbtn').style.display = '';
          } else {
            document.getElementById('instr').textContent = 'drag the dot \u00b7 explore the player tool kit';
            document.getElementById('rbtn').style.display = 'none';
          }
          document.getElementById('instr').style.opacity = '1';
          document.getElementById('books-search').classList.remove('show');

          setup();

          var fadeIn = setInterval(function() {
            fadeAlpha += 0.04;
            if (fadeAlpha >= 1) {
              fadeAlpha = 1;
              clearInterval(fadeIn);
              fading = false;
            }
          }, 16);
        }
      }, 16);
    }

    // ─── Snap detection ─────────────────────────────────────────────────────

    function getSnap(pos) {
      for (var i = 0; i < dests.length; i++) {
        var d = dests[i];
        var dx=pos.x-d.x, dy=pos.y-d.y;
        if (Math.sqrt(dx*dx+dy*dy) < 44*sc) return d;
      }
      return null;
    }

    function pt(e) {
      var r=canvas.getBoundingClientRect();
      var ex=e.touches?e.touches[0].clientX:e.clientX;
      var ey=e.touches?e.touches[0].clientY:e.clientY;
      return { x:(ex-r.left)*(W/r.width), y:(ey-r.top)*(H/r.height) };
    }

    // ─── Draw loop ──────────────────────────────────────────────────────────

    function draw() {
      ctx.clearRect(0,0,W,H);
      ctx.globalAlpha = fadeAlpha;
      var t=(Date.now()-t0)/1000;

      if (isBookMode) {
        drawBookMode(t);
      } else {
        drawDotMode(t);
      }

      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }

    function drawDotMode(t) {
      // Draw destination dots and lines
      dests.forEach(function(d) {
        if (revealed && revealed.id===d.id) return;
        var isSnap = snapDest && snapDest.id===d.id;
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(d.x,d.y);
        ctx.strokeStyle = isSnap?'rgba(212,201,176,0.55)':'rgba(255,255,255,0.12)';
        ctx.lineWidth = isSnap?1.2:0.75; ctx.stroke();
        var dr = isSnap?d.r+3*sc:d.r;
        ctx.beginPath(); ctx.arc(d.x,d.y,dr,0,Math.PI*2);
        ctx.fillStyle='rgba(212,201,176,'+(isSnap?'0.95':'0.35')+')'; ctx.fill();
        if (isSnap) {
          ctx.beginPath(); ctx.arc(d.x,d.y,dr+8*sc,0,Math.PI*2);
          ctx.strokeStyle='rgba(212,201,176,0.15)'; ctx.lineWidth=1; ctx.stroke();
        }
      });

      // Drag line
      if (dragging && dragPos) {
        var sn=getSnap(dragPos);
        var tx=sn?sn.x:dragPos.x, ty=sn?sn.y:dragPos.y;
        var g=ctx.createLinearGradient(src.x,src.y,tx,ty);
        g.addColorStop(0,'rgba(232,224,208,0.95)');
        g.addColorStop(1,sn?'rgba(232,224,208,0.9)':'rgba(140,130,115,0.2)');
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(tx,ty);
        ctx.strokeStyle=g; ctx.lineWidth=1.8; ctx.stroke();
      }

      // Revealed destination line animation
      if (revealed) {
        if (lineP<1) lineP=Math.min(lineP+0.028,1);
        var lp=1-(1-lineP)*(1-lineP);
        var rtx=src.x+(revealed.x-src.x)*lp, rty=src.y+(revealed.y-src.y)*lp;
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(rtx,rty);
        ctx.strokeStyle='rgba(232,224,208,0.88)'; ctx.lineWidth=1.6; ctx.stroke();
        if (lineP>=1) {
          ctx.beginPath(); ctx.arc(revealed.x,revealed.y,revealed.r+6*sc,0,Math.PI*2);
          ctx.fillStyle='rgba(232,224,208,0.07)'; ctx.fill();
          ctx.beginPath(); ctx.arc(revealed.x,revealed.y,revealed.r,0,Math.PI*2);
          ctx.fillStyle='#e8e0d0'; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(rtx,rty,3.5*sc,0,Math.PI*2);
          ctx.fillStyle='#e8e0d0'; ctx.fill();
        }
      }

      // Center dot
      if (!revealed) {
        var b=hb(t);
        if (b>0.04) {
          ctx.beginPath(); ctx.arc(src.x,src.y,src.r+b*11*sc,0,Math.PI*2);
          ctx.strokeStyle='rgba(232,224,208,'+b*0.22+')'; ctx.lineWidth=1; ctx.stroke();
          ctx.beginPath(); ctx.arc(src.x,src.y,src.r+b*22*sc,0,Math.PI*2);
          ctx.strokeStyle='rgba(232,224,208,'+b*0.07+')'; ctx.lineWidth=0.5; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(src.x,src.y,src.r+b*4*sc,0,Math.PI*2);
        ctx.fillStyle='#e8e0d0'; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(src.x,src.y,src.r,0,Math.PI*2);
        ctx.fillStyle='rgba(232,224,208,0.25)'; ctx.fill();
      }
    }

    function drawBookMode(t) {
      // Draw dim lines from center to each book
      bookPositions.forEach(function(bp) {
        if (!bp.book) return;
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(bp.x,bp.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5; ctx.stroke();
      });

      // Draw back dot — isolated above, straight up from center
      if (bookPositions.backDot) {
        var bd = bookPositions.backDot;
        var isSnapBack = snapBook && snapBook.isBack;
        // Vertical line from center to back dot
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(bd.x,bd.y);
        ctx.strokeStyle = isSnapBack ? 'rgba(212,201,176,0.5)' : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = isSnapBack ? 1.5 : 0.5; ctx.stroke();
        // The dot itself — larger than book dots
        var bdr = isSnapBack ? bd.r+4*sc : bd.r;
        ctx.beginPath(); ctx.arc(bd.x,bd.y,bdr,0,Math.PI*2);
        ctx.fillStyle = isSnapBack ? 'rgba(212,201,176,0.95)' : 'rgba(212,201,176,0.3)';
        ctx.fill();
        if (isSnapBack) {
          ctx.beginPath(); ctx.arc(bd.x,bd.y,bdr+10*sc,0,Math.PI*2);
          ctx.strokeStyle='rgba(212,201,176,0.15)'; ctx.lineWidth=1; ctx.stroke();
        }
      }

      // Drag line
      if (dragging && dragPos) {
        var snap = getSnapBook(dragPos);
        var tx = snap ? snap.x : dragPos.x;
        var ty = snap ? snap.y : dragPos.y;
        var g = ctx.createLinearGradient(src.x,src.y,tx,ty);
        g.addColorStop(0,'rgba(232,224,208,0.95)');
        g.addColorStop(1,snap?'rgba(232,224,208,0.9)':'rgba(140,130,115,0.2)');
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(tx,ty);
        ctx.strokeStyle=g; ctx.lineWidth=1.8; ctx.stroke();

        if (orbitMode === 'guides') {
          // Continuous magnifier toward the drag tip (or snapped guide).
          var focusX = snap && !snap.isBack ? snap.x : dragPos.x;
          var focusY = snap && !snap.isBack ? snap.y : dragPos.y;
          // If still near center, ease magnifier off
          if (Math.hypot(dragPos.x - src.x, dragPos.y - src.y) < 34*sc) {
            clearGuideMagnifier();
          } else {
            applyGuideMagnifier(focusX, focusY, true);
          }
          bookPositions.forEach(function(bp) {
            if (bp.el) bp.el.classList.toggle('snapped', !!(snap && !snap.isBack && snap.book && snap.book.id === bp.book.id));
          });
          // Guides: titles are baked into the magnified cover — skip the floating title card.
          if (hoverTitleEl) hoverTitleEl.classList.remove('visible');
        } else {
          // Highlight snapped book thumbnail + show title card
          bookPositions.forEach(function(bp) {
            if (bp.el) bp.el.classList.toggle('snapped', !!(snap && !snap.isBack && snap.book && snap.book.id === bp.book.id));
          });
          if (snap && !snap.isBack && snap.book) {
            if (!hoverTitleEl) createHoverTitle();
            hoverTitleEl.innerHTML = '<span class="bth-title">' + snap.book.title + '</span>' +
              (snap.book.author ? '<span class="bth-author">' + snap.book.author + '</span>' : '');
            hoverTitleEl.classList.add('visible');
          } else {
            if (hoverTitleEl) hoverTitleEl.classList.remove('visible');
          }
        }
        // Back dot label highlight
        var backLbl = document.getElementById('lbl-back');
        if (backLbl) backLbl.classList.toggle('lit', !!(snap && snap.isBack));
      } else if (orbitMode === 'guides' && !lastHoveredBp) {
        // Rest state: no magnifier while idle and not hovering
      }

      // Revealed book line animation
      if (revealedBook && !revealedBook.isBack) {
        if (bookLineP<1) bookLineP=Math.min(bookLineP+0.028,1);
        var lp=1-(1-bookLineP)*(1-bookLineP);
        var rtx=src.x+(revealedBook.x-src.x)*lp, rty=src.y+(revealedBook.y-src.y)*lp;
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(rtx,rty);
        ctx.strokeStyle='rgba(232,224,208,0.88)'; ctx.lineWidth=1.6; ctx.stroke();
      }

      // Center dot with heartbeat
      if (!revealedBook) {
        var b=hb(t);
        if (b>0.04) {
          ctx.beginPath(); ctx.arc(src.x,src.y,src.r+b*11*sc,0,Math.PI*2);
          ctx.strokeStyle='rgba(232,224,208,'+b*0.22+')'; ctx.lineWidth=1; ctx.stroke();
          ctx.beginPath(); ctx.arc(src.x,src.y,src.r+b*22*sc,0,Math.PI*2);
          ctx.strokeStyle='rgba(232,224,208,'+b*0.07+')'; ctx.lineWidth=0.5; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(src.x,src.y,src.r+b*4*sc,0,Math.PI*2);
        ctx.fillStyle='#e8e0d0'; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(src.x,src.y,src.r,0,Math.PI*2);
        ctx.fillStyle='rgba(232,224,208,0.25)'; ctx.fill();
      }
    }

    // ─── Input handlers ─────────────────────────────────────────────────────

    function onDown(e) {
      if (fading) return;
      if (isBookMode && revealedBook) return;
      if (!isBookMode && revealed) return;

      var p=pt(e); var dx=p.x-src.x,dy=p.y-src.y;
      if (!isBookMode) {
        var target = dests.find(function(d) { return Math.hypot(p.x-d.x, p.y-d.y) < Math.max(d.r+12, 22); });
        if (target && target.id === 'merch' && e.type === 'touchstart') {
          // Open the store on touchend so the browser treats it as a user tap (new tab is not blocked).
          e.preventDefault(); pendingTapDest = target; return;
        }
        if (target) { e.preventDefault(); activateDestination(target); return; }
      }
      var grabRadius = isMobileCanvas() ? Math.max(src.r + 20 * sc, 44) : src.r + 20 * sc;
      if (Math.sqrt(dx*dx+dy*dy) < grabRadius) {
        dragging=true; dragPos=p; canvas.classList.add('drag');
        document.getElementById('instr').style.opacity='0'; e.preventDefault();
      }
    }

    function onMove(e) {
      if (!dragging) return;
      dragPos=pt(e);

      if (isBookMode) {
        snapBook = getSnapBook(dragPos);
      } else {
        snapDest=getSnap(dragPos);
        dests.forEach(function(d){
          var lbl = document.getElementById('lbl-'+d.id);
          if (lbl) lbl.classList.toggle('lit',!!(snapDest&&snapDest.id===d.id));
        });
      }
      e.preventDefault();
    }

    function onUp() {
      if (pendingTapDest) { var tapped = pendingTapDest; pendingTapDest = null; activateDestination(tapped); return; }
      if (!dragging) return;
      dragging=false; canvas.classList.remove('drag');

      if (isBookMode) {
        if (snapBook) {
          if (snapBook.isBack) {
            setTimeout(exitBookMode, 400);
          } else {
            revealedBook = snapBook; bookLineP = 0;
            var theBook = snapBook.book;
            setTimeout(function() { navigateToBook(theBook); }, 700);
          }
        }
        snapBook = null; dragPos = null;
        bookPositions.forEach(function(bp) {
          if (bp.el) bp.el.classList.remove('snapped');
        });
        if (orbitMode === 'guides' && !revealedBook) clearGuideMagnifier();
        var backLbl = document.getElementById('lbl-back');
        if (backLbl) backLbl.classList.remove('lit');
      } else {
        if (snapDest) {
          revealed=snapDest; lineP=0;
          if (!snapDest.isBack) {
            document.getElementById('ptitle').textContent=snapDest.label;
            document.getElementById('pdesc').textContent=snapDest.desc;
            document.getElementById('panel').classList.add('show');
          }
          dests.forEach(function(d){
            var lbl = document.getElementById('lbl-'+d.id);
            if (lbl) lbl.style.opacity=d.id===snapDest.id?'1':'0.12';
          });

          // Wire up destination actions
          if (snapDest.id === 'back') {
            setTimeout(function() { switchLevel('main'); }, 600);
          } else if (snapDest.id === 'ask') {
            setTimeout(openAsk, 600);
          } else if (snapDest.id === 'social') {
            setTimeout(function () {
              window.history.replaceState(Object.assign({}, window.history.state, { returnToSections: true }), '');
              window.location.assign('https://link.me/elijahbryant3');
            }, 600);
          } else if (snapDest.id === 'news' || snapDest.id === 'contact') {
            var dialogId = snapDest.id === 'news' ? 'newsletter-dialog' : 'contact-dialog';
            setTimeout(function() { window.openSiteDialog(dialogId); }, 600);
          } else if (snapDest.id === 'books') {
            setTimeout(function() { enterBookMode('books'); }, 800);
          } else if (snapDest.id === 'guides') {
            setTimeout(function() { enterBookMode('guides'); }, 800);
          } else if (snapDest.id === 'res') {
            setTimeout(function() { switchLevel('resources'); }, 600);
          } else if (snapDest.id === 'merch' && snapDest.url) {
            // Opened right away (inside the tap/drop) so it lands in a new tab; the menu resets after.
            var merchWin = window.open(snapDest.url, '_blank');
            if (merchWin) {
              try { merchWin.opener = null; } catch (err) {}
              setTimeout(function() { if (revealed && revealed.id === 'merch') document.getElementById('rbtn').click(); }, 1600);
            } else {
              var merchUrl = snapDest.url;
              setTimeout(function() { window.location.assign(merchUrl); }, 600);
            }
          }
        }
        snapDest=null; dragPos=null;
      }
    }

    var pendingTapDest = null;

    function activateDestination(destination) {
      if (fading || isBookMode || revealed) return;
      dragging = true;
      snapDest = destination;
      onUp();
    }

    canvas.addEventListener('mousedown',onDown);
    canvas.addEventListener('mousemove',onMove);
    canvas.addEventListener('mouseup',onUp);
    window.addEventListener('mouseup',onUp);
    canvas.addEventListener('touchstart',onDown,{passive:false});
    canvas.addEventListener('touchmove',onMove,{passive:false});
    canvas.addEventListener('touchend',onUp);
    window.addEventListener('touchend',onUp);

    document.getElementById('rbtn').addEventListener('click',function(){
      if (fading) return;
      if (currentLevel !== 'main') {
        switchLevel('main');
      } else {
        revealed=null; lineP=0; dragPos=null; snapDest=null;
        document.getElementById('panel').classList.remove('show');
        document.getElementById('instr').style.opacity='1';
        dests.forEach(function(d){
          var l=document.getElementById('lbl-'+d.id);
          if (l) { l.style.opacity='1'; l.classList.remove('lit'); }
        });
      }
    });

    canvas.style.cursor='grab';
    setup();
    if (requestedEntryLevel === 'resources') {
      requestedEntryLevel = '';
      document.getElementById('instr').textContent = 'drag the dot \u00b7 explore the player tool kit';
      document.getElementById('rbtn').style.display = 'none';
    }
    window.addEventListener('resize', function() {
      setup();
    });
    draw();
  }

}());
