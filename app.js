import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, query, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc, updateDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// STATE
let currentUser = null, currentUserDoc = null, currentChatUserId = null, currentChatId = null, messagesUnsubscribe = null, activeCallDocId = null, pc = null, localStream = null, callUnsubscribe = null;

onAuthStateChanged(auth, async (user) => {
    setTimeout(() => { if (splashScreen) splashScreen.style.display = 'none'; }, 800);
    if (user) {
        currentUser = user; const uSnap = await getDoc(doc(db, "users", user.uid));
        if (uSnap.exists() && uSnap.data().username) {
            currentUserDoc = uSnap.data(); loginScreen.style.display = 'none'; appScreen.style.display = 'flex';
            updateStatus(true); setInterval(() => updateStatus(true), 30000);
            
            // Clean up any stale call records for this user on load
            await deleteDoc(doc(db, "calls", user.uid));
            
            loadUsersAndChats(); listenForIncomingCalls();
        } else { loginScreen.style.display = 'none'; profileSetupModal.style.display = 'flex'; }
    } else { loginScreen.style.display = 'flex'; appScreen.style.display = 'none'; if (messagesUnsubscribe) messagesUnsubscribe(); }
});

async function updateStatus(s) { if(currentUser) await setDoc(doc(db,"users",currentUser.uid),{isOnline:s,lastSeen:serverTimestamp()},{merge:true}); }
window.onbeforeunload = () => updateStatus(false);
document.addEventListener('visibilitychange', () => updateStatus(document.visibilityState === 'visible'));

function loadUsersAndChats() {
    onSnapshot(collection(db, "users"), (snapshot) => {
        const users = snapshot.docs.map(d => d.data()).filter(u => u.uid !== currentUser?.uid && u.name && u.avatar);
        const now = Date.now();
        users.forEach(u => {
            if (u.isOnline === true && u.lastSeen && typeof u.lastSeen.toMillis === 'function') u.isActualOnline = (now - u.lastSeen.toMillis()) < 300000;
            else u.isActualOnline = u.isOnline;
            if (currentChatUserId === u.uid) {
                const h = document.getElementById('currentStatus'); if (h) { h.textContent = u.isActualOnline ? 'онлайн' : 'офлайн'; h.style.color = u.isActualOnline ? 'var(--accent-color)' : 'var(--text-secondary)'; }
            }
        }); renderUserList(users);
    });
}
function renderUserList(users) {
    chatList.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div'); div.className = 'chat-item';
        div.innerHTML = `<div class="avatar-container"><img src="${u.avatar}" class="avatar"><div class="status-indicator ${u.isActualOnline ? 'status-online' : 'status-offline'}"></div></div><div class="chat-info"><span class="chat-name">${u.name}</span><p class="chat-preview">${u.bio || ''}</p></div>`;
        div.onclick = () => openChatWith(u, div); chatList.appendChild(div);
    });
}
function openChatWith(otherUser, node) {
    currentChatUserId = otherUser.uid; currentChatId = [currentUser.uid, otherUser.uid].sort().join("_");
    document.getElementById('currentAvatar').src = otherUser.avatar; document.getElementById('currentName').textContent = otherUser.name;
    const h = document.getElementById('currentStatus'); h.textContent = otherUser.isActualOnline ? 'онлайн' : 'офлайн'; h.style.color = otherUser.isActualOnline ? 'var(--accent-color)' : 'var(--text-secondary)';
    chatWindow.classList.add('has-active'); document.body.classList.add('chat-active');
    messagesArea.innerHTML = ''; if (messagesUnsubscribe) messagesUnsubscribe(); markMessagesAsRead(currentChatId, otherUser.uid);
    const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("timestamp", "asc"));
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data(), msgId = change.doc.id;
            if (change.type === "added") { renderMessage(data, otherUser.avatar, msgId); if (data.senderId === otherUser.uid && !data.isRead) updateDoc(change.doc.ref, { isRead: true }); }
            else if (change.type === "modified") updateMessageStatusUI(msgId, data.isRead);
        }); messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
    });
}
async function markMessagesAsRead(chatId, otherUid) {
    const q = query(collection(db, "chats", chatId, "messages"), where("senderId", "==", otherUid), where("isRead", "==", false));
    const snap = await getDocs(q); snap.forEach(d => updateDoc(d.ref, { isRead: true }));
}
function renderMessage(data, avatar, id) {
    const isMe = data.senderId === currentUser.uid;
    const div = document.createElement('div'); div.id = `msg-${id}`; div.className = `message ${isMe ? 'sent' : 'received'}`;
    const statusIcon = data.isRead ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-check"></i>';
    const statusHtml = isMe ? `<span class="message-status-icon" id="status-${id}">${statusIcon}</span>` : '';
    div.innerHTML = `${!isMe ? `<img src="${avatar}" class="avatar" style="width:30px;height:30px">` : ''}<div class="message-content"><div class="msg-text">${data.type === 'image' ? `<img src="${data.text}" style="max-width:100%; border-radius:8px;">` : data.text}</div><div class="msg-meta">${statusHtml}</div></div>`;
    messagesArea.appendChild(div);
}
function updateMessageStatusUI(id, isRead) { const statusEl = document.getElementById(`status-${id}`); if (statusEl) statusEl.innerHTML = isRead ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-check"></i>'; }
const doSendMessage = async () => { const text = messageInput.value.trim(); if (!text || !currentChatId) return; messageInput.value = ''; await addDoc(collection(db, "chats", currentChatId, "messages"), { senderId: currentUser.uid, text: text, type: 'text', isRead: false, timestamp: serverTimestamp() }); };

sendBtn.onclick = doSendMessage; messageInput.onkeypress = (e) => { if (e.key === 'Enter') doSendMessage(); };
backBtn.onclick = () => document.body.classList.remove('chat-active');
emojiBtn.onclick = () => emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
document.getElementById('attachBtn').onclick = () => document.getElementById('imageInput').click();
document.getElementById('imageInput').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (ev) => {
        const img = new Image(); img.onload = () => {
            const canvas = document.createElement('canvas'); const MAX = 800; let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            addDoc(collection(db, "chats", currentChatId, "messages"), { senderId: currentUser.uid, text: canvas.toDataURL('image/jpeg', 0.6), type: 'image', isRead: false, timestamp: serverTimestamp() });
        }; img.src = ev.target.result;
    }; reader.readAsDataURL(file);
};

// --- CALLS RESET ---
const startCall = async (type) => {
    if (!currentChatUserId) return;
    activeCallDocId = currentChatUserId; callModal.style.display = 'flex'; ringtoneOutgoing.play();
    callStatusText.textContent = `Звонок ${type === 'video' ? 'видео' : 'аудио'}...`;
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
    await setDoc(doc(db, "calls", activeCallDocId), { offer, callerName: currentUserDoc.name, type, callerId: currentUser.uid });
    callUnsubscribe = onSnapshot(doc(db, "calls", activeCallDocId), s => { if (!s.exists()) endCall(); });
    onSnapshot(doc(db, "calls", activeCallDocId), s => { if (s.data()?.answer && !pc.currentRemoteDescription) pc.setRemoteDescription(new RTCSessionDescription(s.data().answer)); });
    onSnapshot(collection(db, "calls", activeCallDocId, "answerCandidates"), s => { s.docChanges().forEach(c => c.type === 'added' && pc.addIceCandidate(new RTCIceCandidate(c.doc.data()))); });
};
function listenForIncomingCalls() {
    onSnapshot(doc(db, "calls", currentUser.uid), async (s) => {
        const data = s.data();
        if (s.exists() && data.offer && !pc) {
            activeCallDocId = currentUser.uid;
            ringtoneIncoming.play(); callModal.style.display = 'flex';
            callStatusText.textContent = `Входящий ${data.type === 'video' ? 'видео' : 'аудио'} вызов...`;
            document.getElementById('answerCallBtn').style.display = 'flex'; 
            document.getElementById('rejectCallBtn').style.display = 'flex'; 
            document.getElementById('endCallBtn').style.display = 'none';
            cameraToggleBtn.style.display = 'none'; muteBtn.style.display = 'none';
            document.getElementById('answerCallBtn').onclick = async () => {
                ringtoneIncoming.pause();
                document.getElementById('answerCallBtn').style.display = 'none'; document.getElementById('rejectCallBtn').style.display = 'none'; document.getElementById('endCallBtn').style.display = 'flex';
                cameraToggleBtn.style.display = (data.type === 'video') ? 'flex' : 'none'; muteBtn.style.display = 'flex';
                muteBtn.querySelector('i').className = 'fa-solid fa-microphone';
                cameraToggleBtn.querySelector('i').className = 'fa-solid fa-video';
                localStream = await navigator.mediaDevices.getUserMedia({ video: data.type === 'video', audio: true });
                localVideo.srcObject = (data.type === 'video') ? localStream : null;
                localVideo.style.display = (data.type === 'video') ? 'block' : 'none'; remoteVideo.style.display = (data.type === 'video') ? 'block' : 'none';
                pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]});
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                pc.onicecandidate = e => e.candidate && addDoc(collection(db, "calls", currentUser.uid, "answerCandidates"), e.candidate.toJSON());
                pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
                await setDoc(doc(db, "calls", currentUser.uid), { answer }, { merge: true });
                callUnsubscribe = onSnapshot(doc(db, "calls", currentUser.uid), s => { if (!s.exists()) endCall(); });
            };
        } else if (!s.exists()) {
            // If the call document is gone and the modal is visible, we should end the call (fixed hanging)
            if (pc || callModal.style.display === 'flex') endCall();
        }
    });
}
function endCall() {
    ringtoneIncoming.pause(); ringtoneOutgoing.pause();
    ringtoneIncoming.currentTime = 0; ringtoneOutgoing.currentTime = 0;
    if (pc) { try { pc.close(); } catch(e){} pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    callModal.style.display = 'none';
    if (callUnsubscribe) { callUnsubscribe(); callUnsubscribe = null; }
    
    // Reset UI for next call
    document.getElementById('answerCallBtn').style.display = 'none';
    document.getElementById('rejectCallBtn').style.display = 'none';
    document.getElementById('endCallBtn').style.display = 'flex';
    
    if (currentUser && activeCallDocId) { 
        deleteDoc(doc(db, "calls", activeCallDocId)); 
        activeCallDocId = null; 
    }
}
document.getElementById('endCallBtn').onclick = endCall; document.getElementById('rejectCallBtn').onclick = endCall;
muteBtn.onclick = () => { if(!localStream) return; const at = localStream.getAudioTracks()[0]; at.enabled = !at.enabled; muteBtn.querySelector('i').className = at.enabled ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'; };
cameraToggleBtn.onclick = () => { if(!localStream) return; const vt = localStream.getVideoTracks()[0]; if(vt){ vt.enabled = !vt.enabled; cameraToggleBtn.querySelector('i').className = vt.enabled ? 'fa-solid fa-video' : 'fa-solid fa-video-slash'; } };
document.getElementById('callBtn').onclick = () => startCall('audio'); document.getElementById('videoBtn').onclick = () => startCall('video');
document.getElementById('googleLoginBtn').onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
logoutBtn.onclick = () => signOut(auth);
document.getElementById('profileViewBtn').onclick = () => { chatList.style.display = 'none'; selfProfileView.style.display = 'block'; document.getElementById('myProfilePhoto').src = currentUserDoc.avatar; document.getElementById('myProfileName').textContent = currentUserDoc.name; document.getElementById('myProfileUsername').textContent = currentUserDoc.username; document.getElementById('myProfileBio').textContent = currentUserDoc.bio; };
document.getElementById('backToChatsBtn').onclick = () => { selfProfileView.style.display = 'none'; chatList.style.display = 'flex'; };
document.getElementById('saveProfileBtn').onclick = async () => { const pr = { uid: currentUser.uid, name: currentUser.displayName, username: "@" + document.getElementById('usernameInput').value, bio: document.getElementById('bioInput').value, avatar: document.getElementById('profilePreview').src, isOnline: true }; await setDoc(doc(db, "users", currentUser.uid), pr); currentUserDoc = pr; profileSetupModal.style.display = 'none'; appScreen.style.display = 'flex'; };
document.getElementById('profilePreview').onclick = () => document.getElementById('profileImageInput').click();
document.getElementById('profileImageInput').onchange = (e) => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = (ev) => document.getElementById('profilePreview').src = ev.target.result; r.readAsDataURL(f); } };
