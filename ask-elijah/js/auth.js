/* ── Ask Elijah — Auth (Supabase) + Onboarding ── */
(function () {
  'use strict';

  // ── Config ──
  var SUPABASE_URL  = window.__ENV_SUPABASE_URL  || 'https://eqhevpclmudbrmmltyyk.supabase.co';
  var SUPABASE_ANON = window.__ENV_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';
  var ADMIN_EMAIL = 'ebb95@mac.com';

  var supabase = null;
  if (SUPABASE_URL && SUPABASE_ANON) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }

  // ── DOM ──
  var authScreen       = document.getElementById('auth-screen');
  var magicScreen      = document.getElementById('magic-link-screen');
  var chatScreen       = document.getElementById('chat-screen');
  var onboardingScreen = document.getElementById('onboarding-screen');
  var authApple        = document.getElementById('auth-apple');
  var authGoogle       = document.getElementById('auth-google');
  var authEmailForm    = document.getElementById('auth-email-form');
  var authEmailInput   = document.getElementById('auth-email-input');
  var backToAuth       = document.getElementById('back-to-auth');

  // All screens that participate in transitions
  var allScreens = [authScreen, magicScreen, chatScreen, onboardingScreen].filter(Boolean);

  // ── Screen transitions ──
  function showScreen(screen) {
    allScreens.forEach(function (s) {
      s.classList.remove('visible');
    });
    if (screen) screen.classList.add('visible');
  }

  // ── Session check ──
  function checkSession() {
    if (!supabase) {
      showScreen(chatScreen);
      window.__askUser = { id: 'dev-user', email: 'dev@localhost' };
      window.dispatchEvent(new Event('ask-auth-ready'));
      return;
    }

    supabase.auth.getSession().then(function (result) {
      var session = result.data.session;
      if (session) {
        onSignedIn(session.user);
      } else {
        showScreen(authScreen);
      }
    });

    supabase.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_IN' && session) {
        onSignedIn(session.user);
      }
    });
  }

  // ── Sign-in handlers ──
  function signInWithProvider(provider) {
    if (!supabase) return;
    supabase.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.origin + '/ask-elijah/' }
    });
  }

  function signInWithEmail(email) {
    if (!supabase) return;
    supabase.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin + '/ask-elijah/' }
    }).then(function (result) {
      if (result.error) {
        console.error('Email sign-in error:', result.error.message);
        return;
      }
      showScreen(magicScreen);
    });
  }

  // ── Post sign-in routing ──
  function onSignedIn(user) {
    window.__askUser = {
      id: user.id,
      email: user.email,
      name: user.user_metadata && user.user_metadata.full_name || '',
      avatar: user.user_metadata && user.user_metadata.avatar_url || ''
    };

    // Admin redirect
    if (user.email === ADMIN_EMAIL) {
      window.location.href = '/ask-elijah/admin/';
      return;
    }

    // Check onboarding status
    if (!supabase) {
      showScreen(chatScreen);
      window.dispatchEvent(new Event('ask-auth-ready'));
      return;
    }

    supabase
      .from('user_profiles')
      .select('onboarding_complete, questions_remaining, name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(function (result) {
        var profile = result.data;

        if (profile && profile.onboarding_complete) {
          // Returning user — store profile data
          window.__askUser.name = profile.name || window.__askUser.name;
          window.__askUser.questionsRemaining = profile.questions_remaining;
          showScreen(chatScreen);
          window.dispatchEvent(new Event('ask-auth-ready'));
        } else {
          // New user or incomplete onboarding
          startOnboarding();
        }
      })
      .catch(function () {
        // If profile check fails, start onboarding
        startOnboarding();
      });
  }

  // ══════════════════════════════════
  //  ONBOARDING FLOW
  // ══════════════════════════════════

  var onboardingData = {};
  var currentStep = 1;
  var totalSteps = 5;

  function startOnboarding() {
    showScreen(onboardingScreen);
    showStep(1);
  }

  function showStep(step) {
    currentStep = step;
    var stepNumEl = document.getElementById('ob-step-num');
    var progressEl = document.querySelector('.onboarding-progress');

    // Update progress indicator
    if (step <= totalSteps) {
      stepNumEl.textContent = step;
      progressEl.style.display = '';
    } else {
      progressEl.style.display = 'none';
    }

    // Hide all steps, show active
    var steps = document.querySelectorAll('.ob-step');
    steps.forEach(function (s) { s.classList.remove('active'); });

    var targetId = step <= totalSteps ? 'ob-step-' + step : 'ob-step-bonus';
    var target = document.getElementById(targetId);
    if (target) {
      // Small delay for animation
      setTimeout(function () { target.classList.add('active'); }, 50);
    }
  }

  // Step 1: Name
  var obNext1 = document.getElementById('ob-next-1');
  var obName = document.getElementById('ob-name');
  if (obNext1) {
    obNext1.addEventListener('click', function () {
      var val = obName.value.trim();
      if (!val) { obName.focus(); return; }
      onboardingData.name = val;
      showStep(2);
    });
    obName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); obNext1.click(); }
    });
  }

  // Step 2: Age
  var obNext2 = document.getElementById('ob-next-2');
  var obAge = document.getElementById('ob-age');
  if (obNext2) {
    obNext2.addEventListener('click', function () {
      var val = parseInt(obAge.value, 10);
      if (!val || val < 10 || val > 99) { obAge.focus(); return; }
      onboardingData.age = val;
      showStep(3);
    });
    obAge.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); obNext2.click(); }
    });
  }

  // Step 3: Sport
  var obNext3 = document.getElementById('ob-next-3');
  var obSport = document.getElementById('ob-sport');
  var obSportOther = document.getElementById('ob-sport-other');
  if (obSport) {
    obSport.addEventListener('change', function () {
      if (obSport.value === 'Other') {
        obSportOther.style.display = '';
        obSportOther.focus();
      } else {
        obSportOther.style.display = 'none';
      }
    });
  }
  if (obNext3) {
    obNext3.addEventListener('click', function () {
      var val = obSport.value;
      if (!val) { obSport.focus(); return; }
      if (val === 'Other') {
        val = obSportOther.value.trim();
        if (!val) { obSportOther.focus(); return; }
      }
      onboardingData.sport = val;
      showStep(4);
    });
  }

  // Step 4: Level (auto-advance on click)
  var levelBtns = document.querySelectorAll('.ob-level-btn');
  levelBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      onboardingData.level = btn.getAttribute('data-level');
      showStep(5);
    });
  });

  // Step 5: Goal
  var obNext5 = document.getElementById('ob-next-5');
  var obGoal = document.getElementById('ob-goal');
  if (obNext5) {
    obNext5.addEventListener('click', function () {
      var val = obGoal.value.trim();
      if (!val) { obGoal.focus(); return; }
      onboardingData.goal = val;
      showStep(6); // bonus step
    });
  }

  // Bonus: Social handle
  var obClaimBonus = document.getElementById('ob-claim-bonus');
  var obSkipBonus = document.getElementById('ob-skip-bonus');
  var obSocial = document.getElementById('ob-social');

  if (obClaimBonus) {
    obClaimBonus.addEventListener('click', function () {
      var val = obSocial.value.trim();
      if (!val) { obSocial.focus(); return; }
      onboardingData.social_handle = val;
      onboardingData.bonus = true;
      completeOnboarding();
    });
  }
  if (obSkipBonus) {
    obSkipBonus.addEventListener('click', function () {
      onboardingData.bonus = false;
      completeOnboarding();
    });
  }

  // ── Complete onboarding ──
  function completeOnboarding() {
    var user = window.__askUser;
    if (!user || !supabase) return;

    var questionsRemaining = onboardingData.bonus ? 7 : 6;

    // Auto-detect location + language
    var language = (navigator.language || navigator.userLanguage || 'en').substring(0, 2);

    // Fetch geo data
    fetch('https://ipapi.co/json/')
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        return insertProfile(user, geo, language, questionsRemaining);
      })
      .catch(function () {
        // If geo fails, insert without location
        return insertProfile(user, {}, language, questionsRemaining);
      });
  }

  function insertProfile(user, geo, language, questionsRemaining) {
    var now = new Date().toISOString();
    var profileData = {
      user_id: user.id,
      email: user.email,
      name: onboardingData.name,
      age: onboardingData.age,
      location_city: geo.city || '',
      location_country: geo.country_name || '',
      language: language,
      sport: onboardingData.sport,
      level: onboardingData.level,
      goal: onboardingData.goal,
      social_handle: onboardingData.social_handle || null,
      questions_remaining: questionsRemaining,
      questions_total: questionsRemaining,
      onboarding_complete: true,
      total_questions_asked: 0,
      first_seen: now,
      last_active: now,
      created_at: now
    };

    return supabase
      .from('user_profiles')
      .upsert(profileData, { onConflict: 'user_id' })
      .then(function () {
        // Update user data and transition to chat
        window.__askUser.name = onboardingData.name;
        window.__askUser.questionsRemaining = questionsRemaining;
        showScreen(chatScreen);
        window.dispatchEvent(new Event('ask-auth-ready'));
      })
      .catch(function (err) {
        console.error('Profile insert error:', err);
        // Still show chat even if DB fails
        showScreen(chatScreen);
        window.dispatchEvent(new Event('ask-auth-ready'));
      });
  }

  // ── Event listeners ──
  authApple.addEventListener('click', function () { signInWithProvider('apple'); });
  authGoogle.addEventListener('click', function () { signInWithProvider('google'); });

  authEmailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = authEmailInput.value.trim();
    if (email) signInWithEmail(email);
  });

  backToAuth.addEventListener('click', function () { showScreen(authScreen); });

  // ── Init ──
  authScreen.classList.add('visible');
  checkSession();

  // Expose for other modules
  window.__askSupabase = supabase;
})();
