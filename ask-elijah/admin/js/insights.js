/* ============================================================
   Insights Page — Ask Elijah Admin Dashboard
   ============================================================ */

var SUPABASE_URL = 'https://eqhevpclmudbrmmltyyk.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
var ADMIN_EMAIL = 'ebb95@mac.com';

var insightsData = null;
var insightsDays = 30;
var insightsMetric = 'conversations'; // conversations | messages | visitors
var checklistExpanded = false;

// ── Auth ──
document.addEventListener('DOMContentLoaded', function () { checkAuth(); });

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
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  };
  if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  var res = await fetch('/.netlify/functions/admin-knowledge?action=' + action, opts);
  return res.json();
}

// ── Boot ──
async function boot() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('app-shell').style.display = 'flex';
  bindEvents();
  await loadInsights(insightsDays);
  renderInsights();
}

function bindEvents() {
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

  // Share modal — click outside to dismiss
  var modal = document.getElementById('share-modal');
  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.style.display = 'none';
  });

  // Copy URL button
  document.getElementById('share-copy-btn').addEventListener('click', function () {
    var url = window.location.origin + '/ask-elijah/profile.html';
    navigator.clipboard.writeText(url);
    this.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><polyline points="20 6 9 17 4 12" stroke="#22c55e" fill="none" stroke-width="2"/></svg>';
    var btn = this;
    setTimeout(function () {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 2000);
  });

  // Social share buttons
  document.querySelectorAll('.share-social-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var platform = btn.dataset.platform;
      var url = encodeURIComponent(window.location.origin + '/ask-elijah/profile.html');
      var text = encodeURIComponent('Check out Ask Elijah — get real answers from Elijah Bryant');
      var shareUrl = '';
      if (platform === 'twitter') shareUrl = 'https://twitter.com/intent/tweet?url=' + url + '&text=' + text;
      else if (platform === 'linkedin') shareUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + url;
      else if (platform === 'whatsapp') shareUrl = 'https://wa.me/?text=' + text + '%20' + url;
      else if (platform === 'email') shareUrl = 'mailto:?subject=' + text + '&body=' + url;
      else if (platform === 'sms') shareUrl = 'sms:?body=' + text + '%20' + url;
      if (shareUrl) window.open(shareUrl, '_blank');
    });
  });
}

// ── Load data ──
async function loadInsights(days) {
  insightsDays = days || insightsDays;
  try {
    insightsData = await adminAPI('insights', { days: insightsDays });
  } catch (e) {
    console.error('Failed to load insights:', e);
  }
}

// ── Main render ──
function renderInsights() {
  var $panel = document.getElementById('insights-panel');
  if (!insightsData) {
    $panel.innerHTML = '<div class="insight-loading"><div class="spinner"></div>Loading insights...</div>';
    loadInsights(insightsDays).then(function () { renderInsights(); });
    return;
  }

  var d = insightsData;
  var html = '';

  // ═══ 0. PROFILE PHOTO + GREETING + SHARE ═══
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  html += '<div class="insight-profile-photo"><span>EB</span></div>';
  html += '<div class="insight-profile-name">Elijah Bryant</div>';
  html += '<div class="insight-greeting">';
  html += '<div class="insight-greeting-text">' + greeting + ', Elijah!</div>';
  html += '<button class="insight-share-btn" onclick="openShareModal()">Share</button>';
  html += '</div>';

  // ═══ 1. ONBOARDING CHECKLIST ═══
  var checkItems = [
    { label: 'Profile Picture', desc: 'Upload a profile photo.', done: true },
    { label: 'Add Bio', desc: 'Write a short bio about yourself.', done: true },
    { label: 'Add Headline', desc: 'Add a headline that describes what you do.', done: true },
    { label: 'Edit Suggested Questions', desc: 'Customize the questions users see first.', done: true },
    { label: 'Set Initial Greeting', desc: 'Write the first message users see.', done: true },
    { label: 'Make Your AI Public', desc: 'Let people find and chat with your AI.', done: true },
    { label: 'Record Voice', desc: 'Record a 10 second voice sample.', done: false },
    { label: 'Add your first Q&A', desc: 'Create a question and answer pair.', done: d.ingestionByType && (d.ingestionByType.qa > 0 || d.ingestionByType['q&a'] > 0) },
    { label: 'Connect a YouTube channel', desc: 'Import knowledge from your videos.', done: d.ingestionByType && d.ingestionByType.youtube > 0 },
    { label: 'Add a newsletter source', desc: 'Connect your newsletter for auto-ingestion.', done: d.ingestionByType && d.ingestionByType.newsletter > 0 },
    { label: 'Upload a document', desc: 'Upload a PDF or text file.', done: d.ingestionByType && d.ingestionByType.upload > 0 },
    { label: 'Get your first conversation', desc: 'Have someone ask your AI a question.', done: d.conversations && d.conversations.current > 0 }
  ];
  var doneItems = checkItems.filter(function (c) { return c.done; });
  var pendingItems = checkItems.filter(function (c) { return !c.done; });
  var doneCount = doneItems.length;

  if (pendingItems.length > 0 || doneCount > 0) {
    html += '<div class="insight-checklist">';
    html += '<div class="insight-checklist-header">';
    html += '<span class="checklist-badge">' + pendingItems.length + '</span>';
    html += '<span>Complete your profile</span>';
    html += '</div>';

    // Show pending items prominently (only first one above fold)
    pendingItems.forEach(function (ci, idx) {
      if (idx > 0) return; // only show first pending prominently
      html += '<div class="insight-check-item pending">';
      html += '<span class="insight-check-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#888884" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="15 5"/></svg></span>';
      html += '<div class="check-item-content">';
      html += '<span class="check-item-label">' + ci.label + '</span>';
      if (ci.desc) html += '<span class="check-item-desc">' + ci.desc + '</span>';
      html += '</div>';
      html += '</div>';
    });

    // Collapsible completed section
    if (doneCount > 0) {
      html += '<button class="checklist-toggle" id="checklist-toggle" onclick="toggleChecklist()">';
      html += '<span class="checklist-toggle-arrow">' + (checklistExpanded ? '&#8744;' : '&#8250;') + '</span> ';
      html += doneCount + ' completed';
      html += '</button>';

      html += '<div class="checklist-completed' + (checklistExpanded ? ' open' : '') + '" id="checklist-completed">';
      doneItems.forEach(function (ci) {
        html += '<div class="insight-check-item done">';
        html += '<span class="insight-check-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e" stroke="none"/><polyline points="8 12 11 15 16 9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
        html += '<span>' + ci.label + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
  }

  // ═══ 2. CONVERSATIONS CHART ═══
  html += '<div class="insight-section">';
  html += '<div class="insight-section-header">';
  html += '<div>';

  // Metric selector dropdown
  html += '<div class="insight-metric-selector">';
  html += '<button class="insight-metric-btn" id="metric-btn" onclick="toggleMetricDropdown()">';
  html += getMetricLabel(insightsMetric);
  html += ' <span class="metric-chevron">&#8744;</span>';
  html += '</button>';
  html += '<div class="insight-metric-dropdown" id="metric-dropdown">';
  html += '<button class="metric-option' + (insightsMetric === 'conversations' ? ' active' : '') + '" onclick="setMetric(\'conversations\')">Total Conversations' + (insightsMetric === 'conversations' ? ' &#10003;' : '') + '</button>';
  html += '<button class="metric-option' + (insightsMetric === 'messages' ? ' active' : '') + '" onclick="setMetric(\'messages\')">Total Messages' + (insightsMetric === 'messages' ? ' &#10003;' : '') + '</button>';
  html += '<button class="metric-option' + (insightsMetric === 'visitors' ? ' active' : '') + '" onclick="setMetric(\'visitors\')">Total Visitors' + (insightsMetric === 'visitors' ? ' &#10003;' : '') + '</button>';
  html += '</div>';
  html += '</div>';

  var metricValue = getMetricValue(d);
  html += '<div class="insight-big-num">' + metricValue.toLocaleString() + '</div>';
  html += '</div>';

  // Filters + change
  html += '<div class="insight-filters-col">';
  html += '<select class="insight-select" id="insight-range" onchange="changeRange(this.value)">';
  html += '<option value="1"' + (insightsDays === 1 ? ' selected' : '') + '>Last 24 hours</option>';
  html += '<option value="7"' + (insightsDays === 7 ? ' selected' : '') + '>Last 7 days</option>';
  html += '<option value="30"' + (insightsDays === 30 ? ' selected' : '') + '>Last 30 days</option>';
  html += '<option value="90"' + (insightsDays === 90 ? ' selected' : '') + '>Last 3 months</option>';
  html += '<option value="365"' + (insightsDays === 365 ? ' selected' : '') + '>Last 12 months</option>';
  html += '</select>';
  html += renderChange(d.conversations.change);
  html += '</div>';
  html += '</div>';

  // Chart with tooltips
  html += renderChart(d.chart || []);
  html += '</div>';

  // ═══ 3. BOTTOM ROW — Mind Score + Analytics side by side ═══
  html += '<div class="insight-bottom-row">';

  // LEFT: Mind Score
  var score = d.mindScore || 0;
  var tier = getMindTier(score);

  html += '<div class="insight-section insight-mind-card">';
  html += '<div class="insight-section-title">Mind Score</div>';
  html += '<div class="insight-mind-inner">';
  html += '<div class="insight-mind-tier-label">' + tier.name + '</div>';
  html += '<div class="insight-mind-score">' + formatScore(score) + '</div>';
  html += '</div>';
  html += '<div class="insight-mind-progress">';
  html += '<div class="insight-mind-progress-labels">';
  html += '<span>' + tier.name + ' / ' + tier.min.toLocaleString() + '</span>';
  html += '<span>→</span>';
  html += '<span>' + tier.next + ' / ' + tier.nextThreshold.toLocaleString() + '</span>';
  html += '</div>';
  html += '<div class="insight-progress-bar"><div class="insight-progress-fill" style="width:' + tier.progress + '%;background:' + tier.color + '"></div></div>';
  html += '</div>';
  html += '</div>';

  // RIGHT: Analytics
  html += '<div class="insight-section insight-analytics-card-right">';
  html += '<div class="insight-analytics-header">';
  html += '<span class="insight-section-title">Analytics</span>';
  html += '<span class="insight-analytics-period">Last ' + insightsDays + ' days</span>';
  html += '</div>';

  html += '<div class="analytics-stats-container">';

  // Active Visitors
  html += '<div class="analytics-stat-row">';
  html += '<div class="analytics-stat-label">Active Visitors</div>';
  html += '<div class="analytics-stat-value">' + (d.activeVisitors.current || 0).toLocaleString() + '</div>';
  html += '</div>';

  // Total Messages
  html += '<div class="analytics-stat-row">';
  html += '<div class="analytics-stat-label">Total Messages</div>';
  html += '<div class="analytics-stat-value">' + (d.totalMessages.current || 0).toLocaleString() + '</div>';
  html += '</div>';

  // Avg Session Duration
  var mins = Math.floor((d.avgDuration.seconds || 0) / 60);
  var secs = (d.avgDuration.seconds || 0) % 60;
  html += '<div class="analytics-stat-row">';
  html += '<div class="analytics-stat-label">Avg Session Duration</div>';
  html += '<div class="analytics-stat-value">' + mins + ' <span class="analytics-unit">m</span> ' + secs + ' <span class="analytics-unit">s</span></div>';
  html += '<div class="analytics-stat-change">' + renderChangeInline(d.avgDuration.change) + '</div>';
  html += '</div>';

  html += '</div>'; // end analytics-stats-container

  html += '</div>';
  html += '</div>'; // end bottom row

  // ═══ 4. Knowledge by Source ═══
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

  $panel.innerHTML = html;

  // Set share URL text
  document.getElementById('share-url-text').textContent = window.location.origin.replace('https://', '') + '/ask-elijah/profile.html';
}

// ── Metric helpers ──
function getMetricLabel(metric) {
  if (metric === 'messages') return 'Total Messages';
  if (metric === 'visitors') return 'Total Visitors';
  return 'Total Conversations';
}

function getMetricValue(d) {
  if (insightsMetric === 'messages') return d.totalMessages.current || 0;
  if (insightsMetric === 'visitors') return d.activeVisitors.current || 0;
  return d.conversations.current || 0;
}

window.setMetric = function (metric) {
  insightsMetric = metric;
  var dd = document.getElementById('metric-dropdown');
  if (dd) dd.classList.remove('open');
  renderInsights();
};

window.toggleMetricDropdown = function () {
  var dd = document.getElementById('metric-dropdown');
  dd.classList.toggle('open');
};

// ── Chart with hover tooltips ──
function renderChart(data) {
  if (!data || data.length === 0) return '<div style="color:#555;padding:20px;text-align:center">No conversation data yet</div>';

  var maxVal = Math.max.apply(null, data.map(function (d) { return d.count; }).concat([1]));
  var chartH = 160;
  var chartW = data.length * 20;
  var html = '<div class="insight-chart" style="position:relative">';
  html += '<svg class="insight-chart-svg" viewBox="0 0 ' + chartW + ' ' + (chartH + 30) + '" preserveAspectRatio="none">';

  // Dashed grid lines
  for (var g = 0; g <= 4; g++) {
    var gy = chartH - (g / 4) * chartH;
    html += '<line x1="0" y1="' + gy + '" x2="' + chartW + '" y2="' + gy + '" stroke="#2a2a28" stroke-width="1" stroke-dasharray="4 4"/>';
  }

  // Y-axis labels
  for (var g = 0; g <= 4; g++) {
    var gy = chartH - (g / 4) * chartH;
    var yVal = Math.round((g / 4) * maxVal);
    html += '<text x="' + (chartW - 4) + '" y="' + (gy - 4) + '" fill="#555550" font-size="8" text-anchor="end">' + yVal + '</text>';
  }

  // Line path
  var points = data.map(function (d, i) {
    var x = i * 20 + 10;
    var y = chartH - (d.count / maxVal) * (chartH - 10);
    return x + ',' + y;
  });
  html += '<polyline points="' + points.join(' ') + '" fill="none" stroke="#4ade80" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

  // Area fill
  var areaPoints = '10,' + chartH + ' ' + points.join(' ') + ' ' + ((data.length - 1) * 20 + 10) + ',' + chartH;
  html += '<polygon points="' + areaPoints + '" fill="url(#insightGrad)" opacity="0.2"/>';
  html += '<defs><linearGradient id="insightGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ade80"/><stop offset="100%" stop-color="#4ade80" stop-opacity="0"/></linearGradient></defs>';

  // Dots with hover targets
  data.forEach(function (d, i) {
    var x = i * 20 + 10;
    var y = chartH - (d.count / maxVal) * (chartH - 10);
    html += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#4ade80" stroke="#1c1c18" stroke-width="2" class="chart-dot" data-idx="' + i + '"/>';
    // Invisible larger hit area
    html += '<circle cx="' + x + '" cy="' + y + '" r="12" fill="transparent" class="chart-dot-hit" data-idx="' + i + '" onmouseenter="showTooltip(event,' + i + ')" onmouseleave="hideTooltip()"/>';
  });

  html += '</svg>';

  // Tooltip container
  html += '<div class="chart-tooltip" id="chart-tooltip" style="display:none"></div>';

  // X-axis labels
  html += '<div class="insight-chart-labels">';
  var step = Math.max(1, Math.floor(data.length / 6));
  data.forEach(function (d, i) {
    if (i % step === 0 || i === data.length - 1) {
      var dateObj = new Date(d.date + 'T12:00:00');
      var label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      html += '<span>' + label + '</span>';
    }
  });
  html += '</div>';

  html += '</div>';
  return html;
}

window.showTooltip = function (event, idx) {
  if (!insightsData || !insightsData.chart) return;
  var point = insightsData.chart[idx];
  if (!point) return;
  var tooltip = document.getElementById('chart-tooltip');
  var dateObj = new Date(point.date + 'T12:00:00');
  var label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  tooltip.textContent = label + ' — ' + point.count + ' ' + (point.count === 1 ? 'conversation' : 'conversations');
  tooltip.style.display = 'block';

  // Position near the dot
  var chart = tooltip.parentElement;
  var rect = chart.getBoundingClientRect();
  var svgRect = chart.querySelector('svg').getBoundingClientRect();
  var dotX = (idx * 20 + 10) / (insightsData.chart.length * 20) * svgRect.width;
  tooltip.style.left = Math.max(0, Math.min(dotX - 60, rect.width - 160)) + 'px';
  tooltip.style.top = '4px';
};

window.hideTooltip = function () {
  var tooltip = document.getElementById('chart-tooltip');
  if (tooltip) tooltip.style.display = 'none';
};

// ── Change indicators ──
function renderChange(pct) {
  if (pct === 0) return '<div class="insight-change neutral">0%</div>';
  var cls = pct > 0 ? 'positive' : 'negative';
  var arrow = pct > 0 ? '&#9650;' : '&#9660;';
  return '<div class="insight-change ' + cls + '">' + arrow + ' ' + Math.abs(pct) + '%</div>';
}

function renderChangeInline(pct) {
  if (pct === 0) return '<span class="insight-change neutral">0%</span>';
  var cls = pct > 0 ? 'positive' : 'negative';
  var arrow = pct > 0 ? '&#9650;' : '&#9660;';
  return '<span class="insight-change ' + cls + '">' + arrow + ' ' + Math.abs(pct) + '%</span>';
}

// ── Mind Score tiers ──
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
    min: current.min,
    nextThreshold: current.nextThreshold,
    color: current.color,
    progress: progress
  };
}

function formatScore(score) {
  if (score >= 1000) return (score / 1000).toFixed(1) + 'K';
  return score.toLocaleString();
}

// ── Helpers ──
function esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Global actions ──
window.changeRange = function (days) {
  insightsData = null;
  insightsDays = parseInt(days, 10);
  renderInsights();
};

window.toggleChecklist = function () {
  checklistExpanded = !checklistExpanded;
  var $completed = document.getElementById('checklist-completed');
  var $toggle = document.getElementById('checklist-toggle');
  if ($completed) $completed.classList.toggle('open', checklistExpanded);
  if ($toggle) {
    $toggle.querySelector('.checklist-toggle-arrow').innerHTML = checklistExpanded ? '&#8744;' : '&#8250;';
  }
};

window.openShareModal = function () {
  var modal = document.getElementById('share-modal');
  modal.style.display = 'flex';
  // Generate simple QR code as SVG (text-based placeholder — works without library)
  var qr = document.getElementById('share-qr');
  var url = window.location.origin + '/ask-elijah/profile.html';
  qr.innerHTML = '<div class="qr-placeholder"><svg viewBox="0 0 24 24" width="80" height="80" stroke="#fff" fill="none" stroke-width="1"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4" rx="1"/><rect x="18" y="18" width="4" height="4" rx="1"/><rect x="5" y="5" width="2" height="2" fill="#fff"/><rect x="17" y="5" width="2" height="2" fill="#fff"/><rect x="5" y="17" width="2" height="2" fill="#fff"/></svg><div class="qr-url">' + esc(url) + '</div></div>';
};

function adminLogout() {
  sb.auth.signOut().then(function () {
    window.location.href = '/ask-elijah/';
  });
}
