(function () {
  if (window.__osLoaded) return;
  window.__osLoaded = true;

const api = window.api;
let currentProfile = null;
let profilesCache = [];
let appSettings = { darkMode: false, scale: 100 };

window.addEventListener('error', (e) => {
  console.error('RENDERER ERROR:', e.message, e.filename, e.lineno);
  const el = document.getElementById('log');
  if (el) { el.classList.remove('hidden'); el.textContent += '\n[ERROR] ' + e.message + ' @ ' + e.filename + ':' + e.lineno; }
});
console.log('=== OpenShare renderer v2 loaded ===');

window.addEventListener('unhandledrejection', (e) => {
  console.error('RENDERER PROMISE REJECTION:', e.reason);
  const el = document.getElementById('log');
  if (el) { el.classList.remove('hidden'); el.textContent += '\n[PROMISE ERROR] ' + (e.reason && e.reason.message ? e.reason.message : e.reason); }
});

function ask(title, placeholder) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal');
    const input = document.getElementById('modal-input');
    document.getElementById('modal-title').textContent = title;
    input.value = '';
    input.placeholder = placeholder || '';
    modal.classList.remove('hidden');
    input.focus();
    const ok = document.getElementById('modal-ok');
    const cancel = document.getElementById('modal-cancel');
    const done = (val) => {
      modal.classList.add('hidden');
      ok.onclick = null; cancel.onclick = null; input.onkeydown = null;
      resolve(val);
    };
    ok.onclick = () => done(input.value.trim());
    cancel.onclick = () => done(null);
    input.onkeydown = (ev) => { if (ev.key === 'Enter') done(input.value.trim()); if (ev.key === 'Escape') done(null); };
  });
}


const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function log(msg) {
  const el = $('#log');
  el.classList.remove('hidden');
  el.textContent += `\n${new Date().toLocaleTimeString()}  ${msg}`;
  el.scrollTop = el.scrollHeight;
}

/* ---------- settings: theme + scale ---------- */
function applySettings() {
  const root = document.documentElement;
  root.style.fontSize = appSettings.scale + '%';
  root.style.setProperty('--ui-scale', (appSettings.scale / 100).toFixed(3));
  document.body.classList.toggle('dark', appSettings.darkMode);
  const t = $('#dark-toggle');
  if (t) { t.textContent = appSettings.darkMode ? 'On' : 'Off'; t.classList.toggle('on', appSettings.darkMode); }
  const lbl = $('#scale-label');
  if (lbl) lbl.textContent = appSettings.scale + '%';
}

async function loadSettings() {
  try { appSettings = await api.getSettings(); } catch {}
  applySettings();
  const sl = $('#scale-slider');
  if (sl) sl.value = appSettings.scale;
}

/* ---------- view switching ---------- */
function switchView(view) {
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  if (view === 'schedule') renderSchedule();
  if (view === 'settings') refreshSettings();
}
$$('.nav-btn').forEach((b) => (b.onclick = () => switchView(b.dataset.view)));

/* ---------- profiles ---------- */
async function loadProfiles() {
  profilesCache = await api.getProfiles();
  if (profilesCache.length && !currentProfile) currentProfile = profilesCache[0].id;
  if (!profilesCache.length) currentProfile = null;
  refreshSelectors();
  renderProfileGrid();
}

function refreshSelectors() {
  const opts = profilesCache.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  $('#files-profile-select').innerHTML = opts;
  $('#files-profile-select').value = currentProfile || '';
  $('#settings-profile-select').innerHTML = opts;
  $('#settings-profile-select').value = currentProfile || '';
}

async function renderProfileGrid() {
  const grid = $('#profile-grid');
  if (!profilesCache.length) {
    grid.innerHTML = `<div class="empty">No profiles yet. Click <b>+ New Profile</b> to get started.</div>`;
    return;
  }
  grid.innerHTML = '';
  for (const p of profilesCache) {
    const files = await api.listFiles(p.id);
    const quota = await api.getQuota(p.id);
    const auth = p.auth || {};
    const dots = ['tiktok', 'youtube', 'instagram']
      .map((plat) => `<span class="dot ${auth[plat] ? 'on' : ''}" title="${plat}"></span>`).join('');
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <h3>${p.name}</h3>
      <div class="count">${files.length} file(s) · ${quota.used}/30 today</div>
      <div class="platform-dots">${dots}</div>
      <div class="row">
        <button data-act="open" data-id="${p.id}">Open Files</button>
        <button data-act="del" data-id="${p.id}" class="del">Delete</button>
      </div>`;
    grid.appendChild(card);
  }
  grid.querySelectorAll('button[data-act="open"]').forEach((b) => {
    b.onclick = () => { currentProfile = b.dataset.id; refreshSelectors(); switchView('files'); };
  });
  grid.querySelectorAll('button[data-act="del"]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this profile and all its videos?')) return;
      await api.deleteProfile(b.dataset.id);
      currentProfile = null;
      await loadProfiles();
    };
  });
}

$('#new-profile').onclick = async () => {
  const name = await ask('New Profile', 'Profile name');
  if (!name) return;
  await api.createProfile(name);
  await loadProfiles();
};

/* ---------- FILES ---------- */
async function renderFiles() {
  const grid = $('#file-grid');
  if (!currentProfile) { grid.innerHTML = `<div class="empty">Select or create a profile first (Home tab).</div>`; return; }
  const files = await api.listFiles(currentProfile);
  grid.innerHTML = '';
  if (!files.length) {
    grid.innerHTML = `<div class="empty">No files yet. Click <b>+ New File</b> to add a video.</div>`;
    return;
  }
  for (const f of files) {
    const card = document.createElement('div');
    card.className = 'card';
    const sched = f.scheduledAt ? `<div class="meta">Scheduled: ${new Date(f.scheduledAt).toLocaleString()}</div>` : '';
    const err = f.lastError ? `<div class="meta err">${f.lastError}</div>` : '';
    const platBtns = ['tiktok', 'youtube', 'instagram'].map((plat) => {
      const on = (f.platforms || []).includes(plat);
      return `<button class="plat ${on ? 'on' : ''}" data-plat="${plat}" data-file="${f.name}">${plat}</button>`;
    }).join('');
    const privOpts = ['public', 'unlisted', 'private'].map((p) =>
      `<option value="${p}" ${f.privacy === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
    ).join('');
    card.innerHTML = `
      <video src="file://${f.path}" controls muted></video>
      <div class="name">${f.name}</div>
      <span class="badge ${f.status}">${f.status}</span>
      ${sched}${err}
      <label class="field-label">Title</label>
      <input class="f-title" data-file="${f.name}" value="${escapeAttr(f.title || f.name.replace(/\.[^.]+$/, ''))}" />
      <label class="field-label">Description</label>
      <textarea class="f-desc" data-file="${f.name}" rows="2">${escapeHtml(f.desc || '')}</textarea>
      <div class="plat-row">${platBtns}</div>
      <div class="privacy-row">
        <span class="privacy-label">Privacy</span>
        <select class="privacy" data-file="${f.name}">${privOpts}</select>
      </div>
      <label class="kids-row"><input type="checkbox" class="kids" data-file="${f.name}" ${f.madeForKids ? 'checked' : ''} /> Made for Kids</label>
      <div class="actions">
        <input type="datetime-local" class="sched" value="${f.scheduledAt ? f.scheduledAt.slice(0, 16) : ''}" />
        <button class="meta-btn" data-act="savemeta" data-file="${f.name}">Save Title/Desc</button>
        <button class="reup-btn" data-act="reupload" data-file="${f.name}">Re-upload</button>
        <button class="sched-btn" data-act="schedule" data-file="${f.name}">Set date</button>
        <button data-act="delete" data-file="${f.name}">Delete</button>
      </div>`;
    grid.appendChild(card);
  }
  grid.querySelectorAll('button.sched-btn').forEach((b) => {
    b.onclick = async () => {
      const val = b.closest('.card').querySelector('.sched').value;
      await api.scheduleFile({ profileId: currentProfile, fileName: b.dataset.file, scheduledAt: val || null });
      renderFiles();
    };
  });
  grid.querySelectorAll('button[data-act="delete"]').forEach((b) => {
    b.onclick = async () => {
      const card = b.closest('.card');
      const vid = card && card.querySelector('video');
      if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); }
      await api.deleteFile({ profileId: currentProfile, fileName: b.dataset.file });
      renderFiles(); loadProfiles();
    };
  });
  grid.querySelectorAll('button[data-act="reupload"]').forEach((b) => {
    b.onclick = async () => {
      await api.resetFile({ profileId: currentProfile, fileName: b.dataset.file });
      log('Reset "' + b.dataset.file + '" to pending — it will upload on next run.');
      renderFiles();
    };
  });
  grid.querySelectorAll('button.plat').forEach((b) => {
    b.onclick = async () => {
      const file = files.find((x) => x.name === b.dataset.file);
      const cur = new Set(file.platforms || ['tiktok', 'youtube', 'instagram']);
      if (cur.has(b.dataset.plat)) cur.delete(b.dataset.plat); else cur.add(b.dataset.plat);
      await api.setFilePlatforms({ profileId: currentProfile, fileName: b.dataset.file, platforms: Array.from(cur) });
      renderFiles();
    };
  });
  grid.querySelectorAll('select.privacy').forEach((sel) => {
    sel.onchange = async () => {
      await api.setFilePrivacy({ profileId: currentProfile, fileName: sel.dataset.file, privacy: sel.value });
    };
  });
  grid.querySelectorAll('input.kids').forEach((cb) => {
    cb.onchange = async () => {
      await api.setFileKids({ profileId: currentProfile, fileName: cb.dataset.file, madeForKids: cb.checked });
    };
  });
  grid.querySelectorAll('button[data-act="savemeta"]').forEach((b) => {
    b.onclick = async () => {
      const card = b.closest('.card');
      const title = card.querySelector('.f-title').value.trim();
      const desc = card.querySelector('.f-desc').value;
      await api.renameFile({ profileId: currentProfile, fileName: b.dataset.file, newName: title, title, desc });
      renderFiles(); loadProfiles();
    };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

$('#files-profile-select').onchange = (e) => { currentProfile = e.target.value; renderFiles(); };

$('#new-file').onclick = async () => {
  if (!currentProfile) return alert('Create a profile first (Home tab).');
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'video/*'; input.multiple = true;
  input.onchange = () => addFiles(input.files);
  input.click();
};

async function addFiles(fileList) {
  if (!currentProfile) return alert('Create a profile first (Home tab).');
  const sched = ($('#schedule-input') && $('#schedule-input').value) || null;
  const files = Array.from(fileList).filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(f.name));
  if (!files.length) return;
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    await api.addFile({ profileId: currentProfile, fileName: file.name, buffer, scheduledAt: sched });
  }
  $('#schedule-input').value = '';
  renderFiles(); loadProfiles();
}

/* drag & drop zone */
const dz = $('#dropzone');
const dzInput = $('#file-input');
if (dz) {
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
  dzInput.addEventListener('change', () => addFiles(dzInput.files));
}

$('#run-daily').onclick = async () => {
  if (!currentProfile) return alert('Select a profile first.');
  log('Starting daily upload run...');
  const res = await api.runDaily(currentProfile);
  if (res.enqueued) log('Run queued. Uploads execute in the background.');
  else if (res.done) log('Stopped: ' + res.reason);
  else if (res.results) {
    log('Uploaded ' + res.uploaded + ' file(s).');
    if (res.skipped) log(res.skipped + ' file(s) skipped (already uploaded, scheduled later, or failed). Use "Re-upload" to retry failed ones.');
    res.results.forEach((r) => log('- ' + r.file + ': ' + JSON.stringify(r.perPlatform)));
  }
  hideProgress();
  renderFiles(); loadProfiles();
};

/* ---------- progress panel ---------- */
let progressRows = {};
function showProgress(files) {
  const panel = $('#progress-panel');
  panel.classList.remove('hidden');
  panel.innerHTML = `<h4>Uploading…</h4><div class="overall-bar"><div class="overall-fill" id="overall-fill"></div></div><div id="prog-rows"></div>`;
  progressRows = {};
  const rows = $('#prog-rows');
  files.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'prog-row';
    row.innerHTML = `<div class="prog-name"><span>${name}</span><span class="pct">0%</span></div><div class="prog-bar"><div class="prog-fill" data-name="${name}"></div></div>`;
    rows.appendChild(row);
    progressRows[name] = row.querySelector('.prog-fill');
  });
}
function updateProgress(name, pct, failed) {
  const fill = progressRows[name];
  if (!fill) return;
  fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (failed) fill.classList.add('fail');
  const pctEl = fill.closest('.prog-row').querySelector('.pct');
  if (pctEl) pctEl.textContent = failed ? 'failed' : pct + '%';
}
function setOverall(pct) {
  const o = $('#overall-fill');
  if (o) o.style.width = Math.max(0, Math.min(100, pct)) + '%';
}
function hideProgress() {
  const panel = $('#progress-panel');
  if (panel) panel.classList.add('hidden');
}
if (window.api && window.api.onProgress) {
  window.api.onProgress((data) => {
    if (data.type === 'start') showProgress(data.files);
    else if (data.type === 'file') updateProgress(data.file, data.pct, data.failed);
    else if (data.type === 'overall') setOverall(data.pct);
    else if (data.type === 'status') {
      const fill = progressRows[data.file];
      if (fill) {
        const pctEl = fill.closest('.prog-row').querySelector('.pct');
        if (pctEl) pctEl.textContent = data.msg + '…';
      }
    }
  });
}

/* ---------- SCHEDULE ---------- */
async function renderSchedule() {
  const grid = $('#schedule-grid');
  grid.innerHTML = '';
  for (const p of profilesCache) {
    const files = await api.listFiles(p.id);
    files.filter((f) => f.scheduledAt).forEach((f) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <video src="file://${f.path}" controls muted></video>
        <div class="name">${f.name}</div>
        <div class="meta">Profile: ${p.name}</div>
        <div class="meta">Upload on: ${new Date(f.scheduledAt).toLocaleString()}</div>
        <span class="badge ${f.status}">${f.status}</span>`;
      grid.appendChild(card);
    });
  }
  if (!grid.children.length) grid.innerHTML = `<div class="empty">Nothing scheduled yet.</div>`;
}

/* ---------- SETTINGS ---------- */
$('#settings-profile-select').onchange = (e) => { currentProfile = e.target.value; refreshSettings(); };

async function refreshSettings() {
  if (!currentProfile) { $('#quota-text').textContent = 'Select a profile to see quota.'; return; }
  const quota = await api.getQuota(currentProfile);
  $('#quota-text').textContent = `Daily quota: ${quota.used} / 30`;
  const profile = profilesCache.find((p) => p.id === currentProfile);
  const auth = profile ? profile.auth : {};
  const dd = $('#default-desc');
  if (dd) dd.value = (profile && profile.defaultDesc) || '';
  $$('.auth-buttons .acct').forEach((img) => img.remove());
  $$('.auth-buttons .disconnect').forEach((b) => b.remove());
  $$('.auth-buttons button').forEach((b) => {
    const plat = b.dataset.platform;
    const token = auth[plat];
    if (token && token.channel && token.channel.avatar) {
      const img = document.createElement('img');
      img.className = 'acct';
      img.src = token.channel.avatar;
      img.title = token.channel.name || plat;
      img.alt = plat + ' account';
      b.insertAdjacentElement('afterend', img);
    }
    if (token) {
      const dis = document.createElement('button');
      dis.className = 'disconnect';
      dis.textContent = 'Disconnect';
      dis.dataset.platform = plat;
      b.insertAdjacentElement('afterend', dis);
      dis.onclick = async () => {
        await api.disconnectPlatform({ profileId: currentProfile, platform: plat });
        loadProfiles(); refreshSettings();
      };
    }
  });
}

$('#dark-toggle').onclick = async () => {
  appSettings.darkMode = !appSettings.darkMode;
  applySettings();
  await api.saveSettings(appSettings);
};
let scaleTimer = null;
$('#scale-slider').oninput = () => {
  appSettings.scale = parseInt($('#scale-slider').value, 10);
  applySettings();
  clearTimeout(scaleTimer);
  scaleTimer = setTimeout(async () => {
    await api.saveSettings(appSettings);
  }, 300);
};
$('#scale-reset').onclick = async () => {
  appSettings.scale = 100;
  applySettings();
  const sl = $('#scale-slider');
  if (sl) sl.value = 100;
  await api.saveSettings(appSettings);
};

let descTimer = null;
$('#default-desc').oninput = () => {
  if (!currentProfile) return;
  clearTimeout(descTimer);
  const val = $('#default-desc').value;
  descTimer = setTimeout(async () => {
    await api.setProfileDesc({ profileId: currentProfile, defaultDesc: val });
    const p = profilesCache.find((x) => x.id === currentProfile);
    if (p) p.defaultDesc = val;
  }, 400);
};

$$('#auth-panel .auth-buttons button, .auth-buttons button').forEach((b) => {
  b.onclick = async () => {
    if (!currentProfile) return alert('Select a profile first.');
    const platform = b.dataset.platform;
    const secrets = await api.getSecrets();
    const existing = secrets[platform] || {};
    const cred = await askCredentials(platform, existing);
    if (!cred) return;
    secrets[platform] = { clientId: cred.id, clientSecret: cred.secret };
    await api.saveSecrets(secrets);
    log('Authenticating ' + platform + '...');
    try {
      await api.authPlatform({ profileId: currentProfile, platform });
      log(platform + ' authenticated.');
      loadProfiles(); refreshSettings();
    } catch (e) {
      log('Auth error (' + platform + '): ' + e.message);
    }
  };
});

const CRED_HELP = {
  tiktok: 'Get Client Key + Secret from developers.tiktok.com. Set redirect URI to http://localhost:18923/callback',
  youtube: 'Get Client ID + Secret from Google Cloud Console (YouTube Data API v3). Redirect URI: http://localhost:18923/callback',
  instagram: 'Get App ID + App Secret from developers.facebook.com (Instagram Graph). Redirect URI: http://localhost:18923/callback',
};

function askCredentials(platform, existing) {
  return new Promise((resolve) => {
    const modal = document.getElementById('cred-modal');
    document.getElementById('cred-title').textContent = 'Connect ' + platform.charAt(0).toUpperCase() + platform.slice(1);
    document.getElementById('cred-help').textContent = CRED_HELP[platform] || '';
    const idEl = document.getElementById('cred-id');
    const secEl = document.getElementById('cred-secret');
    idEl.value = existing.clientId || '';
    secEl.value = existing.clientSecret || '';
    modal.classList.remove('hidden');
    idEl.focus();
    const ok = document.getElementById('cred-save');
    const cancel = document.getElementById('cred-cancel');
    const done = (val) => {
      modal.classList.add('hidden');
      ok.onclick = null; cancel.onclick = null; idEl.onkeydown = null; secEl.onkeydown = null;
      resolve(val);
    };
    const submit = () => {
      if (!idEl.value.trim() || !secEl.value.trim()) { alert('Both fields are required.'); return; }
      done({ id: idEl.value.trim(), secret: secEl.value.trim() });
    };
    ok.onclick = submit;
    cancel.onclick = () => done(null);
    idEl.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); if (ev.key === 'Escape') done(null); };
    secEl.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); if (ev.key === 'Escape') done(null); };
  });
}

/* ---------- init ---------- */
(async () => {
  await loadSettings();
  await loadProfiles();
  switchView('home');
  renderFiles();
})();

})();
