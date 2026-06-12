// firebase-config.js

// Firebase SDK'larını CDN (web) üzerinden import ediyoruz
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Senin Firebase web uygulaması yapılandırman
const firebaseConfig = {
  apiKey: "AIzaSyB9zGumn_UR6DZnuKswrMie1SgCCCAagMw",
  authDomain: "ozel-wp-klon.firebaseapp.com",
  projectId: "ozel-wp-klon",
  storageBucket: "ozel-wp-klon.firebasestorage.app",
  messagingSenderId: "544437866212",
  appId: "1:544437866212:web:9766c694b0c849b37b26f1"
};

// Firebase'i başlatıyoruz
const app = initializeApp(firebaseConfig);

// Diğer dosyalarda kullanabilmek için Firestore (veritabanı) servisini export ediyoruz
export const db = getFirestore(app);