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
var state = {
  items: [],
  folders: [],
  viewMode: 'list',          // 'list' | 'grid'
  activeTab: 'content',      // 'content' | 'feeds'
  filterStatus: null,        // null = all, or 'completed','learning','attention','failed','deleting'
  filterType: null,           // null = all, or 'Q&A','Manual','YouTube','TikTok','File'
  searchQuery: '',
  totalWords: 0,
  editingItem: null,          // null = adding, object = editing
  selectedItem: null,         // item shown in detail panel
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
  var items = getFilteredItems();
  var folders = state.folders;

  if (state.viewMode === 'grid') {
    renderGrid(folders, items);
  } else {
    renderList(folders, items);
  }
}

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
    html += '<div class="list-row" data-item-id="' + item.id + '">';
    html += '<div class="row-checkbox"><input type="checkbox"></div>';
    html += '<div class="row-name">';
    html += '<span class="row-icon doc-icon">' + docIconSVG() + '</span>';
    html += '<span class="row-status-dot ' + statusDotColor(item.status) + '"></span>';
    html += '<span class="row-name-text">' + esc(item.title) + '</span>';
    html += '</div>';
    html += '<div><span class="type-badge">' + esc(item.type) + '</span></div>';
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

// ============================================================
// Events
// ============================================================
function bindEvents() {
  // Tabs
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.activeTab = btn.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === state.activeTab); });
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
  updateFilterChips();
  closeAllDropdowns();
  renderContent();
};

// Type dropdown items
window.selectType = function (val) {
  state.filterType = state.filterType === val ? null : val;
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

function openModal(item) {
  state.editingItem = item || null;
  $modalTitle.textContent = item ? 'Edit Content' : 'Add Content';

  // Set type tabs
  var activeType = item ? item.type : 'Q&A';
  $modalTypeTabs.innerHTML = '';
  MODAL_TYPES.forEach(function (t) {
    var btn = document.createElement('button');
    btn.className = 'modal-type-tab' + (t === activeType ? ' active' : '');
    btn.textContent = t;
    btn.dataset.type = t;
    $modalTypeTabs.appendChild(btn);
  });

  renderModalFields(activeType);
  $modalOverlay.classList.add('open');
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
      await adminAPI('ingest-video', { url: source_url });
      $modalSaveBtn.textContent = 'Save';
      $modalSaveBtn.disabled = false;
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

  $detailBody.innerHTML = html;

  // Show/hide retry button
  var canRetry = (item.type === 'YouTube' || item.type === 'TikTok') && item.status !== 'processing';
  $detailRetry.style.display = canRetry ? '' : 'none';

  $detailPanel.classList.add('open');
}

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
