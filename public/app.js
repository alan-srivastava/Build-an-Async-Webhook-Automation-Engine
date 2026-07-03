const state = { tenantSlug: null, activeTab: 'jobs' };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(state.tenantSlug ? { 'x-tenant-id': state.tenantSlug } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function badge(status) {
  return `<span class="badge ${status}">${status}</span>`;
}

function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString();
}

async function loadTenants() {
  const tenants = await api('/tenants');
  const select = document.getElementById('tenant-select');
  select.innerHTML = tenants
    .map((t) => `<option value="${t.slug}">${t.name} (${t.slug})</option>`)
    .join('');
  if (tenants.length) {
    state.tenantSlug = tenants[0].slug;
  }
  select.addEventListener('change', (e) => {
    state.tenantSlug = e.target.value;
    refreshActiveTab();
  });
}

function showDetail(obj) {
  document.getElementById('modal-body').textContent = JSON.stringify(obj, null, 2);
  document.getElementById('detail-modal').classList.remove('hidden');
}

async function renderJobs() {
  const jobs = await api('/jobs');
  const body = document.getElementById('jobs-body');
  body.innerHTML = jobs
    .map((j) => {
      const rulesMatched = (j.ruleResults || []).length;
      const canReplay = j.status === 'failed';
      return `<tr>
        <td>${badge(j.status)}</td>
        <td>${j.eventType}</td>
        <td>${j.source}</td>
        <td>${j.attempts}</td>
        <td>${rulesMatched}</td>
        <td>${j.error ? `<span title="${escapeHtml(j.error)}">${escapeHtml(j.error).slice(0, 40)}...</span>` : '-'}</td>
        <td>${fmtTime(j.updatedAt)}</td>
        <td>
          <button class="replay" data-id="${j._id}" ${canReplay ? '' : 'disabled'}>Replay</button>
          <button class="replay" data-detail="${j._id}" style="margin-left:4px;background:#1f2937;color:#cbd5e1;">Detail</button>
        </td>
      </tr>`;
    })
    .join('');

  body.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Replaying...';
      try {
        await api(`/jobs/${btn.dataset.id}/replay`, { method: 'POST' });
        await renderJobs();
      } catch (e) {
        alert('Replay failed: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Replay';
      }
    });
  });

  body.querySelectorAll('button[data-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const job = jobs.find((j) => j._id === btn.dataset.detail);
      showDetail(job);
    });
  });
}

async function renderEvents() {
  const events = await api('/events');
  const body = document.getElementById('events-body');
  body.innerHTML = events
    .map(
      (e) => `<tr>
        <td>${badge(e.status)}</td>
        <td>${e.source}</td>
        <td>${e.eventType}</td>
        <td>${e.externalEventId}</td>
        <td>${fmtTime(e.receivedAt)}</td>
      </tr>`,
    )
    .join('');
}

async function renderRules() {
  const rules = await api('/rules');
  const body = document.getElementById('rules-body');
  body.innerHTML = rules
    .map(
      (r) => `<tr>
        <td>${r.active ? '✅' : '⛔'}</td>
        <td>${r.name}</td>
        <td>${r.source}</td>
        <td>${r.eventType}</td>
        <td>${(r.conditions || []).map((c) => `${c.field} ${c.operator} ${JSON.stringify(c.value)}`).join('<br/>')}</td>
        <td>${(r.actions || []).map((a) => a.type).join(', ')}</td>
      </tr>`,
    )
    .join('');
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function refreshActiveTab() {
  try {
    if (state.activeTab === 'jobs') await renderJobs();
    if (state.activeTab === 'events') await renderEvents();
    if (state.activeTab === 'rules') await renderRules();
  } catch (e) {
    console.error(e);
  }
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      state.activeTab = btn.dataset.tab;
      refreshActiveTab();
    });
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
  });
}

async function init() {
  setupTabs();
  await loadTenants();
  await refreshActiveTab();
  setInterval(refreshActiveTab, 2000);
}

init();
