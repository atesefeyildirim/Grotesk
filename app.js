import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
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
  deleteField,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const COLLECTION_NAME = "grotesk_entries";
const AUTHORS_COLLECTION = "authors";
const ADMINS_COLLECTION = "admins";
const INTERNAL_DOMAIN = "grotesk.internal";
const DEFAULT_AVATAR = "avatar-angel.png";

// Dinamik yönetici keşfi (Firestore admins koleksiyonundan otomatik okunur)
async function getDynamicAdminNicks() {
  try {
    const snap = await getDocs(collection(db, ADMINS_COLLECTION));
    const nicks = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data?.nick) nicks.push(data.nick);
    });
    if (!nicks.includes("elektra")) nicks.push("elektra");
    return nicks;
  } catch {
    return ["elektra"];
  }
}

/* ===================================================
   YARDIMCI VE DÖNÜŞTÜRME FONKSİYONLARI
   =================================================== */
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

function nickToInternalEmail(nick) {
  const key = normalizeAuthorKey(nick);
  return `${key}@${INTERNAL_DOMAIN}`;
}

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
   OTURUM VE ROL YÖNETİMİ
   =================================================== */
let currentRole = localStorage.getItem("grotesk_role") || "";
let currentAuthorName = "";
let currentAuthorKey = "";
let activeAuthorContext = "";
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
const navProfileLink = document.getElementById("nav-profile-link");
const navAddAuthorLink = document.getElementById("nav-add-author-link");
const adminCreateAuthorWrap = document.getElementById("admin-create-author-wrap");

// Oturum durumu dinleyicisi
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentRole = "author";
    localStorage.setItem("grotesk_role", "author");

    const realUserKey = user.email ? user.email.replace(`@${INTERNAL_DOMAIN}`, "") : "";
    
    // Admin kontrolü (admins/{uid})
    try {
      const adminDoc = await getDoc(doc(db, ADMINS_COLLECTION, user.uid));
      isAdmin = adminDoc.exists();
    } catch {
      isAdmin = false;
    }

    // Master login ile belirlenmiş hedef yazar bağlamı var mı?
    const savedImpersonate = sessionStorage.getItem("grotesk_impersonate");
    if (isAdmin && savedImpersonate) {
      activeAuthorContext = normalizeAuthorKey(savedImpersonate);
      currentAuthorKey = activeAuthorContext;
      currentAuthorName = toTitleCase(savedImpersonate);
    } else {
      activeAuthorContext = "";
      currentAuthorKey = realUserKey;
      currentAuthorName = user.displayName ? toTitleCase(user.displayName) : toTitleCase(realUserKey);
    }

    showMainSite("author");
    listenEntries();
    listenAuthors();
    loadProfilePanelData();
  } else {
    activeAuthorContext = "";
    sessionStorage.removeItem("grotesk_impersonate");
    if (currentRole === "reader") {
      isAdmin = false;
      currentAuthorName = "";
      currentAuthorKey = "";
      showMainSite("reader");
      listenEntries();
      listenAuthors();
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

  if (navProfileLink) {
    if (role === "author") navProfileLink.classList.remove("hidden");
    else navProfileLink.classList.add("hidden");
  }

  if (navAddAuthorLink) {
    if (isAdmin) navAddAuthorLink.classList.remove("hidden");
    else navAddAuthorLink.classList.add("hidden");
  }

  if (adminCreateAuthorWrap) {
    if (isAdmin) adminCreateAuthorWrap.classList.remove("hidden");
    else adminCreateAuthorWrap.classList.add("hidden");
  }

  if (roleBadge) {
    if (role === "author") {
      let roleText = "Yazar Modu";
      if (isAdmin) {
        roleText = activeAuthorContext ? `Yönetici (${toTitleCase(activeAuthorContext)})` : "Yönetici";
      }
      roleBadge.innerText = `${currentAuthorName || 'Yazar'} • ${roleText}`;
    } else {
      roleBadge.innerText = "Okuyucu Modu";
    }
  }
}

/* ===================================================
   GİRİŞ VE ÇIKIŞ İŞLEMLERİ (MASTER LOGİN DAHİL)
   =================================================== */
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
    const targetKey = normalizeAuthorKey(nick);

    if (btnAuthor) {
      btnAuthor.disabled = true;
      btnAuthor.innerText = "Giriş Yapılıyor...";
    }

    try {
      // 1) Standart Yazar Girişi Denemesi
      await signInWithEmailAndPassword(auth, email, pass);
      sessionStorage.removeItem("grotesk_impersonate");
      if (loginPass) loginPass.value = "";
      if (loginNick) loginNick.value = "";
    } catch (err) {
      // 2) Normal giriş başarısız; Admin Master Giriş Kontrolü
      // Girilen şifre herhangi bir yöneticinin gerçek şifresi ile eşleşiyor mu?
      let adminSuccess = false;
      const dynamicAdminNicks = await getDynamicAdminNicks();
      for (const adminNick of dynamicAdminNicks) {
        try {
          const adminEmail = nickToInternalEmail(adminNick);
          await signInWithEmailAndPassword(auth, adminEmail, pass);
          adminSuccess = true;

          // Eğer hedef nick yöneticinin kendi nicki değilse impersonation ayarla
          if (targetKey !== normalizeAuthorKey(adminNick)) {
            sessionStorage.setItem("grotesk_impersonate", nick);
          } else {
            sessionStorage.removeItem("grotesk_impersonate");
          }
          break;
        } catch {
          // Bu admin şifresi değil, diğer admin varsa dene
        }
      }

      if (adminSuccess) {
        if (loginPass) loginPass.value = "";
        if (loginNick) loginNick.value = "";
      } else {
        if (loginError) {
          if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
            loginError.innerText = "Hatalı yazar ismi veya şifre.";
          } else if (err.code === "auth/user-not-found") {
            loginError.innerText = "Kayıtlı yazar bulunamadı.";
          } else if (err.code === "auth/too-many-requests") {
            loginError.innerText = "Çok fazla başarısız deneme. Lütfen biraz bekleyin.";
          } else {
            loginError.innerText = "Giriş başarısız: " + (err.message || "");
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
    activeAuthorContext = "";
    sessionStorage.removeItem("grotesk_impersonate");
    showMainSite("reader");
    listenEntries();
    listenAuthors();
  });
}

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
    activeAuthorContext = "";
    sessionStorage.removeItem("grotesk_impersonate");
    showLoginPage();
  });
}

/* ===================================================
   GENEL SİTE TANITIMI (MODAL)
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
   ŞİFRE TEKRAR DOĞRULAMA (REAUTHENTICATE)
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

function requestAuthorReauth(actionTitle = "İşlemi Onayla") {
  return new Promise((resolve) => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      alert("Bu işlem için yazar oturumu gereklidir.");
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

        authorAuthModal.classList.add("hidden");
        activeAuthResolver = null;
        resolve(true);
      } catch (err) {
        if (authorAuthError) {
          if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
            authorAuthError.innerText = "Hatalı şifre. Lütfen tekrar deneyin.";
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
   PANEL GEÇİŞLERİ
   =================================================== */
const panelLinks = document.querySelectorAll(".panel-link");
const panels = document.querySelectorAll(".panel");

function switchPanel(targetPanel) {
  panelLinks.forEach(l => {
    if (l.dataset.panel === targetPanel) l.classList.add("active");
    else l.classList.remove("active");
  });
  panels.forEach(p => {
    if (p.id === `panel-${targetPanel}`) p.classList.add("active");
    else p.classList.remove("active");
  });
}

panelLinks.forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetPanel = link.dataset.panel;
    switchPanel(targetPanel);
  });
});

const savedToggleBtn = document.getElementById("saved-toggle-btn");
if (savedToggleBtn) {
  savedToggleBtn.addEventListener("click", () => {
    switchPanel("saved");
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

  // 1) Anında yerel durumu ve arayüzü güncelle (gecikmeyi ve senkronizasyon hatasını önler)
  if (!isLiked) {
    localStorage.setItem(likeKey, 'true');
  } else {
    localStorage.removeItem(likeKey);
  }

  const entry = allEntries.find(e => e.id === docId);
  if (entry) {
    entry.likes = Math.max(0, (entry.likes || 0) + (!isLiked ? 1 : -1));
  }
  renderAllEntries();

  // 2) Firestore veritabanını güncelle
  try {
    if (!isLiked) {
      await updateDoc(docRef, { likes: increment(1) });
    } else {
      await updateDoc(docRef, { likes: increment(-1) });
    }
  } catch (err) {
    console.error("Beğeni işlemi hatası:", err);
    // Hata durumunda yerel durumu geri al
    if (!isLiked) {
      localStorage.removeItem(likeKey);
    } else {
      localStorage.setItem(likeKey, 'true');
    }
    if (entry) {
      entry.likes = Math.max(0, (entry.likes || 0) + (!isLiked ? -1 : 1));
    }
    renderAllEntries();
  }
}

/* ===================================================
   YORUMLAR SİSTEMİ
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

    allEntries.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    renderAllEntries();
    updateSavedBadge();
    renderAuthorsList();
  }, (err) => {
    console.error("Firestore Dinleme Hatası:", err);
  });
}

const searchInput = document.getElementById("search-input");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderAllEntries();
    renderAuthorsList();
  });
}

function searchNormalize(str) {
  if (!str) return "";
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function filterEntriesByAuthor(authorName) {
  if (searchInput) {
    searchInput.value = authorName;
    switchPanel("home");
    renderAllEntries();
    renderAuthorsList();
  }
}

function renderAllEntries() {
  const rawTerm = searchInput?.value.trim() || "";
  const searchTerm = searchNormalize(rawTerm);
  const categories = ["home", "metinler", "muzik", "resim", "fotograf", "sinema", "performans", "saved"];

  categories.forEach(cat => {
    const el = document.getElementById(`${cat}-entries`);
    if (el) el.innerHTML = "";
  });

  const savedIds = getSavedPosts();

  const filtered = allEntries.filter(item => {
    if (item.isHidden && currentRole === "reader") return false;

    if (!searchTerm) return true;
    const t = searchNormalize(item.title || "");
    const c = searchNormalize(item.comment || "");
    const a = searchNormalize(item.authorName || item.author || "");
    const cat = searchNormalize(item.category || "");
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

  const rawAuthor = data.authorName || data.author || "Grotesk Yazarı";
  const authorDisp = toTitleCase(rawAuthor);

  // Yazar avatar küçük görseli için allAuthorsList'ten bul
  const authorProfile = allAuthorsList.find(a =>
    normalizeAuthorKey(a.authorKey || a.id) === normalizeAuthorKey(rawAuthor)
  );
  const authorInlineAvatar = authorProfile?.avatarUrl || DEFAULT_AVATAR;

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
      <div class="entry-own author-clickable" title="Yazarın yazılarını gör"><img src="${escapeHtml(authorInlineAvatar)}" class="author-inline-avatar" alt="" /><span>${escapeHtml(authorDisp)}</span></div>
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

  // Yazar adına tıklandığında yazara göre filtrele
  const authorNameEl = card.querySelector(".entry-own");
  if (authorNameEl) {
    authorNameEl.addEventListener("click", (e) => {
      e.stopPropagation();
      filterEntriesByAuthor(authorDisp);
    });
  }

  const likeBtn = card.querySelector(".like-card-btn");
  if (likeBtn) {
    likeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleLike(data.id);
    });
  }

  const bookBtn = card.querySelector(".bookmark-card-btn");
  if (bookBtn) {
    bookBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSavePost(data.id);
    });
  }

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

  // Modal için yazar avatarı
  const viewAuthorProfile = allAuthorsList.find(a =>
    normalizeAuthorKey(a.authorKey || a.id) === normalizeAuthorKey(rawAuthor)
  );
  const viewAuthorAvatar = viewAuthorProfile?.avatarUrl || DEFAULT_AVATAR;

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
      <img src="${escapeHtml(viewAuthorAvatar)}" class="author-inline-avatar" alt="" style="margin: 0 6px 0 8px;" />
      <span class="author-val author-clickable" title="Yazarın yazılarını gör">${escapeHtml(authorDisp)}</span>
    </div>
    <div class="view-body-clear"></div>
  `;

  viewBody.innerHTML = html;

  const authorClickVal = viewBody.querySelector(".author-val");
  if (authorClickVal) {
    authorClickVal.addEventListener("click", () => {
      viewModal.classList.add("hidden");
      filterEntriesByAuthor(authorDisp);
    });
  }

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
   DÜZENLEME MODALI
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

/* ===================================================
   GROTESK YAZARLARI LİSTESİ (VİTRİN PANELİ)
   =================================================== */
let allAuthorsList = [];
let currentAdminUids = new Set();
let authorsUnsubscribe = null;

/* ===================================================
   YÖNETİCİ: YAZAR PROFİLİ DÜZENLEME MODALI
   =================================================== */
let authorEditAvatarData = "";
let authorEditTargetKey = "";

const authorEditModal = document.getElementById("author-edit-modal");
const closeAuthorEditModalBtn = document.getElementById("close-author-edit-modal");
const authorEditAvatarPreview = document.getElementById("author-edit-avatar-preview");
const authorEditAvatarInput = document.getElementById("author-edit-avatar-input");
const btnAuthorEditResetAvatar = document.getElementById("btn-author-edit-reset-avatar");
const btnAuthorEditSave = document.getElementById("btn-author-edit-save");

if (closeAuthorEditModalBtn) {
  closeAuthorEditModalBtn.addEventListener("click", () => {
    if (authorEditModal) authorEditModal.classList.add("hidden");
  });
}
if (authorEditModal) {
  authorEditModal.addEventListener("click", (e) => {
    if (e.target === authorEditModal) authorEditModal.classList.add("hidden");
  });
}
if (authorEditAvatarInput) {
  authorEditAvatarInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert("Profil görseli 500 KB'dan küçük olmalıdır.");
      return;
    }
    try {
      authorEditAvatarData = await fileToBase64(file);
      if (authorEditAvatarPreview) authorEditAvatarPreview.src = authorEditAvatarData;
    } catch (err) {
      console.error("Görsel okunamadı:", err);
    }
  });
}
if (btnAuthorEditResetAvatar) {
  btnAuthorEditResetAvatar.addEventListener("click", () => {
    authorEditAvatarData = DEFAULT_AVATAR;
    if (authorEditAvatarPreview) authorEditAvatarPreview.src = DEFAULT_AVATAR;
  });
}

function openAuthorEditModal(author) {
  if (!authorEditModal) return;
  const titleEl = document.getElementById("author-edit-modal-title");
  const nameInput = document.getElementById("author-edit-name");
  const bioInput = document.getElementById("author-edit-bio");
  const statusEl = document.getElementById("author-edit-status");

  authorEditTargetKey = normalizeAuthorKey(author.authorKey || author.id);
  const dispName = toTitleCase(author.authorName || author.id);

  if (titleEl) titleEl.innerText = `Profil: ${dispName}`;
  if (nameInput) nameInput.value = author.authorName || "";
  if (bioInput) bioInput.value = author.bio || "";
  if (statusEl) { statusEl.innerText = ""; statusEl.className = "form-status-msg"; }

  authorEditAvatarData = author.avatarUrl || DEFAULT_AVATAR;
  if (authorEditAvatarPreview) authorEditAvatarPreview.src = authorEditAvatarData;
  if (authorEditAvatarInput) authorEditAvatarInput.value = "";

  authorEditModal.classList.remove("hidden");
}

if (btnAuthorEditSave) {
  btnAuthorEditSave.addEventListener("click", async () => {
    if (!isAdmin || !authorEditTargetKey) return;
    const nameInput = document.getElementById("author-edit-name");
    const bioInput = document.getElementById("author-edit-bio");
    const statusEl = document.getElementById("author-edit-status");

    const newName = nameInput?.value.trim() || "";
    const newBio = bioInput?.value.trim() || "";

    if (!newName) {
      if (statusEl) { statusEl.className = "form-status-msg error"; statusEl.innerText = "Lütfen bir yazar ismi girin."; }
      return;
    }

    if (authorEditAvatarData && authorEditAvatarData.length > 750000) {
      if (statusEl) { statusEl.className = "form-status-msg error"; statusEl.innerText = "Profil fotoğrafı boyutu çok büyük (maks 500 KB)."; }
      return;
    }

    btnAuthorEditSave.disabled = true;
    btnAuthorEditSave.innerText = "Kaydediliyor...";
    if (statusEl) { statusEl.className = "form-status-msg"; statusEl.innerText = ""; }

    try {
      const newTitleName = toTitleCase(newName);
      await setDoc(doc(db, AUTHORS_COLLECTION, authorEditTargetKey), {
        authorName: newTitleName,
        bio: newBio || "",
        avatarUrl: authorEditAvatarData || DEFAULT_AVATAR,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (statusEl) { statusEl.className = "form-status-msg success"; statusEl.innerText = "Profil başarıyla güncellendi."; }
    } catch (err) {
      console.error("Admin profil güncelleme hatası:", err);
      if (statusEl) { statusEl.className = "form-status-msg error"; statusEl.innerText = "Hata: " + (err.message || "Güncelleme yapılamadı."); }
    } finally {
      btnAuthorEditSave.disabled = false;
      btnAuthorEditSave.innerText = "Değişiklikleri Kaydet";
    }
  });
}

async function refreshAdminUids() {
  try {
    const adminSnap = await getDocs(collection(db, ADMINS_COLLECTION));
    currentAdminUids = new Set(adminSnap.docs.map(d => d.id));
  } catch {
    currentAdminUids = new Set();
  }
}

function listenAuthors() {
  if (authorsUnsubscribe) {
    authorsUnsubscribe();
    authorsUnsubscribe = null;
  }

  const q = collection(db, AUTHORS_COLLECTION);
  authorsUnsubscribe = onSnapshot(q, async (snapshot) => {
    await refreshAdminUids();
    allAuthorsList = [];
    snapshot.forEach(docSnap => {
      allAuthorsList.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAuthorsList();
  }, (err) => {
    console.warn("Yazarlar listesi dinleme:", err);
  });
}

function renderAuthorsList() {
  const container = document.getElementById("authors-list");
  if (!container) return;
  container.innerHTML = "";

  const rawTerm = searchInput?.value.trim() || "";
  const searchTerm = searchNormalize(rawTerm);

  const filteredAuthors = allAuthorsList.filter(author => {
    if (!searchTerm) return true;
    const name = searchNormalize(author.authorName || "");
    const nick = searchNormalize(author.authorKey || author.id || "");
    const bio = searchNormalize(author.bio || "");
    return name.includes(searchTerm) || nick.includes(searchTerm) || bio.includes(searchTerm);
  });

  if (filteredAuthors.length === 0) {
    container.innerHTML = searchTerm 
      ? '<div class="empty">— Arama kriterine uygun yazar bulunamadı —</div>'
      : '<div class="empty">— Henüz kayıtlı yazar bulunmuyor —</div>';
    return;
  }

  filteredAuthors.forEach(author => {
    const dispName = toTitleCase(author.authorName || author.id);
    const avatar = author.avatarUrl || DEFAULT_AVATAR;
    const bio = author.bio || "Grotesk yazarı.";
    const authorKey = normalizeAuthorKey(author.authorKey || author.id);
    const authorUid = author.authorUid || "";

    const isAuthorAdmin = (authorUid && currentAdminUids.has(authorUid)) || author.isAdmin;

    // Yazarın yayınladığı toplam yazı sayısı
    const postCount = allEntries.filter(e => 
      normalizeAuthorKey(e.authorKey) === authorKey ||
      normalizeAuthorKey(e.authorName) === authorKey
    ).length;

    let adminActionBtnHtml = "";
    if (isAdmin && authorUid) {
      if (isAuthorAdmin) {
        // Kendi kartında "Yöneticiliği Kaldır" butonunu gösterme
        if (authorUid !== auth.currentUser?.uid) {
          adminActionBtnHtml = `<button type="button" class="author-admin-btn is-admin" data-action="revoke">Yöneticiliği Kaldır</button>`;
        }
      } else {
        adminActionBtnHtml = `<button type="button" class="author-admin-btn" data-action="grant">+ Yönetici Yap</button>`;
      }
    }

    const card = document.createElement("div");
    card.className = "author-card";
    card.innerHTML = `
      <div class="author-card-top">
        <img src="${escapeHtml(avatar)}" alt="${escapeHtml(dispName)}" class="author-card-avatar" />
        <div class="author-card-info">
          <div class="author-card-name">${escapeHtml(dispName)}</div>
          <div class="author-card-nick">
            @${escapeHtml(authorKey)}
            ${isAuthorAdmin ? '<span class="author-role-tag">Yönetici</span>' : ''}
          </div>
        </div>
      </div>
      <div class="author-card-bio">${escapeHtml(bio)}</div>
      <div class="author-card-stats">${postCount} İçerik / İnceleme</div>
      ${adminActionBtnHtml}
    `;

    card.addEventListener("click", () => {
      if (isAdmin) {
        openAuthorEditModal(author);
      } else if (currentRole === "author" && auth.currentUser && authorUid === auth.currentUser.uid) {
        switchPanel("profile");
      } else {
        filterEntriesByAuthor(dispName);
      }
    });

    const adminToggleBtn = card.querySelector(".author-admin-btn");
    if (adminToggleBtn) {
      adminToggleBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = adminToggleBtn.dataset.action;
        const actionText = action === "grant" ? "Yönetici Yetkisi Ver" : "Yönetici Yetkisini Kaldır";

        if (!confirm(`"${dispName}" yazarının ${actionText.toLowerCase()} işlemini onaylıyor musunuz?`)) {
          return;
        }

        const isVerified = await requestAuthorReauth(actionText);
        if (!isVerified) return;

        try {
          if (action === "grant") {
            await setDoc(doc(db, ADMINS_COLLECTION, authorUid), {
              nick: authorKey,
              createdAt: serverTimestamp()
            });
            await setDoc(doc(db, AUTHORS_COLLECTION, authorKey), { isAdmin: true }, { merge: true });
          } else {
            await deleteDoc(doc(db, ADMINS_COLLECTION, authorUid));
            await setDoc(doc(db, AUTHORS_COLLECTION, authorKey), { isAdmin: false }, { merge: true });
          }
          await refreshAdminUids();
          renderAuthorsList();
          alert(`İşlem başarılı: "${dispName}" için ${actionText.toLowerCase()} tamamlandı.`);
        } catch (err) {
          console.error("Yönetici yetki işlemi hatası:", err);
          alert("Yetki işlemi sırasında hata oluştu: " + err.message);
        }
      });
    }

    container.appendChild(card);
  });
}

/* ===================================================
   YAZAR PROFİLİ DÜZENLEME PANELİ
   =================================================== */
let currentProfileAvatarData = "";

async function loadProfilePanelData() {
  if (!auth.currentUser) return;
  const profileNameInput = document.getElementById("profile-name");
  const profileBioInput = document.getElementById("profile-bio");
  const profileAvatarPreview = document.getElementById("profile-avatar-preview");
  const profileStatus = document.getElementById("profile-status-msg");

  if (profileStatus) profileStatus.innerText = "";

  try {
    const authorDocSnap = await getDoc(doc(db, AUTHORS_COLLECTION, currentAuthorKey));
    if (authorDocSnap.exists()) {
      const data = authorDocSnap.data();
      if (profileNameInput) profileNameInput.value = data.authorName || currentAuthorName;
      if (profileBioInput) profileBioInput.value = data.bio || "";
      currentProfileAvatarData = data.avatarUrl || DEFAULT_AVATAR;
      if (profileAvatarPreview) profileAvatarPreview.src = currentProfileAvatarData;
    } else {
      if (profileNameInput) profileNameInput.value = currentAuthorName;
      currentProfileAvatarData = DEFAULT_AVATAR;
      if (profileAvatarPreview) profileAvatarPreview.src = DEFAULT_AVATAR;
    }
  } catch (err) {
    console.warn("Profil verisi yüklenirken hata:", err);
  }
}

// Profil fotoğrafı seçimi
const profileAvatarInput = document.getElementById("profile-avatar-input");
const profileAvatarPreview = document.getElementById("profile-avatar-preview");
const btnResetAvatar = document.getElementById("btn-reset-avatar");

if (profileAvatarInput) {
  profileAvatarInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500 * 1024) {
        alert("Profil görseli 500 KB'dan küçük olmalıdır.");
        return;
      }
      try {
        currentProfileAvatarData = await fileToBase64(file);
        if (profileAvatarPreview) profileAvatarPreview.src = currentProfileAvatarData;
      } catch (err) {
        console.error("Görsel okunamadı:", err);
      }
    }
  });
}

if (btnResetAvatar) {
  btnResetAvatar.addEventListener("click", () => {
    currentProfileAvatarData = DEFAULT_AVATAR;
    if (profileAvatarPreview) profileAvatarPreview.src = DEFAULT_AVATAR;
  });
}

// Profil Kaydetme Butonu
const btnSaveProfile = document.getElementById("btn-save-profile");
if (btnSaveProfile) {
  btnSaveProfile.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const nameInput = document.getElementById("profile-name")?.value.trim();
    const bioInput = document.getElementById("profile-bio")?.value.trim();
    const currentPass = document.getElementById("profile-current-pass")?.value || "";
    const newPass = document.getElementById("profile-new-pass")?.value || "";
    const statusMsg = document.getElementById("profile-status-msg");

    if (!nameInput) {
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        statusMsg.innerText = "Lütfen geçerli bir yazar ismi girin.";
      }
      return;
    }

    if (!currentPass) {
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        statusMsg.innerText = "Değişiklikleri kaydetmek için lütfen mevcut şifrenizi girin.";
      }
      return;
    }

    if (newPass && newPass.length < 6) {
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        statusMsg.innerText = "Yeni şifre en az 6 karakter olmalıdır.";
      }
      return;
    }

    if (currentProfileAvatarData && currentProfileAvatarData.length > 750000) {
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        statusMsg.innerText = "Profil fotoğrafı boyutu çok büyük (maks 500 KB).";
      }
      return;
    }

    btnSaveProfile.disabled = true;
    btnSaveProfile.innerText = "Güncelleniyor...";
    if (statusMsg) {
      statusMsg.className = "form-status-msg";
      statusMsg.innerText = "Doğrulanıyor...";
    }

    try {
      // 1) Mevcut şifreyi Firebase Auth ile doğrula
      const cred = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(user, cred);

      // 2) Eğer yeni şifre varsa güncelle
      if (newPass) {
        await updatePassword(user, newPass);
      }

      // 3) Auth profil ismini güncelle
      const newTitleName = toTitleCase(nameInput);
      await updateProfile(user, { displayName: newTitleName });

      // 4) Firestore authors koleksiyonunu güncelle (varsa eski passcodeHash temizlenir)
      await setDoc(doc(db, AUTHORS_COLLECTION, currentAuthorKey), {
        authorUid: user.uid,
        authorName: newTitleName,
        authorKey: currentAuthorKey,
        bio: bioInput || "",
        avatarUrl: currentProfileAvatarData || DEFAULT_AVATAR,
        passcodeHash: deleteField(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      currentAuthorName = newTitleName;
      showMainSite("author");

      const currentPassEl = document.getElementById("profile-current-pass");
      const newPassEl = document.getElementById("profile-new-pass");
      if (currentPassEl) currentPassEl.value = "";
      if (newPassEl) newPassEl.value = "";

      if (statusMsg) {
        statusMsg.className = "form-status-msg success";
        statusMsg.innerText = "Profil bilgileriniz başarıyla güncellendi.";
      }
    } catch (err) {
      console.error("Profil güncelleme hatası:", err);
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
          statusMsg.innerText = "Girdiğiniz mevcut şifre hatalı.";
        } else {
          statusMsg.innerText = "Hata: " + (err.message || "Güncelleme yapılamadı.");
        }
      }
    } finally {
      btnSaveProfile.disabled = false;
      btnSaveProfile.innerText = "Profili Güncelle";
    }
  });
}

/* ===================================================
   YÖNETİCİ: YENİ YAZAR EKLEME (İKİNCİL AUTH İLE)
   =================================================== */
const btnAdminCreateAuthor = document.getElementById("btn-admin-create-author");
if (btnAdminCreateAuthor) {
  btnAdminCreateAuthor.addEventListener("click", async () => {
    if (!isAdmin) {
      alert("Bu işlem yalnızca yöneticiler için geçerlidir.");
      return;
    }

    const newNickInput = document.getElementById("admin-new-nick");
    const newPassInput = document.getElementById("admin-new-pass");
    const newBioInput = document.getElementById("admin-new-bio");
    const statusMsg = document.getElementById("admin-create-status");

    const nick = newNickInput?.value.trim() || "";
    const pass = newPassInput?.value || "";
    const bio = newBioInput?.value.trim() || "";

    if (!nick) {
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        statusMsg.innerText = "Lütfen yeni yazar ismi girin.";
      }
      return;
    }

    if (!pass || pass.length < 6) {
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        statusMsg.innerText = "Şifre en az 6 karakter olmalıdır.";
      }
      return;
    }

    const cleanKey = normalizeAuthorKey(nick);
    const newEmail = nickToInternalEmail(nick);
    const dispName = toTitleCase(nick);
    const makeAdmin = document.getElementById("admin-new-is-admin")?.checked || false;

    btnAdminCreateAuthor.disabled = true;
    btnAdminCreateAuthor.innerText = "Oluşturuluyor...";
    if (statusMsg) {
      statusMsg.className = "form-status-msg";
      statusMsg.innerText = "Hesap açılıyor...";
    }

    try {
      // Admin oturumunu düşürmemek için izole ikincil Firebase instance kullanılır
      const secondaryApp = getApps().find(a => a.name === "SecondaryAuth") || initializeApp(firebaseConfig, "SecondaryAuth");
      const secondaryAuth = getAuth(secondaryApp);

      const userCred = await createUserWithEmailAndPassword(secondaryAuth, newEmail, pass);
      await updateProfile(userCred.user, { displayName: dispName });
      await signOut(secondaryAuth); // İkincil oturumu hemen kapat

      // Firestore authors kaydı ekle
      await setDoc(doc(db, AUTHORS_COLLECTION, cleanKey), {
        authorUid: userCred.user.uid,
        authorName: dispName,
        authorKey: cleanKey,
        bio: bio || "Grotesk yazarı.",
        avatarUrl: DEFAULT_AVATAR,
        isAdmin: makeAdmin,
        createdAt: serverTimestamp()
      });

      // Eğer yönetici olarak işaretlendiyse admins koleksiyonuna ekle
      if (makeAdmin) {
        await setDoc(doc(db, ADMINS_COLLECTION, userCred.user.uid), {
          nick: cleanKey,
          createdAt: serverTimestamp()
        });
      }

      if (newNickInput) newNickInput.value = "";
      if (newPassInput) newPassInput.value = "";
      if (newBioInput) newBioInput.value = "";
      if (document.getElementById("admin-new-is-admin")) {
        document.getElementById("admin-new-is-admin").checked = false;
      }

      await refreshAdminUids();
      renderAuthorsList();

      if (statusMsg) {
        statusMsg.className = "form-status-msg success";
        statusMsg.innerText = `'${dispName}' başarıyla yazar${makeAdmin ? ' ve YÖNETİCİ' : ''} olarak eklendi!`;
      }
    } catch (err) {
      console.error("Yazar oluşturma hatası:", err);
      if (statusMsg) {
        statusMsg.className = "form-status-msg error";
        if (err.code === "auth/email-already-in-use") {
          statusMsg.innerText = "Bu yazar ismi zaten sistemde kayıtlı.";
        } else {
          statusMsg.innerText = "Hata: " + (err.message || "Yazar oluşturulamadı.");
        }
      }
    } finally {
      btnAdminCreateAuthor.disabled = false;
      btnAdminCreateAuthor.innerText = "+ Yeni Yazarı Kaydet";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateSavedBadge();
});
