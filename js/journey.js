(function () {
  'use strict';

  var STOPS = [
    {
      lat: 33.749, lng: -84.388, zoom: 6,
      num: '01', city: 'Atlanta', sub: 'Georgia',
      message: 'Where the dream started.',
      image: null
    },
    {
      lat: 43.194, lng: -71.572, zoom: 7,
      num: '02', city: 'New Hampshire', sub: 'USA',
      message: 'Learning what it means to sacrifice.',
      image: null
    },
    {
      lat: 36.100, lng: -79.512, zoom: 7,
      num: '03', city: 'Elon University', sub: 'Elon, North Carolina',
      message: 'The work begins to show.',
      image: null
    },
    {
      lat: 40.234, lng: -111.658, zoom: 7,
      num: '04', city: 'BYU', sub: 'Provo, Utah',
      message: 'Faith becomes part of the foundation.',
      image: null
    },
    {
      lat: 29.558, lng: 34.952, zoom: 8,
      num: '05', city: 'Eilat', sub: 'Israel',
      message: 'The world opens up.',
      image: null
    },
    {
      lat: 32.085, lng: 34.782, zoom: 8,
      num: '06', city: 'Maccabi Tel Aviv', sub: 'Israel',
      message: 'Pressure, tradition, and growth.',
      image: null
    },
    {
      lat: 43.039, lng: -87.907, zoom: 7,
      num: '07', city: 'Milwaukee Bucks', sub: 'Wisconsin',
      message: 'The NBA dream realized.',
      image: null
    },
    {
      lat: 41.008, lng: 28.978, zoom: 7,
      num: '08', city: 'Anadolu Efes', sub: 'Istanbul, Turkey',
      message: 'A different culture. Same pursuit.',
      image: null
    },
    {
      lat: 32.090, lng: 34.790, zoom: 8,
      num: '09', city: 'Hapoel Tel-Aviv', sub: 'Israel',
      message: 'The journey continues.',
      image: null
    }
  ];

  // ─── Map initialization ───────────────────────────────────────────────────
  var map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    keyboard: false,
    boxZoom: false,
    tap: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  var locationCard  = document.getElementById('location-card');
  var locNumber     = document.getElementById('loc-number');
  var locCity       = document.getElementById('loc-city');
  var locSub        = document.getElementById('loc-sub');
  var locMessage    = document.getElementById('loc-message');
  var journeyOverlay = document.getElementById('journey-overlay');
  var finalMsg1     = document.getElementById('final-msg-1');
  var finalMsg2     = document.getElementById('final-msg-2');
  var finalMsg3     = document.getElementById('final-msg-3');

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function flyTo(stop) {
    return new Promise(function (resolve) {
      var timeout = setTimeout(resolve, 2400); // fallback
      map.once('moveend', function () {
        clearTimeout(timeout);
        setTimeout(resolve, 100); // brief settle
      });
      map.flyTo([stop.lat, stop.lng], stop.zoom, {
        duration: 1.9,
        easeLinearity: 0.28
      });
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function addDot(stop) {
    var icon = L.divIcon({
      className: 'journey-dot-icon',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
    L.marker([stop.lat, stop.lng], { icon: icon, interactive: false }).addTo(map);
  }

  function addLine(from, to) {
    L.polyline(
      [[from.lat, from.lng], [to.lat, to.lng]],
      { color: 'rgba(255,255,255,0.32)', weight: 1, interactive: false }
    ).addTo(map);
  }

  function showCard(stop) {
    locNumber.textContent  = stop.num;
    locCity.textContent    = stop.city;
    locSub.textContent     = stop.sub;
    locMessage.textContent = stop.message;
    locationCard.classList.add('visible');
  }

  function hideCard() {
    locationCard.classList.remove('visible');
  }

  async function showFinalMessages() {
    var lines = finalMsg2.querySelectorAll('.fm-line');

    // 1. Dim the map
    journeyOverlay.classList.add('dimmed');
    await wait(900);

    // 2. "Every experience is a dot."
    finalMsg1.classList.add('visible');
    await wait(3800); // covers 0.9s fade-in + hold

    // 3. Fade out msg1, wait for transition to finish
    finalMsg1.classList.remove('visible');
    await wait(1000);

    // 4. Reveal msg2 container, then stagger each line
    finalMsg2.classList.add('visible');
    await wait(150); // brief settle before first line appears
    lines[0].classList.add('visible');
    await wait(1800);
    lines[1].classList.add('visible');
    await wait(1800);
    lines[2].classList.add('visible');
    await wait(3200); // hold all three lines

    // 5. Fade out msg2
    finalMsg2.classList.remove('visible');
    await wait(1000);

    // 6. "Faith + Consistency"
    finalMsg3.classList.add('visible');
    await wait(3000);

    // 7. Fade out "Faith + Consistency"
    finalMsg3.classList.remove('visible');
    await wait(1100);

    // 8. Complete
    document.dispatchEvent(new CustomEvent('journeyComplete'));
  }

  // ─── Main journey runner ──────────────────────────────────────────────────

  async function runJourney() {
    var prev = null;
    for (var i = 0; i < STOPS.length; i++) {
      var stop = STOPS[i];
      // 1. Fly to location
      await flyTo(stop);
      // 2. Add dot
      addDot(stop);
      // 3. Draw line from previous
      if (prev) addLine(prev, stop);
      // 4. Show card
      showCard(stop);
      // 5. Hold
      await wait(3000);
      // 6. Hide card
      hideCard();
      await wait(350);
      prev = stop;
    }
    // Final messages
    await showFinalMessages();
  }

  // ─── Listen for journey start ─────────────────────────────────────────────

  document.addEventListener('journeyStart', function () {
    var journeyScreen = document.getElementById('journey-screen');
    journeyScreen.classList.add('visible');
    // invalidate map size after screen is shown
    setTimeout(function () {
      map.invalidateSize();
      runJourney();
    }, 500);
  });

}());
