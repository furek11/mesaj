import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 🛠️ MANUEL SUNUCU SEÇİMİ AYARI
// Hangi sunucudan başlamasını istiyorsan o numarayı yaz (1, 2 veya 3)
const MANUEL_DEPO_SECIMI = 3; 
// ==========================================

const firebaseAccounts = [
  {
    name: "Ana Sunucu (Hesap 1)",
    apiKey: "AIzaSyB9zGumn_UR6DZnuKswrMie1SgCCCAagMw",
    authDomain: "ozel-wp-klon.firebaseapp.com",
    projectId: "ozel-wp-klon",
    storageBucket: "ozel-wp-klon.firebasestorage.app",
    messagingSenderId: "544437866212",
    appId: "1:544437866212:web:9766c694b0c849b37b26f1"
  },
  {
    name: "Yedek Sunucu (Hesap 2)",
    apiKey: "AIzaSyA2HypIsEsybnYBTaEGZr_uNdn-2kO60Cw",
    authDomain: "ozel-wp-klon0.firebaseapp.com",
    projectId: "ozel-wp-klon0",
    storageBucket: "ozel-wp-klon0.firebasestorage.app",
    messagingSenderId: "9575430594",
    appId: "1:9575430594:web:d651b89509c9437444be5b"
  },
  // 👇 YENİ EKLEDİĞİMİZ 3. HESAP TAM OLARAK BURADA
  {
    name: "Yedek Sunucu 2 (Hesap 3)",
    apiKey: "AIzaSyB4n4hp8RD39NL5rE3OnCc02ygChkIkYhQ",
    authDomain: "ozel-wp-klon1.firebaseapp.com",
    projectId: "ozel-wp-klon1",
    storageBucket: "ozel-wp-klon1.firebasestorage.app",
    messagingSenderId: "467098321527",
    appId: "1:467098321527:web:8a93a16751a967e9757c72"
  }
];

export let db;
let currentApp;

let currentAccountIndex = (MANUEL_DEPO_SECIMI >= 1 && MANUEL_DEPO_SECIMI <= firebaseAccounts.length) 
    ? MANUEL_DEPO_SECIMI - 1 
    : 0;

function connectToFirebase(config) {
    console.log(`📡 ${config.name} sunucusuna bağlanılıyor...`);
    currentApp = initializeApp(config, config.projectId); 
    db = getFirestore(currentApp);
}

// Seçilen sunucuyla başlat
connectToFirebase(firebaseAccounts[currentAccountIndex]);

// Kota dolduğunda sırayla kaydıran fonksiyon
export function switchDatabaseAccount() {
    currentAccountIndex++;

    // Eğer 3. hesap da dolarsa otomatik olarak 1. hesaba geri döner
    if (currentAccountIndex >= firebaseAccounts.length) {
        console.error("❌ Tüm yedek depoların kotası tükendi! Başka hesap kalmadı.");
        currentAccountIndex = 0; 
    }

    const nextConfig = firebaseAccounts[currentAccountIndex];
    console.warn(`⚠️ Kotanın dolduğu algılandı! Otomatik geçiş yapılan depo: ${nextConfig.name}`);
    
    connectToFirebase(nextConfig);
}