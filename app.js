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
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getStorage
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
const AUTHORS_COLLECTION = "authors";

/* ===================================================
   GÜVENLİK & ŞİFRE (SHA-256 HASH)
   =================================================== */
const AUTH_HASH = "9d06ac0aeaba527e1e3684820ea7c172f9d6ef645d0d8a249dfbd1ef4c8236ba";
const MASTER_RECOVERY_HASH = "b78eb25bf79fe1fa258a7125da03a9a1ad2fc5480171d6d2be89101b897833c6";

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ===================================================
   BRUTE FORCE KORUMASI
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
      lockState.failedCount++;
      const left = 5 - lockState.failedCount;

      if (lockState.failedCount >= 5) {
        lockState.failedCount = 0;
        lockState.penaltyLevel++;

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

if (btnReader) {
  btnReader.addEventListener("click", () => {
    currentRole = "reader";
    localStorage.setItem("grotesk_role", currentRole);
    if (loginPass) loginPass.value = "";
    if (loginError) loginError.innerText = "";
    showMainSite(currentRole);
  });
}

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
   GENEL DUYURU KUTUSU
   =================================================== */
const noticeModal = document.getElementById("notice-modal");
const btnNoticeDismiss = document.getElementById("btn-notice-dismiss");

if (btnNoticeDismiss && noticeModal) {
  btnNoticeDismiss.addEventListener("click", () => {
    localStorage.setItem("grotesk_notice_v1", "true");
    noticeModal.classList.add("hidden");
  });
}

function checkNoticeModal() {
  if (noticeModal && !localStorage.getItem("grotesk_notice_v1")) {
    noticeModal.classList.remove("hidden");
  }
}
checkNoticeModal();

/* ===================================================
   YAZAR ŞİFRESİ VE DOĞRULAMA
   =================================================== */
const authorAuthModal = document.getElementById("author-auth-modal");
const closeAuthorAuthModal = document.getElementById("close-author-auth-modal");
const authorAuthTitle = document.getElementById("author-auth-title");
const authorAuthDesc = document.getElementById("author-auth-desc");
const authorAuthPassGroup = document.getElementById("author-auth-pass-group");
const authorAuthPassLabel = document.getElementById("author-auth-pass-label");
const authorAuthPass = document.getElementById("author-auth-pass");
const authorAuthInfoBox = document.getElementById("author-auth-info-box");
const authorAuthError = document.getElementById("author-auth-error");
const btnAuthorAuthCancel = document.getElementById("btn-author-auth-cancel");

function getAuthorCooldown(authorKey) {
  try {
    const raw = localStorage.getItem(`grotesk_author_cd_${authorKey}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { failedCount: 0, lockUntil: 0 };
}

function saveAuthorCooldown(authorKey, state) {
  localStorage.setItem(`grotesk_author_cd_${authorKey}`, JSON.stringify(state));
}

let activeAuthResolver = null;

function closeAuthorAuthModalFn() {
  if (authorAuthModal) authorAuthModal.classList.add("hidden");
  if (activeAuthResolver) {
    const r = activeAuthResolver;
    activeAuthResolver = null;
    r(false);
  }
}

if (closeAuthorAuthModal) closeAuthorAuthModal.addEventListener("click", closeAuthorAuthModalFn);
if (btnAuthorAuthCancel) btnAuthorAuthCancel.addEventListener("click", closeAuthorAuthModalFn);
if (authorAuthModal) {
  authorAuthModal.addEventListener("click", (e) => {
    if (e.target === authorAuthModal) closeAuthorAuthModalFn();
  });
}

function authorizeAuthor(rawAuthorName) {
  return new Promise(async (resolve) => {
    const cleanName = (rawAuthorName || "").trim() || "Grotesk Yazarı";
    const authorKey = cleanName.toLowerCase();

    const cd = getAuthorCooldown(authorKey);
    if (cd.lockUntil && Date.now() < cd.lockUntil) {
      const remainingSec = Math.ceil((cd.lockUntil - Date.now()) / 1000);
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      alert(`"${cleanName}" yazarı için şifre üst üste 5 kez hatalı girildiği için işlem kilitlenmiştir. Lütfen ${m} dk ${s} sn sonra tekrar deneyin.`);
      resolve(false);
      return;
    }

    const authorDocRef = doc(db, AUTHORS_COLLECTION, authorKey);
    let authorDocSnap;
    try {
      authorDocSnap = await getDoc(authorDocRef);
    } catch (err) {
      console.error("Yazar verisi alınamadı:", err);
      alert("Yazar bilgisi doğrulanırken hata oluştu: " + err.message);
      resolve(false);
      return;
    }

    activeAuthResolver = resolve;
    if (authorAuthError) authorAuthError.innerText = "";
    if (authorAuthPass) authorAuthPass.value = "";

    const isLocked = authorDocSnap.exists();

    let submitBtnEl = document.getElementById("btn-author-auth-submit");
    const freshBtn = submitBtnEl.cloneNode(true);
    submitBtnEl.replaceWith(freshBtn);
    submitBtnEl = freshBtn;

    if (!isLocked) {
      let chosenPassword = "";
      let step = 1;

      authorAuthTitle.innerText = "Yazar İsmini Kilitle";
      authorAuthDesc.innerText = `'${cleanName}' ismi henüz şifre ile kilitlenmemiş. Bu ismin sahibi sizseniz, içeriklerinizi korumak için kişisel bir şifre belirleyin.`;
      authorAuthPassGroup.classList.remove("hidden");
      authorAuthPassLabel.innerText = "Yeni Kişisel Şifre";
      authorAuthInfoBox.classList.add("hidden");
      submitBtnEl.innerText = "Şifreyi Belirle";
      authorAuthModal.classList.remove("hidden");
      if (authorAuthPass) authorAuthPass.focus();

      submitBtnEl.addEventListener("click", async () => {
        if (step === 1) {
          const pass = authorAuthPass ? authorAuthPass.value : "";
          if (!pass.trim()) {
            authorAuthError.innerText = "Lütfen bir şifre belirleyin.";
            return;
          }
          chosenPassword = pass;
          step = 2;

          authorAuthTitle.innerText = "Önemli Bilgilendirme";
          authorAuthDesc.innerText = `'${cleanName}' ismi için şifreniz kaydedilmek üzere.`;
          authorAuthPassGroup.classList.add("hidden");
          authorAuthInfoBox.classList.remove("hidden");
          authorAuthError.innerText = "";
          submitBtnEl.innerText = "Anladım ve Kilitle";
        } else if (step === 2) {
          submitBtnEl.disabled = true;
          submitBtnEl.innerText = "Kaydediliyor...";
          try {
            const hash = await sha256(chosenPassword);
            await setDoc(authorDocRef, {
              authorName: cleanName,
              passcodeHash: hash,
              createdAt: serverTimestamp()
            });
            submitBtnEl.disabled = false;
            authorAuthModal.classList.add("hidden");
            activeAuthResolver = null;
            resolve(true);
          } catch (err) {
            console.error("Yazar kilitleme hatası:", err);
            authorAuthError.innerText = "Hata: " + err.message;
            submitBtnEl.disabled = false;
            submitBtnEl.innerText = "Anladım ve Kilitle";
          }
        }
      });

    } else {
      authorAuthTitle.innerText = "Yazar Şifresi Doğrulama";
      authorAuthDesc.innerText = `'${cleanName}' ismi kişisel şifre ile kilitlenmiştir. Bu işlemi tamamlamak için şifrenizi girin:`;
      authorAuthPassGroup.classList.remove("hidden");
      authorAuthPassLabel.innerText = "Yazar Şifresi";
      authorAuthInfoBox.classList.add("hidden");
      submitBtnEl.innerText = "Onayla";
      authorAuthModal.classList.remove("hidden");
      if (authorAuthPass) authorAuthPass.focus();

      submitBtnEl.addEventListener("click", async () => {
        const pass = authorAuthPass ? authorAuthPass.value : "";
        if (!pass) {
          authorAuthError.innerText = "Lütfen şifrenizi girin.";
          return;
        }

        const hash = await sha256(pass);
        const storedHash = authorDocSnap.data()?.passcodeHash;

        if (hash === storedHash || hash === MASTER_RECOVERY_HASH) {
          saveAuthorCooldown(authorKey, { failedCount: 0, lockUntil: 0 });
          authorAuthModal.classList.add("hidden");
          activeAuthResolver = null;
          resolve(true);
        } else {
          const currentCd = getAuthorCooldown(authorKey);
          currentCd.failedCount = (currentCd.failedCount || 0) + 1;

          if (currentCd.failedCount >= 5) {
            currentCd.lockUntil = Date.now() + 5 * 60 * 1000;
            currentCd.failedCount = 0;
            saveAuthorCooldown(authorKey, currentCd);
            authorAuthError.innerText = "Şifre üst üste 5 kez hatalı girildi! 5 dakika boyunca işlem yapılamaz.";
            submitBtnEl.disabled = true;
            setTimeout(() => {
              submitBtnEl.disabled = false;
              closeAuthorAuthModalFn();
            }, 2500);
          } else {
            saveAuthorCooldown(authorKey, currentCd);
            const remaining = 5 - currentCd.failedCount;
            authorAuthError.innerText = `Hatalı şifre! (${remaining} hakkınız kaldı)`;
          }
        }
      });
    }
  });
}

/* ===================================================
   PANEL GEÇİŞLERİ VE KAYDEDİLENLER BUTONU
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

const savedToggleBtn = document.getElementById("saved-toggle-btn");
if (savedToggleBtn) {
  savedToggleBtn.addEventListener("click", () => {
    panelLinks.forEach(l => {
      if (l.dataset.panel === "saved") l.classList.add("active");
      else l.classList.remove("active");
    });
    panels.forEach(p => p.classList.remove("active"));
    const savedPanel = document.getElementById("panel-saved");
    if (savedPanel) savedPanel.classList.add("active");
  });
}

/* ===================================================
   KAYDEDİLENLER (LOCAL STORAGE BOOKMARKS)
   =================================================== */
function getSavedPosts() {
  try {
    const raw = localStorage.getItem("grotesk_saved_posts");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function isPostSaved(docId) {
  return getSavedPosts().includes(docId);
}

function toggleSavePost(docId) {
  let saved = getSavedPosts();
  if (saved.includes(docId)) {
    saved = saved.filter(id => id !== docId);
  } else {
    saved.push(docId);
  }
  localStorage.setItem("grotesk_saved_posts", JSON.stringify(saved));
  updateSavedBadge();
  renderAllEntries();
}

function updateSavedBadge() {
  const badge = document.getElementById("saved-count-badge");
  if (badge) {
    badge.innerText = getSavedPosts().length;
  }
}

/* ===================================================
   TEKİL GÖRÜNTÜLENME VE BEĞENİ YÖNETİMİ
   =================================================== */
async function registerView(docId) {
  const viewKey = 'viewed_' + docId;
  if (!localStorage.getItem(viewKey)) {
    try {
      const docRef = doc(db, COLLECTION_NAME, docId);
      await updateDoc(docRef, { views: increment(1) });
      localStorage.setItem(viewKey, 'true');
    } catch (err) {
      console.error("Görüntülenme artırma hatası:", err);
    }
  }
}

async function toggleLike(docId) {
  const likeKey = 'liked_' + docId;
  const isLiked = !!localStorage.getItem(likeKey);
  const docRef = doc(db, COLLECTION_NAME, docId);

  try {
    if (!isLiked) {
      await updateDoc(docRef, { likes: increment(1) });
      localStorage.setItem(likeKey, 'true');
    } else {
      await updateDoc(docRef, { likes: increment(-1) });
      localStorage.removeItem(likeKey);
    }
  } catch (err) {
    console.error("Beğeni işlemi hatası:", err);
  }
}

/* ===================================================
   ANONİM YORUM SİSTEMİ & SİLME YETKİSİ
   =================================================== */
let currentCommentUnsubscribe = null;

function listenComments(postId) {
  if (currentCommentUnsubscribe) {
    currentCommentUnsubscribe();
    currentCommentUnsubscribe = null;
  }

  const commentsListEl = document.getElementById("comments-list");
  if (!commentsListEl) return;

  const commentsRef = collection(db, COLLECTION_NAME, postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  currentCommentUnsubscribe = onSnapshot(q, (snapshot) => {
    commentsListEl.innerHTML = "";
    if (snapshot.empty) {
      commentsListEl.innerHTML = '<div class="no-comments">— Henüz yorum yapılmamış —</div>';
      return;
    }

    snapshot.forEach((commentDoc) => {
      const commentData = commentDoc.data();
      const commentId = commentDoc.id;

      let dateStr = "";
      if (commentData.createdAt && commentData.createdAt.seconds) {
        dateStr = new Date(commentData.createdAt.seconds * 1000).toLocaleString("tr-TR", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
      }

      const item = document.createElement("div");
      item.className = "comment-item";
      item.innerHTML = `
        <div class="comment-content">
          <p class="comment-text">${escapeHtml(commentData.text || "")}</p>
          ${dateStr ? `<span class="comment-date">${dateStr}</span>` : ""}
        </div>
        <button type="button" class="comment-delete-btn">Sil</button>
      `;

      item.querySelector(".comment-delete-btn").addEventListener("click", () => {
        const entryData = allEntries.find(e => e.id === postId);
        const entryAuthor = (entryData && (entryData.authorName || entryData.author)) || "Grotesk Yazarı";
        deleteComment(postId, commentId, entryAuthor);
      });

      commentsListEl.appendChild(item);
    });
  }, (err) => {
    console.error("Yorum dinleme hatası:", err);
  });
}

async function addComment(postId) {
  const inputEl = document.getElementById("comment-input");
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;

  try {
    const commentsRef = collection(db, COLLECTION_NAME, postId, "comments");
    const docRef = await addDoc(commentsRef, {
      text: text,
      createdAt: serverTimestamp()
    });
    localStorage.setItem('my_comment_' + docRef.id, 'true');
    inputEl.value = "";
  } catch (err) {
    console.error("Yorum ekleme hatası:", err);
    alert("Yorum eklenirken hata oluştu: " + err.message);
  }
}

async function deleteComment(postId, commentId, entryAuthorName) {
  const isMyComment = localStorage.getItem('my_comment_' + commentId);

  // A) Cihazda kayıt varsa şifresiz direkt siler
  if (isMyComment) {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, postId, "comments", commentId));
      localStorage.removeItem('my_comment_' + commentId);
    } catch (err) {
      console.error("Yorum silme hatası:", err);
    }
    return;
  }

  // B) Cihazda kayıt yoksa Yazar / Master şifresi doğrulaması ister
  const isAuthorized = await authorizeAuthor(entryAuthorName);
  if (isAuthorized) {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, postId, "comments", commentId));
    } catch (err) {
      console.error("Yorum silme hatası:", err);
    }
  }
}

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
    if (currentRole !== "author") return;
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

const fileInput = document.getElementById("entry-file");
const filePreview = document.getElementById("file-preview");

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!filePreview) return;

    if (file) {
      filePreview.innerHTML = `
        <div class="selected-file-wrap" style="display:inline-flex; align-items:center; gap:10px; margin-top:8px; padding:6px 12px; border:1px solid #444; background:#111;">
          <span style="font-size:0.85rem; color:#ccc;">📄 ${escapeHtml(file.name)}</span>
          <button type="button" id="remove-selected-file" class="remove-file-btn" style="background:transparent; border:1px solid #666; color:#ff7777; font-size:0.75rem; padding:3px 8px; cursor:pointer; font-family:var(--font); letter-spacing:0.06em; transition:all .2s;">Sil</button>
        </div>
      `;

      const removeBtn = document.getElementById("remove-selected-file");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          fileInput.value = "";
          filePreview.innerHTML = "";
        });
      }
    } else {
      filePreview.innerHTML = "";
    }
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
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

    if (file && file.size > 800 * 1024) {
      alert("Dosya boyutu çok büyük! Lütfen 800 KB'dan küçük bir görsel/PDF seçin.");
      return;
    }

    const isAuthorized = await authorizeAuthor(authorName);
    if (!isAuthorized) return;

    submitBtn.disabled = true;
    submitBtn.innerText = "YÜKLENİYOR...";

    try {
      let fileData = "";
      let fileName = "";

      if (file) {
        fileData = await fileToBase64(file);
        fileName = file.name;
      }

      await addDoc(collection(db, COLLECTION_NAME), {
        title: title || "Başlıksız",
        comment: comment || "",
        category: selectedCategory,
        authorName: authorName,
        isOwn: isOwn,
        isHidden: isHidden,
        fileData: fileData,
        fileUrl: fileData,
        fileName: fileName,
        views: 0,
        likes: 0,
        createdAt: serverTimestamp()
      });

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
    updateSavedBadge();
  }, (err) => {
    console.error("Firestore Dinleme Hatası:", err);
  });
}

const searchInput = document.getElementById("search-input");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderAllEntries();
  });
}

function renderAllEntries() {
  const searchTerm = searchInput?.value.trim().toLowerCase() || "";
  const categories = ["home", "metinler", "muzik", "resim", "fotograf", "sinema", "performans", "saved"];

  categories.forEach(cat => {
    const el = document.getElementById(`${cat}-entries`);
    if (el) el.innerHTML = "";
  });

  const savedIds = getSavedPosts();

  const filtered = allEntries.filter(item => {
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
    const targetCatContainer = document.getElementById(`${item.category}-entries`);
    if (targetCatContainer) {
      targetCatContainer.appendChild(createCard(item));
      counts[item.category] = (counts[item.category] || 0) + 1;
    }

    const homeContainer = document.getElementById("home-entries");
    if (homeContainer) {
      homeContainer.appendChild(createCard(item));
      counts["home"] = (counts["home"] || 0) + 1;
    }

    if (savedIds.includes(item.id)) {
      const savedContainer = document.getElementById("saved-entries");
      if (savedContainer) {
        savedContainer.appendChild(createCard(item));
        counts["saved"] = (counts["saved"] || 0) + 1;
      }
    }
  });

  categories.forEach(cat => {
    const el = document.getElementById(`${cat}-entries`);
    if (el && counts[cat] === 0) {
      el.innerHTML = cat === "saved" 
        ? '<div class="empty">— Henüz kaydedilmiş bir içerik yok —</div>' 
        : '<div class="empty">— Henüz içerik yok —</div>';
    }
  });
}

/* ===================================================
   KART OLUŞTURMA
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

  const mediaData = data.fileData || data.fileUrl;
  const isImage = mediaData && (
    mediaData.startsWith("data:image/") ||
    mediaData.includes(".png") || 
    mediaData.includes(".jpg") || 
    mediaData.includes(".jpeg") || 
    mediaData.includes(".webp") ||
    mediaData.includes(".gif")
  );

  const rawTitle = data.title || "Başlıksız";
  const displayTitle = rawTitle.length > 40 ? rawTitle.slice(0, 40) + "…" : rawTitle;

  const rawComment = data.comment || "";
  const displayComment = rawComment.length > 40 ? rawComment.slice(0, 40) + "…" : rawComment;

  const authorDisp = data.authorName || data.author || "Grotesk Yazarı";

  const isLiked = !!localStorage.getItem('liked_' + data.id);
  const isSaved = isPostSaved(data.id);
  const viewsCount = data.views || 0;
  const likesCount = data.likes || 0;

  card.innerHTML = `
    <div class="entry-thumb">
      ${isImage 
        ? `<img src="${mediaData}" alt="${escapeHtml(rawTitle)}">` 
        : `<div class="thumb-logo">GROTESK</div>`}
    </div>
    <div class="entry-meta">
      <div class="entry-cat">${(data.category || "GENEL").toUpperCase()} ${data.isOwn ? '• (Özgün)' : ''}</div>
      <div class="entry-title">${escapeHtml(displayTitle)}</div>
      <div class="entry-own">${escapeHtml(authorDisp)}</div>
      ${displayComment ? `<div class="entry-preview">${escapeHtml(displayComment)}</div>` : ''}
      <div class="entry-footer-row">
        <span class="entry-date">${dateStr}</span>
        <div class="entry-stats">
          <span class="stat-views" title="Görüntülenme">👁 ${viewsCount}</span>
          <button type="button" class="like-card-btn ${isLiked ? 'active' : ''}" title="Beğen">
            <span class="heart-icon">${isLiked ? '♥' : '♡'}</span>
            <span class="like-count">${likesCount}</span>
          </button>
          <button type="button" class="bookmark-card-btn ${isSaved ? 'active' : ''}" title="Kaydet">
            <svg class="bookmark-svg" viewBox="0 0 24 24" width="15" height="15">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Beğeni Butonu
  const likeBtn = card.querySelector(".like-card-btn");
  if (likeBtn) {
    likeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleLike(data.id);
    });
  }

  // Kaydet Butonu
  const bookBtn = card.querySelector(".bookmark-card-btn");
  if (bookBtn) {
    bookBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSavePost(data.id);
    });
  }

  // Yazar Yetki Butonları
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

    // "Gizle" / "Göster" butonu için ŞİFRE KORUMASI
    acts.querySelector('[data-act="hide"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const targetAuthor = data.authorName || data.author || "Grotesk Yazarı";
      
      const isAuthorized = await authorizeAuthor(targetAuthor);
      if (!isAuthorized) return;

      try {
        await updateDoc(doc(db, COLLECTION_NAME, data.id), { isHidden: !data.isHidden });
      } catch (err) {
        console.error("Gizleme hatası:", err);
      }
    });

    acts.querySelector('[data-act="del"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const targetAuthor = data.authorName || data.author || "Grotesk Yazarı";
      if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;

      const isAuthorized = await authorizeAuthor(targetAuthor);
      if (!isAuthorized) return;

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
   DETAY / OKUMA MODALI & YORUMLAR
   =================================================== */
const viewModal = document.getElementById("view-modal");
const closeViewModalBtn = document.getElementById("close-view-modal");
const viewBody = document.getElementById("view-body");
const viewActions = document.getElementById("view-actions");
const submitCommentBtn = document.getElementById("submit-comment-btn");

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

  registerView(data.id);

  const mediaData = data.fileData || data.fileUrl;
  const isImage = mediaData && (
    mediaData.startsWith("data:image/") ||
    mediaData.includes(".png") || 
    mediaData.includes(".jpg") || 
    mediaData.includes(".jpeg") || 
    mediaData.includes(".webp") ||
    mediaData.includes(".gif")
  );

  const authorDisp = data.authorName || data.author || "Grotesk Yazarı";

  let mediaHtml = "";
  if (mediaData) {
    if (isImage) {
      mediaHtml = `<div class="view-file"><img src="${mediaData}" alt="${escapeHtml(data.fileName || data.title || '')}" style="max-width: 100%; height: auto; margin-top: 10px; border-radius: 4px;" /></div>`;
    } else {
      mediaHtml = `<div class="view-file" style="margin-top: 10px;"><a href="${mediaData}" download="${escapeHtml(data.fileName || 'dosya')}" style="color: var(--acc); text-decoration: underline;">📄 ${escapeHtml(data.fileName || 'Dosyayı İndir / Görüntüle')} (İndir / Görüntüle)</a></div>`;
    }
  }

  let html = `
    <div class="view-cat">${(data.category || "GENEL").toUpperCase()} ${data.isOwn ? '• (Özgün Metin)' : ''}</div>
    <div class="view-ttl">${escapeHtml(data.title || "Başlıksız")}</div>
    ${mediaHtml}
  `;

  if (data.comment) {
    html += `<div class="view-text">${escapeHtml(data.comment)}</div>`;
  }

  html += `
    <div class="view-author-box">
      <span class="author-lbl">Grotesk Yazarı:</span>
      <span class="author-val">${escapeHtml(authorDisp)}</span>
    </div>
    <div class="view-body-clear"></div>
  `;

  viewBody.innerHTML = html;

  listenComments(data.id);

  if (submitCommentBtn) {
    const newSubmitBtn = submitCommentBtn.cloneNode(true);
    submitCommentBtn.replaceWith(newSubmitBtn);
    newSubmitBtn.addEventListener("click", () => addComment(data.id));
  }

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
        const targetAuthor = data.authorName || data.author || "Grotesk Yazarı";
        if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;

        const isAuthorized = await authorizeAuthor(targetAuthor);
        if (!isAuthorized) return;

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
let currentEditingData = null;

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
  currentEditingData = data;
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

    const originalAuthor = (currentEditingData && (currentEditingData.authorName || currentEditingData.author)) || "Grotesk Yazarı";
    const editAuthor = document.getElementById("edit-author")?.value.trim() || originalAuthor;

    const isAuthorized = await authorizeAuthor(originalAuthor);
    if (!isAuthorized) return;

    if (editAuthor.toLowerCase() !== originalAuthor.toLowerCase()) {
      const isNewAuthorized = await authorizeAuthor(editAuthor);
      if (!isNewAuthorized) return;
    }

    const editTitle = document.getElementById("edit-title")?.value.trim() || "Başlıksız";
    const editComment = document.getElementById("edit-comment")?.value.trim() || "";
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
  updateSavedBadge();
});
