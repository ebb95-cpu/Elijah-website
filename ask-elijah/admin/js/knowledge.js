/* ============================================================
   Elijah Bryant — Knowledge Admin Dashboard
   Supabase-backed CRUD + UI logic
   ============================================================ */

// --- Supabase init (same pattern as main app) ---
var SUPABASE_URL = window.__ENV_SUPABASE_URL || 'https://eqhevpclmudbrmmltyyk.supabase.co';
var SUPABASE_ANON = window.__ENV_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// --- Admin gate ---
var ADMIN_EMAIL = 'ebb95@mac.com';

// --- State ---
var ITEMS_PER_PAGE = 25;

var state = {
  items: [],
  folders: [],
  viewMode: 'list',          // 'list' | 'grid'
  activeTab: 'content',      // 'content' | 'feeds' | 'insights'
  filterStatus: null,        // null = all, or 'completed','learning','attention','failed','deleting'
  filterType: null,           // null = all, or 'Q&A','Manual','YouTube','TikTok','File'
  searchQuery: '',
  totalWords: 0,
  editingItem: null,          // null = adding, object = editing
  selectedItem: null,         // item shown in detail panel
  currentPage: 1,            // pagination
};

// --- DOM refs ---
var $loading, $app, $wordCount, $contentArea, $searchBar, $searchInput;
var $modalOverlay, $modalTitle, $modalTypeTabs, $modalFields, $modalSaveBtn;
var $detailPanel, $detailBody, $detailRetry;

// --- Polling ---
var processingPollInterval = null;

// ============================================================
// Boot
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  $loading = document.getElementById('loading-screen');
  $app = document.getElementById('app-shell');

  checkAuth();
});

async function checkAuth() {
  try {
    var { data } = await sb.auth.getSession();
    var session = data && data.session;
    if (!session) return redirect();
    var email = session.user && session.user.email;
    if (email !== ADMIN_EMAIL) return redirect();
    boot();
  } catch (e) {
    console.error('Auth check failed', e);
    redirect();
  }
}

function redirect() {
  window.location.href = '/ask-elijah/';
}

async function boot() {
  $loading.classList.add('hidden');
  $app.style.display = 'flex';
  cacheDOM();
  bindEvents();
  await loadData();
  render();
}

function cacheDOM() {
  $wordCount = document.getElementById('word-count');
  $contentArea = document.getElementById('content-area');
  $searchBar = document.getElementById('search-bar');
  $searchInput = document.getElementById('search-input');
  $modalOverlay = document.getElementById('modal-overlay');
  $modalTitle = document.getElementById('modal-title');
  $modalTypeTabs = document.getElementById('modal-type-tabs');
  $modalFields = document.getElementById('modal-fields');
  $modalSaveBtn = document.getElementById('modal-save');
  $detailPanel = document.getElementById('detail-panel');
  $detailBody = document.getElementById('detail-body');
  $detailRetry = document.getElementById('detail-retry');
}

// ============================================================
// Data — pulls from admin-knowledge Netlify function
// ============================================================
var authToken = '';

async function getAuthToken() {
  if (authToken) return authToken;
  var { data } = await sb.auth.getSession();
  authToken = data && data.session ? data.session.access_token : '';
  return authToken;
}

async function adminAPI(action, body) {
  var token = await getAuthToken();
  var opts = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    }
  };
  if (body) {
    opts.method = 'POST';
    opts.body = JSON.stringify(body);
  }
  var res = await fetch('/.netlify/functions/admin-knowledge?action=' + action, opts);
  return res.json();
}

async function loadData() {
  try {
    var [listData, statsData] = await Promise.all([
      adminAPI('list'),
      adminAPI('stats')
    ]);

    // Merge ingestion_log entries and knowledge_items into unified list
    var items = [];

    // Ingestion log entries (YouTube, social, uploads processed via pipeline)
    (listData.ingestion_log || []).forEach(function (entry) {
      items.push({
        id: entry.id,
        title: entry.source_url || 'Unknown',
        type: mapSourceType(entry.source_type),
        content: null, // Content is in Pinecone, not stored here
        source_url: entry.source_url,
        status: entry.status === 'done' ? 'completed' : entry.status === 'failed' ? 'failed' : 'processing',
        word_count: 0,
        chunks_created: entry.chunks_created || 0,
        created_at: entry.created_at,
        updated_at: entry.created_at,
        source: 'ingestion_log'
      });
    });

    // Manual knowledge_items (Q&A, manual entries)
    (listData.knowledge_items || []).forEach(function (item) {
      items.push({
        id: item.id,
        title: item.title,
        type: item.type,
        content: item.content,
        source_url: item.source_url,
        status: item.status || 'completed',
        word_count: item.word_count || 0,
        chunks_created: 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
        source: 'knowledge_items'
      });
    });

    state.items = items;
    state.pineconeStats = statsData.pinecone || {};
    state.ingestionStats = statsData.ingestion || {};

    // Also still load folders from Supabase directly
    var foldersRes = await sb.from('knowledge_folders').select('*').order('created_at', { ascending: false });
    state.folders = (foldersRes.data || []);

    calcWords();

    // Fetch YouTube metadata in background, re-render when ready
    fetchYouTubeMeta(items).then(function () {
      render();
    });
  } catch (e) {
    console.error('Failed to load data:', e);
    // Fallback: try direct Supabase queries
    var [itemsRes, foldersRes] = await Promise.all([
      sb.from('knowledge_items').select('*').order('updated_at', { ascending: false }),
      sb.from('knowledge_folders').select('*').order('created_at', { ascending: false }),
    ]);
    state.items = (itemsRes.data || []).map(function (item) {
      item.source = 'knowledge_items';
      return item;
    });
    state.folders = (foldersRes.data || []);
    calcWords();
  }
}

function mapSourceType(sourceType) {
  var map = {
    'youtube': 'YouTube',
    'youtube-comments': 'YouTube',
    'instagram': 'Instagram',
    'twitter': 'Twitter',
    'newsletter': 'Newsletter',
    'upload': 'File',
    'manual': 'Manual'
  };
  return map[sourceType] || sourceType || 'Unknown';
}

// ── YouTube metadata cache (oEmbed) ──
var ytMetaCache = {};

function extractVideoId(url) {
  if (!url) return null;
  var m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchYouTubeMeta(items) {
  var ytItems = items.filter(function (i) {
    return i.type === 'YouTube' && extractVideoId(i.source_url) && !ytMetaCache[i.source_url];
  });
  if (ytItems.length === 0) return;

  // Fetch in parallel batches of 10
  for (var b = 0; b < ytItems.length; b += 10) {
    var batch = ytItems.slice(b, b + 10);
    await Promise.all(batch.map(function (item) {
      return fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(item.source_url) + '&format=json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data) {
            ytMetaCache[item.source_url] = {
              title: data.title || '',
              channel: data.author_name || '',
              thumbnail: 'https://img.youtube.com/vi/' + extractVideoId(item.source_url) + '/mqdefault.jpg'
            };
          }
        })
        .catch(function () {});
    }));
  }
}

function calcWords() {
  state.totalWords = state.items.reduce(function (sum, i) { return sum + (i.word_count || 0); }, 0);
  // Also show vector count if available
  if (state.pineconeStats && state.pineconeStats.totalVectors) {
    state.totalVectors = state.pineconeStats.totalVectors;
  }
}

function formatWordCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// ============================================================
// Render
// ============================================================
function render() {
  renderWordCount();
  renderContent();
  checkProcessingPoll();
}

function renderWordCount() {
  var parts = [];
  if (state.totalVectors) {
    parts.push('<strong>' + formatWordCount(state.totalVectors) + '</strong> vectors');
  }
  parts.push('<strong>' + formatWordCount(state.totalWords) + '</strong> words');
  $wordCount.innerHTML = parts.join(' · ');
}

function renderContent() {
  if (state.activeTab === 'insights') {
    renderInsights();
    return;
  }
  if (state.activeTab === 'feeds') {
    renderFeeds();
    return;
  }

  var allItems = getFilteredItems();
  var folders = state.folders;

  // Pagination
  var totalPages = Math.max(1, Math.ceil(allItems.length / ITEMS_PER_PAGE));
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  var start = (state.currentPage - 1) * ITEMS_PER_PAGE;
  var pageItems = allItems.slice(start, start + ITEMS_PER_PAGE);

  if (state.viewMode === 'grid') {
    renderGrid(folders, pageItems);
  } else {
    renderList(folders, pageItems);
  }

  // Render pagination controls if more than 1 page
  if (totalPages > 1) {
    renderPagination(allItems.length, totalPages);
  }
}

function renderPagination(totalItems, totalPages) {
  var html = '<div class="pagination">';
  html += '<span class="pagination-info">Showing ' + (((state.currentPage - 1) * ITEMS_PER_PAGE) + 1) + '–' + Math.min(state.currentPage * ITEMS_PER_PAGE, totalItems) + ' of ' + totalItems + '</span>';
  html += '<div class="pagination-controls">';

  // Previous
  html += '<button class="pagination-btn" onclick="goToPage(' + (state.currentPage - 1) + ')"' + (state.currentPage <= 1 ? ' disabled' : '') + '>&lsaquo;</button>';

  // Page numbers
  var startPage = Math.max(1, state.currentPage - 2);
  var endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  if (startPage > 1) {
    html += '<button class="pagination-btn" onclick="goToPage(1)">1</button>';
    if (startPage > 2) html += '<span class="pagination-ellipsis">…</span>';
  }

  for (var p = startPage; p <= endPage; p++) {
    html += '<button class="pagination-btn' + (p === state.currentPage ? ' active' : '') + '" onclick="goToPage(' + p + ')">' + p + '</button>';
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += '<span class="pagination-ellipsis">…</span>';
    html += '<button class="pagination-btn" onclick="goToPage(' + totalPages + ')">' + totalPages + '</button>';
  }

  // Next
  html += '<button class="pagination-btn" onclick="goToPage(' + (state.currentPage + 1) + ')"' + (state.currentPage >= totalPages ? ' disabled' : '') + '>&rsaquo;</button>';

  html += '</div></div>';
  $contentArea.innerHTML += html;
}

window.goToPage = function (page) {
  state.currentPage = page;
  renderContent();
  // Scroll content area to top
  $contentArea.scrollTop = 0;
};

function getFilteredItems() {
  var arr = state.items.slice();
  if (state.filterStatus) {
    arr = arr.filter(function (i) { return i.status === state.filterStatus; });
  }
  if (state.filterType) {
    arr = arr.filter(function (i) { return i.type === state.filterType; });
  }
  if (state.searchQuery) {
    var q = state.searchQuery.toLowerCase();
    arr = arr.filter(function (i) {
      return (i.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  return arr;
}

// ---- List view ----
function renderList(folders, items) {
  var html = '';

  // Header
  html += '<div class="list-header">';
  html += '<span></span>';
  html += '<span>Name</span>';
  html += '<span>Type</span>';
  html += '<span>Source</span>';
  html += '<span class="col-date">Updated</span>';
  html += '<span></span>';
  html += '</div>';

  // Folder inline prompt placeholder
  html += '<div id="folder-inline-slot"></div>';

  // Folders
  folders.forEach(function (f) {
    html += '<div class="list-row folder-row" data-folder-id="' + f.id + '">';
    html += '<div class="row-checkbox"></div>';
    html += '<div class="row-name"><span class="row-icon folder-icon">\uD83D\uDCC1</span><span class="row-name-text">' + esc(f.name) + '</span></div>';
    html += '<div></div>';
    html += '<div></div>';
    html += '<div class="row-date col-date"></div>';
    html += '<div class="row-actions"><button class="row-actions-btn" onclick="toggleRowDropdown(event, this)">···</button>';
    html += '<div class="row-dropdown">';
    html += '<button class="row-dropdown-item" onclick="editFolder(\'' + f.id + '\')">Settings</button>';
    html += '<button class="row-dropdown-item danger" onclick="deleteFolder(\'' + f.id + '\')">Delete</button>';
    html += '</div></div>';
    html += '</div>';
  });

  // Items
  if (items.length === 0 && folders.length === 0) {
    html += '<div class="empty-state">No knowledge items yet. Click + to add content.</div>';
  }

  items.forEach(function (item) {
    var ytMeta = ytMetaCache[item.source_url];
    var displayTitle = (ytMeta && ytMeta.title) ? ytMeta.title : item.title;
    var channelName = (ytMeta && ytMeta.channel) ? ytMeta.channel : '';
    var thumbUrl = (ytMeta && ytMeta.thumbnail) ? ytMeta.thumbnail : null;

    html += '<div class="list-row" data-item-id="' + item.id + '">';
    html += '<div class="row-checkbox"><input type="checkbox"></div>';
    html += '<div class="row-name">';
    if (thumbUrl) {
      html += '<img class="row-thumb" src="' + escAttr(thumbUrl) + '" alt="">';
    } else {
      html += '<span class="row-icon doc-icon">' + docIconSVG() + '</span>';
    }
    html += '<span class="row-status-dot ' + statusDotColor(item.status) + '"></span>';
    html += '<span class="row-name-text">' + esc(displayTitle) + '</span>';
    html += '</div>';
    html += '<div><span class="type-badge">' + esc(item.type) + '</span></div>';
    html += '<div class="row-source">' + esc(channelName) + '</div>';
    html += '<div class="row-date col-date">' + formatDate(item.updated_at) + '</div>';
    html += '<div class="row-actions"><button class="row-actions-btn" onclick="toggleRowDropdown(event, this)">···</button>';
    html += '<div class="row-dropdown">';
    html += '<button class="row-dropdown-item" onclick="editItem(\'' + item.id + '\')">Settings</button>';
    html += '<button class="row-dropdown-item danger" onclick="deleteItem(\'' + item.id + '\')">Delete</button>';
    html += '</div></div>';
    html += '</div>';
  });

  $contentArea.innerHTML = html;
}

// ---- Grid view ----
function renderGrid(folders, items) {
  var html = '<div class="content-grid">';

  folders.forEach(function (f) {
    html += '<div class="grid-card">';
    html += '<div class="grid-card-icon folder">\uD83D\uDCC1</div>';
    html += '<div class="grid-card-name">' + esc(f.name) + '</div>';
    html += '<div class="grid-card-type">Folder</div>';
    html += '</div>';
  });

  items.forEach(function (item) {
    html += '<div class="grid-card" data-item-id="' + item.id + '">';
    html += '<div class="grid-card-icon">' + docIconSVG(40) + '</div>';
    html += '<div class="grid-card-name">' + esc(item.title) + '</div>';
    html += '<div class="grid-card-type">' + esc(item.type) + '</div>';
    html += '</div>';
  });

  if (items.length === 0 && folders.length === 0) {
    html += '<div class="empty-state" style="grid-column:1/-1">No knowledge items yet.</div>';
  }

  html += '</div>';
  $contentArea.innerHTML = html;
}

// ---- Insights view ----
// ---- Feeds view ----
function renderFeeds() {
  // Filter for feed-type items (auto-syncing accounts)
  var feedTypes = ['YouTube Channel', 'Newsletter', 'Twitter', 'Instagram', 'TikTok', 'Podcast Series'];
  var feeds = state.items.filter(function (i) {
    return feedTypes.indexOf(i.type) !== -1;
  });

  var html = '<div class="feeds-list">';

  // Header
  html += '<div class="feeds-header">';
  html += '<span></span>';
  html += '<span>Name</span>';
  html += '<span>Last Synced</span>';
  html += '<span></span>';
  html += '</div>';

  if (feeds.length === 0) {
    html += '<div class="empty-state">No feeds connected. Click + to add an auto-syncing account.</div>';
  }

  var typeIcons = {
    'YouTube Channel': '<svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    'Newsletter': '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    'Twitter': '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>',
    'Instagram': '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/></svg>',
    'TikTok': '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>',
    'Podcast Series': '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>'
  };

  feeds.forEach(function (feed) {
    var icon = typeIcons[feed.type] || '';
    var statusClass = feed.status === 'completed' ? 'green' : feed.status === 'processing' ? 'blue' : 'red';

    html += '<div class="feeds-row">';
    html += '<div class="feeds-icon">' + icon + '</div>';
    html += '<div class="feeds-name">';
    html += '<span class="row-status-dot ' + statusClass + '"></span>';
    html += '<span>' + esc(feed.title) + '</span>';
    html += '</div>';
    html += '<div class="feeds-synced">' + formatDate(feed.updated_at) + '</div>';
    html += '<div class="row-actions"><button class="row-actions-btn" onclick="toggleRowDropdown(event, this)">···</button>';
    html += '<div class="row-dropdown">';
    html += '<button class="row-dropdown-item" onclick="editItem(\'' + feed.id + '\')">Settings</button>';
    html += '<button class="row-dropdown-item danger" onclick="deleteItem(\'' + feed.id + '\')">Delete</button>';
    html += '</div></div>';
    html += '</div>';
  });

  html += '</div>';
  $contentArea.innerHTML = html;
}

var insightsData = null;
var insightsDays = 30;

async function loadInsights(days) {
  insightsDays = days || insightsDays;
  try {
    insightsData = await adminAPI('insights', { days: insightsDays });
  } catch (e) {
    console.error('Failed to load insights:', e);
  }
}

function renderInsights() {
  if (!insightsData) {
    $contentArea.innerHTML = '<div class="insights-panel"><div class="insight-loading"><div class="spinner"></div>Loading insights...</div></div>';
    loadInsights(insightsDays).then(function () { renderInsights(); });
    return;
  }

  var d = insightsData;
  var html = '<div class="insights-panel">';

  // ═══ 0. GREETING + ONBOARDING CHECKLIST ═══
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  html += '<div class="insight-greeting">';
  html += '<div class="insight-greeting-text">' + greeting + ', Elijah!</div>';
  html += '<button class="insight-share-btn" onclick="navigator.clipboard.writeText(window.location.origin + \'/ask-elijah/profile.html\');this.textContent=\'Copied!\';setTimeout(function(){document.querySelector(\'.insight-share-btn\').textContent=\'Share\'},2000)">Share</button>';
  html += '</div>';

  // Checklist
  var checkItems = [
    { label: 'Add your first Q&A', done: d.ingestionByType && (d.ingestionByType.qa > 0 || d.ingestionByType['q&a'] > 0) },
    { label: 'Connect a YouTube channel', done: d.ingestionByType && d.ingestionByType.youtube > 0 },
    { label: 'Add a newsletter source', done: d.ingestionByType && d.ingestionByType.newsletter > 0 },
    { label: 'Upload a document', done: d.ingestionByType && d.ingestionByType.upload > 0 },
    { label: 'Get your first conversation', done: d.conversations && d.conversations.current > 0 }
  ];
  var doneCount = checkItems.filter(function (c) { return c.done; }).length;

  if (doneCount < checkItems.length) {
    html += '<div class="insight-checklist">';
    html += '<div class="insight-checklist-header">Complete your profile <span class="insight-checklist-count">' + doneCount + ' of ' + checkItems.length + '</span></div>';
    checkItems.forEach(function (ci) {
      html += '<div class="insight-check-item' + (ci.done ? ' done' : '') + '">';
      html += '<span class="insight-check-icon">' + (ci.done ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#22c55e" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#444" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>') + '</span>';
      html += '<span>' + ci.label + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ═══ 1. CONVERSATIONS CHART ═══
  html += '<div class="insight-section">';
  html += '<div class="insight-section-header">';
  html += '<div>';
  html += '<div class="insight-section-title">Conversations</div>';
  html += '<div class="insight-big-num">' + (d.conversations.current || 0).toLocaleString() + '</div>';
  html += renderChange(d.conversations.change);
  html += '</div>';
  html += '<div class="insight-filters">';
  html += '<select class="insight-select" id="insight-range" onchange="changeInsightRange(this.value)">';
  html += '<option value="7"' + (insightsDays === 7 ? ' selected' : '') + '>Last 7 days</option>';
  html += '<option value="30"' + (insightsDays === 30 ? ' selected' : '') + '>Last 30 days</option>';
  html += '<option value="90"' + (insightsDays === 90 ? ' selected' : '') + '>Last 90 days</option>';
  html += '</select>';
  html += '</div>';
  html += '</div>';

  // Chart
  html += renderChart(d.chart || []);
  html += '</div>';

  // ═══ 2. MIND SCORE WIDGET ═══
  var score = d.mindScore || 0;
  var tier = getMindTier(score);

  html += '<div class="insight-section insight-mind">';
  html += '<div class="insight-section-title">Mind Score</div>';
  html += '<div class="insight-mind-row">';
  html += '<div class="insight-mind-score">' + score.toLocaleString() + '</div>';
  html += '<div class="insight-mind-tier" style="color:' + tier.color + '">' + tier.name + '</div>';
  html += '</div>';
  html += '<div class="insight-mind-progress">';
  html += '<div class="insight-progress-bar"><div class="insight-progress-fill" style="width:' + tier.progress + '%;background:' + tier.color + '"></div></div>';
  html += '<div class="insight-mind-next">' + tier.name + ' → ' + tier.next + ' (' + score.toLocaleString() + ' / ' + tier.nextThreshold.toLocaleString() + ')</div>';
  html += '</div>';

  // Tier legend
  html += '<div class="insight-tier-legend">';
  var allTiers = [
    { name: 'Novice', min: 0, color: '#666' },
    { name: 'Apprentice', min: 1000, color: '#f59e0b' },
    { name: 'Scholar', min: 5000, color: '#3b82f6' },
    { name: 'Sage', min: 25000, color: '#a855f7' },
    { name: 'Legendary', min: 100000, color: '#22c55e' }
  ];
  allTiers.forEach(function (t) {
    var active = score >= t.min;
    html += '<span class="insight-tier-item' + (active ? ' active' : '') + '" style="' + (active ? 'color:' + t.color : '') + '">' + t.name + '</span>';
  });
  html += '</div>';

  // Breakdown
  html += '<div class="insight-mind-breakdown">';
  html += '<div class="insight-mind-stat">' + (d.totalVectors || 0).toLocaleString() + ' <span>vectors</span></div>';
  html += '<div class="insight-mind-stat">' + (d.totalChunks || 0).toLocaleString() + ' <span>chunks</span></div>';
  html += '<div class="insight-mind-stat">' + (d.totalSources || 0).toLocaleString() + ' <span>sources</span></div>';
  html += '</div>';
  html += '</div>';

  // ═══ 3. ANALYTICS PANEL ═══
  html += '<div class="insight-analytics-row">';

  // Active Visitors
  html += '<div class="insight-analytics-card">';
  html += '<div class="insight-analytics-label">Active Visitors</div>';
  html += '<div class="insight-analytics-num">' + (d.activeVisitors.current || 0).toLocaleString() + '</div>';
  html += renderChange(d.activeVisitors.change);
  html += '</div>';

  // Total Messages
  html += '<div class="insight-analytics-card">';
  html += '<div class="insight-analytics-label">Total Messages</div>';
  html += '<div class="insight-analytics-num">' + (d.totalMessages.current || 0).toLocaleString() + '</div>';
  html += renderChange(d.totalMessages.change);
  html += '</div>';

  // Avg Session Duration
  var mins = Math.floor((d.avgDuration.seconds || 0) / 60);
  var secs = (d.avgDuration.seconds || 0) % 60;
  var durationStr = mins + 'm ' + secs + 's';

  html += '<div class="insight-analytics-card">';
  html += '<div class="insight-analytics-label">Avg Session Duration</div>';
  html += '<div class="insight-analytics-num">' + durationStr + '</div>';
  html += renderChange(d.avgDuration.change);
  html += '</div>';

  html += '</div>';

  // ═══ Knowledge by Source ═══
  var ingestionByType = d.ingestionByType || {};
  var typeKeys = Object.keys(ingestionByType).sort(function (a, b) { return ingestionByType[b] - ingestionByType[a]; });

  if (typeKeys.length > 0) {
    html += '<div class="insight-section">';
    html += '<div class="insight-section-title">Knowledge by Source</div>';
    html += '<div class="insight-bars">';

    var typeColors = {
      'youtube': '#ef4444', 'youtube-comments': '#ef4444',
      'newsletter': '#f59e0b', 'q&a': '#22c55e', 'qa': '#22c55e',
      'manual': '#3b82f6', 'upload': '#a855f7', 'file': '#a855f7',
      'twitter': '#38bdf8', 'instagram': '#e879f9',
      'linkedin': '#60a5fa', 'tiktok': '#f472b6'
    };
    var typeLabels = {
      'youtube': 'YouTube', 'youtube-comments': 'YouTube Comments',
      'newsletter': 'Newsletter', 'q&a': 'Q&A', 'qa': 'Q&A',
      'manual': 'Manual', 'upload': 'File Upload', 'file': 'File Upload',
      'twitter': 'Twitter', 'instagram': 'Instagram',
      'linkedin': 'LinkedIn', 'tiktok': 'TikTok'
    };

    var maxCount = Math.max.apply(null, typeKeys.map(function (k) { return ingestionByType[k]; }).concat([1]));

    typeKeys.forEach(function (t) {
      var count = ingestionByType[t];
      var pct = Math.max(5, (count / maxCount) * 100);
      var color = typeColors[t] || '#666';
      var label = typeLabels[t] || t;
      html += '<div class="insight-bar-row">';
      html += '<div class="insight-bar-label">' + esc(label) + '</div>';
      html += '<div class="insight-bar-track"><div class="insight-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
      html += '<div class="insight-bar-count">' + count + '</div>';
      html += '</div>';
    });

    html += '</div></div>';
  }

  html += '</div>';
  $contentArea.innerHTML = html;
}

function renderChange(pct) {
  if (pct === 0) return '<div class="insight-change neutral">0% vs prior period</div>';
  var cls = pct > 0 ? 'positive' : 'negative';
  var arrow = pct > 0 ? '&#9650;' : '&#9660;';
  return '<div class="insight-change ' + cls + '">' + arrow + ' ' + Math.abs(pct) + '% vs prior period</div>';
}

function renderChart(data) {
  if (!data || data.length === 0) return '<div style="color:#555;padding:20px;text-align:center">No conversation data yet</div>';

  var maxVal = Math.max.apply(null, data.map(function (d) { return d.count; }).concat([1]));
  var chartH = 140;
  var html = '<div class="insight-chart">';
  html += '<svg class="insight-chart-svg" viewBox="0 0 ' + (data.length * 20) + ' ' + (chartH + 30) + '" preserveAspectRatio="none">';

  // Grid lines
  for (var g = 0; g <= 4; g++) {
    var gy = chartH - (g / 4) * chartH;
    html += '<line x1="0" y1="' + gy + '" x2="' + (data.length * 20) + '" y2="' + gy + '" stroke="#1a1a1a" stroke-width="1"/>';
  }

  // Line path
  var points = data.map(function (d, i) {
    var x = i * 20 + 10;
    var y = chartH - (d.count / maxVal) * (chartH - 10);
    return x + ',' + y;
  });
  html += '<polyline points="' + points.join(' ') + '" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

  // Area fill
  var areaPoints = '10,' + chartH + ' ' + points.join(' ') + ' ' + ((data.length - 1) * 20 + 10) + ',' + chartH;
  html += '<polygon points="' + areaPoints + '" fill="url(#chartGrad)" opacity="0.3"/>';
  html += '<defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>';

  // Dots
  data.forEach(function (d, i) {
    var x = i * 20 + 10;
    var y = chartH - (d.count / maxVal) * (chartH - 10);
    if (d.count > 0) {
      html += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="#3b82f6" stroke="#0a0a0a" stroke-width="1.5"/>';
    }
  });

  html += '</svg>';

  // X-axis labels (show ~6 evenly spaced)
  html += '<div class="insight-chart-labels">';
  var step = Math.max(1, Math.floor(data.length / 6));
  data.forEach(function (d, i) {
    if (i % step === 0 || i === data.length - 1) {
      var parts = d.date.split('-');
      html += '<span>' + parts[1] + '/' + parts[2] + '</span>';
    }
  });
  html += '</div>';

  html += '</div>';
  return html;
}

function getMindTier(score) {
  var tiers = [
    { name: 'Novice', min: 0, next: 'Apprentice', nextThreshold: 1000, color: '#666' },
    { name: 'Apprentice', min: 1000, next: 'Scholar', nextThreshold: 5000, color: '#f59e0b' },
    { name: 'Scholar', min: 5000, next: 'Sage', nextThreshold: 25000, color: '#3b82f6' },
    { name: 'Sage', min: 25000, next: 'Legendary', nextThreshold: 100000, color: '#a855f7' },
    { name: 'Legendary', min: 100000, next: 'Legendary', nextThreshold: 100000, color: '#22c55e' }
  ];

  var current = tiers[0];
  for (var i = tiers.length - 1; i >= 0; i--) {
    if (score >= tiers[i].min) { current = tiers[i]; break; }
  }

  var progress = current.nextThreshold > current.min
    ? Math.min(100, ((score - current.min) / (current.nextThreshold - current.min)) * 100)
    : 100;

  return {
    name: current.name,
    next: current.next,
    nextThreshold: current.nextThreshold,
    color: current.color,
    progress: progress
  };
}

window.changeInsightRange = function (days) {
  insightsData = null;
  insightsDays = parseInt(days, 10);
  renderInsights();
};

// ============================================================
// Events
// ============================================================
function bindEvents() {
  // Tabs
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.activeTab = btn.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === state.activeTab); });
      renderContent();
    });
  });

  // View toggle
  document.getElementById('btn-list').addEventListener('click', function () {
    state.viewMode = 'list';
    updateViewBtns();
    renderContent();
  });
  document.getElementById('btn-grid').addEventListener('click', function () {
    state.viewMode = 'grid';
    updateViewBtns();
    renderContent();
  });

  // Search
  document.getElementById('btn-search').addEventListener('click', function () {
    $searchBar.classList.toggle('open');
    if ($searchBar.classList.contains('open')) $searchInput.focus();
  });
  $searchInput.addEventListener('input', function () {
    state.searchQuery = $searchInput.value;
    state.currentPage = 1;
    renderContent();
  });

  // + button
  document.getElementById('btn-add').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('add-dropdown').classList.toggle('open');
  });

  document.getElementById('add-item').addEventListener('click', function () {
    closeAllDropdowns();
    openModal(null);
  });

  document.getElementById('add-folder').addEventListener('click', function () {
    closeAllDropdowns();
    showFolderInline();
  });

  // Sidebar more
  document.getElementById('btn-more').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('sidebar-dropdown').classList.toggle('open');
  });

  // Sidebar create button
  var sidebarCreate = document.getElementById('sidebar-create-btn');
  if (sidebarCreate) {
    sidebarCreate.addEventListener('click', function () {
      openModal(null);
    });
  }

  // Status filter chip
  document.getElementById('filter-status').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('status-dropdown').classList.toggle('open');
  });

  // Type filter chip
  document.getElementById('filter-type').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('type-dropdown').classList.toggle('open');
  });

  // Clear filters
  document.getElementById('filter-clear').addEventListener('click', function () {
    state.filterStatus = null;
    state.filterType = null;
    state.currentPage = 1;
    updateFilterChips();
    renderContent();
  });

  // Modal cancel
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  $modalOverlay.addEventListener('click', function (e) {
    if (e.target === $modalOverlay) closeModal();
  });

  // Modal save
  $modalSaveBtn.addEventListener('click', saveModal);

  // Modal type tabs
  $modalTypeTabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.modal-type-tab');
    if (!btn) return;
    $modalTypeTabs.querySelectorAll('.modal-type-tab').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderModalFields(btn.dataset.type);
  });

  // Close dropdowns on outside click
  document.addEventListener('click', function () {
    closeAllDropdowns();
  });

  // Row click → open detail panel (delegated)
  $contentArea.addEventListener('click', function (e) {
    if (e.target.closest('.row-actions') || e.target.closest('.row-checkbox')) return;
    var row = e.target.closest('[data-item-id]');
    if (!row) return;
    var id = row.dataset.itemId;
    var item = state.items.find(function (i) { return i.id === id; });
    if (item) openDetailPanel(item);
  });

  // Detail panel close
  document.getElementById('detail-close').addEventListener('click', closeDetailPanel);

  // Detail panel edit
  document.getElementById('detail-edit').addEventListener('click', function () {
    if (state.selectedItem) openModal(state.selectedItem);
  });

  // Detail panel retry extraction
  $detailRetry.addEventListener('click', function () {
    if (state.selectedItem) retryExtraction(state.selectedItem);
  });
}

function updateViewBtns() {
  document.getElementById('btn-list').classList.toggle('active', state.viewMode === 'list');
  document.getElementById('btn-grid').classList.toggle('active', state.viewMode === 'grid');
}

// ============================================================
// Filter chips
// ============================================================
var STATUS_OPTIONS = [
  { value: 'completed', label: 'Completed', dot: 'green', icon: '\u2713' },
  { value: 'learning', label: 'Learning', dot: 'blue', icon: '' },
  { value: 'attention', label: 'Attention', dot: 'orange', icon: '' },
  { value: 'failed', label: 'Failed', dot: 'red', icon: '\u2717' },
  { value: 'deleting', label: 'Deleting', dot: 'red', icon: '\uD83D\uDDD1' },
];

var TYPE_OPTIONS = ['Q&A', 'Manual', 'YouTube', 'Newsletter', 'Twitter', 'File'];

function updateFilterChips() {
  var $status = document.getElementById('filter-status');
  var $type = document.getElementById('filter-type');
  if (state.filterStatus) {
    var opt = STATUS_OPTIONS.find(function (o) { return o.value === state.filterStatus; });
    $status.innerHTML = '<span class="filter-dot ' + opt.dot + '"></span>Status \u00B7 ' + opt.label;
  } else {
    $status.innerHTML = '<span class="filter-dot green"></span>Status \u00B7 Completed';
  }
  $type.textContent = state.filterType ? 'Content Type \u00B7 ' + state.filterType : 'Content Type';
}

// Status dropdown items
window.selectStatus = function (val) {
  state.filterStatus = state.filterStatus === val ? null : val;
  state.currentPage = 1;
  updateFilterChips();
  closeAllDropdowns();
  renderContent();
};

// Type dropdown items
window.selectType = function (val) {
  state.filterType = state.filterType === val ? null : val;
  state.currentPage = 1;
  updateFilterChips();
  closeAllDropdowns();
  renderContent();
};

// Populate dropdowns once
document.addEventListener('DOMContentLoaded', function () {
  var $sd = document.getElementById('status-dropdown');
  STATUS_OPTIONS.forEach(function (o) {
    var btn = document.createElement('button');
    btn.className = 'filter-dropdown-item';
    btn.innerHTML = '<span class="filter-dot ' + o.dot + '"></span>' + o.label + '<span class="check"></span>';
    btn.onclick = function (e) { e.stopPropagation(); selectStatus(o.value); };
    $sd.appendChild(btn);
  });

  var $td = document.getElementById('type-dropdown');
  TYPE_OPTIONS.forEach(function (t) {
    var btn = document.createElement('button');
    btn.className = 'filter-dropdown-item';
    btn.textContent = t;
    btn.onclick = function (e) { e.stopPropagation(); selectType(t); };
    $td.appendChild(btn);
  });
});

// ============================================================
// Dropdowns
// ============================================================
function closeAllDropdowns() {
  document.querySelectorAll('.open').forEach(function (el) {
    if (el.id !== 'modal-overlay' && el.id !== 'search-bar') {
      el.classList.remove('open');
    }
  });
}

function toggleRowDropdown(e, btn) {
  e.stopPropagation();
  var dd = btn.nextElementSibling;
  var wasOpen = dd.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) dd.classList.add('open');
}

// ============================================================
// Modal — Add / Edit
// ============================================================
var MODAL_TYPES = ['YouTube Channel', 'YouTube Video', 'Newsletter', 'Twitter', 'File', 'Q&A', 'Manual'];

// 3-tab modal structure
var MODAL_TABS = {
  suggested: {
    label: 'Suggested',
    types: [
      { type: 'Q&A', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', desc: 'Question & answer pair' },
      { type: 'Manual', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', desc: 'Free-form text' },
      { type: 'Quick Note', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>', desc: 'Short typed note' },
      { type: 'URL', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>', desc: 'Linked web page' },
      { type: 'File', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', desc: 'Upload document' },
      { type: 'YouTube Video', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>', desc: 'Transcribed video' },
      { type: 'Podcast Episode', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>', desc: 'Transcribed audio' }
    ]
  },
  accounts: {
    label: 'Accounts',
    types: [
      { type: 'Website', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>', desc: 'Scrape a website URL' },
      { type: 'Twitter', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>', desc: 'Auto-sync tweets' },
      { type: 'Instagram', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>', desc: 'Auto-sync posts' },
      { type: 'TikTok', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>', desc: 'Auto-sync videos' },
      { type: 'YouTube Channel', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>', desc: 'Auto-sync channel videos' },
      { type: 'Newsletter', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>', desc: 'Substack / Beehiiv RSS' },
      { type: 'Podcast Series', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>', desc: 'Auto-sync podcast episodes' }
    ]
  },
  files: {
    label: 'Files & Notes',
    types: [
      { type: 'File', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', desc: 'Upload a document' },
      { type: 'Google Drive', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2L2 19.5h20L12 2z"/></svg>', desc: 'Connect & import' },
      { type: 'Notion', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>', desc: 'Connect workspace' }
    ]
  }
};

var activeModalTab = 'suggested';

function openModal(item) {
  state.editingItem = item || null;
  $modalTitle.textContent = item ? 'Edit Content' : 'Add Content';

  if (item) {
    // Editing: show flat type tabs
    var activeType = item.type;
    $modalTypeTabs.innerHTML = '';
    MODAL_TYPES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'modal-type-tab' + (t === activeType ? ' active' : '');
      btn.textContent = t;
      btn.dataset.type = t;
      $modalTypeTabs.appendChild(btn);
    });
    renderModalFields(activeType);
  } else {
    // Adding: show 3-tab structure
    activeModalTab = 'suggested';
    renderModalTabs();
    renderModalTabContent();
  }

  $modalOverlay.classList.add('open');
}

function renderModalTabs() {
  var html = '';
  Object.keys(MODAL_TABS).forEach(function (key) {
    html += '<button class="modal-meta-tab' + (key === activeModalTab ? ' active' : '') + '" data-meta-tab="' + key + '">' + MODAL_TABS[key].label + '</button>';
  });
  $modalTypeTabs.innerHTML = html;

  // Bind tab clicks
  $modalTypeTabs.querySelectorAll('.modal-meta-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeModalTab = btn.dataset.metaTab;
      renderModalTabs();
      renderModalTabContent();
    });
  });
}

function renderModalTabContent() {
  var tab = MODAL_TABS[activeModalTab];
  var html = '<div class="modal-type-grid">';
  tab.types.forEach(function (t) {
    html += '<button class="modal-type-card" data-type="' + t.type + '">';
    html += '<div class="modal-type-card-icon">' + t.icon + '</div>';
    html += '<div class="modal-type-card-info">';
    html += '<div class="modal-type-card-name">' + t.type + '</div>';
    html += '<div class="modal-type-card-desc">' + t.desc + '</div>';
    html += '</div>';
    html += '</button>';
  });
  html += '</div>';

  if (activeModalTab === 'files') {
    html += '<div class="modal-dropzone" id="modal-dropzone">Drag and drop anything</div>';
  }

  $modalFields.innerHTML = html;

  // Bind card clicks → switch to that type's fields
  $modalFields.querySelectorAll('.modal-type-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var type = card.dataset.type;
      // Switch to flat type view
      $modalTypeTabs.innerHTML = '';
      var backBtn = document.createElement('button');
      backBtn.className = 'modal-back-btn';
      backBtn.textContent = '\u2190 Back';
      backBtn.addEventListener('click', function () {
        renderModalTabs();
        renderModalTabContent();
      });
      $modalTypeTabs.appendChild(backBtn);

      var typeLabel = document.createElement('span');
      typeLabel.className = 'modal-type-label';
      typeLabel.textContent = type;
      $modalTypeTabs.appendChild(typeLabel);

      renderModalFields(type);
    });
  });

  // Dropzone handler
  var dropzone = document.getElementById('modal-dropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        pendingFile = e.dataTransfer.files[0];
        // Switch to file fields
        $modalTypeTabs.innerHTML = '<span class="modal-type-label">File: ' + esc(pendingFile.name) + '</span>';
        renderModalFields('File');
        var titleInput = document.getElementById('modal-title-input');
        if (titleInput && !titleInput.value) titleInput.value = pendingFile.name;
      }
    });
  }
}

function renderModalFields(type) {
  var item = state.editingItem;
  var html = '';

  if (type === 'YouTube Channel') {
    html += '<div class="modal-hint">Add a YouTube channel — all existing videos will be ingested immediately, and new uploads will be auto-detected daily.</div>';
    html += field('Channel URL or ID', 'input', 'modal-url', item ? item.source_url : '', '', 'text');
    html += '<div class="modal-hint" style="margin-top:8px;color:#555">e.g. https://youtube.com/@elijahbryant or UCxxxxxx channel ID</div>';
  } else if (type === 'YouTube Video') {
    html += '<div class="modal-hint">Add a single YouTube video. Transcript will be extracted and stored in Pinecone.</div>';
    html += field('YouTube Video URL', 'input', 'modal-url', item ? item.source_url : '', '', 'url');
  } else if (type === 'Newsletter') {
    html += '<div class="modal-hint">Add your Beehiiv, Substack, or any newsletter with an RSS feed. All posts will be ingested immediately, and new posts auto-detected daily.</div>';
    html += field('Newsletter URL', 'input', 'modal-url', item ? item.source_url : '', '', 'url');
    html += '<div class="modal-hint" style="margin-top:8px;color:#555">e.g. https://yourname.beehiiv.com or https://yourname.substack.com</div>';
  } else if (type === 'Twitter') {
    html += '<div class="modal-hint">Add a Twitter/X account to ingest tweets. Requires TWITTER_BEARER_TOKEN and TWITTER_USER_ID in Netlify env vars.</div>';
    html += field('Twitter Username', 'input', 'modal-url', item ? item.source_url : '', '', 'text');
    html += '<div class="modal-hint" style="margin-top:8px;color:#555">e.g. @elijahbryant</div>';
  } else if (type === 'File') {
    html += '<div class="modal-hint">Upload a PDF, audio, or text file. It will be processed (Whisper for audio, pdf-parse for PDFs) and stored in Pinecone.</div>';
    html += '<div class="modal-field"><label>Upload File</label><input type="file" id="modal-file" accept=".pdf,.txt,.docx,.mp3,.mp4,.m4a,.wav,.webm"></div>';
    html += field('Title', 'input', 'modal-title-input', item ? item.title : '');
  } else if (type === 'Q&A') {
    html += '<div class="modal-hint">Add a question and answer pair to the knowledge base.</div>';
    html += field('Question', 'input', 'modal-question', item ? item.title : '');
    html += field('Answer', 'textarea', 'modal-content', item ? item.content : '', 'tall');
  } else if (type === 'Manual') {
    html += '<div class="modal-hint">Add any text content — blog posts, notes, transcripts, etc.</div>';
    html += field('Title', 'input', 'modal-title-input', item ? item.title : '');
    html += field('Content', 'textarea', 'modal-content', item ? item.content : '', 'tall');
  } else if (type === 'Quick Note') {
    html += '<div class="modal-hint">Jot down a quick note or thought.</div>';
    html += field('Note', 'textarea', 'modal-content', item ? item.content : '');
  } else if (type === 'URL' || type === 'Website') {
    html += '<div class="modal-hint">Add a web page URL to scrape and ingest its content.</div>';
    html += field('URL', 'input', 'modal-url', item ? item.source_url : '', '', 'url');
    html += field('Title (optional)', 'input', 'modal-title-input', item ? item.title : '');
  } else if (type === 'Podcast Episode' || type === 'Podcast Series') {
    html += '<div class="modal-hint">Add a podcast episode or RSS feed. Audio will be transcribed via Whisper.</div>';
    html += field('Podcast URL or RSS', 'input', 'modal-url', item ? item.source_url : '', '', 'url');
    html += field('Title (optional)', 'input', 'modal-title-input', item ? item.title : '');
  } else if (type === 'Instagram') {
    html += '<div class="modal-hint">Connect your Instagram account. Requires INSTAGRAM_ACCESS_TOKEN in Netlify env vars.</div>';
    html += field('Instagram Username', 'input', 'modal-url', item ? item.source_url : '', '', 'text');
  } else if (type === 'TikTok') {
    html += '<div class="modal-hint">Connect your TikTok account. Requires TIKTOK_ACCESS_TOKEN in Netlify env vars.</div>';
    html += field('TikTok Username', 'input', 'modal-url', item ? item.source_url : '', '', 'text');
  } else if (type === 'Google Drive' || type === 'Notion') {
    html += '<div class="modal-hint">' + type + ' integration coming soon. For now, download files and upload them directly.</div>';
  }

  $modalFields.innerHTML = html;

  // File handler
  var fileInput = document.getElementById('modal-file');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }
}

function field(label, tag, id, value, cls, type) {
  value = value || '';
  cls = cls || '';
  type = type || 'text';
  var inner;
  if (tag === 'textarea') {
    inner = '<textarea id="' + id + '" class="' + cls + '">' + esc(value) + '</textarea>';
  } else {
    inner = '<input type="' + type + '" id="' + id + '" value="' + escAttr(value) + '">';
  }
  return '<div class="modal-field"><label>' + label + '</label>' + inner + '</div>';
}

// Store pending file for upload
var pendingFile = null;

function handleFileUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  pendingFile = file;
  var titleInput = document.getElementById('modal-title-input');
  if (titleInput && !titleInput.value) titleInput.value = file.name;

  // Also show text preview for text files
  if (file.name.match(/\.(txt|md|csv)$/i)) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var contentArea = document.getElementById('modal-content');
      if (contentArea) contentArea.value = ev.target.result;
    };
    reader.readAsText(file);
  }
}

function closeModal() {
  $modalOverlay.classList.remove('open');
  state.editingItem = null;
}

async function saveModal() {
  var activeTypeBtn = $modalTypeTabs.querySelector('.modal-type-tab.active');
  var type = activeTypeBtn ? activeTypeBtn.dataset.type : 'Manual';

  var title = '', content = '', source_url = '';

  if (type === 'Q&A') {
    title = val('modal-question');
    content = val('modal-content');
  } else if (type === 'Manual') {
    title = val('modal-title-input');
    content = val('modal-content');
  } else if (type === 'YouTube Channel' || type === 'YouTube Video' || type === 'Newsletter' || type === 'Twitter') {
    source_url = val('modal-url');
    title = source_url;
  } else if (type === 'File') {
    title = val('modal-title-input') || (pendingFile ? pendingFile.name : 'Upload');
  }

  if (!title && !source_url && !pendingFile) return alert('Please fill in the required fields.');

  // Check for duplicates before submitting
  if (source_url && !state.editingItem) {
    var normalizedUrl = source_url.trim().toLowerCase();
    var isDupe = state.items.some(function (item) {
      return (item.source_url || '').toLowerCase() === normalizedUrl;
    });
    if (isDupe) {
      alert('This source has already been added. Duplicate content is not allowed.');
      return;
    }
  }

  // Route to appropriate backend based on type
  try {
    if (type === 'YouTube Channel') {
      $modalSaveBtn.textContent = 'Ingesting...';
      $modalSaveBtn.disabled = true;
      var result = await adminAPI('add-source', { source_type: 'youtube-channel', url: source_url });
      $modalSaveBtn.textContent = 'Save';
      $modalSaveBtn.disabled = false;
      if (result.error) {
        alert('Error: ' + result.error + '\n\nTip: Try pasting the channel ID directly (starts with UC...). You can find it in your YouTube channel URL.');
        return;
      }
      alert('YouTube channel added! ' + (result.processed || 0) + ' videos ingested, ' + (result.skipped || 0) + ' already existed. New uploads will be auto-detected daily.');
    } else if (type === 'YouTube Video') {
      $modalSaveBtn.textContent = 'Ingesting...';
      $modalSaveBtn.disabled = true;
      var result = await adminAPI('ingest-video', { url: source_url });
      $modalSaveBtn.textContent = 'Save';
      $modalSaveBtn.disabled = false;
      if (result.alreadyExists) {
        alert('This video has already been ingested.');
        return;
      }
    } else if (type === 'Newsletter') {
      $modalSaveBtn.textContent = 'Ingesting...';
      $modalSaveBtn.disabled = true;
      var result = await adminAPI('add-source', { source_type: 'newsletter', url: source_url });
      $modalSaveBtn.textContent = 'Save';
      $modalSaveBtn.disabled = false;
      alert('Newsletter added! ' + (result.processed || 0) + ' posts ingested, ' + (result.skipped || 0) + ' already existed. New posts will be auto-detected daily.');
    } else if (type === 'Twitter') {
      await adminAPI('add-source', { source_type: 'twitter', url: source_url });
      alert('Twitter account added! The daily ingestion cron will pull tweets.');
    } else if (type === 'File' && pendingFile) {
      await uploadFileToPipeline(pendingFile, title);
      pendingFile = null;
    } else if (type === 'Q&A' || type === 'Manual') {
      var word_count = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;
      var row = {
        title: title,
        type: type,
        content: content || null,
        source_url: null,
        status: 'completed',
        word_count: word_count,
      };

      if (state.editingItem && state.editingItem.source === 'knowledge_items') {
        row.id = state.editingItem.id;
      }
      await adminAPI('save-item', row);
    }
  } catch (e) {
    console.error('Save failed:', e);
    alert('Save failed: ' + e.message);
  }

  closeModal();
  await loadData();
  render();
}

async function uploadFileToPipeline(file, title) {
  // Read file as base64
  var base64 = await new Promise(function (resolve) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result.split(',')[1]); // strip data:...;base64, prefix
    };
    reader.readAsDataURL(file);
  });

  var fileType = 'text';
  if (file.name.match(/\.pdf$/i)) fileType = 'pdf';
  else if (file.name.match(/\.(mp4|mp3|m4a|wav|webm)$/i)) fileType = 'audio';

  // Route through admin API (uses service key, no ADMIN_PASSWORD needed)
  var result = await adminAPI('upload-file', {
    file: base64,
    filename: file.name,
    type: fileType,
    title: title
  });

  if (result.error) {
    alert('Upload failed: ' + result.error);
  }
}

function val(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

// ============================================================
// Item actions
// ============================================================
window.editItem = async function (id) {
  closeAllDropdowns();
  var item = state.items.find(function (i) { return i.id === id; });
  if (!item) return;
  openModal(item);
};

window.deleteItem = async function (id) {
  closeAllDropdowns();
  var item = state.items.find(function (i) { return i.id === id; });
  if (!item) return;
  if (!window.confirm('Delete this item?')) return;

  await adminAPI('delete-item', { id: id, source: item.source });
  closeDetailPanel();
  await loadData();
  render();
};

// ============================================================
// Folder actions
// ============================================================
function showFolderInline() {
  var slot = document.getElementById('folder-inline-slot');
  if (!slot) return;
  slot.innerHTML = '<div class="folder-inline">' +
    '<span class="row-icon folder-icon">\uD83D\uDCC1</span>' +
    '<input type="text" id="new-folder-name" placeholder="Folder name...">' +
    '<button class="btn-save-folder" onclick="createFolder()">Save</button>' +
    '<button class="btn-cancel-folder" onclick="cancelFolder()">Cancel</button>' +
    '</div>';
  document.getElementById('new-folder-name').focus();
}

window.createFolder = async function () {
  var name = val('new-folder-name');
  if (!name) return;
  await sb.from('knowledge_folders').insert([{ name: name }]);
  await loadData();
  render();
};

window.cancelFolder = function () {
  var slot = document.getElementById('folder-inline-slot');
  if (slot) slot.innerHTML = '';
};

window.editFolder = function (id) {
  closeAllDropdowns();
  var folder = state.folders.find(function (f) { return f.id === id; });
  if (!folder) return;
  var name = window.prompt('Rename folder:', folder.name);
  if (name && name.trim()) {
    sb.from('knowledge_folders').update({ name: name.trim() }).eq('id', id).then(function () {
      loadData().then(render);
    });
  }
};

window.deleteFolder = async function (id) {
  closeAllDropdowns();
  if (!window.confirm('Delete this folder?')) return;
  await sb.from('knowledge_folders').delete().eq('id', id);
  await loadData();
  render();
};

// ============================================================
// Sidebar logout
// ============================================================
window.adminLogout = async function () {
  await sb.auth.signOut();
  redirect();
};

// ============================================================
// Detail Side Panel
// ============================================================
function openDetailPanel(item) {
  state.selectedItem = item;
  var statusInfo = getStatusInfo(item.status);

  var html = '';
  html += '<div class="detail-title">' + esc(item.title) + '</div>';

  // Meta row: type + status
  html += '<div class="detail-meta">';
  html += '<span class="type-badge">' + esc(item.type) + '</span>';
  html += '<span class="detail-status"><span class="filter-dot ' + statusInfo.dot + '"></span>' + statusInfo.label + '</span>';
  html += '</div>';

  // Source URL
  if (item.source_url) {
    html += '<a class="detail-source-url" href="' + escAttr(item.source_url) + '" target="_blank" rel="noopener">' + esc(item.source_url) + '</a>';
  }

  // Stats
  html += '<div class="detail-stats">';
  if (item.chunks_created) {
    html += '<div class="detail-stat"><strong>' + item.chunks_created + '</strong> chunks in Pinecone</div>';
  }
  if (item.word_count) {
    html += '<div class="detail-stat"><strong>' + item.word_count + '</strong> words</div>';
  }
  html += '<div class="detail-stat">Created ' + formatDate(item.created_at) + '</div>';
  if (item.source) {
    html += '<div class="detail-stat">Source: ' + item.source + '</div>';
  }
  html += '</div>';

  // Content
  if (item.status === 'processing') {
    html += '<div class="detail-processing"><div class="spinner"></div>Extracting transcript…</div>';
  } else if (item.status === 'attention') {
    html += '<div class="detail-attention-msg">Automatic extraction failed. Use Edit to paste the transcript manually, or click Retry.</div>';
  }

  if (item.content) {
    html += '<div class="detail-content-label">Content</div>';
    html += '<div class="detail-content-text">' + esc(item.content) + '</div>';
  } else if (item.source === 'ingestion_log' && item.status === 'completed') {
    html += '<div class="detail-content-label">Content stored in Pinecone</div>';
    html += '<div style="margin-bottom:12px"><button class="detail-action-btn" onclick="searchPineconeForItem(\'' + escAttr(item.title) + '\')">Preview stored chunks</button></div>';
    html += '<div id="pinecone-preview"></div>';
  } else if (item.status !== 'processing') {
    html += '<div class="detail-content-label">Content</div>';
    html += '<div class="detail-content-text" style="color:#555;font-style:italic">No content stored yet.</div>';
  }

  // Editable fields section
  html += '<div class="detail-divider"></div>';
  html += '<div class="detail-fields">';

  // Name (editable)
  html += '<div class="detail-field">';
  html += '<label>Name</label>';
  html += '<input type="text" id="detail-field-name" value="' + escAttr(item.title) + '">';
  html += '</div>';

  // Context
  html += '<div class="detail-field">';
  html += '<label>Context</label>';
  html += '<input type="text" id="detail-field-context" placeholder="Optional extra info to help the AI" value="' + escAttr(item.context || '') + '">';
  html += '</div>';

  // Published Date
  html += '<div class="detail-field">';
  html += '<label>Published Date</label>';
  html += '<input type="date" id="detail-field-date" value="' + (item.created_at ? item.created_at.substring(0, 10) : '') + '">';
  html += '</div>';

  // Author toggle
  html += '<div class="detail-field detail-field-row">';
  html += '<label>Content is by or about me</label>';
  html += '<label class="settings-toggle"><input type="checkbox" id="detail-field-author"' + (item.is_author !== false ? ' checked' : '') + '><span class="settings-toggle-slider"></span></label>';
  html += '</div>';

  // Citation URL
  html += '<div class="detail-field">';
  html += '<label>Citation URL</label>';
  html += '<input type="url" id="detail-field-citation" placeholder="https://..." value="' + escAttr(item.source_url || '') + '">';
  html += '</div>';

  // Save/Cancel
  html += '<div class="detail-field-actions">';
  html += '<button class="btn-save" onclick="saveDetailFields()">Save</button>';
  html += '<button class="btn-cancel" onclick="closeDetailPanel()">Cancel</button>';
  html += '</div>';

  html += '</div>';

  $detailBody.innerHTML = html;

  // Show/hide retry button
  var canRetry = (item.type === 'YouTube' || item.type === 'TikTok') && item.status !== 'processing';
  $detailRetry.style.display = canRetry ? '' : 'none';

  $detailPanel.classList.add('open');
}

// Save detail panel fields
window.saveDetailFields = async function () {
  if (!state.selectedItem) return;
  var item = state.selectedItem;

  var newTitle = document.getElementById('detail-field-name').value.trim();
  var context = document.getElementById('detail-field-context').value.trim();
  var pubDate = document.getElementById('detail-field-date').value;
  var isAuthor = document.getElementById('detail-field-author').checked;
  var citationUrl = document.getElementById('detail-field-citation').value.trim();

  if (item.source === 'knowledge_items') {
    await adminAPI('save-item', {
      id: item.id,
      title: newTitle || item.title,
      type: item.type,
      content: item.content,
      source_url: citationUrl || item.source_url,
      word_count: item.word_count
    });
  }

  // Refresh
  await loadData();
  render();
  var fresh = state.items.find(function (i) { return i.id === item.id; });
  if (fresh) openDetailPanel(fresh);
};

function closeDetailPanel() {
  $detailPanel.classList.remove('open');
  state.selectedItem = null;
}

function getStatusInfo(status) {
  var map = {
    completed: { label: 'Completed', dot: 'green' },
    processing: { label: 'Processing', dot: 'blue' },
    learning: { label: 'Learning', dot: 'blue' },
    attention: { label: 'Needs Attention', dot: 'orange' },
    failed: { label: 'Failed', dot: 'red' },
    deleting: { label: 'Deleting', dot: 'red' },
  };
  return map[status] || { label: status || 'Unknown', dot: '' };
}

function statusDotColor(status) {
  var info = getStatusInfo(status);
  return info.dot;
}

// ============================================================
// Pinecone Preview (search stored chunks)
// ============================================================
window.searchPineconeForItem = async function (query) {
  var preview = document.getElementById('pinecone-preview');
  if (!preview) return;
  preview.innerHTML = '<div class="detail-processing"><div class="spinner"></div>Searching Pinecone...</div>';

  try {
    var data = await adminAPI('search', { query: query });
    var matches = data.matches || [];

    if (matches.length === 0) {
      preview.innerHTML = '<div class="detail-content-text" style="color:#555">No matching chunks found.</div>';
      return;
    }

    var html = '';
    matches.forEach(function (m, i) {
      html += '<div style="margin-bottom:12px;padding:10px;background:#0a0a0a;border-radius:6px;border:1px solid #1a1a1a">';
      html += '<div style="font-size:11px;color:#555;margin-bottom:4px">';
      html += 'Chunk ' + (i + 1) + ' · score: ' + (m.score ? m.score.toFixed(3) : '?');
      if (m.source_type) html += ' · ' + m.source_type;
      html += '</div>';
      html += '<div style="font-size:12px;color:#ccc;line-height:1.6;white-space:pre-wrap">' + esc(m.text || '') + '</div>';
      if (m.url) html += '<a href="' + escAttr(m.url) + '" target="_blank" style="font-size:11px;color:#4a9eff;margin-top:4px;display:block">' + esc(m.url) + '</a>';
      html += '</div>';
    });

    preview.innerHTML = html;
  } catch (e) {
    preview.innerHTML = '<div style="color:#ef4444;font-size:12px">Search failed: ' + esc(e.message) + '</div>';
  }
};

// ============================================================
// Transcript Extraction (Edge Function)
// ============================================================
async function triggerExtraction(itemId, sourceUrl, type) {
  try {
    await sb.functions.invoke('extract-transcript', {
      body: { item_id: itemId, source_url: sourceUrl, type: type }
    });
  } catch (e) {
    console.error('Edge function invoke failed:', e);
  }
}

async function retryExtraction(item) {
  // Set status back to processing
  await sb.from('knowledge_items').update({
    status: 'processing',
    updated_at: new Date().toISOString()
  }).eq('id', item.id);

  await loadData();
  render();

  // Re-open panel with refreshed item
  var fresh = state.items.find(function (i) { return i.id === item.id; });
  if (fresh) openDetailPanel(fresh);

  // Fire extraction
  triggerExtraction(item.id, item.source_url, item.type);
}

// ============================================================
// Processing Poll
// ============================================================
function checkProcessingPoll() {
  var hasProcessing = state.items.some(function (i) { return i.status === 'processing'; });

  if (hasProcessing && !processingPollInterval) {
    processingPollInterval = setInterval(async function () {
      await loadData();
      render();
      // Refresh detail panel if open
      if (state.selectedItem) {
        var fresh = state.items.find(function (i) { return i.id === state.selectedItem.id; });
        if (fresh) openDetailPanel(fresh);
      }
    }, 10000);
  } else if (!hasProcessing && processingPollInterval) {
    clearInterval(processingPollInterval);
    processingPollInterval = null;
  }
}

// ============================================================
// Helpers
// ============================================================
function esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  return esc(str).replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function docIconSVG(size) {
  var s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/>' +
    '</svg>';
}
