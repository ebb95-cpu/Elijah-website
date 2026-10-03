(function () {
  'use strict';

  // Leaflet and the country geometry stay unloaded until someone chooses the journey.
  function bootJourney() {

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
    attributionControl: true,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    keyboard: false,
    boxZoom: false,
    tap: false
  });

  // Local country geometry keeps ocean and city labels out of the journey.
  map.createPane('countryLabels');
  map.getPane('countryLabels').style.zIndex = '450';
  map.getPane('countryLabels').style.pointerEvents = 'none';
  fetch('images/world-countries.geojson').then(function (response) {
    if (!response.ok) throw new Error('Country map could not be loaded');
    return response.json();
  }).then(function (data) {
    L.geoJSON(data, {
      interactive: false,
      style: { color: '#191919', weight: 0.7, fillColor: '#292929', fillOpacity: 1 },
      attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>'
    }).addTo(map);
    var labels = data.features.map(function (feature) {
      var props = feature.properties;
      var text = document.createElement('span');
      text.textContent = props.NAME_EN === 'United States of America' ? 'United States' : props.NAME_EN;
      return {
        minimumZoom: Math.max(2, props.MIN_LABEL),
        marker: L.marker([props.LABEL_Y, props.LABEL_X], {
          pane: 'countryLabels', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'journey-country-label', html: text, iconSize: [120, 16], iconAnchor: [60, 8] })
        }).addTo(map)
      };
    });
    function updateCountryLabels() {
      var card = document.getElementById('location-card').getBoundingClientRect();
      var mapRect = map.getContainer().getBoundingClientRect();
      labels.forEach(function (label) {
        var point = map.latLngToContainerPoint(label.marker.getLatLng());
        var x = point.x + mapRect.left;
        var y = point.y + mapRect.top;
        var behindText = x + 60 > card.left - 16 && x - 60 < card.right + 16 &&
          y + 8 > card.top - 20 && y - 8 < card.bottom + 20;
        label.marker.setOpacity(map.getZoom() >= label.minimumZoom && !behindText ? 1 : 0);
      });
    }
    map.on('move zoom resize', updateCountryLabels);
    updateCountryLabels();
  }).catch(function (error) { console.error(error); });

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

  function isMobileViewport() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function getFlightDuration(stop) {
    var currentCenter = map.getCenter();
    var distance = currentCenter.distanceTo([stop.lat, stop.lng]);
    var base = isMobileViewport() ? 1.35 : 1.55;
    var range = isMobileViewport() ? 0.72 : 0.9;
    var max = isMobileViewport() ? 2.05 : 2.45;
    var duration = base + Math.min(distance / 6800000, range);
    return Math.max(base, Math.min(duration, max));
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
    await flyToView(stop.lat, stop.lng, isMobileViewport() ? 4 : 5, isMobileViewport() ? 1.1 : 1.35);
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
        padding: isMobileViewport() ? [120, 120] : [170, 170],
        maxZoom: isMobileViewport() ? 4 : 5,
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

  function addLine(from, to, delay) {
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
      var start = null;
      var duration = 520;

      function draw(now) {
        if (!start) start = now;
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

      setTimeout(function () {
        requestAnimationFrame(draw);
      }, delay || 0);
    });
  }

  function drawFullRoute() {
    canDrawRoute = true;
    var segments = [];
    for (var i = 0; i < STOPS.length - 1; i++) {
      segments.push(addLine(STOPS[i], STOPS[i + 1], i * 65));
    }
    return Promise.all(segments).then(function () {
      return undefined;
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
    if (!isActive) element.classList.add('settled');
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
        padding: isMobileViewport() ? [34, 34] : [70, 70],
        duration: isMobileViewport() ? 1.6 : 2,
        easeLinearity: 0.25
      });
    });
  }

  function showWorldOverview() {
    return flyToView(
      25,
      -35,
      isMobileViewport() ? 1 : 2,
      isMobileViewport() ? 1.25 : 1.55
    );
  }

  function showUnitedStatesOverview() {
    return flyToView(
      38,
      -96,
      isMobileViewport() ? 3 : 4,
      isMobileViewport() ? 1.1 : 1.35
    );
  }

  function isUnitedStatesStop(stop) {
    return ['01', '02', '03', '04', '07'].indexOf(stop.num) !== -1;
  }

  // ─── Main journey runner ──────────────────────────────────────────────────

  async function runJourney() {
    clearRouteLines();
    var prev = null;
    var activeMarker = null;

    // Begin close enough to read the domestic chapter as one connected journey.
    await showUnitedStatesOverview();
    canDrawRoute = true;

    for (var i = 0; i < STOPS.length; i++) {
      var stop = STOPS[i];
      if (prev) {
        var leavingUnitedStates = isUnitedStatesStop(prev) && !isUnitedStatesStop(stop);
        var returningToUnitedStates = !isUnitedStatesStop(prev) && isUnitedStatesStop(stop);

        if (leavingUnitedStates) {
          await showWorldOverview();
        }

        await addLine(prev, stop, 120);

        if (returningToUnitedStates) {
          await showUnitedStatesOverview();
        }
      }

      // Add each stop without leaving the world view.
      if (activeMarker) pulseMarker(activeMarker, false);
      activeMarker = addDot(stop);
      pulseMarker(activeMarker, true);
      await wait(210);
      // 4. Show card
      showCard(stop);
      // 5. Hold
      await wait(2200);
      // 6. Hide card
      hideCard();
      await wait(380);
      prev = stop;
    }
    if (activeMarker) pulseMarker(activeMarker, false);
    await showWorldOverview();
    await wait(750);
    // Final messages
    await showFinalMessages();
  }

  // ─── Listen for journey start ─────────────────────────────────────────────

  var journeyScreen = document.getElementById('journey-screen');
  journeyScreen.classList.add('visible');
  journeyScreen.style.opacity = '';
  journeyScreen.style.pointerEvents = '';
  clearRouteLines();
  setTimeout(function () {
    map.invalidateSize();
    setTimeout(runJourney, 320);
  }, 280);
  }

  function loadLeaflet(done) {
    if (window.L) { done(); return; }
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = function () { done(); };
    script.onerror = function () { console.error('Map could not be loaded'); };
    document.head.appendChild(script);
  }

  var booted = false;
  document.addEventListener('journeyStart', function () {
    document.documentElement.classList.add('watching-journey');
    var journeyScreen = document.getElementById('journey-screen');
    if (journeyScreen) {
      journeyScreen.classList.add('visible');
      journeyScreen.style.opacity = '';
      journeyScreen.style.pointerEvents = '';
    }
    if (booted) return;
    loadLeaflet(function () {
      if (booted) return;
      booted = true;
      bootJourney();
    });
  });

}());
