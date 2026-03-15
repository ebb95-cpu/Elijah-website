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
    // Placeholder: store locally and confirm
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

  // Close modal on backdrop click
  askScreen.addEventListener('click', function (e) {
    if (e.target === askScreen) closeAsk();
  });

  // ─── Three-dot navigation ─────────────────────────────────────────────────

  // Ask Elijah
  document.getElementById('nav-ask-btn').addEventListener('click', openAsk);

  // Resources — exclusive toggle within nav
  var resourcesEntry = document.getElementById('nav-resources');
  var resourcesBtn   = document.getElementById('nav-resources-btn');

  resourcesBtn.addEventListener('click', function () {
    var isOpen = resourcesEntry.classList.contains('open');
    resourcesEntry.classList.toggle('open', !isOpen);
    resourcesBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  // My Journey — replay the full animation
  document.getElementById('nav-journey-btn').addEventListener('click', function () {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  // ─── Resource categories (exclusive accordion) ────────────────────────────

  var catEntries = document.querySelectorAll('.cat-entry');

  catEntries.forEach(function (entry) {
    var toggle = entry.querySelector('.cat-toggle');
    toggle.addEventListener('click', function () {
      var isOpen = entry.classList.contains('open');
      // Close all categories
      catEntries.forEach(function (e) {
        e.classList.remove('open');
        e.querySelector('.cat-toggle').setAttribute('aria-expanded', 'false');
      });
      // Open clicked if it was closed
      if (!isOpen) {
        entry.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
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

}());
