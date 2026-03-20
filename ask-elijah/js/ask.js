/* ── Ask Elijah — Chat Logic + Question Quota ── */
(function () {
  'use strict';

  // ── DOM ──
  var chatMessages   = document.getElementById('chat-messages');
  var welcomeSection = document.getElementById('welcome-section');
  var typingIndicator = document.getElementById('typing-indicator');
  var chatInput      = document.getElementById('chat-input');
  var chatSend       = document.getElementById('chat-send');
  var notifyModal    = document.getElementById('notify-modal');
  var notifyYes      = document.getElementById('notify-yes');
  var notifyNo       = document.getElementById('notify-no');
  var paywallOverlay = document.getElementById('paywall-overlay');
  var questionsBar   = document.getElementById('questions-remaining-bar');
  var questionsCount = document.getElementById('questions-remaining-count');

  // ── State ──
  var conversationHistory = [];
  var isWaiting = false;
  var pendingEscalationId = null;
  var questionsRemaining = null;

  // ── Update questions remaining display ──
  function updateQuotaDisplay() {
    if (questionsRemaining === null || questionsRemaining === undefined) {
      if (questionsBar) questionsBar.classList.remove('visible');
      return;
    }
    if (questionsBar && questionsCount) {
      questionsCount.textContent = questionsRemaining;
      questionsBar.classList.add('visible');
    }
  }

  // ── Show beta limit popup ──
  function showPaywall() {
    if (paywallOverlay) paywallOverlay.classList.add('visible');
  }

  // ── Beta share flow ──
  window.__betaShare = function () {
    var shareOptions = document.getElementById('beta-share-options');
    if (shareOptions) {
      // If native Web Share API is available, use it directly
      if (navigator.share) {
        var shareUrl = window.location.origin + '/ask-elijah/profile.html';
        navigator.share({
          title: 'Ask Elijah',
          text: 'Get real answers from Elijah Bryant — faith, training, mindset, consistency.',
          url: shareUrl
        }).then(function () {
          submitFeedbackAndUnlock();
        }).catch(function () {
          // User cancelled share — show manual options
          shareOptions.style.display = 'flex';
        });
      } else {
        shareOptions.style.display = 'flex';
      }
    }
  };

  // Bind share option buttons
  document.querySelectorAll('.beta-share-option').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var platform = btn.dataset.platform;
      var shareUrl = encodeURIComponent(window.location.origin + '/ask-elijah/profile.html');
      var shareText = encodeURIComponent('Get real answers from Elijah Bryant — faith, training, mindset, consistency.');
      var url = '';

      if (platform === 'copy') {
        navigator.clipboard.writeText(window.location.origin + '/ask-elijah/profile.html');
        btn.textContent = 'Copied!';
        setTimeout(function () { submitFeedbackAndUnlock(); }, 800);
        return;
      } else if (platform === 'sms') {
        url = 'sms:?body=' + shareText + '%20' + shareUrl;
      } else if (platform === 'twitter') {
        url = 'https://twitter.com/intent/tweet?url=' + shareUrl + '&text=' + shareText;
      } else if (platform === 'whatsapp') {
        url = 'https://wa.me/?text=' + shareText + '%20' + shareUrl;
      }

      if (url) window.open(url, '_blank');
      // Give them credit after clicking share
      setTimeout(function () { submitFeedbackAndUnlock(); }, 1500);
    });
  });

  function submitFeedbackAndUnlock() {
    var feedbackInput = document.getElementById('beta-feedback-input');
    var feedback = feedbackInput ? feedbackInput.value.trim() : '';
    var user = window.__askUser || {};

    // Save feedback + grant 3 more questions via backend
    fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'beta-share',
        userId: user.id || null,
        feedback: feedback
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.questionsGranted) {
        questionsRemaining = data.questionsRemaining || 3;
        updateQuotaDisplay();
      }
      // Close overlay
      if (paywallOverlay) paywallOverlay.classList.remove('visible');
      // Show confirmation
      appendMessage('ai', 'Thanks for sharing! You\'ve unlocked 3 more questions. Faith + Consistency.');
    })
    .catch(function () {
      // Grant locally even if API fails
      questionsRemaining = 3;
      updateQuotaDisplay();
      if (paywallOverlay) paywallOverlay.classList.remove('visible');
      appendMessage('ai', 'Thanks for sharing! You\'ve unlocked 3 more questions. Faith + Consistency.');
    });
  }

  // ── Fetch current quota from Supabase ──
  function fetchQuota() {
    var supabase = window.__askSupabase;
    var user = window.__askUser;
    if (!supabase || !user || !user.id) return;

    supabase
      .from('user_profiles')
      .select('questions_remaining')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(function (result) {
        if (result.data) {
          questionsRemaining = result.data.questions_remaining;
          window.__askUser.questionsRemaining = questionsRemaining;
          updateQuotaDisplay();
        }
      });
  }

  // ── Auto-resize textarea ──
  chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // ── Send on Enter (Shift+Enter for newline) ──
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  chatSend.addEventListener('click', sendMessage);

  // ── Suggested questions ──
  document.querySelectorAll('.suggested-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      chatInput.value = btn.getAttribute('data-q');
      sendMessage();
    });
  });

  // ── Send message ──
  function sendMessage() {
    var text = chatInput.value.trim();
    if (!text || isWaiting) return;

    // Check quota before sending
    if (questionsRemaining !== null && questionsRemaining <= 0) {
      showPaywall();
      return;
    }

    // Hide welcome section on first message
    if (welcomeSection) {
      welcomeSection.style.display = 'none';
    }

    // Add user bubble
    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Show typing indicator
    isWaiting = true;
    typingIndicator.classList.add('visible');
    scrollToBottom();

    // Call API
    callAskAPI(text);
  }

  // ── Call the ask endpoint ──
  function callAskAPI(question) {
    var user = window.__askUser || {};

    fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: question,
        history: conversationHistory.slice(0, -1),
        userId: user.id || null
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      typingIndicator.classList.remove('visible');
      isWaiting = false;

      if (data.error) {
        appendMessage('ai', 'Something went wrong. Try again in a moment.');
        return;
      }

      // Add AI response
      var sources = data.sources || [];
      var escalated = data.escalated || false;
      var questionId = data.questionId || null;

      appendMessage('ai', data.response, sources, escalated, questionId);
      conversationHistory.push({ role: 'assistant', content: data.response });

      // Decrement local quota and update display
      if (questionsRemaining !== null) {
        questionsRemaining--;
        if (questionsRemaining < 0) questionsRemaining = 0;
        updateQuotaDisplay();
      }
    })
    .catch(function () {
      typingIndicator.classList.remove('visible');
      isWaiting = false;
      appendMessage('ai', 'Connection lost. Please try again.');
    });
  }

  // ── Append message bubble ──
  function appendMessage(role, text, sources, escalated, questionId) {
    var div = document.createElement('div');
    div.className = 'msg msg--' + (role === 'user' ? 'user' : 'ai');

    // Message text
    var textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = text;
    div.appendChild(textEl);

    // Source citations
    if (sources && sources.length > 0) {
      var sourcesEl = document.createElement('div');
      sourcesEl.className = 'msg-sources';
      var sourcesLabel = document.createElement('span');
      sourcesLabel.className = 'msg-sources-label';
      sourcesLabel.textContent = 'Sources';
      sourcesEl.appendChild(sourcesLabel);
      sources.forEach(function (src) {
        var a = document.createElement('a');
        a.className = 'msg-source-link';
        a.href = src.url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        var type = (src.source_type || src.type || '').toLowerCase();
        var icon = '\uD83D\uDCDD';
        if (type === 'youtube' || type === 'video') icon = '\uD83C\uDFAC';
        else if (type === 'pdf') icon = '\uD83D\uDCC4';
        else if (type === 'audio' || type === 'podcast') icon = '\uD83C\uDF99\uFE0F';
        a.textContent = icon + ' ' + (src.title || 'Source');
        sourcesEl.appendChild(a);
      });
      div.appendChild(sourcesEl);
    }

    // Escalation: "Get notified" button
    if (escalated && questionId) {
      var notifyBtn = document.createElement('button');
      notifyBtn.className = 'msg-notify-btn';
      notifyBtn.textContent = 'Get notified when Elijah answers';
      notifyBtn.addEventListener('click', function () {
        optInNotification(questionId, notifyBtn);
      });
      div.appendChild(notifyBtn);
    }

    chatMessages.appendChild(div);
    scrollToBottom();
  }

  // ── Opt-in for escalation notification ──
  function optInNotification(questionId, btnEl) {
    var user = window.__askUser || {};

    fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'notify-opt-in',
        questionId: questionId,
        userId: user.id || null
      })
    })
    .then(function () {
      if (btnEl) {
        btnEl.textContent = 'You\'ll be notified';
        btnEl.classList.add('opted-in');
      }
    })
    .catch(function () {
      if (btnEl) btnEl.textContent = 'Failed — try again';
    });
  }

  // ── Scroll to bottom ──
  function scrollToBottom() {
    requestAnimationFrame(function () {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  // ── Load chat history on auth ready ──
  window.addEventListener('ask-auth-ready', function () {
    // Set initial quota from auth data
    var user = window.__askUser;
    if (user && user.questionsRemaining !== undefined) {
      questionsRemaining = user.questionsRemaining;
      updateQuotaDisplay();
    } else {
      fetchQuota();
    }

    loadChatHistory();
  });

  function loadChatHistory() {
    var supabase = window.__askSupabase;
    var user = window.__askUser;
    if (!supabase || !user || !user.id) return;

    supabase
      .from('questions')
      .select('question_text, response_text, sources_used, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(function (result) {
        var rows = result.data;
        if (!rows || rows.length === 0) return;

        // Hide welcome and show history
        if (welcomeSection) welcomeSection.style.display = 'none';

        rows.forEach(function (row) {
          appendMessage('user', row.question_text);
          conversationHistory.push({ role: 'user', content: row.question_text });

          if (row.response_text) {
            var sources = [];
            try { sources = JSON.parse(row.sources_used) || []; } catch (e) {}
            appendMessage('ai', row.response_text, sources);
            conversationHistory.push({ role: 'assistant', content: row.response_text });
          }
        });
      });
  }

  // ── Notify modal handlers ──
  notifyYes.addEventListener('click', function () {
    if (pendingEscalationId) {
      optInNotification(pendingEscalationId, null);
    }
    notifyModal.classList.remove('visible');
  });
  notifyNo.addEventListener('click', function () {
    notifyModal.classList.remove('visible');
  });

})();
