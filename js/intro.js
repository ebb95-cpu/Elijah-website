(function () {
  'use strict';

  var handle     = document.getElementById('sliderHandle');
  var sliderWrap = document.getElementById('intro-slider');
  var track      = sliderWrap.querySelector('.slider-track');
  var fill       = sliderWrap.querySelector('.slider-fill');
  var intro      = document.getElementById('intro-screen');

  var dragging  = false;
  var completed = false;
  var currentX  = 0;

  handle.addEventListener('pointerdown', function (e) {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointerup', function () {
    if (!dragging) return;
    dragging = false;
    var progress = currentX / track.offsetWidth;
    if (progress > 0.75) {
      startJourney();
    }
  });

  window.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var rect = track.getBoundingClientRect();
    var x = e.clientX - rect.left;
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;
    currentX = x;
    handle.style.left = x + 'px';
    fill.style.width = x + 'px';
  });

  function startJourney() {
    if (completed) return;
    completed = true;
    sliderWrap.style.opacity = '0';
    setTimeout(function () {
      intro.classList.add('fading');
      setTimeout(function () {
        intro.style.display = 'none';
        document.dispatchEvent(new CustomEvent('journeyStart'));
      }, 1200);
    }, 400);
  }

}());
