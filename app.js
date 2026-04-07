import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, query, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc, updateDoc, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBINneLJjwUsvtfuareLZxXPeCcMRxDNlY",
    authDomain: "tezgram-84b50.firebaseapp.com",
    projectId: "tezgram-84b50",
    storageBucket: "tezgram-84b50.firebasestorage.app",
    messagingSenderId: "895242860702",
    appId: "1:895242860702:web:e27468b067af1c5d2fa38f"
};

let app, auth, db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
    // Show error to user and hide splash screen
    setTimeout(() => {
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) splashScreen.style.display = 'none';
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.style.display = 'flex';
    }, 1000);
}

// DOM - Safe access with null checks
const splashScreen = document.getElementById('splashScreen');
const loginScreen = document.getElementById('loginScreen');
const profileSetupModal = document.getElementById('profileSetupModal');
const appScreen = document.getElementById('app');
const chatList = document.getElementById('chatList');
const selfProfileView = document.getElementById('selfProfileView');
const chatWindow = document.getElementById('chatWindow');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const backBtn = document.getElementById('backBtn');
const emojiBtn = document.querySelector('.emoji-btn');
const emojiPicker = document.getElementById('emojiPicker');
const callModal = document.getElementById('callModal');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatusText = document.getElementById('callStatusText');
const ringtoneIncoming = document.getElementById('ringtoneIncoming');
const ringtoneOutgoing = document.getElementById('ringtoneOutgoing');
const muteBtn = document.getElementById('muteBtn');
const cameraToggleBtn = document.getElementById('cameraToggleBtn');
const logoutBtn = document.getElementById('logoutBtn');
const callBtn = document.getElementById('callBtn');
const videoBtn = document.getElementById('videoBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const profileViewBtn = document.getElementById('profileViewBtn');
const backToChatsBtn = document.getElementById('backToChatsBtn');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const profilePreview = document.getElementById('profilePreview');
const profileImageInput = document.getElementById('profileImageInput');
const usernameInput = document.getElementById('usernameInput');
const bioInput = document.getElementById('bioInput');
const nameInput = document.getElementById('nameInput');
const editProfileBtn = document.getElementById('editProfileBtn');
const editProfileModal = document.getElementById('editProfileModal');
const editProfileCloseBtn = document.getElementById('editProfileCloseBtn');
const editProfileSaveBtn = document.getElementById('editProfileSaveBtn');
const editProfilePreview = document.getElementById('editProfilePreview');
const editProfileImageInput = document.getElementById('editProfileImageInput');
const editUsernameInput = document.getElementById('editUsernameInput');
const editBioInput = document.getElementById('editBioInput');
const editNameInput = document.getElementById('editNameInput');
const searchInput = document.getElementById('searchInput');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');

// Failsafe: hide splash screen after 8 seconds no matter what
setTimeout(() => {
    hideSplashScreen();
}, 8000);

function hideSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if (splash && splash.style.display !== 'none') {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
        }, 300);
    }
}

// STATE
const APP_START_TIME = Date.now();
let currentUser = null, currentUserDoc = null, currentChatUserId = null, currentChatId = null, messagesUnsubscribe = null, activeCallDocId = null, pc = null, localStream = null, callUnsubscribe = null, callListenerUnsubscribe = null, callInProgress = false, isAnswering = false, allUsers = [];

onAuthStateChanged(auth, async (user) => {
    try {
        if (user) {
            currentUser = user; 
            const uSnap = await getDoc(doc(db, "users", user.uid));
            if (uSnap.exists() && uSnap.data().username) {
                currentUserDoc = uSnap.data(); 
                if (loginScreen) loginScreen.style.display = 'none'; 
                if (profileSetupModal) profileSetupModal.style.display = 'none';
                if (appScreen) appScreen.style.display = 'flex'; 
                
                updateStatus(true); 
                if (window.statusInterval) clearInterval(window.statusInterval);
                window.statusInterval = setInterval(() => updateStatus(true), 30000);
                
                try {
                    await deleteDoc(doc(db, "calls", user.uid));
                    const qCaller = query(collection(db, "calls"), where("callerId", "==", user.uid));
                    const callerSnaps = await getDocs(qCaller);
                    callerSnaps.forEach(d => deleteDoc(d.ref));
                } catch (e) {
                    console.error("Call cleanup failed", e);
                }

                loadUsersAndChats(); 
                setTimeout(() => { listenForIncomingCalls(); }, 2000);
            } else { 
                if (loginScreen) loginScreen.style.display = 'none'; 
                if (profileSetupModal) profileSetupModal.style.display = 'flex'; 
                if (appScreen) appScreen.style.display = 'none';
            }
        } else { 
            // No user - show login screen
            if (loginScreen) loginScreen.style.display = 'flex'; 
            if (appScreen) appScreen.style.display = 'none'; 
            if (profileSetupModal) profileSetupModal.style.display = 'none';
            if (messagesUnsubscribe) messagesUnsubscribe(); 
            if (window.statusInterval) clearInterval(window.statusInterval);
        }
    } catch (e) {
        console.error("Auth state error:", e);
        if (loginScreen) loginScreen.style.display = 'flex';
    } finally {
        hideSplashScreen();
        initializeLanguage();
    }
});

async function updateStatus(s) { 
    if(currentUser) {
        try {
            await setDoc(doc(db,"users",currentUser.uid),{isOnline:s,lastSeen:serverTimestamp()},{merge:true});
        } catch(e) {
            console.error("Status update error:", e);
        }
    }
}
window.onbeforeunload = () => { 
    updateStatus(false); 
    if(localStream) localStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
    if(pc) { try { pc.close(); } catch(e){} }
};
document.addEventListener('visibilitychange', () => updateStatus(document.visibilityState === 'visible'));

// Cleanup on page unload
window.addEventListener('unload', () => {
    if(messagesUnsubscribe) { try { messagesUnsubscribe(); } catch(e){} }
    if(callUnsubscribe) { try { callUnsubscribe(); } catch(e){} }
    if(callListenerUnsubscribe) { try { callListenerUnsubscribe(); } catch(e){} }
});

function loadUsersAndChats() {
    // Clear existing listener to prevent duplicates
    if (window.usersUnsubscribe) {
        window.usersUnsubscribe();
    }
    
    try {
        window.usersUnsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
            try {
                allUsers = snapshot.docs.map(d => d.data()).filter(u => u.uid !== currentUser?.uid && u.name);
                const now = Date.now();
                allUsers.forEach(u => {
                    if (u.isOnline === true && u.lastSeen && typeof u.lastSeen.toMillis === 'function') u.isActualOnline = (now - u.lastSeen.toMillis()) < 300000;
                    else u.isActualOnline = u.isOnline;
                    if (currentChatUserId === u.uid) {
                        const h = document.getElementById('currentStatus'); 
                        if (h) { 
                            h.textContent = u.isActualOnline ? 'онлайн' : 'офлайн'; 
                            h.style.color = u.isActualOnline ? 'var(--accent-color)' : 'var(--text-secondary)'; 
                        }
                    }
                }); 
                renderUserList(allUsers);
            } catch (e) {
                console.error("Error processing users snapshot:", e);
            }
        }, (error) => {
            console.error("Error loading users:", error);
            showNotification('Ошибка при загрузке пользователей', 'error');
        });
    } catch (e) {
        console.error("Error setting up users listener:", e);
        showNotification('Ошибка при инициализации чатов', 'error');
    }
}
function renderUserList(users) {
    chatList.innerHTML = '';
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    
    const filteredUsers = searchTerm ? 
        users.filter(u => u.name.toLowerCase().includes(searchTerm) || u.username?.toLowerCase().includes(searchTerm)) :
        users;
    
    if (filteredUsers.length === 0) {
        chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Контакты не найдены</div>';
        return;
    }
    
    filteredUsers.forEach(u => {
        const div = document.createElement('div'); 
        div.className = 'chat-item';
        const avatarSrc = u.avatar || getDefaultAvatar(u.name);
        div.innerHTML = `<div class="avatar-container"><img src="${avatarSrc}" class="avatar" onerror="this.src='${getDefaultAvatar(u.name)}'"><div class="status-indicator ${u.isActualOnline ? 'status-online' : 'status-offline'}"></div></div><div class="chat-info"><span class="chat-name">${u.name}</span><p class="chat-preview">${u.bio || ''}</p></div>`;
        div.onclick = () => openChatWith(u, div); 
        chatList.appendChild(div);
    });
}

function getDefaultAvatar(name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    const colorIndex = name.charCodeAt(0) % colors.length;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${colors[colorIndex].replace('#', '')}&color=fff&size=100`;
}

// Add search functionality
if (searchInput) {
    searchInput.addEventListener('input', () => renderUserList(allUsers));
}
function openChatWith(otherUser, node) {
    try {
        currentChatUserId = otherUser.uid; currentChatId = [currentUser.uid, otherUser.uid].sort().join("_");
        const avatarSrc = otherUser.avatar || getDefaultAvatar(otherUser.name);
        document.getElementById('currentAvatar').src = avatarSrc; 
        document.getElementById('currentName').textContent = otherUser.name;
        const h = document.getElementById('currentStatus'); h.textContent = otherUser.isActualOnline ? 'онлайн' : 'офлайн'; h.style.color = otherUser.isActualOnline ? 'var(--accent-color)' : 'var(--text-secondary)';
        chatWindow.classList.add('has-active'); document.body.classList.add('chat-active');
        messagesArea.innerHTML = ''; 
        if (messagesUnsubscribe) messagesUnsubscribe(); 
        markMessagesAsRead(currentChatId, otherUser.uid);
        
        const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("timestamp", "asc"));
        messagesUnsubscribe = onSnapshot(q, (snapshot) => {
            try {
                snapshot.docChanges().forEach((change) => {
                    const data = change.doc.data(), msgId = change.doc.id;
                    if (change.type === "added") { 
                        const avatarSrc = otherUser.avatar || getDefaultAvatar(otherUser.name);
                        renderMessage(data, avatarSrc, msgId); 
                        if (data.senderId === otherUser.uid && !data.isRead) updateDoc(change.doc.ref, { isRead: true }); 
                    }
                    else if (change.type === "modified") updateMessageStatusUI(msgId, data.isRead);
                }); 
                requestAnimationFrame(() => messagesArea.scrollTop = messagesArea.scrollHeight);
            } catch (e) {
                console.error("Error processing messages snapshot:", e);
            }
        }, (error) => {
            console.error("Error loading messages:", error);
            showNotification('Ошибка при загрузке сообщений', 'error');
        });
    } catch (e) {
        console.error("Error opening chat:", e);
        showNotification('Ошибка при открытии чата', 'error');
    }
}
async function markMessagesAsRead(chatId, otherUid) {
    const q = query(collection(db, "chats", chatId, "messages"), where("senderId", "==", otherUid), where("isRead", "==", false));
    const snap = await getDocs(q); snap.forEach(d => updateDoc(d.ref, { isRead: true }));
}
function renderMessage(data, avatar, id) {
    const isMe = data.senderId === currentUser.uid;
    const div = document.createElement('div'); 
    div.id = `msg-${id}`; 
    div.className = `message ${isMe ? 'sent' : 'received'}`;
    const statusIcon = data.isRead ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-check"></i>';
    const statusHtml = isMe ? `<span class="message-status-icon" id="status-${id}">${statusIcon}</span>` : '';
    const avatarHtml = !isMe ? `<img src="${avatar}" class="avatar" style="width:30px;height:30px">` : '';
    div.innerHTML = `${avatarHtml}<div class="message-content"><div class="msg-text">${data.type === 'image' ? `<img src="${data.text}" style="max-width:100%; border-radius:8px;" alt="image" loading="lazy" crossorigin="anonymous">` : data.text}</div><div class="msg-meta">${statusHtml}</div></div>`;
    messagesArea.appendChild(div);
}
function updateMessageStatusUI(id, isRead) { const statusEl = document.getElementById(`status-${id}`); if (statusEl) statusEl.innerHTML = isRead ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-check"></i>'; }
const doSendMessage = async () => { 
    const text = messageInput.value.trim(); 
    if (!text || !currentChatId) return; 
    
    if (text.length > 1000) {
        showNotification('Сообщение слишком длинное (максимум 1000 символов)', 'error');
        return;
    }
    
    messageInput.value = ''; 
    try {
        await addDoc(collection(db, "chats", currentChatId, "messages"), { 
            senderId: currentUser.uid, 
            text: text, 
            type: 'text', 
            isRead: false, 
            timestamp: serverTimestamp() 
        });
    } catch (e) {
        console.error("Send message error:", e);
        showNotification('Ошибка при отправке сообщения', 'error');
        messageInput.value = text; // Restore message on error
    }
};

sendBtn.onclick = doSendMessage; messageInput.onkeypress = (e) => { if (e.key === 'Enter') doSendMessage(); };
backBtn.onclick = () => document.body.classList.remove('chat-active');
emojiBtn.onclick = () => emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
document.getElementById('attachBtn').onclick = () => document.getElementById('imageInput').click();
document.getElementById('imageInput').onchange = (e) => {
    const file = e.target.files[0]; 
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showNotification('Пожалуйста, выберите изображение', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Размер файла не должен превышать 10 МБ', 'error');
        return;
    }
    
    const reader = new FileReader(); 
    reader.onload = (ev) => {
        const img = new Image(); 
        img.onload = () => {
            const canvas = document.createElement('canvas'); 
            const MAX = 800; 
            let w = img.width, h = img.height;
            if (w > h) { 
                if (w > MAX) { 
                    h *= MAX / w; 
                    w = MAX; 
                } 
            } else { 
                if (h > MAX) { 
                    w *= MAX / h; 
                    h = MAX; 
                } 
            }
            canvas.width = w; 
            canvas.height = h; 
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            
            try {
                addDoc(collection(db, "chats", currentChatId, "messages"), { 
                    senderId: currentUser.uid, 
                    text: canvas.toDataURL('image/jpeg', 0.6), 
                    type: 'image', 
                    isRead: false, 
                    timestamp: serverTimestamp() 
                });
            } catch (e) {
                console.error("Image send error:", e);
                showNotification('Ошибка при отправке изображения', 'error');
            }
        };
        img.onerror = () => {
            showNotification('Ошибка при загрузке изображения', 'error');
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Clear input to allow same file selection
};

// --- CALLS RESET ---
const startCall = async (type) => {
    if (!currentChatUserId || callInProgress) return;
    callInProgress = true;
    activeCallDocId = currentChatUserId; callModal.style.display = 'flex'; ringtoneOutgoing.play();
    callStatusText.textContent = `Звонок ${type === 'video' ? 'видео' : 'аудио'}...`;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
        localVideo.srcObject = (type === 'video') ? localStream : null;
        localVideo.style.display = (type === 'video') ? 'block' : 'none'; remoteVideo.style.display = (type === 'video') ? 'block' : 'none';
        cameraToggleBtn.style.display = (type === 'video') ? 'flex' : 'none'; muteBtn.style.display = 'flex';
        muteBtn.querySelector('i').className = 'fa-solid fa-microphone';
        cameraToggleBtn.querySelector('i').className = 'fa-solid fa-video';
        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]});
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        pc.onicecandidate = e => e.candidate && addDoc(collection(db, "calls", activeCallDocId, "offerCandidates"), e.candidate.toJSON());
        pc.ontrack = e => { ringtoneOutgoing.pause(); remoteVideo.srcObject = e.streams[0]; };
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        await setDoc(doc(db, "calls", activeCallDocId), { offer, callerName: currentUserDoc.name, type, callerId: currentUser.uid, sentAt: serverTimestamp() });
        
        // Single consolidated listener for the call status
        callUnsubscribe = onSnapshot(doc(db, "calls", activeCallDocId), s => {
            const data = s.data();
            if (!s.exists()) { endCall(); return; }
            if (data?.answer && !pc.currentRemoteDescription) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        });
        
        // Ice candidates listener
        const candyUnsub = onSnapshot(collection(db, "calls", activeCallDocId, "answerCandidates"), s => {
            s.docChanges().forEach(c => c.type === 'added' && pc.addIceCandidate(new RTCIceCandidate(c.doc.data())));
        });
        
        // Store both unsubs to clean up
        const originalUnsub = callUnsubscribe;
        callUnsubscribe = () => { originalUnsub(); candyUnsub(); };
    } catch (e) {
        console.error("Call start error:", e);
        if (e.name === 'NotAllowedError') {
            showNotification('Доступ к камере/микрофону запрещен', 'error');
        } else if (e.name === 'NotFoundError') {
            showNotification('Камера или микрофон не найдены', 'error');
        } else {
            showNotification('Ошибка при начале звонка', 'error');
        }
        endCall();
    }
};
function listenForIncomingCalls() {
    // Clear existing listener to prevent duplicates
    if (callListenerUnsubscribe) {
        callListenerUnsubscribe();
    }
    
    let isInitial = true;
    
    callListenerUnsubscribe = onSnapshot(doc(db, "calls", currentUser.uid), async (s) => {
        if (!s.exists()) {
            isInitial = false;
            if ((pc || callModal.style.display === 'flex') && !callInProgress) endCall();
            return;
        }

        const data = s.data();
        
        if (isInitial) {
            isInitial = false;
            console.log("Listen: Ignoring initial stale record", data);
            deleteDoc(s.ref);
            return;
        }

        const sentAt = data.sentAt?.toMillis ? data.sentAt.toMillis() : (data.sentAt || 0);
        const now = Date.now();
        if (sentAt && sentAt < APP_START_TIME - 10000) {
            console.log("Listen: Offer too old, deleting", sentAt);
            deleteDoc(s.ref);
            return;
        }

        if (data.offer && !pc && !isAnswering) {
            isAnswering = true;
            activeCallDocId = currentUser.uid;
            ringtoneIncoming.play(); callModal.style.display = 'flex';
            callStatusText.textContent = `Входящий ${data.type === 'video' ? 'видео' : 'аудио'} вызов от ${data.callerName || 'пользователя'}...`;
            document.getElementById('answerCallBtn').style.display = 'flex'; 
            document.getElementById('rejectCallBtn').style.display = 'flex'; 
            document.getElementById('endCallBtn').style.display = 'none';
            cameraToggleBtn.style.display = 'none'; muteBtn.style.display = 'none';
            
            document.getElementById('answerCallBtn').onclick = async () => {
                try {
                    ringtoneIncoming.pause();
                    document.getElementById('answerCallBtn').style.display = 'none'; 
                    document.getElementById('rejectCallBtn').style.display = 'none'; 
                    document.getElementById('endCallBtn').style.display = 'flex';
                    cameraToggleBtn.style.display = (data.type === 'video') ? 'flex' : 'none'; 
                    muteBtn.style.display = 'flex';
                    muteBtn.querySelector('i').className = 'fa-solid fa-microphone';
                    cameraToggleBtn.querySelector('i').className = 'fa-solid fa-video';
                    
                    localStream = await navigator.mediaDevices.getUserMedia({ video: data.type === 'video', audio: true });
                    localVideo.srcObject = (data.type === 'video') ? localStream : null;
                    localVideo.style.display = (data.type === 'video') ? 'block' : 'none'; 
                    remoteVideo.style.display = (data.type === 'video') ? 'block' : 'none';
                    
                    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]});
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                    pc.onicecandidate = e => e.candidate && addDoc(collection(db, "calls", currentUser.uid, "answerCandidates"), e.candidate.toJSON());
                    pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
                    
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await pc.createAnswer(); 
                    await pc.setLocalDescription(answer);
                    await setDoc(doc(db, "calls", currentUser.uid), { answer }, { merge: true });
                    
                    const unsub = onSnapshot(doc(db, "calls", currentUser.uid), s => { if (!s.exists()) endCall(); });
                    callUnsubscribe = unsub;
                    callInProgress = true;
                } catch (e) {
                    console.error("Answer error:", e);
                    if (e.name === 'NotAllowedError') {
                        showNotification('Доступ к камере/микрофону запрещен', 'error');
                    } else if (e.name === 'NotFoundError') {
                        showNotification('Камера или микрофон не найдены', 'error');
                    } else {
                        showNotification('Ошибка при ответе на звонок', 'error');
                    }
                    endCall();
                }
            };
        } else if (!s.exists()) {
            if ((pc || callModal.style.display === 'flex') && !callInProgress) endCall();
        }
    });
}
function endCall() {
    ringtoneIncoming.pause(); ringtoneOutgoing.pause();
    ringtoneIncoming.currentTime = 0; ringtoneOutgoing.currentTime = 0;
    if (pc) { try { pc.close(); } catch(e){} pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} }); localStream = null; }
    callModal.style.display = 'none';
    if (callUnsubscribe) { try { callUnsubscribe(); } catch(e){} callUnsubscribe = null; }
    
    // Reset UI for next call
    document.getElementById('answerCallBtn').style.display = 'none';
    document.getElementById('rejectCallBtn').style.display = 'none';
    document.getElementById('endCallBtn').style.display = 'flex';
    
    if (currentUser && activeCallDocId) { 
        try { deleteDoc(doc(db, "calls", activeCallDocId)); } catch(e){}
        activeCallDocId = null; 
    }
    
    callInProgress = false;
    isAnswering = false;
}
// Add event listeners with null checks
if (googleLoginBtn) {
    googleLoginBtn.onclick = () => {
        signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
            console.error('Login error:', err);
            showNotification('Login failed: ' + err.message, 'error');
        });
    };
}
if (logoutBtn) {
    logoutBtn.onclick = () => signOut(auth);
}
if (sendBtn) {
    sendBtn.onclick = doSendMessage;
}
if (messageInput) {
    messageInput.onkeypress = (e) => { if (e.key === 'Enter') doSendMessage(); };
}
if (backBtn) {
    backBtn.onclick = () => document.body.classList.remove('chat-active');
}
if (emojiBtn) {
    emojiBtn.onclick = () => {
        if (emojiPicker) {
            emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
        }
    };
}
if (attachBtn) {
    attachBtn.onclick = () => {
        const imageInput = document.getElementById('imageInput');
        if (imageInput) imageInput.click();
    };
}
if (profileViewBtn) {
    profileViewBtn.onclick = () => { 
        if (chatList) chatList.style.display = 'none'; 
        if (selfProfileView) selfProfileView.style.display = 'block'; 
        const avatarSrc = currentUserDoc.avatar || getDefaultAvatar(currentUserDoc.name);
        const myProfilePhoto = document.getElementById('myProfilePhoto');
        if (myProfilePhoto) {
            myProfilePhoto.src = avatarSrc;
            myProfilePhoto.onerror = null;
        }
        const myProfileName = document.getElementById('myProfileName');
        if (myProfileName) myProfileName.textContent = currentUserDoc.name; 
        const myProfileUsername = document.getElementById('myProfileUsername');
        if (myProfileUsername) myProfileUsername.textContent = currentUserDoc.username; 
        const myProfileBio = document.getElementById('myProfileBio');
        if (myProfileBio) myProfileBio.textContent = currentUserDoc.bio; 
    };
}
if (backToChatsBtn) {
    backToChatsBtn.onclick = () => { 
        if (selfProfileView) selfProfileView.style.display = 'none'; 
        if (chatList) chatList.style.display = 'flex'; 
    };
}
document.getElementById('editProfileBtn').onclick = () => { 
    document.getElementById('editProfileModal').style.display = 'flex'; 
    document.getElementById('editUsernameInput').value = currentUserDoc.username?.replace('@', '') || ''; 
    document.getElementById('editNameInput').value = currentUserDoc.name || '';
    document.getElementById('editBioInput').value = currentUserDoc.bio || ''; 
    const avatarSrc = currentUserDoc.avatar || getDefaultAvatar(currentUserDoc.name);
    const editPreview = document.getElementById('editProfilePreview');
    const editPlaceholder = document.getElementById('editAvatarPlaceholder');
    
    if (editPreview && editPlaceholder) {
        editPreview.src = avatarSrc;
        
        // Check if it's a real uploaded image or default avatar
        const isRealImage = avatarSrc && !avatarSrc.includes('ui-avatars.com');
        
        if (isRealImage) {
            editPreview.style.display = 'block';
            editPreview.style.background = 'var(--bg-glass)';
            editPlaceholder.style.display = 'none';
        } else {
            editPreview.style.display = 'none';
            editPlaceholder.style.display = 'flex';
        }
        
        console.log('Edit profile avatar initialized:', { isRealImage, avatarSrc });
    } else {
        console.error('Edit avatar elements not found');
    }
};
if (saveProfileBtn) {
    saveProfileBtn.onclick = async () => { 
        const username = "@" + (usernameInput ? usernameInput.value.trim() : '');
        const name = nameInput ? nameInput.value.trim() : '';
        const bio = bioInput ? bioInput.value.trim() : '';
        
        if (!username.replace('@', '')) {
            showNotification(t('username_empty', 'notifications'), 'error');
            return;
        }
        
        if (!name) {
            showNotification(t('name_empty', 'notifications'), 'error');
            return;
        }
        
        try {
            const q = query(collection(db, "users"), where("username", "==", username));
            const snapshot = await getDocs(q);
            
            if (snapshot.docs.length > 0) {
                showNotification(t('username_taken', 'notifications'), 'error');
                return;
            }
            
            const avatarSrc = (profilePreview ? profilePreview.src : '') || getDefaultAvatar(name);
            const pr = { 
                uid: currentUser.uid, 
                name: name, 
                username: username, 
                bio: bio, 
                avatar: avatarSrc, 
                isOnline: true 
            }; 
            await setDoc(doc(db, "users", currentUser.uid), pr); 
            currentUserDoc = pr; 
            if (profileSetupModal) profileSetupModal.style.display = 'none'; 
            if (appScreen) appScreen.style.display = 'flex';
            showNotification(t('profile_created', 'notifications'), 'success');
        } catch (e) {
            console.error("Profile setup error:", e);
            showNotification(t('profile_error', 'notifications'), 'error');
        }
    };
}
document.getElementById('profilePreview').onclick = () => document.getElementById('profileImageInput').click();
document.getElementById('avatarPlaceholder').onclick = () => document.getElementById('profileImageInput').click();

document.getElementById('profileImageInput').onchange = (e) => { 
    const f = e.target.files[0]; 
    if (f) { 
        if (!f.type.startsWith('image/')) {
            showNotification('Пожалуйста, выберите изображение', 'error');
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            showNotification('Размер файла не должен превышать 5 МБ', 'error');
            return;
        }
        
        const r = new FileReader(); 
        r.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const preview = document.getElementById('profilePreview');
                const placeholder = document.getElementById('avatarPlaceholder');
                
                if (preview && placeholder) {
                    preview.src = ev.target.result;
                    preview.style.display = 'block';
                    preview.style.background = 'var(--bg-glass)';
                    placeholder.style.display = 'none';
                    console.log('Avatar preview updated successfully');
                } else {
                    console.error('Avatar elements not found');
                    showNotification('Ошибка: элементы аватара не найдены', 'error');
                }
            };
            img.onerror = () => {
                showNotification('Ошибка при загрузке изображения', 'error');
            };
            img.src = ev.target.result;
        }; 
        r.readAsDataURL(f); 
    } 
};
document.getElementById('editProfileSaveBtn').onclick = async () => { 
    const newUsername = "@" + document.getElementById('editUsernameInput').value.trim();
    const newName = document.getElementById('editNameInput').value.trim();
    const newBio = document.getElementById('editBioInput').value.trim();
    
    if (!newUsername.replace('@', '')) {
        showNotification('Юзернейм не может быть пустым', 'error');
        return;
    }
    
    if (!newName) {
        showNotification('Имя не может быть пустым', 'error');
        return;
    }
    
    try {
        const q = query(collection(db, "users"), where("username", "==", newUsername));
        const snapshot = await getDocs(q);
        const isTaken = snapshot.docs.some(d => d.id !== currentUser.uid);
        
        if (isTaken) {
            showNotification('Этот юзернейм уже занят. Выберите другой.', 'error');
            return;
        }
        
        const avatarSrc = document.getElementById('editProfilePreview').src || getDefaultAvatar(newName);
        const pr = { 
            uid: currentUser.uid, 
            name: newName, 
            username: newUsername, 
            bio: newBio, 
            avatar: avatarSrc, 
            isOnline: true 
        }; 
        await setDoc(doc(db, "users", currentUser.uid), pr); 
        currentUserDoc = pr; 
        document.getElementById('editProfileModal').style.display = 'none'; 
        document.getElementById('myProfilePhoto').src = avatarSrc; 
        document.getElementById('myProfileName').textContent = pr.name; 
        document.getElementById('myProfileUsername').textContent = pr.username; 
        document.getElementById('myProfileBio').textContent = pr.bio;
        showNotification('Профиль успешно обновлён', 'success');
    } catch (e) {
        console.error("Profile save error:", e);
        showNotification('Ошибка при сохранении профиля', 'error');
    }
};
document.getElementById('editProfilePreview').onclick = () => document.getElementById('editProfileImageInput').click();
document.getElementById('editAvatarPlaceholder').onclick = () => document.getElementById('editProfileImageInput').click();

document.getElementById('editProfileImageInput').onchange = (e) => { 
    const f = e.target.files[0]; 
    if (f) { 
        if (!f.type.startsWith('image/')) {
            showNotification('Пожалуйста, выберите изображение', 'error');
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            showNotification('Размер файла не должен превышать 5 МБ', 'error');
            return;
        }
        
        const r = new FileReader(); 
        r.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const preview = document.getElementById('editProfilePreview');
                const placeholder = document.getElementById('editAvatarPlaceholder');
                
                if (preview && placeholder) {
                    preview.src = ev.target.result;
                    preview.style.display = 'block';
                    preview.style.background = 'var(--bg-glass)';
                    placeholder.style.display = 'none';
                    console.log('Edit avatar preview updated successfully');
                } else {
                    console.error('Edit avatar elements not found');
                    showNotification('Ошибка: элементы аватара не найдены', 'error');
                }
            };
            img.onerror = () => {
                showNotification('Ошибка при загрузке изображения', 'error');
            };
            img.src = ev.target.result;
        }; 
        r.readAsDataURL(f); 
    } 
};
document.getElementById('editProfileCloseBtn').onclick = () => { document.getElementById('editProfileModal').style.display = 'none'; };
// Translation system
const translations = {
    ru: {
        select_chat: 'Выберите чат',
        start_messaging: 'Начните общение в TezGram',
        write_message: 'Написать сообщение...',
        login_google: 'Войти через Google',
        profile_setup: 'Настройка профиля',
        profile_info: 'Заполните данные, чтобы другие могли вас найти',
        username: '@username',
        bio: 'О себе (био)',
        name: 'Ваше имя',
        save_and_login: 'Сохранить и войти',
        edit_profile: 'Редактировать профиль',
        save_changes: 'Сохранить изменения',
        online: 'онлайн',
        offline: 'офлайн',
        calling: 'Звонок...',
        video_calling: 'Видеозвонок...',
        incoming_call: 'Входящий',
        outgoing_call: 'Исходящий',
        audio_call: 'аудио',
        video_call: 'видео',
        call_from: 'вызов от',
        answer_call: 'Принять вызов',
        reject_call: 'Сбросить вызов',
        end_call: 'Положить трубку',
        mute: 'Выключить микрофон',
        camera: 'Выключить камеру',
        contacts_not_found: 'Контакты не найдены',
        search_chats: 'Поиск чатов и людей...',
        profile: 'Профиль',
        logout: 'Выйти',
        back_to_chats: 'Назад к чатам',
        change_avatar: 'Нажмите, чтобы изменить аватар',
        notifications: {
            username_empty: 'Юзернейм не может быть пустым',
            name_empty: 'Имя не может быть пустым',
            username_taken: 'Этот юзернейм уже занят. Выберите другой.',
            profile_created: 'Профиль успешно создан!',
            profile_updated: 'Профиль успешно обновлён',
            profile_error: 'Ошибка при сохранении профиля',
            msg_too_long: 'Сообщение слишком длинное (максимум 1000 символов)',
            msg_send_error: 'Ошибка при отправке сообщения',
            img_send_error: 'Ошибка при отправке изображения',
            img_format_error: 'Пожалуйста, выберите изображение',
            img_size_error: 'Размер файла не должен превышать',
            img_load_error: 'Ошибка при загрузке изображения',
            call_access_denied: 'Доступ к камере/микрофону запрещен',
            call_not_found: 'Камера или микрофон не найдены',
            call_start_error: 'Ошибка при начале звонка',
            call_answer_error: 'Ошибка при ответе на звонок',
            avatar_elements_error: 'Ошибка: элементы аватара не найдены',
            users_load_error: 'Ошибка при загрузке пользователей',
            chats_init_error: 'Ошибка при инициализации чатов',
            messages_load_error: 'Ошибка при загрузке сообщений',
            chat_open_error: 'Ошибка при открытии чата',
            auth_load_error: 'Ошибка при загрузке профиля'
        }
    },
    en: {
        select_chat: 'Choose a chat',
        start_messaging: 'Start messaging in TezGram',
        write_message: 'Write a message...',
        login_google: 'Sign in with Google',
        profile_setup: 'Profile Setup',
        profile_info: 'Fill in your details so others can find you',
        username: '@username',
        bio: 'About you (bio)',
        name: 'Your name',
        save_and_login: 'Save and Login',
        edit_profile: 'Edit Profile',
        save_changes: 'Save Changes',
        online: 'online',
        offline: 'offline',
        calling: 'Calling...',
        video_calling: 'Video calling...',
        incoming_call: 'Incoming',
        outgoing_call: 'Outgoing',
        audio_call: 'audio',
        video_call: 'video',
        call_from: 'call from',
        answer_call: 'Answer Call',
        reject_call: 'Reject Call',
        end_call: 'End Call',
        mute: 'Mute Microphone',
        camera: 'Turn Off Camera',
        contacts_not_found: 'No contacts found',
        search_chats: 'Search chats and people...',
        profile: 'Profile',
        logout: 'Logout',
        back_to_chats: 'Back to Chats',
        change_avatar: 'Click to change avatar',
        notifications: {
            username_empty: 'Username cannot be empty',
            name_empty: 'Name cannot be empty',
            username_taken: 'This username is already taken. Choose another.',
            profile_created: 'Profile created successfully!',
            profile_updated: 'Profile updated successfully!',
            profile_error: 'Error saving profile',
            msg_too_long: 'Message too long (max 1000 characters)',
            msg_send_error: 'Error sending message',
            img_send_error: 'Error sending image',
            img_format_error: 'Please select an image',
            img_size_error: 'File size must not exceed',
            img_load_error: 'Error loading image',
            call_access_denied: 'Camera/microphone access denied',
            call_not_found: 'Camera or microphone not found',
            call_start_error: 'Error starting call',
            call_answer_error: 'Error answering call',
            avatar_elements_error: 'Error: avatar elements not found',
            users_load_error: 'Error loading users',
            chats_init_error: 'Error initializing chats',
            messages_load_error: 'Error loading messages',
            chat_open_error: 'Error opening chat',
            auth_load_error: 'Error loading profile'
        }
    },
    uz: {
        select_chat: 'Chatni tanlang',
        start_messaging: 'TezGram da xabarlashni boshlang',
        write_message: 'Xabar yozing...',
        login_google: 'Google bilan kirish',
        profile_setup: 'Profilni sozlash',
        profile_info: 'Boshqalar sizni topishi uchun ma\'lumotlaringizni to\'ldiring',
        username: '@username',
        bio: 'O\'zingiz haqingizda (bio)',
        name: 'Ismingiz',
        save_and_login: 'Saqlash va kirish',
        edit_profile: 'Profilni tahrirlash',
        save_changes: 'O\'zgarishlarni saqlash',
        online: 'onlayn',
        offline: 'oflayn',
        calling: 'Qo\'ng\'iroq qilinmoqda...',
        video_calling: 'Video qo\'ng\'iroq qilinmoqda...',
        incoming_call: 'Kiruvchi',
        outgoing_call: 'Chiquvchi',
        audio_call: 'audio',
        video_call: 'video',
        call_from: 'dan qo\'ng\'iroq',
        answer_call: 'Qo\'ng\'iroqni javob berish',
        reject_call: 'Qo\'ng\'iroqni rad etish',
        end_call: 'Qo\'ng\'iroqni tugatish',
        mute: 'Mikrofonni o\'chirish',
        camera: 'Kamerani o\'chirish',
        contacts_not_found: 'Kontaktlar topilmadi',
        search_chats: 'Chatlar va odamlarni qidirish...',
        profile: 'Profil',
        logout: 'Chiqish',
        back_to_chats: 'Chatlarga qaytish',
        change_avatar: 'Avatarni o\'zgartirish uchun bosing',
        notifications: {
            username_empty: 'Username bo\'sh bo\'lishi mumkin emas',
            name_empty: 'Ism bo\'sh bo\'lishi mumkin emas',
            username_taken: 'Bu username band. Boshqasini tanlang.',
            profile_created: 'Profil muvaffaqiyatli yaratildi!',
            profile_updated: 'Profil muvaffaqiyatli yangilandi!',
            profile_error: 'Profilni saqlashda xatolik',
            msg_too_long: 'Xabar juda uzun (maksimum 1000 belgi)',
            msg_send_error: 'Xabar yuborishda xatolik',
            img_send_error: 'Rasm yuborishda xatolik',
            img_format_error: 'Iltimos, rasm tanlang',
            img_size_error: 'Fayl hajmi',
            img_load_error: 'Rasm yuklashda xatolik',
            call_access_denied: 'Kamera/mikrofon ruxsati berilmadi',
            call_not_found: 'Kamera yoki mikrofon topilmadi',
            call_start_error: 'Qo\'ng\'iroqni boshlashda xatolik',
            call_answer_error: 'Qo\'ng\'iroqqa javob berishda xatolik',
            avatar_elements_error: 'Xatolik: avatar elementlari topilmadi',
            users_load_error: 'Foydalanuvchilarni yuklashda xatolik',
            chats_init_error: 'Chatlarni ishga tushirishda xatolik',
            messages_load_error: 'Xabalarni yuklashda xatolik',
            chat_open_error: 'Chatni ochishda xatolik',
            auth_load_error: 'Profilni yuklashda xatolik'
        }
    }
};

let currentLanguage = localStorage.getItem('language') || 'ru';

function t(key, category = null) {
    if (category && translations[currentLanguage][category]) {
        return translations[currentLanguage][category][key] || key;
    }
    return translations[currentLanguage][key] || key;
}

function updateLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    document.getElementById('currentLang').textContent = lang.toUpperCase();
    updateAllTexts();
}

function updateAllTexts() {
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = t(key);
    });
    
    // Update placeholders
    const messageInput = document.getElementById('messageInput');
    if (messageInput) messageInput.placeholder = t('write_message');
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.placeholder = t('search_chats');
    
    // Update other elements
    const usernameInputs = document.querySelectorAll('#usernameInput, #editUsernameInput');
    usernameInputs.forEach(input => input.placeholder = t('username'));
    
    const nameInputs = document.querySelectorAll('#nameInput, #editNameInput');
    nameInputs.forEach(input => input.placeholder = t('name'));
    
    const bioInputs = document.querySelectorAll('#bioInput, #editBioInput');
    bioInputs.forEach(input => input.placeholder = t('bio'));
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 100000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    const colors = {
        success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
    };
    
    notification.style.background = colors[type] || colors.info;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function updateAvatarPlaceholders(avatarSrc, type) {
    const prefix = type === 'edit' ? 'edit' : '';
    const placeholder = document.getElementById(`${prefix}avatarPlaceholder`);
    const preview = document.getElementById(`${prefix}profilePreview`);
    
    console.log(`Updating avatar placeholders for ${type}:`, { avatarSrc, placeholder: !!placeholder, preview: !!preview });
    
    if (!placeholder || !preview) {
        console.error(`Avatar elements not found for type: ${type}`);
        return;
    }
    
    // Check if it's a real image (not default avatar)
    const isRealImage = avatarSrc && !avatarSrc.includes('ui-avatars.com');
    
    if (isRealImage) {
        placeholder.style.display = 'none';
        preview.style.display = 'block';
        preview.style.background = 'var(--bg-glass)';
    } else {
        placeholder.style.display = 'flex';
        preview.style.display = 'none';
    }
}

// Initialize language switcher
function initializeLanguage() {
    const langBtn = document.getElementById('langBtn');
    const langDropdown = document.getElementById('langDropdown');
    const currentLangSpan = document.getElementById('currentLang');
    
    if (langBtn && langDropdown && currentLangSpan) {
        currentLangSpan.textContent = currentLanguage.toUpperCase();
        
        langBtn.addEventListener('click', () => {
            langDropdown.classList.toggle('show');
        });
        
        document.querySelectorAll('.lang-option').forEach(option => {
            option.addEventListener('click', () => {
                const lang = option.getAttribute('data-lang');
                updateLanguage(lang);
                langDropdown.classList.remove('show');
            });
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!langBtn.contains(e.target) && !langDropdown.contains(e.target)) {
                langDropdown.classList.remove('show');
            }
        });
        
        updateAllTexts();
    }
}

// Initialize language system - run immediately for modules
setTimeout(() => {
    initializeLanguage();
}, 100);
