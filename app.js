import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, query, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc, updateDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// -- FIREBASE CONFIG --
const firebaseConfig = {
    apiKey: "AIzaSyBINneLJjwUsvtfuareLZxXPeCcMRxDNlY",
    authDomain: "tezgram-84b50.firebaseapp.com",
    projectId: "tezgram-84b50",
    storageBucket: "tezgram-84b50.firebasestorage.app",
    messagingSenderId: "895242860702",
    appId: "1:895242860702:web:e27468b067af1c5d2fa38f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -- DOM --
const loginScreen = document.getElementById('loginScreen');
const profileSetupModal = document.getElementById('profileSetupModal');
const appScreen = document.getElementById('app');
const chatList = document.getElementById('chatList');
const selfProfileView = document.getElementById('selfProfileView');
const searchInput = document.getElementById('searchInput');
const chatWindow = document.getElementById('chatWindow');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const backBtn = document.getElementById('backBtn');
const emojiBtn = document.querySelector('.emoji-btn');
const emojiPicker = document.getElementById('emojiPicker');
const installBanner = document.getElementById('installBanner');
const installText = document.getElementById('installText');

const callModal = document.getElementById('callModal');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatusText = document.getElementById('callStatusText');
const ringtoneIncoming = document.getElementById('ringtoneIncoming');
const ringtoneOutgoing = document.getElementById('ringtoneOutgoing');

// STATE
let currentUser = null;
let currentUserDoc = null;
let currentChatUserId = null;
let currentChatId = null;
let messagesUnsubscribe = null;
let activeCallDocId = null;
let pc = null;
let localStream = null;

// -- AUTH & STATUS --
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().username) {
            currentUserDoc = userSnap.data();
            loginScreen.style.display = 'none';
            appScreen.style.display = 'flex';
            updateStatus(true);
            setInterval(() => updateStatus(true), 30000);
            loadUsersAndChats();
            listenForIncomingCalls();
        } else {
            loginScreen.style.display = 'none';
            profileSetupModal.style.display = 'flex';
        }
    } else {
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
        if (messagesUnsubscribe) messagesUnsubscribe();
    }
});

async function updateStatus(isOnline) {
    if (!currentUser) return;
    await setDoc(doc(db, "users", currentUser.uid), { isOnline, lastSeen: serverTimestamp() }, { merge: true });
}

window.onbeforeunload = () => updateStatus(false);

// -- PWA --
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.style.display = 'flex';
});

document.getElementById('installBtn').onclick = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBanner.style.display = 'none';
        deferredPrompt = null;
    }
};
document.getElementById('closeBannerBtn').onclick = () => installBanner.style.display = 'none';

// -- CHAT LIST --
function loadUsersAndChats() {
    onSnapshot(collection(db, "users"), (snapshot) => {
        const users = snapshot.docs.map(d => d.data()).filter(u => u.uid !== currentUser.uid);
        const now = Date.now();
        users.forEach(u => {
            // Trust the manual isOnline flag first
            if (u.isOnline === true) {
                // Check heartbeat only if lastSeen exists, giving a large 5-min window for skew
                if (u.lastSeen && typeof u.lastSeen.toMillis === 'function') {
                    const lastSeenMs = u.lastSeen.toMillis();
                    u.isActualOnline = (now - lastSeenMs) < 300000; // 5 minutes
                } else {
                    u.isActualOnline = true; // Still pending or just logged in
                }
            } else {
                u.isActualOnline = false;
            }
        });
        renderUserList(users);
    });
}

function renderUserList(users) {
    chatList.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.innerHTML = `
            <div class="avatar-container"><img src="${u.avatar}" class="avatar"><div class="status-indicator ${u.isActualOnline ? 'status-online' : 'status-offline'}"></div></div>
            <div class="chat-info"><span class="chat-name">${u.name}</span><p class="chat-preview">${u.bio || ''}</p></div>
        `;
        div.onclick = () => openChatWith(u, div);
        chatList.appendChild(div);
    });
}

// -- INCREMENTAL RENDERING (Fixes Flickering) --
function openChatWith(otherUser, node) {
    currentChatUserId = otherUser.uid;
    currentChatId = [currentUser.uid, otherUser.uid].sort().join("_");
    
    document.getElementById('currentAvatar').src = otherUser.avatar;
    document.getElementById('currentName').textContent = otherUser.name;
    document.getElementById('currentStatus').textContent = otherUser.isActualOnline ? 'онлайн' : 'офлайн';

    chatWindow.classList.add('has-active');
    document.body.classList.add('chat-active');

    messagesArea.innerHTML = ''; // Initial clear only
    if (messagesUnsubscribe) messagesUnsubscribe();

    markMessagesAsRead(currentChatId, otherUser.uid);

    const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("timestamp", "asc"));
    
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const msgId = change.doc.id;

            if (change.type === "added") {
                renderMessage(data, otherUser.avatar, msgId);
                // Mark incoming as read (on receiver side)
                if (data.senderId === otherUser.uid && !data.isRead) {
                    updateDoc(change.doc.ref, { isRead: true }).catch(e => console.error("Read update failed", e));
                }
            } else if (change.type === "modified") {
                updateMessageStatusUI(msgId, data.isRead);
            }
        });
        messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
    });
}

async function markMessagesAsRead(chatId, otherUid) {
    const q = query(collection(db, "chats", chatId, "messages"), where("senderId", "==", otherUid), where("isRead", "==", false));
    const snap = await getDocs(q);
    snap.forEach(d => updateDoc(d.ref, { isRead: true }));
}

function renderMessage(data, avatar, id) {
    const isMe = data.senderId === currentUser.uid;
    const div = document.createElement('div');
    div.id = `msg-${id}`;
    div.className = `message ${isMe ? 'sent' : 'received'}`;
    
    // Always render the icon container for sent messages so we can update it
    const statusIcon = data.isRead ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-check"></i>';
    const statusHtml = isMe ? `<span class="message-status-icon" id="status-${id}">${statusIcon}</span>` : '';

    div.innerHTML = `
        ${!isMe ? `<img src="${avatar}" class="avatar" style="width:30px;height:30px">` : ''}
        <div class="message-content">
            <div class="msg-text">${data.type === 'image' ? `<img src="${data.text}" style="max-width:100%; border-radius:8px;">` : data.text}</div>
            <div class="msg-meta">${statusHtml}</div>
        </div>
    `;
    messagesArea.appendChild(div);
}

function updateMessageStatusUI(id, isRead) {
    const statusEl = document.getElementById(`status-${id}`);
    if (statusEl) {
        statusEl.innerHTML = isRead ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-check"></i>';
    }
}

const doSendMessage = async () => {
    const text = messageInput.value.trim();
    if (!text || !currentChatId) return;
    messageInput.value = '';
    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        senderId: currentUser.uid,
        text: text,
        type: 'text',
        isRead: false,
        timestamp: serverTimestamp()
    });
};

sendBtn.onclick = doSendMessage;
messageInput.onkeypress = (e) => { if(e.key === 'Enter') doSendMessage(); };
backBtn.onclick = () => document.body.classList.remove('chat-active');
emojiBtn.onclick = () => emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';

// -- IMAGE ATTACHMENT --
document.getElementById('attachBtn').onclick = () => document.getElementById('imageInput').click();
document.getElementById('imageInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const base64 = canvas.toDataURL('image/jpeg', 0.6);
            addDoc(collection(db, "chats", currentChatId, "messages"), {
                senderId: currentUser.uid,
                text: base64,
                type: 'image',
                isRead: false,
                timestamp: serverTimestamp()
            });
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
};

// -- CALLS --
const startCall = async (type) => {
    activeCallDocId = currentChatUserId;
    callModal.style.display = 'flex';
    ringtoneOutgoing.play();
    localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
    localVideo.srcObject = type === 'video' ? localStream : null;
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]});
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => e.candidate && addDoc(collection(db, "calls", activeCallDocId, "offerCandidates"), e.candidate.toJSON());
    pc.ontrack = e => { ringtoneOutgoing.pause(); remoteVideo.srcObject = e.streams[0]; };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(doc(db, "calls", activeCallDocId), { offer, callerName: currentUserDoc.name, type, callerId: currentUser.uid });
    onSnapshot(doc(db, "calls", activeCallDocId), s => {
        if (s.data()?.answer && !pc.currentRemoteDescription) pc.setRemoteDescription(new RTCSessionDescription(s.data().answer));
    });
    onSnapshot(collection(db, "calls", activeCallDocId, "answerCandidates"), s => {
        s.docChanges().forEach(c => c.type === 'added' && pc.addIceCandidate(new RTCIceCandidate(c.doc.data())));
    });
};

function listenForIncomingCalls() {
    onSnapshot(doc(db, "calls", currentUser.uid), async (s) => {
        const data = s.data();
        if (s.exists() && data.offer && !pc) {
            ringtoneIncoming.play();
            callModal.style.display = 'flex';
            document.getElementById('answerCallBtn').style.display = 'block';
            document.getElementById('rejectCallBtn').style.display = 'block';
            document.getElementById('endCallBtn').style.display = 'none';
            document.getElementById('answerCallBtn').onclick = async () => {
                ringtoneIncoming.pause();
                document.getElementById('answerCallBtn').style.display = 'none';
                document.getElementById('endCallBtn').style.display = 'block';
                localStream = await navigator.mediaDevices.getUserMedia({ video: data.type === 'video', audio: true });
                localVideo.srcObject = data.type === 'video' ? localStream : null;
                pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]});
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                pc.onicecandidate = e => e.candidate && addDoc(collection(db, "calls", currentUser.uid, "answerCandidates"), e.candidate.toJSON());
                pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await setDoc(doc(db, "calls", currentUser.uid), { answer }, { merge: true });
            };
        } else if (!s.exists() && pc) endCall();
    });
}

function endCall() {
    ringtoneIncoming.pause(); ringtoneOutgoing.pause();
    if (pc) pc.close(); pc = null;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    callModal.style.display = 'none';
}

document.getElementById('callBtn').onclick = () => startCall('audio');
document.getElementById('videoBtn').onclick = () => startCall('video');
document.getElementById('endCallBtn').onclick = endCall;
document.getElementById('rejectCallBtn').onclick = endCall;

// -- PROFILE ACTIONS --
document.getElementById('profileViewBtn').onclick = () => {
    chatList.style.display = 'none'; selfProfileView.style.display = 'block';
    document.getElementById('myProfilePhoto').src = currentUserDoc.avatar;
    document.getElementById('myProfileName').textContent = currentUserDoc.name;
    document.getElementById('myProfileUsername').textContent = currentUserDoc.username;
    document.getElementById('myProfileBio').textContent = currentUserDoc.bio;
};
document.getElementById('backToChatsBtn').onclick = () => {
    selfProfileView.style.display = 'none'; chatList.style.display = 'flex';
};
document.getElementById('saveProfileBtn').onclick = async () => {
    const userRef = doc(db, "users", currentUser.uid);
    const profile = { uid: currentUser.uid, name: currentUser.displayName, username: "@" + document.getElementById('usernameInput').value, bio: document.getElementById('bioInput').value, avatar: document.getElementById('profilePreview').src, isOnline: true };
    await setDoc(userRef, profile); currentUserDoc = profile;
    profileSetupModal.style.display = 'none'; appScreen.style.display = 'flex';
};
