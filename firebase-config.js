import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Tüm hesapları tek bir dizi (array) içinde topladık, isim çakışması önlendi.
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
  }
  // İleride 3. bir hesap açarsan virgül koyup buraya ekleyebilirsin!
];

export let db;
let currentApp;
let currentAccountIndex = 0; // İlk başta 0. indeksteki (Hesap 1) aktif olur.

function connectToFirebase(config) {
    console.log(`📡 ${config.name} sunucusuna bağlanılıyor...`);
    currentApp = initializeApp(config, config.projectId); 
    db = getFirestore(currentApp);
}

// İlk açılışta 1. hesap (0. indeks) ile başla
connectToFirebase(firebaseAccounts[currentAccountIndex]);

// Kota dolduğunda app.js tarafından tetiklenecek vites değiştirme motoru
export function switchDatabaseAccount() {
    currentAccountIndex++;

    // Eğer eldeki tüm hesaplar bittiyse koruma amaçlı ilk hesaba geri dön
    if (currentAccountIndex >= firebaseAccounts.length) {
        console.error("❌ Tüm yedek depoların kotası tükendi! Başka hesap kalmadı.");
        currentAccountIndex = 0; 
    }

    const nextConfig = firebaseAccounts[currentAccountIndex];
    console.warn(`⚠️ Kotanın dolduğu algılandı! Otomatik geçiş yapılan depo: ${nextConfig.name}`);
    
    connectToFirebase(nextConfig);
}