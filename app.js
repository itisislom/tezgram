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
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);

// DOM
const splashScreen = document.getElementById('splashScreen'), loginScreen = document.getElementById('loginScreen'), profileSetupModal = document.getElementById('profileSetupModal'), appScreen = document.getElementById('app');
const chatList = document.getElementById('chatList'), selfProfileView = document.getElementById('selfProfileView'), chatWindow = document.getElementById('chatWindow');
const messagesArea = document.getElementById('messagesArea'), messageInput = document.getElementById('messageInput'), sendBtn = document.getElementById('sendBtn'), backBtn = document.getElementById('backBtn'), emojiBtn = document.querySelector('.emoji-btn'), emojiPicker = document.getElementById('emojiPicker');
const callModal = document.getElementById('callModal'), localVideo = document.getElementById('localVideo'), remoteVideo = document.getElementById('remoteVideo'), callStatusText = document.getElementById('callStatusText'), ringtoneIncoming = document.getElementById('ringtoneIncoming'), ringtoneOutgoing = document.getElementById('ringtoneOutgoing'), muteBtn = document.getElementById('muteBtn'), cameraToggleBtn = document.getElementById('cameraToggleBtn');
const logoutBtn = document.getElementById('logoutBtn'), callBtn = document.getElementById('callBtn'), videoBtn = document.getElementById('videoBtn'), googleLoginBtn = document.getElementById('googleLoginBtn'), profileViewBtn = document.getElementById('profileViewBtn');
const backToChatsBtn = document.getElementById('backToChatsBtn'), saveProfileBtn = document.getElementById('saveProfileBtn'), profilePreview = document.getElementById('profilePreview'), profileImageInput = document.getElementById('profileImageInput');
const usernameInput = document.getElementById('usernameInput'), bioInput = document.getElementById('bioInput'), nameInput = document.getElementById('nameInput');
const editProfileBtn = document.getElementById('editProfileBtn'), editProfileModal = document.getElementById('editProfileModal'), editProfileCloseBtn = document.getElementById('editProfileCloseBtn');
const editProfileSaveBtn = document.getElementById('editProfileSaveBtn'), editProfilePreview = document.getElementById('editProfilePreview'), editProfileImageInput = document.getElementById('editProfileImageInput');
const editUsernameInput = document.getElementById('editUsernameInput'), editBioInput = document.getElementById('editBioInput'), editNameInput = document.getElementById('editNameInput');

// STATE
const APP_START_TIME = Date.now();
let currentUser = null, currentUserDoc = null, currentChatUserId = null, currentChatId = null, messagesUnsubscribe = null, activeCallDocId = null, pc = null, localStream = null, callUnsubscribe = null, callListenerUnsubscribe = null, callInProgress = false, isAnswering = false, allUsers = [];

onAuthStateChanged(auth, async (user) => {
    const hideSplash = () => { if (splashScreen) splashScreen.style.display = 'none'; };
    if (user) {
        currentUser = user; 
        try {
            const uSnap = await getDoc(doc(db, "users", user.uid));
            if (uSnap.exists() && uSnap.data().username) {
                currentUserDoc = uSnap.data(); 
                loginScreen.style.display = 'none'; 
                profileSetupModal.style.display = 'none';
                appScreen.style.display = 'flex'; 
                hideSplash();
                updateStatus(true); 
                
                // Clear any existing status interval
                if (window.statusInterval) {
                    clearInterval(window.statusInterval);
                }
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
                loginScreen.style.display = 'none'; 
                profileSetupModal.style.display = 'flex'; 
                appScreen.style.display = 'none';
                hideSplash(); 
            }
        } catch (e) {
            console.error("Auth state error:", e);
            showNotification('Ошибка при загрузке профиля', 'error');
            hideSplash();
        }
    } else { 
        loginScreen.style.display = 'flex'; 
        appScreen.style.display = 'none'; 
        profileSetupModal.style.display = 'none';
        if (messagesUnsubscribe) messagesUnsubscribe(); 
        if (window.statusInterval) {
            clearInterval(window.statusInterval);
        }
        hideSplash(); 
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
const searchInput = document.getElementById('searchInput');
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
document.getElementById('endCallBtn').onclick = endCall; document.getElementById('rejectCallBtn').onclick = endCall;
muteBtn.onclick = () => { if(!localStream) return; const at = localStream.getAudioTracks()[0]; at.enabled = !at.enabled; muteBtn.querySelector('i').className = at.enabled ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'; };
cameraToggleBtn.onclick = () => { if(!localStream) return; const vt = localStream.getVideoTracks()[0]; if(vt){ vt.enabled = !vt.enabled; cameraToggleBtn.querySelector('i').className = vt.enabled ? 'fa-solid fa-video' : 'fa-solid fa-video-slash'; } };
document.getElementById('callBtn').onclick = () => startCall('audio'); document.getElementById('videoBtn').onclick = () => startCall('video');
document.getElementById('googleLoginBtn').onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
logoutBtn.onclick = () => signOut(auth);
document.getElementById('profileViewBtn').onclick = () => { 
    chatList.style.display = 'none'; 
    selfProfileView.style.display = 'block'; 
    const avatarSrc = currentUserDoc.avatar || getDefaultAvatar(currentUserDoc.name);
    document.getElementById('myProfilePhoto').src = avatarSrc;
    document.getElementById('myProfilePhoto').onerror = null;
    document.getElementById('myProfileName').textContent = currentUserDoc.name; 
    document.getElementById('myProfileUsername').textContent = currentUserDoc.username; 
    document.getElementById('myProfileBio').textContent = currentUserDoc.bio; 
};
document.getElementById('backToChatsBtn').onclick = () => { selfProfileView.style.display = 'none'; chatList.style.display = 'flex'; };
document.getElementById('editProfileBtn').onclick = () => { 
    document.getElementById('editProfileModal').style.display = 'flex'; 
    document.getElementById('editUsernameInput').value = currentUserDoc.username?.replace('@', '') || ''; 
    document.getElementById('editNameInput').value = currentUserDoc.name || '';
    document.getElementById('editBioInput').value = currentUserDoc.bio || ''; 
    const avatarSrc = currentUserDoc.avatar || getDefaultAvatar(currentUserDoc.name);
    document.getElementById('editProfilePreview').src = avatarSrc;
    updateAvatarPlaceholders(avatarSrc, 'edit');
};
document.getElementById('saveProfileBtn').onclick = async () => { 
    const username = "@" + document.getElementById('usernameInput').value.trim();
    const name = document.getElementById('nameInput').value.trim();
    const bio = document.getElementById('bioInput').value.trim();
    
    if (!username.replace('@', '')) {
        showNotification('Юзернейм не может быть пустым', 'error');
        return;
    }
    
    if (!name) {
        showNotification('Имя не может быть пустым', 'error');
        return;
    }
    
    try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snapshot = await getDocs(q);
        
        if (snapshot.docs.length > 0) {
            showNotification('Этот юзернейм уже занят. Выберите другой.', 'error');
            return;
        }
        
        const avatarSrc = document.getElementById('profilePreview').src || getDefaultAvatar(name);
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
        profileSetupModal.style.display = 'none'; 
        appScreen.style.display = 'flex';
        showNotification('Профиль успешно создан!', 'success');
    } catch (e) {
        console.error("Profile setup error:", e);
        showNotification('Ошибка при сохранении профиля', 'error');
    }
};
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
                document.getElementById('profilePreview').src = ev.target.result;
                updateAvatarPlaceholders(ev.target.result, 'setup');
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
                document.getElementById('editProfilePreview').src = ev.target.result;
                updateAvatarPlaceholders(ev.target.result, 'edit');
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
    
    if (avatarSrc && avatarSrc !== getDefaultAvatar('')) {
        placeholder.style.display = 'none';
        preview.style.display = 'block';
    } else {
        placeholder.style.display = 'flex';
        preview.style.display = 'none';
    }
}
