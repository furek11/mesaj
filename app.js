import { db, switchDatabaseAccount } from "./firebase-config.js";
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

let currentUser = "";
let chatPartner = "";
let typingTimeout = null;
let isPartnerOnline = false;
let partnerLastActive = 0; 
let heartbeatInterval = null;
let messagesUnsubscribe = null; 
let lastSnapshotCache = null; 

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
let incomingUnreadCount = 0; 
let localRenderedMessageIds = new Set(); // Aynı mesajların tekrar sayılmasını engellemek için benzersiz ID takibi

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

const scrollToBottomBtn = document.getElementById("scroll-to-bottom-btn");
const unreadBadge = document.getElementById("unread-badge");

async function handleQuotaError(error, retryFunction, ...args) {
    if (error && (error.code === 'resource-exhausted' || error.message?.includes('quota') || error.message?.includes('exhausted'))) {
        switchDatabaseAccount();
        if (typeof retryFunction === 'function') {
            setTimeout(() => { retryFunction(...args); }, 500);
        }
        return true;
    }
    return false;
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
    if (heartbeatInterval) clearInterval(heartbeatInterval);
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

    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
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

async function forceSendPing(isOnlineStatus) {
    if (!currentUser) return;
    try {
        return await setDoc(doc(db, "presence", getDocId(currentUser)), {
            lastActive: Date.now(),
            isOnline: isOnlineStatus
        }, { merge: true });
    } catch (e) { 
        const handled = await handleQuotaError(e, forceSendPing, isOnlineStatus);
        if(!handled) console.error("Ping Hatası:", e); 
    }
}

function startHeartbeatSystem() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    forceSendPing(true);
    heartbeatInterval = setInterval(() => { forceSendPing(true); }, 15000);
}

window.openChatArea = function() {
    if (sidebarArea) sidebarArea.classList.add("hidden");
    if (chatArea) {
        chatArea.classList.remove("hidden", "md:flex");
        chatArea.classList.add("flex", "w-full");
    }
    incomingUnreadCount = 0;
    if (unreadBadge) unreadBadge.classList.add("hidden");
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
    if(avatarPlaceholder) avatarPlaceholder.textContent = chatPartner.charAt(0);

    if(loginScreen) loginScreen.classList.add("hidden");
    if(chatScreen) chatScreen.classList.remove("hidden");

    currentMessageLimit = 40; 
    incomingUnreadCount = 0;
    localRenderedMessageIds.clear();

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
    window.addEventListener("pagehide", () => { forceSendPing(false); });
    
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') startHeartbeatSystem();
        else forceSendPing(false);
    });
    
    window.addEventListener("focus", () => { startHeartbeatSystem(); });
    setupScrollTracking();
};

function listenPartnerPresence() {
    let unsub = onSnapshot(doc(db, "presence", getDocId(chatPartner)), (docSnap) => {
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

            // 🛠️ ÇÖZÜM 1: Aktiflik değiştiğinde tikleri tam zamanlı yenile
            if (lastSnapshotCache && messagesContainer) {
                renderMessagesHTML(lastSnapshotCache);
            }
        }
    }, (error) => {
        handleQuotaError(error, () => { unsub(); listenPartnerPresence(); });
    });
}

function setupTypingListener() {
    if (!messageInput) return;
    messageInput.addEventListener("input", async () => {
        if (!currentUser) return;
        try {
            await updateDoc(doc(db, "presence", getDocId(currentUser)), { isTyping: true });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(async () => {
                try { updateDoc(doc(db, "presence", getDocId(currentUser)), { isTyping: false }); } catch(e) { handleQuotaError(e); }
            }, 1500);
        } catch(e) { handleQuotaError(e); }
    });
}

async function sendCustomMessage(payload, type = "text") {
    try {
        if(currentUser) await updateDoc(doc(db, "presence", getDocId(currentUser)), { isTyping: false });
        let finalData = payload;

        if (type === "image" || type === "audio" || type === "video") {
            const formData = new FormData();
            formData.append("file", payload);
            formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
            let resourceType = (type === "audio" || type === "video") ? "video" : "image";

            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
                method: "POST",
                body: formData
            });
            const result = await response.json();
            if (result.secure_url) finalData = result.secure_url;
            else throw new Error("Cloudinary yükleme hatası");
        }

        // Yerel zaman damgası ekliyoruz ki sunucudan cevap gelene dek tikler çökmesiniz (0 write mantığı)
        await addDoc(collection(db, "messages"), {
            sender: currentUser, receiver: chatPartner,
            message: type === "text" ? finalData : "",
            fileData: type !== "text" ? finalData : "",
            messageType: type, timestamp: serverTimestamp(),
            localCreatedAt: Date.now() 
        });
        sendEmailNotification(type === "text" ? finalData : `Sana bir ${type === "image" ? "fotoğraf" : "ses kaydı"} gönderdi.`, type === "text" ? "metin" : type);
    } catch (e) { handleQuotaError(e, sendCustomMessage, payload, type); }
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
        if (file.type.startsWith("image/")) sendCustomMessage(file, "image");
        else if (file.type.startsWith("audio/")) sendCustomMessage(file, "audio");
        else if (file.type.startsWith("video/")) sendCustomMessage(file, "video");
        fileInput.value = ""; 
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
            incomingUnreadCount = 0; 
            if (scrollToBottomBtn) scrollToBottomBtn.classList.add("hidden");
            if (unreadBadge) unreadBadge.classList.add("hidden");
        }
    });

    if (scrollToBottomBtn) {
        scrollToBottomBtn.addEventListener("click", () => {
            isUserScrolledUp = false;
            incomingUnreadCount = 0;
            currentMessageLimit = 40;
            localRenderedMessageIds.clear(); // Sıfırlamada seti temizle
            if (unreadBadge) unreadBadge.classList.add("hidden");
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

        // 🛠️ ÇÖZÜM 2: Pagination çakışmasız, tamamen stabil +1, +2 sayaç sistemi
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const msgId = change.doc.id;
                const newMsg = change.doc.data();
                
                // Eğer mesajı daha önce listeye eklemediysek ve kullanıcı yukarıdaysa sayacı artır
                if (!localRenderedMessageIds.has(msgId)) {
                    if (newMsg.receiver === currentUser && newMsg.sender === chatPartner && isUserScrolledUp) {
                        incomingUnreadCount++;
                    }
                }
            }
        });

        // Mevcut snapshot'taki tüm ID'leri kaydet
        snapshot.forEach(d => localRenderedMessageIds.add(d.id));

        lastSnapshotCache = snapshot;
        renderMessagesHTML(snapshot);

        if (isPaginationLoading) {
            const newScrollHeight = messagesContainer.scrollHeight;
            messagesContainer.scrollTop = newScrollHeight - oldScrollHeight; 
            isPaginationLoading = false;
        } else if (wasAtBottomBeforeRender) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } 
        
        // 🛠️ Sayaç balonunun görünürlük durumunu güncelle
        if (isUserScrolledUp && incomingUnreadCount > 0) {
            if (unreadBadge) {
                unreadBadge.textContent = `+${incomingUnreadCount}`;
                unreadBadge.classList.remove("hidden");
            }
        } else {
            if (unreadBadge) unreadBadge.classList.add("hidden");
        }

    }, (error) => {
        handleQuotaError(error, () => { listenForMessages(); });
    });
}

function renderMessagesHTML(snapshot) {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = "";
    let lastDisplayedDateString = ""; 

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const isBelongsToCurrentChat = (data.sender === currentUser && data.receiver === chatPartner) || (data.sender === chatPartner && data.receiver === currentUser);
        if (!isBelongsToCurrentChat) return;

        let timeString = "00:00";
        let currentMessageDateString = "";
        
        // 🛠️ ÇÖZÜM 1: Yeni mesaj atıldığında `timestamp` null gelse bile `localCreatedAt` kullanarak çökme ve tik donması engellendi
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

        let statusTick = "";
        if (isMe) {
            // Anlık aktiflik veya geçmiş görülme eşleşme kontrolü
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