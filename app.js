import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Firebase Yapılandırması
const firebaseConfig = {
  apiKey: "AIzaSyDlPjfrhjpd5QlX9hNEJreH1D7OETGWFNU",
  authDomain: "grotesk-48280.firebaseapp.com",
  projectId: "grotesk-48280",
  storageBucket: "grotesk-48280.firebasestorage.app",
  messagingSenderId: "627010342156",
  appId: "1:627010342156:web:e15f12c06a950026230d29",
  measurementId: "G-Z8W4MXLF65"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const COLLECTION_NAME = "grotesk_entries";
const STORAGE_FOLDER = "grotesk_uploads";

/* ===================================================
   GÜVENLİK & ŞİFRE (SHA-256 HASH)
   Inspect yapıldığında şifre kaynak kodda görünmez.
   =================================================== */
const AUTH_HASH = "9d06ac0aeaba527e1e3684820ea7c172f9d6ef645d0d8a249dfbd1ef4c8236ba";

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ===================================================
   KADEMELİ BEKLEME (BRUTE FORCE KORUMASI)
   5 yanlış: 5 dk -> 5 yanlış daha: 15 dk -> sonraki her 5 yanlışta: 30 dk
   =================================================== */
let lockState = {
  failedCount: 0,
  penaltyLevel: 0,
  lockUntil: 0
};

try {
  const saved = localStorage.getItem("grotesk_lock_state");
  if (saved) lockState = Object.assign(lockState, JSON.parse(saved));
} catch {
  // varsayılan state
}

function saveLockState() {
  localStorage.setItem("grotesk_lock_state", JSON.stringify(lockState));
}

let lockTimerInterval = null;

function checkLockStatus() {
  const now = Date.now();
  const btnAuthor = document.getElementById("btn-author-login");
  const loginError = document.getElementById("login-error");

  if (lockState.lockUntil && now < lockState.lockUntil) {
    if (btnAuthor) btnAuthor.disabled = true;

    if (!lockTimerInterval) {
      lockTimerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((lockState.lockUntil - Date.now()) / 1000));
        if (remaining <= 0) {
          clearInterval(lockTimerInterval);
          lockTimerInterval = null;
          lockState.lockUntil = 0;
          saveLockState();
          if (btnAuthor) btnAuthor.disabled = false;
          if (loginError) loginError.innerText = "";
        } else {
          const m = Math.floor(remaining / 60);
          const s = remaining % 60;
          const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
          if (loginError) {
            loginError.innerText = `Çok fazla hatalı deneme. Lütfen bekleyin: ${timeStr}`;
          }
        }
      }, 1000);
    }
    return true;
  } else {
    if (lockTimerInterval) {
      clearInterval(lockTimerInterval);
      lockTimerInterval = null;
    }
    lockState.lockUntil = 0;
    saveLockState();
    if (btnAuthor) btnAuthor.disabled = false;
    return false;
  }
}

/* ===================================================
   ROL VE GİRİŞ YÖNETİMİ
   =================================================== */
let currentRole = localStorage.getItem("grotesk_role") || "";

const loginPage = document.getElementById("login-page");
const mainSite = document.getElementById("main-site");
const loginForm = document.getElementById("login-form");
const loginPass = document.getElementById("login-pass");
const loginError = document.getElementById("login-error");
const btnReader = document.getElementById("btn-reader-login");
const logoutBtn = document.getElementById("logout-btn");
const roleBadge = document.getElementById("role-badge");

checkLockStatus();

if (currentRole) {
  showMainSite(currentRole);
}

// Yazar Girişi (Şifreli)
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (checkLockStatus()) return;

    const pass = loginPass?.value || "";
    if (!pass) {
      if (loginError) loginError.innerText = "Lütfen şifre girin.";
      return;
    }

    const hash = await sha256(pass);

    if (hash === AUTH_HASH) {
      // Başarılı giriş - Kilit durumunu sıfırla
      lockState.failedCount = 0;
      lockState.penaltyLevel = 0;
      lockState.lockUntil = 0;
      saveLockState();

      currentRole = "author";
      localStorage.setItem("grotesk_role", currentRole);
      if (loginPass) loginPass.value = "";
      if (loginError) loginError.innerText = "";
      showMainSite(currentRole);
    } else {
      // Hatalı giriş
      lockState.failedCount++;
      const left = 5 - lockState.failedCount;

      if (lockState.failedCount >= 5) {
        lockState.failedCount = 0;
        lockState.penaltyLevel++;

        // Kademeli ceza süresi
        let cooldownMinutes = 30;
        if (lockState.penaltyLevel === 1) cooldownMinutes = 5;
        else if (lockState.penaltyLevel === 2) cooldownMinutes = 15;

        lockState.lockUntil = Date.now() + (cooldownMinutes * 60 * 1000);
        saveLockState();
        checkLockStatus();
      } else {
        saveLockState();
        if (loginError) {
          loginError.innerText = `Hatalı şifre. (${left} hakkınız kaldı)`;
        }
      }
    }
  });
}

// Okuyucu Girişi (Şifresiz)
if (btnReader) {
  btnReader.addEventListener("click", () => {
    currentRole = "reader";
    localStorage.setItem("grotesk_role", currentRole);
    if (loginPass) loginPass.value = "";
    if (loginError) loginError.innerText = "";
    showMainSite(currentRole);
  });
}

// Çıkış Yap
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    currentRole = "";
    localStorage.removeItem("grotesk_role");
    document.body.classList.remove("role-author", "role-reader");
    if (mainSite) mainSite.classList.add("hidden");
    if (loginPage) loginPage.classList.remove("hidden");
    checkLockStatus();
  });
}

function showMainSite(role) {
  if (loginPage) loginPage.classList.add("hidden");
  if (mainSite) mainSite.classList.remove("hidden");

  document.body.classList.remove("role-author", "role-reader");
  document.body.classList.add(`role-${role}`);

  if (roleBadge) {
    roleBadge.innerText = role === "author" ? "Yazar Modu" : "Okuyucu Modu";
  }
}

/* ===================================================
   PANEL GEÇİŞLERİ
   =================================================== */
const panelLinks = document.querySelectorAll(".panel-link");
const panels = document.querySelectorAll(".panel");

panelLinks.forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetPanel = link.dataset.panel;

    panelLinks.forEach(l => l.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));

    link.classList.add("active");
    const activePanelEl = document.getElementById(`panel-${targetPanel}`);
    if (activePanelEl) activePanelEl.classList.add("active");
  });
});

/* ===================================================
   İÇERİK EKLEME MODALI & KATEGORİLER
   =================================================== */
const addModal = document.getElementById("add-modal");
const closeAddModalBtn = document.getElementById("close-add-modal");
const addBtns = document.querySelectorAll(".add-btn");
const catBtns = document.querySelectorAll("#cat-select-group .cat-btn");

let selectedCategory = "metinler";

addBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (currentRole !== "author") return; // Sadece yazar ekleyebilir
    const cat = btn.dataset.cat || "metinler";
    setSelectedCategory(cat);
    if (addModal) addModal.classList.remove("hidden");
  });
});

if (closeAddModalBtn) {
  closeAddModalBtn.addEventListener("click", () => {
    if (addModal) addModal.classList.add("hidden");
  });
}

if (addModal) {
  addModal.addEventListener("click", (e) => {
    if (e.target === addModal) addModal.classList.add("hidden");
  });
}

catBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    setSelectedCategory(btn.dataset.cat);
  });
});

function setSelectedCategory(cat) {
  selectedCategory = cat;
  catBtns.forEach(b => {
    if (b.dataset.cat === cat) b.classList.add("active");
    else b.classList.remove("active");
  });

  const ownRow = document.getElementById("own-text-row");
  if (ownRow) {
    ownRow.style.display = (cat === "metinler") ? "" : "none";
  }
}

// Dosya seçimi önizleme
const fileInput = document.getElementById("entry-file");
const filePreview = document.getElementById("file-preview");

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!filePreview) return;

    if (file) {
      filePreview.innerHTML = `<span style="font-size:0.8rem; color:#aaa;">Seçilen Dosya: ${escapeHtml(file.name)}</span>`;
    } else {
      filePreview.innerHTML = "";
    }
  });
}

/* ===================================================
   İÇERİK KAYDETME (FIRESTORE)
   =================================================== */
const submitBtn = document.getElementById("submit-entry");
const titleInput = document.getElementById("entry-title");
const commentInput = document.getElementById("entry-comment");
const authorInput = document.getElementById("entry-author");
const isOwnCheck = document.getElementById("is-own-text");
const isHiddenCheck = document.getElementById("entry-hidden");

if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    if (currentRole !== "author") {
      alert("Okuyucu modunda içerik eklenemez.");
      return;
    }

    const title = titleInput?.value.trim() || "";
    const comment = commentInput?.value.trim() || "";
    const authorName = authorInput?.value.trim() || "Grotesk Yazarı";
    const isOwn = isOwnCheck?.checked || false;
    const isHidden = isHiddenCheck?.checked || false;
    const file = fileInput?.files[0];

    if (!title && !comment && !file) {
      alert("Lütfen en azından bir başlık, metin veya dosya seçin.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "YÜKLENİYOR...";

    try {
      let fileUrl = "";
      let fileName = "";

      if (file) {
        fileName = file.name;
        const fileRef = ref(storage, `${STORAGE_FOLDER}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        fileUrl = await getDownloadURL(snapshot.ref);
      }

      await addDoc(collection(db, COLLECTION_NAME), {
        title: title || "Başlıksız",
        comment: comment || "",
        category: selectedCategory,
        authorName: authorName,
        isOwn: isOwn,
        isHidden: isHidden,
        fileUrl: fileUrl,
        fileName: fileName,
        createdAt: serverTimestamp()
      });

      // Temizleme
      if (titleInput) titleInput.value = "";
      if (commentInput) commentInput.value = "";
      if (authorInput) authorInput.value = "";
      if (fileInput) fileInput.value = "";
      if (filePreview) filePreview.innerHTML = "";
      if (isOwnCheck) isOwnCheck.checked = false;
      if (isHiddenCheck) isHiddenCheck.checked = false;

      if (addModal) addModal.classList.add("hidden");

    } catch (err) {
      console.error("Firebase Yükleme Hatası:", err);
      alert("Yükleme sırasında hata oluştu: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Ekle";
    }
  });
}

/* ===================================================
   VERİLERİ DİNLEME VE LİSTELEME
   =================================================== */
let allEntries = [];

function listenEntries() {
  const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    allEntries = [];
    snapshot.forEach(docSnap => {
      allEntries.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAllEntries();
  }, (err) => {
    console.error("Firestore Dinleme Hatası:", err);
  });
}

// Arama kutusu dinleme
const searchInput = document.getElementById("search-input");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderAllEntries();
  });
}

function renderAllEntries() {
  const searchTerm = searchInput?.value.trim().toLowerCase() || "";
  const categories = ["home", "metinler", "muzik", "resim", "fotograf", "sinema", "performans"];

  // Konteynerları temizle
  categories.forEach(cat => {
    const el = document.getElementById(`${cat}-entries`);
    if (el) el.innerHTML = "";
  });

  const filtered = allEntries.filter(item => {
    // Gizli olanları okuyuculardan gizle
    if (item.isHidden && currentRole === "reader") return false;

    if (!searchTerm) return true;
    const t = (item.title || "").toLowerCase();
    const c = (item.comment || "").toLowerCase();
    const a = (item.authorName || item.author || "").toLowerCase();
    const cat = (item.category || "").toLowerCase();
    return t.includes(searchTerm) || c.includes(searchTerm) || a.includes(searchTerm) || cat.includes(searchTerm);
  });

  const counts = {};
  categories.forEach(c => counts[c] = 0);

  filtered.forEach(item => {
    // Kendi kategorisine ekle
    const targetCatContainer = document.getElementById(`${item.category}-entries`);
    if (targetCatContainer) {
      targetCatContainer.appendChild(createCard(item));
      counts[item.category] = (counts[item.category] || 0) + 1;
    }

    // Anasayfaya ekle
    const homeContainer = document.getElementById("home-entries");
    if (homeContainer) {
      homeContainer.appendChild(createCard(item));
      counts["home"] = (counts["home"] || 0) + 1;
    }
  });

  // Boş durum mesajları
  categories.forEach(cat => {
    const el = document.getElementById(`${cat}-entries`);
    if (el && counts[cat] === 0) {
      el.innerHTML = '<div class="empty">— Henüz içerik yok —</div>';
    }
  });
}

/* ===================================================
   KART OLUŞTURMA (40 KARAKTER SINIRI)
   =================================================== */
function createCard(data) {
  const card = document.createElement("div");
  card.className = "entry-card" + (data.isHidden ? " entry-hidden" : "");

  let dateStr = "Şimdi";
  if (data.createdAt && data.createdAt.seconds) {
    dateStr = new Date(data.createdAt.seconds * 1000).toLocaleDateString("tr-TR", {
      day: "2-digit", month: "long", year: "numeric"
    });
  }

  const isImage = data.fileUrl && (
    data.fileUrl.includes(".png") || 
    data.fileUrl.includes(".jpg") || 
    data.fileUrl.includes(".jpeg") || 
    data.fileUrl.includes(".webp") ||
    data.fileUrl.includes(".gif")
  );

  // 40 Karakter Kısıtları
  const rawTitle = data.title || "Başlıksız";
  const displayTitle = rawTitle.length > 40 ? rawTitle.slice(0, 40) + "…" : rawTitle;

  const rawComment = data.comment || "";
  const displayComment = rawComment.length > 40 ? rawComment.slice(0, 40) + "…" : rawComment;

  const authorDisp = data.authorName || data.author || "Grotesk Yazarı";

  card.innerHTML = `
    <div class="entry-thumb">
      ${isImage 
        ? `<img src="${data.fileUrl}" alt="${escapeHtml(rawTitle)}">` 
        : `<div class="thumb-logo">GROTESK</div>`}
    </div>
    <div class="entry-meta">
      <div class="entry-cat">${(data.category || "GENEL").toUpperCase()} ${data.isOwn ? '• (Özgün)' : ''}</div>
      <div class="entry-title">${escapeHtml(displayTitle)}</div>
      <div class="entry-own">${escapeHtml(authorDisp)}</div>
      ${displayComment ? `<div class="entry-preview">${escapeHtml(displayComment)}</div>` : ''}
      <div class="entry-date">${dateStr}</div>
    </div>
  `;

  // Sadece yazar ise aksiyon butonları
  if (currentRole === "author") {
    const acts = document.createElement("div");
    acts.className = "entry-actions";
    acts.innerHTML = `
      <button class="act-btn" data-act="edit">Düzenle</button>
      <button class="act-btn" data-act="hide">${data.isHidden ? "Göster" : "Gizle"}</button>
      <button class="act-btn" data-act="del">Sil</button>
    `;

    acts.querySelector('[data-act="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(data);
    });

    acts.querySelector('[data-act="hide"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await updateDoc(doc(db, COLLECTION_NAME, data.id), { isHidden: !data.isHidden });
      } catch (err) {
        console.error("Gizleme hatası:", err);
      }
    });

    acts.querySelector('[data-act="del"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;
      try {
        await deleteDoc(doc(db, COLLECTION_NAME, data.id));
      } catch (err) {
        console.error("Silme hatası:", err);
      }
    });

    card.appendChild(acts);
  }

  card.addEventListener("click", () => openViewModal(data));

  return card;
}

/* ===================================================
   DETAY / OKUMA MODALI (KÜÇÜK OKUMA KISMI)
   Sağ alt köşede kutu (box) içinde yazar adı gösterilir.
   =================================================== */
const viewModal = document.getElementById("view-modal");
const closeViewModalBtn = document.getElementById("close-view-modal");
const viewBody = document.getElementById("view-body");
const viewActions = document.getElementById("view-actions");

if (closeViewModalBtn) {
  closeViewModalBtn.addEventListener("click", () => {
    if (viewModal) viewModal.classList.add("hidden");
  });
}

if (viewModal) {
  viewModal.addEventListener("click", (e) => {
    if (e.target === viewModal) viewModal.classList.add("hidden");
  });
}

function openViewModal(data) {
  if (!viewBody || !viewModal) return;

  const isImage = data.fileUrl && (
    data.fileUrl.includes(".png") || 
    data.fileUrl.includes(".jpg") || 
    data.fileUrl.includes(".jpeg") || 
    data.fileUrl.includes(".webp") ||
    data.fileUrl.includes(".gif")
  );

  const authorDisp = data.authorName || data.author || "Grotesk Yazarı";

  let html = `
    <div class="view-cat">${(data.category || "GENEL").toUpperCase()} ${data.isOwn ? '• (Özgün Metin)' : ''}</div>
    <div class="view-ttl">${escapeHtml(data.title || "Başlıksız")}</div>
  `;

  if (data.fileUrl) {
    html += `<div class="view-file">`;
    if (isImage) {
      html += `<img src="${data.fileUrl}" alt="${escapeHtml(data.title || "")}">`;
    } else {
      html += `<a href="${data.fileUrl}" target="_blank" download="${escapeHtml(data.fileName || 'dosya')}">📄 ${escapeHtml(data.fileName || "Dosyayı İndir")}</a>`;
    }
    html += `</div>`;
  }

  if (data.comment) {
    html += `<div class="view-text">${escapeHtml(data.comment)}</div>`;
  }

  // En altta sağ köşede box içinde Grotesk Yazarı İsmi
  html += `
    <div class="view-author-box">
      <span class="author-lbl">Grotesk Yazarı:</span>
      <span class="author-val">${escapeHtml(authorDisp)}</span>
    </div>
    <div class="view-body-clear"></div>
  `;

  viewBody.innerHTML = html;

  // View modal butonları (Sadece Yazar Modunda)
  if (viewActions) {
    viewActions.innerHTML = "";
    if (currentRole === "author") {
      const editBtn = document.createElement("button");
      editBtn.className = "add-btn";
      editBtn.innerText = "Düzenle";
      editBtn.style.marginBottom = "0";
      editBtn.addEventListener("click", () => {
        viewModal.classList.add("hidden");
        openEditModal(data);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "add-btn";
      delBtn.innerText = "Sil";
      delBtn.style.marginBottom = "0";
      delBtn.addEventListener("click", async () => {
        if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;
        viewModal.classList.add("hidden");
        try {
          await deleteDoc(doc(db, COLLECTION_NAME, data.id));
        } catch (err) {
          console.error("Silme hatası:", err);
        }
      });

      viewActions.appendChild(editBtn);
      viewActions.appendChild(delBtn);
    }
  }

  viewModal.classList.remove("hidden");
}

/* ===================================================
   DÜZENLEME MODALI (SADECE YAZAR)
   =================================================== */
const editModal = document.getElementById("edit-modal");
const closeEditModalBtn = document.getElementById("close-edit-modal");
const submitEditBtn = document.getElementById("submit-edit");
let currentEditingId = null;

if (closeEditModalBtn) {
  closeEditModalBtn.addEventListener("click", () => {
    if (editModal) editModal.classList.add("hidden");
  });
}

if (editModal) {
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) editModal.classList.add("hidden");
  });
}

function openEditModal(data) {
  currentEditingId = data.id;
  const editTitle = document.getElementById("edit-title");
  const editComment = document.getElementById("edit-comment");
  const editAuthor = document.getElementById("edit-author");
  const editOwn = document.getElementById("edit-own");
  const editHidden = document.getElementById("edit-hidden");
  const editOwnRow = document.getElementById("edit-own-row");

  if (editTitle) editTitle.value = data.title || "";
  if (editComment) editComment.value = data.comment || "";
  if (editAuthor) editAuthor.value = data.authorName || data.author || "";
  if (editOwn) editOwn.checked = !!data.isOwn;
  if (editHidden) editHidden.checked = !!data.isHidden;
  if (editOwnRow) editOwnRow.style.display = data.category === "metinler" ? "" : "none";

  if (editModal) editModal.classList.remove("hidden");
}

if (submitEditBtn) {
  submitEditBtn.addEventListener("click", async () => {
    if (!currentEditingId) return;

    const editTitle = document.getElementById("edit-title")?.value.trim() || "Başlıksız";
    const editComment = document.getElementById("edit-comment")?.value.trim() || "";
    const editAuthor = document.getElementById("edit-author")?.value.trim() || "Grotesk Yazarı";
    const editOwn = document.getElementById("edit-own")?.checked || false;
    const editHidden = document.getElementById("edit-hidden")?.checked || false;

    submitEditBtn.disabled = true;
    submitEditBtn.innerText = "Kaydediliyor...";

    try {
      await updateDoc(doc(db, COLLECTION_NAME, currentEditingId), {
        title: editTitle,
        comment: editComment,
        authorName: editAuthor,
        isOwn: editOwn,
        isHidden: editHidden
      });

      if (editModal) editModal.classList.add("hidden");
    } catch (err) {
      console.error("Güncelleme hatası:", err);
      alert("Güncelleme sırasında hata oluştu: " + err.message);
    } finally {
      submitEditBtn.disabled = false;
      submitEditBtn.innerText = "Kaydet";
    }
  });
}

/* ===================================================
   YARDIMCI FONKSİYONLAR
   =================================================== */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  listenEntries();
});
