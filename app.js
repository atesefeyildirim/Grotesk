import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";


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


let currentUser = localStorage.getItem("grotesk_user") || "";

const loginPage = document.getElementById("login-page");
const mainSite = document.getElementById("main-site");
const loginForm = document.getElementById("login-form");
const loginUser = document.getElementById("login-user");
const loginError = document.getElementById("login-error");

if (currentUser) {
  showMainSite();
}

if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = loginUser?.value.trim();
    if (!username) {
      if (loginError) loginError.innerText = "Lütfen bir isim girin.";
      return;
    }

    currentUser = username;
    localStorage.setItem("grotesk_user", currentUser);
    showMainSite();
  });
}

function showMainSite() {
  if (loginPage) loginPage.classList.add("hidden");
  if (mainSite) mainSite.classList.remove("hidden");
}


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


const addModal = document.getElementById("add-modal");
const closeAddModalBtn = document.getElementById("close-add-modal");
const addBtns = document.querySelectorAll(".add-btn");
const catBtns = document.querySelectorAll("#cat-select-group .cat-btn");

let selectedCategory = "metinler";

addBtns.forEach(btn => {
  btn.addEventListener("click", () => {
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
}

const fileInput = document.getElementById("entry-file");
const filePreview = document.getElementById("file-preview");

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!filePreview) return;

    if (file) {
      filePreview.innerHTML = `<span style="font-size:0.8rem; color:#aaa;">Seçilen Dosya: ${file.name}</span>`;
    } else {
      filePreview.innerHTML = "";
    }
  });
}

const submitBtn = document.getElementById("submit-entry");
const titleInput = document.getElementById("entry-title");
const commentInput = document.getElementById("entry-comment");
const isOwnCheck = document.getElementById("is-own-text");
const isHiddenCheck = document.getElementById("entry-hidden");

if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    const title = titleInput?.value.trim();
    const comment = commentInput?.value.trim();
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
        author: currentUser || "Anonim",
        isOwn: isOwn,
        isHidden: isHidden,
        fileUrl: fileUrl,
        fileName: fileName,
        createdAt: serverTimestamp()
      });

      // Temizleme
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

function listenEntries() {
  const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    const categories = ["home", "metinler", "muzik", "resim", "fotograf", "sinema", "performans"];
    categories.forEach(cat => {
      const container = document.getElementById(`${cat}-entries`);
      if (container) container.innerHTML = "";
    });

    if (snapshot.empty) return;

    snapshot.forEach((doc) => {
      const data = doc.data();
      

      if (data.isHidden && data.author !== currentUser) {
        return;
      }

      const card = createCard(data, doc.id);

      const targetCatContainer = document.getElementById(`${data.category}-entries`);
      if (targetCatContainer) {
        targetCatContainer.appendChild(card.cloneNode(true));
      }

      // Anasayfaya ekle
      const homeContainer = document.getElementById("home-entries");
      if (homeContainer) {
        homeContainer.appendChild(card);
      }
    });
  });
}

function createCard(data, id) {
  const card = document.createElement("div");
  card.className = "entry-card";

  const dateStr = data.createdAt 
    ? new Date(data.createdAt.seconds * 1000).toLocaleDateString("tr-TR") 
    : "Şimdi";

  const isImage = data.fileUrl && (
    data.fileUrl.includes(".png") || 
    data.fileUrl.includes(".jpg") || 
    data.fileUrl.includes(".jpeg") || 
    data.fileUrl.includes(".webp") ||
    data.fileUrl.includes(".gif")
  );

  card.innerHTML = `
    <div class="entry-thumb">
      ${isImage 
        ? `<img src="${data.fileUrl}" alt="${data.title}">` 
        : `<div class="thumb-logo">GROTESK</div>`}
    </div>
    <div class="entry-meta">
      <div class="entry-cat">${(data.category || "GENEL").toUpperCase()} ${data.isOwn ? '• (Özgün)' : ''}</div>
      <div class="entry-title">${data.title}</div>
      <div class="entry-own">${data.author || 'Anonim'}</div>
      ${data.comment ? `<div class="entry-preview">${data.comment}</div>` : ''}
      <div class="entry-date">${dateStr}</div>
    </div>
  `;


  card.addEventListener("click", () => openViewModal(data));

  return card;
}

const viewModal = document.getElementById("view-modal");
const closeViewModalBtn = document.getElementById("close-view-modal");
const viewBody = document.getElementById("view-body");

if (closeViewModalBtn) {
  closeViewModalBtn.addEventListener("click", () => {
    if (viewModal) viewModal.classList.add("hidden");
  });
}

function openViewModal(data) {
  if (!viewBody || !viewModal) return;

  const isImage = data.fileUrl && (
    data.fileUrl.includes(".png") || 
    data.fileUrl.includes(".jpg") || 
    data.fileUrl.includes(".jpeg") || 
    data.fileUrl.includes(".webp")
  );

  viewBody.innerHTML = `
    <h2 style="font-family:'EB Garamond', serif; font-size:1.8rem; margin-bottom:8px;">${data.title}</h2>
    <div style="font-size:0.8rem; color:#888; margin-bottom:16px;">
      Ekleyen: ${data.author} | Kategori: ${data.category?.toUpperCase()}
    </div>
    ${isImage ? `<img src="${data.fileUrl}" style="max-width:100%; height:auto; margin-bottom:16px; border-radius:4px;">` : ''}
    ${data.fileUrl && !isImage ? `<div style="margin-bottom:16px;"><a href="${data.fileUrl}" target="_blank" style="color:#fff; text-decoration:underline;">Dosyayı İndir / Görüntüle (${data.fileName || 'Ekli Dosya'})</a></div>` : ''}
    <p style="white-space: pre-wrap; line-height:1.6; color:#ddd;">${data.comment || ''}</p>
  `;

  viewModal.classList.remove("hidden");
}


document.addEventListener("DOMContentLoaded", () => {
  listenEntries();
});
