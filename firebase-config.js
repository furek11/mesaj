import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 📩 1. MESAJ SUNUCUSU (5. Sunucu - Yalnızca Mesajlar İçin)
// ==========================================
const mainMsgConfig = {
    apiKey: "AIzaSyAEgExqzkDtW_YoIrsaCOuzdsivYrRCHTc",
    authDomain: "ozel-wp-klon-messages.firebaseapp.com",
    projectId: "ozel-wp-klon-messages",
    storageBucket: "ozel-wp-klon-messages.firebasestorage.app",
    messagingSenderId: "616184530815",
    appId: "1:616184530815:web:f118cd203ecdd506d73c4a"
};

const mainApp = initializeApp(mainMsgConfig, "MainMessageApp");
export const db = getFirestore(mainApp); // app.js sadece bu 'db' üzerinden mesajları işler

// ==========================================
// 💓 2. HEARTBEAT SUNUCULARI (1, 2, 3 ve 4. Sunucular - Yalnızca Çevrimiçi/Presence İçin)
// ==========================================
const heartbeatConfigs = [
    {
        name: "Heartbeat Sunucu 1",
        apiKey: "AIzaSyB9zGumn_UR6DZnuKswrMie1SgCCCAagMw",
        authDomain: "ozel-wp-klon.firebaseapp.com",
        projectId: "ozel-wp-klon",
        storageBucket: "ozel-wp-klon.firebasestorage.app",
        messagingSenderId: "544437866212",
        appId: "1:544437866212:web:9766c694b0c849b37b26f1"
    },
    {
        name: "Heartbeat Sunucu 2",
        apiKey: "AIzaSyA2HypIsEsybnYBTaEGZr_uNdn-2kO60Cw",
        authDomain: "ozel-wp-klon0.firebaseapp.com",
        projectId: "ozel-wp-klon0",
        storageBucket: "ozel-wp-klon0.firebasestorage.app",
        messagingSenderId: "9575430594",
        appId: "1:9575430594:web:d651b89509c9437444be5b"
    },
    {
        name: "Heartbeat Sunucu 3",
        apiKey: "AIzaSyB4n4hp8RD39NL5rE3OnCc02ygChkIkYhQ",
        authDomain: "ozel-wp-klon1.firebaseapp.com",
        projectId: "ozel-wp-klon1",
        storageBucket: "ozel-wp-klon1.firebasestorage.app",
        messagingSenderId: "467098321527",
        appId: "1:467098321527:web:8a93a16751a967e9757c72"
    },
    {
        name: "Heartbeat Sunucu 4",
        apiKey: "AIzaSyDmy-5wq9FvzORSAy3IJCtwcIYmy0nbkWM",
        authDomain: "ozel-wp-klon2.firebaseapp.com",
        projectId: "ozel-wp-klon2",
        storageBucket: "ozel-wp-klon2.firebasestorage.app",
        messagingSenderId: "784124577504",
        appId: "1:784124577504:web:837c7a181e972bf3bab285"
    }
];

// Heartbeat istemcilerini ve veritabanlarını başlat
const hbApps = heartbeatConfigs.map((cfg, index) => initializeApp(cfg, `HeartbeatApp_${index}`));
export const hbDatabases = hbApps.map(app => getFirestore(app));

let currentHbIndex = 0;

/**
 * Otomatik vitesli Heartbeat fonksiyonu:
 * Presence verisini sıradaki sunucuya yazar. Hata/kota alması durumunda milisaniyeler içinde bir sonraki sunucuya geçer.
 */
export async function sendHeartbeat(userId, isOnlineStatus) {
    let attempts = 0;
    
    while (attempts < hbDatabases.length) {
        const activeHbDb = hbDatabases[currentHbIndex];
        try {
            await setDoc(doc(activeHbDb, "presence", userId), {
                isOnline: isOnlineStatus,
                lastActive: Date.now()
            }, { merge: true });
            
            return; // Başarılı yazımda fonksiyondan çık
        } catch (error) {
            console.warn(`⚠️ ${heartbeatConfigs[currentHbIndex].name} kotası doldu/yanıt vermedi. Otomatik geçiş yapılıyor...`);
            currentHbIndex = (currentHbIndex + 1) % hbDatabases.length;
            attempts++;
        }
    }
    console.error("❌ Tüm Heartbeat sunucularının kotası tükenmiş veya erişilemiyor!");
}