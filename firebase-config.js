import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// ⚙️ AKTİF SUNUCU SEÇİMİ (Manuel)
// 0 = Heartbeat Sunucu 1
// 1 = Heartbeat Sunucu 2
// 2 = Heartbeat Sunucu 3
// 3 = Heartbeat Sunucu 4
// ==========================================
export const ACTIVE_SERVER_INDEX = 0;

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
export const db = getFirestore(mainApp);

// ==========================================
// 💓 2. HEARTBEAT SUNUCULARI (Presence / Çevrimiçi İçin)
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

// Yalnızca seçili sunucuyu başlatıyoruz
const activeApp = initializeApp(heartbeatConfigs[ACTIVE_SERVER_INDEX], `HeartbeatApp_${ACTIVE_SERVER_INDEX}`);
export const activeHbDb = getFirestore(activeApp);

export async function sendHeartbeat(userId, isOnlineStatus) {
    try {
        await setDoc(doc(activeHbDb, "presence", userId), {
            isOnline: isOnlineStatus,
            lastActive: Date.now()
        }, { merge: true });
    } catch (error) {
        console.error("Heartbeat gönderilemedi:", error);
    }
}