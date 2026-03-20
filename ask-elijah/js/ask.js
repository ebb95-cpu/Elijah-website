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

  // ── Citations panel state ──
  var citPanel = document.getElementById('cit-panel');
  var citPanelBody = document.getElementById('cit-panel-body');
  var citPanelClose = document.getElementById('cit-panel-close');
  var activeCitations = [];
  var panelOpen = false;

  function openCitPanel(sources) {
    activeCitations = sources || [];
    panelOpen = true;
    citPanel.classList.add('open');
    renderCitPanel();
  }

  function closeCitPanel() {
    panelOpen = false;
    citPanel.classList.remove('open');
  }

  if (citPanelClose) citPanelClose.addEventListener('click', closeCitPanel);

  // Close panel when clicking on chat area
  if (chatMessages) {
    chatMessages.addEventListener('click', function (e) {
      // Don't close if clicking a badge or chip
      if (e.target.closest('.cit-badge') || e.target.closest('.cit-chip')) return;
      if (panelOpen) closeCitPanel();
    });
  }

  function renderCitPanel() {
    if (!citPanelBody || activeCitations.length === 0) return;
    var html = '';

    // Featured card (first source)
    var featured = activeCitations[0];
    html += renderSourceCard(featured, 0, true);

    // More sources
    if (activeCitations.length > 1) {
      html += '<div class="cit-more-label">More sources</div>';
      for (var i = 1; i < activeCitations.length; i++) {
        html += renderSourceRow(activeCitations[i], i);
      }
    }

    citPanelBody.innerHTML = html;
  }

  function getSourceType(src) {
    var type = (src.source_type || src.type || '').toLowerCase();
    var url = (src.url || '').toLowerCase();
    if (type === 'tweet' || url.indexOf('x.com') > -1 || url.indexOf('twitter.com') > -1) return 'tweet';
    if (type === 'tiktok' || url.indexOf('tiktok.com') > -1) return 'tiktok';
    if (type === 'youtube' || type === 'video' || url.indexOf('youtube.com') > -1 || url.indexOf('youtu.be') > -1) return 'youtube';
    if (type === 'q&a' || type === 'qa') return 'qa';
    return 'generic';
  }

  function getDomain(url) {
    if (!url) return '';
    try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return ''; }
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  function renderSourceCard(src, idx, featured) {
    var st = getSourceType(src);
    var domain = getDomain(src.url);
    var title = src.title || 'Source';
    var body = src.body || src.text || '';
    var html = '';

    html += '<div class="cit-card' + (featured ? ' cit-card--featured' : '') + '">';

    if (st === 'tweet') {
      html += '<div class="cit-card-text">' + escHtml(truncate(body, 300)) + '</div>';
      html += '<div class="cit-tweet-embed">';
      html += '<div class="cit-tweet-text">' + escHtml(truncate(body, 280)) + '</div>';
      html += '<div class="cit-tweet-time">' + escHtml(src.timestamp || '') + '</div>';
      html += '<div class="cit-tweet-actions">';
      html += '<span class="cit-tweet-action cit-tweet-heart"><svg viewBox="0 0 24 24" width="14" height="14" fill="#e05a7a" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ' + (src.likes || 0) + '</span>';
      html += '<span class="cit-tweet-action"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Reply</span>';
      html += '<span class="cit-tweet-action"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Copy link</span>';
      html += '</div>';
      if (src.replyCount) html += '<button class="cit-tweet-replies">Read ' + src.replyCount + ' replies</button>';
      html += '</div>';
    } else if (st === 'tiktok') {
      html += '<div class="cit-source-domain"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.89 2.89 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.14 15.67a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.07a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.5z"/></svg> <span>' + escHtml(domain) + '</span></div>';
      html += '<div class="cit-card-title">' + escHtml(title) + '</div>';
      html += '<div class="cit-card-snippet">' + escHtml(truncate(body, 200)) + '</div>';
    } else if (st === 'youtube') {
      html += '<div class="cit-source-domain"><svg viewBox="0 0 24 24" width="16" height="16" fill="#ff4444"><path d="M23 7s-.3-2-1.1-2.9C20.8 3 19.6 3 19 2.9 16 2.7 12 2.7 12 2.7s-4 0-7 .2c-.6.1-1.8.1-2.9 1.1C1.3 5 1 7 1 7S.7 9.3.7 11.7v2.1c0 2.3.3 4.7.3 4.7s.3 2 1.1 2.9c1.1 1 2.5.9 3.1 1 2.3.2 9.8.3 9.8.3s4 0 7-.2c.6-.1 1.8-.1 2.9-1.1.8-.9 1.1-2.9 1.1-2.9s.3-2.3.3-4.7v-2.1C24.3 9.3 23 7 23 7zM9.7 15.9V8.5l6.3 3.7-6.3 3.7z"/></svg> <span>' + escHtml(domain || 'youtube.com') + '</span></div>';
      html += '<div class="cit-card-title">' + escHtml(title) + '</div>';
      if (src.clipCount) html += '<div class="cit-card-clips">' + src.clipCount + ' clip' + (src.clipCount > 1 ? 's' : '') + '</div>';
    } else if (st === 'qa') {
      html += '<div class="cit-qa-badge"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Answered by Elijah</div>';
      html += '<div class="cit-card-title">Q: ' + escHtml(title) + '</div>';
      html += '<div class="cit-card-snippet">' + escHtml(truncate(body, 200)) + '</div>';
    } else {
      html += '<div class="cit-source-domain">' + escHtml(domain) + '</div>';
      html += '<div class="cit-card-title">' + escHtml(title) + '</div>';
      if (body) html += '<div class="cit-card-snippet">' + escHtml(truncate(body, 200)) + '</div>';
    }

    // Link to source
    if (src.url) {
      html += '<a class="cit-card-link" href="' + escAttr(src.url) + '" target="_blank" rel="noopener">View source</a>';
    }

    html += '</div>';
    return html;
  }

  function renderSourceRow(src, idx) {
    var st = getSourceType(src);
    var domain = getDomain(src.url);
    var title = src.title || 'Source';
    var iconColor = '#5a5a56';
    var iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

    if (st === 'youtube') { iconColor = '#ff4444'; iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="#ff4444"><path d="M23 7s-.3-2-1.1-2.9C20.8 3 19.6 3 19 2.9 16 2.7 12 2.7 12 2.7s-4 0-7 .2c-.6.1-1.8.1-2.9 1.1C1.3 5 1 7 1 7S.7 9.3.7 11.7v2.1c0 2.3.3 4.7.3 4.7s.3 2 1.1 2.9c1.1 1 2.5.9 3.1 1 2.3.2 9.8.3 9.8.3s4 0 7-.2c.6-.1 1.8-.1 2.9-1.1.8-.9 1.1-2.9 1.1-2.9s.3-2.3.3-4.7v-2.1C24.3 9.3 23 7 23 7zM9.7 15.9V8.5l6.3 3.7-6.3 3.7z"/></svg>'; }
    else if (st === 'tiktok') { iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.89 2.89 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.14 15.67a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.07a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.5z"/></svg>'; }
    else if (st === 'tweet') { iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4l6.5 8L4 20h2l5.5-6.8L16 20h4l-6.8-8.4L19.5 4H18l-5 6.2L9 4H4z"/></svg>'; }
    else if (st === 'qa') { iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'; }

    var html = '<a class="cit-source-row" href="' + escAttr(src.url || '#') + '" target="_blank" rel="noopener">';
    html += '<span class="cit-row-chevron">&#8250;</span>';
    html += '<span class="cit-row-icon" style="color:' + iconColor + '">' + iconSvg + '</span>';
    html += '<span class="cit-row-info">';
    html += '<span class="cit-row-domain">' + escHtml(domain) + '</span>';
    html += '<span class="cit-row-title">' + escHtml(title) + '</span>';
    html += '</span>';
    html += '</a>';
    return html;
  }

  function escHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ── Append message bubble ──
  function appendMessage(role, text, sources, escalated, questionId) {
    var div = document.createElement('div');
    div.className = 'msg msg--' + (role === 'user' ? 'user' : 'ai');

    // Message text — inject inline citation badges for AI messages
    var textEl = document.createElement('div');
    textEl.className = 'msg-text';

    if (role === 'ai' && sources && sources.length > 0) {
      // Replace [1], [2], etc. with clickable badges, and append remaining badges
      var processed = text;
      var hasBracketCitations = /\[\d+\]/.test(text);

      if (hasBracketCitations) {
        // Replace [N] with badge HTML
        processed = text.replace(/\[(\d+)\]/g, function (match, num) {
          return '<button class="cit-badge" data-cit-idx="' + (parseInt(num) - 1) + '" aria-label="View source ' + num + '">' + num + '</button>';
        });
        textEl.innerHTML = processed;
      } else {
        textEl.textContent = text;
      }

      // Store sources on the message div for panel access
      div._sources = sources;
    } else {
      textEl.textContent = text;
    }
    div.appendChild(textEl);

    // Citation chips (below message text)
    if (role === 'ai' && sources && sources.length > 0) {
      var chipsEl = document.createElement('div');
      chipsEl.className = 'cit-chips';
      sources.forEach(function (src, i) {
        var chip = document.createElement('button');
        chip.className = 'cit-chip';
        chip.setAttribute('data-cit-idx', i);
        chip.innerHTML = '<span class="cit-chip-num">' + (i + 1) + '</span> ' + escHtml(truncate(src.title || 'Source', 30));
        chipsEl.appendChild(chip);
      });
      div.appendChild(chipsEl);
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

    // Wire up badge and chip clicks
    div.querySelectorAll('.cit-badge, .cit-chip').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var msgDiv = el.closest('.msg');
        if (msgDiv && msgDiv._sources) {
          openCitPanel(msgDiv._sources);
        }
      });
    });

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
