const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const DB_FILE = path.join(__dirname, 'database.json');

let db = {
  users: {},
  posts: [],
  chats: {},
  matches: {},
  ips: {},
  securityLogs: {}
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.ips) db.ips = {};
    if (!db.matches) db.matches = {};
    if (!db.chats) db.chats = {};
    if (!db.posts) db.posts = [];
    if (!db.users) db.users = {};
    if (!db.securityLogs) db.securityLogs = {};
  } catch(e) {
    console.log('Reiniciando base de datos por archivo corrupto.');
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
// SISTEMA ANTI-HACKER Y DEFENSA DE REGISTRO
// ==========================================
const securityWatchdog = {};

function checkAntiHacker(req, res, actionType) {
  const ip = getClientIP(req);
  const now = Date.now();

  if (!securityWatchdog[ip]) {
    securityWatchdog[ip] = { attempts: 0, blockUntil: 0, lastAction: now };
  }

  const record = securityWatchdog[ip];

  if (record.blockUntil > now) {
    const remainingSecs = Math.ceil((record.blockUntil - now) / 1000);
    return { 
      blocked: true, 
      error: `🚨 ACCESO BLOQUEADO POR SEGURIDAD. Movimiento sospechoso detectado. Reintenta en ${remainingSecs}s.` 
    };
  }

  if (now - record.lastAction > 60000) {
    record.attempts = 0;
  }

  record.lastAction = now;
  record.attempts++;

  if (record.attempts > 8) {
    record.blockUntil = now + (15 * 60 * 1000);
    saveDB();
    return { 
      blocked: true, 
      error: '🚨 ALERTA: Actividad anómala detectada. Tu dirección IP ha sido bloqueada temporalmente por 15 minutos.' 
    };
  }

  return { blocked: false };
}

// ==========================================
// API DE REGISTRO CON BLOQUEO A PARTIR DE 500
// ==========================================
app.post('/api/register', (req, res) => {
  const securityCheck = checkAntiHacker(req, res, 'register');
  if (securityCheck.blocked) {
    return res.json({ success: false, error: securityCheck.error });
  }

  const { username, password, plan, avatar, bio } = req.body;
  const clientIP = getClientIP(req);

  if (!username || username.trim().length < 3 || !password || password.trim().length < 4) {
    return res.json({ success: false, error: 'El usuario (min. 3) y contraseña (min. 4) son obligatorios.' });
  }

  const cleanUser = username.trim().toLowerCase().replace('@', '');
  if (db.users[cleanUser]) {
    return res.json({ success: false, error: 'Este nombre de usuario ya está registrado.' });
  }

  const totalUsers = Object.keys(db.users).length;
  let subscriptionStatus = '';
  let expiresAt = 0;

  // LÓGICA ESTRICTA DE BLOQUEO Y CUPOS (MÁXIMO 500 GRATIS)
  if (totalUsers < 500) {
    if (db.ips[clientIP]) {
      return res.json({ success: false, error: 'Bloqueo: Ya se registró una cuenta gratuita desde esta red o IP.' });
    }
    subscriptionStatus = 'free_launch_2m';
    expiresAt = Date.now() + (60 * 24 * 60 * 60 * 1000); // 2 meses gratis
    db.ips[clientIP] = cleanUser;
  } else {
    // BLOQUEO OBLIGATORIO: EXIGE PAGO SI YA PASÓ DE 500
    if (plan !== '6m' && plan !== '12m') {
      return res.json({ success: false, error: '⚠️ Límite de 500 cuentas superado. Se requiere realizar el pago institucional en Bitcoin para ingresar.' });
    }
    subscriptionStatus = plan === '6m' ? 'pending_paid_6m' : 'pending_paid_12m';
    const days = plan === '6m' ? 180 : 365;
    expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    username: cleanUser,
    password,
    avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    bio: bio ? bio.trim() : '¡Hola! Buscando conectar en SEXCITES.COM.',
    ip: clientIP,
    subNumber: totalUsers + 1,
    subscriptionStatus,
    expiresAt,
    createdAt: Date.now()
  };

  db.users[cleanUser] = newUser;
  db.matches[cleanUser] = [];
  saveDB();

  io.emit('stats:update', { totalUsers: Object.keys(db.users).length });
  res.json({ success: true, user: newUser, requiresBtcPayment: totalUsers >= 500 });
});

app.post('/api/login', (req, res) => {
  const securityCheck = checkAntiHacker(req, res, 'login');
  if (securityCheck.blocked) {
    return res.json({ success: false, error: securityCheck.error });
  }

  const { username, password } = req.body;
  const cleanUser = (username || '').trim().toLowerCase().replace('@', '');
  const user = db.users[cleanUser];

  if (!user || user.password !== password) {
    return res.json({ success: false, error: 'Credenciales inválidas o el usuario no existe.' });
  }

  res.json({ success: true, user });
});

app.get('/api/init-data', (req, res) => {
  const currentUsername = (req.query.username || '').toLowerCase();
  
  const formattedPosts = db.posts.map(p => ({
    ...p,
    likesCount: (p.likes || []).length,
    userHasLiked: (p.likes || []).includes(currentUsername)
  }));

  const discoveryUsers = Object.keys(db.users)
    .filter(u => u !== currentUsername)
    .map(u => ({
      username: db.users[u].username,
      avatar: db.users[u].avatar,
      bio: db.users[u].bio
    }));

  let activeChats = [];
  if (currentUsername && db.users[currentUsername]) {
    Object.keys(db.chats).forEach(chatId => {
      if (chatId.includes(currentUsername)) {
        const parts = chatId.split('_');
        const peer = parts[0] === currentUsername ? parts[1] : parts[0];
        const messages = db.chats[chatId];
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        if (peer && db.users[peer]) {
          activeChats.push({
            peer,
            avatar: db.users[peer].avatar,
            lastMessage: lastMsg ? lastMsg.text : 'Inicia una conversación',
            timestamp: lastMsg ? lastMsg.timestamp : 0
          });
        }
      }
    });
    activeChats.sort((a, b) => b.timestamp - a.timestamp);
  }

  res.json({
    success: true,
    totalUsers: Object.keys(db.users).length,
    posts: formattedPosts,
    discovery: discoveryUsers,
    chats: activeChats
  });
});

// ==========================================
// WEBSOCKETS PARA CONEXIONES Y CHAT EN VIVO
// ==========================================
io.on('connection', (socket) => {
  socket.on('join', (username) => {
    if (username) {
      const clean = username.toLowerCase();
      socket.join(clean);
      socket.username = clean;
    }
  });

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

    if (!post.likes) post.likes = [];
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

    if (!post.comments) post.comments = [];
    const comment = { id: 'comm_' + Date.now(), author, text: text.trim(), timestamp: Date.now() };
    post.comments.push(comment);
    saveDB();

    io.emit('post:commented', { postId, comment });
  });

  socket.on('match:action', (data) => {
    const { user, target, action } = data;
    if (action === 'like') {
      if (!db.matches[user]) db.matches[user] = [];
      if (!db.matches[user].includes(target)) {
        db.matches[user].push(target);
        saveDB();
      }
      if (db.matches[target] && db.matches[target].includes(user)) {
        io.to(user).emit('match:success', { peer: target });
        io.to(target).emit('match:success', { peer: user });
      }
    }
  });

  socket.on('chat:load', (data) => {
    const { user1, user2 } = data;
    const cleanPeer = (user2 || '').trim().toLowerCase().replace('@', '');
    
    if (!db.users[cleanPeer]) {
      socket.emit('error-msg', { message: 'El usuario no existe.' });
      return;
    }

    const chatId = getChatId(user1, cleanPeer);
    const history = db.chats[chatId] || [];
    socket.emit('chat:history-loaded', { history, peer: cleanPeer, peerData: { avatar: db.users[cleanPeer].avatar } });
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

    const msgObj = { sender, recipient: cleanRecipient, text: text.trim(), timestamp: Date.now() };
    db.chats[chatId].push(msgObj);
    saveDB();

    io.to(cleanRecipient).emit('chat:incoming', msgObj);
    io.to(sender).emit('chat:incoming', msgObj);
  });
});

// ==========================================
// FRONT-END INTEGRADO CON SISTEMA DE MATCH Y PAGO BTC
// ==========================================
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Conecta y Conoce Gente</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
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
  padding: 20px 10px; 
  position: relative; 
  overflow-x: hidden;
}

canvas#bgCanvas {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(circle at center, #11051c 0%, #030107 100%);
}

.container { 
  width: 100%; 
  max-width: 760px; 
  background: rgba(12, 6, 20, 0.88); 
  border: 1px solid rgba(255, 42, 109, 0.4); 
  border-radius: 24px; 
  padding: 24px; 
  box-shadow: 0 30px 80px rgba(0,0,0,0.95), 0 0 25px rgba(255, 42, 109, 0.15); 
  z-index: 1;
  backdrop-filter: blur(16px);
}

h1 { 
  font-size: 28px; 
  background: linear-gradient(90deg, #ff2a6d, #05d9e8); 
  -webkit-background-clip: text; 
  -webkit-text-fill-color: transparent; 
  text-align: center; 
  margin-bottom: 6px; 
  font-weight: 800;
  letter-spacing: 0.5px;
}

.counter-banner { 
  background: rgba(5, 217, 232, 0.08); 
  border: 1px solid rgba(5, 217, 232, 0.25); 
  border-radius: 12px; 
  padding: 12px; 
  text-align: center; 
  font-size: 13px; 
  margin-bottom: 16px; 
  color: #05d9e8; 
  font-weight: 600; 
}

input, textarea { 
  width: 100%; 
  padding: 12px 14px; 
  margin-bottom: 12px; 
  background: rgba(255,255,255,0.04); 
  border: 1px solid rgba(255,255,255,0.1); 
  border-radius: 10px; 
  color: #fff; 
  font-size: 13px; 
  outline: none; 
  transition: border-color 0.2s;
}
input:focus, textarea:focus { border-color: #ff2a6d; background: rgba(255,255,255,0.06); }

button { 
  width: 100%; 
  padding: 12px; 
  background: linear-gradient(135deg, #ff2a6d, #7928ca); 
  border: none; 
  border-radius: 10px; 
  color: #fff; 
  font-weight: 700; 
  cursor: pointer; 
  font-size: 14px; 
  transition: opacity 0.2s, transform 0.1s;
}
button:active { transform: scale(0.98); }
button:hover { opacity: 0.9; }

.plans-box { display: none; margin-top: 10px; margin-bottom: 12px; padding: 14px; background: rgba(255,42,109,0.08); border-radius: 12px; border: 1px solid #ff2a6d; }
.plan-opt { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 8px; cursor: pointer; color: #fff; }
.hidden { display: none !important; }

/* PASARELA DE PAGO BITCOIN */
.btc-modal {
  background: rgba(5, 217, 232, 0.05);
  border: 1px solid #05d9e8;
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  margin-top: 10px;
  margin-bottom: 12px;
}
.btc-address-box {
  background: rgba(0, 0, 0, 0.5);
  border: 1px dashed #05d9e8;
  padding: 10px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 11px;
  color: #05d9e8;
  word-break: break-all;
  margin: 10px 0;
}

/* NAVEGACIÓN DOCK */
.os-dock { 
  display: flex; 
  justify-content: space-between; 
  align-items: center;
  background: rgba(255,255,255,0.04); 
  padding: 10px 16px; 
  border-radius: 14px; 
  margin-bottom: 16px; 
  font-size: 13px; 
  font-weight: 600; 
  border: 1px solid rgba(255,255,255,0.08); 
}
.os-nav-items { display: flex; gap: 6px; }
.os-dock span { cursor: pointer; padding: 8px 12px; border-radius: 8px; transition: 0.2s; color: #cbd5e1; }
.os-dock span:hover, .os-dock span.active { background: rgba(255,42,109,0.25); color: #05d9e8; }
.action-btns-header { display: flex; gap: 6px; }
.refresh-btn { background: rgba(5, 217, 232, 0.2); color: #05d9e8; border: 1px solid rgba(5, 217, 232, 0.4); padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 700; width: auto !important; }
.logout-btn { background: rgba(255, 42, 109, 0.2); color: #ff2a6d; border: 1px solid rgba(255, 42, 109, 0.4); padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 700; width: auto !important; }

.space-section { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08); padding: 18px; border-radius: 16px; }

/* MURO SOCIAL */
.post-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 16px; border-radius: 14px; margin-bottom: 14px; }
.post-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.post-avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1px solid #ff2a6d; }
.post-img-preview { width: 100%; max-height: 380px; border-radius: 10px; margin-top: 10px; object-fit: cover; display: block; }

/* RECOMENDADOS / MATCH */
.match-card-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 14px; }
.profile-discovery-img { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 2px solid #05d9e8; margin: 0 auto 12px auto; display: block; box-shadow: 0 0 20px rgba(5,217,232,0.3); }

/* CHAT EN VIVO */
.chat-layout { display: grid; grid-template-columns: 240px 1fr; gap: 12px; }
@media (max-width: 600px) { .chat-layout { grid-template-columns: 1fr; } }
.chats-sidebar { background: rgba(0,0,0,0.4); border-radius: 12px; padding: 10px; max-height: 380px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.06); }
.chat-contact-item { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; margin-bottom: 4px; background: rgba(255,255,255,0.02); }
.chat-contact-item:hover { background: rgba(255,42,109,0.15); }
.chat-window-area { background: rgba(0,0,0,0.5); border-radius: 12px; display: flex; flex-direction: column; height: 380px; border: 1px solid rgba(255,255,255,0.06); padding: 10px; }
.chat-messages-box { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.msg-bubble { padding: 8px 12px; border-radius: 10px; max-width: 75%; word-break: break-word; line-height: 1.4; }
.msg-me { background: linear-gradient(135deg, #ff2a6d, #7928ca); align-self: flex-end; color: #fff; }
.msg-peer { background: rgba(255,255,255,0.08); align-self: flex-start; color: #fff; }
</style>
</head>
<body>

<canvas id="bgCanvas"></canvas>

<div class="container">
  <h1>SEXCITES.COM</h1>
  <div class="counter-banner" id="counterBanner">🛡️ Verificando cupos del sistema...</div>

  <!-- SECCIÓN DE REGISTRO -->
  <div id="authSection">
    <div style="font-size: 13px; font-weight: 700; color: #ff2a6d; margin-bottom: 10px;">✨ Registro de Cuenta (Sube tu Foto o Avatar)</div>
    <input type="text" id="regUser" placeholder="Nombre de usuario (ej. alex)" autocomplete="off">
    <input type="password" id="regPass" placeholder="Contraseña segura" autocomplete="off">
    
    <div style="margin-bottom: 12px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,42,109,0.4); border-radius: 10px; padding: 10px; text-align: center;">
      <label style="font-size: 12px; color: #05d9e8; font-weight: 600; display: block; margin-bottom: 6px;">Foto de Perfil:</label>
      <input type="file" id="regAvatarFile" accept="image/*" style="display: none;" onchange="handleRegAvatarPreview(event)">
      <button type="button" onclick="document.getElementById('regAvatarFile').click()" style="width: auto; background: rgba(5,217,232,0.15); border: 1px solid rgba(5,217,232,0.4); color: #05d9e8; font-size: 12px; padding: 8px 14px;">📁 Seleccionar Imagen</button>
      <div id="regAvatarName" style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Ningún archivo seleccionado</div>
      <div id="regAvatarPreviewContainer" class="hidden" style="margin-top: 8px;">
        <img id="regAvatarPreviewImg" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 2px solid #ff2a6d;">
      </div>
    </div>

    <textarea id="regBio" placeholder="Escribe algo sobre ti para que te encuentren más fácil..." style="height: 60px; font-size: 12px;"></textarea>

    <!-- BLOQUE DE PLANES (SE ACTIVA AUTOMÁTICAMENTE AL SUPERAR LOS 500 REGISTROS) -->
    <div id="plansContainer" class="plans-box">
      <div style="font-size: 12px; color: #ff2a6d; font-weight: 700; margin-bottom: 6px;">⚠️ Límite de 500 cuentas gratis alcanzado. Selecciona tu plan de pago para ingresar:</div>
      <label class="plan-opt"><input type="radio" name="launchPlan" value="6m" checked> Plan 6 Meses — <b>$15.99 USD (Equivalente en BTC)</b></label>
      <label class="plan-opt"><input type="radio" name="launchPlan" value="12m"> Plan 12 Meses — <b>$28.99 USD (Equivalente en BTC)</b></label>
    </div>

    <button onclick="registerUser()" style="margin-top: 6px;">Registrarse en la Plataforma</button>
    <div style="text-align: center; font-size: 11px; color: #94a3b8; margin-top: 12px; cursor: pointer;" onclick="toggleAuthMode()">¿Ya tienes cuenta? Inicia Sesión</div>
  </div>

  <!-- PASARELA DE PAGO BITCOIN (BLOQUEO DE INGRESO SI SUPERA 500) -->
  <div id="btcModalSection" class="hidden">
    <div class="btc-modal">
      <div style="font-size: 14px; font-weight: 700; color: #05d9e8; margin-bottom: 6px;">⚡ ACCESO BLOQUEADO — PAGO REQUERIDO EN BITCOIN (BTC)</div>
      <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 8px; line-height: 1.4;">
        Para desbloquear tu acceso y formar parte de la comunidad, transfiere el equivalente al plan a nuestra dirección oficial:
      </div>
      <div class="btc-address-box">bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s</div>
      <div style="font-size: 11px; color: #ff2a6d; font-weight: 600; margin-bottom: 10px; line-height: 1.4;">
        ⚠️ OBLIGATORIO: Envía el comprobante de pago y tu nombre de usuario al correo <b style="color:#fff;">po80payments@gmail.com</b> para verificar tu membresía de inmediato.
      </div>
      <button onclick="finishBtcFlow()" style="background: linear-gradient(135deg, #05d9e8, #7928ca); font-size: 12px; padding: 8px;">Ya envié mi comprobante / Entendido</button>
    </div>
  </div>

  <div id="loginSection" class="hidden">
    <div style="font-size: 13px; font-weight: 700; color: #05d9e8; margin-bottom: 10px;">🔐 Iniciar Sesión</div>
    <input type="text" id="logUser" placeholder="Usuario" autocomplete="off">
    <input type="password" id="logPass" placeholder="Contraseña" autocomplete="off">
    <button onclick="loginUser()">Entrar</button>
    <div style="text-align: center; font-size: 11px; color: #94a3b8; margin-top: 12px; cursor: pointer;" onclick="toggleAuthMode()">¿No tienes cuenta? Regístrate</div>
  </div>

  <div id="authAlert" style="color: #f87171; font-size: 12px; text-align: center; margin-top: 8px; font-weight: 600; line-height: 1.4;"></div>

  <!-- PANEL PRINCIPAL DEL SISTEMA DE CONEXIONES -->
  <div id="appSection" class="hidden">
    <div class="os-dock">
      <div class="os-nav-items">
        <span id="navWall" class="active" onclick="switchSpace('wall')">🌐 Muro</span>
        <span id="navMatch" onclick="switchSpace('match')">🔥 Conocer Gente (Match)</span>
        <span id="navChat" onclick="switchSpace('chat')">💬 Chats</span>
      </div>
      <div class="action-btns-header">
        <button class="refresh-btn" onclick="refreshData()">🔄 Actualizar</button>
        <button class="logout-btn" onclick="logoutUser()">Salir</button>
      </div>
    </div>

    <!-- SECCIÓN 1: MURO SOCIAL -->
    <div id="spaceWall" class="space-section">
      <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 14px; border-radius: 14px; margin-bottom: 16px;">
        <textarea id="postText" placeholder="Comparte algo con la comunidad..." style="height: 70px; font-size: 13px; margin-bottom: 8px;"></textarea>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px;">
          <input type="file" id="postImageFile" accept="image/*" style="display: none;" onchange="handleImagePreview(event)">
          <button type="button" onclick="document.getElementById('postImageFile').click()" style="width: auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); font-size: 11px; padding: 6px 12px;">📷 Foto</button>
          <span id="imgFileName" style="font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Sin archivo</span>
        </div>
        <div id="imagePreviewContainer" class="hidden" style="position: relative; margin-bottom: 10px;">
          <img id="imagePreviewElement" style="max-height: 140px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
          <button onclick="clearImageSelection()" style="width: auto; padding: 4px 8px; font-size: 10px; background: #ff2a6d; margin-top: 6px;">Quitar</button>
        </div>
        <button onclick="createPost()" style="font-size: 12px; padding: 8px;">Publicar</button>
      </div>
      <div id="wallFeed" style="display: flex; flex-direction: column; gap: 12px; max-height: 440px; overflow-y: auto; padding-right: 4px;"></div>
    </div>

    <!-- SECCIÓN 2: DESCUBRIR Y CONOCER GENTE (MATCH) -->
    <div id="spaceMatch" class="space-section hidden">
      <div style="font-size: 15px; font-weight: 700; color: #ff2a6d; margin-bottom: 14px; text-align: center;">🔥 Descubre y Conoce Personas Nuevas</div>
      <div class="match-card-box">
        <img id="matchAvatar" class="profile-discovery-img" src="" alt="Avatar">
        <div id="matchUsername" style="font-size: 20px; font-weight: 700; color: #05d9e8; margin-bottom: 6px;">Cargando...</div>
        <div id="matchBio" style="font-size: 12px; color: #cbd5e1; margin-bottom: 16px; padding: 0 10px; line-height: 1.4;">Cargando perfil...</div>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button onclick="handleMatchAction('pass')" style="background: rgba(255,255,255,0.1); color: #fff; width: 45%; padding: 10px;">✕ Omitir</button>
          <button onclick="handleMatchAction('like')" style="background: linear-gradient(135deg, #ff2a6d, #05d9e8); width: 45%; padding: 10px;">❤️ Me Gusta</button>
        </div>
      </div>
    </div>

    <!-- SECCIÓN 3: CHAT PRIVADO EN VIVO -->
    <div id="spaceChat" class="space-section hidden">
      <div class="chat-layout">
        <div class="chats-sidebar">
          <div style="font-size: 11px; font-weight: 700; color: #ff2a6d; margin-bottom: 8px; text-transform: uppercase;">Conversaciones</div>
          <div id="chatContactsList">
            <div style="color: #64748b; font-size: 11px; text-align: center; padding-top: 20px;">Sin chats activos</div>
          </div>
        </div>
        <div class="chat-window-area">
          <div id="chatHeaderInfo" style="font-size: 12px; font-weight: 700; color: #05d9e8; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 6px;">
            Selecciona un chat
          </div>
          <div id="chatBox" class="chat-messages-box">
            <div style="color: #64748b; text-align: center; margin: auto;">Tus mensajes aparecerán aquí al instante.</div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 6px;">
            <input type="text" id="msgInput" placeholder="Escribe un mensaje..." style="margin:0; font-size: 12px;" autocomplete="off" onkeypress="handleChatKeypress(event)">
            <button onclick="sendChatMessage()" style="width: 80px; margin:0; font-size: 12px; padding: 8px;">Enviar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
// MOTOR DE ANIMACIÓN VISUAL DE FONDO
const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
let elements = [];
const totalElements = 50;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

for (let i = 0; i < totalElements; i++) {
  elements.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 14 + 8,
    speedY: (Math.random() * 0.8 + 0.2) * -1,
    speedX: (Math.random() - 0.5) * 0.5,
    opacity: Math.random() * 0.6 + 0.2,
    color: Math.random() > 0.4 ? '#ff2a6d' : '#05d9e8',
    isHeart: Math.random() > 0.5,
    pulse: Math.random() * 0.03 + 0.01,
    pulseVal: Math.random() * Math.PI
  });
}

function animateBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  elements.forEach(el => {
    el.y += el.speedY;
    el.x += el.speedX;
    el.pulseVal += el.pulse;
    let currSize = el.size + Math.sin(el.pulseVal) * 2;

    if (el.y < -30) {
      el.y = canvas.height + 30;
      el.x = Math.random() * canvas.width;
    }
    if (el.x < -30) el.x = canvas.width + 30;
    if (el.x > canvas.width + 30) el.x = -30;

    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = el.color;
    ctx.globalAlpha = el.opacity;

    if (el.isHeart) {
      ctx.beginPath();
      ctx.translate(el.x, el.y);
      ctx.fillStyle = el.color;
      const d = currSize;
      ctx.moveTo(0, d / 4);
      ctx.bezierCurveTo(d / 2, -d / 2, d, d / 3, 0, d);
      ctx.bezierCurveTo(-d, d / 3, -d / 2, -d / 2, 0, d / 4);
      ctx.fill();
    }
    ctx.restore();
  });

  requestAnimationFrame(animateBackground);
}

requestAnimationFrame(animateBackground);

// INTERACCIÓN Y SOCKETS
const socket = io();
let currentUser = null;
let currentChatPeer = null;
let base64Avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400';
let base64Image = null;
let discoveryList = [];
let currentDiscoveryIndex = 0;

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
    banner.innerHTML = '🎉 <b>Promoción de Lanzamiento:</b> Quedan <b>' + (500 - total) + '</b> cuentas gratis disponibles.';
    plansContainer.classList.add('hidden');
  } else {
    banner.innerHTML = '⚠️ <b>Cupo de 500 cuentas lleno.</b> El registro requiere pago obligatorio en Bitcoin.';
    plansContainer.classList.remove('hidden');
  }
}

function toggleAuthMode() {
  document.getElementById('authSection').classList.toggle('hidden');
  document.getElementById('loginSection').classList.toggle('hidden');
  document.getElementById('btcModalSection').classList.add('hidden');
  document.getElementById('authAlert').innerText = '';
}

function switchSpace(space) {
  ['Wall', 'Match', 'Chat'].forEach(s => {
    document.getElementById('space' + s).classList.add('hidden');
    document.getElementById('nav' + s).classList.remove('active');
  });
  document.getElementById('space' + space.charAt(0).toUpperCase() + space.slice(1)).classList.remove('hidden');
  document.getElementById('nav' + space.charAt(0).toUpperCase() + space.slice(1)).classList.add('active');
  
  if (space === 'match') loadNextMatchProfile();
  if (space === 'chat') refreshData();
}

function handleRegAvatarPreview(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('regAvatarName').innerText = file.name;
  const reader = new FileReader();
  reader.onload = function(e) {
    base64Avatar = e.target.result;
    const prev = document.getElementById('regAvatarPreviewImg');
    prev.src = base64Avatar;
    document.getElementById('regAvatarPreviewContainer').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

async function registerUser() {
  const username = document.getElementById('regUser').value;
  const password = document.getElementById('regPass').value;
  const bio = document.getElementById('regBio').value;
  const selectedPlan = document.querySelector('input[name="launchPlan"]:checked');
  const plan = selectedPlan ? selectedPlan.value : null;

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, plan, avatar: base64Avatar, bio })
    });
    const data = await res.json();
    if (data.success) { 
      if (data.requiresBtcPayment) {
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('btcModalSection').classList.remove('hidden');
        window.pendingUserSession = data.user;
      } else {
        bootOS(data.user); 
      }
    } else { 
      document.getElementById('authAlert').innerText = data.error; 
    }
  } catch (err) {
    document.getElementById('authAlert').innerText = 'Error de conexión con el servidor.';
  }
}

function finishBtcFlow() {
  if (window.pendingUserSession) {
    bootOS(window.pendingUserSession);
  } else {
    toggleAuthMode();
  }
}

async function loginUser() {
  const username = document.getElementById('logUser').value;
  const password = document.getElementById('logPass').value;

  try {
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
  } catch (err) {
    document.getElementById('authAlert').innerText = 'Error de conexión con el servidor.';
  }
}

function logoutUser() {
  currentUser = null;
  currentChatPeer = null;
  document.getElementById('appSection').classList.add('hidden');
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('btcModalSection').classList.add('hidden');
  document.getElementById('counterBanner').classList.remove('hidden');
  document.getElementById('logUser').value = '';
  document.getElementById('logPass').value = '';
}

function bootOS(user) {
  currentUser = user;
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('btcModalSection').classList.add('hidden');
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('authAlert').classList.add('hidden');
  document.getElementById('counterBanner').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  
  socket.emit('join', user.username);
  refreshData();
}

async function refreshData() {
  if (!currentUser) return;
  const res = await fetch('/api/init-data?username=' + currentUser.username);
  const data = await res.json();
  
  renderWallPosts(data.posts);
  discoveryList = (data.discovery || []).filter(u => u.username !== currentUser.username);
  renderActiveChats(data.chats);
  if (!document.getElementById('spaceMatch').classList.contains('hidden')) {
    loadNextMatchProfile();
  }
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
  document.getElementById('imgFileName').innerText = 'Sin archivo';
  document.getElementById('imagePreviewContainer').classList.add('hidden');
}

function createPost() {
  const text = document.getElementById('postText').value;
  if (!text && !base64Image) return alert('Escribe texto o adjunta una foto.');
  socket.emit('post:create', { author: currentUser.username, text, image: base64Image });
  document.getElementById('postText').value = '';
  clearImageSelection();
}

socket.on('post:new', (post) => { appendPostToDOM(post); });

function renderWallPosts(posts) {
  const feed = document.getElementById('wallFeed');
  feed.innerHTML = '';
  (posts || []).forEach(p => appendPostToDOM(p, true));
}

function appendPostToDOM(p, prepend = false) {
  const feed = document.getElementById('wallFeed');
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = 'post_' + p.id;

  let imageHtml = p.image ? '<img src="' + p.image + '" class="post-img-preview">' : '';
  let commentsHtml = '<div id="comm_list_' + p.id + '" style="margin-top:10px; padding-left:10px; border-left:2px solid #ff2a6d; display:flex; flex-direction:column; gap:6px;">';
  if (p.comments) {
    p.comments.forEach(c => {
      commentsHtml += '<div style="font-size:12px;"><b style="color:#05d9e8;">@' + c.author + ':</b> ' + c.text + '</div>';
    });
  }
  commentsHtml += '</div>';

  div.innerHTML = '<div class="post-header">' +
                     '<img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" class="post-avatar">' +
                     '<div>' +
                       '<b style="color:#ff2a6d; font-size:13px;">@' + p.author + '</b>' +
                       '<div style="font-size:10px; color:#94a3b8;">Hace un momento</div>' +
                     '</div>' +
                   '</div>' +
                   (p.text ? '<p style="color:#e2e8f0; margin-top:6px; font-size:13px; line-height:1.4;">' + p.text + '</p>' : '') +
                   imageHtml +
                   '<div style="display:flex; gap:12px; margin-top:10px; align-items:center;">' +
                     '<button onclick="toggleLike(\'' + p.id + '\')" style="width:auto; background:none; border:none; color:' + (p.userHasLiked ? '#ff2a6d':'#94a3b8') + '; cursor:pointer; font-size:12px; font-weight:700;">❤️ <span id="likes_' + p.id + '">' + p.likesCount + '</span> Likes</button>' +
                     '<button onclick="openChatWithUser(\'' + p.author + '\')" style="width:auto; background:rgba(5,217,232,0.1); border:1px solid rgba(5,217,232,0.3); color:#05d9e8; padding:4px 10px; border-radius:6px; font-size:11px; cursor:pointer;">💬 Mensaje Privado</button>' +
                   '</div>' +
                   commentsHtml +
                   '<div style="display:flex; gap:6px; margin-top:10px;">' +
                     '<input type="text" id="comm_txt_' + p.id + '" placeholder="Comentar..." style="margin:0; font-size:11px; padding:8px;" autocomplete="off">' +
                     '<button onclick="sendComment(\'' + p.id + '\')" style="width:75px; margin:0; padding:8px; font-size:11px;">Enviar</button>' +
                   '</div>';

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
    list.innerHTML += '<div style="font-size:12px;"><b style="color:#05d9e8;">@' + data.comment.author + ':</b> ' + data.comment.text + '</div>';
  }
});

function loadNextMatchProfile() {
  const nameEl = document.getElementById('matchUsername');
  const avatarEl = document.getElementById('matchAvatar');
  const bioEl = document.getElementById('matchBio');

  if (discoveryList.length === 0) {
    nameEl.innerText = 'No hay más perfiles';
    avatarEl.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400';
    bioEl.innerText = 'Vuelve más tarde para conocer nuevos usuarios.';
    return;
  }
  if (currentDiscoveryIndex >= discoveryList.length) currentDiscoveryIndex = 0;
  
  const profile = discoveryList[currentDiscoveryIndex];
  nameEl.innerText = '@' + profile.username;
  avatarEl.src = profile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400';
  bioEl.innerText = profile.bio || 'Sin descripción';
}

function handleMatchAction(action) {
  if (discoveryList.length === 0) return;
  const targetUser = discoveryList[currentDiscoveryIndex].username;
  socket.emit('match:action', { user: currentUser.username, target: targetUser, action });
  currentDiscoveryIndex++;
  loadNextMatchProfile();
}

socket.on('match:success', (data) => {
  alert('🔥 ¡Es un Match! Hiciste conexión con @' + data.peer);
});

function openChatWithUser(username) {
  switchSpace('chat');
  currentChatPeer = username.trim().toLowerCase().replace('@', '');
  document.getElementById('chatHeaderInfo').innerHTML = 'Chat en vivo con @' + currentChatPeer;
  socket.emit('chat:load', { user1: currentUser.username, user2: currentChatPeer });
}

function renderActiveChats(chats) {
  const container = document.getElementById('chatContactsList');
  if (!chats || chats.length === 0) {
    container.innerHTML = '<div style="color: #64748b; font-size: 11px; text-align: center; padding-top: 20px;">Sin chats activos</div>';
    return;
  }
  container.innerHTML = '';
  chats.forEach(c => {
    container.innerHTML += '<div class="chat-contact-item" onclick="openChatWithUser(\'' + c.peer + '\')">' +
      '<img src="' + c.avatar + '" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">' +
      '<div style="overflow:hidden;">' +
        '<div style="font-size:12px; font-weight:700; color:#05d9e8;">@' + c.peer + '</div>' +
        '<div style="font-size:10px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + c.lastMessage + '</div>' +
      '</div>' +
    '</div>';
  });
}

socket.on('chat:history-loaded', (data) => {
  currentChatPeer = data.peer;
  document.getElementById('chatHeaderInfo').innerHTML = '💬 Chat en vivo con @' + data.peer;
  const box = document.getElementById('chatBox');
  box.innerHTML = '';
  if (data.history.length === 0) {
    box.innerHTML = '<div style="color:#64748b; text-align:center; margin:auto;">Inicia la conversación con @' + data.peer + '.</div>';
    return;
  }
  data.history.forEach(m => appendMsgToDOM(m));
  box.scrollTop = box.scrollHeight;
});

function sendChatMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value;
  if (!currentChatPeer || !text) return alert('Selecciona una conversación y escribe un mensaje.');
  socket.emit('chat:message', { sender: currentUser.username, recipient: currentChatPeer, text });
  input.value = '';
}

function handleChatKeypress(e) {
  if (e.key === 'Enter') sendChatMessage();
}

socket.on('chat:incoming', (msg) => {
  if (currentChatPeer && (msg.sender === currentChatPeer || msg.recipient === currentChatPeer)) {
    appendMsgToDOM(msg);
  }
  refreshData();
});

function appendMsgToDOM(m) {
  const box = document.getElementById('chatBox');
  const isMe = m.sender === currentUser.username;
  
  if (box.innerHTML.includes('Tus mensajes aparecerán') || box.innerHTML.includes('Inicia la conversación')) {
    box.innerHTML = '';
  }

  const div = document.createElement('div');
  div.className = 'msg-bubble ' + (isMe ? 'msg-me' : 'msg-peer');
  div.innerHTML = '<div style="font-size:10px; opacity:0.8; margin-bottom:2px;">@' + m.sender + '</div><div>' + m.text + '</div>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

socket.on('error-msg', (data) => { alert(data.message); });
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('SEXCITES.COM con sistema de match y bloqueo de pago BTC activo en puerto ' + PORT);
});
