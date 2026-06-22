import { db } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, 
    doc, setDoc, updateDoc, where, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === EMAILJS CONFIG ===
const EMAILJS_PUBLIC_KEY = "5TpnpoaEEVUg3ekL1";
const EMAILJS_SERVICE_ID = "service_45dlxnd";
const EMAILJS_TEMPLATE_ID = "template_lfnx7dm";

if (typeof emailjs !== "undefined" && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

let currentUser = "";
let chatPartner = "";
let typingTimeout = null;
let isPartnerOnline = false;
let partnerLastReadTime = 0; // Karşı tarafın okuma zamanını tarayıcı hafızasında tutmak için
let heartbeatInterval = null;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRecordCancelled = false; 
let activeStream = null;
let voiceDurationSeconds = 0;
let voiceTimerInterval = null;

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const currentUserNameEl = document.getElementById("current-user-name");
const chatPartnerNameEl = document.getElementById("chat-partner-name");
const chatHeaderPartnerNameEl = document.getElementById("chat-header-partner-name");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages-container");
const fileInput = document.getElementById("file-input");
const darkModeToggle = document.getElementById("dark-mode-toggle");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const closeTabBtn = document.getElementById("close-tab-btn");

const voiceBtn = document.getElementById("voice-btn");
const voiceCancelBtn = document.getElementById("voice-cancel-btn");
const attachLabel = document.getElementById("attach-label");
const voiceStatusPanel = document.getElementById("voice-status-panel");
const voiceTimer = document.getElementById("voice-timer");

const partnerStatusSidebar = document.getElementById("partner-status-sidebar");
const partnerStatusHeader = document.getElementById("partner-status-header");
const statusIndicatorDot = document.getElementById("status-indicator-dot");
const avatarPlaceholder = document.getElementById("avatar-placeholder");

const sidebarArea = document.getElementById("sidebar-area");
const chatArea = document.getElementById("chat-area");

const imagePreviewModal = document.getElementById("image-preview-modal");
const modalPreviewImg = document.getElementById("modal-preview-img");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalDownloadBtn = document.getElementById("modal-download-btn");

darkModeToggle.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
});

fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            fullscreenBtn.innerHTML = `<i class="fa-solid fa-compress"></i>`;
            setTimeout(forceLayoutRefresh, 300);
        }).catch(err => console.error(err));
    } else {
        document.exitFullscreen().then(() => {
            fullscreenBtn.innerHTML = `<i class="fa-solid fa-expand"></i>`;
            setTimeout(forceLayoutRefresh, 300);
        });
    }
});

function forceLayoutRefresh() {
    if (!window.visualViewport) return;
    const viewportHeight = window.visualViewport.height;
    document.body.style.height = `${viewportHeight}px`;
    const appContainer = document.getElementById("app-container");
    if (appContainer) appContainer.style.height = `${viewportHeight}px`;
    
    if (currentUser && messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    window.scrollTo(0, 0);
}

function adjustLayoutForKeyboard() {
    if (!window.visualViewport) return;
    window.visualViewport.addEventListener('resize', forceLayoutRefresh);
    window.visualViewport.addEventListener('scroll', forceLayoutRefresh);
}
adjustLayoutForKeyboard();

function autoResizeTextArea() {
    if (!messageInput) return;
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
    
    if (messageInput.value.trim().length > 0) {
        if (voiceBtn) voiceBtn.classList.add("hidden");
        if (sendBtn) sendBtn.classList.remove("hidden");
    } else if (!isRecording) {
        if (voiceBtn) voiceBtn.classList.remove("hidden");
        if (sendBtn) sendBtn.classList.add("hidden");
    }
}
if(messageInput) {
    messageInput.addEventListener('input', autoResizeTextArea);
}

function formatSmartDate(timestampMs) {
    const messageDate = new Date(timestampMs);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday = messageDate.getDate() === today.getDate() &&
                    messageDate.getMonth() === today.getMonth() &&
                    messageDate.getFullYear() === today.getFullYear();

    const isYesterday = messageDate.getDate() === yesterday.getDate() &&
                        messageDate.getMonth() === yesterday.getMonth() &&
                        messageDate.getFullYear() === yesterday.getFullYear();

    if (isToday) return "Bugün";
    if (isYesterday) return "Dün";

    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    return `${messageDate.getDate()} ${months[messageDate.getMonth()]} ${messageDate.getFullYear()}`;
}

function formatLastSeen(lastActiveMs) {
    const activeDate = new Date(lastActiveMs);
    const today = new Date();
    
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfActiveDay = new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate()).getTime();
    
    const diffTime = startOfToday - startOfActiveDay;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const hours = String(activeDate.getHours()).padStart(2, '0');
    const minutes = String(activeDate.getMinutes()).padStart(2, '0');

    if (diffDays === 0) {
        return `Son görülme bugün ${hours}:${minutes}`;
    } else if (diffDays === 1) {
        return `Son görülme dün ${hours}:${minutes}`;
    } else {
        return `Son görülme ${diffDays} gün önce`;
    }
}

function getDocId(name) {
    return name.replace(/\s+/g, '_');
}

// === OPTİMİZE PİNG FONKSİYONU (lastReadTime entegre edildi) ===
async function forceSendPing(isOnlineStatus) {
    if (!currentUser) return;
    try {
        return await setDoc(doc(db, "presence", getDocId(currentUser)), {
            lastActive: Date.now(),
            isOnline: isOnlineStatus,
            lastReadTime: Date.now() // Ekstra write maliyeti oluşturmadan pingle beraber gider
        }, { merge: true });
    } catch (e) { console.error("Ping Hatası:", e); }
}

// FİKİR 1: İlk girişte anında ping, sonrasında her 40 saniyede bir (10 Kat Tasarruf)
function startHeartbeatSystem() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    forceSendPing(true); 
    heartbeatInterval = setInterval(() => {
        forceSendPing(true);
    }, 40000); 
}

window.openChatArea = function() {
    if (sidebarArea) sidebarArea.classList.add("hidden");
    if (chatArea) {
        chatArea.classList.remove("hidden", "md:flex");
        chatArea.classList.add("flex", "w-full");
    }
    forceSendPing(true); // Sohbet açıldığında okuma zamanını anlık tazele
    setTimeout(() => { if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 150);
};

window.closeChatArea = function() {
    if (sidebarArea) sidebarArea.classList.remove("hidden");
    if (chatArea) {
        chatArea.classList.add("hidden", "md:flex");
        chatArea.classList.remove("flex", "w-full");
    }
};

window.selectUser = function(user) {
    currentUser = user;
    chatPartner = (currentUser === "Mat Dehası") ? "Biyolojinin Son Kalesi" : "Mat Dehası";

    if(currentUserNameEl) currentUserNameEl.textContent = currentUser;
    if(chatPartnerNameEl) chatPartnerNameEl.textContent = chatPartner;
    if(chatHeaderPartnerNameEl) chatHeaderPartnerNameEl.textContent = chatPartner;
    if(avatarPlaceholder) avatarPlaceholder.textContent = chatPartner.charAt(0);

    const avatarSelf = document.getElementById("avatar-self");
    if(avatarSelf) avatarSelf.textContent = currentUser.charAt(0);

    if(loginScreen) loginScreen.classList.add("hidden");
    if(chatScreen) chatScreen.classList.remove("hidden");

    if (window.innerWidth > 768) {
        if (chatArea) { chatArea.classList.remove("hidden"); chatArea.classList.add("flex"); }
    } else {
        window.closeChatArea();
    }

    if(sendBtn) sendBtn.classList.add("hidden");
    if(voiceBtn) voiceBtn.classList.remove("hidden");

    startHeartbeatSystem();
    listenForMessages();
    listenPartnerPresence();
    setupTypingListener();

    window.addEventListener("beforeunload", () => { forceSendPing(false); });
    window.addEventListener("pagehide", () => { forceSendPing(false); });
    
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            startHeartbeatSystem();
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
            
            // Ping aralığı 40s olduğu için tolerans eşiğini 50 saniyeye çektik
            const isReallyOnline = data.isOnline && (now - lastActive < 50000);
            
            isPartnerOnline = isReallyOnline;
            partnerLastReadTime = data.lastReadTime || 0; // Karşı tarafın ekrana baktığı son anı yakalıyoruz

            if (data.isTyping && isReallyOnline) {
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = "Yazıyor...";
                if(partnerStatusHeader) partnerStatusHeader.textContent = "yazıyor...";
                if(statusIndicatorDot) statusIndicatorDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse";
            } else if (isReallyOnline) {
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = "Çevrimiçi";
                if(partnerStatusHeader) partnerStatusHeader.textContent = "çevrimiçi";
                if(statusIndicatorDot) statusIndicatorDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
            } else {
                let lastSeenText = "çevrimdışı";
                if (lastActive > 0) {
                    lastSeenText = formatLastSeen(lastActive);
                }
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = lastSeenText;
                if(partnerStatusHeader) partnerStatusHeader.textContent = lastSeenText;
                if(statusIndicatorDot) statusIndicatorDot.className = "w-2.5 h-2.5 rounded-full bg-gray-400";
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

// === FİKİR 2: Mesaj içi 'status' alanı ve updateDoc döngüleri TAMAMEN KALDIRILDI (0 Writes) ===
async function sendCustomMessage(payload, type = "text") {
    try {
        if(currentUser) updateDoc(doc(db, "presence", getDocId(currentUser)), { isTyping: false });
        
        await addDoc(collection(db, "messages"), {
            sender: currentUser, receiver: chatPartner,
            message: type === "text" ? payload : "",
            fileData: type !== "text" ? payload : "",
            messageType: type, timestamp: serverTimestamp()
        });
        
        sendEmailRouter(payload, type === "text" ? "metin" : type === "image" ? "fotoğraf" : "ses kaydı");
    } catch (e) { console.error(e); }
}

function handleMessageSubmit() {
    const text = messageInput.value.trim();
    if (text) { 
        sendCustomMessage(text, "text"); 
        messageInput.value = ""; 
        messageInput.style.height = '24px'; 
        if (sendBtn) sendBtn.classList.add("hidden");
        if (voiceBtn) voiceBtn.classList.remove("hidden");
    }
    setTimeout(() => { messageInput.focus(); }, 20); 
}

if(sendBtn) {
    sendBtn.addEventListener("click", handleMessageSubmit);
}

if(messageInput) {
    messageInput.addEventListener("keydown", (e) => {
        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (e.key === "Enter") {
            if (isMobile) return; 
            if (!e.shiftKey) {
                e.preventDefault(); 
                handleMessageSubmit();
            }
        }
    });
}

if(fileInput) {
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = function(event) {
                sendCustomMessage(event.target.result, "file");
            };
            reader.readAsDataURL(file);
            fileInput.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = function() {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.50);
                sendCustomMessage(compressedBase64, "image");
            };
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
        isRecordCancelled = false;

        mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            clearInterval(voiceTimerInterval);
            
            if (isRecordCancelled) {
                resetVoiceUI();
                if (activeStream) { activeStream.getTracks().forEach(track => track.stop()); activeStream = null; }
                return;
            }

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => { sendCustomMessage(reader.result, "audio"); };
            reader.readAsDataURL(audioBlob);
            
            resetVoiceUI();
            if (activeStream) { activeStream.getTracks().forEach(track => track.stop()); activeStream = null; }
        };

        mediaRecorder.start();
        isRecording = true;

        if(attachLabel) attachLabel.classList.add("hidden");
        if(voiceBtn) voiceBtn.classList.add("hidden");
        if(sendBtn) sendBtn.classList.add("hidden");
        
        if(voiceCancelBtn) voiceCancelBtn.classList.remove("hidden");
        if(voiceStatusPanel) voiceStatusPanel.classList.remove("hidden");

        voiceDurationSeconds = 0;
        if(voiceTimer) voiceTimer.textContent = "00:00";
        voiceTimerInterval = setInterval(() => {
            voiceDurationSeconds++;
            const mins = String(Math.floor(voiceDurationSeconds / 60)).padStart(2, '0');
            const secs = String(voiceDurationSeconds % 60).padStart(2, '0');
            if(voiceTimer) voiceTimer.textContent = `${mins}:${secs}`;
        }, 1000);

    } catch (err) { console.warn("Mikrofon izni reddedildi:", err); }
}

function stopVoiceRecording(shouldCancel = false) {
    if (mediaRecorder && isRecording) { 
        isRecordCancelled = shouldCancel;
        mediaRecorder.stop(); 
        isRecording = false; 
    }
}

function resetVoiceUI() {
    clearInterval(voiceTimerInterval);
    if(voiceCancelBtn) voiceCancelBtn.classList.add("hidden");
    if(voiceStatusPanel) voiceStatusPanel.classList.add("hidden");
    
    if(attachLabel) attachLabel.classList.remove("hidden");
    if(voiceBtn) voiceBtn.classList.remove("hidden");
    if(messageInput) messageInput.focus();
}

if(voiceBtn) {
    voiceBtn.addEventListener("click", () => { 
        if (!isRecording) startVoiceRecording(); 
    });
}

if(voiceCancelBtn) {
    voiceCancelBtn.addEventListener("click", () => { stopVoiceRecording(true); });
}

function listenForMessages() {
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        if(!messagesContainer) return;
        messagesContainer.innerHTML = "";
        
        let lastDisplayedDateString = ""; 

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const isBelongsToCurrentChat = (data.sender === currentUser && data.receiver === chatPartner) || (data.sender === chatPartner && data.receiver === currentUser);
            if (!isBelongsToCurrentChat) return;

            let timeString = "00:00";
            let currentMessageDateString = "";
            let msgTimestampMs = Date.now();

            if (data.timestamp) {
                const date = data.timestamp.toDate();
                msgTimestampMs = date.getTime();
                timeString = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                currentMessageDateString = formatSmartDate(msgTimestampMs);
            } else {
                currentMessageDateString = formatSmartDate(Date.now());
            }

            if (currentMessageDateString !== lastDisplayedDateString) {
                lastDisplayedDateString = currentMessageDateString;
                const dateSeparatorHtml = `
                    <div class="flex justify-center my-2 select-none">
                        <span class="bg-gray-200/80 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 text-xs px-3 py-1 rounded-lg font-medium shadow-sm">
                            ${currentMessageDateString}
                        </span>
                    </div>
                `;
                messagesContainer.insertAdjacentHTML("beforeend", dateSeparatorHtml);
            }

            const isMe = data.sender === currentUser;
            
            let messageBg = isMe 
                ? "bg-whatsapp-green text-zinc-100 self-end rounded-l-xl rounded-br-xl rounded-tr-none ml-12" 
                : "bg-whatsapp-received text-zinc-100 self-start rounded-r-xl rounded-bl-xl rounded-tl-none mr-12";
            
            let contentBody = "";
            if (data.messageType === "image") contentBody = `<img src="${data.fileData}" class="rounded-lg max-w-[200px] object-cover shadow-sm cursor-pointer hover:opacity-95 transition" onclick="window.openImagePreview(this.src)">`;
            else if (data.messageType === "audio") contentBody = `<audio src="${data.fileData}" controls class="w-[180px] h-8"></audio>`;
            else contentBody = `<p class="break-words max-w-[65vw] md:max-w-md whitespace-pre-wrap text-[14.5px] leading-relaxed">${data.message}</p>`;

            // === VERİTABANI İŞLEMİ YAPMAYAN AKILLI MAVİ TIK MOTORU ===
            let statusTick = "";
            if (isMe) {
                // Mesajın atılma saati karşı tarafın ekrana son baktığı zamandan önce veya eşitse çift tık bas
                if (msgTimestampMs <= partnerLastReadTime) {
                    statusTick = `<span class="text-whatsapp-lightGreen ml-1">✓✓</span>`;
                } else {
                    statusTick = `<span class="text-zinc-400 ml-1">✓</span>`;
                }
            }

            const messageHtml = `
                <div class="flex flex-col ${isMe ? 'self-end' : 'self-start'} p-2 px-3 shadow-md ${messageBg} relative group max-w-[85%]">
                    ${contentBody}
                    <span class="text-[10px] text-zinc-400/80 text-right mt-1 block select-none">${timeString} ${statusTick}</span>
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
        forceSendPing(true); // Giriş alanına tıklanınca okuma zamanını anlık tazele
        setTimeout(() => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            window.scrollTo(0, 0);
        }, 150);
    });
}

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