(function () {
  'use strict';

  var intro      = document.getElementById('intro-screen');
  var reflection = document.getElementById('reflection-screen');
  var reflectBrand = document.getElementById('reflect-brand');

  var completed = false;

  function wireSlider(sliderId, handleId, screen, beforeStart) {
    var sliderWrap = document.getElementById(sliderId);
    var handle = document.getElementById(handleId);
    if (!sliderWrap || !handle) return;

    var track = sliderWrap.querySelector('.slider-track');
    var fill = sliderWrap.querySelector('.slider-fill');
    var dragging = false;
    var currentX = 0;

    handle.addEventListener('pointerdown', function (e) {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    window.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      var progress = currentX / track.offsetWidth;
      if (progress > 0.75) {
        startJourney(sliderWrap, screen, beforeStart);
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
      e.preventDefault();
    });
  }

  function startJourney(sliderWrap, screen, beforeStart) {
    if (completed) return;
    completed = true;
    sliderWrap.style.opacity = '0';
    setTimeout(function () {
      if (beforeStart) beforeStart();
      screen.classList.add('fading');
      setTimeout(function () {
        screen.style.display = 'none';
        document.dispatchEvent(new CustomEvent('journeyStart'));
      }, 720);
    }, 180);
  }

  wireSlider('intro-slider', 'sliderHandle', intro);
  wireSlider('reflect-slider', 'reflectHandle', reflection, function () {
    if (reflectBrand) reflectBrand.classList.add('visible');
  });

}());
