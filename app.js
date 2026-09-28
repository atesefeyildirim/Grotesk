/* ===================================================
   GROTESK — APP.JS  v2
   =================================================== */

/* ---------- GİRİŞ ---------- */
const CREDS = { user: 'ateş', pass: '123' };

document.getElementById('login-form').addEventListener('submit', e => {
  e.preventDefault();
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  if (u === CREDS.user && p === CREDS.pass) {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-site').classList.remove('hidden');
    renderAll();
  } else {
    document.getElementById('login-error').textContent = 'Hatalı isim veya şifre.';
  }
});

/* ---------- VERİ ---------- */
let entries = [];
try { entries = JSON.parse(localStorage.getItem('grotesk_v2') || 'null') || []; } catch { entries = []; }

/* İlk açılışta demo verisini yükle */
if (entries.length === 0) {
  entries = [...DEMO_ENTRIES];
  save();
}
function save() { localStorage.setItem('grotesk_v2', JSON.stringify(entries)); }

const CATS = ['metinler','muzik','resim','fotograf','sinema','performans'];
const CAT_LABEL = { metinler:'Metinler', muzik:'Müzik', resim:'Resim', fotograf:'Fotoğraf', sinema:'Sinema', performans:'Performans' };

/* ---------- PANEL NAV ---------- */
const panelLinks = document.querySelectorAll('.panel-link');
const panels     = document.querySelectorAll('.panel');

function activatePanel(name) {
  panelLinks.forEach(l => l.classList.toggle('active', l.dataset.panel === name));
  panels.forEach(p     => p.classList.toggle('active', p.id === `panel-${name}`));
  renderAll();
}

panelLinks.forEach(l => l.addEventListener('click', e => {
  e.preventDefault(); activatePanel(l.dataset.panel);
}));

/* ---------- ADD BUTTONS ---------- */
document.querySelectorAll('.add-btn[data-cat]').forEach(btn => {
  btn.addEventListener('click', () => openAddModal(btn.dataset.cat));
});

/* ---------- ARAMA ---------- */
document.getElementById('search-input').addEventListener('input', renderAll);

function q() { return document.getElementById('search-input').value.trim().toLowerCase(); }
function matches(entry) {
  const sq = q();
  if (!sq) return true;
  return `${entry.title} ${entry.comment} ${CAT_LABEL[entry.category]}`.toLowerCase().includes(sq);
}

/* ---------- RENDER ---------- */
function renderAll() {
  renderList('home-entries', [...entries].reverse(), true);
  CATS.forEach(cat => {
    renderList(`${cat}-entries`, [...entries].filter(e => e.category === cat).reverse(), false);
  });
}

function renderList(containerId, list, showCat) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const filtered = list.filter(matches);
  if (!filtered.length) { el.innerHTML = '<div class="empty">—</div>'; return; }
  el.innerHTML = '';
  filtered.forEach(entry => el.appendChild(buildCard(entry, showCat)));
}

function buildCard(entry, showCat) {
  const card = document.createElement('div');
  card.className = 'entry-card' + (entry.isHidden ? ' entry-hidden' : '');

  /* Thumb */
  const thumb = document.createElement('div');
  thumb.className = 'entry-thumb';
  if (entry.fileDataUrl && isImg(entry.fileType)) {
    const img = document.createElement('img');
    img.src = entry.fileDataUrl; img.alt = entry.title;
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = `<div class="thumb-logo">Grotesk</div>`;
  }

  /* Meta */
  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  if (showCat) meta.innerHTML += `<div class="entry-cat">${CAT_LABEL[entry.category]}</div>`;
  meta.innerHTML += `<div class="entry-title">${esc(entry.title.length > 40 ? entry.title.slice(0, 40) + '…' : entry.title)}</div>`;
  if (entry.isOwnText) meta.innerHTML += `<div class="entry-own">Bu metin bana ait</div>`;
  if (entry.comment)   meta.innerHTML += `<div class="entry-preview">${esc(entry.comment.length > 40 ? entry.comment.slice(0, 40) + '…' : entry.comment)}</div>`;
  meta.innerHTML += `<div class="entry-date">${fmtDate(entry.date)}</div>`;

  /* Aksiyonlar */
  const acts = document.createElement('div');
  acts.className = 'entry-actions';
  acts.innerHTML = `
    <button class="act-btn" data-action="edit">Düzenle</button>
    <button class="act-btn" data-action="hide">${entry.isHidden ? 'Göster' : 'Gizle'}</button>
    <button class="act-btn" data-action="del">Sil</button>
  `;
  acts.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    if (b.dataset.action === 'edit') openEditModal(entry.id);
    if (b.dataset.action === 'hide') { toggleHide(entry.id); }
    if (b.dataset.action === 'del')  { deleteEntry(entry.id); }
  }));

  card.addEventListener('click', () => openViewModal(entry.id));
  card.appendChild(thumb);
  card.appendChild(meta);
  card.appendChild(acts);
  return card;
}

/* ---------- ADD MODAL ---------- */
let pendingFile = { dataUrl: null, type: null, name: null };
let activeCat   = 'metinler';
let editingId   = null;

const addModal = document.getElementById('add-modal');
document.getElementById('close-add-modal').addEventListener('click', () => addModal.classList.add('hidden'));
addModal.addEventListener('click', e => { if (e.target === addModal) addModal.classList.add('hidden'); });

/* Kategori butonları */
document.getElementById('cat-select-group').addEventListener('click', e => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeCat = btn.dataset.cat;
  updateOwnVisibility();
});

function updateOwnVisibility() {
  const row = document.getElementById('own-text-row');
  row.style.display = activeCat === 'metinler' ? '' : 'none';
  document.getElementById('comment-lbl').innerHTML =
    activeCat === 'metinler' && document.getElementById('is-own-text').checked
      ? 'Metin İçeriği <span class="mf-sub">karakter sınırı yok</span>'
      : 'İnceleme / Yorum <span class="mf-sub">isteğe bağlı — karakter sınırı yok</span>';
}

document.getElementById('is-own-text').addEventListener('change', updateOwnVisibility);

function openAddModal(defaultCat) {
  activeCat = defaultCat || 'metinler';
  document.querySelectorAll('.cat-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.cat === activeCat));
  document.getElementById('entry-title').value   = '';
  document.getElementById('entry-comment').value  = '';
  document.getElementById('entry-hidden').checked = false;
  document.getElementById('is-own-text').checked  = false;
  document.getElementById('entry-file').value     = '';
  document.getElementById('file-preview').innerHTML = '';
  pendingFile = { dataUrl: null, type: null, name: null };
  updateOwnVisibility();
  addModal.classList.remove('hidden');
}

/* Dosya seçimi */
document.getElementById('entry-file').addEventListener('change', function() {
  const file = this.files[0]; if (!file) return;
  pendingFile.type = file.type;
  pendingFile.name = file.name;
  const reader = new FileReader();
  reader.onload = ev => {
    pendingFile.dataUrl = ev.target.result;
    const prev = document.getElementById('file-preview');
    if (isImg(file.type)) {
      prev.innerHTML = `<img src="${pendingFile.dataUrl}" alt="önizleme" />`;
    } else {
      prev.innerHTML = `<div class="fname">📄 ${esc(file.name)}</div>`;
    }
  };
  reader.readAsDataURL(file);
});

/* Ekle */
document.getElementById('submit-entry').addEventListener('click', () => {
  const title   = document.getElementById('entry-title').value.trim();
  const comment = document.getElementById('entry-comment').value.trim();
  const hidden  = document.getElementById('entry-hidden').checked;
  const isOwn   = activeCat === 'metinler' && document.getElementById('is-own-text').checked;

  if (!title && !comment && !pendingFile.dataUrl) return;

  const entry = {
    id:          Date.now().toString(),
    category:    activeCat,
    title:       title || pendingFile.name || '(başlıksız)',
    comment,
    isOwnText:   isOwn,
    isHidden:    hidden,
    fileDataUrl: pendingFile.dataUrl,
    fileType:    pendingFile.type,
    fileName:    pendingFile.name,
    date:        new Date().toISOString()
  };

  entries.push(entry);
  save();
  addModal.classList.add('hidden');
  renderAll();
});

/* ---------- VIEW MODAL ---------- */
const viewModal = document.getElementById('view-modal');
document.getElementById('close-view-modal').addEventListener('click', () => viewModal.classList.add('hidden'));
viewModal.addEventListener('click', e => { if (e.target === viewModal) viewModal.classList.add('hidden'); });

function openViewModal(id) {
  const entry = entries.find(e => e.id === id); if (!entry) return;

  let html = `<div class="view-cat">${CAT_LABEL[entry.category]}</div>`;
  html += `<div class="view-ttl">${esc(entry.title)}</div>`;
  if (entry.isOwnText) html += `<div class="view-own">Bu metin bana ait</div>`;
  if (entry.fileDataUrl) {
    html += `<div class="view-file">`;
    if (isImg(entry.fileType)) html += `<img src="${entry.fileDataUrl}" alt="${esc(entry.title)}" />`;
    else html += `<a href="${entry.fileDataUrl}" download="${esc(entry.fileName||'dosya')}">📄 ${esc(entry.fileName||'Dosyayı indir')}</a>`;
    html += `</div>`;
  }
  if (entry.comment) html += `<div class="view-text">${esc(entry.comment)}</div>`;
  document.getElementById('view-body').innerHTML = html;

  const acts = document.getElementById('view-actions');
  acts.innerHTML = '';
  [['Düzenle', () => { viewModal.classList.add('hidden'); openEditModal(id); }],
   [entry.isHidden ? 'Göster' : 'Gizle', () => { toggleHide(id); viewModal.classList.add('hidden'); }],
   ['Sil', () => { deleteEntry(id); viewModal.classList.add('hidden'); }]
  ].forEach(([label, fn]) => {
    const btn = document.createElement('button');
    btn.className = 'add-btn'; btn.textContent = label;
    btn.addEventListener('click', fn); acts.appendChild(btn);
  });

  viewModal.classList.remove('hidden');
}

/* ---------- EDIT MODAL ---------- */
const editModal = document.getElementById('edit-modal');
document.getElementById('close-edit-modal').addEventListener('click', () => editModal.classList.add('hidden'));
editModal.addEventListener('click', e => { if (e.target === editModal) editModal.classList.add('hidden'); });

function openEditModal(id) {
  const entry = entries.find(e => e.id === id); if (!entry) return;
  editingId = id;
  document.getElementById('edit-title').value   = entry.title || '';
  document.getElementById('edit-comment').value  = entry.comment || '';
  document.getElementById('edit-hidden').checked = !!entry.isHidden;
  document.getElementById('edit-own').checked    = !!entry.isOwnText;
  document.getElementById('edit-own-row').style.display = entry.category === 'metinler' ? '' : 'none';
  editModal.classList.remove('hidden');
}

document.getElementById('submit-edit').addEventListener('click', () => {
  const entry = entries.find(e => e.id === editingId); if (!entry) return;
  entry.title     = document.getElementById('edit-title').value.trim()   || entry.title;
  entry.comment   = document.getElementById('edit-comment').value.trim();
  entry.isHidden  = document.getElementById('edit-hidden').checked;
  entry.isOwnText = entry.category === 'metinler' ? document.getElementById('edit-own').checked : false;
  save();
  editModal.classList.add('hidden');
  renderAll();
});

/* ---------- HIDE / DELETE ---------- */
function toggleHide(id) {
  const entry = entries.find(e => e.id === id); if (!entry) return;
  entry.isHidden = !entry.isHidden; save(); renderAll();
}
function deleteEntry(id) {
  if (!confirm('Bu içeriği silmek istediğinizden emin misiniz?')) return;
  entries = entries.filter(e => e.id !== id); save(); renderAll();
}

/* ---------- YARDIMCI ---------- */
function isImg(t) { return t && t.startsWith('image/'); }
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' });
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
