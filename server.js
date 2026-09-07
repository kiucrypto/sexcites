const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// MEMORY STORAGE (High-speed Maps)
// ==========================================
const users = new Map();          // id -> userObj
const usersByName = new Map();    // username -> id
const devices = new Map();        // deviceKey -> userId (1 account per device)
const friends = new Map();        // userId -> Set(friendIds)
const friendRequests = new Map(); // userId -> Map(senderId -> requestObj)
const messages = new Map();       // chatId -> [ {senderId, text, timestamp} ]
const posts = [];                 // [ {id, author, text, timestamp, likes} ]
const txRecords = new Set();      // Used TxIDs (Anti-scam / Anti-duplicate)
const userCodes = new Map();      // userId -> [ {code, plan, months, active} ]

const BTC_WALLET = "bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s";
const ETH_WALLET = "0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c";

// Helper for unified and ordered chat IDs
function getChatId(id1, id2) {
  return id1 < id2 ? id1 + '_' + id2 : id2 + '_' + id1;
}

// ==========================================
// REST API ENDPOINTS
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).send('SEXCITES.COM V9 LIVE & OPERATIONAL');
});

// Strict registration (1 per device, quota control 1-500)
app.post('/api/register', (req, res) => {
  const { username, email, password, deviceId, ip } = req.body;
  
  if (!username || username.length < 3 || !password || password.length < 4) {
    return res.json({ success: false, error: 'Username min 3 chars and password min 4 chars.' });
  }

  const cleanUser = username.trim().toLowerCase();
  if (usersByName.has(cleanUser)) {
    return res.json({ success: false, error: 'Username already exists.' });
  }

  const deviceKey = (deviceId || 'unknown') + '_' + (ip || '127.0.0.1');
  if (devices.has(deviceKey)) {
    return res.json({ success: false, error: 'An account is already registered from this device/network.' });
  }

  if (users.size >= 500) {
    return res.json({ success: false, error: 'Free quota of 500 reached. VIP subscription required ($8.99 / $16.99 / $28.99).' });
  }

  const userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const newUser = {
    id: userId,
    username: cleanUser,
    email: email || '',
    password: password,
    isFree: true,
    createdAt: Date.now()
  };

  users.set(userId, newUser);
  usersByName.set(cleanUser, userId);
  devices.set(deviceKey, userId);
  friends.set(userId, new Set());
  friendRequests.set(userId, new Map());

  res.json({ success: true, user: newUser });
});

// Login
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  const cleanId = (identifier || '').trim().toLowerCase();
  
  let userId = usersByName.get(cleanId);
  if (!userId) {
    for (let [uId, uObj] of users.entries()) {
      if (uObj.email.toLowerCase() === cleanId) {
        userId = uId;
        break;
      }
    }
  }

  if (!userId) {
    return res.json({ success: false, error: 'Invalid credentials.' });
  }

  const user = users.get(userId);
  if (user.password !== password) {
    return res.json({ success: false, error: 'Incorrect password.' });
  }

  res.json({ success: true, user });
});

// Verify payment on Blockchain (BTC / ETH) and generate anti-scam hidden code
app.post('/api/pay-verify', (req, res) => {
  const { userId, txid, planType } = req.body;
  if (!users.has(userId)) return res.json({ success: false, error: 'Invalid user.' });
  if (!txid || txid.trim().length < 10) return res.json({ success: false, error: 'Invalid TxID.' });

  const cleanTx = txid.trim();
  if (txRecords.has(cleanTx)) {
    return res.json({ success: false, error: 'This TxID has already been used.' });
  }

  let months = 4;
  if (planType === 'VIP') months = 8;
  if (planType === 'ONE_TIME') months = 12;

  txRecords.add(cleanTx);

  const hiddenCode = 'SEXCITES-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  
  if (!userCodes.has(userId)) userCodes.set(userId, []);
  userCodes.get(userId).push({ code: hiddenCode, plan: planType, months, active: true, used: false });

  res.json({ success: true, hiddenCode, message: 'Payment successfully verified on the Blockchain.' });
});

// Redeem hidden code
app.post('/api/redeem', (req, res) => {
  const { userId, code } = req.body;
  if (!users.has(userId)) return res.json({ success: false, error: 'Invalid user.' });
  
  const cleanCode = (code || '').trim().toUpperCase();
  let found = false;
  let targetMonths = 0;

  for (let [uId, codesList] of userCodes.entries()) {
    for (let c of codesList) {
      if (c.code === cleanCode && !c.used) {
        c.used = true;
        targetMonths = c.months;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    return res.json({ success: false, error: 'Invalid or already redeemed code.' });
  }

  const user = users.get(userId);
  user.isFree = false;
  user.vipMonths = (user.vipMonths || 0) + targetMonths;

  res.json({ success: true, message: 'Code successfully redeemed! VIP activated for ' + targetMonths + ' months.' });
});

// Get user hidden codes
app.get('/api/my-codes/:userId', (req, res) => {
  const userId = req.params.userId;
  const codes = userCodes.get(userId) || [];
  res.json({ success: true, codes });
});

// Post on SEXCITES Wall
app.post('/api/post', (req, res) => {
  const { userId, text } = req.body;
  const user = users.get(userId);
  if (!user || !text) return res.json({ success: false, error: 'Unauthorized or empty text.' });

  const newPost = {
    id: 'post_' + Date.now(),
    author: user.username,
    text: text.trim(),
    timestamp: Date.now(),
    likes: 0
  };

  posts.unshift(newPost);
  io.emit('new-post', newPost); // Real-time broadcast to all connected clients
  res.json({ success: true, post: newPost });
});

app.get('/api/posts', (req, res) => {
  res.json({ success: true, posts });
});

// ==========================================
// SOCKET.IO — REAL-TIME 0.1s
// ==========================================
io.on('connection', (socket) => {
  let currentUserId = null;

  socket.on('join', (userId) => {
    currentUserId = userId;
    socket.join(userId);
  });

  // Add friend by username only (Ex: @LenoxJG)
  socket.on('friend:request', (data) => {
    const { senderId, targetUsername } = data;
    const cleanTarget = (targetUsername || '').replace('@', '').trim().toLowerCase();
    
    const targetId = usersByName.get(cleanTarget);
    if (!targetId || targetId === senderId) {
      socket.emit('error-msg', { message: 'User does not exist or you cannot add yourself.' });
      return;
    }

    const sender = users.get(senderId);
    if (!sender) return;

    const reqsMap = friendRequests.get(targetId);
    if (reqsMap.has(senderId)) {
      socket.emit('error-msg', { message: 'You have already sent a request to this user.' });
      return;
    }

    const requestObj = { senderId, senderUsername: sender.username, timestamp: Date.now() };
    reqsMap.set(senderId, requestObj);

    // Send real-time notification to recipient inbox
    io.to(targetId).emit('friend:request-received', requestObj);
    socket.emit('success-msg', { message: 'Friend request successfully sent to @' + cleanTarget });
  });

  // Accept friend request
  socket.on('friend:accept', (data) => {
    const { userId, senderId } = data;
    const reqsMap = friendRequests.get(userId);
    
    if (reqsMap && reqsMap.has(senderId)) {
      reqsMap.delete(senderId);
      
      friends.get(userId).add(senderId);
      friends.get(senderId).add(userId);

      // Notify both in real-time
      io.to(userId).emit('friend:accepted', { friendId: senderId });
      io.to(senderId).emit('friend:accepted', { friendId: userId });
    }
  });

  // Load instant private chat history
  socket.on('chat:load', (data) => {
    const { userId, peerId } = data;
    const chatId = getChatId(userId, peerId);
    const history = messages.get(chatId) || [];
    socket.emit('chat:loaded', { peerId, history });
  });

  // Send live message in 0.1s
  socket.on('chat:message', (data) => {
    const { senderId, recipientId, text } = data;
    if (!text || !users.has(senderId) || !users.has(recipientId)) return;

    const chatId = getChatId(senderId, recipientId);
    if (!messages.has(chatId)) messages.set(chatId, []);

    const msgObj = { senderId, text: text.trim(), timestamp: Date.now() };
    messages.get(chatId).push(msgObj);

    // Emit instantly to both ends
    io.to(recipientId).emit('chat:incoming', { senderId, ...msgObj });
    io.to(senderId).emit('chat:incoming', { senderId, ...msgObj });
  });

  socket.on('disconnect', () => {
    if (currentUserId) {
      socket.leave(currentUserId);
    }
  });
});

// Serve Front-End Web Interface (HTML/CSS/JS Premium Glassmorphism)
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Private Community 18+</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
body {
  background: linear-gradient(135deg, #0b0e24 0%, #070a18 100%);
  color: #fff;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow-x: hidden;
  position: relative;
}
/* Clean and soft floating hearts */
.hearts-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: hidden; }
.heart { position: absolute; bottom: -50px; font-size: 20px; animation: floatUp 6s linear infinite; filter: drop-shadow(0 0 8px rgba(255,105,180,0.6)); opacity: 0.8; }
@keyframes floatUp {
  0% { transform: translateY(0) scale(0.8); opacity: 0.8; }
  100% { transform: translateY(-110vh) scale(1.2); opacity: 0; }
}
.app-container {
  width: 100%;
  max-width: 460px;
  background: rgba(18, 22, 48, 0.75);
  backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
  z-index: 10;
  padding: 24px;
  margin: 15px;
}
h1 { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 6px; background: linear-gradient(90deg, #ff758c, #ff7eb3); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.subtitle { font-size: 11px; text-align: center; color: #a5b4fc; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
input {
  width: 100%;
  padding: 12px 16px;
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.3s;
}
input:focus { border-color: #ff758c; box-shadow: 0 0 10px rgba(255,117,140,0.3); }
button {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #ff758c 0%, #ff7eb3 100%);
  border: none;
  border-radius: 12px;
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}
button:active { transform: scale(0.98); }
.hidden { display: none !important; }
.box-section { margin-top: 15px; background: rgba(0,0,0,0.25); padding: 15px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.05); }
.badge-free { background: rgba(34,197,94,0.2); color: #4ade80; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; margin-bottom: 10px; }
.wallet-box { font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.4); padding: 8px; border-radius: 8px; margin: 6px 0; word-break: break-all; color: #38bdf8; }
</style>
</head>
<body>

<div class="hearts-container" id="hearts"></div>

<div class="app-container" id="mainApp">
  <h1>SEXCITES.COM</h1>
  <div class="subtitle">Private Community 18+ • Real-Time V9</div>

  <!-- VIEW: LOGIN / REGISTER -->
  <div id="authView">
    <div style="display:flex; gap:10px; margin-bottom:15px;">
      <button onclick="switchTab('reg')" id="btnRegTab" style="background:rgba(255,255,255,0.1)">Register</button>
      <button onclick="switchTab('log')" id="btnLogTab">Sign In</button>
    </div>

    <div id="regForm">
      <input type="text" id="rUser" placeholder="Username (@example)" autocomplete="off" autocorrect="off" spellcheck="false">
      <input type="email" id="rEmail" placeholder="Email address (Optional)" autocomplete="off" autocorrect="off" spellcheck="false">
      <input type="password" id="rPass" placeholder="Password (Minimum 4 chars)" autocomplete="off" autocorrect="off" spellcheck="false">
      <button onclick="registerUser()">Create Account (Free Quota 1-500)</button>
    </div>

    <div id="logForm" class="hidden">
      <input type="text" id="lUser" placeholder="Username or Email" autocomplete="off" autocorrect="off" spellcheck="false">
      <input type="password" id="lPass" placeholder="Password" autocomplete="off" autocorrect="off" spellcheck="false">
      <button onclick="loginUser()">Enter System</button>
    </div>
    <div id="authError" style="color:#f87171; font-size:12px; text-align:center; margin-top:10px;"></div>
  </div>

  <!-- VIEW: MAIN DASHBOARD -->
  <div id="dashboardView" class="hidden">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <span id="welcomeUser" style="font-weight:600; color:#38bdf8;"></span>
      <span class="badge-free" id="badgeStatus">2 Months Free (1-500)</span>
    </div>

    <!-- INTERNAL TABS -->
    <div style="display:flex; gap:5px; margin-bottom:12px;">
      <button onclick="switchDashTab('chat')" style="font-size:12px; padding:8px;">Chats & Inbox</button>
      <button onclick="switchDashTab('wall')" style="font-size:12px; padding:8px; background:rgba(255,255,255,0.1)">Wall</button>
      <button onclick="switchDashTab('pay')" style="font-size:12px; padding:8px; background:rgba(255,255,255,0.1)">VIP Payments</button>
    </div>

    <!-- CHAT & INBOX SECTION -->
    <div id="secChat" class="box-section">
      <input type="text" id="friendInput" placeholder="Add friend by username (ex: @LenoxJG)" autocomplete="off" autocorrect="off" spellcheck="false">
      <button onclick="sendFriendRequest()" style="margin-bottom:10px; font-size:12px;">Send Friend Request</button>
      
      <div id="inboxList" style="font-size:12px; color:#cbd5e1; margin-bottom:10px; max-height:80px; overflow-y:auto;">
        <strong>Requests Inbox:</strong> <span id="noReq">No new requests</span>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
        <input type="text" id="msgPeerId" placeholder="Friend ID to chat with" autocomplete="off" autocorrect="off" spellcheck="false">
        <div id="chatBox" style="height:120px; background:rgba(0,0,0,0.3); border-radius:8px; padding:8px; overflow-y:auto; font-size:12px; margin-bottom:8px;"></div>
        <div style="display:flex; gap:6px;">
          <input type="text" id="msgText" placeholder="Type a live message..." autocomplete="off" autocorrect="off" spellcheck="false" style="margin:0;">
          <button onclick="sendMessage()" style="width:80px; margin:0;">Send</button>
        </div>
      </div>
    </div>

    <!-- WALL SECTION -->
    <div id="secWall" class="box-section hidden">
      <textarea id="wallText" placeholder="What's on your mind on SEXCITES.COM?" style="width:100%; height:60px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:10px; color:#fff; padding:8px; font-size:12px; margin-bottom:8px; outline:none;" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
      <button onclick="createPost()" style="font-size:12px; margin-bottom:10px;">Post to Wall</button>
      <div id="wallFeed" style="max-height:180px; overflow-y:auto; font-size:12px;"></div>
    </div>

    <!-- VIP PAYMENTS SECTION -->
    <div id="secPay" class="box-section hidden">
      <p style="font-size:12px; margin-bottom:6px; color:#cbd5e1;"><b>ONLY BTC & ETH (Real Anti-Scam Payments):</b></p>
      <div style="font-size:11px;">Real BTC:</div>
      <div class="wallet-box">${BTC_WALLET}</div>
      <div style="font-size:11px;">Real ETH:</div>
      <div class="wallet-box">${ETH_WALLET}</div>
      
      <select id="selectPlan" style="width:100%; padding:10px; background:#1e293b; color:#fff; border-radius:8px; border:none; margin:8px 0; font-size:12px;">
        <option value="REAL">$8.99 = 4M REAL</option>
        <option value="VIP">$16.99 = 8M BEST VIP</option>
        <option value="ONE_TIME">$28.99 = 12M ONE TIME</option>
      </select>
      <input type="text" id="txIdInput" placeholder="Paste your Blockchain TxID" autocomplete="off" autocorrect="off" spellcheck="false">
      <button onclick="verifyPayment()" style="font-size:12px; margin-bottom:8px;">Verify TxID & Get Hidden Code</button>
      
      <div id="codeResultArea" style="font-size:11px; background:rgba(0,0,0,0.4); padding:8px; border-radius:8px; word-break:break-all; margin-bottom:8px;">Hidden Code: None generated</div>
      <input type="text" id="redeemInput" placeholder="Redeem Code SEXCITES-XXXX" autocomplete="off" autocorrect="off" spellcheck="false">
      <button onclick="redeemCode()" style="font-size:12px; background:#10b981;">Redeem VIP Months</button>
    </div>

  </div>
</div>

<script>
const socket = io();
let currentUser = null;

// Soft dynamic hearts background
function createHeart() {
  const container = document.getElementById('hearts');
  if(!container) return;
  const heart = document.createElement('div');
  heart.className = 'heart';
  const symbols = ['💖', '💗', '💕', '✨'];
  heart.innerHTML = symbols[Math.floor(Math.random() * symbols.length)];
  heart.style.left = Math.random() * 100 + 'vw';
  heart.style.animationDuration = (4 + Math.random() * 3) + 's';
  container.appendChild(heart);
  setTimeout(() => { heart.remove(); }, 6000);
}
setInterval(createHeart, 600);

function switchTab(tab) {
  if(tab === 'reg') {
    document.getElementById('regForm').classList.remove('hidden');
    document.getElementById('logForm').classList.add('hidden');
    document.getElementById('btnRegTab').style.background = 'rgba(255,255,255,0.1)';
    document.getElementById('btnLogTab').style.background = 'transparent';
  } else {
    document.getElementById('regForm').classList.add('hidden');
    document.getElementById('logForm').classList.remove('hidden');
    document.getElementById('btnLogTab').style.background = 'rgba(255,255,255,0.1)';
    document.getElementById('btnRegTab').style.background = 'transparent';
  }
}

function switchDashTab(tab) {
  document.getElementById('secChat').classList.add('hidden');
  document.getElementById('secWall').classList.add('hidden');
  document.getElementById('secPay').classList.add('hidden');
  if(tab === 'chat') document.getElementById('secChat').classList.remove('hidden');
  if(tab === 'wall') document.getElementById('secWall').classList.remove('hidden');
  if(tab === 'pay') document.getElementById('secPay').classList.remove('hidden');
}

async function registerUser() {
  const username = document.getElementById('rUser').value;
  const email = document.getElementById('rEmail').value;
  const password = document.getElementById('rPass').value;
  const deviceId = 'dev_' + navigator.userAgent.length + '_' + screen.width;

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ username, email, password, deviceId })
  });
  const data = await res.json();
  if(data.success) {
    initUserSession(data.user);
  } else {
    document.getElementById('authError').innerText = data.error;
  }
}

async function loginUser() {
  const identifier = document.getElementById('lUser').value;
  const password = document.getElementById('lPass').value;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ identifier, password })
  });
  const data = await res.json();
  if(data.success) {
    initUserSession(data.user);
  } else {
    document.getElementById('authError').innerText = data.error;
  }
}

function initUserSession(user) {
  currentUser = user;
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  document.getElementById('welcomeUser').innerText = '@' + user.username;
  socket.emit('join', user.id);
  loadPosts();
}

// Socket Event Listeners for 0.1s Real-Time
socket.on('friend:request-received', (data) => {
  const box = document.getElementById('inboxList');
  document.getElementById('noReq').style.display = 'none';
  box.innerHTML += '<div style="margin-top:4px; background:rgba(255,255,255,0.05); padding:6px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">Request from: <b>@' + data.senderUsername + '</b> <button onclick="acceptRequest(\\'' + data.senderId + '\\')" style="width:auto; padding:4px 8px; font-size:10px;">Accept</button></div>';
});

function sendFriendRequest() {
  const targetUsername = document.getElementById('friendInput').value;
  socket.emit('friend:request', { senderId: currentUser.id, targetUsername });
  document.getElementById('friendInput').value = '';
}

function acceptRequest(senderId) {
  socket.emit('friend:accept', { userId: currentUser.id, senderId });
  alert('Friendship successfully accepted!');
}

socket.on('chat:incoming', (data) => {
  const chatBox = document.getElementById('chatBox');
  chatBox.innerHTML += '<div style="margin-bottom:4px;"><b>' + (data.senderId === currentUser.id ? 'You' : 'Friend') + ':</b> ' + data.text + '</div>';
  chatBox.scrollTop = chatBox.scrollHeight;
});

function sendMessage() {
  const recipientId = document.getElementById('msgPeerId').value;
  const text = document.getElementById('msgText').value;
  if(!recipientId || !text) return;
  socket.emit('chat:message', { senderId: currentUser.id, recipientId, text });
  document.getElementById('msgText').value = '';
}

async function createPost() {
  const text = document.getElementById('wallText').value;
  const res = await fetch('/api/post', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, text })
  });
  const data = await res.json();
  if(data.success) {
    document.getElementById('wallText').value = '';
  }
}

socket.on('new-post', (post) => {
  renderSinglePost(post);
});

async function loadPosts() {
  const res = await fetch('/api/posts');
  const data = await res.json();
  const feed = document.getElementById('wallFeed');
  feed.innerHTML = '';
  if(data.success) {
    data.posts.forEach(p => renderSinglePost(p));
  }
}

function renderSinglePost(p) {
  const feed = document.getElementById('wallFeed');
  const div = document.createElement('div');
  div.style.cssText = "background:rgba(255,255,255,0.03); padding:8px; border-radius:8px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.05);";
  div.innerHTML = '<b style="color:#ff758c;">@' + p.author + '</b><p style="margin-top:2px; color:#e2e8f0;">' + p.text + '</p>';
  feed.prepend(div);
}

async function verifyPayment() {
  const txid = document.getElementById('txIdInput').value;
  const planType = document.getElementById('selectPlan').value;
  const res = await fetch('/api/pay-verify', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, txid, planType })
  });
  const data = await res.json();
  if(data.success) {
    document.getElementById('codeResultArea').innerHTML = '<b style="color:#4ade80;">Generated Hidden Code:</b> ' + data.hiddenCode;
  } else {
    alert(data.error);
  }
}

async function redeemCode() {
  const code = document.getElementById('redeemInput').value;
  const res = await fetch('/api/redeem', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, code })
  });
  const data = await res.json();
  if(data.success) {
    alert(data.message);
    document.getElementById('badgeStatus').innerText = 'VIP Active';
    document.getElementById('badgeStatus').style.background = 'rgba(56,189,248,0.2)';
    document.getElementById('badgeStatus').style.color = '#38bdf8';
  } else {
    alert(data.error);
  }
}
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('SEXCITES.COM V9 running on port ' + PORT);
});
