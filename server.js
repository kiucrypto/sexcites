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

// Estructura de la Base de Datos Local
let db = {
  users: {},
  posts: [],
  chats: {},
  requests: {},
  ips: {} // Control de multicuentas por IP
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.ips) db.ips = {};
  } catch(e) {
    console.log('Creando nueva base de datos para SEXCITES.COM');
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
// API DE REGISTRO CON BLOQUEO ANTI-MULTICUENTAS
// ==========================================
app.post('/api/register', (req, res) => {
  const { username, password, plan } = req.body;
  const clientIP = getClientIP(req);

  if (!username || username.trim().length < 3 || !password || password.trim().length < 4) {
    return res.json({ success: false, error: 'Usuario (mín. 3) y contraseña (mín. 4) obligatorios.' });
  }

  const cleanUser = username.trim().toLowerCase().replace('@', '');
  if (db.users[cleanUser]) {
    return res.json({ success: false, error: 'El nombre de usuario ya está registrado.' });
  }

  // Restricción estricta Anti-Multicuentas por IP (Máximo 1 cuenta gratuita por IP)
  const totalUsers = Object.keys(db.users).length;
  if (totalUsers < 500 && db.ips[clientIP]) {
    return res.json({ success: false, error: 'Bloqueo de seguridad: Ya existe una cuenta registrada desde esta red/IP.' });
  }

  let subscriptionStatus = '';
  let expiresAt = 0;

  if (totalUsers < 500) {
    subscriptionStatus = 'free_launch_2m';
    expiresAt = Date.now() + (60 * 24 * 60 * 60 * 1000); // 2 meses gratis
    db.ips[clientIP] = cleanUser; // Registrar IP bloqueando duplicados
  } else {
    if (plan !== '6m' && plan !== '12m') {
      return res.json({ success: false, error: 'Límite de 500 cuentas gratuitas alcanzado. Selecciona un plan de pago.' });
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
    return res.json({ success: false, error: 'Credenciales incorrectas.' });
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
// WEBSOCKETS (SISTEMA OPERATIVO EN TIEMPO REAL)
// ==========================================
io.on('connection', (socket) => {
  socket.on('join', (username) => {
    if (username) socket.join(username.toLowerCase());
  });

  // Muro Social (Persistente, no se borra)
  socket.on('post:create', (data) => {
    const { author, text } = data;
    if (!text) return;

    const newPost = {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      author,
      text: text.trim(),
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

  // Solicitudes de Amistad
  socket.on('friend:request', (data) => {
    const { sender, target } = data;
    const cleanTarget = (target || '').trim().toLowerCase().replace('@', '');

    if (!db.users[cleanTarget]) {
      socket.emit('error-msg', { message: 'El usuario introducido no existe.' });
      return;
    }
    if (cleanTarget === sender) {
      socket.emit('error-msg', { message: 'No puedes enviarte una solicitud a ti mismo.' });
      return;
    }

    if (!db.requests[cleanTarget]) db.requests[cleanTarget] = {};
    db.requests[cleanTarget][sender] = true;
    saveDB();

    io.to(cleanTarget).emit('friend:request-received', { sender });
    socket.emit('success-msg', { message: 'Solicitud enviada a @' + cleanTarget });
  });

  // Chat Privado Instantáneo (Persistente)
  socket.on('chat:load', (data) => {
    const { user1, user2 } = data;
    const cleanPeer = (user2 || '').trim().toLowerCase().replace('@', '');
    
    if (!db.users[cleanPeer]) {
      socket.emit('error-msg', { message: 'El usuario de chat no existe.' });
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
      socket.emit('error-msg', { message: 'Destinatario incorrecto o mensaje vacío.' });
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
// FRONT-END (INTERFAZ DE SISTEMA OPERATIVO)
// ==========================================
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Cloud OS</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
body { background: #030107; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 15px; }
.container { width: 100%; max-width: 650px; background: rgba(15, 8, 25, 0.92); border: 1px solid rgba(255, 42, 109, 0.35); border-radius: 20px; padding: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.9); margin-top: 10px; }
h1 { font-size: 22px; background: linear-gradient(90deg, #ff2a6d, #05d9e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 4px; }
.counter-banner { background: rgba(5, 217, 232, 0.08); border: 1px solid rgba(5, 217, 232, 0.25); border-radius: 10px; padding: 10px; text-align: center; font-size: 12px; margin-bottom: 12px; color: #05d9e8; font-weight: 600; }
input, textarea { width: 100%; padding: 10px; margin-bottom: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 12px; outline: none; }
input:focus, textarea:focus { border-color: #ff2a6d; }
button { width: 100%; padding: 10px; background: linear-gradient(135deg, #ff2a6d, #7928ca); border: none; border-radius: 8px; color: #fff; font-weight: 700; cursor: pointer; font-size: 12px; }
button:active { transform: scale(0.98); }
.plans-box { display: none; margin-top: 8px; padding: 8px; background: rgba(255,42,109,0.08); border-radius: 8px; border: 1px solid #ff2a6d; }
.plan-opt { display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 4px; cursor: pointer; }
.hidden { display: none !important; }
.os-dock { display: flex; justify-content: space-around; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 10px; margin-bottom: 12px; font-size: 11px; font-weight: 600; border: 1px solid rgba(255,255,255,0.06); }
.os-dock span { cursor: pointer; padding: 4px 10px; border-radius: 6px; transition: 0.2s; }
.os-dock span:hover { background: rgba(255,42,109,0.2); color: #05d9e8; }
.space-section { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; }
.post-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 10px; border-radius: 8px; margin-bottom: 8px; }
</style>
</head>
<body>

<div class="container">
  <h1>SEXCITES.COM</h1>
  <div class="counter-banner" id="counterBanner">Verificando sistema y red...</div>

  <!-- AUTENTICACIÓN / REGISTRO -->
  <div id="authSection">
    <div style="font-size: 12px; font-weight: 700; color: #ff2a6d; margin-bottom: 6px;">🛡️ Registro Cloud OS (Anti-Multicuentas por IP)</div>
    <input type="text" id="regUser" placeholder="Usuario (Ej: jhon)" autocomplete="off">
    <input type="password" id="regPass" placeholder="Contraseña segura" autocomplete="off">
    
    <div id="plansContainer" class="plans-box">
      <div style="font-size: 11px; color: #ff2a6d; font-weight: 700; margin-bottom: 4px;">Límite de 500 alcanzado. Selecciona tu plan de lanzamiento:</div>
      <label class="plan-opt"><input type="radio" name="launchPlan" value="6m" checked> 6 Meses — $15.99 USD</label>
      <label class="plan-opt"><input type="radio" name="launchPlan" value="12m"> 12 Meses — $28.99 USD</label>
    </div>

    <button onclick="registerUser()" style="margin-top: 6px;">Crear Cuenta</button>
    <div style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 10px; cursor: pointer;" onclick="toggleAuthMode()">¿Ya registrado? Iniciar Sesión</div>
  </div>

  <!-- INICIO DE SESIÓN -->
  <div id="loginSection" class="hidden">
    <div style="font-size: 12px; font-weight: 700; color: #05d9e8; margin-bottom: 6px;">🔐 Acceso al Sistema</div>
    <input type="text" id="logUser" placeholder="Usuario" autocomplete="off">
    <input type="password" id="logPass" placeholder="Contraseña" autocomplete="off">
    <button onclick="loginUser()">Entrar al OS</button>
    <div style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 10px; cursor: pointer;" onclick="toggleAuthMode()">¿No tienes cuenta? Regístrate</div>
  </div>

  <div id="authAlert" style="color: #f87171; font-size: 11px; text-align: center; margin-top: 6px; font-weight: 600;"></div>

  <!-- ESCRITORIO / ESPACIOS DEL SISTEMA OPERATIVO -->
  <div id="appSection" class="hidden">
    <div class="os-dock">
      <span onclick="switchSpace('wall')">🌐 Muro Global</span>
      <span onclick="switchSpace('chat')">💬 Chat Directo</span>
      <span onclick="switchSpace('friends')">👥 Red Amigos</span>
    </div>

    <!-- ESPACIO 1: MURO GLOBAL -->
    <div id="spaceWall" class="space-section">
      <textarea id="postText" placeholder="¿Qué hay de nuevo en tu espacio?" style="height: 50px; font-size: 11px;"></textarea>
      <button onclick="createPost()" style="margin-bottom: 10px; font-size: 11px; padding: 6px;">Publicar al Muro</button>
      <div id="wallFeed" style="display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto;"></div>
    </div>

    <!-- ESPACIO 2: CHAT PRIVADO -->
    <div id="spaceChat" class="space-section hidden">
      <div style="display: flex; gap: 4px; margin-bottom: 6px;">
        <input type="text" id="chatTarget" placeholder="Usuario exacto..." style="margin:0; font-size: 10px;" autocomplete="off">
        <button onclick="loadChatHistory()" style="width: 90px; margin:0; font-size: 10px; padding: 6px;">Abrir Chat</button>
      </div>
      <div id="chatBox" style="background: rgba(0,0,0,0.5); border-radius: 6px; height: 180px; padding: 6px; overflow-y: auto; font-size: 10px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.04);">
        <div style="color: #64748b; text-align: center; padding-top: 50px;">Escribe el usuario exacto para chatear al instante.</div>
      </div>
      <div style="display: flex; gap: 4px;">
        <input type="text" id="msgInput" placeholder="Mensaje..." style="margin:0; font-size: 10px;" autocomplete="off">
        <button onclick="sendChatMessage()" style="width: 65px; margin:0; font-size: 10px; padding: 6px;">Enviar</button>
      </div>
    </div>

    <!-- ESPACIO 3: RED DE AMIGOS -->
    <div id="spaceFriends" class="space-section hidden">
      <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 4px;">Enviar solicitud de conexión:</div>
      <input type="text" id="friendUser" placeholder="Usuario exacto..." style="font-size: 10px;" autocomplete="off">
      <button onclick="sendFriendRequest()" style="font-size: 10px; padding: 6px;">Enviar Solicitud</button>
      <div id="friendNotifs" style="margin-top: 8px; font-size: 10px; display: flex; flex-direction: column; gap: 4px;"></div>
    </div>
  </div>
</div>

<script>
const socket = io();
let currentUser = null;
let currentChatPeer = null;

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
    banner.innerHTML = \`🎉 Lanzamiento Cloud OS: <b>\${500 - total}</b> cuentas gratis restantes (2 meses).\`;
    plansContainer.classList.add('hidden');
  } else {
    banner.innerHTML = \`⚠️ Límite de 500 cuentas gratis alcanzado. Selecciona tu plan de pago.\`;
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

function createPost() {
  const text = document.getElementById('postText').value;
  if (!text) return;
  socket.emit('post:create', { author: currentUser.username, text });
  document.getElementById('postText').value = '';
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

  let commentsHtml = \`<div id="comm_list_\${p.id}" style="margin-top:4px; padding-left:6px; border-left:2px solid #ff2a6d; display:flex; flex-direction:column; gap:3px;">\`;
  if (p.comments) {
    p.comments.forEach(c => {
      commentsHtml += \`<div><b style="color:#05d9e8;">@\${c.author}:</b> \${c.text}</div>\`;
    });
  }
  commentsHtml += '</div>';

  div.innerHTML = \`<b style="color:#ff2a6d; font-size:11px;">@\${p.author}</b>
                   <p style="color:#e2e8f0; margin-top:2px; font-size:11px;">\${p.text}</p>
                   <div style="display:flex; gap:10px; margin-top:4px; align-items:center;">
                     <button onclick="toggleLike('\${p.id}')" style="width:auto; background:none; border:none; color:\${p.userHasLiked ? '#ff2a6d':'#94a3b8'}; cursor:pointer; font-size:10px;">❤️ <span id="likes_\${p.id}">\${p.likesCount}</span></button>
                   </div>
                   \${commentsHtml}
                   <div style="display:flex; gap:4px; margin-top:4px;">
                     <input type="text" id="comm_txt_\${p.id}" placeholder="Comentar..." style="margin:0; font-size:9px; padding:4px;" autocomplete="off">
                     <button onclick="sendComment('\${p.id}')" style="width:55px; margin:0; padding:4px; font-size:9px;">Enviar</button>
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
  if (!peer) return alert('Introduce un usuario.');
  currentChatPeer = peer.trim().toLowerCase().replace('@', '');
  socket.emit('chat:load', { user1: currentUser.username, user2: currentChatPeer });
}

socket.on('chat:history-loaded', (data) => {
  const box = document.getElementById('chatBox');
  box.innerHTML = '';
  if (data.history.length === 0) {
    box.innerHTML = \`<div style="color:#64748b; text-align:center;">Inicia conversación con @\${data.peer}</div>\`;
    return;
  }
  data.history.forEach(m => appendMsgToChat(m));
  box.scrollTop = box.scrollHeight;
});

function sendChatMessage() {
  const text = document.getElementById('msgInput').value;
  if (!currentChatPeer || !text) return alert('Selecciona un usuario válido e ingresa un mensaje.');
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
  document.getElementById('friendNotifs').innerHTML += \`<div style="background:rgba(255,255,255,0.03); padding:4px; border-radius:4px;">Solicitud de: <b>@\${data.sender}</b></div>\`;
});

socket.on('error-msg', (data) => { alert(data.message); });
socket.on('success-msg', (data) => { alert(data.message); });
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('SEXCITES.COM Cloud OS activo en el puerto ' + PORT);
});
