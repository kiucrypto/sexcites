const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// MEMORY STORAGE (High-speed Maps)
// ==========================================
const users = new Map();          // id -> userObj
const usersByName = new Map();    // username -> id
const devices = new Map();        // deviceKey -> userId (Anti multi-account protection)
const friends = new Map();        // userId -> Set(friendIds)
const friendRequests = new Map(); // userId -> Map(senderId -> requestObj)
const messages = new Map();       // chatId -> [ {senderId, text, type, timestamp} ]
const posts = [];                 // [ {id, author, text, image, timestamp, likes: Set(), comments: []} ]
const userCodes = new Map();      // userId -> [ {code, plan, months, used} ]

const BTC_WALLET = "bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s";
const ETH_WALLET = "0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c";
const ADMIN_EMAIL = "po80payments@gmail.com";

// Helper for unified and ordered chat IDs
function getChatId(id1, id2) {
  return id1 < id2 ? id1 + '_' + id2 : id2 + '_' + id1;
}

// ==========================================
// REST API ENDPOINTS
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).send('SEXCITES.COM V15 LIVE & FULLY OPERATIONAL');
});

// Strict registration: 1 device = 1 account + 500 Free Limit Blocker (501+ requires payment first)
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
    return res.json({ success: false, error: 'Multi-account blocked: An account is already registered from this device.' });
  }

  // STRICT 1 TO 500 FREE BLOCKER SYSTEM (501+ forced to pay)
  if (users.size >= 500) {
    return res.json({ 
      success: false, 
      error: 'FREE QUOTA EXCEEDED (User 501+): The free 2-month tier is full. You must complete a payment plan first to unlock your account registration.' 
    });
  }

  const userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const newUser = {
    id: userId,
    username: cleanUser,
    email: email || '',
    password: password,
    isFree: true,
    vipMonths: 2, // 2 Months Free for users 1 to 500
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

// Request payment code
app.post('/api/pay-request', (req, res) => {
  const { userId, planType } = req.body;
  if (!users.has(userId)) return res.json({ success: false, error: 'Invalid user.' });

  let months = 4;
  if (planType === 'VIP') months = 8;
  if (planType === 'ONE_TIME') months = 12;

  const hiddenCode = 'SEXCITES-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  
  if (!userCodes.has(userId)) userCodes.set(userId, []);
  userCodes.get(userId).push({ code: hiddenCode, plan: planType, months, active: true, used: false });

  res.json({ 
    success: true, 
    hiddenCode, 
    adminEmail: ADMIN_EMAIL,
    message: 'Reference generated. Send your payment screenshot to ' + ADMIN_EMAIL + ' with this code.' 
  });
});

// Redeem hidden code system
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

// Wall Post Creation
app.post('/api/post', (req, res) => {
  const { userId, text, image } = req.body;
  const user = users.get(userId);
  if (!user || (!text && !image)) return res.json({ success: false, error: 'Unauthorized or empty content.' });

  const newPost = {
    id: 'post_' + Date.now(),
    author: user.username,
    text: text ? text.trim() : '',
    image: image || null,
    timestamp: Date.now(),
    likes: [], // Array of userIds who liked
    comments: []
  };

  posts.unshift(newPost);
  // Send sanitized post structure for client rendering
  io.emit('new-post', { ...newPost, likesCount: 0, userHasLiked: false });
  res.json({ success: true, post: newPost });
});

// Wall Post Like Toggle
app.post('/api/post/like', (req, res) => {
  const { userId, postId } = req.body;
  const user = users.get(userId);
  const targetPost = posts.find(p => p.id === postId);

  if (!user || !targetPost) {
    return res.json({ success: false, error: 'Invalid user or post.' });
  }

  const index = targetPost.likes.indexOf(userId);
  let liked = false;
  if (index === -1) {
    targetPost.likes.push(userId);
    liked = true;
  } else {
    targetPost.likes.splice(index, 1);
    liked = false;
  }

  io.emit('post-liked', { postId, likesCount: targetPost.likes.length });
  res.json({ success: true, liked, likesCount: targetPost.likes.length });
});

// Wall Comment / Reply Creation
app.post('/api/post/comment', (req, res) => {
  const { userId, postId, text, image } = req.body;
  const user = users.get(userId);
  const targetPost = posts.find(p => p.id === postId);

  if (!user || !targetPost || (!text && !image)) {
    return res.json({ success: false, error: 'Invalid post or empty comment.' });
  }

  const newComment = {
    id: 'comm_' + Date.now(),
    author: user.username,
    text: text ? text.trim() : '',
    image: image || null,
    timestamp: Date.now()
  };

  targetPost.comments.push(newComment);
  io.emit('new-comment', { postId, comment: newComment });
  res.json({ success: true, comment: newComment });
});

app.get('/api/posts', (req, res) => {
  const userId = req.query.userId || '';
  const formattedPosts = posts.map(p => ({
    ...p,
    likesCount: p.likes.length,
    userHasLiked: p.likes.includes(userId)
  }));
  res.json({ success: true, posts: formattedPosts });
});

// ==========================================
// SOCKET.IO — REAL-TIME 0.1s
// ==========================================
io.on('connection', (socket) => {
  let currentUserId = null;
  socket.join = socket.join.bind(socket);

  socket.on('join', (userId) => {
    currentUserId = userId;
    socket.join(userId);
  });

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

    io.to(targetId).emit('friend:request-received', requestObj);
    socket.emit('success-msg', { message: 'Friend request successfully sent to @' + cleanTarget });
  });

  socket.on('friend:accept', (data) => {
    const { userId, senderId } = data;
    const reqsMap = friendRequests.get(userId);
    
    if (reqsMap && reqsMap.has(senderId)) {
      reqsMap.delete(senderId);
      friends.get(userId).add(senderId);
      friends.get(senderId).add(userId);

      io.to(userId).emit('friend:accepted', { friendId: senderId });
      io.to(senderId).emit('friend:accepted', { friendId: userId });
    }
  });

  socket.on('chat:load-by-username', (data) => {
    const { userId, peerUsername } = data;
    const peerId = usersByName.get(peerUsername);
    if(!peerId) {
      socket.emit('error-msg', { message: 'User @' + peerUsername + ' not found.' });
      return;
    }
    const chatId = getChatId(userId, peerId);
    const history = messages.get(chatId) || [];
    socket.emit('chat:loaded', { peerId, peerUsername, history });
  });

  socket.on('chat:message', (data) => {
    const { senderId, recipientId, text, type } = data;
    if (!text || !users.has(senderId) || !users.has(recipientId)) return;

    const chatId = getChatId(senderId, recipientId);
    if (!messages.has(chatId)) messages.set(chatId, []);

    const msgObj = { senderId, text: text.trim(), type: type || 'text', timestamp: Date.now() };
    messages.get(chatId).push(msgObj);

    io.to(recipientId).emit('chat:incoming', { senderId, ...msgObj });
    io.to(senderId).emit('chat:incoming', { senderId, ...msgObj });
  });

  socket.on('disconnect', () => {
    if (currentUserId) socket.leave(currentUserId);
  });
});

// Front-End Interface with SEXCITES 24/7 Translation & Full Wall Interactivity (Likes, Comments, Share)
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
.hearts-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: hidden; }
.heart { position: absolute; bottom: -50px; font-size: 20px; animation: floatUp 6s linear infinite; filter: drop-shadow(0 0 8px rgba(255,105,180,0.6)); opacity: 0.8; }
@keyframes floatUp {
  0% { transform: translateY(0) scale(0.8); opacity: 0.8; }
  100% { transform: translateY(-110vh) scale(1.2); opacity: 0; }
}

/* SEXCITES 24/7 CUSTOM TRANSLATE WIDGET */
.translate-float {
  position: fixed;
  top: 15px;
  right: 15px;
  background: rgba(18, 22, 48, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 117, 140, 0.6);
  padding: 6px 14px;
  border-radius: 30px;
  box-shadow: 0 4px 20px rgba(255, 117, 140, 0.4);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: pulseGlow 3s infinite;
}
@keyframes pulseGlow {
  0% { box-shadow: 0 0 10px rgba(255, 117, 140, 0.3); }
  50% { box-shadow: 0 0 24px rgba(255, 117, 140, 0.8); }
  100% { box-shadow: 0 0 10px rgba(255, 117, 140, 0.3); }
}
.translate-brand {
  font-size: 11px;
  font-weight: 700;
  background: linear-gradient(90deg, #ff758c, #ff7eb3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
}
/* Completely hide Google native elements & maintain clean SEXCITES UI */
.goog-te-banner-frame { display: none !important; }
.goog-logo-link { display: none !important; }
.goog-te-gadget { color: transparent !important; font-size: 0 !important; }
.goog-te-gadget span { display: none !important; }
body { top: 0 !important; }
.goog-te-combo {
  background: #1e293b !important;
  color: #fff !important;
  border: 1px solid rgba(255,255,255,0.2) !important;
  padding: 4px 8px !important;
  border-radius: 8px !important;
  font-size: 11px !important;
  outline: none !important;
  cursor: pointer;
}

.app-container {
  width: 100%;
  max-width: 480px;
  background: rgba(18, 22, 48, 0.78);
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

<!-- SEXCITES 24/7 CUSTOM TRANSLATE WIDGET -->
<div class="translate-float">
  <span class="translate-brand">SEXCITES Translate</span>
  <div id="google_translate_element"></div>
</div>
<script type="text/javascript">
  function googleTranslateElementInit() {
    new google.translate.TranslateElement({
      pageLanguage: 'en',
      includedLanguages: 'es,en,fr,de,pt,it,ru,ja,zh-CN,ar,hi',
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
      autoDisplay: false
    }, 'google_translate_element');
  }
</script>
<script type="text/javascript" src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>

<div class="hearts-container" id="hearts"></div>

<div class="app-container" id="mainApp">
  <h1>SEXCITES.COM</h1>
  <div class="subtitle">Private Community 18+ • Real-Time V15</div>

  <!-- AUTH VIEW -->
  <div id="authView">
    <div style="display:flex; gap:10px; margin-bottom:15px;">
      <button onclick="switchTab('reg')" id="btnRegTab" style="background:rgba(255,255,255,0.1)">Register</button>
      <button onclick="switchTab('log')" id="btnLogTab">Sign In</button>
    </div>

    <div id="regForm">
      <div style="font-size:11px; color:#4ade80; margin-bottom:8px; text-align:center;">🔥 Users 1 to 500 get 2 Months Free! (501+ Locked & Requires Payment)</div>
      <input type="text" id="rUser" placeholder="Username (@example)" autocomplete="off">
      <input type="email" id="rEmail" placeholder="Email address (Optional)" autocomplete="off">
      <input type="password" id="rPass" placeholder="Password (Minimum 4 chars)" autocomplete="off">
      <button onclick="registerUser()">Create Account (1 Device Block)</button>
    </div>

    <div id="logForm" class="hidden">
      <input type="text" id="lUser" placeholder="Username or Email" autocomplete="off">
      <input type="password" id="lPass" placeholder="Password" autocomplete="off">
      <button onclick="loginUser()">Enter System</button>
    </div>
    <div id="authError" style="color:#f87171; font-size:12px; text-align:center; margin-top:10px;"></div>
  </div>

  <!-- DASHBOARD VIEW -->
  <div id="dashboardView" class="hidden">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <span id="welcomeUser" style="font-weight:600; color:#38bdf8;"></span>
      <span class="badge-free" id="badgeStatus">2 Months Free Active</span>
    </div>

    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px; margin-bottom:12px;">
      <button onclick="switchDashTab('inbox')" id="tabBtnInbox" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.2)">Inbox</button>
      <button onclick="switchDashTab('chat')" id="tabBtnChat" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.1)">Live Chat</button>
      <button onclick="switchDashTab('wall')" id="tabBtnWall" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.1)">Wall</button>
      <button onclick="switchDashTab('pay')" id="tabBtnPay" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.1)">Payments</button>
    </div>

    <!-- 1. INBOX -->
    <div id="secInbox" class="box-section">
      <p style="font-size:12px; margin-bottom:8px; color:#38bdf8;"><b>📥 Message & Request Inbox</b></p>
      <input type="text" id="friendInput" placeholder="Add friend by username (ex: @lenoxjg)" autocomplete="off">
      <button onclick="sendFriendRequest()" style="margin-bottom:12px; font-size:12px;">Send Friend Request</button>
      <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;"><b>Pending Friend Requests:</b></div>
      <div id="inboxList" style="background:rgba(0,0,0,0.3); border-radius:8px; padding:8px; max-height:140px; overflow-y:auto; font-size:12px;">
        <span id="noReq" style="color:#94a3b8;">No pending requests</span>
      </div>
    </div>

    <!-- 2. LIVE CHAT -->
    <div id="secChat" class="box-section hidden">
      <p style="font-size:12px; margin-bottom:8px; color:#ff758c;"><b>💬 Live Direct Chat & Photos</b></p>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <input type="text" id="msgPeerUsername" placeholder="Friend Username (ex: @user)" autocomplete="off" style="margin:0;">
        <button onclick="loadChatHistory()" style="width:110px; margin:0; font-size:11px;">Load History</button>
      </div>
      <div id="chatBox" style="height:150px; background:rgba(0,0,0,0.3); border-radius:8px; padding:8px; overflow-y:auto; font-size:12px; margin-bottom:8px;">
        <div style="color:#94a3b8; text-align:center; padding-top:40px;">Enter friend username above & load history.</div>
      </div>
      <div style="display:flex; gap:6px;">
        <input type="text" id="msgText" placeholder="Type message..." autocomplete="off" style="margin:0;">
        <input type="file" id="imageInput" accept="image/*" style="display:none;" onchange="sendPhoto(event)">
        <button onclick="document.getElementById('imageInput').click()" style="width:45px; margin:0; background:#334155;" title="Send Photo">📷</button>
        <button onclick="sendMessage()" style="width:70px; margin:0;">Send</button>
      </div>
    </div>

    <!-- 3. WALL SECTION (Interactive Posts, Likes, Comments, Photos & Share) -->
    <div id="secWall" class="box-section hidden">
      <textarea id="wallText" placeholder="What's on your mind on SEXCITES.COM?" style="width:100%; height:55px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:10px; color:#fff; padding:8px; font-size:12px; margin-bottom:6px; outline:none;" autocomplete="off"></textarea>
      <div style="display:flex; gap:6px; margin-bottom:10px;">
        <input type="file" id="wallImageInput" accept="image/*" style="display:none;" onchange="previewWallImage(event)">
        <button onclick="document.getElementById('wallImageInput').click()" style="width:auto; padding:8px 12px; font-size:11px; background:#334155;">📷 Add Photo</button>
        <button onclick="createPost()" style="font-size:12px; flex:1;">Post to Wall</button>
      </div>
      <div id="wallImagePreview" style="font-size:11px; color:#4ade80; margin-bottom:6px; display:none;">Image attached successfully!</div>
      <div id="wallFeed" style="max-height:220px; overflow-y:auto; font-size:12px;"></div>
    </div>

    <!-- 4. PAYMENTS & REDEEM -->
    <div id="secPay" class="box-section hidden">
      <p style="font-size:12px; margin-bottom:6px; color:#cbd5e1;"><b>ONLY BTC & ETH (Direct Email Verification):</b></p>
      <div style="font-size:11px;">Real BTC:</div>
      <div class="wallet-box">${BTC_WALLET}</div>
      <div style="font-size:11px;">Real ETH:</div>
      <div class="wallet-box">${ETH_WALLET}</div>
      
      <select id="selectPlan" style="width:100%; padding:10px; background:#1e293b; color:#fff; border-radius:8px; border:none; margin:8px 0; font-size:12px;">
        <option value="REAL">$8.99 = 4M REAL</option>
        <option value="VIP">$16.99 = 8M BEST VIP</option>
        <option value="ONE_TIME">$28.99 = 12M ONE TIME</option>
      </select>
      
      <button onclick="requestPaymentCode()" style="font-size:12px; margin-bottom:8px;">Get Code & Instructions</button>
      <div id="codeResultArea" style="font-size:11px; background:rgba(0,0,0,0.4); padding:8px; border-radius:8px; word-break:break-all; margin-bottom:8px;">Click above to generate code and send screenshot to po80payments@gmail.com</div>
      
      <input type="text" id="redeemInput" placeholder="Redeem Code SEXCITES-XXXX" autocomplete="off">
      <button onclick="redeemCode()" style="font-size:12px; background:#10b981;">Redeem VIP Months</button>
    </div>

  </div>
</div>

<script>
const socket = io();
let currentUser = null;
let currentPeerId = null;
let attachedWallImage = null;

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
  document.getElementById('secInbox').classList.add('hidden');
  document.getElementById('secChat').classList.add('hidden');
  document.getElementById('secWall').classList.add('hidden');
  document.getElementById('secPay').classList.add('hidden');
  
  document.getElementById('tabBtnInbox').style.background = 'rgba(255,255,255,0.1)';
  document.getElementById('tabBtnChat').style.background = 'rgba(255,255,255,0.1)';
  document.getElementById('tabBtnWall').style.background = 'rgba(255,255,255,0.1)';
  document.getElementById('tabBtnPay').style.background = 'rgba(255,255,255,0.1)';

  if(tab === 'inbox') {
    document.getElementById('secInbox').classList.remove('hidden');
    document.getElementById('tabBtnInbox').style.background = 'rgba(255,255,255,0.2)';
  }
  if(tab === 'chat') {
    document.getElementById('secChat').classList.remove('hidden');
    document.getElementById('tabBtnChat').style.background = 'rgba(255,255,255,0.2)';
  }
  if(tab === 'wall') {
    document.getElementById('secWall').classList.remove('hidden');
    document.getElementById('tabBtnWall').style.background = 'rgba(255,255,255,0.2)';
  }
  if(tab === 'pay') {
    document.getElementById('secPay').classList.remove('hidden');
    document.getElementById('tabBtnPay').style.background = 'rgba(255,255,255,0.2)';
  }
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
    if(data.error.includes('FREE QUOTA EXCEEDED')) {
      alert('Registration blocked for user 501+. Please make a direct crypto payment first to unlock your access.');
    }
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

socket.on('friend:request-received', (data) => {
  const box = document.getElementById('inboxList');
  document.getElementById('noReq').style.display = 'none';
  box.innerHTML += '<div style="margin-top:6px; background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span>Request from: <b>@' + data.senderUsername + '</b></span> <button onclick="acceptRequest(\\'' + data.senderId + '\\', \\'' + data.senderUsername + '\\')" style="width:auto; padding:4px 10px; font-size:10px;">Accept</button></div>';
});

function sendFriendRequest() {
  const targetUsername = document.getElementById('friendInput').value;
  socket.emit('friend:request', { senderId: currentUser.id, targetUsername });
  document.getElementById('friendInput').value = '';
}

function acceptRequest(senderId, senderUsername) {
  socket.emit('friend:accept', { userId: currentUser.id, senderId });
  alert('Friend request accepted! You can now chat with @' + senderUsername);
  document.getElementById('msgPeerUsername').value = senderUsername;
  switchDashTab('chat');
  loadChatHistory();
}

function loadChatHistory() {
  const peerUser = document.getElementById('msgPeerUsername').value.replace('@', '').trim().toLowerCase();
  if(!peerUser) return alert('Please enter a friend username');
  socket.emit('chat:load-by-username', { userId: currentUser.id, peerUsername: peerUser });
}

socket.on('chat:loaded', (data) => {
  currentPeerId = data.peerId;
  const chatBox = document.getElementById('chatBox');
  chatBox.innerHTML = '';
  if(data.history.length === 0) {
    chatBox.innerHTML = '<div style="color:#94a3b8; text-align:center;">No previous messages with this user. Start chatting!</div>';
    return;
  }
  data.history.forEach(m => renderMessageItem(m, data.peerUsername));
  chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on('chat:incoming', (data) => {
  if(currentPeerId && (data.senderId === currentPeerId || data.senderId === currentUser.id)) {
    renderMessageItem(data, document.getElementById('msgPeerUsername').value.replace('@',''));
  }
});

function renderMessageItem(m, peerName) {
  const chatBox = document.getElementById('chatBox');
  const isMe = m.senderId === currentUser.id;
  const senderLabel = isMe ? 'You' : '@' + peerName;
  const color = isMe ? '#38bdf8' : '#ff758c';
  
  let content = m.text;
  if(m.type === 'image') {
    content = '<br><img src="' + m.text + '" style="max-width:140px; border-radius:8px; margin-top:4px;">';
  }

  chatBox.innerHTML += '<div style="margin-bottom:6px;"><b style="color:' + color + ';">' + senderLabel + ':</b> ' + content + '</div>';
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
  const text = document.getElementById('msgText').value;
  if(!currentPeerId || !text) return alert('Load a valid chat history first or type a message.');
  socket.emit('chat:message', { senderId: currentUser.id, recipientId: currentPeerId, text, type: 'text' });
  document.getElementById('msgText').value = '';
}

function sendPhoto(event) {
  const file = event.target.files[0];
  if(!file || !currentPeerId) return alert('Load a chat history first before sending photos.');
  const reader = new FileReader();
  reader.onload = function(e) {
    socket.emit('chat:message', { senderId: currentUser.id, recipientId: currentPeerId, text: e.target.result, type: 'image' });
  };
  reader.readAsDataURL(file);
}

// WALL, LIKES, COMMENTS & SHARE SYSTEM
function previewWallImage(event) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    attachedWallImage = e.target.result;
    document.getElementById('wallImagePreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function createPost() {
  const text = document.getElementById('wallText').value;
  if(!text && !attachedWallImage) return alert('Write something or attach an image.');

  const res = await fetch('/api/post', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, text, image: attachedWallImage })
  });
  const data = await res.json();
  if(data.success) {
    document.getElementById('wallText').value = '';
    attachedWallImage = null;
    document.getElementById('wallImagePreview').style.display = 'none';
  }
}

socket.on('new-post', (post) => {
  renderSinglePost(post);
});

socket.on('post-liked', (data) => {
  const countSpan = document.getElementById('likes_count_' + data.postId);
  if(countSpan) countSpan.innerText = data.likesCount;
});

socket.on('new-comment', (data) => {
  const container = document.getElementById('comments_for_' + data.postId);
  if(container) {
    let imgHTML = data.comment.image ? '<br><img src="' + data.comment.image + '" style="max-width:120px; border-radius:6px; margin-top:3px;">' : '';
    container.innerHTML += '<div style="margin-top:4px; padding:6px; background:rgba(0,0,0,0.2); border-radius:6px;"><b style="color:#38bdf8;">@' + data.comment.author + ':</b> ' + data.comment.text + imgHTML + '</div>';
  }
});

async function loadPosts() {
  const res = await fetch('/api/posts?userId=' + currentUser.id);
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
  div.id = 'post_' + p.id;
  div.style.cssText = "background:rgba(255,255,255,0.03); padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.05);";
  
  let imgHTML = p.image ? '<br><img src="' + p.image + '" style="max-width:100%; border-radius:8px; margin-top:6px;">' : '';
  let likesCount = p.likesCount !== undefined ? p.likesCount : (p.likes ? p.likes.length : 0);
  let hasLiked = p.userHasLiked !== undefined ? p.userHasLiked : (p.likes && p.likes.includes(currentUser.id));
  let likeColor = hasLiked ? '#ff758c' : '#cbd5e1';

  let commentsHTML = '<div id="comments_for_' + p.id + '" style="margin-top:8px; padding-left:10px; border-left:2px solid rgba(255,117,140,0.3);">';
  if(p.comments) {
    p.comments.forEach(c => {
      let cImg = c.image ? '<br><img src="' + c.image + '" style="max-width:120px; border-radius:6px; margin-top:3px;">' : '';
      commentsHTML += '<div style="margin-top:4px; padding:6px; background:rgba(0,0,0,0.2); border-radius:6px;"><b style="color:#38bdf8;">@' + c.author + ':</b> ' + c.text + cImg + '</div>';
    });
  }
  commentsHTML += '</div>';

  div.innerHTML = '<b style="color:#ff758c;">@' + p.author + '</b>' +
                  '<p style="margin-top:2px; color:#e2e8f0;">' + p.text + '</p>' + imgHTML +
                  '<div style="display:flex; gap:15px; margin-top:8px; font-size:11px;">' +
                    '<button onclick="toggleLike(\\\'' + p.id + '\\\')" id="like_btn_' + p.id + '" style="width:auto; background:none; border:none; color:' + likeColor + '; cursor:pointer; padding:0; font-weight:600;">❤️ <span id="likes_count_' + p.id + '">' + likesCount + '</span> Likes</button>' +
                    '<button onclick="sharePost(\\\'' + p.id + '\\\')" style="width:auto; background:none; border:none; color:#38bdf8; cursor:pointer; padding:0; font-weight:600;">🔗 Share</button>' +
                  '</div>' +
                  commentsHTML +
                  '<div style="display:flex; gap:4px; margin-top:8px;">' +
                    '<input type="text" id="reply_text_' + p.id + '" placeholder="Write a reply or post photo..." style="margin:0; font-size:11px; padding:6px;">' +
                    '<input type="file" id="reply_img_' + p.id + '" accept="image/*" style="display:none;" onchange="handleReplyImage(event, \\\\'' + p.id + '\\\\')">' +
                    '<button onclick="document.getElementById(\\\'reply_img_' + p.id + '\\\').click()" style="width:36px; margin:0; padding:0; background:#334155; font-size:12px;" title="Attach photo">📷</button>' +
                    '<button onclick="sendComment(\\\'' + p.id + '\\\')" style="width:70px; margin:0; padding:6px; font-size:11px;">Reply</button>' +
                  '</div>';

  feed.prepend(div);
}

async function toggleLike(postId) {
  const res = await fetch('/api/post/like', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, postId })
  });
  const data = await res.json();
  if(data.success) {
    const btn = document.getElementById('like_btn_' + postId);
    if(data.liked) {
      btn.style.color = '#ff758c';
    } else {
      btn.style.color = '#cbd5e1';
    }
  }
}

function sharePost(postId) {
  const shareText = 'Check out this post on SEXCITES.COM! ID: ' + postId;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.origin + '#post-' + postId);
    alert('Post link copied to clipboard! Share it with anyone.');
  } else {
    alert(shareText);
  }
}

// Temporary store for reply images keyed by post ID
const replyImages = {};
function handleReplyImage(event, postId) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    replyImages[postId] = e.target.result;
    alert('Photo attached to reply!');
  };
  reader.readAsDataURL(file);
}

async function sendComment(postId) {
  const textInput = document.getElementById('reply_text_' + postId);
  const text = textInput.value;
  const image = replyImages[postId] || null;

  if(!text && !image) return alert('Type a response or attach an image.');

  const res = await fetch('/api/post/comment', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, postId, text, image })
  });
  const data = await res.json();
  if(data.success) {
    textInput.value = '';
    delete replyImages[postId];
  } else {
    alert(data.error);
  }
}

async function requestPaymentCode() {
  const planType = document.getElementById('selectPlan').value;
  const res = await fetch('/api/pay-request', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, planType })
  });
  const data = await res.json();
  if(data.success) {
    document.getElementById('codeResultArea').innerHTML = '<b style="color:#4ade80;">Code: ' + data.hiddenCode + '</b><br><span style="color:#cbd5e1;">Send screenshot to <a href="mailto:' + data.adminEmail + '" style="color:#38bdf8;">' + data.adminEmail + '</a>.</span>';
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
  console.log('SEXCITES.COM V15 running on port ' + PORT);
});
