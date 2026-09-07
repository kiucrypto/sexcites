const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = path.join(__dirname, 'database.json');

// Local Database Structure
let db = {
  users: {},
  posts: [],
  chats: {},
  requests: {},
  ips: {} // IP anti-multi-account security control
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.ips) db.ips = {};
  } catch(e) {
    console.log('Initializing new database for SEXCITES.COM');
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getChatId(u1, u2) {
  return u1 < u2 ? u1 + '_' + u2 : u2 + '_' + u1;
}

function getClientIP(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
}

// ==========================================
// REGISTRATION API WITH IP ANTI-MULTI-ACCOUNT BLOCKING
// ==========================================
app.post('/api/register', (req, res) => {
  const { username, password, plan } = req.body;
  const clientIP = getClientIP(req);

  if (!username || username.trim().length < 3 || !password || password.trim().length < 4) {
    return res.json({ success: false, error: 'Username (min. 3) and password (min. 4) are required.' });
  }

  const cleanUser = username.trim().toLowerCase().replace('@', '');
  if (db.users[cleanUser]) {
    return res.json({ success: false, error: 'Username is already registered.' });
  }

  // Strict Anti-Multi-Account IP Restriction (Max 1 free account per IP)
  const totalUsers = Object.keys(db.users).length;
  if (totalUsers < 500 && db.ips[clientIP]) {
    return res.json({ success: false, error: 'Security Block: An account has already been registered from this network/IP.' });
  }

  let subscriptionStatus = '';
  let expiresAt = 0;

  if (totalUsers < 500) {
    subscriptionStatus = 'free_launch_2m';
    expiresAt = Date.now() + (60 * 24 * 60 * 60 * 1000); // 2 months free
    db.ips[clientIP] = cleanUser; // Register IP blocking duplicates
  } else {
    if (plan !== '6m' && plan !== '12m') {
      return res.json({ success: false, error: 'Limit of 500 free accounts reached. Please select a paid plan.' });
    }
    subscriptionStatus = plan === '6m' ? 'paid_6m' : 'paid_12m';
    const days = plan === '6m' ? 180 : 365;
    expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    username: cleanUser,
    password,
    ip: clientIP,
    subNumber: totalUsers + 1,
    subscriptionStatus,
    expiresAt,
    createdAt: Date.now()
  };

  db.users[cleanUser] = newUser;
  db.requests[cleanUser] = {};
  saveDB();

  io.emit('stats:update', { totalUsers: Object.keys(db.users).length });
  res.json({ success: true, user: newUser });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const cleanUser = (username || '').trim().toLowerCase().replace('@', '');
  const user = db.users[cleanUser];

  if (!user || user.password !== password) {
    return res.json({ success: false, error: 'Invalid credentials.' });
  }

  res.json({ success: true, user });
});

app.get('/api/init-data', (req, res) => {
  const currentUsername = req.query.username || '';
  const formattedPosts = db.posts.map(p => ({
    ...p,
    likesCount: p.likes.length,
    userHasLiked: p.likes.includes(currentUsername)
  }));
  res.json({
    success: true,
    totalUsers: Object.keys(db.users).length,
    posts: formattedPosts
  });
});

// ==========================================
// WEBSOCKETS (REAL-TIME CLOUD OS)
// ==========================================
io.on('connection', (socket) => {
  socket.on('join', (username) => {
    if (username) socket.join(username.toLowerCase());
  });

  // Social Wall (Persistent with Text & Image Support)
  socket.on('post:create', (data) => {
    const { author, text, image } = data;
    if (!text && !image) return;

    const newPost = {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      author,
      text: text ? text.trim() : '',
      image: image || null,
      timestamp: Date.now(),
      likes: [],
      comments: []
    };

    db.posts.unshift(newPost);
    saveDB();

    io.emit('post:new', { ...newPost, likesCount: 0, userHasLiked: false });
  });

  socket.on('post:like', (data) => {
    const { postId, username } = data;
    const post = db.posts.find(p => p.id === postId);
    if (!post) return;

    const idx = post.likes.indexOf(username);
    if (idx === -1) post.likes.push(username);
    else post.likes.splice(idx, 1);
    
    saveDB();
    io.emit('post:liked', { postId, likesCount: post.likes.length });
  });

  socket.on('post:comment', (data) => {
    const { postId, author, text } = data;
    const post = db.posts.find(p => p.id === postId);
    if (!post || !text) return;

    const comment = { id: 'comm_' + Date.now(), author, text: text.trim(), timestamp: Date.now() };
    post.comments.push(comment);
    saveDB();

    io.emit('post:commented', { postId, comment });
  });

  // Friend Requests
  socket.on('friend:request', (data) => {
    const { sender, target } = data;
    const cleanTarget = (target || '').trim().toLowerCase().replace('@', '');

    if (!db.users[cleanTarget]) {
      socket.emit('error-msg', { message: 'The entered user does not exist.' });
      return;
    }
    if (cleanTarget === sender) {
      socket.emit('error-msg', { message: 'You cannot send a friend request to yourself.' });
      return;
    }

    if (!db.requests[cleanTarget]) db.requests[cleanTarget] = {};
    db.requests[cleanTarget][sender] = true;
    saveDB();

    io.to(cleanTarget).emit('friend:request-received', { sender });
    socket.emit('success-msg', { message: 'Request sent to @' + cleanTarget });
  });

  // Real-time Instant Private Chat (Persistent)
  socket.on('chat:load', (data) => {
    const { user1, user2 } = data;
    const cleanPeer = (user2 || '').trim().toLowerCase().replace('@', '');
    
    if (!db.users[cleanPeer]) {
      socket.emit('error-msg', { message: 'The chat user does not exist.' });
      return;
    }

    const chatId = getChatId(user1, cleanPeer);
    const history = db.chats[chatId] || [];
    socket.emit('chat:history-loaded', { history, peer: cleanPeer });
  });

  socket.on('chat:message', (data) => {
    const { sender, recipient, text } = data;
    const cleanRecipient = (recipient || '').trim().toLowerCase().replace('@', '');

    if (!text || !db.users[cleanRecipient]) {
      socket.emit('error-msg', { message: 'Incorrect recipient or empty message.' });
      return;
    }

    const chatId = getChatId(sender, cleanRecipient);
    if (!db.chats[chatId]) db.chats[chatId] = [];

    const msgObj = { sender, text: text.trim(), timestamp: Date.now() };
    db.chats[chatId].push(msgObj);
    saveDB();

    io.to(cleanRecipient).emit('chat:incoming', msgObj);
    io.to(sender).emit('chat:incoming', msgObj);
  });
});

// ==========================================
// FRONT-END (CLOUD OS INTERFACE WITH NEON RED BACKGROUND ANIMATION)
// ==========================================
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Cloud OS</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
body { 
  background: #030107; 
  color: #fff; 
  min-height: 100vh; 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  justify-content: flex-start; 
  padding: 15px; 
  position: relative; 
  overflow-x: hidden;
}

/* Neon Red Moving Dots Background Animation */
canvas#bgCanvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1;
  pointer-events: none;
  background: #030107;
}

.container { 
  width: 100%; 
  max-width: 650px; 
  background: rgba(15, 8, 25, 0.92); 
  border: 1px solid rgba(255, 42, 109, 0.35); 
  border-radius: 20px; 
  padding: 20px; 
  box-shadow: 0 20px 50px rgba(0,0,0,0.9); 
  margin-top: 10px; 
  z-index: 1;
  backdrop-filter: blur(10px);
}

h1 { 
  font-size: 22px; 
  background: linear-gradient(90deg, #ff2a6d, #05d9e8); 
  -webkit-background-clip: text; 
  -webkit-text-fill-color: transparent; 
  text-align: center; 
  margin-bottom: 4px; 
}

.counter-banner { 
  background: rgba(5, 217, 232, 0.08); 
  border: 1px solid rgba(5, 217, 232, 0.25); 
  border-radius: 10px; 
  padding: 10px; 
  text-align: center; 
  font-size: 12px; 
  margin-bottom: 12px; 
  color: #05d9e8; 
  font-weight: 600; 
}

input, textarea { 
  width: 100%; 
  padding: 10px; 
  margin-bottom: 8px; 
  background: rgba(255,255,255,0.04); 
  border: 1px solid rgba(255,255,255,0.1); 
  border-radius: 8px; 
  color: #fff; 
  font-size: 12px; 
  outline: none; 
}
input:focus, textarea:focus { border-color: #ff2a6d; }

button { 
  width: 100%; 
  padding: 10px; 
  background: linear-gradient(135deg, #ff2a6d, #7928ca); 
  border: none; 
  border-radius: 8px; 
  color: #fff; 
  font-weight: 700; 
  cursor: pointer; 
  font-size: 12px; 
  transition: opacity 0.2s;
}
button:active { transform: scale(0.98); }
button:hover { opacity: 0.9; }

.plans-box { display: none; margin-top: 8px; padding: 8px; background: rgba(255,42,109,0.08); border-radius: 8px; border: 1px solid #ff2a6d; }
.plan-opt { display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 4px; cursor: pointer; }
.hidden { display: none !important; }

.os-dock { 
  display: flex; 
  justify-content: space-between; 
  align-items: center;
  background: rgba(255,255,255,0.03); 
  padding: 8px 12px; 
  border-radius: 10px; 
  margin-bottom: 12px; 
  font-size: 11px; 
  font-weight: 600; 
  border: 1px solid rgba(255,255,255,0.06); 
}
.os-nav-items { display: flex; gap: 6px; }
.os-dock span { cursor: pointer; padding: 4px 10px; border-radius: 6px; transition: 0.2s; }
.os-dock span:hover { background: rgba(255,42,109,0.2); color: #05d9e8; }
.logout-btn { background: rgba(255, 42, 109, 0.2); color: #ff2a6d; border: 1px solid rgba(255, 42, 109, 0.4); padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 10px; font-weight: 700; width: auto !important; }
.logout-btn:hover { background: rgba(255, 42, 109, 0.4); color: #fff; }

.space-section { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; }
.post-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 10px; border-radius: 8px; margin-bottom: 8px; }
.post-img-preview { max-width: 100%; max-height: 200px; border-radius: 6px; margin-top: 6px; object-fit: cover; display: block; }
</style>
</head>
<body>

<!-- Canvas for Moving Neon Red Dots -->
<canvas id="bgCanvas"></canvas>

<div class="container">
  <h1>SEXCITES.COM</h1>
  <div class="counter-banner" id="counterBanner">Verifying system and network...</div>

  <!-- AUTHENTICATION / REGISTRATION -->
  <div id="authSection">
    <div style="font-size: 12px; font-weight: 700; color: #ff2a6d; margin-bottom: 6px;">🛡️ Cloud OS Registration (IP Anti-Multi-Account)</div>
    <input type="text" id="regUser" placeholder="Username (e.g., jhon)" autocomplete="off">
    <input type="password" id="regPass" placeholder="Secure Password" autocomplete="off">
    
    <div id="plansContainer" class="plans-box">
      <div style="font-size: 11px; color: #ff2a6d; font-weight: 700; margin-bottom: 4px;">Limit of 500 reached. Choose your launch plan:</div>
      <label class="plan-opt"><input type="radio" name="launchPlan" value="6m" checked> 6 Months — $15.99 USD</label>
      <label class="plan-opt"><input type="radio" name="launchPlan" value="12m"> 12 Months — $28.99 USD</label>
    </div>

    <button onclick="registerUser()" style="margin-top: 6px;">Create Account</button>
    <div style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 10px; cursor: pointer;" onclick="toggleAuthMode()">Already registered? Sign In</div>
  </div>

  <!-- LOGIN SECTION -->
  <div id="loginSection" class="hidden">
    <div style="font-size: 12px; font-weight: 700; color: #05d9e8; margin-bottom: 6px;">🔐 System Login</div>
    <input type="text" id="logUser" placeholder="Username" autocomplete="off">
    <input type="password" id="logPass" placeholder="Password" autocomplete="off">
    <button onclick="loginUser()">Enter OS</button>
    <div style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 10px; cursor: pointer;" onclick="toggleAuthMode()">No account? Register here</div>
  </div>

  <div id="authAlert" style="color: #f87171; font-size: 11px; text-align: center; margin-top: 6px; font-weight: 600;"></div>

  <!-- DESKTOP / OS SPACES -->
  <div id="appSection" class="hidden">
    <div class="os-dock">
      <div class="os-nav-items">
        <span onclick="switchSpace('wall')">🌐 Global Wall</span>
        <span onclick="switchSpace('chat')">💬 Direct Chat</span>
        <span onclick="switchSpace('friends')">👥 Friends</span>
      </div>
      <button class="logout-btn" onclick="logoutUser()">Log Out</button>
    </div>

    <!-- SPACE 1: GLOBAL WALL (WITH REAL-TIME PHOTO PUBLISHING) -->
    <div id="spaceWall" class="space-section">
      <textarea id="postText" placeholder="What's happening in your space?" style="height: 50px; font-size: 11px;"></textarea>
      
      <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 8px;">
        <input type="file" id="postImageFile" accept="image/*" style="display: none;" onchange="handleImagePreview(event)">
        <button type="button" onclick="document.getElementById('postImageFile').click()" style="width: auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); font-size: 10px; padding: 6px 10px;">📷 Attach Photo</button>
        <span id="imgFileName" style="font-size: 10px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">No photo selected</span>
      </div>
      <div id="imagePreviewContainer" class="hidden" style="position: relative; margin-bottom: 8px;">
        <img id="imagePreviewElement" style="max-height: 100px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
        <button onclick="clearImageSelection()" style="width: auto; padding: 2px 6px; font-size: 9px; background: #ff2a6d; margin-top: 4px;">Remove Photo</button>
      </div>

      <button onclick="createPost()" style="margin-bottom: 10px; font-size: 11px; padding: 6px;">Publish to Wall</button>
      <div id="wallFeed" style="display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto;"></div>
    </div>

    <!-- SPACE 2: PRIVATE CHAT -->
    <div id="spaceChat" class="space-section hidden">
      <div style="display: flex; gap: 4px; margin-bottom: 6px;">
        <input type="text" id="chatTarget" placeholder="Exact username..." style="margin:0; font-size: 10px;" autocomplete="off">
        <button onclick="loadChatHistory()" style="width: 90px; margin:0; font-size: 10px; padding: 6px;">Open Chat</button>
      </div>
      <div id="chatBox" style="background: rgba(0,0,0,0.5); border-radius: 6px; height: 180px; padding: 6px; overflow-y: auto; font-size: 10px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.04);">
        <div style="color: #64748b; text-align: center; padding-top: 50px;">Enter the exact username to chat instantly.</div>
      </div>
      <div style="display: flex; gap: 4px;">
        <input type="text" id="msgInput" placeholder="Message..." style="margin:0; font-size: 10px;" autocomplete="off">
        <button onclick="sendChatMessage()" style="width: 65px; margin:0; font-size: 10px; padding: 6px;">Send</button>
      </div>
    </div>

    <!-- SPACE 3: FRIENDS NETWORK -->
    <div id="spaceFriends" class="space-section hidden">
      <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 4px;">Send connection request:</div>
      <input type="text" id="friendUser" placeholder="Exact username..." style="font-size: 10px;" autocomplete="off">
      <button onclick="sendFriendRequest()" style="font-size: 10px; padding: 6px;">Send Request</button>
      <div id="friendNotifs" style="margin-top: 8px; font-size: 10px; display: flex; flex-direction: column; gap: 4px;"></div>
    </div>
  </div>
</div>

<script>
// --- NEON RED ANIMATED BACKGROUND PARTICLES ---
const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');

let particles = [];
const particleCount = 45;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

for (let i = 0; i < particleCount; i++) {
  particles.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: Math.random() * 2 + 1,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6
  });
}

function animateBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 42, 109, 0.7)';
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#ff2a6d';

  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0) p.x = canvas.width;
    if (p.x > canvas.width) p.x = 0;
    if (p.y < 0) p.y = canvas.height;
    if (p.y > canvas.height) p.y = 0;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // Connect close dots with subtle neon red lines
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      let dx = particles[i].x - particles[j].x;
      let dy = particles[i].y - particles[j].y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        ctx.strokeStyle = \`rgba(255, 42, 109, \${0.15 * (1 - dist / 100)})\`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(animateBackground);
}
animateBackground();

// --- APP LOGIC ---
const socket = io();
let currentUser = null;
let currentChatPeer = null;
let base64Image = null;

fetch('/api/init-data').then(res => res.json()).then(data => {
  updateCounterBanner(data.totalUsers);
});

socket.on('stats:update', (data) => {
  updateCounterBanner(data.totalUsers);
});

function updateCounterBanner(total) {
  const banner = document.getElementById('counterBanner');
  const plansContainer = document.getElementById('plansContainer');
  if (total < 500) {
    banner.innerHTML = \`🎉 Cloud OS Launch: <b>\${500 - total}</b> free accounts remaining (2 months).\`;
    plansContainer.classList.add('hidden');
  } else {
    banner.innerHTML = \`⚠️ Limit of 500 free accounts reached. Please choose your paid plan.\`;
    plansContainer.classList.remove('hidden');
  }
}

function toggleAuthMode() {
  document.getElementById('authSection').classList.toggle('hidden');
  document.getElementById('loginSection').classList.toggle('hidden');
  document.getElementById('authAlert').innerText = '';
}

function switchSpace(space) {
  ['Wall', 'Chat', 'Friends'].forEach(s => {
    document.getElementById('space' + s).classList.add('hidden');
  });
  document.getElementById('space' + space.charAt(0).toUpperCase() + space.slice(1)).classList.remove('hidden');
}

async function registerUser() {
  const username = document.getElementById('regUser').value;
  const password = document.getElementById('regPass').value;
  const selectedPlan = document.querySelector('input[name="launchPlan"]:checked');
  const plan = selectedPlan ? selectedPlan.value : null;

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, plan })
  });
  const data = await res.json();
  if (data.success) {
    bootOS(data.user);
  } else {
    document.getElementById('authAlert').innerText = data.error;
  }
}

async function loginUser() {
  const username = document.getElementById('logUser').value;
  const password = document.getElementById('logPass').value;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.success) {
    bootOS(data.user);
  } else {
    document.getElementById('authAlert').innerText = data.error;
  }
}

function logoutUser() {
  currentUser = null;
  currentChatPeer = null;
  document.getElementById('appSection').classList.add('hidden');
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('counterBanner').classList.remove('hidden');
  document.getElementById('logUser').value = '';
  document.getElementById('logPass').value = '';
}

function bootOS(user) {
  currentUser = user;
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('authAlert').classList.add('hidden');
  document.getElementById('counterBanner').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  
  socket.emit('join', user.username);
  loadInitialWall();
}

async function loadInitialWall() {
  const res = await fetch('/api/init-data?username=' + currentUser.username);
  const data = await res.json();
  renderWallPosts(data.posts);
}

function handleImagePreview(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  document.getElementById('imgFileName').innerText = file.name;
  const reader = new FileReader();
  reader.onload = function(e) {
    base64Image = e.target.result;
    document.getElementById('imagePreviewElement').src = base64Image;
    document.getElementById('imagePreviewContainer').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearImageSelection() {
  base64Image = null;
  document.getElementById('postImageFile').value = '';
  document.getElementById('imgFileName').innerText = 'No photo selected';
  document.getElementById('imagePreviewContainer').classList.add('hidden');
}

function createPost() {
  const text = document.getElementById('postText').value;
  if (!text && !base64Image) return alert('Please enter text or attach an image.');
  
  socket.emit('post:create', { author: currentUser.username, text, image: base64Image });
  document.getElementById('postText').value = '';
  clearImageSelection();
}

socket.on('post:new', (post) => {
  appendPostToDOM(post);
});

function renderWallPosts(posts) {
  const feed = document.getElementById('wallFeed');
  feed.innerHTML = '';
  posts.forEach(p => appendPostToDOM(p, true));
}

function appendPostToDOM(p, prepend = false) {
  const feed = document.getElementById('wallFeed');
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = 'post_' + p.id;

  let imageHtml = p.image ? \`<img src="\${p.image}" class="post-img-preview">\` : '';

  let commentsHtml = \`<div id="comm_list_\${p.id}" style="margin-top:4px; padding-left:6px; border-left:2px solid #ff2a6d; display:flex; flex-direction:column; gap:3px;">\`;
  if (p.comments) {
    p.comments.forEach(c => {
      commentsHtml += \`<div><b style="color:#05d9e8;">@\${c.author}:</b> \${c.text}</div>\`;
    });
  }
  commentsHtml += '</div>';

  div.innerHTML = \`<b style="color:#ff2a6d; font-size:11px;">@\${p.author}</b>
                   \${p.text ? \`<p style="color:#e2e8f0; margin-top:2px; font-size:11px;">\${p.text}</p>\` : ''}
                   \${imageHtml}
                   <div style="display:flex; gap:10px; margin-top:6px; align-items:center;">
                     <button onclick="toggleLike('\${p.id}')" style="width:auto; background:none; border:none; color:\${p.userHasLiked ? '#ff2a6d':'#94a3b8'}; cursor:pointer; font-size:10px;">❤️ <span id="likes_\${p.id}">\${p.likesCount}</span></button>
                   </div>
                   \${commentsHtml}
                   <div style="display:flex; gap:4px; margin-top:4px;">
                     <input type="text" id="comm_txt_\${p.id}" placeholder="Comment..." style="margin:0; font-size:9px; padding:4px;" autocomplete="off">
                     <button onclick="sendComment('\${p.id}')" style="width:55px; margin:0; padding:4px; font-size:9px;">Send</button>
                   </div>\`;

  if (prepend) feed.appendChild(div);
  else feed.insertBefore(div, feed.firstChild);
}

function toggleLike(postId) {
  socket.emit('post:like', { postId, username: currentUser.username });
}

socket.on('post:liked', (data) => {
  const span = document.getElementById('likes_' + data.postId);
  if (span) span.innerText = data.likesCount;
});

function sendComment(postId) {
  const input = document.getElementById('comm_txt_' + postId);
  const text = input.value;
  if (!text) return;
  socket.emit('post:comment', { postId, author: currentUser.username, text });
  input.value = '';
}

socket.on('post:commented', (data) => {
  const list = document.getElementById('comm_list_' + data.postId);
  if (list) {
    list.innerHTML += \`<div><b style="color:#05d9e8;">@\${data.comment.author}:</b> \${data.comment.text}</div>\`;
  }
});

function loadChatHistory() {
  const peer = document.getElementById('chatTarget').value;
  if (!peer) return alert('Please enter a username.');
  currentChatPeer = peer.trim().toLowerCase().replace('@', '');
  socket.emit('chat:load', { user1: currentUser.username, user2: currentChatPeer });
}

socket.on('chat:history-loaded', (data) => {
  const box = document.getElementById('chatBox');
  box.innerHTML = '';
  if (data.history.length === 0) {
    box.innerHTML = \`<div style="color:#64748b; text-align:center;">Start a conversation with @\${data.peer}</div>\`;
    return;
  }
  data.history.forEach(m => appendMsgToChat(m));
  box.scrollTop = box.scrollHeight;
});

function sendChatMessage() {
  const text = document.getElementById('msgInput').value;
  if (!currentChatPeer || !text) return alert('Select a valid user and type a message.');
  socket.emit('chat:message', { sender: currentUser.username, recipient: currentChatPeer, text });
  document.getElementById('msgInput').value = '';
}

socket.on('chat:incoming', (msg) => {
  if (currentChatPeer && (msg.sender === currentChatPeer || msg.sender === currentUser.username)) {
    appendMsgToChat(msg);
  }
});

function appendMsgToChat(m) {
  const box = document.getElementById('chatBox');
  const isMe = m.sender === currentUser.username;
  box.innerHTML += \`<div style="margin-bottom:3px;"><b style="color:\${isMe ? '#05d9e8' : '#ff2a6d'};">@\${m.sender}:</b> \${m.text}</div>\`;
  box.scrollTop = box.scrollHeight;
}

function sendFriendRequest() {
  const target = document.getElementById('friendUser').value;
  socket.emit('friend:request', { sender: currentUser.username, target });
  document.getElementById('friendUser').value = '';
}

socket.on('friend:request-received', (data) => {
  document.getElementById('friendNotifs').innerHTML += \`<div style="background:rgba(255,255,255,0.03); padding:4px; border-radius:4px;">Request from: <b>@\${data.sender}</b></div>\`;
});

socket.on('error-msg', (data) => { alert(data.message); });
socket.on('success-msg', (data) => { alert(data.message); });
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('SEXCITES.COM Cloud OS active on port ' + PORT);
});
