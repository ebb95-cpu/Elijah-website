(function () {
  'use strict';

  var STOPS = [
    {
      lat: 34.082, lng: -83.902, zoom: 8,
      num: '01', city: 'Georgia', sub: 'Mill Creek High School',
      tag: 'Zero-star recruit',
      message: 'The foundation was built before anyone was watching.',
      image: null
    },
    {
      lat: 43.194, lng: -71.572, zoom: 7,
      num: '02', city: 'New Hampshire', sub: 'New Hampton School',
      tag: 'Post-graduate year',
      message: 'One more year to grow, sharpen, and keep believing.',
      image: null
    },
    {
      lat: 36.100, lng: -79.512, zoom: 7,
      num: '03', city: 'Elon, North Carolina', sub: 'Elon University',
      tag: 'CAA Rookie of the Year',
      message: 'The work started turning into proof.',
      image: null
    },
    {
      lat: 40.234, lng: -111.658, zoom: 7,
      num: '04', city: 'Provo, Utah', sub: 'BYU',
      tag: 'Redshirt. Injury. NBA pursuit.',
      message: 'A setback became a decision point. Faith had to become action.',
      image: null
    },
    {
      lat: 29.558, lng: 34.952, zoom: 8,
      num: '05', city: 'Eilat, Israel', sub: 'Hapoel Eilat',
      tag: 'First Team All-Israeli League',
      message: 'The first pro chapter opened the world.',
      image: null
    },
    {
      lat: 32.085, lng: 34.782, zoom: 8,
      num: '06', city: 'Tel Aviv, Israel', sub: 'Maccabi Tel Aviv',
      tag: 'Role player',
      message: 'Learning how to impact winning inside a bigger system.',
      image: null
    },
    {
      lat: 43.039, lng: -87.907, zoom: 7,
      num: '07', city: 'Milwaukee, Wisconsin', sub: 'Milwaukee Bucks',
      tag: 'NBA Champion',
      message: 'The dream became real. The preparation was not wasted.',
      image: null
    },
    {
      lat: 41.008, lng: 28.978, zoom: 7,
      num: '08', city: 'Istanbul, Turkey', sub: 'Anadolu Efes',
      tag: 'Role player. EuroLeague Champion.',
      message: 'Another elite room. Another lesson in winning.',
      image: null
    },
    {
      lat: 32.113, lng: 34.806, zoom: 8,
      num: '09', city: 'Tel Aviv, Israel', sub: 'Hapoel Tel Aviv',
      tag: 'First Team All-EuroLeague',
      message: 'The journey kept expanding. The work kept speaking.',
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
  var locTag        = document.getElementById('loc-tag');
  var locMessage    = document.getElementById('loc-message');
  var journeyOverlay = document.getElementById('journey-overlay');
  var finalMsg1     = document.getElementById('final-msg-1');
  var finalMsg2     = document.getElementById('final-msg-2');
  var finalMsg3     = document.getElementById('final-msg-3');
  var routeLines = [];
  var canDrawRoute = false;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function getFlightDuration(stop) {
    var currentCenter = map.getCenter();
    var distance = currentCenter.distanceTo([stop.lat, stop.lng]);
    var duration = 1.55 + Math.min(distance / 6200000, 0.9);
    return Math.max(1.55, Math.min(duration, 2.45));
  }

  function flyToView(lat, lng, zoom, duration) {
    return new Promise(function (resolve) {
      var timeout = setTimeout(resolve, (duration * 1000) + 900);
      map.once('moveend', function () {
        clearTimeout(timeout);
        setTimeout(resolve, 260);
      });
      map.flyTo([lat, lng], zoom, {
        duration: duration,
        easeLinearity: 0.18
      });
    });
  }

  async function flyToFirstStop(stop) {
    await flyToView(stop.lat, stop.lng, 5, 1.35);
  }

  function flyTo(stop) {
    return new Promise(function (resolve) {
      var duration = getFlightDuration(stop);
      var timeout = setTimeout(resolve, (duration * 1000) + 900); // fallback
      map.once('moveend', function () {
        clearTimeout(timeout);
        setTimeout(resolve, 260); // brief settle
      });
      map.flyTo([stop.lat, stop.lng], stop.zoom, {
        duration: duration,
        easeLinearity: 0.18
      });
    });
  }

  function flyToSegment(from, to) {
    return new Promise(function (resolve) {
      var bounds = L.latLngBounds([[from.lat, from.lng], [to.lat, to.lng]]);
      var center = bounds.getCenter();
      var duration = getFlightDuration({ lat: center.lat, lng: center.lng });
      var timeout = setTimeout(resolve, (duration * 1000) + 900);
      map.once('moveend', function () {
        clearTimeout(timeout);
        setTimeout(resolve, 220);
      });
      map.flyToBounds(bounds, {
        padding: [170, 170],
        maxZoom: 5,
        duration: duration,
        easeLinearity: 0.18
      });
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function addDot(stop) {
    var icon = L.divIcon({
      className: 'journey-dot-icon',
      html: '<span class="journey-dot-core"></span>',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
    return L.marker([stop.lat, stop.lng], {
      icon: icon,
      interactive: false,
      zIndexOffset: 500
    }).addTo(map);
  }

  function addLine(from, to) {
    return new Promise(function (resolve) {
      if (!canDrawRoute) {
        resolve();
        return;
      }
      var fromPoint = map.latLngToLayerPoint([from.lat, from.lng]);
      var toPoint = map.latLngToLayerPoint([to.lat, to.lng]);
      var line = L.polyline(
        [[from.lat, from.lng]],
        { color: 'rgba(255,255,255,0.42)', weight: 1.15, interactive: false }
      ).addTo(map);
      routeLines.push(line);
      var start = performance.now();
      var duration = 320;

      function draw(now) {
        var progress = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        var x = fromPoint.x + (toPoint.x - fromPoint.x) * eased;
        var y = fromPoint.y + (toPoint.y - fromPoint.y) * eased;
        var current = map.layerPointToLatLng([x, y]);
        line.setLatLngs([[from.lat, from.lng], current]);

        if (progress < 1) {
          requestAnimationFrame(draw);
        } else {
          line.setLatLngs([[from.lat, from.lng], [to.lat, to.lng]]);
          resolve();
        }
      }

      requestAnimationFrame(draw);
    });
  }

  function drawFullRoute() {
    return new Promise(function (resolve) {
      canDrawRoute = true;
      var index = 0;

      function drawNext() {
        if (index >= STOPS.length - 1) {
          resolve();
          return;
        }

        addLine(STOPS[index], STOPS[index + 1]).then(function () {
          index += 1;
          setTimeout(drawNext, 25);
        });
      }

      drawNext();
    });
  }

  function clearRouteLines() {
    routeLines.forEach(function (line) {
      map.removeLayer(line);
    });
    routeLines = [];
    canDrawRoute = false;
  }

  function showCard(stop) {
    locNumber.textContent  = stop.num;
    locCity.textContent    = stop.city;
    locSub.textContent     = stop.sub;
    locTag.textContent     = stop.tag;
    locMessage.textContent = stop.message;
    locationCard.classList.add('visible');
  }

  function hideCard() {
    locationCard.classList.remove('visible');
  }

  async function showFinalMessages() {
    var lines = finalMsg2.querySelectorAll('.fm-line');
    lines.forEach(function (line) { line.classList.remove('visible'); });

    // 1. Dim the map
    journeyOverlay.classList.add('dimmed');
    await wait(900);

    // 2. Final word sequence, one fixed center slot
    finalMsg1.classList.add('visible');
    await wait(2100);

    finalMsg1.classList.remove('visible');
    await wait(1000);

    finalMsg2.classList.add('visible');
    await wait(100);
    lines[0].classList.add('visible');
    await wait(2100);
    lines[0].classList.remove('visible');
    await wait(1000);
    lines[1].classList.add('visible');
    await wait(2100);
    lines[1].classList.remove('visible');
    await wait(1000);

    finalMsg2.classList.remove('visible');
    await wait(100);

    finalMsg3.classList.add('visible');
    await wait(2300);

    finalMsg3.classList.remove('visible');
    await wait(1100);

    // 8. Complete
    document.dispatchEvent(new CustomEvent('journeyComplete'));
  }

  function pulseMarker(marker, isActive) {
    var element = marker && marker.getElement ? marker.getElement() : null;
    if (!element) return;
    element.classList.toggle('active', !!isActive);
  }

  function showFullRoute() {
    return new Promise(function (resolve) {
      var bounds = L.latLngBounds(STOPS.map(function (stop) {
        return [stop.lat, stop.lng];
      }));
      var timeout = setTimeout(resolve, 2600);
      map.once('moveend', function () {
        clearTimeout(timeout);
        setTimeout(resolve, 240);
      });
      map.flyToBounds(bounds, {
        padding: [70, 70],
        duration: 2,
        easeLinearity: 0.25
      });
    });
  }

  // ─── Main journey runner ──────────────────────────────────────────────────

  async function runJourney() {
    clearRouteLines();
    var prev = null;
    var activeMarker = null;
    for (var i = 0; i < STOPS.length; i++) {
      var stop = STOPS[i];
      // 1. Fly to location
      if (i === 0) {
        await flyToFirstStop(stop);
      } else if (prev) {
        await flyToSegment(prev, stop);
      } else {
        await flyTo(stop);
      }
      // 2. Add dot
      if (activeMarker) pulseMarker(activeMarker, false);
      activeMarker = addDot(stop);
      pulseMarker(activeMarker, true);
      await wait(260);
      // 4. Show card
      showCard(stop);
      // 5. Hold
      await wait(2850);
      // 6. Hide card
      hideCard();
      await wait(520);
      prev = stop;
    }
    if (activeMarker) pulseMarker(activeMarker, false);
    await showFullRoute();
    await wait(450);
    await drawFullRoute();
    await wait(1100);
    // Final messages
    await showFinalMessages();
  }

  // ─── Listen for journey start ─────────────────────────────────────────────

  document.addEventListener('journeyStart', function () {
    var journeyScreen = document.getElementById('journey-screen');
    journeyScreen.classList.add('visible');
    clearRouteLines();
    // invalidate map size after screen is shown
    setTimeout(function () {
      map.invalidateSize();
      setTimeout(runJourney, 320);
    }, 280);
  });

}());
