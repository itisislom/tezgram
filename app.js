import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, query, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// -- FIREBASE CONFIGURATION --
const firebaseConfig = {
    apiKey: "AIzaSyBINneLJjwUsvtfuareLZxXPeCcMRxDNlY",
    authDomain: "tezgram-84b50.firebaseapp.com",
    projectId: "tezgram-84b50",
    storageBucket: "tezgram-84b50.firebasestorage.app",
    messagingSenderId: "895242860702",
    appId: "1:895242860702:web:e27468b067af1c5d2fa38f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -- DOM ELEMENTS --
const loginScreen = document.getElementById('loginScreen');
const profileSetupModal = document.getElementById('profileSetupModal');
const appScreen = document.getElementById('app');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const chatList = document.getElementById('chatList');
const searchInput = document.getElementById('searchInput');

// Chat UI Elements
const chatWindow = document.getElementById('chatWindow');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const currentAvatar = document.getElementById('currentAvatar');
const currentName = document.getElementById('currentName');
const currentStatus = document.getElementById('currentStatus');

// Call UI Elements
const callBtn = document.getElementById('callBtn');
const videoBtn = document.getElementById('videoBtn');
const callModal = document.getElementById('callModal');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatusText = document.getElementById('callStatusText');
const answerCallBtn = document.getElementById('answerCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');
const endCallBtn = document.getElementById('endCallBtn');

// -- STATE --
let currentUser = null;
let currentUserDoc = null; 
let currentChatUserId = null;
let currentChatId = null; 
let allUsers = [];
let messagesUnsubscribe = null;

// -- AUTHENTICATION & PROFILE SETUP --
googleLoginBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        alert("Ошибка авторизации: " + error.message);
    }
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists() && userSnap.data().username) {
            // User already has profile setup
            currentUserDoc = userSnap.data();
            loginScreen.style.display = 'none';
            profileSetupModal.style.display = 'none';
            appScreen.style.display = 'flex';
            
            await setDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }, { merge: true });
            
            loadUsersAndChats();
            listenForIncomingCalls();
        } else {
            // User completely new - Show Profile Setup
            loginScreen.style.display = 'none';
            profileSetupModal.style.display = 'flex';
            appScreen.style.display = 'none';
            
            const prevPhoto = userSnap.exists() && userSnap.data().avatar ? userSnap.data().avatar : user.photoURL || 'https://via.placeholder.com/100';
            document.getElementById('profilePreview').src = prevPhoto;
            let finalImageBase64 = prevPhoto;
            
            // Image Compress hook
            document.getElementById('profilePreview').onclick = () => document.getElementById('profileImageInput').click();
            document.getElementById('profileImageInput').onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 150; canvas.height = 150;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, 150, 150);
                        finalImageBase64 = canvas.toDataURL('image/jpeg', 0.8);
                        document.getElementById('profilePreview').src = finalImageBase64;
                    };
                    img.src = ev.target.result;
                }
                reader.readAsDataURL(file);
            };
            
            document.getElementById('saveProfileBtn').onclick = async () => {
                const username = document.getElementById('usernameInput').value.trim();
                const bio = document.getElementById('bioInput').value.trim();
                
                if (!username) return alert("Пожалуйста, введите уникальный @username!");
                
                const profileData = {
                    uid: user.uid,
                    name: user.displayName || 'Аноним',
                    username: "@" + username.replace('@',''),
                    bio: bio || "Привет! Я использую TezGram.",
                    avatar: finalImageBase64,
                    email: user.email,
                    isOnline: true,
                    lastSeen: serverTimestamp()
                };
                
                await setDoc(userRef, profileData);
                currentUserDoc = profileData;
                
                profileSetupModal.style.display = 'none';
                appScreen.style.display = 'flex';
                
                loadUsersAndChats();
                listenForIncomingCalls();
            };
        }
    } else {
        currentUser = null;
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
        profileSetupModal.style.display = 'none';
        if (messagesUnsubscribe) messagesUnsubscribe();
    }
});

// -- USERS & CHAT LIST --
function loadUsersAndChats() {
    chatList.innerHTML = '<div style="padding: 20px; text-align:center; color: var(--text-secondary);">Ищем пользователей в базе TezGram...</div>';
    
    onSnapshot(collection(db, "users"), (snapshot) => {
        allUsers = snapshot.docs.map(doc => doc.data()).filter(u => u.uid !== currentUser.uid);
        renderUserList(allUsers);
    });
}

function renderUserList(users) {
    chatList.innerHTML = '';
    if (users.length === 0) {
        chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 14px;">Пока пусто.</div>';
        return;
    }

    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        const statusClass = user.isOnline ? 'status-online' : 'status-offline';
        
        div.innerHTML = `
            <div class="avatar-container">
                <img src="${user.avatar || 'https://via.placeholder.com/150'}" class="avatar">
                <div class="status-indicator ${statusClass}"></div>
            </div>
            <div class="chat-info">
                <div class="chat-top">
                    <span class="chat-name">${user.name} <small style="color:var(--text-secondary); font-weight:normal;">${user.username || ''}</small></span>
                </div>
                <div class="chat-bottom">
                    <span class="chat-preview">${user.bio || 'Нажмите, чтобы открыть чат'}</span>
                </div>
            </div>
        `;
        div.addEventListener('click', () => openChatWith(user, div));
        chatList.appendChild(div);
    });
}

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query === '') {
        renderUserList(allUsers);
    } else {
        const filtered = allUsers.filter(u => 
            u.name.toLowerCase().includes(query) || 
            (u.username && u.username.toLowerCase().includes(query))
        );
        renderUserList(filtered);
    }
});

// -- CHATTING LOGIC --
function openChatWith(otherUser, elementNode) {
    document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('active'));
    if (elementNode) elementNode.classList.add('active');
    
    currentChatUserId = otherUser.uid;
    const sortedIds = [currentUser.uid, otherUser.uid].sort();
    currentChatId = sortedIds.join("_");

    currentAvatar.src = otherUser.avatar || 'https://via.placeholder.com/150';
    currentName.textContent = otherUser.name;
    currentStatus.textContent = otherUser.isOnline ? 'онлайн' : 'был(а) недавно';
    currentStatus.style.color = otherUser.isOnline ? 'var(--accent-color)' : 'var(--text-secondary)';

    chatWindow.classList.add('has-active'); // Enables active chat UI
    if (window.innerWidth <= 768) document.body.classList.add('chat-active');

    if (messagesUnsubscribe) messagesUnsubscribe();
    messagesArea.innerHTML = '<div style="margin: auto; color: var(--text-secondary);">Синхронизация с сервером...</div>';

    const q = query(
        collection(db, "chats", currentChatId, "messages"),
        orderBy("timestamp", "asc")
    );

    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        messagesArea.innerHTML = '';
        if (snapshot.empty) {
            messagesArea.innerHTML = `
                <div class="empty-chat" style="height: auto; margin: auto;">
                    <i class="fa-regular fa-handshake" style="font-size: 40px;"></i>
                    <h3 style="color: var(--text-primary); font-weight: 500; margin-top: 10px;">Здравствуйте!</h3>
                    <p style="font-size: 13px;">Напишите первое сообщение пользователю ${otherUser.name}</p>
                </div>
            `;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            renderMessage(data, otherUser.avatar);
        });
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

function renderMessage(data, otherUserAvatar) {
    const isMe = data.senderId === currentUser.uid;
    let timeStr = "";
    if (data.timestamp) {
        const d = data.timestamp.toDate();
        timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'sent' : 'received'}`;

    let contentHTML = ``;
    if (data.type === 'image') {
        contentHTML = `<img src="${data.text}" style="max-width: 100%; max-height: 300px; border-radius: 8px; margin-bottom: 5px; cursor: pointer;">`;
    } else {
        contentHTML = escapeHTML(data.text);
    }

    div.innerHTML = `
        ${!isMe ? `<img src="${otherUserAvatar || 'https://via.placeholder.com/50'}" class="avatar" style="width: 32px; height: 32px">` : ''}
        <div class="message-content">
            ${contentHTML}
            <span class="message-time">${timeStr}</span>
        </div>
    `;
    messagesArea.appendChild(div);
}

// -- SEND MESSAGES (TEXT & BASE64 IMAGES) --
async function sendMessage(text, type = 'text') {
    if (!currentChatId || (!text && type === 'text')) return;
    const value = type === 'text' ? text.trim() : text;
    if (!value) return;

    if (type === 'text') messageInput.value = '';

    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        senderId: currentUser.uid,
        text: value,
        type: type,
        timestamp: serverTimestamp()
    });
}

sendBtn.addEventListener('click', () => sendMessage(messageInput.value));
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage(messageInput.value);
});

attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; const MAX_HEIGHT = 800;
            let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
            else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }

            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const base64String = canvas.toDataURL('image/jpeg', 0.6);
            if(base64String.length > 900000) {
                 return alert("Изображение слишком тяжелое. Выберите другое!");
            }
            sendMessage(base64String, 'image');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// -- WEBRTC CALL SIGNALING (FIRESTORE) --
let pc = null;
let localStream = null;
let remoteStream = null;
let activeCallDocId = null;

const rtcConfig = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

async function getMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch(err) {
        alert("Нет доступа к камере или микрофону!");
        throw err;
    }
}

// 1. Caller starts call
const initiateCall = async () => {
    if (!currentChatUserId) return;
    activeCallDocId = currentChatUserId; // we write to recipient's inbox
    
    callModal.style.display = 'flex';
    answerCallBtn.style.display = 'none';
    rejectCallBtn.style.display = 'none';
    endCallBtn.style.display = 'block';
    callStatusText.textContent = `Звонок ${currentName.textContent}...`;

    await getMedia();
    
    pc = new RTCPeerConnection(rtcConfig);
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = e => e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));

    const callDoc = doc(collection(db, "calls"), activeCallDocId);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    pc.onicecandidate = e => {
        if(e.candidate) addDoc(offerCandidates, e.candidate.toJSON());
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const callData = {
        offer: { type: offerDescription.type, sdp: offerDescription.sdp },
        caller: currentUser.uid,
        callerName: currentUserDoc.name
    };
    await setDoc(callDoc, callData);

    onSnapshot(callDoc, snapshot => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
            pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            callStatusText.textContent = '';
        }
    });

    onSnapshot(answerCandidates, snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });
};

callBtn.addEventListener('click', initiateCall);
videoBtn.addEventListener('click', initiateCall); // Use same function

// 2. Callee listens for incoming calls
function listenForIncomingCalls() {
    const callDoc = doc(collection(db, "calls"), currentUser.uid);
    onSnapshot(callDoc, snapshot => {
        const data = snapshot.data();
        if (snapshot.exists() && data && data.offer && !pc) {
            // Incoming Call
            activeCallDocId = currentUser.uid;
            callModal.style.display = 'flex';
            callStatusText.textContent = 'Входящий видеозвонок от: ' + data.callerName;
            answerCallBtn.style.display = 'block';
            rejectCallBtn.style.display = 'block';
            endCallBtn.style.display = 'none';

            answerCallBtn.onclick = () => acceptCall(callDoc, data.offer);
            rejectCallBtn.onclick = () => {
                deleteDoc(callDoc);
                callModal.style.display = 'none';
                activeCallDocId = null;
            };
        }
        if (!snapshot.exists() && pc) {
            // caller hung up
            hangUp();
        }
    });
}

// 3. Callee accepts call
async function acceptCall(callDoc, offer) {
    answerCallBtn.style.display = 'none';
    rejectCallBtn.style.display = 'none';
    endCallBtn.style.display = 'block';
    callStatusText.textContent = 'Соединение...';

    await getMedia();
    
    pc = new RTCPeerConnection(rtcConfig);
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = e => {
        e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
        callStatusText.textContent = '';
    };

    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    pc.onicecandidate = e => {
        if(e.candidate) addDoc(answerCandidates, e.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    await setDoc(callDoc, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } }, { merge: true });

    onSnapshot(offerCandidates, snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });
}

// 4. Hang up
async function hangUp() {
    if (pc) { pc.close(); pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    callModal.style.display = 'none';
    
    if (activeCallDocId) {
        await deleteDoc(doc(db, "calls", activeCallDocId));
        activeCallDocId = null;
    }
}
endCallBtn.addEventListener('click', hangUp);

// -- UI HELPERS --
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}
