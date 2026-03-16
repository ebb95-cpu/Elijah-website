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
    // Initialize canvas after screen is visible
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

  // ─── Skip button (during journey map animation) ───────────────────────────

  var skipBtn = document.getElementById('skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      journeySkipped = true;
      var journeyScreen = document.getElementById('journey-screen');
      journeyScreen.style.transition = 'opacity 0.6s ease';
      journeyScreen.style.opacity = '0';
      journeyScreen.style.pointerEvents = 'none';
      setTimeout(showSections, 650);
    });
  }

  // ─── Journey complete → show sections ────────────────────────────────────

  document.addEventListener('journeyComplete', function () {
    if (journeySkipped) return;
    setTimeout(showSections, 800);
  });

  // ─── Canvas dot navigation ───────────────────────────────────────────────

  var canvasInited = false;

  function initCanvas() {
    if (canvasInited) return;
    canvasInited = true;

    var canvas = document.getElementById('c');
    var ctx    = canvas.getContext('2d');
    var wrap   = document.getElementById('wrap');
    var DESTS = [
      { id:'ask',  label:'Ask Elijah', desc:'direct questions \u00b7 personal guidance', angle:-52 },
      { id:'res',  label:'Resources',  desc:'tools \u00b7 films \u00b7 study guides',          angle:0   },
      { id:'jour', label:'My Journey', desc:'story \u00b7 faith \u00b7 consistency',            angle:52  },
    ];
    var W, H, cx, cy, sc, dests=[];
    var src = { x:0, y:0, r:10 };
    var dragging=false, dragPos=null, snapDest=null, revealed=null, lineP=0;
    var t0 = Date.now();

    function hb(t) {
      var ph = (t % 1.1) / 1.1;
      if (ph < 0.07) return Math.sin(ph / 0.07 * Math.PI);
      if (ph < 0.16) return 0.48 * Math.sin((ph-0.07)/0.09*Math.PI);
      return 0;
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
      src.x=cx; src.y=cy; src.r=10*sc;
      var arm = Math.min(W*0.37, H*0.34, 180);
      dests = DESTS.map(function(d) {
        var rad = d.angle * Math.PI / 180;
        return { id:d.id, label:d.label, desc:d.desc, angle:d.angle, x:cx+Math.sin(rad)*arm, y:cy+Math.cos(rad)*arm*0.82, r:6*sc };
      });
      dests.forEach(function(d) {
        var lbl = document.getElementById('lbl-'+d.id);
        lbl.style.left = (d.x/W*100)+'%';
        lbl.style.top  = ((d.y/H*100)+5.2)+'%';
        lbl.textContent = d.label;
      });
    }

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

    function draw() {
      ctx.clearRect(0,0,W,H);
      var t=(Date.now()-t0)/1000;

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

      if (dragging && dragPos) {
        var sn=getSnap(dragPos);
        var tx=sn?sn.x:dragPos.x, ty=sn?sn.y:dragPos.y;
        var g=ctx.createLinearGradient(src.x,src.y,tx,ty);
        g.addColorStop(0,'rgba(232,224,208,0.95)');
        g.addColorStop(1,sn?'rgba(232,224,208,0.9)':'rgba(140,130,115,0.2)');
        ctx.beginPath(); ctx.moveTo(src.x,src.y); ctx.lineTo(tx,ty);
        ctx.strokeStyle=g; ctx.lineWidth=1.8; ctx.stroke();
      }

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

      requestAnimationFrame(draw);
    }

    function onDown(e) {
      if (revealed) return;
      var p=pt(e); var dx=p.x-src.x,dy=p.y-src.y;
      if (Math.sqrt(dx*dx+dy*dy)<src.r+20*sc) {
        dragging=true; dragPos=p; canvas.classList.add('drag');
        document.getElementById('instr').style.opacity='0'; e.preventDefault();
      }
    }

    function onMove(e) {
      if (!dragging) return;
      dragPos=pt(e); snapDest=getSnap(dragPos);
      dests.forEach(function(d){ document.getElementById('lbl-'+d.id).classList.toggle('lit',!!(snapDest&&snapDest.id===d.id)); });
      e.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging=false; canvas.classList.remove('drag');
      if (snapDest) {
        revealed=snapDest; lineP=0;
        document.getElementById('ptitle').textContent=snapDest.label;
        document.getElementById('pdesc').textContent=snapDest.desc;
        document.getElementById('panel').classList.add('show');
        dests.forEach(function(d){ document.getElementById('lbl-'+d.id).style.opacity=d.id===snapDest.id?'1':'0.12'; });

        // Wire up destination actions
        if (snapDest.id === 'ask') {
          setTimeout(openAsk, 600);
        } else if (snapDest.id === 'jour') {
          setTimeout(function() { location.reload(); }, 600);
        }
      }
      snapDest=null; dragPos=null;
    }

    canvas.addEventListener('mousedown',onDown);
    canvas.addEventListener('mousemove',onMove);
    canvas.addEventListener('mouseup',onUp);
    canvas.addEventListener('touchstart',onDown,{passive:false});
    canvas.addEventListener('touchmove',onMove,{passive:false});
    canvas.addEventListener('touchend',onUp);

    document.getElementById('rbtn').addEventListener('click',function(){
      revealed=null; lineP=0; dragPos=null; snapDest=null;
      document.getElementById('panel').classList.remove('show');
      document.getElementById('instr').style.opacity='1';
      dests.forEach(function(d){ var l=document.getElementById('lbl-'+d.id); l.style.opacity='1'; l.classList.remove('lit'); });
    });

    canvas.style.cursor='grab';
    setup();
    window.addEventListener('resize',setup);
    draw();
  }

}());
