/* ── Ask Elijah — Auth (Supabase) ── */
(function () {
  'use strict';

  // ── Config ──
  // Replace with your Supabase project values (or load from env at build time)
  var SUPABASE_URL  = window.__ENV_SUPABASE_URL  || 'https://eqhevpclmudbrmmltyyk.supabase.co';
  var SUPABASE_ANON = window.__ENV_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';

  var supabase = null;
  if (SUPABASE_URL && SUPABASE_ANON) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }

  // ── DOM ──
  var authScreen      = document.getElementById('auth-screen');
  var magicScreen     = document.getElementById('magic-link-screen');
  var chatScreen      = document.getElementById('chat-screen');
  var authApple       = document.getElementById('auth-apple');
  var authGoogle      = document.getElementById('auth-google');
  var authEmailForm   = document.getElementById('auth-email-form');
  var authEmailInput  = document.getElementById('auth-email-input');
  var backToAuth      = document.getElementById('back-to-auth');

  // ── Screen transitions ──
  function showScreen(screen) {
    [authScreen, magicScreen, chatScreen].forEach(function (s) {
      s.classList.remove('visible');
    });
    screen.classList.add('visible');
  }

  // ── Session check ──
  function checkSession() {
    if (!supabase) {
      // Dev mode: skip auth, go straight to chat
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

    // Listen for auth state changes (handles magic link redirect)
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

  // ── Post sign-in ──
  function onSignedIn(user) {
    window.__askUser = {
      id: user.id,
      email: user.email,
      name: user.user_metadata && user.user_metadata.full_name || '',
      avatar: user.user_metadata && user.user_metadata.avatar_url || ''
    };

    // Upsert user profile with location (fire-and-forget)
    upsertProfile(user);

    showScreen(chatScreen);
    window.dispatchEvent(new Event('ask-auth-ready'));
  }

  // ── Upsert profile with geolocation ──
  function upsertProfile(user) {
    // Get approximate location from IP
    fetch('https://ipapi.co/json/')
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        if (!supabase) return;
        supabase.from('user_profiles').upsert({
          user_id: user.id,
          location_city: geo.city || '',
          location_country: geo.country_name || '',
          last_active: new Date().toISOString()
        }, { onConflict: 'user_id' });
      })
      .catch(function () { /* silent fail */ });
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
  checkSession();

  // Expose for other modules
  window.__askSupabase = supabase;
})();
