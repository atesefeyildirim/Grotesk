/**
 * GROTESK - Yazar ve İçerik Aktarım Rehberi / Scripti
 * 
 * Bu script iki farklı yöntemle çalışabilir:
 * 
 * YÖNTEM 1 (ÖNERİLEN & OTOMATİK):
 * `app.js` içerisine otomatik geçiş köprüsü entegre edilmiştir. 
 * Mevcut yazarlar siteye ilk kez giriş yaptıklarında eski nicklerini ve şifrelerini girdikleri an:
 * 1. Şifreleri Firestore 'authors' koleksiyonundaki hash ile eşleştirilir.
 * 2. Eşleşme sağlandığı anda Firebase Authentication üzerinde otomatik olarak hesapları oluşturulur.
 * 3. Eski tüm yazıları (`grotesk_entries`) yeni UID ile eşleştirilir.
 * Yazar hiçbir teknik işlem yapmadan doğrudan yeni sisteme aktarılmış olur!
 * 
 * YÖNTEM 2 (TOPLU AKTARIM - ADMIN SDK VEYA BROWSER KONSOLU):
 * Eğer bilinen şifreleri tek seferde toplu aktarmak isterseniz aşağıdaki fonksiyonu kullanabilirsiniz.
 */

// BROWSER KONSOLUNDA VEYA YÖNETİCİ SAYFASINDA ÇALIŞTIRMA ÖRNEĞİ:
export async function batchMigrateKnownAuthors(firebaseAuth, firestoreDb, authorList) {
  /*
  authorList = [
    { nick: "Kuzgun", password: "ornekSifre123" },
    { nick: "Ahmet", password: "baskaSifre456" }
  ];
  */

  const { createUserWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  const { doc, setDoc, getDocs, collection, query, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

  for (const author of authorList) {
    const cleanKey = author.nick.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = `${cleanKey}@grotesk.internal`;

    try {
      console.log(`Aktarılıyor: ${author.nick} (${email})...`);
      const userCred = await createUserWithEmailAndPassword(firebaseAuth, email, author.password);
      await updateProfile(userCred.user, { displayName: author.nick });

      await setDoc(doc(firestoreDb, "authors", cleanKey), {
        authorUid: userCred.user.uid,
        authorName: author.nick,
        authorKey: cleanKey,
        migratedAt: serverTimestamp()
      }, { merge: true });

      // İçerikleri güncelle
      const entriesSnap = await getDocs(query(collection(firestoreDb, "grotesk_entries")));
      entriesSnap.forEach(async (entryDoc) => {
        const d = entryDoc.data();
        const entryAuthor = (d.authorName || d.author || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (entryAuthor === cleanKey) {
          await updateDoc(entryDoc.ref, {
            authorUid: userCred.user.uid,
            authorKey: cleanKey
          });
          console.log(`İçerik bağlandı: ${entryDoc.id} -> ${author.nick}`);
        }
      });

      console.log(`✓ Başarıyla aktarıldı: ${author.nick}`);
    } catch (err) {
      console.error(`Aktarım hatası (${author.nick}):`, err.message);
    }
  }
}
