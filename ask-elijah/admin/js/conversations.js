/* ============================================================
   Conversations Page — Chat thread viewer
   ============================================================ */

var SUPABASE_URL = 'https://eqhevpclmudbrmmltyyk.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
var ADMIN_EMAIL = 'ebb95@mac.com';

var convState = {
  conversations: [],  // grouped by user
  activeTab: 'ask-elijah',
  selectedUserId: null,
  searchQuery: '',
  previewHistory: [],  // chat history for preview mode
  previewSending: false
};

// ── Boot ──
document.addEventListener('DOMContentLoaded', function () {
  checkAuth();
});

async function checkAuth() {
  try {
    var { data } = await sb.auth.getSession();
    var session = data && data.session;
    if (!session || (session.user && session.user.email !== ADMIN_EMAIL)) {
      window.location.href = '/ask-elijah/';
      return;
    }
    boot();
  } catch (e) {
    window.location.href = '/ask-elijah/';
  }
}

async function boot() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('app-shell').style.display = 'flex';
  bindEvents();
  await loadConversations();
  renderConversationList();
}

// ── Events ──
function bindEvents() {
  // Tab switching
  document.querySelectorAll('.conv-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.conv-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      convState.activeTab = tab.dataset.tab;
      convState.selectedUserId = null;

      if (convState.activeTab === 'preview') {
        openPreviewChat();
      } else {
        renderConversationList();
        showEmptyThread();
      }
    });
  });

  // Search toggle
  document.getElementById('conv-search-btn').addEventListener('click', function () {
    var bar = document.getElementById('conv-search-bar');
    bar.classList.toggle('open');
    if (bar.classList.contains('open')) document.getElementById('conv-search-input').focus();
  });

  document.getElementById('conv-search-input').addEventListener('input', function () {
    convState.searchQuery = this.value.toLowerCase();
    renderConversationList();
  });

  // Send reply
  document.getElementById('conv-send-btn').addEventListener('click', sendReply);
  document.getElementById('conv-reply-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  });

  // Sidebar more dropdown
  var moreBtn = document.getElementById('btn-more');
  var dropdown = document.getElementById('sidebar-dropdown');
  if (moreBtn) {
    moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
  }
  document.addEventListener('click', function () {
    if (dropdown) dropdown.classList.remove('open');
  });
}

// ── Load conversations from Supabase ──
async function loadConversations() {
  var { data: questions, error } = await sb
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('Failed to load conversations:', error);
    return;
  }

  // Group by user_id
  var byUser = {};
  (questions || []).forEach(function (q) {
    var uid = q.user_id || 'anonymous';
    if (!byUser[uid]) {
      byUser[uid] = {
        user_id: uid,
        messages: [],
        lastMessage: null,
        lastTime: null
      };
    }
    byUser[uid].messages.push(q);
    if (!byUser[uid].lastTime || new Date(q.created_at) > new Date(byUser[uid].lastTime)) {
      byUser[uid].lastTime = q.created_at;
      byUser[uid].lastMessage = q.question_text;
    }
  });

  // Sort by most recent
  convState.conversations = Object.values(byUser).sort(function (a, b) {
    return new Date(b.lastTime) - new Date(a.lastTime);
  });

  // Load user profiles for display names
  var userIds = Object.keys(byUser);
  if (userIds.length > 0) {
    var { data: profiles } = await sb
      .from('user_profiles')
      .select('user_id, name, email')
      .in('user_id', userIds);

    var profileMap = {};
    (profiles || []).forEach(function (p) {
      profileMap[p.user_id] = p;
    });

    convState.conversations.forEach(function (conv) {
      var p = profileMap[conv.user_id];
      conv.name = (p && p.name) ? p.name : (p && p.email) ? p.email.split('@')[0] : 'User ' + conv.user_id.slice(0, 6);
      conv.email = (p && p.email) ? p.email : '';
    });
  }
}

// ── Render conversation list ──
function renderConversationList() {
  var $list = document.getElementById('conv-list');
  var convs = convState.conversations;

  if (convState.searchQuery) {
    convs = convs.filter(function (c) {
      return c.name.toLowerCase().indexOf(convState.searchQuery) !== -1 ||
        (c.lastMessage || '').toLowerCase().indexOf(convState.searchQuery) !== -1;
    });
  }

  if (convs.length === 0) {
    $list.innerHTML = '<div class="conv-list-empty">No conversations yet</div>';
    return;
  }

  var html = '';
  convs.forEach(function (conv) {
    var initials = getInitials(conv.name);
    var isActive = conv.user_id === convState.selectedUserId;
    var preview = conv.lastMessage || '';
    if (preview.length > 50) preview = preview.substring(0, 50) + '…';

    html += '<div class="conv-item' + (isActive ? ' active' : '') + '" data-user-id="' + esc(conv.user_id) + '">';
    html += '<div class="conv-item-avatar">' + esc(initials) + '</div>';
    html += '<div class="conv-item-info">';
    html += '<div class="conv-item-top">';
    html += '<span class="conv-item-name">' + esc(conv.name) + '</span>';
    html += '<span class="conv-item-time">' + formatTimeAgo(conv.lastTime) + '</span>';
    html += '</div>';
    html += '<div class="conv-item-preview">' + esc(preview) + '</div>';
    html += '</div>';
    html += '</div>';
  });

  $list.innerHTML = html;

  // Bind clicks
  $list.querySelectorAll('.conv-item').forEach(function (el) {
    el.addEventListener('click', function () {
      var userId = el.dataset.userId;
      convState.selectedUserId = userId;
      renderConversationList();
      renderThread(userId);
    });
  });
}

// ── Render chat thread ──
function renderThread(userId) {
  var conv = convState.conversations.find(function (c) { return c.user_id === userId; });
  if (!conv) return showEmptyThread();

  document.getElementById('conv-thread-empty').style.display = 'none';
  document.getElementById('conv-thread').style.display = 'flex';

  // Header
  var initials = getInitials(conv.name);
  document.getElementById('conv-thread-header').innerHTML =
    '<div class="conv-thread-header-avatar">' + esc(initials) + '</div>' +
    '<div>' +
    '<div class="conv-thread-header-name">' + esc(conv.name) + '</div>' +
    '<div class="conv-thread-header-meta">' + conv.messages.length + ' messages · ' + (conv.email ? esc(conv.email) : 'No email') + '</div>' +
    '</div>';

  // Messages (oldest first)
  var messages = conv.messages.slice().sort(function (a, b) {
    return new Date(a.created_at) - new Date(b.created_at);
  });

  var html = '';
  messages.forEach(function (msg, idx) {
    // User question
    html += '<div class="conv-msg user">';
    html += '<div class="conv-msg-bubble">' + esc(msg.question_text) + '</div>';
    html += '<div class="conv-msg-meta">' + formatDateTime(msg.created_at) + '</div>';
    html += '</div>';

    // AI response
    if (msg.response_text) {
      html += '<div class="conv-msg ai">';
      html += '<div class="conv-msg-bubble">' + formatAIResponse(msg.response_text, msg.sources_used) + '</div>';
      html += '<div class="conv-msg-actions">';
      html += '<button class="conv-msg-action-btn" onclick="editAnswer(\'' + msg.id + '\')">Edit this answer</button>';
      html += '</div>';
      html += '<div class="conv-msg-meta">' + formatDateTime(msg.created_at) + (msg.confidence ? ' · ' + Math.round(msg.confidence * 100) + '% confidence' : '') + '</div>';
      html += '</div>';
    }
  });

  document.getElementById('conv-thread-messages').innerHTML = html;

  // Scroll to bottom
  var $msgs = document.getElementById('conv-thread-messages');
  $msgs.scrollTop = $msgs.scrollHeight;

  // Mobile: show thread panel
  document.getElementById('conv-thread-panel').classList.add('mobile-open');
}

function showEmptyThread() {
  document.getElementById('conv-thread-empty').style.display = 'flex';
  document.getElementById('conv-thread').style.display = 'none';
}

// ── Send personal reply ──
async function sendReply() {
  var $input = document.getElementById('conv-reply-input');
  var text = $input.value.trim();
  if (!text || !convState.selectedUserId) return;

  $input.value = '';

  // Insert as a question with response (admin reply)
  var { data: session } = await sb.auth.getSession();
  var token = session && session.session ? session.session.access_token : '';

  // Add reply to the thread visually
  var $msgs = document.getElementById('conv-thread-messages');
  var replyHtml = '<div class="conv-msg ai">';
  replyHtml += '<div class="conv-msg-bubble" style="border-left: 2px solid #e8573a;">' + esc(text) + '</div>';
  replyHtml += '<div class="conv-msg-meta">Just now · Personal reply</div>';
  replyHtml += '</div>';
  $msgs.innerHTML += replyHtml;
  $msgs.scrollTop = $msgs.scrollHeight;

  // Save to database
  try {
    await sb.from('questions').insert({
      user_id: convState.selectedUserId,
      question_text: '[Admin Reply]',
      response_text: text,
      status: 'answered',
      confidence: 1.0,
      sources_used: JSON.stringify([])
    });
  } catch (e) {
    console.error('Failed to save reply:', e);
  }
}

// ── Edit answer ──
window.editAnswer = function (questionId) {
  var newAnswer = prompt('Edit the AI response:');
  if (!newAnswer) return;

  sb.from('questions')
    .update({ response_text: newAnswer })
    .eq('id', questionId)
    .then(function () {
      renderThread(convState.selectedUserId);
    });
};

// ── Format AI response with citations ──
function formatAIResponse(text, sourcesJson) {
  var escaped = esc(text);
  // Add citation badges if sources exist
  try {
    var sources = typeof sourcesJson === 'string' ? JSON.parse(sourcesJson) : sourcesJson;
    if (sources && sources.length > 0) {
      // Add citation numbers at sentence ends
      var sentences = escaped.split(/(?<=\.)\s/);
      var citationIdx = 0;
      escaped = sentences.map(function (s, i) {
        if (i < sources.length) {
          citationIdx++;
          return s + '<span class="conv-citation">' + citationIdx + '</span>';
        }
        return s;
      }).join(' ');
    }
  } catch (e) {}
  return escaped;
}

// ── Helpers ──
function esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var now = new Date();
  var diffMs = now - d;
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return diffMin + 'm';
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + 'h';
  var diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return diffDay + 'd';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function adminLogout() {
  sb.auth.signOut().then(function () {
    window.location.href = '/ask-elijah/';
  });
}

// ============================================================
// Preview Chat — test the AI as if you're a user
// ============================================================

function openPreviewChat() {
  // Hide conversation list content, show preview state
  document.getElementById('conv-list').innerHTML =
    '<div class="conv-list-empty" style="padding:20px;color:#888;font-size:12px">' +
    'Preview mode — test how your AI responds to questions. ' +
    'Messages here are not saved.' +
    '</div>';

  // Show thread panel with preview UI
  document.getElementById('conv-thread-empty').style.display = 'none';
  var $thread = document.getElementById('conv-thread');
  $thread.style.display = 'flex';

  // Header
  document.getElementById('conv-thread-header').innerHTML =
    '<div class="conv-thread-header-avatar" style="background:#e8573a;color:#fff">EB</div>' +
    '<div>' +
    '<div class="conv-thread-header-name">Ask Elijah — Preview</div>' +
    '<div class="conv-thread-header-meta">Test your AI · Messages are not saved</div>' +
    '</div>' +
    '<button class="conv-msg-action-btn" style="margin-left:auto" onclick="clearPreviewChat()">Clear</button>';

  // Update input placeholder
  document.getElementById('conv-reply-input').placeholder = 'Ask a question as a user…';

  // Render existing preview messages or welcome
  if (convState.previewHistory.length === 0) {
    renderPreviewWelcome();
  } else {
    renderPreviewMessages();
  }

  // Mobile
  document.getElementById('conv-thread-panel').classList.add('mobile-open');
}

function renderPreviewWelcome() {
  var html = '<div class="preview-welcome">';
  html += '<svg viewBox="0 0 24 24" width="40" height="40" stroke="#e8573a" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  html += '<div class="preview-welcome-title">Preview your AI</div>';
  html += '<div class="preview-welcome-desc">Ask questions to see exactly how your AI responds to users. This uses your real knowledge base.</div>';
  html += '<div class="preview-suggestions">';
  html += '<button class="preview-suggestion" onclick="askPreviewQuestion(this.textContent)">What does your morning routine look like?</button>';
  html += '<button class="preview-suggestion" onclick="askPreviewQuestion(this.textContent)">What books changed your perspective?</button>';
  html += '<button class="preview-suggestion" onclick="askPreviewQuestion(this.textContent)">How do you stay consistent?</button>';
  html += '<button class="preview-suggestion" onclick="askPreviewQuestion(this.textContent)">What\'s your approach to nutrition?</button>';
  html += '</div>';
  html += '</div>';
  document.getElementById('conv-thread-messages').innerHTML = html;
}

function renderPreviewMessages() {
  var $msgs = document.getElementById('conv-thread-messages');
  var html = '';

  convState.previewHistory.forEach(function (msg, idx) {
    if (msg.role === 'user') {
      html += '<div class="conv-msg user">';
      html += '<div class="conv-msg-bubble">' + esc(msg.text) + '</div>';
      html += '<div class="conv-msg-meta">' + formatDateTime(msg.time) + '</div>';
      html += '</div>';
    } else {
      html += '<div class="conv-msg ai">';
      html += '<div class="conv-msg-bubble">' + esc(msg.text) + '</div>';

      // Source links
      if (msg.sources && msg.sources.length > 0) {
        html += '<div class="preview-sources">';
        msg.sources.forEach(function (s) {
          var label = s.title || s.source_type || 'Source';
          var icon = getSourceIcon(s.source_type);
          if (s.url) {
            html += '<a class="preview-source-pill preview-source-link" href="' + esc(s.url) + '" target="_blank" rel="noopener" title="' + esc(s.url) + '">' + icon + esc(label) + '</a>';
          } else {
            html += '<span class="preview-source-pill" title="' + esc(label) + '">' + icon + esc(label) + '</span>';
          }
        });
        html += '</div>';
      }

      // Action buttons
      html += '<div class="preview-msg-actions">';
      html += '<button class="preview-action-btn" data-idx="' + idx + '" data-action="thumbsup" title="Good response">';
      html += '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
      html += '</button>';
      html += '<button class="preview-action-btn" data-idx="' + idx + '" data-action="edit" title="Edit this response">';
      html += '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      html += '</button>';
      html += '<button class="preview-action-btn" data-idx="' + idx + '" data-action="add" title="Add to this response">';
      html += '<svg viewBox="0 0 24 24" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      html += '</button>';
      html += '</div>';

      if (msg.confidence) {
        html += '<div class="conv-msg-meta">' + formatDateTime(msg.time) + ' · ' + Math.round(msg.confidence * 100) + '% confidence</div>';
      } else {
        html += '<div class="conv-msg-meta">' + formatDateTime(msg.time) + '</div>';
      }
      html += '</div>';
    }
  });

  $msgs.innerHTML = html;
  $msgs.scrollTop = $msgs.scrollHeight;

  // Bind action buttons
  $msgs.querySelectorAll('.preview-action-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = parseInt(btn.dataset.idx);
      var action = btn.dataset.action;
      handlePreviewAction(idx, action, btn);
    });
  });
}

function getSourceIcon(sourceType) {
  if (!sourceType) return '';
  var t = sourceType.toLowerCase();
  if (t.indexOf('youtube') !== -1) return '<span class="source-icon">▶</span>';
  if (t.indexOf('tiktok') !== -1) return '<span class="source-icon">♪</span>';
  if (t.indexOf('newsletter') !== -1 || t.indexOf('email') !== -1) return '<span class="source-icon">✉</span>';
  if (t.indexOf('manual') !== -1 || t.indexOf('qa') !== -1) return '<span class="source-icon">✎</span>';
  if (t.indexOf('instagram') !== -1) return '<span class="source-icon">◎</span>';
  return '<span class="source-icon">📄</span>';
}

function handlePreviewAction(msgIdx, action, btnEl) {
  var msg = convState.previewHistory[msgIdx];
  if (!msg || msg.role !== 'ai') return;

  if (action === 'thumbsup') {
    btnEl.classList.toggle('active');
    if (btnEl.classList.contains('active')) {
      msg.thumbsUp = true;
      btnEl.style.color = '#4ade80';
    } else {
      msg.thumbsUp = false;
      btnEl.style.color = '';
    }
  } else if (action === 'edit') {
    var newText = prompt('Edit the AI response:', msg.text);
    if (newText && newText !== msg.text) {
      msg.text = newText;
      msg.edited = true;
      renderPreviewMessages();
    }
  } else if (action === 'add') {
    var addition = prompt('Add to this response:');
    if (addition) {
      msg.text = msg.text + '\n\n' + addition;
      msg.edited = true;
      renderPreviewMessages();
    }
  }
}

// Called from suggestion buttons or input
window.askPreviewQuestion = function (text) {
  if (!text || convState.previewSending) return;
  sendPreviewMessage(text);
};

// Override sendReply for preview mode
var _originalSendReply = sendReply;
sendReply = async function () {
  if (convState.activeTab === 'preview') {
    var $input = document.getElementById('conv-reply-input');
    var text = $input.value.trim();
    if (!text || convState.previewSending) return;
    $input.value = '';
    sendPreviewMessage(text);
  } else {
    return _originalSendReply();
  }
};

async function sendPreviewMessage(text) {
  convState.previewSending = true;

  // Add user message
  convState.previewHistory.push({
    role: 'user',
    text: text,
    time: new Date().toISOString()
  });
  renderPreviewMessages();

  // Show typing indicator
  var $msgs = document.getElementById('conv-thread-messages');
  $msgs.innerHTML += '<div class="conv-msg ai" id="preview-typing"><div class="conv-msg-bubble"><div class="conv-typing"><svg class="typing-dots-svg" viewBox="0 0 44 12" width="44" height="12" fill="none"><circle class="typing-dot-circle typing-dot-1" cx="6" cy="6" r="3" fill="#e8573a"/><circle class="typing-dot-circle typing-dot-2" cx="22" cy="6" r="3" fill="#e8573a"/><circle class="typing-dot-circle typing-dot-3" cx="38" cy="6" r="3" fill="#e8573a"/><line class="typing-line" x1="9" y1="6" x2="19" y2="6" stroke="#e8573a" stroke-width="2" stroke-linecap="round"/><line class="typing-line" x1="25" y1="6" x2="35" y2="6" stroke="#e8573a" stroke-width="2" stroke-linecap="round"/></svg></div></div></div>';
  $msgs.scrollTop = $msgs.scrollHeight;

  // Build history for API (last 10 messages)
  var apiHistory = convState.previewHistory
    .filter(function (m) { return m.role === 'user' || m.role === 'ai'; })
    .slice(-10)
    .map(function (m) {
      return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text };
    });

  try {
    var res = await fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: apiHistory.slice(0, -1), // exclude current message (it's the message param)
        userId: 'admin-preview'
      })
    });

    var data = await res.json();

    // Remove typing indicator
    var typing = document.getElementById('preview-typing');
    if (typing) typing.remove();

    if (data.error) {
      convState.previewHistory.push({
        role: 'ai',
        text: 'Error: ' + data.error,
        time: new Date().toISOString(),
        sources: [],
        confidence: 0
      });
    } else {
      convState.previewHistory.push({
        role: 'ai',
        text: data.response || 'No response',
        time: new Date().toISOString(),
        sources: data.sources || [],
        confidence: data.confidence || null
      });
    }
  } catch (err) {
    var typing = document.getElementById('preview-typing');
    if (typing) typing.remove();

    convState.previewHistory.push({
      role: 'ai',
      text: 'Failed to reach the AI: ' + err.message,
      time: new Date().toISOString(),
      sources: [],
      confidence: 0
    });
  }

  convState.previewSending = false;
  renderPreviewMessages();
}

window.clearPreviewChat = function () {
  convState.previewHistory = [];
  renderPreviewWelcome();
};
