/* ── Ask Elijah — Admin Dashboard ── */
(function () {
  'use strict';

  // ── Config ──
  var SUPABASE_URL  = window.__ENV_SUPABASE_URL  || 'https://eqhevpclmudbrmmltyyk.supabase.co';
  var SUPABASE_ANON = window.__ENV_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxaGV2cGNsbXVkYnJtbWx0eXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjA1NDIsImV4cCI6MjA4OTQzNjU0Mn0.Kbdq1hWUXLgn1VGYCQSsSYrPTMs5gkiPMwsyB-KSg7E';
  var adminPassword = '';
  var supabase = null;

  // ── DOM ──
  var loginScreen   = document.getElementById('admin-login');
  var loginForm     = document.getElementById('admin-login-form');
  var passwordInput = document.getElementById('admin-password');
  var dashboard     = document.getElementById('admin-dashboard');
  var navLinks      = document.querySelectorAll('.nav-link');
  var tabs          = document.querySelectorAll('.tab-content');

  // ── Login ──
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    adminPassword = passwordInput.value;
    if (!adminPassword) return;

    // Store for API calls
    sessionStorage.setItem('askAdminPw', adminPassword);

    if (SUPABASE_URL && SUPABASE_ANON) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }

    loginScreen.classList.add('hidden');
    dashboard.classList.add('visible');
    loadOverview();
  });

  // Restore session
  var savedPw = sessionStorage.getItem('askAdminPw');
  if (savedPw) {
    adminPassword = savedPw;
    if (SUPABASE_URL && SUPABASE_ANON) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }
    loginScreen.classList.add('hidden');
    dashboard.classList.add('visible');
    loadOverview();
  }

  // ── Forgot Password ──
  document.getElementById('forgot-password').addEventListener('click', function () {
    var msgEl = document.getElementById('forgot-msg');
    msgEl.textContent = 'Sending reset email...';

    fetch('/.netlify/functions/admin-reset', { method: 'POST' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        msgEl.textContent = data.message || 'Reset email sent to your email on file.';
      })
      .catch(function () {
        msgEl.textContent = 'Failed to send reset. Try again.';
      });
  });

  // ── Tab Navigation ──
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      var tabId = link.getAttribute('data-tab');
      navLinks.forEach(function (l) { l.classList.remove('active'); });
      tabs.forEach(function (t) { t.classList.remove('active'); });
      link.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');

      // Load tab data
      switch (tabId) {
        case 'overview': loadOverview(); break;
        case 'escalated': loadEscalated(); break;
        case 'questions': loadQuestions(); break;
        case 'users': loadUsers(); break;
        case 'ingestion': loadIngestion(); break;
      }
    });
  });

  // ══════════════════════════════════
  // OVERVIEW
  // ══════════════════════════════════
  function loadOverview() {
    if (!supabase) return;

    supabase.from('user_profiles').select('*', { count: 'exact', head: true })
      .then(function (r) { setText('stat-users', r.count || 0); });

    supabase.from('questions').select('*', { count: 'exact', head: true })
      .then(function (r) { setText('stat-questions', r.count || 0); });

    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('status', 'needs_elijah')
      .then(function (r) {
        var n = r.count || 0;
        setText('stat-escalated', n);
        var badge = document.getElementById('escalated-badge');
        badge.textContent = n;
        badge.setAttribute('data-count', n);
      });

    supabase.from('ingestion_log').select('chunks_created')
      .then(function (r) {
        var total = (r.data || []).reduce(function (sum, row) { return sum + (row.chunks_created || 0); }, 0);
        setText('stat-chunks', total);
      });

    // Recent questions
    supabase.from('questions')
      .select('question_text, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(function (r) {
        var container = document.getElementById('recent-questions');
        container.innerHTML = '';
        (r.data || []).forEach(function (q) {
          var div = document.createElement('div');
          div.className = 'escalated-item';
          div.innerHTML = '<div class="escalated-q">' + esc(q.question_text) + '</div>'
            + '<div class="escalated-meta">' + formatDate(q.created_at)
            + ' · <span class="status-badge ' + q.status + '">' + q.status + '</span></div>';
          container.appendChild(div);
        });
      });
  }

  // ══════════════════════════════════
  // ESCALATED
  // ══════════════════════════════════
  var currentEscalatedId = null;

  function loadEscalated() {
    if (!supabase) return;

    supabase.from('questions')
      .select('id, user_id, question_text, notify_user, created_at')
      .eq('status', 'needs_elijah')
      .order('created_at', { ascending: true })
      .then(function (r) {
        var container = document.getElementById('escalated-list');
        container.innerHTML = '';

        if (!r.data || r.data.length === 0) {
          container.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:0.85rem;">No escalated questions. Nice!</p>';
          return;
        }

        r.data.forEach(function (q) {
          var div = document.createElement('div');
          div.className = 'escalated-item';
          div.innerHTML = '<div class="escalated-q">' + esc(q.question_text) + '</div>'
            + '<div class="escalated-meta">User: ' + q.user_id.slice(0, 8) + '... · ' + formatDate(q.created_at) + '</div>'
            + (q.notify_user ? '<div class="escalated-notify">User wants to be notified</div>' : '')
            + '<button class="admin-btn" style="margin-top:10px">Answer this question</button>';

          div.querySelector('button').addEventListener('click', function () {
            openEditor(q);
          });

          container.appendChild(div);
        });
      });
  }

  function openEditor(question) {
    currentEscalatedId = question.id;
    document.getElementById('editor-question-text').textContent = question.question_text;
    document.getElementById('editor-user-info').textContent = 'User: ' + question.user_id.slice(0, 8) + '... | Notify: ' + (question.notify_user ? 'Yes' : 'No');
    document.getElementById('editor-raw-input').value = '';
    document.getElementById('editor-polished-section').style.display = 'none';
    document.getElementById('answer-editor').classList.add('visible');
  }

  document.getElementById('editor-close').addEventListener('click', function () {
    document.getElementById('answer-editor').classList.remove('visible');
  });

  // Polish with AI
  document.getElementById('editor-polish').addEventListener('click', function () {
    var rawText = document.getElementById('editor-raw-input').value.trim();
    if (!rawText) return;

    var btn = this;
    btn.textContent = 'Polishing...';
    btn.disabled = true;

    fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Polish this response to sound like me (Elijah). Keep the meaning exactly the same, just make it conversational and warm: ' + rawText,
        history: [],
        userId: null
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      document.getElementById('editor-polished-text').textContent = data.response || rawText;
      document.getElementById('editor-polished-section').style.display = 'block';
      btn.textContent = 'Polish with AI';
      btn.disabled = false;
    })
    .catch(function () {
      btn.textContent = 'Polish with AI';
      btn.disabled = false;
    });
  });

  // Approve polished answer
  document.getElementById('editor-approve').addEventListener('click', function () {
    var polished = document.getElementById('editor-polished-text').textContent;
    var raw = document.getElementById('editor-raw-input').value.trim();
    if (!polished || !currentEscalatedId) return;

    var btn = this;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    // Update question in Supabase
    supabase.from('questions').update({
      response_text: polished,
      elijah_raw_response: raw,
      status: 'elijah_responded',
      updated_at: new Date().toISOString()
    }).eq('id', currentEscalatedId)
    .then(function () {
      // Also embed the Q&A into knowledge base
      return fetch('/.netlify/functions/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminPassword
        },
        body: JSON.stringify({
          file: btoa('Q: ' + document.getElementById('editor-question-text').textContent + '\n\nA: ' + polished),
          filename: 'escalation-' + currentEscalatedId + '.txt',
          type: 'text',
          title: 'Elijah Direct Answer'
        })
      });
    })
    .then(function () {
      document.getElementById('answer-editor').classList.remove('visible');
      btn.textContent = 'Approve & Save';
      btn.disabled = false;
      loadEscalated();
      loadOverview();
    })
    .catch(function () {
      btn.textContent = 'Approve & Save';
      btn.disabled = false;
    });
  });

  document.getElementById('editor-re-edit').addEventListener('click', function () {
    document.getElementById('editor-polished-section').style.display = 'none';
  });

  // ══════════════════════════════════
  // QUESTIONS
  // ══════════════════════════════════
  function loadQuestions(statusFilter) {
    if (!supabase) return;

    var query = supabase.from('questions')
      .select('id, user_id, question_text, response_text, confidence, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    query.then(function (r) {
      var container = document.getElementById('questions-table');
      var html = '<table class="data-table"><thead><tr>'
        + '<th>Question</th><th>Status</th><th>Confidence</th><th>Date</th><th></th>'
        + '</tr></thead><tbody>';

      (r.data || []).forEach(function (q) {
        html += '<tr>'
          + '<td class="truncate">' + esc(q.question_text) + '</td>'
          + '<td><span class="status-badge ' + q.status + '">' + q.status + '</span></td>'
          + '<td>' + (q.confidence !== null ? (q.confidence * 100).toFixed(0) + '%' : '—') + '</td>'
          + '<td>' + formatDate(q.created_at) + '</td>'
          + '<td><button class="edit-btn" data-id="' + q.id + '">Edit</button></td>'
          + '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      // Attach edit handlers
      container.querySelectorAll('.edit-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qId = btn.getAttribute('data-id');
          openQuestionEditor(qId);
        });
      });
    });
  }

  document.getElementById('q-filter-status').addEventListener('change', function () {
    loadQuestions(this.value || undefined);
  });

  function openQuestionEditor(questionId) {
    if (!supabase) return;

    supabase.from('questions')
      .select('*')
      .eq('id', questionId)
      .single()
      .then(function (r) {
        if (!r.data) return;
        var q = r.data;
        currentEscalatedId = q.id;
        document.getElementById('editor-question-text').textContent = q.question_text;
        document.getElementById('editor-user-info').textContent = 'Status: ' + q.status + ' | Confidence: ' + ((q.confidence || 0) * 100).toFixed(0) + '%';
        document.getElementById('editor-raw-input').value = q.response_text || '';
        document.getElementById('editor-polished-section').style.display = 'none';
        document.getElementById('answer-editor').classList.add('visible');
      });
  }

  // Export
  document.getElementById('export-questions').addEventListener('click', function () {
    window.open('/.netlify/functions/export?type=questions&token=' + encodeURIComponent(adminPassword));
  });

  // ══════════════════════════════════
  // USERS
  // ══════════════════════════════════
  function loadUsers() {
    if (!supabase) return;

    supabase.from('user_profiles')
      .select('user_id, location_city, location_country, total_questions, last_active')
      .order('last_active', { ascending: false })
      .limit(200)
      .then(function (r) {
        var container = document.getElementById('users-table');
        var html = '<table class="data-table"><thead><tr>'
          + '<th>User ID</th><th>Location</th><th>Questions</th><th>Last Active</th>'
          + '</tr></thead><tbody>';

        (r.data || []).forEach(function (u) {
          html += '<tr class="clickable-row" data-uid="' + u.user_id + '">'
            + '<td>' + u.user_id.slice(0, 12) + '...</td>'
            + '<td>' + esc((u.location_city || '') + (u.location_country ? ', ' + u.location_country : '')) + '</td>'
            + '<td>' + (u.total_questions || 0) + '</td>'
            + '<td>' + formatDate(u.last_active) + '</td>'
            + '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        container.querySelectorAll('.clickable-row').forEach(function (row) {
          row.addEventListener('click', function () {
            openUserDetail(row.getAttribute('data-uid'));
          });
        });
      });
  }

  function openUserDetail(userId) {
    if (!supabase) return;

    document.getElementById('user-detail-name').textContent = userId.slice(0, 12) + '...';
    document.getElementById('user-detail').classList.add('visible');

    // Load user meta
    supabase.from('user_profiles').select('*').eq('user_id', userId).single()
      .then(function (r) {
        var u = r.data || {};
        document.getElementById('user-detail-meta').innerHTML =
          'Location: ' + esc((u.location_city || '?') + ', ' + (u.location_country || '?')) + '<br>'
          + 'Total Questions: ' + (u.total_questions || 0) + '<br>'
          + 'First Seen: ' + formatDate(u.first_seen) + '<br>'
          + 'Last Active: ' + formatDate(u.last_active);
      });

    // Load user questions
    supabase.from('questions')
      .select('question_text, response_text, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(function (r) {
        var container = document.getElementById('user-detail-questions');
        container.innerHTML = '';
        (r.data || []).forEach(function (q) {
          var div = document.createElement('div');
          div.className = 'escalated-item';
          div.innerHTML = '<div class="escalated-q">' + esc(q.question_text) + '</div>'
            + '<div class="escalated-meta">' + formatDate(q.created_at) + ' · '
            + '<span class="status-badge ' + q.status + '">' + q.status + '</span></div>';
          container.appendChild(div);
        });
      });
  }

  document.getElementById('user-detail-back').addEventListener('click', function () {
    document.getElementById('user-detail').classList.remove('visible');
  });

  document.getElementById('export-users').addEventListener('click', function () {
    window.open('/.netlify/functions/export?type=users&token=' + encodeURIComponent(adminPassword));
  });

  // ══════════════════════════════════
  // UPLOAD
  // ══════════════════════════════════
  var dropArea = document.getElementById('drop-area');
  var fileInput = document.getElementById('file-input');
  var uploadQueue = document.getElementById('upload-queue');

  dropArea.addEventListener('click', function () { fileInput.click(); });

  dropArea.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropArea.classList.add('dragover');
  });
  dropArea.addEventListener('dragleave', function () {
    dropArea.classList.remove('dragover');
  });
  dropArea.addEventListener('drop', function (e) {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', function () {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  function handleFiles(files) {
    Array.from(files).forEach(function (file) {
      uploadFile(file);
    });
  }

  function uploadFile(file) {
    // Add to queue UI
    var item = document.createElement('div');
    item.className = 'upload-item';
    item.innerHTML = '<span class="upload-name">' + esc(file.name) + '</span>'
      + '<span class="upload-status processing">Processing...</span>';
    uploadQueue.prepend(item);
    var statusEl = item.querySelector('.upload-status');

    // Read file as base64
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      fetch('/.netlify/functions/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminPassword
        },
        body: JSON.stringify({
          file: base64,
          filename: file.name,
          title: file.name.replace(/\.[^.]+$/, '')
        })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          statusEl.textContent = 'Done (' + data.chunks_created + ' chunks)';
          statusEl.className = 'upload-status done';
        } else {
          statusEl.textContent = 'Failed';
          statusEl.className = 'upload-status failed';
        }
      })
      .catch(function () {
        statusEl.textContent = 'Failed';
        statusEl.className = 'upload-status failed';
      });
    };
    reader.readAsDataURL(file);
  }

  // ══════════════════════════════════
  // KNOWLEDGE BASE (Ingestion)
  // ══════════════════════════════════
  function loadIngestion(typeFilter, statusFilter) {
    if (!supabase) return;

    var query = supabase.from('ingestion_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (typeFilter) query = query.eq('source_type', typeFilter);
    if (statusFilter) query = query.eq('status', statusFilter);

    query.then(function (r) {
      var items = r.data || [];

      // Update KB stats
      var totalItems = items.length;
      var processingCount = items.filter(function (i) { return i.status === 'processing' || i.status === 'pending'; }).length;
      var totalChunks = items.reduce(function (sum, i) { return sum + (i.chunks_created || 0); }, 0);

      setText('kb-total', totalItems);
      setText('kb-processing', processingCount);
      setText('kb-chunks-total', totalChunks);

      // Build table
      var container = document.getElementById('ingestion-log');
      var html = '<table class="data-table"><thead><tr>'
        + '<th>Source</th><th>Content</th><th>Status</th><th>Chunks</th><th>Date</th>'
        + '</tr></thead><tbody>';

      items.forEach(function (log) {
        var sourceLabel = formatSourceType(log.source_type);
        var contentLabel = log.source_url || log.source_type;
        // Make YouTube URLs clickable
        var contentHtml = log.source_url && log.source_url.startsWith('http')
          ? '<a href="' + esc(log.source_url) + '" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.5);text-decoration:none;">' + esc(truncateUrl(log.source_url)) + '</a>'
          : esc(contentLabel);

        html += '<tr>'
          + '<td><span class="source-icon ' + log.source_type + '"></span>' + esc(sourceLabel) + '</td>'
          + '<td class="truncate">' + contentHtml + '</td>'
          + '<td><span class="status-badge ' + log.status + '">' + log.status + '</span></td>'
          + '<td>' + (log.chunks_created || 0) + '</td>'
          + '<td>' + formatDate(log.created_at) + '</td>'
          + '</tr>';
      });

      html += '</tbody></table>';

      if (items.length === 0) {
        html = '<p style="color:rgba(255,255,255,0.3);font-size:0.85rem;padding:20px 0;">No items in the knowledge base yet. Upload files or run ingestion to get started.</p>';
      }

      container.innerHTML = html;
    });

    // Also load unfiltered totals for stats if filters are active
    if (typeFilter || statusFilter) {
      supabase.from('ingestion_log').select('status, chunks_created').then(function (r) {
        var all = r.data || [];
        setText('kb-total', all.length);
        setText('kb-processing', all.filter(function (i) { return i.status === 'processing' || i.status === 'pending'; }).length);
        setText('kb-chunks-total', all.reduce(function (sum, i) { return sum + (i.chunks_created || 0); }, 0));
      });
    }
  }

  function formatSourceType(type) {
    var labels = {
      'youtube': 'YouTube',
      'youtube-comments': 'YT Comments',
      'upload': 'Upload',
      'instagram': 'Instagram',
      'twitter': 'Twitter'
    };
    return labels[type] || type;
  }

  function truncateUrl(url) {
    // Show video title from YouTube URL or just the filename
    if (url.includes('youtube.com/watch')) return 'youtube.com/...' + url.slice(-11);
    if (url.length > 50) return url.slice(0, 47) + '...';
    return url;
  }

  // Filter listeners
  document.getElementById('kb-filter-type').addEventListener('change', function () {
    var statusVal = document.getElementById('kb-filter-status').value;
    loadIngestion(this.value || undefined, statusVal || undefined);
  });
  document.getElementById('kb-filter-status').addEventListener('change', function () {
    var typeVal = document.getElementById('kb-filter-type').value;
    loadIngestion(typeVal || undefined, this.value || undefined);
  });

  // Trigger manual ingestion
  document.getElementById('trigger-youtube').addEventListener('click', function () {
    this.textContent = 'Running...';
    this.disabled = true;
    var btn = this;
    fetch('/.netlify/functions/ingest-youtube', { method: 'POST' })
      .then(function () { btn.textContent = 'Done!'; loadIngestion(); })
      .catch(function () { btn.textContent = 'Failed'; })
      .finally(function () { btn.disabled = false; });
  });

  document.getElementById('trigger-social').addEventListener('click', function () {
    this.textContent = 'Running...';
    this.disabled = true;
    var btn = this;
    fetch('/.netlify/functions/ingest-social', { method: 'POST' })
      .then(function () { btn.textContent = 'Done!'; loadIngestion(); })
      .catch(function () { btn.textContent = 'Failed'; })
      .finally(function () { btn.disabled = false; });
  });

  // ══════════════════════════════════
  // HELPERS
  // ══════════════════════════════════
  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

})();
