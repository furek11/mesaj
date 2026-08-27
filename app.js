import { db, sendHeartbeat, hbDatabases, getActiveHbDb } from "./firebase-config.js";
import { db, sendHeartbeat, hbDatabases } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, 
    doc, setDoc, updateDoc, limitToLast
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === EMAILJS CONFIG ===
const EMAILJS_PUBLIC_KEY = "5TpnpoaEEVUg3ekL1";
const EMAILJS_SERVICE_ID = "service_45dlxnd";
const EMAILJS_TEMPLATE_ID = "template_lfnx7dm";

if (typeof emailjs !== "undefined" && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

// === CLOUDINARY CONFIG ===
const CLOUDINARY_CLOUD_NAME = "kmnkotv7";
const CLOUDINARY_UPLOAD_PRESET = "chat_secure_preset"; 
const CLOUDINARY_API_KEY = "523656588757819";

// 🛠️ PROFİL RESİMLERİ (Kendi Klasöründen Çekme)
const PROFILE_AVATARS = {
    "Mat Dehası": "./assets/mat-dehasi.jpg",
    "Biyolojinin Son Kalesi": "./assets/biyoloji-kalesi.jpg"
};

let currentUser = "";
let chatPartner = "";
let typingTimeout = null;
let isPartnerOnline = false;
let partnerLastActive = 0; 
let heartbeatInterval = null;
let messagesUnsubscribe = null; 
let lastSnapshotCache = null; 

// Ses Kayıt Değişkenleri
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRecordCancelled = false; 
let activeStream = null;
let voiceDurationSeconds = 0;
let voiceTimerInterval = null;

// Durum ve Limit Takip Değişkenleri
let isUserScrolledUp = false;
let currentMessageLimit = 40; 
let isPaginationLoading = false;

// Ön Düzenleme ve Yükleme Takibi
let pendingMediaFile = null;
let pendingMediaType = null;

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

const scrollToBottomBtn = document.getElementById("scroll-to-bottom-btn");

// 🛠️ DİNAMİK PROFİL KARTI MODALI OLUŞTURMA
function createProfileCardModal() {
    if (document.getElementById("profile-card-modal")) return;
    const modalHtml = `
        <div id="profile-card-modal" class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 hidden">
            <div class="bg-white dark:bg-zinc-800 rounded-2xl max-w-sm w-full p-6 flex flex-col items-center gap-4 shadow-2xl border border-gray-100 dark:border-zinc-700 relative animate-fadeIn">
                <button id="profile-card-close" class="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-white text-xl p-1">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <div class="w-32 h-32 rounded-full overflow-hidden ring-4 ring-emerald-500/30 shadow-lg">
                    <img id="profile-card-img" src="" class="w-full h-full object-cover">
                </div>
                <div class="text-center">
                    <h3 id="profile-card-name" class="text-xl font-bold text-gray-800 dark:text-gray-100"></h3>
                    <p id="profile-card-status" class="text-sm text-gray-500 dark:text-gray-400 mt-1"></p>
                </div>
                <button id="profile-card-expand-btn" class="mt-2 w-full py-2 px-4 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-700 dark:text-gray-200 rounded-xl transition text-sm font-medium flex items-center justify-center gap-2">
                    <i class="fa-solid fa-expand"></i> Fotoğrafı Tam Ekran Gör / İndir
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    document.getElementById("profile-card-close").addEventListener("click", () => {
        document.getElementById("profile-card-modal").classList.add("hidden");
    });

    document.getElementById("profile-card-expand-btn").addEventListener("click", () => {
        const imgSrc = document.getElementById("profile-card-img").src;
        document.getElementById("profile-card-modal").classList.add("hidden");
        window.openImagePreview(imgSrc);
    });
}
createProfileCardModal();

function openProfileCard() {
    if (!chatPartner) return;
    const avatarUrl = PROFILE_AVATARS[chatPartner] || "";
    const statusText = partnerStatusHeader ? partnerStatusHeader.textContent : "";

    document.getElementById("profile-card-img").src = avatarUrl;
    document.getElementById("profile-card-name").textContent = chatPartner;
    document.getElementById("profile-card-status").textContent = statusText;
    document.getElementById("profile-card-modal").classList.remove("hidden");
}

// Header başlığına veya avatarına tıklandığında profil kartını aç
const chatHeaderTitleArea = document.getElementById("chat-header-partner-name")?.parentElement;
if (chatHeaderTitleArea) {
    chatHeaderTitleArea.classList.add("cursor-pointer");
    chatHeaderTitleArea.addEventListener("click", openProfileCard);
}

// DİNAMİK ÖN DÜZENLEME / ONAY MODALI OLUŞTURMA
function createMediaConfirmModal() {
    if (document.getElementById("media-confirm-modal")) return;
    const modalHtml = `
        <div id="media-confirm-modal" class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 hidden">
            <div class="bg-white dark:bg-zinc-800 rounded-2xl max-w-md w-full p-4 flex flex-col items-center gap-4 shadow-2xl border border-gray-100 dark:border-zinc-700">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">Medya Gönderilsin mi?</h3>
                <div id="media-confirm-preview" class="w-full max-h-[60vh] flex items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-zinc-900 p-2"></div>
                <div class="flex gap-3 w-full justify-end">
                    <button id="media-confirm-cancel" class="px-4 py-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-xl hover:opacity-90 transition font-medium">İptal</button>
                    <button id="media-confirm-send" class="px-5 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition font-medium">Gönder</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    document.getElementById("media-confirm-cancel").addEventListener("click", cancelMediaConfirm);
    document.getElementById("media-confirm-send").addEventListener("click", confirmAndSendMedia);
}
createMediaConfirmModal();

function openMediaConfirmModal(file, type) {
    pendingMediaFile = file;
    pendingMediaType = type;
    const previewContainer = document.getElementById("media-confirm-preview");
    if (!previewContainer) return;

    const objectUrl = URL.createObjectURL(file);
    if (type === "image") {
        previewContainer.innerHTML = `<img src="${objectUrl}" class="max-h-[50vh] rounded-lg object-contain">`;
    } else if (type === "video") {
        previewContainer.innerHTML = `<video src="${objectUrl}" controls class="max-h-[50vh] rounded-lg"></video>`;
    } else {
        previewContainer.innerHTML = `<audio src="${objectUrl}" controls class="w-full"></audio>`;
    }

    document.getElementById("media-confirm-modal").classList.remove("hidden");
}

function cancelMediaConfirm() {
    pendingMediaFile = null;
    pendingMediaType = null;
    document.getElementById("media-confirm-modal").classList.add("hidden");
    if (fileInput) fileInput.value = "";
}

function confirmAndSendMedia() {
    if (!pendingMediaFile || !pendingMediaType) return;
    const file = pendingMediaFile;
    const type = pendingMediaType;
    document.getElementById("media-confirm-modal").classList.add("hidden");
    pendingMediaFile = null;
    pendingMediaType = null;
    if (fileInput) fileInput.value = "";

    uploadMediaWithProgress(file, type);
}

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

const KUMARBAZ_QUOTES = [
    { text: "“Yarın, yarın her şey bitecek!”", url: "https://1000kitap.com/kitap/kumarbaz--126/alintilar" },
    { text: "“Hayatımı bir masaya yatırdım.”", url: "https://1000kitap.com/kitap/kumarbaz--126/alintilar" },
    { text: "“İnsan bazen en olmayacak şeye, en büyük ümidi bağlar.”", url: "https://1000kitap.com/kitap/kumarbaz--126/alintilar" },
    { text: "“Zirvedeyken her şey o kadar küçük görünür ki...”", url: "https://1000kitap.com/kitap/kumarbaz--126/alintilar" }
];

function triggerBlackoutSystem() {
    stopHeartbeatSystem();
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', function () {
        window.history.pushState(null, null, window.location.href);
    });

    const randomQuote = KUMARBAZ_QUOTES[Math.floor(Math.random() * KUMARBAZ_QUOTES.length)];

    document.body.innerHTML = `
        <div style="height:100vh; width:100vw; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000000; margin:0; padding:24px; box-sizing:border-box; overflow:hidden; touch-action:none; user-select:none;">
            <a href="${randomQuote.url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:serif; font-size:18px; font-style:italic; text-align:center; text-decoration:none; max-width:500px; line-height:1.6; animation: fadeIn 1s ease-in-out; cursor:pointer;">
                ${randomQuote.text}
            </a>
        </div>
        <style>
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            html, body { background: #000000 !important; overflow: hidden !important; height: 100% !important; }
        </style>
    `;
}

if (closeTabBtn) {
    closeTabBtn.addEventListener("click", () => {
        forceSendPing(false).then(() => {
            window.open('', '_self', ''); 
            window.close();
            triggerBlackoutSystem();
        }).catch(() => { triggerBlackoutSystem(); });
    });
}

window.openImagePreview = function(src) {
    if (!imagePreviewModal || !modalPreviewImg) return;
    modalPreviewImg.src = src;
    if (modalDownloadBtn) {
        modalDownloadBtn.href = src;
        modalDownloadBtn.target = "_blank";
    }
    imagePreviewModal.classList.remove("hidden");
};

if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
        if (imagePreviewModal) imagePreviewModal.classList.add("hidden");
        if (modalPreviewImg) modalPreviewImg.src = "";
    });
}

function forceLayoutRefresh() {
    if (!window.visualViewport) return;
    const viewportHeight = window.visualViewport.height;
    document.body.style.height = `${viewportHeight}px`;
    const appContainer = document.getElementById("app-container");
    if (appContainer) appContainer.style.height = `${viewportHeight}px`;
    
    if (currentUser && messagesContainer && !isUserScrolledUp) {
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
}
if(messageInput) {
    messageInput.addEventListener('input', autoResizeTextArea);
}

function formatSmartDate(timestampMs) {
    const messageDate = new Date(timestampMs);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday = messageDate.getDate() === today.getDate() && messageDate.getMonth() === today.getMonth() && messageDate.getFullYear() === today.getFullYear();
    const isYesterday = messageDate.getDate() === yesterday.getDate() && messageDate.getMonth() === yesterday.getMonth() && messageDate.getFullYear() === yesterday.getFullYear();

    if (isToday) return "Bugün";
    if (isYesterday) return "Dün";

    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylul", "Ekim", "Kasım", "Aralık"];
    return `${messageDate.getDate()} ${months[messageDate.getMonth()]} ${messageDate.getFullYear()}`;
}

function formatLastSeen(lastActiveMs) {
    const activeDate = new Date(lastActiveMs);
    const today = new Date();
    
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfActiveDay = new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate()).getTime();
    
    const diffDays = Math.floor((startOfToday - startOfActiveDay) / (1000 * 60 * 60 * 24));
    const hours = String(activeDate.getHours()).padStart(2, '0');
    const minutes = String(activeDate.getMinutes()).padStart(2, '0');

    if (diffDays === 0) return `Son görülme bugün ${hours}:${minutes}`;
    if (diffDays === 1) return `Son görülme dün ${hours}:${minutes}`;
    return `Son görülme ${diffDays} gün önce`;
}

async function sendEmailNotification(messageText, contentType = "metin") {
    if (currentUser !== "Biyolojinin Son Kalesi") return;
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

function getDocId(name) { return name.replace(/\s+/g, '_'); }

// 🔄 YENİ AKILLI PING SİSTEMİ (firebase-config.js üzerinden otomatik sunucu değişimi yapar)
async function forceSendPing(isOnlineStatus) {
    if (!currentUser) return;
    try {
        await sendHeartbeat(getDocId(currentUser), isOnlineStatus);
    } catch (e) { 
        console.error("Ping Hatası:", e); 
    }
}

function startHeartbeatSystem() {
    stopHeartbeatSystem();
    forceSendPing(true);
    heartbeatInterval = setInterval(() => { forceSendPing(true); }, 15000);
}

function stopHeartbeatSystem() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// Ses Kayıt Fonksiyonları
async function startVoiceRecording() {
    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(activeStream);
        audioChunks = [];
        isRecording = true;
        isRecordCancelled = false;

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
                activeStream = null;
            }
            if (voiceTimerInterval) clearInterval(voiceTimerInterval);
            
            if (isRecordCancelled) {
                isRecordCancelled = false;
                return;
            }

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (audioBlob.size > 0) {
                openMediaConfirmModal(audioBlob, "audio");
            }
        };

        mediaRecorder.start();
        voiceDurationSeconds = 0;
        if (voiceTimer) voiceTimer.textContent = "00:00";
        if (voiceStatusPanel) voiceStatusPanel.classList.remove("hidden");
        if (messageInput) messageInput.classList.add("hidden");
        if (attachLabel) attachLabel.classList.add("hidden");

        voiceTimerInterval = setInterval(() => {
            voiceDurationSeconds++;
            const mins = String(Math.floor(voiceDurationSeconds / 60)).padStart(2, '0');
            const secs = String(voiceDurationSeconds % 60).padStart(2, '0');
            if (voiceTimer) voiceTimer.textContent = `${mins}:${secs}`;
        }, 1000);

    } catch (err) {
        console.error("Mikrofon erişim hatası:", err);
        alert("Mikrofona erişim sağlanamadı.");
    }
}

function stopVoiceRecording(cancel = false) {
    if (!isRecording) return;
    isRecording = false;
    isRecordCancelled = cancel;

    if (voiceStatusPanel) voiceStatusPanel.classList.add("hidden");
    if (messageInput) messageInput.classList.remove("hidden");
    if (attachLabel) attachLabel.classList.remove("hidden");

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
}

if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
        if (!isRecording) startVoiceRecording();
        else stopVoiceRecording(false);
    });
}

if (voiceCancelBtn) {
    voiceCancelBtn.addEventListener("click", () => {
        stopVoiceRecording(true);
    });
}

async function uploadMediaWithProgress(file, type) {
    let docRef = null;
    try {
        if (currentUser) await forceSendPing(true);

        docRef = await addDoc(collection(db, "messages"), {
            sender: currentUser, receiver: chatPartner,
            message: "", fileData: "",
            messageType: type, status: "uploading",
            timestamp: serverTimestamp(), localCreatedAt: Date.now()
        });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        let resourceType = (type === "audio" || type === "video") ? "video" : "image";

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                const progressBar = document.getElementById(`progress-bar-${docRef.id}`);
                const progressText = document.getElementById(`progress-text-${docRef.id}`);
                if (progressBar) progressBar.style.width = `${percentComplete}%`;
                if (progressText) progressText.textContent = `%${percentComplete}`;
            }
        };

        xhr.onload = async () => {
            if (xhr.status === 200) {
                const result = JSON.parse(xhr.responseText);
                if (result.secure_url) {
                    await updateDoc(doc(db, "messages", docRef.id), {
                        fileData: result.secure_url,
                        status: "completed"
                    });
                    sendEmailNotification(`Sana bir ${type === "image" ? "fotoğraf" : "ses kaydı"} gönderdi.`, type);
                }
            } else {
                console.error("Yükleme başarısız:", xhr.responseText);
            }
        };

        xhr.onerror = () => { console.error("Cloudinary Ağı Hatası"); };
        xhr.send(formData);

    } catch (e) {
        console.error("Medya Yükleme Hatası:", e);
    }
}

async function sendCustomMessage(payload, type = "text") {
    try {
        // 5. sunucudaki presence/updateDoc çağrısını kaldırdık (Hatayı veren kısım burasıydı)
        await addDoc(collection(db, "messages"), {
            sender: currentUser, 
            receiver: chatPartner,
            message: payload, 
            fileData: "",
            messageType: type, 
            status: "completed",
            timestamp: serverTimestamp(), 
            localCreatedAt: Date.now() 
        });
        
        // Heartbeat sinyalini arka planda günceller
        forceSendPing(true);
        sendEmailNotification(payload, "metin");
    } catch (e) { 
        console.error("Mesaj Gönderme Hatası:", e); 
    }
}

function handleMessageSubmit() {
    if (isRecording) { stopVoiceRecording(false); return; }
    const text = messageInput.value.trim();
    if (text) { 
        sendCustomMessage(text, "text"); 
        messageInput.value = ""; 
        messageInput.style.height = '40px'; 
    }
    setTimeout(() => { messageInput.focus(); }, 20); 
}

if(sendBtn) sendBtn.addEventListener("click", handleMessageSubmit);

if(messageInput) {
    messageInput.addEventListener("keydown", (e) => {
        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (e.key === "Enter" && !isMobile && !e.shiftKey) {
            e.preventDefault(); 
            handleMessageSubmit();
        }
    });
}

if(fileInput) {
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        let type = "image";
        if (file.type.startsWith("audio/")) type = "audio";
        else if (file.type.startsWith("video/")) type = "video";
        
        openMediaConfirmModal(file, type);
    });
}

window.openChatArea = function() {
    if (sidebarArea) sidebarArea.classList.add("hidden");
    if (chatArea) {
        chatArea.classList.remove("hidden", "md:flex");
        chatArea.classList.add("flex", "w-full");
    }
    setTimeout(() => { if(messagesContainer && !isUserScrolledUp) messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 150);
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

    // 🛠️ PROFİL RESMİNİ SOHBET ÜST BARINA (HEADER) VE SİDEBAR'A AKTARMA
    const partnerAvatarUrl = PROFILE_AVATARS[chatPartner] || "";
    
    // Sidebar profil resmi
    if(avatarPlaceholder) {
        avatarPlaceholder.innerHTML = `<img src="${partnerAvatarUrl}" class="w-full h-full object-cover rounded-full cursor-pointer">`;
        avatarPlaceholder.onclick = openProfileCard;
    }

    // Sohbet Üst Barı (Header) Profil Resmi
    const headerAvatarEl = document.getElementById("chat-header-avatar");
    if (headerAvatarEl) {
        headerAvatarEl.src = partnerAvatarUrl;
        headerAvatarEl.onclick = openProfileCard;
    }

    if(loginScreen) loginScreen.classList.add("hidden");
    if(chatScreen) chatScreen.classList.remove("hidden");

    currentMessageLimit = 40; 

    if (window.innerWidth > 768) {
        if (chatArea) { chatArea.classList.remove("hidden"); chatArea.classList.add("flex"); }
    } else {
        window.closeChatArea();
    }

    startHeartbeatSystem();
    listenPartnerPresence();
    setupTypingListener();
    listenForMessages(); 

    window.addEventListener("beforeunload", () => { forceSendPing(false); });
    window.addEventListener("pagehide", () => { 
        stopHeartbeatSystem();
        forceSendPing(false); 
    });
    
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            startHeartbeatSystem();
        } else {
            stopHeartbeatSystem();
            forceSendPing(false);
        }
    });
    
    window.addEventListener("focus", () => { startHeartbeatSystem(); });
    window.addEventListener("blur", () => { 
        stopHeartbeatSystem();
        forceSendPing(false); 
    });

    setupScrollTracking();
};

let presenceUnsubscribe = null;

function listenPartnerPresence() {
    if (presenceUnsubscribe) presenceUnsubscribe();

    const currentDb = getActiveHbDb();

    presenceUnsubscribe = onSnapshot(doc(currentDb, "presence", getDocId(chatPartner)), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const now = Date.now();
            partnerLastActive = data.lastActive || 0;
            const isReallyOnline = data.isOnline && (now - partnerLastActive < 35000);
            
            isPartnerOnline = isReallyOnline;
            
            if (data.isTyping && isReallyOnline) {
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = "Yazıyor...";
                if(partnerStatusHeader) partnerStatusHeader.textContent = "yazıyor...";
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-emerald-500 rounded-full animate-pulse";
            } else if (isReallyOnline) {
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = "Çevrimiçi";
                if(partnerStatusHeader) partnerStatusHeader.textContent = "Çevrimiçi";
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-emerald-500 rounded-full";
            } else {
                let lastSeenText = "çevrimdışı";
                if (partnerLastActive > 0) lastSeenText = formatLastSeen(partnerLastActive);
                if(partnerStatusSidebar) partnerStatusSidebar.textContent = lastSeenText;
                if(partnerStatusHeader) partnerStatusHeader.textContent = lastSeenText;
                if(statusIndicatorDot) statusIndicatorDot.className = "w-3 h-3 bg-gray-400 rounded-full";
            }
        }
    }, (error) => {
        // Kota hatası (resource-exhausted) alındığı an otomatik 2. sunucuya geç ve dinlemeyi tekrar başlat
        console.warn("Mevcut Heartbeat sunucusu kotası doldu, sıradaki sunucuya geçiliyor...");
        forceSendPing(true).then(() => {
            listenPartnerPresence();
        });
    });
}

function setupTypingListener() {
    if (!messageInput) return;
    messageInput.addEventListener("input", async () => {
        if (!currentUser) return;
        try {
            await setDoc(doc(hbDatabases[0], "presence", getDocId(currentUser)), { isTyping: true }, { merge: true });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(async () => {
                try { 
                    await setDoc(doc(hbDatabases[0], "presence", getDocId(currentUser)), { isTyping: false }, { merge: true }); 
                } catch(e) {}
            }, 1500);
        } catch(e) {}
    });
}

function setupScrollTracking() {
    if (!messagesContainer) return;
    messagesContainer.addEventListener("scroll", () => {
        const currentScroll = messagesContainer.scrollTop;
        const totalScrollHeight = messagesContainer.scrollHeight;
        const clientHeight = messagesContainer.clientHeight;
        
        if (currentScroll === 0 && !isPaginationLoading) {
            isPaginationLoading = true;
            currentMessageLimit += 40; 
            listenForMessages(); 
        }

        if (totalScrollHeight - currentScroll - clientHeight > 150) {
            isUserScrolledUp = true;
            if (scrollToBottomBtn) scrollToBottomBtn.classList.remove("hidden");
        } else {
            isUserScrolledUp = false;
            if (scrollToBottomBtn) scrollToBottomBtn.classList.add("hidden");
        }
    });

    if (scrollToBottomBtn) {
        scrollToBottomBtn.addEventListener("click", () => {
            isUserScrolledUp = false;
            currentMessageLimit = 40;
            listenForMessages();

            setTimeout(() => {
                if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 120);
            if (scrollToBottomBtn) scrollToBottomBtn.classList.add("hidden");
        });
    }
}

function listenForMessages() {
    if (messagesUnsubscribe) messagesUnsubscribe();

    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"), limitToLast(currentMessageLimit));
    
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        if(!messagesContainer) return;
        
        const oldScrollHeight = messagesContainer.scrollHeight;
        const wasAtBottomBeforeRender = !isUserScrolledUp;

        lastSnapshotCache = snapshot;
        renderMessagesHTML(snapshot);

        if (isPaginationLoading) {
            const newScrollHeight = messagesContainer.scrollHeight;
            messagesContainer.scrollTop = newScrollHeight - oldScrollHeight; 
            isPaginationLoading = false;
        } else if (wasAtBottomBeforeRender) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } 
    }, (error) => {
        console.error("Mesaj Dinleme Hatası:", error);
    });
}

function renderMessagesHTML(snapshot) {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = "";
    let lastDisplayedDateString = ""; 

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const msgId = docSnap.id;
        const isBelongsToCurrentChat = (data.sender === currentUser && data.receiver === chatPartner) || (data.sender === chatPartner && data.receiver === currentUser);
        if (!isBelongsToCurrentChat) return;

        let timeString = "00:00";
        let currentMessageDateString = "";
        
        let msgTimeMs = data.localCreatedAt || Date.now();

        if (data.timestamp) {
            const date = data.timestamp.toDate();
            msgTimeMs = date.getTime();
            timeString = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            currentMessageDateString = formatSmartDate(msgTimeMs);
        } else {
            const fallbackDate = new Date(msgTimeMs);
            timeString = `${String(fallbackDate.getHours()).padStart(2, '0')}:${String(fallbackDate.getMinutes()).padStart(2, '0')}`;
            currentMessageDateString = formatSmartDate(msgTimeMs);
        }

        if (currentMessageDateString !== lastDisplayedDateString) {
            lastDisplayedDateString = currentMessageDateString;
            const dateSeparatorHtml = `
                <div class="flex justify-center my-2 select-none">
                    <span class="bg-gray-200/80 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 text-xs px-3 py-1 rounded-lg font-medium shadow-sm">${currentMessageDateString}</span>
                </div>`;
            messagesContainer.insertAdjacentHTML("beforeend", dateSeparatorHtml);
        }

        const isMe = data.sender === currentUser;
        let messageBg = isMe ? "bg-[#d9fdd3] dark:bg-emerald-900/40 text-gray-800 dark:text-gray-100 self-end rounded-l-xl rounded-br-xl" : "bg-white dark:bg-zinc-700 text-gray-800 dark:text-gray-100 self-start rounded-r-xl rounded-bl-xl";
        
        let contentBody = "";

        if (data.status === "uploading") {
            if (isMe) {
                contentBody = `
                    <div class="flex flex-col gap-2 p-2 w-[180px]">
                        <div class="flex justify-between items-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                            <span>Gönderiliyor...</span>
                            <span id="progress-text-${msgId}">%0</span>
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-zinc-600 h-2 rounded-full overflow-hidden">
                            <div id="progress-bar-${msgId}" class="bg-emerald-500 h-full w-0 transition-all duration-150"></div>
                        </div>
                    </div>`;
            } else {
                contentBody = `
                    <div class="flex items-center gap-2 p-2 text-xs italic text-gray-500 dark:text-gray-300">
                        <i class="fa-solid fa-spinner animate-spin text-emerald-500"></i>
                        <span>Karşı taraf bir ${data.messageType === 'image' ? 'fotoğraf' : data.messageType === 'video' ? 'video' : 'ses kaydı'} gönderiyor...</span>
                    </div>`;
            }
        } else {
            if (data.messageType === "image") {
                contentBody = `<img src="${data.fileData}" class="rounded-lg max-w-[200px] object-cover shadow-sm cursor-pointer" onclick="window.openImagePreview(this.src)">`;
            } else if (data.messageType === "audio") {
                contentBody = `<audio src="${data.fileData}" controls class="w-[180px] h-8"></audio>`;
            } else if (data.messageType === "video") {
                contentBody = `
                    <div class="flex flex-col gap-2 p-1">
                        <a href="${data.fileData}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-2 bg-zinc-800 text-white text-xs font-semibold px-3 py-2 rounded-lg">Videoyu İzle / İndir</a>
                    </div>`;
            } else {
                contentBody = `<p class="break-words max-w-[65vw] md:max-w-md whitespace-pre-wrap">${data.message}</p>`;
            }
        }

        let statusTick = "";
        if (isMe) {
            if (isPartnerOnline || partnerLastActive > msgTimeMs) {
                statusTick = `<span class="text-sky-500 ml-1">✓✓</span>`;
            } else {
                statusTick = `<span class="text-gray-400 ml-1">✓</span>`;
            }
        }

        const messageHtml = `
            <div class="flex flex-col ${isMe ? 'self-end' : 'self-start'} p-2 px-3 shadow-sm ${messageBg} relative group">
                ${contentBody}
                <span class="text-[9px] text-gray-400 text-right mt-1 block select-none">${timeString} ${statusTick}</span>
            </div>`;
        messagesContainer.insertAdjacentHTML("beforeend", messageHtml);
    });
}

window.addEventListener("resize", () => {
    if (currentUser && window.innerWidth > 768) {
        if (sidebarArea) sidebarArea.classList.remove("hidden");
        if (chatArea) { chatArea.classList.remove("hidden"); chatArea.classList.add("flex"); }
    }
});

function checkAutoLogin() {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    if (userParam === 'mat') window.selectUser('Mat Dehası');
    else if (userParam === 'biyoloji') window.selectUser('Biyolojinin Son Kalesi');
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", checkAutoLogin);
else checkAutoLogin();