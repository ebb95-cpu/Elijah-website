(function () {
  'use strict';

  var askScreen      = document.getElementById('ask-screen');
  var sectionsScreen = document.getElementById('sections-screen');
  var askClose       = document.getElementById('ask-close');
  var askSubmit      = document.getElementById('ask-submit');
  var askEmail       = document.getElementById('ask-email');
  var askResponse    = document.getElementById('ask-response');

  var journeySkipped = false;

  // ─── Core screen transitions ──────────────────────────────────────────────

  function showSections() {
    sectionsScreen.classList.add('visible');
    document.body.style.overflow = 'auto';
    setTimeout(initCanvas, 100);
  }

  // ─── Ask Elijah modal ─────────────────────────────────────────────────────

  function openAsk() {
    askScreen.classList.add('visible');
  }

  function closeAsk() {
    askScreen.classList.remove('visible');
  }

  function handleNotify() {
    var email = askEmail.value.trim();
    if (!email || !email.includes('@')) {
      askEmail.focus();
      return;
    }
    try { localStorage.setItem('askElijahEmail', email); } catch (e) {}
    askResponse.textContent = "You\u2019re on the list. I\u2019ll reach out when it\u2019s ready.";
    askResponse.style.display = 'block';
    askEmail.value = '';
  }

  askClose.addEventListener('click', closeAsk);
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

    skipHandle.addEventListener('pointerdown', function (event) {
      skipDragging = true;
      skipHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    window.addEventListener('pointermove', function (event) {
      if (!skipDragging) return;
      var rect = skipTrack.getBoundingClientRect();
      var inset = skipHandle.offsetWidth / 2;
      setSkipProgress((event.clientX - rect.left - inset) / (rect.width - inset * 2));
      event.preventDefault();
    });

    window.addEventListener('pointerup', function () {
      if (!skipDragging) return;
      skipDragging = false;
      if (skipProgress >= 0.95) {
        runSkip();
      } else {
        resetSkipSlider();
      }
    });
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
      { id:'ask',  label:'Ask Elijah', desc:'direct questions \u00b7 personal guidance', angle:-46 },
      { id:'news', label:'Newsletter', desc:'one letter every Friday \u00b7 free',        angle:46  },
    ],
    resources: [
      { id:'back',   label:'Back',   desc:'', angle:180, isBack:true },
      { id:'books',  label:'Books',  desc:'reads \u00b7 recommendations \u00b7 growth',  angle:-52 },
      { id:'tools',  label:'Tools',  desc:'gear \u00b7 apps \u00b7 recovery tech',       angle:0   },
      { id:'guides', label:'Guides', desc:'frameworks \u00b7 plans \u00b7 resources',    angle:52  },
    ]
  };

  var ALL_LABELS = ['lbl-ask','lbl-news','lbl-res','lbl-jour','lbl-books','lbl-tools','lbl-guides','lbl-back'];

  function initCanvas() {
    if (canvasInited) return;
    canvasInited = true;

    var canvas = document.getElementById('c');
    var ctx    = canvas.getContext('2d');
    var wrap   = document.getElementById('wrap');
    var booksOrbit = document.getElementById('books-orbit');

    var currentLevel = 'main';
    var isBookMode = false;
    var DESTS = LEVELS.main;
    var W, H, cx, cy, sc, dests=[];
    var src = { x:0, y:0, r:10 };
    var dragging=false, dragPos=null, snapDest=null, revealed=null, lineP=0;
    var t0 = Date.now();

    // Fade transition state
    var fading = false;
    var fadeAlpha = 1;

    // Book mode state
    var bookPositions = []; // {book, x, y, r, el}
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
        if (el) { el.style.opacity = '0'; el.textContent = ''; el.classList.remove('lit'); }
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
      src.x=cx; src.y=cy; src.r=Math.max(10*sc, 11);

      if (isBookMode) {
        setupBooks();
      } else {
        var arm = Math.min(W*0.37, H*0.34, 180);
        dests = DESTS.map(function(d) {
          var rad = d.angle * Math.PI / 180;
          return { id:d.id, label:d.label, desc:d.desc, angle:d.angle, isBack:!!d.isBack, x:cx+Math.sin(rad)*arm, y:cy+Math.cos(rad)*arm*0.82, r:Math.max(6*sc, 7) };
        });
        hideAllLabels();
        dests.forEach(function(d) {
          var lbl = document.getElementById('lbl-'+d.id);
          if (lbl) {
            lbl.style.left = (d.x/W*100)+'%';
            if (d.isBack) {
              lbl.style.top = ((d.y/H*100)-6)+'%';
            } else {
              lbl.style.top = ((d.y/H*100)+5.2)+'%';
            }
            lbl.textContent = d.label;
            lbl.style.opacity = '1';
          }
        });
      }
    }

    // ─── Book mode ──────────────────────────────────────────────────────────

    function setupBooks() {
      clearBookThumbs();
      hideAllLabels();

      // Use ALL books (no pagination)
      var allBooks = BOOKS;
      var bookR = 15 * sc; // small thumbnails that zoom on hover

      // Make the wrap area expand for book mode
      wrap.style.height = 'min(90vh, 700px)';
      var r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * devicePixelRatio);
      canvas.height = Math.round(H * devicePixelRatio);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
      cx = W/2; cy = H*0.55; // push center down to make room for back dot above
      src.x = cx; src.y = cy; src.r = 10*sc;

      // Arrange ALL books in concentric rings — first ring well away from center
      var remaining = allBooks.slice();
      var ringRadius = 120 * sc;
      var ringGap = 42 * sc;
      var ringIndex = 0;

      while (remaining.length > 0) {
        // Skip the top zone where Back dot lives, distribute symmetrically
        // PI/2 is straight down. We center the arc on the bottom and spread evenly.
        var gapHalf = 0.55; // radians (~31°) on each side of straight-up to keep clear
        var arcSpan = (2 * Math.PI) - (2 * gapHalf);
        var arcCenter = Math.PI / 2; // bottom center
        var spacing = (bookR * 2) + 6 * sc;
        var arcLength = arcSpan * ringRadius;
        var count = Math.min(Math.floor(arcLength / spacing), remaining.length);
        if (count < 1) count = 1;

        var batch = remaining.splice(0, count);
        batch.forEach(function(book, i) {
          // Center the distribution on the bottom, spread symmetrically
          var angle = arcCenter - (arcSpan / 2) + ((i + 0.5) / count) * arcSpan;
          var bx = cx + Math.cos(angle) * ringRadius;
          var by = cy + Math.sin(angle) * ringRadius;

          var el;
          var coverUrl = getBookCover(book.isbn);

          if (coverUrl) {
            el = document.createElement('img');
            el.className = 'book-thumb' + (book.read ? ' read-badge' : '');
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
          booksOrbit.appendChild(el);

          // Stagger fade-in
          (function(elem, delay) {
            setTimeout(function(){ elem.classList.add('visible'); }, delay);
          })(el, 30 + bookPositions.length * 8);

          bookPositions.push({ book:book, x:bx, y:by, r:bookR, el:el });
        });

        ringRadius += ringGap;
        ringIndex++;
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
      document.getElementById('books-search').classList.add('show');
    }

    function createPlaceholder(book) {
      var ph = document.createElement('div');
      ph.className = 'book-placeholder' + (book.read ? ' read-badge' : '');
      var initials = book.title.split(' ').slice(0,2).map(function(w){ return w.charAt(0).toUpperCase(); }).join('');
      ph.textContent = initials;
      return ph;
    }

    function getSnapBook(pos) {
      for (var i = 0; i < bookPositions.length; i++) {
        var bp = bookPositions[i];
        if (bp.filtered) continue;
        var dx = pos.x - bp.x, dy = pos.y - bp.y;
        if (Math.sqrt(dx*dx+dy*dy) < bp.r + 15*sc) return bp;
      }
      // Check back dot
      if (bookPositions.backDot) {
        var bd = bookPositions.backDot;
        var ddx = pos.x - bd.x, ddy = pos.y - bd.y;
        if (Math.sqrt(ddx*ddx+ddy*ddy) < 44*sc) return { isBack:true, x:bd.x, y:bd.y, r:bd.r };
      }
      return null;
    }

    function navigateToBook(book) {
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
      var closest = null;
      var closestDist = Infinity;
      for (var i = 0; i < bookPositions.length; i++) {
        var bp = bookPositions[i];
        if (!bp.book) continue;
        var dx = mousePos.x - bp.x, dy = mousePos.y - bp.y;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < bp.r + 25*sc && dist < closestDist) {
          closest = bp;
          closestDist = dist;
        }
      }
      if (closest && closest !== lastHoveredBp) {
        clearHover();
        lastHoveredBp = closest;
        if (closest.el) closest.el.classList.add('hovered');
        if (!hoverTitleEl) createHoverTitle();
        hoverTitleEl.innerHTML = '<span class="bth-title">' + closest.book.title + '</span>' +
          (closest.book.author ? '<span class="bth-author">' + closest.book.author + '</span>' : '');
        hoverTitleEl.style.left = closest.x + 'px';
        hoverTitleEl.style.top = (closest.y + closest.r*7 + 8*sc) + 'px';
        hoverTitleEl.classList.add('visible');
      } else if (!closest && lastHoveredBp) {
        clearHover();
      }
    }

    function clearHover() {
      if (lastHoveredBp && lastHoveredBp.el) {
        lastHoveredBp.el.classList.remove('hovered');
      }
      lastHoveredBp = null;
      if (hoverTitleEl) hoverTitleEl.classList.remove('visible');
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

    function enterBookMode() {
      fading = true;
      var fadeOut = setInterval(function() {
        fadeAlpha -= 0.04;
        if (fadeAlpha <= 0) {
          fadeAlpha = 0;
          clearInterval(fadeOut);

          isBookMode = true;
          currentLevel = 'books';
          revealed = null; lineP = 0; dragPos = null; snapDest = null;
          t0 = Date.now();

          document.getElementById('panel').classList.remove('show');
          document.getElementById('instr').textContent = 'drag the dot \u00b7 connect to a book';
          document.getElementById('instr').style.opacity = '1';
          document.getElementById('rbtn').style.display = 'none';
          document.getElementById('books-search').classList.add('show');

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

          // Reset wrap height, search, and back link
          wrap.style.height = '';
          document.getElementById('books-search-input').value = '';
          document.getElementById('books-back-link').classList.remove('show');
          document.getElementById('panel').classList.remove('show');
          document.getElementById('instr').textContent = 'drag the dot \u00b7 explore resources';
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
            document.getElementById('instr').textContent = 'drag the dot \u00b7 explore resources';
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
        // Back dot label highlight
        var backLbl = document.getElementById('lbl-back');
        if (backLbl) backLbl.classList.toggle('lit', !!(snap && snap.isBack));
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
      if (Math.sqrt(dx*dx+dy*dy) < Math.max(src.r + 20 * sc, 44)) {
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
            setTimeout(function() { window.location.assign('https://elijahbryant.pro'); }, 600);
          } else if (snapDest.id === 'news') {
            setTimeout(function() { window.location.assign('https://yourplaybook.beehiiv.com'); }, 600);
          } else if (snapDest.id === 'books') {
            setTimeout(enterBookMode, 800);
          }
        }
        snapDest=null; dragPos=null;
      }
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
    window.addEventListener('resize', function() {
      setup();
    });
    draw();
  }

}());
