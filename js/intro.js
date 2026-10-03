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

    function getClientX(e) {
      return e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
    }

    function setSliderPosition(e) {
      var rect = track.getBoundingClientRect();
      var x = getClientX(e) - rect.left;
      if (x < 0) x = 0;
      if (x > rect.width) x = rect.width;
      currentX = x;
      handle.style.left = x + 'px';
      fill.style.width = x + 'px';
    }

    function startDrag(e) {
      dragging = true;
      if (e.pointerId !== undefined && e.currentTarget && e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      setSliderPosition(e);
      e.preventDefault();
    }

    handle.addEventListener('pointerdown', startDrag);
    track.addEventListener('pointerdown', startDrag);
    handle.addEventListener('mousedown', startDrag);
    track.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });
    track.addEventListener('touchstart', startDrag, { passive: false });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      var progress = currentX / track.offsetWidth;
      if (progress > 0.75) {
        startJourney(sliderWrap, screen, beforeStart);
      }
    }

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);

    function moveDrag(e) {
      if (!dragging) return;
      setSliderPosition(e);
      e.preventDefault();
    }

    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('touchmove', moveDrag, { passive: false });
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
