/* ============================================================
   Conversations Page — Chat thread viewer
   ============================================================ */

var SUPABASE_URL = 'https://eqhevpclmudbrmmltyyk.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
var ADMIN_EMAIL = 'ebb95@mac.com';

var convState = {
  conversations: [],  // grouped by user
  activeTab: 'my-delphi',
  selectedUserId: null,
  searchQuery: ''
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
      renderConversationList();
      showEmptyThread();
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
