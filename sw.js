importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Buraya kendi Firebase konfigürasyonunu eklemelisin
const firebaseConfig = {
  apiKey: "AIzaSyB9zGumn_UR6DZnuKswrMie1SgCCCAagMw",
  authDomain: "ozel-wp-klon.firebaseapp.com",
  projectId: "ozel-wp-klon",
  storageBucket: "ozel-wp-klon.firebasestorage.app",
  messagingSenderId: "544437866212",
  appId: "1:544437866212:web:9766c694b0c849b37b26f1"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Arka planda bildirim geldiğinde tetiklenen motor
messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/favicon.ico' // İstersen kendi logo linkini koyabilirsin
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});