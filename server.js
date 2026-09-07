const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

// ==========================================
// BASE DE DATOS PERSISTENTE (JSON LOCAL)
// ==========================================
const DB_FILE = path.join(__dirname, 'database.json');

let db = {
  users: {},
  posts: [],
  chats: {},
  requests: {}
};

if (fs.existsSync(DB_FILE)) {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(data);
  } catch(e) {
    console.log('Iniciando nueva base de datos.');
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const antiSpamChat = new Map();

function getChatId(u1, u2) {
  return u1 < u2 ? u1 + '_' + u2 : u2 + '_' + u1;
}

// ==========================================
// API REST (REGISTRO Y LOGIN REAL)
// ==========================================
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || username.trim().length < 3 || !password || password.trim().length < 4) {
    return res.json({ success: false, error: 'El usuario (min 3 chars) y contraseña (min 4 chars) son obligatorios.' });
  }

  const cleanUser = username.trim().toLowerCase().replace('@', '');
  if (db.users[cleanUser]) {
    return res.json({ success: false, error: 'Este nombre de usuario ya está en uso.' });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    username: cleanUser,
    password: password,
    createdAt: Date.now()
  };

  db.users[cleanUser] = newUser;
  db.requests[cleanUser] = {};
  saveDB();

  res.json({ success: true, user: newUser });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const cleanUser = (username || '').trim().toLowerCase().replace('@', '');

  const user = db.users[cleanUser];
  if (!user || user.password !== password) {
    return res.json({ success: false, error: 'Usuario o contraseña incorrectos.' });
  }

  res.json({ success: true, user });
});

app.get('/api/posts', (req, res) => {
  const currentUsername = req.query.username || '';
  const formatted = db.posts.map(p => ({
    ...p,
    likesCount: p.likes.length,
    userHasLiked: p.likes.includes(currentUsername)
  }));
  res.json({ success: true, posts: formatted });
});

// ==========================================
// MOTOR EN TIEMPO REAL (SOCKET.IO)
// ==========================================
io.on('connection', (socket) => {
  socket.on('join', (username) => {
    socket.join(username);
  });

  socket.on('friend:request', (data) => {
    const { sender, target } = data;
    const cleanTarget = (target || '').trim().toLowerCase().replace('@', '');

    if (!db.users[cleanTarget] || cleanTarget === sender) {
      socket.emit('error-msg', { message: 'El usuario no existe o acción inválida.' });
      return;
    }

    if (!db.requests[cleanTarget]) db.requests[cleanTarget] = {};
    db.requests[cleanTarget][sender] = true;
    saveDB();

    io.to(cleanTarget).emit('friend:request-received', { sender });
    socket.emit('success-msg', { message: 'Solicitud enviada a @' + cleanTarget });
  });

  socket.on('chat:message', (data) => {
    const { sender, recipient, text, type } = data;
    if (!text || !db.users[recipient]) return;

    const last = antiSpamChat.get(sender) || 0;
    const now = Date.now();
    if (now - last < 250) {
      socket.emit('error-msg', { message: 'Por favor, espera un momento.' });
      return;
    }
    antiSpamChat.set(sender, now);

    const chatId = getChatId(sender, recipient);
    if (!db.chats[chatId]) db.chats[chatId] = [];

    const msgObj = { sender, text: text.trim(), type: type || 'text', timestamp: now };
    db.chats[chatId].push(msgObj);
    saveDB();

    io.to(recipient).emit('chat:incoming', msgObj);
    io.to(sender).emit('chat:incoming', msgObj);
  });

  socket.on('chat:load', (data) => {
    const { user1, user2 } = data;
    const chatId = getChatId(user1, user2);
    const history = db.chats[chatId] || [];
    socket.emit('chat:history-loaded', { history, peer: user2 });
  });

  socket.on('post:create', (data) => {
    const { author, text, image } = data;
    if (!text && !image) return;

    const newPost = {
      id: 'post_' + Date.now(),
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
    if (idx === -1) {
      post.likes.push(username);
    } else {
      post.likes.splice(idx, 1);
    }
    saveDB();

    io.emit('post:liked', { postId, likesCount: post.likes.length });
  });

  socket.on('post:comment', (data) => {
    const { postId, author, text, image } = data;
    const post = db.posts.find(p => p.id === postId);
    if (!post || (!text && !image)) return;

    const comment = {
      id: 'comm_' + Date.now(),
      author,
      text: text ? text.trim() : '',
      image: image || null,
      timestamp: Date.now()
    };

    post.comments.push(comment);
    saveDB();

    io.emit('post:commented', { postId, comment });
  });
});

// ==========================================
// INTERFAZ FRONT-END (SEXCITES.COM)
// ==========================================
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Plataforma Activa 24/7</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; user-select: none; }
body, html { width: 100%; height: 100%; overflow: hidden; background: #030006; color: #fff; }

.animated-bg {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: linear-gradient(135deg, #070112, #1c0733, #030006, #2b0222);
  background-size: 400% 400%;
  animation: bgMove 14s ease infinite;
  z-index: -2;
}
@keyframes bgMove {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.glow-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background-image: radial-gradient(rgba(255, 42, 109, 0.12) 1px, transparent 1px), radial-gradient(rgba(5, 217, 232, 0.08) 1px, transparent 1px);
  background-size: 36px 36px; background-position: 0 0, 18px 18px;
  z-index: -1;
}

#authScreen {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; justify-content: center; align-items: center;
  background: rgba(3, 0, 6, 0.9); backdrop-filter: blur(25px);
  z-index: 9999; transition: opacity 0.4s ease;
}
.auth-box {
  width: 380px; background: rgba(18, 10, 32, 0.85);
  border: 1px solid rgba(255, 42, 109, 0.4); border-radius: 22px;
  padding: 30px; box-shadow: 0 25px 80px rgba(0,0,0,0.9); text-align: center;
}
.auth-box h1 {
  font-size: 26px; background: linear-gradient(90deg, #ff2a6d, #05d9e8);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px;
}
.auth-box p { font-size: 11px; color: #a5b4fc; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 22px; }
input, textarea { width: 100%; padding: 13px; margin-bottom: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; color: #fff; font-size: 13px; outline: none; }
input:focus, textarea:focus { border-color: #ff2a6d; background: rgba(255,255,255,0.08); }
button.btn-main { width: 100%; padding: 13px; background: linear-gradient(135deg, #ff2a6d, #7928ca); border: none; border-radius: 12px; color: white; font-weight: 700; font-size: 13px; cursor: pointer; }
button.btn-main:active { transform: scale(0.97); }
.switch-text { margin-top: 14px; font-size: 12px; color: #cbd5e1; cursor: pointer; }
.switch-text span { color: #05d9e8; font-weight: 600; text-decoration: underline; }

#appWorkspace {
  width: 100%; height: 100%; display: flex; flex-direction: column;
  opacity: 0; pointer-events: none; transition: opacity 0.5s ease;
}
#appWorkspace.active { opacity: 1; pointer-events: auto; }

.top-bar {
  height: 46px; background: rgba(12, 6, 24, 0.75); backdrop-filter: blur(15px);
  border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; padding: 0 20px;
}
.brand-title { font-weight: 700; font-size: 15px; background: linear-gradient(90deg, #ff2a6d, #05d9e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

.main-container { flex: 1; display: flex; justify-content: center; align-items: center; padding: 15px; overflow: hidden; }

.panel-card {
  width: 100%; max-width: 520px; height: 84vh;
  background: rgba(14, 7, 26, 0.85); backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.85); display: flex; flex-direction: column; overflow: hidden;
}

.panel-header {
  height: 42px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 12px; font-weight: 600; color: #cbd5e1;
}

.panel-body { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; }

.nav-dock {
  height: 65px; background: rgba(12, 6, 24, 0.75); backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: center; align-items: center; gap: 16px;
}
.dock-btn {
  width: 44px; height: 44px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 18px; transition: 0.2s;
}
.dock-btn:hover { background: rgba(255,42,109,0.25); border-color: #ff2a6d; transform: translateY(-3px); }
.dock-btn.active { background: rgba(5,217,232,0.25); border-color: #05d9e8; }

.hidden { display: none !important; }
</style>
</head>
<body>

<div class="animated-bg"></div>
<div class="glow-overlay"></div>

<div id="authScreen">
  <div class="auth-box">
    <h1>SEXCITES.COM</h1>
    <p>Plataforma Social en Vivo</p>

    <div id="regSpace">
      <div style="font-size:12px; color:#05d9e8; margin-bottom:8px; font-weight:700;">📝 Crear Nueva Cuenta</div>
      <input type="text" id="rUser" placeholder="Usuario (mín. 3 caracteres)" autocomplete="off">
      <input type="password" id="rPass" placeholder="Contraseña (mín. 4 caracteres)" autocomplete="off">
      <button class="btn-main" onclick="registerUser()">Registrarse</button>
      <div class="switch-text">¿Ya tienes cuenta? <span onclick="toggleAuth('login')">Inicia sesión aquí</span></div>
    </div>

    <div id="logSpace" class="hidden">
      <div style="font-size:12px; color:#ff2a6d; margin-bottom:8px; font-weight:700;">🔐 Acceso de Miembros</div>
      <input type="text" id="lUser" placeholder="Usuario" autocomplete="off">
      <input type="password" id="lPass" placeholder="Contraseña" autocomplete="off">
      <button class="btn-main" onclick="loginUser()">Entrar a SEXCITES</button>
      <div class="switch-text">¿Nuevo usuario? <span onclick="toggleAuth('register')">Crea una cuenta</span></div>
    </div>

    <div id="authError" style="color:#f87171; font-size:11px; margin-top:10px; font-weight:600;"></div>
  </div>
</div>

<div id="appWorkspace">
  <div class="top-bar">
    <div class="brand-title">SEXCITES.COM</div>
    <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
      <span id="userDisplay" style="color:#05d9e8; font-weight:700;"></span>
      <span style="background:rgba(34,197,94,0.2); color:#4ade80; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;">● ACTIVO 24/7</span>
    </div>
  </div>

  <div class="main-container">
    <div class="panel-card" id="panelWall">
      <div class="panel-header">
        <span>Muro Público y Fotos</span>
        <span>🌐</span>
      </div>
      <div class="panel-body">
        <textarea id="wallText" placeholder="Comparte fotos, pensamientos o actualizaciones..." style="height:55px; font-size:12px; margin-bottom:6px;"></textarea>
        <div style="display:flex; gap:6px; margin-bottom:10px;">
          <input type="file" id="wallImg" accept="image/*" style="display:none;" onchange="previewWallImg(event)">
          <button class="btn-main" onclick="document.getElementById('wallImg').click()" style="width:auto; padding:6px 12px; background:#334155; font-size:11px;">📷 Foto</button>
          <button class="btn-main" onclick="createPost()" style="font-size:11px; flex:1;">Publicar</button>
        </div>
        <div id="wallFeed" style="flex:1; overflow-y:auto; font-size:11px; display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    </div>

    <div class="panel-card hidden" id="panelChat">
      <div class="panel-header">
        <span>Chat Privado Seguro</span>
        <span>💬</span>
      </div>
      <div class="panel-body">
        <div style="display:flex; gap:6px; margin-bottom:6px;">
          <input type="text" id="chatPeer" placeholder="Usuario amigo..." style="margin:0; font-size:11px;" autocomplete="off">
          <button class="btn-main" onclick="loadChat()" style="width:90px; margin:0; font-size:11px;">Abrir Chat</button>
        </div>
        <div id="chatBox" style="flex:1; background:rgba(0,0,0,0.5); border-radius:10px; padding:8px; overflow-y:auto; font-size:11px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:#64748b; text-align:center; padding-top:60px;">Introduce un usuario arriba para cargar el historial permanente.</div>
        </div>
        <div style="display:flex; gap:6px;">
          <input type="text" id="msgText" placeholder="Escribe un mensaje privado..." style="margin:0; font-size:11px;" autocomplete="off">
          <input type="file" id="chatImg" accept="image/*" style="display:none;" onchange="sendChatPhoto(event)">
          <button class="btn-main" onclick="document.getElementById('chatImg').click()" style="width:38px; margin:0; background:#334155;" title="Foto">📷</button>
          <button class="btn-main" onclick="sendChatMessage()" style="width:65px; margin:0; font-size:11px;">Enviar</button>
        </div>
      </div>
    </div>

    <div class="panel-card hidden" id="panelFriends">
      <div class="panel-header">
        <span>Conexiones y Solicitudes</span>
        <span>👥</span>
      </div>
      <div class="panel-body">
        <input type="text" id="friendInput" placeholder="Usuario de tu amigo..." style="font-size:11px;" autocomplete="off">
        <button class="btn-main" onclick="sendFriendReq()" style="font-size:11px;">Enviar Solicitud</button>
        <div id="friendNotifs" style="margin-top:12px; font-size:11px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
    </div>
  </div>

  <div class="nav-dock">
    <div class="dock-btn active" onclick="switchPanel('Wall')" title="Muro">🌐</div>
    <div class="dock-btn" onclick="switchPanel('Chat')" title="Chat">💬</div>
    <div class="dock-btn" onclick="switchPanel('Friends')" title="Amigos">👥</div>
  </div>
</div>

<script>
const socket = io();
let currentUser = null;
let currentPeer = null;
let wallImageBase64 = null;

function toggleAuth(mode) {
  document.getElementById('authError').innerText = '';
  if(mode === 'login') {
    document.getElementById('regSpace').classList.add('hidden');
    document.getElementById('logSpace').classList.remove('hidden');
  } else {
    document.getElementById('logSpace').classList.add('hidden');
    document.getElementById('regSpace').classList.remove('hidden');
  }
}

function switchPanel(panelName) {
  ['Wall', 'Chat', 'Friends'].forEach(p => {
    document.getElementById('panel' + p).classList.add('hidden');
  });
  document.getElementById('panel' + panelName).classList.remove('hidden');
  document.querySelectorAll('.dock-btn').forEach(btn => btn.classList.remove('active'));
  event.currentTarget.classList.add('active');
}

async function registerUser() {
  const username = document.getElementById('rUser').value;
  const password = document.getElementById('rPass').value;
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if(data.success) {
    startSession(data.user);
  } else {
    document.getElementById('authError').innerText = data.error;
  }
}

async function loginUser() {
  const username = document.getElementById('lUser').value;
  const password = document.getElementById('lPass').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if(data.success) {
    startSession(data.user);
  } else {
    document.getElementById('authError').innerText = data.error;
  }
}

function startSession(user) {
  currentUser = user;
  document.getElementById('authScreen').style.opacity = '0';
  setTimeout(() => {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appWorkspace').classList.add('active');
    document.getElementById('userDisplay').innerText = '@' + user.username;
    socket.emit('join', user.username);
    loadWallPosts();
  }, 400);
}

function previewWallImg(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) { wallImageBase64 = evt.target.result; alert('Foto adjuntada correctamente.'); };
  reader.readAsDataURL(file);
}

function createPost() {
  const text = document.getElementById('wallText').value;
  if(!text && !wallImageBase64) return alert('Escribe algo o adjunta una foto.');
  socket.emit('post:create', { author: currentUser.username, text, image: wallImageBase64 });
  document.getElementById('wallText').value = '';
  wallImageBase64 = null;
}

async function loadWallPosts() {
  const res = await fetch('/api/posts?username=' + currentUser.username);
  const data = await res.json();
  const feed = document.getElementById('wallFeed');
  feed.innerHTML = '';
  if(data.success) {
    data.posts.forEach(p => renderPost(p));
  }
}

socket.on('post:new', (post) => {
  renderPost(post);
});

function renderPost(p) {
  const feed = document.getElementById('wallFeed');
  const div = document.createElement('div');
  div.style.cssText = "background:rgba(255,255,255,0.03); padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.06);";
  
  let imgHtml = p.image ? '<br><img src="' + p.image + '" style="max-width:100%; border-radius:8px; margin-top:6px;">' : '';
  let likeColor = p.userHasLiked ? '#ff2a6d' : '#94a3b8';

  let commentsHtml = '<div id="comm_list_' + p.id + '" style="margin-top:8px; padding-left:10px; border-left:2px solid #ff2a6d; display:flex; flex-direction:column; gap:4px;">';
  if(p.comments) {
    p.comments.forEach(c => {
      let cImg = c.image ? '<br><img src="' + c.image + '" style="max-width:90px; border-radius:4px;">' : '';
      commentsHtml += '<div><b style="color:#05d9e8;">@' + c.author + ':</b> ' + c.text + cImg + '</div>';
    });
  }
  commentsHtml += '</div>';

  div.innerHTML = '<b style="color:#ff2a6d;">@' + p.author + '</b>' +
                  '<p style="color:#e2e8f0; margin-top:4px;">' + p.text + '</p>' + imgHtml +
                  '<div style="display:flex; gap:16px; margin-top:8px; align-items:center;">' +
                    '<button onclick="toggleLike(\x27' + p.id + '\x27)" style="width:auto; background:none; border:none; color:' + likeColor + '; cursor:pointer; font-size:11px;">❤️ <span id="likes_' + p.id + '">' + p.likesCount + '</span></button>' +
                    '<button onclick="sharePost(\x27' + p.id + '\x27)" style="width:auto; background:none; border:none; color:#05d9e8; cursor:pointer; font-size:11px;">🔗 Compartir</button>' +
                  '</div>' +
                  commentsHtml +
                  '<div style="display:flex; gap:6px; margin-top:8px;">' +
                    '<input type="text" id="comm_txt_' + p.id + '" placeholder="Escribe un comentario..." style="margin:0; font-size:10px; padding:6px;">' +
                    '<button class="btn-main" onclick="sendComment(\x27' + p.id + '\x27)" style="width:60px; margin:0; padding:6px; font-size:10px;">Responder</button>' +
                  '</div>';
  feed.prepend(div);
}

function toggleLike(postId) {
  socket.emit('post:like', { postId, username: currentUser.username });
}

socket.on('post:liked', (data) => {
  const span = document.getElementById('likes_' + data.postId);
  if(span) span.innerText = data.likesCount;
});

function sharePost(postId) {
  navigator.clipboard.writeText(window.location.origin + '#post-' + postId);
  alert('Enlace del post copiado al portapapeles.');
}

function sendComment(postId) {
  const txtInput = document.getElementById('comm_txt_' + postId);
  const text = txtInput.value;
  if(!text) return;
  socket.emit('post:comment', { postId, author: currentUser.username, text, image: null });
  txtInput.value = '';
}

socket.on('post:commented', (data) => {
  const list = document.getElementById('comm_list_' + data.postId);
  if(list) {
    list.innerHTML += '<div><b style="color:#05d9e8;">@' + data.comment.author + ':</b> ' + data.comment.text + '</div>';
  }
});

function loadChat() {
  const peer = document.getElementById('chatPeer').value.trim().toLowerCase().replace('@','');
  if(!peer) return alert('Introduce un usuario válido.');
  currentPeer = peer;
  socket.emit('chat:load', { user1: currentUser.username, user2: peer });
}

socket.on('chat:history-loaded', (data) => {
  const box = document.getElementById('chatBox');
  box.innerHTML = '';
  if(data.history.length === 0) {
    box.innerHTML = '<div style="color:#64748b; text-align:center;">Aún no hay historial con @' + data.peer + '</div>';
    return;
  }
  data.history.forEach(m => renderMsg(m));
  box.scrollTop = box.scrollHeight;
});

function sendChatMessage() {
  const text = document.getElementById('msgText').value;
  if(!currentPeer || !text) return alert('Abre un chat activo primero.');
  socket.emit('chat:message', { sender: currentUser.username, recipient: currentPeer, text, type: 'text' });
  document.getElementById('msgText').value = '';
}

function sendChatPhoto(e) {
  const file = e.target.files[0];
  if(!file || !currentPeer) return alert('Selecciona un destinatario de chat primero.');
  const reader = new FileReader();
  reader.onload = function(evt) {
    socket.emit('chat:message', { sender: currentUser.username, recipient: currentPeer, text: evt.target.result, type: 'image' });
  };
  reader.readAsDataURL(file);
}

socket.on('chat:incoming', (msg) => {
  if(currentPeer && (msg.sender === currentPeer || msg.sender === currentUser.username)) {
    renderMsg(msg);
  }
});

function renderMsg(m) {
  const box = document.getElementById('chatBox');
  const isMe = m.sender === currentUser.username;
  const color = isMe ? '#05d9e8' : '#ff2a6d';
  let content = m.text;
  if(m.type === 'image') {
    content = '<br><img src="' + m.text + '" style="max-width:140px; border-radius:6px; margin-top:4px;">';
  }
  box.innerHTML += '<div style="margin-bottom:6px;"><b style="color:' + color + ';">@' + m.sender + ':</b> ' + content + '</div>';
  box.scrollTop = box.scrollHeight;
}

function sendFriendReq() {
  const target = document.getElementById('friendInput').value;
  socket.emit('friend:request', { sender: currentUser.username, target });
  document.getElementById('friendInput').value = '';
}

socket.on('friend:request-received', (data) => {
  document.getElementById('friendNotifs').innerHTML += '<div style="background:rgba(255,255,255,0.04); padding:8px; border-radius:8px;">Solicitud de: <b>@' + data.sender + '</b></div>';
});

socket.on('error-msg', (data) => { alert(data.message); });
socket.on('success-msg', (data) => { alert(data.message); });
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('SEXCITES.COM activo en el puerto ' + PORT);
});
