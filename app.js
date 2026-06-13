import { db } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, 
    doc, setDoc, updateDoc, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === EMAILJS CONFIG ===
const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";

if (typeof emailjs !== "undefined" && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

let currentUser = "";
let chatPartner = "";
let typingTimeout = null;
let isPartnerOnline = false;
let heartbeatInterval = null;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let activeStream = null;

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const currentUserNameEl = document.getElementById("current-user-name");
const chatPartnerNameEl = document.getElementById("chat-partner-name");
const chatHeaderPartnerNameEl = document.getElementById("chat-header-partner-name");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages-container");
const fileInput = document.getElementById("file-input");
const voiceBtn = document.getElementById("voice-btn");
const darkModeToggle = document.getElementById("dark-mode-toggle");
const fullscreenBtn = document.getElementById("fullscreen-btn");

const partnerStatusSidebar = document.getElementById("partner-status-sidebar");
const partnerStatusHeader = document.getElementById("partner-status-header");
const statusIndicatorDot = document.getElementById("status-indicator-dot");
const avatarPlaceholder = document.getElementById("avatar-placeholder");

const sidebarArea = document.getElementById("sidebar-area");
const chatArea = document.getElementById("chat-area");

darkModeToggle.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
});

fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            fullscreenBtn.innerHTML = `<i class="fa-solid fa-compress"></i>`;
        }).catch(err => console.error(err));
    } else {
        document.exitFullscreen().then(() => {
            fullscreenBtn.innerHTML = `<i class="fa-solid fa-expand"></i>`;
        });
    }
});

async function sendEmailNotification(messageText, contentType = "metin") {
    if (isPartnerOnline) return;
    if (EMAILJS_PUBLIC_KEY === "YOUR_PUBLIC_KEY") return;

    const templateParams = {
        to_name: chatPartner,
        from_name: currentUser,
        message: contentType === "metin" ? messageText : `Sana bir ${contentType} gönderdi. Görmek için uygulamaya gir!`,
        reply_to: "no-reply@mesajlasma.com"
    };

    try { await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams); } catch (e) { console.error(e); }
}

function getDocId(name) {
    return name.replace(/\s+/g, '_');
}

// === GÜVENLİ VE MOBİL UYUMLU PING MOTORU ===
async function forceSendPing(isOnlineStatus) {
    if (!currentUser) return;
    try {
        await setDoc(doc(db, "presence", getDocId(currentUser)), {
            lastActive: Date.now(),
            isOnline: isOnlineStatus
        }, { merge: true });
    } catch (e) { console.error("Ping Hatası:", e); }
}

function startHeartbeatSystem() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    // Anında ilk sinyal
    forceSendPing(true);

    // Mobilde arka planda uyusa bile her 4 saniyede bir tetik dener
    heartbeatInterval = setInterval(() => {
        forceSendPing(true);
    }, 4000);
}

// === MOBİL SOHBET ALANI AÇMA MOTORU (KORUNAN VE SABİTLENEN) ===
window.openChatArea = function() {
    if (sidebarArea) sidebarArea.classList.add("hidden");
    if (chatArea) {
        chatArea.classList.remove("hidden", "md:flex");
        chatArea.classList.add("flex", "w-full", "h-full");
    }
    setTimeout(() => { if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 150);
};

window.closeChatArea = function() {
    if (sidebarArea) sidebarArea.classList.remove("hidden");
    if (chatArea) {
        chatArea.classList.add("hidden", "md:flex");
        chatArea.classList.remove("flex", "w-full", "h-full");
    }
};

window.selectUser = function(user) {
    currentUser = user;
    chatPartner = (currentUser === "Mat Dehası") ? "Biyolojinin Son Kalesi" : "Mat Dehası";

    if(currentUserNameEl) currentUserNameEl.textContent = currentUser;
    if(chatPartnerNameEl) chatPartnerNameEl.textContent = chatPartner;
    if(chatHeaderPartnerNameEl) chatHeaderPartnerNameEl.textContent = chatPartner;
    if(avatarPlaceholder) avatarPlaceholder.textContent = chatPartner.charAt(0);

    if(loginScreen) loginScreen.classList.add("hidden");
    if(chatScreen) chatScreen.classList.remove("hidden");

    // Masaüstünde varsayılan sağ taraf açık kalır, mobilde ise tıklama beklenir
    if (window.innerWidth > 768) {
        if (chatArea) { chatArea.classList.remove("hidden"); chatArea.classList.add("flex"); }
    } else {
        window.closeChatArea();
    }

    startHeartbeatSystem();
    listenForMessages();
    listenPartnerPresence();
    setupTypingListener();
    markIncomingMessagesAsRead();

    // Mobil cihaz uyku/sekme değişim korumaları
    window.addEventListener("beforeunload", () => { forceSendPing(false); });
    window.addEventListener("pagehide", () => { forceSendPing(false); });
    
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            startHeartbeatSystem(); // Sekmeye dönünce ping motorunu yeniden canlandır
        } else {
            forceSendPing(false);
        }
    });
    
    window.addEventListener("focus", () => { startHeartbeatSystem(); });
};

function listenPartnerPresence() {
    onSnapshot(doc(db, "presence", getDocId(chatPartner)), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            const now = Date.now();
            const lastActive = data.lastActive || 0;
            // Toleransı 20 saniyeye çıkardık (mobil ağ gecikmeleri için idealdir)
            const isReallyOnline = data.isOnline && (now - lastActive < 20000);
            
            isPartnerOnline = isReallyOnline;
            
            if (data.isTyping && isReallyOnline) {
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = "Yazıyor...";
                if(partnerStatusHeader) partnerStatusHeader.textContent = "yazıyor...";
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-emerald-500 rounded-full animate-pulse";
            } else if (isReallyOnline) {
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = "Çevrimiçi";
                if(partnerStatusHeader) partnerStatusHeader.textContent = "Çevrimiçi";
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-emerald-500 rounded-full";
                markIncomingMessagesAsRead();
            } else {
                let lastSeenText = "çevrimdışı";
                if (lastActive > 0) {
                    const date = new Date(lastActive);
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    lastSeenText = `Son görülme ${hours}:${minutes}`;
                }
                
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = lastSeenText;
                if(partnerStatusHeader) partnerStatusHeader.textContent = lastSeenText;
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-gray-400 rounded-full";
            }
        }
    });
}

function setupTypingListener() {
    if (!messageInput) return;
    messageInput.addEventListener("input", () => {
        if (!currentUser) return;
        updateDoc(doc(db, "presence", getDocId(currentUser)), { isTyping: true });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            updateDoc(doc(db, "presence", getDocId(currentUser)), { isTyping: false });
        }, 1500);
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

async function sendCustomMessage(payload, type = "text") {
    try {
        if(currentUser) updateDoc(doc(db, "presence", getDocId(currentUser)), { isTyping: false });
        const initialStatus = isPartnerOnline ? "delivered" : "sent";
        await addDoc(collection(db, "messages"), {
            sender: currentUser, receiver: chatPartner,
            message: type === "text" ? payload : "",
            fileData: type !== "text" ? payload : "",
            messageType: type, timestamp: serverTimestamp(), status: initialStatus
        });
        sendEmailNotification(payload, type === "text" ? "metin" : type === "image" ? "fotoğraf" : "ses kaydı");
    } catch (e) { console.error(e); }
}

if(sendBtn) {
    sendBtn.addEventListener("click", () => {
        const text = messageInput.value.trim();
        if (text) { sendCustomMessage(text, "text"); messageInput.value = ""; }
    });
}
if(messageInput) {
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const text = messageInput.value.trim();
            if (text) { sendCustomMessage(text, "text"); messageInput.value = ""; }
        }
    });
}

if(fileInput) {
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            sendCustomMessage(event.target.result, file.type.startsWith("image/") ? "image" : "file");
        };
        reader.readAsDataURL(file);
        fileInput.value = ""; 
    });
}

async function startVoiceRecording() {
    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(activeStream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => { sendCustomMessage(reader.result, "audio"); };
            reader.readAsDataURL(audioBlob);
            if (activeStream) { activeStream.getTracks().forEach(track => track.stop()); activeStream = null; }
        };
        mediaRecorder.start();
        isRecording = true;
        if(voiceBtn) voiceBtn.classList.add("text-red-500");
    } catch (err) { console.warn(err); }
}

function stopVoiceRecording() {
    if (mediaRecorder && isRecording) { mediaRecorder.stop(); isRecording = false; if(voiceBtn) voiceBtn.classList.remove("text-red-500"); }
}

if(voiceBtn) {
    voiceBtn.addEventListener("click", () => { if (!isRecording) { startVoiceRecording(); } else { stopVoiceRecording(); } });
}

function listenForMessages() {
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        if(!messagesContainer) return;
        messagesContainer.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            const isBelongsToCurrentChat = (data.sender === currentUser && data.receiver === chatPartner) || (data.sender === chatPartner && data.receiver === currentUser);
            if (!isBelongsToCurrentChat) return;

            if (data.receiver === currentUser && data.status !== "read") {
                updateDoc(doc(db, "messages", msgId), { status: "read" });
            }

            let timeString = "00:00";
            if (data.timestamp) {
                const date = data.timestamp.toDate();
                timeString = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }

            const isMe = data.sender === currentUser;
            let messageBg = isMe ? "bg-[#d9fdd3] dark:bg-emerald-900/40 text-gray-800 dark:text-gray-100 self-end rounded-l-xl rounded-br-xl" : "bg-white dark:bg-zinc-700 text-gray-800 dark:text-gray-100 self-start rounded-r-xl rounded-bl-xl";
            
            let contentBody = "";
            if (data.messageType === "image") contentBody = `<img src="${data.fileData}" class="rounded-lg max-w-[200px] object-cover shadow-sm" onclick="window.open(this.src)">`;
            else if (data.messageType === "audio") contentBody = `<audio src="${data.fileData}" controls class="w-[180px] h-8"></audio>`;
            else contentBody = `<p class="break-words max-w-[65vw] md:max-w-md">${data.message}</p>`;

            let statusTick = "";
            if (isMe) {
                if (data.status === "read") statusTick = `<span class="text-sky-500 ml-1">✓✓</span>`;
                else if (data.status === "delivered") statusTick = `<span class="text-gray-400 ml-1">✓✓</span>`;
                else statusTick = `<span class="text-gray-400 ml-1">✓</span>`;
            }

            const messageHtml = `
                <div class="flex flex-col ${isMe ? 'self-end' : 'self-start'} p-2 px-3 shadow-sm ${messageBg} relative group">
                    ${contentBody}
                    <span class="text-[9px] text-gray-400 dark:text-gray-400/80 text-right mt-1 block select-none">${timeString} ${statusTick}</span>
                </div>
            `;
            messagesContainer.insertAdjacentHTML("beforeend", messageHtml);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

window.addEventListener("resize", () => {
    if (currentUser && window.innerWidth > 768) {
        if (sidebarArea) sidebarArea.classList.remove("hidden");
        if (chatArea) { chatArea.classList.remove("hidden"); chatArea.classList.add("flex"); }
    }
});

if (messageInput) {
    messageInput.addEventListener("focus", () => {
        setTimeout(() => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }, 250);
    });
}

// === URL PARAMETRESİ İLE OTOMATİK GİRİŞ SİSTEMİ ===
function checkAutoLogin() {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');

    if (userParam === 'mat') {
        window.selectUser('Mat Dehası');
    } else if (userParam === 'biyoloji') {
        window.selectUser('Biyolojinin Son Kalesi');
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkAutoLogin);
} else {
    checkAutoLogin();
}