// app.js

import { db } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, 
    doc, setDoc, updateDoc, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === EMAILJS AYARLARI ===
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";
// ========================

let currentUser = "";
let chatPartner = "";
let typingTimeout = null;
let isPartnerOnline = false;

// Ses Kayıt Değişkenleri
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let activeStream = null;

// HTML Elemanları
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const currentUserNameEl = document.getElementById("current-user-name");
const chatPartnerNameEl = document.getElementById("chat-partner-name");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages-container");
const fileInput = document.getElementById("file-input");
const voiceBtn = document.getElementById("voice-btn");
const darkModeToggle = document.getElementById("dark-mode-toggle");

// HTML Durum Elemanları
const partnerStatusSidebar = document.getElementById("partner-status-sidebar");
const partnerStatusHeader = document.getElementById("partner-status-header");
const statusIndicatorDot = document.getElementById("status-indicator-dot");
const avatarPlaceholder = document.getElementById("avatar-placeholder");

// Mobil İçin Ekstra Dinamik Eleman Kontrolleri
const sidebarArea = document.querySelector(".w-80, [class*='w-80'], .sidebar"); // Sol menü alanı
const chatArea = document.querySelector(".flex-1, [class*='flex-1'], .chat-area"); // Sağ mesajlaşma alanı

// 1. Karanlık Mod Mantığı
darkModeToggle.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    const chatBg = document.getElementById("chat-bg-layer");
    if(chatBg) {
        if(document.documentElement.classList.contains("dark")) {
            chatBg.style.backgroundBlendMode = "multiply";
        } else {
            chatBg.style.backgroundBlendMode = "overlay";
        }
    }
});

// 2. Giriş Yapma ve Canlı Durum Yönetimi
window.selectUser = function(user) {
    currentUser = user;
    chatPartner = (currentUser === "Kullanıcı 1") ? "Kullanıcı 2" : "Kullanıcı 1";

    currentUserNameEl.textContent = currentUser;
    chatPartnerNameEl.textContent = chatPartner;
    if(avatarPlaceholder) avatarPlaceholder.textContent = chatPartner.charAt(chatPartner.length - 1);

    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    // Mobil Görünüm Optimizasyonu: Giriş yapıldığında doğrudan mesaj alanını göster, sol menüyü mobilde gizle
    applyMobileView("chat");

    setUserPresence(true);
    window.addEventListener("beforeunload", () => { setUserPresence(false); });

    listenForMessages();
    listenPartnerPresence();
    setupTypingListener();
    markIncomingMessagesAsRead();
};

// Mobilde ekran geçişlerini yöneten yardımcı fonksiyon
function applyMobileView(view = "chat") {
    if (window.innerWidth <= 768) {
        if (view === "chat") {
            if (sidebarArea) sidebarArea.classList.add("hidden");
            if (chatArea) {
                chatArea.classList.remove("hidden");
                chatArea.classList.add("flex", "w-full", "h-full");
            }
        } else {
            if (sidebarArea) {
                sidebarArea.classList.remove("hidden");
                sidebarArea.classList.add("w-full", "h-full");
            }
            if (chatArea) chatArea.classList.add("hidden");
        }
    }
}

// Mobilde sohbetten çıkıp listeye dönmek için bir geri butonu eklemek istersen global fonksiyon
window.backToSidebar = function() {
    applyMobileView("sidebar");
};

async function setUserPresence(isOnline) {
    if (!currentUser) return;
    try {
        await setDoc(doc(db, "presence", currentUser), {
            isOnline: isOnline, isTyping: false, lastSeen: serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error(e); }
}

function listenPartnerPresence() {
    onSnapshot(doc(db, "presence", chatPartner), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            isPartnerOnline = data.isOnline;
            
            if (data.isTyping) {
                if(partnerStatusSidebar) {
                    partnerStatusSidebar.textContent = "Yazıyor...";
                    partnerStatusSidebar.className = "text-xs text-emerald-600 dark:text-emerald-400 font-bold animate-pulse mt-0.5";
                }
                if(partnerStatusHeader) {
                    partnerStatusHeader.textContent = "yazıyor...";
                    partnerStatusHeader.className = "text-xs text-emerald-600 dark:text-emerald-400 font-bold animate-pulse mt-0.5";
                }
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-emerald-500 rounded-full shadow-md shadow-emerald-200";
            } else if (data.isOnline) {
                if(partnerStatusSidebar) {
                    partnerStatusSidebar.textContent = "Çevrimiçi";
                    partnerStatusSidebar.className = "text-xs text-emerald-500 font-semibold mt-0.5";
                }
                if(partnerStatusHeader) {
                    partnerStatusHeader.textContent = "Çevrimiçi";
                    partnerStatusHeader.className = "text-xs text-emerald-500 font-medium mt-0.5";
                }
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-emerald-500 rounded-full shadow-md shadow-emerald-200";
                markIncomingMessagesAsRead();
            } else {
                let lastSeenText = "Son görülme bilinmiyor";
                if (data.lastSeen) {
                    const date = data.lastSeen.toDate();
                    lastSeenText = `Son görülme bugün ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                }
                if(partnerStatusSidebar) {
                    partnerStatusSidebar.textContent = lastSeenText;
                    partnerStatusSidebar.className = "text-xs text-gray-400 truncate mt-0.5";
                }
                if(partnerStatusHeader) {
                    partnerStatusHeader.textContent = lastSeenText;
                    partnerStatusHeader.className = "text-xs text-gray-400 font-medium mt-0.5";
                }
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-gray-400 rounded-full";
            }
        }
    });
}

function setupTypingListener() {
    messageInput.addEventListener("input", () => {
        updateDoc(doc(db, "presence", currentUser), { isTyping: true });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            updateDoc(doc(db, "presence", currentUser), { isTyping: false });
        }, 2000);
    });
}

async function markIncomingMessagesAsRead() {
    if (!currentUser || !chatPartner) return;
    try {
        const q = query(collection(db, "messages"), where("sender", "==", chatPartner), where("receiver", "==", currentUser), where("status", "!=", "read"));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((mDoc) => { updateDoc(doc(db, "messages", mDoc.id), { status: "read" }); });
    } catch (e) { console.error(e); }
}

function sendEmailNotification(messageText) {
    if (currentUser === "Kullanıcı 2") {
        const templateParams = { mesaj_icerigi: messageText };
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams).catch((err) => console.error(err));
    }
}

async function sendCustomMessage(payload, type = "text") {
    try {
        updateDoc(doc(db, "presence", currentUser), { isTyping: false });
        const initialStatus = isPartnerOnline ? "delivered" : "sent";

        await addDoc(collection(db, "messages"), {
            sender: currentUser,
            receiver: chatPartner,
            message: type === "text" ? payload : "",
            fileData: type !== "text" ? payload : "",
            messageType: type,
            timestamp: serverTimestamp(),
            status: initialStatus
        });

        sendEmailNotification(type === "text" ? payload : `[Bir ${type} gönderildi]`);
    } catch (e) { console.error(e); }
}

sendBtn.addEventListener("click", () => {
    const text = messageInput.value.trim();
    if (text) { sendCustomMessage(text, "text"); messageInput.value = ""; }
});
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        const text = messageInput.value.trim();
        if (text) { sendCustomMessage(text, "text"); messageInput.value = ""; }
    }
});

window.deleteMessageForEveryone = async function(messageId) {
    try {
        await updateDoc(doc(db, "messages", messageId), {
            message: "Bu mesaj silindi",
            fileData: "",
            messageType: "deleted",
            status: "read"
        });
    } catch (e) { console.error(e); }
};

// 3. Gelişmiş Fotoğraf Sıkıştırma
fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = 600; // Mobilde daha hızlı yüklenmesi için maksimum genişliği 600px yaptık
                const scaleSize = MAX_WIDTH / img.width;
                
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.65);
                sendCustomMessage(compressedBase64, "image");
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        const reader = new FileReader();
        reader.onload = function(event) {
            sendCustomMessage(event.target.result, "file");
        };
        reader.readAsDataURL(file);
    }
    fileInput.value = ""; 
});

// 4. Ultra Güvenli Ses Kayıt Sistemi
async function startVoiceRecording() {
    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(activeStream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data); };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                sendCustomMessage(reader.result, "audio");
            };
            reader.readAsDataURL(audioBlob);

            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
                activeStream = null;
            }
        };

        mediaRecorder.start();
        isRecording = true;
        voiceBtn.classList.add("text-red-500", "animate-pulse");
    } catch (err) {
        console.warn("Mikrofon izni reddedildi veya cihaz bulunamadı:", err);
    }
}

function stopVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        voiceBtn.classList.remove("text-red-500", "animate-pulse");
    }
}

voiceBtn.addEventListener("click", () => {
    if (!isRecording) {
        startVoiceRecording();
    } else {
        stopVoiceRecording();
    }
});

// 5. Gelişmiş Mesaj Listeleme
function listenForMessages() {
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            
            const isBelongsToCurrentChat = 
                (data.sender === currentUser && data.receiver === chatPartner) ||
                (data.sender === chatPartner && data.receiver === currentUser);

            if (!isBelongsToCurrentChat) return;

            if (data.receiver === currentUser && data.status !== "read") {
                updateDoc(doc(db, "messages", msgId), { status: "read" });
            }

            let timeString = "";
            if (data.timestamp) {
                const date = data.timestamp.toDate();
                timeString = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            } else {
                const now = new Date();
                timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            }

            const isMe = data.sender === currentUser;
            let messageBg = isMe ? "bg-[#d9fdd3] dark:bg-emerald-900/40 text-gray-800 dark:text-gray-100 self-end" : "bg-white dark:bg-zinc-700 text-gray-800 dark:text-gray-100 self-start";
            const roundedCorner = isMe ? "rounded-l-xl rounded-br-xl" : "rounded-r-xl rounded-bl-xl";

            if (data.messageType === "deleted") {
                messageBg = isMe ? "bg-gray-200/50 dark:bg-zinc-800 text-gray-400 italic self-end" : "bg-gray-100 dark:bg-zinc-800 text-gray-400 italic self-start";
            }

            let ticksHtml = "";
            if (isMe && data.messageType !== "deleted") {
                if (data.status === "read") {
                    ticksHtml = `<svg class="w-4 h-4 text-sky-500 inline ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M0 12.116l2.553-2.557 5.111 5.116L19.866 2.56 22.42 5.116 7.664 19.868 0 12.116zm6.333 0l2.553-2.557 2.278 2.282-2.553 2.557-2.278-2.282z"/></svg>`;
                } else if (data.status === "delivered") {
                    ticksHtml = `<svg class="w-4 h-4 text-gray-400 inline ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M0 12.116l2.553-2.557 5.111 5.116L19.866 2.56 22.42 5.116 7.664 19.868 0 12.116zm6.333 0l2.553-2.557 2.278 2.282-2.553 2.557-2.278-2.282z"/></svg>`;
                } else {
                    ticksHtml = `<svg class="w-4 h-4 text-gray-400 inline ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
                }
            }

            let deleteBtnHtml = "";
            if (isMe && data.messageType !== "deleted") {
                deleteBtnHtml = `
                    <button onclick="deleteMessageForEveryone('${msgId}')" class="absolute -left-6 top-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0" title="Herkes için sil">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v4M4 7h16" /></svg>
                    </button>
                `;
            }

            let contentBody = "";
            if (data.messageType === "image") {
                contentBody = `<img src="${data.fileData}" class="rounded-lg max-w-[160px] max-h-[160px] md:max-w-[200px] md:max-h-[200px] object-cover cursor-pointer mb-1 shadow-inner" onclick="window.open(this.src)">`;
            } else if (data.messageType === "file") {
                contentBody = `<a href="${data.fileData}" download="dosya" class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs underline mb-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Dosyayı İndir</a>`;
            } else if (data.messageType === "audio") {
                contentBody = `<audio src="${data.fileData}" controls class="w-[180px] md:w-[220px] h-8 mb-1 scale-95 origin-left"></audio>`;
            } else {
                contentBody = `<p class="whitespace-pre-wrap break-words">${data.message}</p>`;
            }

            const messageHtml = `
                <div class="group relative flex flex-col ${isMe ? 'self-end' : 'self-start'}">
                    ${deleteBtnHtml}
                    <div class="max-w-[75vw] md:max-w-md p-2.5 px-4 shadow-sm text-[14.5px] ${messageBg} ${roundedCorner} flex flex-col gap-0.5 relative min-w-[95px]">
                        <div class="pr-8 pb-1">${contentBody}</div>
                        <div class="text-[10px] text-gray-400 dark:text-gray-400/70 absolute bottom-1 right-2 select-none flex items-center gap-0.5">
                            <span>${timeString}</span>
                            ${ticksHtml}
                        </div>
                    </div>
                </div>
            `;
            messagesContainer.insertAdjacentHTML("beforeend", messageHtml);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// Ekran boyutu değiştiğinde yerleşimi otomatik kontrol et
window.addEventListener("resize", () => {
    if (currentUser) {
        applyMobileView("chat");
    }
});