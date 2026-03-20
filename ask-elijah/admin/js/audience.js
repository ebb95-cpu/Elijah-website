/* ============================================================
   Audience / Members Page
   ============================================================ */

var SUPABASE_URL = 'https://eqhevpclmudbrmmltyyk.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
var ADMIN_EMAIL = 'ebb95@mac.com';

var ITEMS_PER_PAGE = 25;

var audState = {
  members: [],
  searchQuery: '',
  filterStatus: null,
  currentPage: 1,
  sortField: 'last_active',
  sortDir: 'desc'
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
  await loadMembers();
  render();
}

function bindEvents() {
  // Search
  document.getElementById('aud-search-btn').addEventListener('click', function () {
    var bar = document.getElementById('aud-search-bar');
    bar.classList.toggle('open');
    if (bar.classList.contains('open')) document.getElementById('aud-search-input').focus();
  });
  document.getElementById('aud-search-input').addEventListener('input', function () {
    audState.searchQuery = this.value.toLowerCase();
    audState.currentPage = 1;
    render();
  });

  // Filter toggle
  document.getElementById('aud-filter-btn').addEventListener('click', function () {
    var bar = document.getElementById('aud-filter-bar');
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
  });

  document.getElementById('aud-filter-clear').addEventListener('click', function () {
    audState.filterStatus = null;
    audState.currentPage = 1;
    render();
  });

  // Sidebar dropdown
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

// ── Load members from Supabase ──
async function loadMembers() {
  // Get user profiles
  var { data: profiles, error } = await sb
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('Failed to load members:', error);
    return;
  }

  // Get question counts per user
  var { data: questions } = await sb
    .from('questions')
    .select('user_id, created_at');

  var questionCounts = {};
  var lastActive = {};
  (questions || []).forEach(function (q) {
    questionCounts[q.user_id] = (questionCounts[q.user_id] || 0) + 1;
    if (!lastActive[q.user_id] || new Date(q.created_at) > new Date(lastActive[q.user_id])) {
      lastActive[q.user_id] = q.created_at;
    }
  });

  audState.members = (profiles || []).map(function (p) {
    var msgCount = questionCounts[p.user_id] || p.total_questions_asked || 0;
    var la = lastActive[p.user_id] || p.created_at;
    var daysSinceActive = Math.floor((Date.now() - new Date(la).getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: p.user_id,
      name: p.name || 'Anonymous',
      email: p.email || '',
      sport: p.sport || '',
      level: p.level || '',
      messages: msgCount,
      last_active: la,
      created_at: p.created_at,
      status: daysSinceActive <= 30 ? 'active' : 'inactive',
      tags: [p.sport, p.level].filter(Boolean)
    };
  });
}

// ── Render ──
function render() {
  renderStats();
  renderTable();
}

function renderStats() {
  var total = audState.members.length;
  var active = audState.members.filter(function (m) { return m.status === 'active'; }).length;
  document.getElementById('aud-stats').innerHTML =
    '<strong>' + total + '</strong> members · <strong>' + active + '</strong> active (last 30 days)';
}

function renderTable() {
  var members = getFilteredMembers();
  var totalPages = Math.max(1, Math.ceil(members.length / ITEMS_PER_PAGE));
  if (audState.currentPage > totalPages) audState.currentPage = totalPages;
  var start = (audState.currentPage - 1) * ITEMS_PER_PAGE;
  var pageMembers = members.slice(start, start + ITEMS_PER_PAGE);

  var html = '';

  // Header
  html += '<div class="aud-table-header">';
  html += '<span></span>';
  html += '<span>Name</span>';
  html += '<span style="text-align:center">Messages</span>';
  html += '<span>Tags</span>';
  html += '<span>Last Active</span>';
  html += '<span></span>';
  html += '</div>';

  if (pageMembers.length === 0) {
    html += '<div class="aud-empty">No members found</div>';
  }

  pageMembers.forEach(function (m) {
    var initials = getInitials(m.name);
    html += '<div class="aud-row" data-user-id="' + esc(m.id) + '">';

    // Avatar
    html += '<div class="aud-row-avatar">' + esc(initials) + '</div>';

    // Name + email
    html += '<div class="aud-row-name-cell"><div><div class="aud-row-name">' + esc(m.name) + '</div>';
    if (m.email) html += '<div class="aud-row-email">' + esc(m.email) + '</div>';
    html += '</div></div>';

    // Messages
    html += '<div class="aud-row-messages">' + m.messages + '</div>';

    // Tags
    html += '<div class="aud-row-tags">';
    m.tags.forEach(function (t) {
      html += '<span class="aud-tag">' + esc(t) + '</span>';
    });
    html += '</div>';

    // Last active
    html += '<div class="aud-row-date">' + formatDate(m.last_active) + '</div>';

    // Actions
    html += '<div class="aud-row-actions"><button class="aud-row-actions-btn" onclick="viewMember(\'' + m.id + '\')">···</button></div>';

    html += '</div>';
  });

  // Pagination
  if (totalPages > 1) {
    html += '<div class="pagination">';
    html += '<span class="pagination-info">Showing ' + (start + 1) + '–' + Math.min(start + ITEMS_PER_PAGE, members.length) + ' of ' + members.length + '</span>';
    html += '<div class="pagination-controls">';
    html += '<button class="pagination-btn" onclick="audGoToPage(' + (audState.currentPage - 1) + ')"' + (audState.currentPage <= 1 ? ' disabled' : '') + '>&lsaquo;</button>';

    var startPage = Math.max(1, audState.currentPage - 2);
    var endPage = Math.min(totalPages, startPage + 4);
    for (var p = startPage; p <= endPage; p++) {
      html += '<button class="pagination-btn' + (p === audState.currentPage ? ' active' : '') + '" onclick="audGoToPage(' + p + ')">' + p + '</button>';
    }

    html += '<button class="pagination-btn" onclick="audGoToPage(' + (audState.currentPage + 1) + ')"' + (audState.currentPage >= totalPages ? ' disabled' : '') + '>&rsaquo;</button>';
    html += '</div></div>';
  }

  document.getElementById('aud-content').innerHTML = html;

  // Row clicks → navigate to conversation
  document.querySelectorAll('.aud-row').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.closest('.aud-row-actions-btn')) return;
      window.location.href = '/ask-elijah/admin/conversations.html?user=' + row.dataset.userId;
    });
  });
}

function getFilteredMembers() {
  var arr = audState.members.slice();

  if (audState.filterStatus) {
    arr = arr.filter(function (m) { return m.status === audState.filterStatus; });
  }

  if (audState.searchQuery) {
    arr = arr.filter(function (m) {
      return m.name.toLowerCase().indexOf(audState.searchQuery) !== -1 ||
        (m.email || '').toLowerCase().indexOf(audState.searchQuery) !== -1;
    });
  }

  // Sort
  arr.sort(function (a, b) {
    var aVal = a[audState.sortField];
    var bVal = b[audState.sortField];
    if (typeof aVal === 'string') {
      return audState.sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return audState.sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return arr;
}

// ── Globals ──
window.audGoToPage = function (page) {
  audState.currentPage = page;
  renderTable();
};

window.audFilterStatus = function (val) {
  audState.filterStatus = audState.filterStatus === val ? null : val;
  audState.currentPage = 1;
  render();
};

window.viewMember = function (userId) {
  window.location.href = '/ask-elijah/admin/conversations.html?user=' + userId;
};

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

function formatDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var now = new Date();
  var diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return diffDays + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function adminLogout() {
  sb.auth.signOut().then(function () {
    window.location.href = '/ask-elijah/';
  });
}
