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
    console.log('Iniciando nueva base de datos para SEXCITES.COM.');
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
// API REST (AUTENTICACIÓN Y DATOS)
// ==========================================
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || username.trim().length < 3 || !password || password.trim().length < 4) {
    return res.json({ success: false, error: 'Usuario (mín. 3 chars) y contraseña (mín. 4 chars) obligatorios.' });
  }

  const cleanUser = username.trim().toLowerCase().replace('@', '');
  if (db.users[cleanUser]) {
    return res.json({ success: false, error: 'Este nombre de usuario ya está registrado.' });
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
    return res.json({ success: false, error: 'Credenciales inválidas. Verifica tus datos.' });
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
      socket.emit('error-msg', { message: 'El usuario no existe o la acción no es válida.' });
      return;
    }

    if (!db.requests[cleanTarget]) db.requests[cleanTarget] = {};
    db.requests[cleanTarget][sender] = true;
    saveDB();

    io.to(cleanTarget).emit('friend:request-received', { sender });
    socket.emit('success-msg', { message: 'Solicitud enviada con éxito a @' + cleanTarget });
  });

  socket.on('chat:message', (data) => {
    const { sender, recipient, text, type } = data;
    if (!text || !db.users[recipient]) return;

    const last = antiSpamChat.get(sender) || 0;
    const now = Date.now();
    if (now - last < 250) {
      socket.emit('error-msg', { message: 'Protección anti-spam: Por favor espera un momento.' });
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
// INTERFAZ DE SISTEMA OPERATIVO WEB (SEXCITES.COM)
// ==========================================
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Sistema Operativo en Vivo</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; user-select: none; }
body, html { width: 100%; height: 100%; overflow: hidden; background: #020005; color: #fff; }

/* FONDO ANIMADO EXCLUSIVO INTERACTIVO */
.animated-bg {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: linear-gradient(125deg, #05020a, #1a062c, #020005, #22011f);
  background-size: 400% 400%;
  animation: gradientMotion 16s ease infinite;
  z-index: -2;
}
@keyframes gradientMotion {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.particles {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background-image: radial-gradient(rgba(255, 42, 109, 0.15) 1px, transparent 1px), radial-gradient(rgba(5, 217, 232, 0.1) 1px, transparent 1px);
  background-size: 40px 40px; background-position: 0 0, 20px 20px;
  z-index: -1;
  animation: particleShift 60s linear infinite;
}
@keyframes particleShift {
  from { background-position: 0 0, 20px 20px; }
  to { background-position: 1000px 1000px, 1020px 1020px; }
}

/* PANTALLA DE ACCESO / BLOQUEO (OS AUTH) */
#osLockScreen {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; justify-content: center; align-items: center;
  background: rgba(2, 0, 5, 0.88); backdrop-filter: blur(25px);
  z-index: 9999; transition: opacity 0.5s ease;
}
.lock-card {
  width: 390px; background: rgba(18, 10, 32, 0.8);
  border: 1px solid rgba(255, 42, 109, 0.35); border-radius: 24px;
  padding: 32px; box-shadow: 0 30px 90px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.1);
  text-align: center;
}
.lock-card h1 {
  font-size: 26px; background: linear-gradient(90deg, #ff2a6d, #05d9e8);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px; letter-spacing: 1px;
}
.lock-card p { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 24px; }
input, textarea { width: 100%; padding: 14px; margin-bottom: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; color: #fff; font-size: 13px; outline: none; transition: 0.3s; }
input:focus, textarea:focus { border-color: #ff2a6d; background: rgba(255,255,255,0.07); box-shadow: 0 0 15px rgba(255,42,109,0.2); }
button.os-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #ff2a6d, #7928ca); border: none; border-radius: 12px; color: white; font-weight: 700; font-size: 13px; cursor: pointer; transition: 0.2s; box-shadow: 0 10px 25px rgba(255,42,109,0.4); }
button.os-btn:active { transform: scale(0.97); }
.auth-switch { margin-top: 15px; font-size: 12px; color: #94a3b8; cursor: pointer; }
.auth-switch span { color: #05d9e8; font-weight: 600; text-decoration: underline; }

/* ENTORNO DE ESCRITORIO DEL SISTEMA OPERATIVO */
#osDesktop {
  width: 100%; height: 100%; display: flex; flex-direction: column;
  position: relative; opacity: 0; pointer-events: none; transition: opacity 0.6s ease;
}
#osDesktop.active { opacity: 1; pointer-events: auto; }

/* BARRA SUPERIOR DEL OS */
.os-topbar {
  height: 44px; background: rgba(10, 5, 20, 0.7); backdrop-filter: blur(15px);
  border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; padding: 0 20px; z-index: 100;
}
.os-logo { font-weight: 700; font-size: 14px; background: linear-gradient(90deg, #ff2a6d, #05d9e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.os-status { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #cbd5e1; }
.live-indicator { background: rgba(34,197,94,0.2); color: #4ade80; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; border: 1px solid rgba(34,197,94,0.3); }

/* ESPACIO DE TRABAJO Y VENTANAS FLOTANTES */
.os-workspace {
  flex: 1; position: relative; padding: 20px; overflow: hidden;
  display: flex; justify-content: center; align-items: center;
}

.os-window {
  width: 100%; max-width: 560px; height: 82vh;
  background: rgba(12, 6, 22, 0.85); backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px;
  box-shadow: 0 30px 70px rgba(0,0,0,0.85); display: flex; flex-direction: column; overflow: hidden; position: absolute;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
}

.window-header {
  height: 40px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 12px; font-weight: 600; color: #cbd5e1;
}
.window-dots { display: flex; gap: 6px; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot-red { background: #ff5f56; } .dot-yellow { background: #ffbd2e; } .dot-green { background: #27c93f; }

.window-content { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; }

/* DOCK INFERIOR DE NAVEGACIÓN */
.os-dock {
  height: 70px; background: rgba(10, 5, 20, 0.75); backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: center; align-items: center; gap: 14px; z-index: 100;
}
.dock-icon {
  width: 48px; height: 48px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
  display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 20px; transition: 0.2s;
}
.dock-icon:hover { transform: translateY(-5px) scale(1.08); background: rgba(255,42,109,0.2); border-color: #ff2a6d; box-shadow: 0 10px 20px rgba(255,42,109,0.3); }
.dock-icon.active { background: rgba(5,217,232,0.2); border-color: #05d9e8; }

.hidden { display: none !important; }
</style>
</head>
<body>

<div class="animated-bg"></div>
<div class="particles"></div>

<!-- PANTALLA DE BLOQUEO / AUTENTICACIÓN -->
<div id="osLockScreen">
  <div class="lock-card">
    <h1>SEXCITES.COM</h1>
    <p>Sistema Operativo Social</p>

    <div id="regSpace">
      <div style="font-size:12px; color:#05d9e8; margin-bottom:10px; font-weight:700;">✨ Registro de Nueva Cuenta</div>
      <input type="text" id="rUser" placeholder="Usuario (mín. 3 caracteres)" autocomplete="off">
      <input type="password" id="rPass" placeholder="Contraseña (mín. 4 caracteres)" autocomplete="off">
      <button class="os-btn" onclick="registerUser()">Crear Cuenta y Entrar</button>
      <div class="auth-switch">¿Ya tienes cuenta? <span onclick="toggleAuthMode('login')">Iniciar Sesión</span></div>
    </div>

    <div id="logSpace" class="hidden">
      <div style="font-size:12px; color:#ff2a6d; margin-bottom:10px; font-weight:700;">🔐 Acceso al Sistema</div>
      <input type="text" id="lUser" placeholder="Tu Usuario" autocomplete="off">
      <input type="password" id="lPass" placeholder="Tu Contraseña" autocomplete="off">
      <button class="os-btn" onclick="loginUser()">Entrar al Sistema Operativo</button>
      <div class="auth-switch">¿Nuevo en SEXCITES? <span onclick="toggleAuthMode('register')">Crear Perfil</span></div>
    </div>

    <div id="authAlert" style="color:#f87171; font-size:11px; margin-top:10px; font-weight:600;"></div>
  </div>
</div>

<!-- ENTORNO DE ESCRITORIO OS -->
<div id="osDesktop">
  <div class="os-topbar">
    <div class="os-logo">SEXCITES.COM // CLOUD OS</div>
    <div class="os-status">
      <span id="osUserDisplay" style="font-weight:700; color:#05d9e8;"></span>
      <span class="live-indicator">● EN VIVO 24/7</span>
    </div>
  </div>

  <div class="os-workspace">
    <!-- VENTANA DEL MURO / FEED -->
    <div class="os-window" id="appWall">
      <div class="window-header">
        <div class="window-dots"><div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div></div>
        <span>Muro y Publicaciones en Vivo</span>
        <span>🌐</span>
      </div>
      <div class="window-content">
        <textarea id="wallText" placeholder="Comparte algo con el ecosistema..." style="height:60px; font-size:12px; margin-bottom:8px;"></textarea>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <input type="file" id="wallImg" accept="image/*" style="display:none;" onchange="previewWallImg(event)">
          <button class="os-btn" onclick="document.getElementById('wallImg').click()" style="width:auto; padding:8px 14px; background:#334155; font-size:11px;">📷 Adjuntar Foto</button>
          <button class="os-btn" onclick="createPost()" style="font-size:11px; flex:1;">Publicar Ahora</button>
        </div>
        <div id="wallFeed" style="flex:1; overflow-y:auto; font-size:11px; display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    </div>

    <!-- VENTANA DE CHAT PRIVADO -->
    <div class="os-window hidden" id="appChat">
      <div class="window-header">
        <div class="window-dots"><div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div></div>
        <span>Mensajería Segura SEXCITES</span>
        <span>💬</span>
      </div>
      <div class="window-content">
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" id="chatPeer" placeholder="Usuario destino..." style="margin:0; font-size:11px;" autocomplete="off">
          <button class="os-btn" onclick="loadChat()" style="width:100px; margin:0; font-size:11px;">Abrir Chat</button>
        </div>
        <div id="chatBox" style="flex:1; background:rgba(0,0,0,0.45); border-radius:12px; padding:10px; overflow-y:auto; font-size:11px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:#64748b; text-align:center; padding-top:60px;">Introduce un usuario arriba para cargar el historial cifrado.</div>
        </div>
        <div style="display:flex; gap:6px;">
          <input type="text" id="msgText" placeholder="Escribe tu mensaje..." style="margin:0; font-size:11px;" autocomplete="off">
          <input type="file" id="chatImg" accept="image/*" style="display:none;" onchange="sendChatPhoto(event)">
          <button class="os-btn" onclick="document.getElementById('chatImg').click()" style="width:42px; margin:0; background:#334155;" title="Foto">📷</button>
          <button class="os-btn" onclick="sendChatMessage()" style="width:70px; margin:0; font-size:11px;">Enviar</button>
        </div>
      </div>
    </div>

    <!-- VENTANA DE AMIGOS / CONEXIONES -->
    <div class="os-window hidden" id="appFriends">
      <div class="window-header">
        <div class="window-dots"><div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div></div>
        <span>Red y Conexiones</span>
        <span>👥</span>
      </div>
      <div class="window-content">
        <input type="text" id="friendInput" placeholder="Nombre de usuario..." style="font-size:11px;" autocomplete="off">
        <button class="os-btn" onclick="sendFriendReq()" style="font-size:11px;">Enviar Solicitud de Amistad</button>
        <div id="friendNotifs" style="margin-top:12px; font-size:11px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
    </div>
  </div>

  <!-- DOCK DEL OS -->
  <div class="os-dock">
    <div class="dock-icon active" onclick="switchApp('Wall')" title="Muro Público">🌐</div>
    <div class="dock-icon" onclick="switchApp('Chat')" title="Chat Privado">💬</div>
    <div class="dock-icon" onclick="switchApp('Friends')" title="Conexiones">👥</div>
  </div>
</div>

<script>
const socket = io();
let currentUser = null;
let currentPeer = null;
let wallImageBase64 = null;

function toggleAuthMode(mode) {
  document.getElementById('authAlert').innerText = '';
  if(mode === 'login') {
    document.getElementById('regSpace').classList.add('hidden');
    document.getElementById('logSpace').classList.remove('hidden');
  } else {
    document.getElementById('logSpace').classList.add('hidden');
    document.getElementById('regSpace').classList.remove('hidden');
  }
}

function switchApp(appName) {
  ['Wall', 'Chat', 'Friends'].forEach(app => {
    document.getElementById('app' + app).classList.add('hidden');
  });
  document.getElementById('app' + appName).classList.remove('hidden');
  document.querySelectorAll('.dock-icon').forEach(icon => icon.classList.remove('active'));
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
    bootOS(data.user);
  } else {
    document.getElementById('authAlert').innerText = data.error;
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
    bootOS(data.user);
  } else {
    document.getElementById('authAlert').innerText = data.error;
  }
}

function bootOS(user) {
  currentUser = user;
  document.getElementById('osLockScreen').style.opacity = '0';
  setTimeout(() => {
    document.getElementById('osLockScreen').classList.add('hidden');
    document.getElementById('osDesktop').classList.add('active');
    document.getElementById('osUserDisplay').innerText = '@' + user.username;
    socket.emit('join', user.username);
    loadWallPosts();
  }, 500);
}

function previewWallImg(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) { wallImageBase64 = evt.target.result; alert('¡Imagen adjuntada correctamente!'); };
  reader.readAsDataURL(file);
}

function createPost() {
  const text = document.getElementById('wallText').value;
  if(!text && !wallImageBase64) return alert('Escribe texto o adjunta una imagen.');
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
                    '<input type="text" id="comm_txt_' + p.id + '" placeholder="Responder..." style="margin:0; font-size:10px; padding:6px;">' +
                    '<button class="os-btn" onclick="sendComment(\x27' + p.id + '\x27)" style="width:60px; margin:0; padding:6px; font-size:10px;">Enviar</button>' +
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
  alert('Enlace copiado al portapapeles.');
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
  if(!peer) return alert('Ingresa un usuario válido');
  currentPeer = peer;
  socket.emit('chat:load', { user1: currentUser.username, user2: peer });
}

socket.on('chat:history-loaded', (data) => {
  const box = document.getElementById('chatBox');
  box.innerHTML = '';
  if(data.history.length === 0) {
    box.innerHTML = '<div style="color:#64748b; text-align:center;">No hay historial previo con @' + data.peer + '</div>';
    return;
  }
  data.history.length === 0 ? null : data.history.forEach(m => renderMsg(m));
  box.scrollTop = box.scrollHeight;
});

function sendChatMessage() {
  const text = document.getElementById('msgText').value;
  if(!currentPeer || !text) return alert('Abre una ventana de chat e introduce un texto.');
  socket.emit('chat:message', { sender: currentUser.username, recipient: currentPeer, text, type: 'text' });
  document.getElementById('msgText').value = '';
}

function sendChatPhoto(e) {
  const file = e.target.files[0];
  if(!file || !currentPeer) return alert('Selecciona un destinatario primero.');
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
  document.getElementById('friendNotifs').innerHTML += '<div style="background:rgba(255,255,255,0.04); padding:8px; border-radius:8px;">Nueva solicitud de: <b>@' + data.sender + '</b></div>';
});

socket.on('error-msg', (data) => { alert(data.message); });
socket.on('success-msg', (data) => { alert(data.message); });
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('SEXCITES.COM OS Live running on port ' + PORT);
});
