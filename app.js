import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where,
  serverTimestamp,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getStorage
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

/* ===================================================
   FIREBASE YAPILANDIRMASI
   =================================================== */
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
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const COLLECTION_NAME = "grotesk_entries";
const AUTHORS_COLLECTION = "authors";
const ADMINS_COLLECTION = "admins";
const INTERNAL_DOMAIN = "grotesk.internal";

/* ===================================================
   YARDIMCI VE DÖNÜŞTÜRME FONKSİYONLARI
   =================================================== */

/**
 * Kullanıcı tarafından girilen nicki küçük harfe, Türkçe karakter
 * eşleniklerine dönüştürür ve boşlukları temizler.
 * Caps lock önemsiz hale gelir: 'KUZGUN' -> 'kuzgun'
 */
function normalizeAuthorKey(nick) {
  if (!nick) return "";
  let clean = nick.trim();
  clean = clean
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
  return clean;
}

/**
 * Nick'ten Firebase Auth için dahili e-posta adresi üretir.
 */
function nickToInternalEmail(nick) {
  const key = normalizeAuthorKey(nick);
  return `${key}@${INTERNAL_DOMAIN}`;
}

/**
 * Yazar isimlerini ekranda sade ve baş harfleri büyük (Title Case) formatta gösterir.
 * Örn: "kuzgun" -> "Kuzgun", "ahmet yılmaz" -> "Ahmet Yılmaz"
 */
function toTitleCase(str) {
  if (!str) return "";
  return str
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return "";
      return word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1).toLocaleLowerCase("tr-TR");
    })
    .join(" ");
}

/**
 * Eski sistemdeki SHA-256 hash kontrollerini yalnızca tek seferlik
 * otomatik Auth geçişi (migration) sırasında doğrulamak için kullanılır.
 */
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ===================================================
   OTURUM & ROL YÖNETİMİ
   =================================================== */
let currentRole = localStorage.getItem("grotesk_role") || "";
let currentAuthorName = "";
let currentAuthorKey = "";
let isAdmin = false;

const loginPage = document.getElementById("login-page");
const mainSite = document.getElementById("main-site");
const loginForm = document.getElementById("login-form");
const loginNick = document.getElementById("login-nick");
const loginPass = document.getElementById("login-pass");
const loginError = document.getElementById("login-error");
const btnAuthor = document.getElementById("btn-author-login");
const btnReader = document.getElementById("btn-reader-login");
const logoutBtn = document.getElementById("logout-btn");
const roleBadge = document.getElementById("role-badge");

// Firebase Auth Oturum Durumu Dinleyicisi
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentRole = "author";
    localStorage.setItem("grotesk_role", "author");

    currentAuthorKey = user.email ? user.email.replace(`@${INTERNAL_DOMAIN}`, "") : "";
    
    // Admin kontrolü (admins/{uid})
    try {
      const adminDoc = await getDoc(doc(db, ADMINS_COLLECTION, user.uid));
      isAdmin = adminDoc.exists();
    } catch {
      isAdmin = false;
    }

    currentAuthorName = user.displayName ? toTitleCase(user.displayName) : toTitleCase(currentAuthorKey);

    showMainSite("author");
    listenEntries();
  } else {
    // Auth oturumu yok; Okuyucu modu seçilmiş mi kontrol et
    if (currentRole === "reader") {
      isAdmin = false;
      currentAuthorName = "";
      currentAuthorKey = "";
      showMainSite("reader");
      listenEntries();
    } else {
      currentRole = "";
      localStorage.removeItem("grotesk_role");
      showLoginPage();
    }
  }
});

function showLoginPage() {
  if (mainSite) mainSite.classList.add("hidden");
  if (loginPage) loginPage.classList.remove("hidden");
  document.body.classList.remove("role-author", "role-reader");
  if (loginNick) loginNick.value = "";
  if (loginPass) loginPass.value = "";
  if (loginError) loginError.innerText = "";
}

function showMainSite(role) {
  if (loginPage) loginPage.classList.add("hidden");
  if (mainSite) mainSite.classList.remove("hidden");

  document.body.classList.remove("role-author", "role-reader");
  document.body.classList.add(`role-${role}`);

  if (roleBadge) {
    if (role === "author") {
      const roleText = isAdmin ? "Yönetici" : "Yazar Modu";
      roleBadge.innerText = `${currentAuthorName || 'Yazar'} • ${roleText}`;
    } else {
      roleBadge.innerText = "Okuyucu Modu";
    }
  }
}

/* ===================================================
   GİRİŞ VE ÇIKIŞ İŞLEMLERİ
   =================================================== */

// Yazar Girişi Formu
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loginError) loginError.innerText = "";

    const nick = loginNick?.value.trim() || "";
    const pass = loginPass?.value || "";

    if (!nick) {
      if (loginError) loginError.innerText = "Lütfen yazar isminizi girin.";
      if (loginNick) loginNick.focus();
      return;
    }

    if (!pass) {
      if (loginError) loginError.innerText = "Lütfen şifrenizi girin.";
      if (loginPass) loginPass.focus();
      return;
    }

    const email = nickToInternalEmail(nick);
    const authorKey = normalizeAuthorKey(nick);

    if (btnAuthor) {
      btnAuthor.disabled = true;
      btnAuthor.innerText = "Giriş Yapılıyor...";
    }

    try {
      // 1) Standart Firebase Auth Giriş Denemesi
      await signInWithEmailAndPassword(auth, email, pass);
      if (loginPass) loginPass.value = "";
      if (loginNick) loginNick.value = "";
    } catch (err) {
      console.warn("Auth girişi başarısız, eski sistem aktarım kontrolü yapılıyor:", err.code);

      // 2) Eğer kullanıcı Auth'ta henüz yoksa ve eski Firestore 'authors' kaydı varsa otomatik aktar
      let migrated = false;
      try {
        const authorDocSnap = await getDoc(doc(db, AUTHORS_COLLECTION, authorKey));
        if (authorDocSnap.exists()) {
          const authorData = authorDocSnap.data();
          const enteredHash = await sha256(pass);

          // Eski şifre hash'i eşleşiyor mu?
          if (authorData.passcodeHash === enteredHash) {
            const dispName = toTitleCase(authorData.authorName || nick);
            // Firebase Auth hesabı oluştur
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCred.user, { displayName: dispName });

            // Firestore authors kaydını güncelle
            await setDoc(doc(db, AUTHORS_COLLECTION, authorKey), {
              authorUid: userCred.user.uid,
              authorName: dispName,
              authorKey: authorKey,
              createdAt: authorData.createdAt || serverTimestamp(),
              migratedAt: serverTimestamp()
            }, { merge: true });

            // Bu yazarın eski içeriklerine authorUid eşlemesi yap
            linkOldEntriesToAuthorUid(authorKey, userCred.user.uid);

            migrated = true;
            if (loginPass) loginPass.value = "";
            if (loginNick) loginNick.value = "";
          }
        }
      } catch (migrationErr) {
        console.error("Otomatik geçiş hatası:", migrationErr);
      }

      if (!migrated) {
        if (loginError) {
          if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
            loginError.innerText = "Hatalı şifre girdiniz.";
          } else if (err.code === "auth/user-not-found") {
            loginError.innerText = "Bu yazar ismi sistemde kayıtlı değil.";
          } else if (err.code === "auth/too-many-requests") {
            loginError.innerText = "Çok fazla başarısız deneme. Lütfen bir süre bekleyin.";
          } else {
            loginError.innerText = "Giriş yapılamadı: " + (err.message || "Bilinmeyen hata");
          }
        }
      }
    } finally {
      if (btnAuthor) {
        btnAuthor.disabled = false;
        btnAuthor.innerText = "Yazar Girişi";
      }
    }
  });
}

/**
 * Yazarın daha önce paylaştığı içeriklere authorUid ve authorKey bağlar.
 */
async function linkOldEntriesToAuthorUid(authorKey, uid) {
  try {
    const q = query(collection(db, COLLECTION_NAME));
    const snap = await getDocs(q);
    snap.forEach(async (docSnap) => {
      const data = docSnap.data();
      const entryKey = normalizeAuthorKey(data.authorName || data.author || "");
      if (entryKey === authorKey && !data.authorUid) {
        await updateDoc(docSnap.ref, {
          authorUid: uid,
          authorKey: authorKey
        });
      }
    });
  } catch (err) {
    console.warn("Eski içerik eşleştirme atlandı:", err);
  }
}

// Okuyucu Girişi Butonu
if (btnReader) {
  btnReader.addEventListener("click", async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    currentRole = "reader";
    localStorage.setItem("grotesk_role", "reader");
    isAdmin = false;
    currentAuthorName = "";
    currentAuthorKey = "";
    showMainSite("reader");
    listenEntries();
  });
}

// Çıkış Yap Butonu
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Çıkış hatası:", e);
    }
    currentRole = "";
    localStorage.removeItem("grotesk_role");
    isAdmin = false;
    currentAuthorName = "";
    currentAuthorKey = "";
    showLoginPage();
  });
}

/* ===================================================
   GENEL SİTE TANITIM DUYURUSU (MODAL)
   =================================================== */
const noticeModal = document.getElementById("notice-modal");
const btnNoticeDismiss = document.getElementById("btn-notice-dismiss");

if (btnNoticeDismiss && noticeModal) {
  btnNoticeDismiss.addEventListener("click", () => {
    localStorage.setItem("grotesk_intro_seen", "true");
    noticeModal.classList.add("hidden");
  });
}

function checkNoticeModal() {
  if (noticeModal && !localStorage.getItem("grotesk_intro_seen")) {
    noticeModal.classList.remove("hidden");
  }
}
checkNoticeModal();

/* ===================================================
   YAZAR İŞLEMLERİ İÇİN ŞİFRE TEKRAR DOĞRULAMA (REAUTHENTICATE)
   =================================================== */
const authorAuthModal = document.getElementById("author-auth-modal");
const closeAuthorAuthModal = document.getElementById("close-author-auth-modal");
const authorAuthTitle = document.getElementById("author-auth-title");
const authorAuthDesc = document.getElementById("author-auth-desc");
const authorAuthPass = document.getElementById("author-auth-pass");
const authorAuthError = document.getElementById("author-auth-error");
const btnAuthorAuthCancel = document.getElementById("btn-author-auth-cancel");

let activeAuthResolver = null;

function closeAuthModal() {
  if (authorAuthModal) authorAuthModal.classList.add("hidden");
  if (activeAuthResolver) {
    const r = activeAuthResolver;
    activeAuthResolver = null;
    r(false);
  }
}

if (closeAuthorAuthModal) closeAuthorAuthModal.addEventListener("click", closeAuthModal);
if (btnAuthorAuthCancel) btnAuthorAuthCancel.addEventListener("click", closeAuthModal);
if (authorAuthModal) {
  authorAuthModal.addEventListener("click", (e) => {
    if (e.target === authorAuthModal) closeAuthModal();
  });
}

/**
 * Yazı eklerken, düzenlerken, gizlerken veya silerken
 * doğrudan Firebase Authentication reauthenticateWithCredential ile şifre doğrular.
 */
function requestAuthorReauth(actionTitle = "İşlemi Onayla") {
  return new Promise((resolve) => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      alert("Bu işlem için yazar olarak giriş yapmış olmanız gerekir.");
      resolve(false);
      return;
    }

    activeAuthResolver = resolve;
    if (authorAuthError) authorAuthError.innerText = "";
    if (authorAuthPass) authorAuthPass.value = "";
    if (authorAuthTitle) authorAuthTitle.innerText = actionTitle;
    if (authorAuthDesc) {
      authorAuthDesc.innerText = `'${currentAuthorName}' hesabınızla bu işlemi onaylamak için lütfen şifrenizi girin:`;
    }

    let submitBtnEl = document.getElementById("btn-author-auth-submit");
    const freshBtn = submitBtnEl.cloneNode(true);
    submitBtnEl.replaceWith(freshBtn);
    submitBtnEl = freshBtn;

    authorAuthModal.classList.remove("hidden");
    if (authorAuthPass) authorAuthPass.focus();

    submitBtnEl.addEventListener("click", async () => {
      const pass = authorAuthPass ? authorAuthPass.value : "";
      if (!pass) {
        if (authorAuthError) authorAuthError.innerText = "Lütfen şifrenizi girin.";
        return;
      }

      submitBtnEl.disabled = true;
      submitBtnEl.innerText = "Doğrulanıyor...";
      if (authorAuthError) authorAuthError.innerText = "";

      try {
        const credential = EmailAuthProvider.credential(user.email, pass);
        await reauthenticateWithCredential(user, credential);

        // Başarılı doğrulama
        authorAuthModal.classList.add("hidden");
        activeAuthResolver = null;
        resolve(true);
      } catch (err) {
        console.warn("Şifre doğrulama hatası:", err.code);
        if (authorAuthError) {
          if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
            authorAuthError.innerText = "Hatalı şifre. Lütfen tekrar deneyin.";
          } else if (err.code === "auth/too-many-requests") {
            authorAuthError.innerText = "Çok fazla hatalı deneme. Lütfen bekleyin.";
          } else {
            authorAuthError.innerText = "Doğrulama hatası: " + (err.message || "");
          }
        }
      } finally {
        submitBtnEl.disabled = false;
        submitBtnEl.innerText = "Onayla";
      }
    });
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
   KAYDEDİLENLER (BOOKMARKS)
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
   GÖRÜNTÜLENME VE BEĞENİ YÖNETİMİ
   =================================================== */
async function registerView(docId) {
  const viewKey = 'viewed_' + docId;
  if (!localStorage.getItem(viewKey)) {
    try {
      const docRef = doc(db, COLLECTION_NAME, docId);
      await updateDoc(docRef, { views: increment(1) });
      localStorage.setItem(viewKey, 'true');
    } catch (err) {
      console.warn("Görüntülenme artırma atlandı:", err);
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
   YORUMLAR SİSTEMİ & SİLME YETKİSİ
   =================================================== */
let currentCommentUnsubscribe = null;

function listenComments(postId, postAuthorUid) {
  if (currentCommentUnsubscribe) {
    currentCommentUnsubscribe();
    currentCommentUnsubscribe = null;
  }

  const commentsListEl = document.getElementById("comments-list");
  if (!commentsListEl) return;

  const commentsRef = collection(db, COLLECTION_NAME, postId, "comments");

  currentCommentUnsubscribe = onSnapshot(commentsRef, (snapshot) => {
    commentsListEl.innerHTML = "";
    if (snapshot.empty) {
      commentsListEl.innerHTML = '<div class="no-comments">— Henüz yorum yapılmamış —</div>';
      return;
    }

    const comments = [];
    snapshot.forEach(docSnap => comments.push({ id: docSnap.id, ...docSnap.data() }));
    // Tarihe göre sırala
    comments.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

    comments.forEach((commentData) => {
      let dateStr = "";
      if (commentData.createdAt && commentData.createdAt.seconds) {
        dateStr = new Date(commentData.createdAt.seconds * 1000).toLocaleString("tr-TR", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
      }

      const item = document.createElement("div");
      item.className = "comment-item";

      const canDelete = currentRole === "author" && auth.currentUser && (
        postAuthorUid === auth.currentUser.uid || isAdmin
      );

      item.innerHTML = `
        <div class="comment-content">
          <p class="comment-text">${escapeHtml(commentData.text || "")}</p>
          ${dateStr ? `<span class="comment-date">${dateStr}</span>` : ""}
        </div>
        ${canDelete ? `<button type="button" class="comment-delete-btn">Sil</button>` : ""}
      `;

      if (canDelete) {
        item.querySelector(".comment-delete-btn").addEventListener("click", async () => {
          if (!confirm("Bu yorumu silmek istediğinize emin misiniz?")) return;
          const isVerified = await requestAuthorReauth("Yorumu Sil");
          if (!isVerified) return;

          try {
            await deleteDoc(doc(db, COLLECTION_NAME, postId, "comments", commentData.id));
          } catch (err) {
            console.error("Yorum silme hatası:", err);
            alert("Yorum silinemedi: " + err.message);
          }
        });
      }

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

  if (text.length > 500) {
    alert("Yorum en fazla 500 karakter olabilir.");
    return;
  }

  try {
    const commentsRef = collection(db, COLLECTION_NAME, postId, "comments");
    await addDoc(commentsRef, {
      text: text,
      createdAt: serverTimestamp()
    });
    inputEl.value = "";
  } catch (err) {
    console.error("Yorum ekleme hatası:", err);
    alert("Yorum eklenirken hata oluştu: " + err.message);
  }
}

/* ===================================================
   İÇERİK EKLEME MODALI & KATEGORİLER
   =================================================== */
const addModal = document.getElementById("add-modal");
const closeAddModalBtn = document.getElementById("close-add-modal");
const addBtns = document.querySelectorAll(".add-btn");
const catBtns = document.querySelectorAll("#cat-select-group .cat-btn");
const entryAuthorInput = document.getElementById("entry-author");

let selectedCategory = "metinler";

addBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (currentRole !== "author") return;
    const cat = btn.dataset.cat || "metinler";
    setSelectedCategory(cat);
    if (entryAuthorInput) {
      entryAuthorInput.value = currentAuthorName;
    }
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
const isOwnCheck = document.getElementById("is-own-text");
const isHiddenCheck = document.getElementById("entry-hidden");

if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    if (currentRole !== "author" || !auth.currentUser) {
      alert("Okuyucu modunda içerik eklenemez.");
      return;
    }

    const title = titleInput?.value.trim() || "";
    const comment = commentInput?.value.trim() || "";
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

    // İşlem öncesi Firebase Auth şifre doğrulaması
    const isAuthorized = await requestAuthorReauth("İçerik Paylaşımını Onayla");
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
        authorName: currentAuthorName,
        authorKey: currentAuthorKey,
        authorUid: auth.currentUser.uid,
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
let entriesUnsubscribe = null;

function listenEntries() {
  if (entriesUnsubscribe) {
    entriesUnsubscribe();
    entriesUnsubscribe = null;
  }

  // Güvenlik kurallarıyla birebir uyumlu sorgu:
  // Okuyucu modunda isHidden == false zorunludur.
  let q;
  if (currentRole === "author" && auth.currentUser) {
    q = collection(db, COLLECTION_NAME);
  } else {
    q = query(collection(db, COLLECTION_NAME), where("isHidden", "==", false));
  }

  entriesUnsubscribe = onSnapshot(q, (snapshot) => {
    allEntries = [];
    snapshot.forEach(docSnap => {
      allEntries.push({ id: docSnap.id, ...docSnap.data() });
    });

    // İstemci tarafında en yeniden en eskiye sırala
    allEntries.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
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
    // Okuyucu modu gizli içerikleri göremez
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

  // Baş harfleri büyük (Title Case) yazar ismi
  const rawAuthor = data.authorName || data.author || "Grotesk Yazarı";
  const authorDisp = toTitleCase(rawAuthor);

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

  // Yazar / Yönetici İşlem Butonları
  // Yalnızca içeriğin gerçek sahibi olan yazar veya admin işlem yapabilir
  const isOwner = currentRole === "author" && auth.currentUser && (
    (data.authorUid && data.authorUid === auth.currentUser.uid) ||
    (!data.authorUid && normalizeAuthorKey(data.authorName) === currentAuthorKey) ||
    isAdmin
  );

  if (isOwner) {
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
      const isAuthorized = await requestAuthorReauth("İçerik Durumunu Değiştir");
      if (!isAuthorized) return;

      try {
        await updateDoc(doc(db, COLLECTION_NAME, data.id), { isHidden: !data.isHidden });
      } catch (err) {
        console.error("Gizleme hatası:", err);
        alert("İşlem başarısız: " + err.message);
      }
    });

    acts.querySelector('[data-act="del"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;

      const isAuthorized = await requestAuthorReauth("İçeriği Sil");
      if (!isAuthorized) return;

      try {
        await deleteDoc(doc(db, COLLECTION_NAME, data.id));
      } catch (err) {
        console.error("Silme hatası:", err);
        alert("Silme işlemi başarısız: " + err.message);
      }
    });

    card.appendChild(acts);
  }

  card.addEventListener("click", () => openViewModal(data));
  return card;
}

/* ===================================================
   DETAY / OKUMA MODALI
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

  const rawAuthor = data.authorName || data.author || "Grotesk Yazarı";
  const authorDisp = toTitleCase(rawAuthor);

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

  listenComments(data.id, data.authorUid);

  if (submitCommentBtn) {
    const newSubmitBtn = submitCommentBtn.cloneNode(true);
    submitCommentBtn.replaceWith(newSubmitBtn);
    newSubmitBtn.addEventListener("click", () => addComment(data.id));
  }

  if (viewActions) {
    viewActions.innerHTML = "";
    const isOwner = currentRole === "author" && auth.currentUser && (
      (data.authorUid && data.authorUid === auth.currentUser.uid) ||
      (!data.authorUid && normalizeAuthorKey(data.authorName) === currentAuthorKey) ||
      isAdmin
    );

    if (isOwner) {
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
        const isAuthorized = await requestAuthorReauth("İçeriği Sil");
        if (!isAuthorized) return;

        viewModal.classList.add("hidden");
        try {
          await deleteDoc(doc(db, COLLECTION_NAME, data.id));
        } catch (err) {
          console.error("Silme hatası:", err);
          alert("Silme işlemi başarısız: " + err.message);
        }
      });

      viewActions.appendChild(editBtn);
      viewActions.appendChild(delBtn);
    }
  }

  viewModal.classList.remove("hidden");
}

/* ===================================================
   DÜZENLEME MODALI (SADECE İÇERİK SAHİBİ YAZAR VEYA ADMIN)
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
  if (editAuthor) editAuthor.value = toTitleCase(data.authorName || data.author || currentAuthorName);
  if (editOwn) editOwn.checked = !!data.isOwn;
  if (editHidden) editHidden.checked = !!data.isHidden;
  if (editOwnRow) editOwnRow.style.display = data.category === "metinler" ? "" : "none";

  if (editModal) editModal.classList.remove("hidden");
}

if (submitEditBtn) {
  submitEditBtn.addEventListener("click", async () => {
    if (!currentEditingId || !auth.currentUser) return;

    // Tekrar şifre doğrulaması
    const isAuthorized = await requestAuthorReauth("Değişiklikleri Kaydet");
    if (!isAuthorized) return;

    const editTitle = document.getElementById("edit-title")?.value.trim() || "Başlıksız";
    const editComment = document.getElementById("edit-comment")?.value.trim() || "";
    const editOwn = document.getElementById("edit-own")?.checked || false;
    const editHidden = document.getElementById("edit-hidden")?.checked || false;

    submitEditBtn.disabled = true;
    submitEditBtn.innerText = "Kaydediliyor...";

    try {
      const updatePayload = {
        title: editTitle,
        comment: editComment,
        isOwn: editOwn,
        isHidden: editHidden
      };

      // Eğer eski belgede authorUid eksikse bu güncellemede mevcut yazarın uid'si bağlanır
      if (!currentEditingData?.authorUid) {
        updatePayload.authorUid = auth.currentUser.uid;
        updatePayload.authorKey = currentAuthorKey;
      }

      await updateDoc(doc(db, COLLECTION_NAME, currentEditingId), updatePayload);

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

document.addEventListener("DOMContentLoaded", () => {
  updateSavedBadge();
});
