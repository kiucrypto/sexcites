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
const friends = new Map();        // userId -> Set(friendIds)
const friendRequests = new Map(); // userId -> Map(senderId -> requestObj)
const messages = new Map();       // chatId -> [ {senderId, text, type, timestamp} ]
const posts = [];                 // [ {id, author, text, image, timestamp, likes: [], comments: []} ]
const userCodes = new Map();      // userId -> [ {code, plan, months, used} ]

const BTC_WALLET = "bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s";
const ETH_WALLET = "0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c";
const ADMIN_EMAIL = "po80payments@gmail.com";

function getChatId(id1, id2) {
  return id1 < id2 ? id1 + '_' + id2 : id2 + '_' + id1;
}

// ==========================================
// REST API ENDPOINTS
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).send('SEXCITES.COM V17.9 LIVE & FULLY OPERATIONAL');
});

app.post('/api/register', (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || username.trim().length < 2 || !password || password.trim().length < 3) {
      return res.json({ success: false, error: 'Por favor ingresa un usuario y contraseña válidos.' });
    }

    const cleanUser = username.trim().toLowerCase().replace('@', '');
    if (usersByName.has(cleanUser)) {
      return res.json({ success: false, error: 'Este nombre de usuario ya está en uso. Elige otro.' });
    }

    const userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const newUser = {
      id: userId,
      username: cleanUser,
      email: (email || '').trim().toLowerCase(),
      password: password,
      isFree: true,
      vipMonths: 2,
      createdAt: Date.now()
    };

    users.set(userId, newUser);
    usersByName.set(cleanUser, userId);
    friends.set(userId, new Set());
    friendRequests.set(userId, new Map());

    res.json({ success: true, user: newUser });
  } catch (err) {
    res.json({ success: false, error: 'Error en el servidor al registrar.' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { identifier, password } = req.body;
    const cleanId = (identifier || '').trim().toLowerCase().replace('@', '');
    
    if (!cleanId || !password) {
      return res.json({ success: false, error: 'Por favor completa todos los campos.' });
    }

    let userId = usersByName.get(cleanId);
    
    if (!userId) {
      for (let [uId, uObj] of users.entries()) {
        if (uObj.email === cleanId || uObj.username === cleanId) {
          userId = uId;
          break;
        }
      }
    }

    if (!userId) {
      return res.json({ success: false, error: 'Usuario no encontrado. Regístrate primero.' });
    }

    const user = users.get(userId);
    if (user.password !== password) {
      return res.json({ success: false, error: 'Contraseña incorrecta.' });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.json({ success: false, error: 'Error en el servidor al iniciar sesión.' });
  }
});

app.post('/api/pay-request', (req, res) => {
  const { userId, planType } = req.body;
  if (!users.has(userId)) return res.json({ success: false, error: 'Usuario inválido.' });

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
    message: 'Código generado. Envía tu comprobante a ' + ADMIN_EMAIL + ' junto con este código.' 
  });
});

app.post('/api/redeem', (req, res) => {
  const { userId, code } = req.body;
  if (!users.has(userId)) return res.json({ success: false, error: 'Usuario inválido.' });
  
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
    return res.json({ success: false, error: 'Código inválido o ya canjeado.' });
  }

  const user = users.get(userId);
  user.isFree = false;
  user.vipMonths = (user.vipMonths || 0) + targetMonths;

  res.json({ success: true, message: '¡Código canjeado con éxito! VIP activado por ' + targetMonths + ' meses.' });
});

app.post('/api/post', (req, res) => {
  const { userId, text, image } = req.body;
  const user = users.get(userId);
  if (!user || (!text && !image)) return res.json({ success: false, error: 'Contenido vacío.' });

  const newPost = {
    id: 'post_' + Date.now(),
    author: user.username,
    text: text ? text.trim() : '',
    image: image || null,
    timestamp: Date.now(),
    likes: [],
    comments: []
  };

  posts.unshift(newPost);
  io.emit('new-post', { ...newPost, likesCount: 0, userHasLiked: false });
  res.json({ success: true, post: newPost });
});

app.post('/api/post/like', (req, res) => {
  const { userId, postId } = req.body;
  const user = users.get(userId);
  const targetPost = posts.find(p => p.id === postId);

  if (!user || !targetPost) {
    return res.json({ success: false, error: 'Acción no válida.' });
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

app.post('/api/post/comment', (req, res) => {
  const { userId, postId, text, image } = req.body;
  const user = users.get(userId);
  const targetPost = posts.find(p => p.id === postId);

  if (!user || !targetPost || (!text && !image)) {
    return res.json({ success: false, error: 'Comentario vacío.' });
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
// SOCKET.IO — REAL-TIME 24/7
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
      socket.emit('error-msg', { message: 'El usuario no existe o no puedes agregarte a ti mismo.' });
      return;
    }

    const sender = users.get(senderId);
    if (!sender) return;

    const reqsMap = friendRequests.get(targetId);
    if (reqsMap.has(senderId)) {
      socket.emit('error-msg', { message: 'Ya enviaste una solicitud a este usuario.' });
      return;
    }

    const requestObj = { senderId, senderUsername: sender.username, timestamp: Date.now() };
    reqsMap.set(senderId, requestObj);

    io.to(targetId).emit('friend:request-received', requestObj);
    socket.emit('success-msg', { message: 'Solicitud enviada a @' + cleanTarget });
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
    const cleanPeer = (peerUsername || '').replace('@', '').trim().toLowerCase();
    const peerId = usersByName.get(cleanPeer);
    if(!peerId) {
      socket.emit('error-msg', { message: 'Usuario @' + cleanPeer + ' no encontrado.' });
      return;
    }
    const chatId = getChatId(userId, peerId);
    const history = messages.get(chatId) || [];
    socket.emit('chat:loaded', { peerId, peerUsername: cleanPeer, history });
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

// Front-End Interface
app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Comunidad Privada 18+</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }

body {
  background-color: #000000;
  color: #fff;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow-x: hidden;
  position: relative;
}

.hearts-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: hidden; }
.heart { position: absolute; bottom: -50px; font-size: 24px; animation: floatUpParticle 6s linear infinite; filter: drop-shadow(0 0 12px rgba(255,42,109,0.9)); opacity: 0.85; }
@keyframes floatUpParticle {
  0% { transform: translateY(0) scale(0.6) rotate(0deg); opacity: 0.9; }
  50% { transform: translateY(-55vh) scale(1.15) rotate(180deg); opacity: 0.7; }
  100% { transform: translateY(-110vh) scale(1.4) rotate(360deg); opacity: 0; }
}

.translate-float {
  position: fixed;
  top: 15px;
  right: 15px;
  background: rgba(12, 16, 38, 0.9);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 42, 109, 0.5);
  padding: 6px 14px;
  border-radius: 30px;
  box-shadow: 0 4px 25px rgba(255, 42, 109, 0.4);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
}
.translate-brand {
  font-size: 11px;
  font-weight: 700;
  background: linear-gradient(90deg, #ff2a6d, #05d9e8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
}
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
  background: rgba(10, 10, 15, 0.90);
  backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  box-shadow: 0 30px 60px rgba(0,0,0,0.95);
  z-index: 10;
  padding: 24px;
  margin: 15px;
}
h1 { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 4px; background: linear-gradient(90deg, #ff2a6d, #05d9e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.subtitle { font-size: 11px; text-align: center; color: #a5b4fc; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 1px; }

.founder-intro-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 42, 109, 0.3);
  border-radius: 14px;
  padding: 12px;
  margin-top: 15px;
  font-size: 11px;
  color: #cbd5e1;
  line-height: 1.4;
}
.founder-intro-box h3 { font-size: 12px; color: #ff2a6d; margin-bottom: 4px; font-weight: 700; }
.founder-intro-box ul { margin: 6px 0 6px 14px; }
.founder-signature { margin-top: 6px; text-align: right; font-style: italic; color: #05d9e8; font-weight: 600; }

.special-phrase-box {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #ff2a6d;
  text-shadow: 0 0 12px rgba(255, 42, 109, 0.6);
  letter-spacing: 0.5px;
}

.terms-footer {
  margin-top: 10px;
  text-align: center;
  font-size: 10px;
  color: #64748b;
  line-height: 1.3;
}
.terms-footer a { color: #05d9e8; text-decoration: none; }

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
input:focus { border-color: #ff2a6d; box-shadow: 0 0 12px rgba(255,42,109,0.4); }
button {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #ff2a6d 0%, #7928ca 100%);
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
.box-section { margin-top: 15px; background: rgba(0,0,0,0.4); padding: 15px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); }
.badge-free { background: rgba(34,197,94,0.2); color: #4ade80; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; margin-bottom: 10px; }
.wallet-box { font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.55); padding: 8px; border-radius: 8px; margin: 6px 0; word-break: break-all; color: #05d9e8; }
</style>
</head>
<body>

<div class="translate-float">
  <span class="translate-brand">SEXCITES Translate</span>
  <div id="google_translate_element"></div>
</div>
<script type="text/javascript">
  function googleTranslateElementInit() {
    new google.translate.TranslateElement({
      pageLanguage: 'es',
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
  <div class="subtitle">Comunidad Privada 18+ • Tiempo Real V17.9</div>

  <!-- AUTH VIEW -->
  <div id="authView">
    <div style="display:flex; gap:10px; margin-bottom:15px;">
      <button onclick="switchTab('reg')" id="btnRegTab" style="background:rgba(255,255,255,0.12)">Registrarse</button>
      <button onclick="switchTab('log')" id="btnLogTab" style="background:transparent">Iniciar Sesión</button>
    </div>

    <!-- REGISTER FORM -->
    <div id="regForm">
      <div style="font-size:11px; color:#4ade80; margin-bottom:8px; text-align:center;">🔥 ¡Regístrate rápido y entra al sistema!</div>
      <input type="text" id="rUser" placeholder="Usuario (ej. tu_nombre)" autocomplete="off">
      <input type="email" id="rEmail" placeholder="Correo electrónico (Opcional)" autocomplete="off">
      <input type="password" id="rPass" placeholder="Contraseña (Mínimo 3 caracteres)" autocomplete="off">
      <button onclick="registerUser()">Crear Cuenta y Entrar</button>
    </div>

    <!-- SIGN IN FORM -->
    <div id="logForm" class="hidden">
      <div style="font-size:11px; color:#05d9e8; margin-bottom:8px; text-align:center;">🔐 Inicia sesión con tu usuario y contraseña</div>
      <input type="text" id="lUser" placeholder="Usuario o Correo" autocomplete="off">
      <input type="password" id="lPass" placeholder="Contraseña" autocomplete="off">
      <button onclick="loginUser()">Entrar al Sistema</button>
    </div>

    <div id="authError" style="color:#f87171; font-size:12px; text-align:center; margin-top:10px; font-weight:600;"></div>

    <div class="founder-intro-box">
      <h3>🚀 Gran Debut Oficial (06-09-2026)</h3>
      <p>Bienvenido a <b>SEXCITES.com</b>. Comunidad segura con funciones en tiempo real y traductor integrado.</p>
      <div class="founder-signature"><b>Jhon Gonzales (Fundador)</b></div>
    </div>

    <div class="special-phrase-box">
      ✨ "Darte una oportunidad en la vida nunca es tarde" ✨
    </div>

    <div class="terms-footer">
      Al registrarte aceptas nuestros <a href="#" onclick="alert('Términos y Condiciones: Plataforma exclusiva para mayores de 18 años.'); return false;">Términos y Condiciones</a>. © 2026 SEXCITES.com.
    </div>

  </div>

  <!-- DASHBOARD VIEW -->
  <div id="dashboardView" class="hidden">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <span id="welcomeUser" style="font-weight:600; color:#05d9e8;"></span>
      <span class="badge-free" id="badgeStatus">Acceso VIP Activo</span>
    </div>

    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px; margin-bottom:12px;">
      <button onclick="switchDashTab('inbox')" id="tabBtnInbox" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.2)">Bandeja</button>
      <button onclick="switchDashTab('chat')" id="tabBtnChat" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.1)">Chat</button>
      <button onclick="switchDashTab('wall')" id="tabBtnWall" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.1)">Muro</button>
      <button onclick="switchDashTab('pay')" id="tabBtnPay" style="font-size:11px; padding:6px; background:rgba(255,255,255,0.1)">Pagos</button>
    </div>

    <!-- 1. INBOX -->
    <div id="secInbox" class="box-section">
      <p style="font-size:12px; margin-bottom:8px; color:#05d9e8;"><b>📥 Solicitudes y Amigos</b></p>
      <input type="text" id="friendInput" placeholder="Añadir por usuario (ej: @nombre)" autocomplete="off">
      <button onclick="sendFriendRequest()" style="margin-bottom:12px; font-size:12px;">Enviar Solicitud</button>
      <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;"><b>Solicitudes Pendientes:</b></div>
      <div id="inboxList" style="background:rgba(0,0,0,0.45); border-radius:8px; padding:8px; max-height:140px; overflow-y:auto; font-size:12px;">
        <span id="noReq" style="color:#94a3b8;">No hay solicitudes pendientes</span>
      </div>
    </div>

    <!-- 2. LIVE CHAT -->
    <div id="secChat" class="box-section hidden">
      <p style="font-size:12px; margin-bottom:8px; color:#ff2a6d;"><b>💬 Chat Directo y Fotos</b></p>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <input type="text" id="msgPeerUsername" placeholder="Usuario Amigo" autocomplete="off" style="margin:0;">
        <button onclick="loadChatHistory()" style="width:110px; margin:0; font-size:11px;">Cargar Chat</button>
      </div>
      <div id="chatBox" style="height:150px; background:rgba(0,0,0,0.45); border-radius:8px; padding:8px; overflow-y:auto; font-size:12px; margin-bottom:8px;">
        <div style="color:#94a3b8; text-align:center; padding-top:40px;">Escribe el usuario arriba y carga el historial.</div>
      </div>
      <div style="display:flex; gap:6px;">
        <input type="text" id="msgText" placeholder="Escribe un mensaje..." autocomplete="off" style="margin:0;">
        <input type="file" id="imageInput" accept="image/*" style="display:none;" onchange="sendPhoto(event)">
        <button onclick="document.getElementById('imageInput').click()" style="width:45px; margin:0; background:#334155;" title="Enviar Foto">📷</button>
        <button onclick="sendMessage()" style="width:70px; margin:0;">Enviar</button>
      </div>
    </div>

    <!-- 3. WALL SECTION -->
    <div id="secWall" class="box-section hidden">
      <textarea id="wallText" placeholder="¿Qué estás pensando en SEXCITES.COM?" style="width:100%; height:55px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:10px; color:#fff; padding:8px; font-size:12px; margin-bottom:6px; outline:none;" autocomplete="off"></textarea>
      <div style="display:flex; gap:6px; margin-bottom:10px;">
        <input type="file" id="wallImageInput" accept="image/*" style="display:none;" onchange="previewWallImage(event)">
        <button onclick="document.getElementById('wallImageInput').click()" style="width:auto; padding:8px 12px; font-size:11px; background:#334155;">📷 Añadir Foto</button>
        <button onclick="createPost()" style="font-size:12px; flex:1;">Publicar en el Muro</button>
      </div>
      <div id="wallImagePreview" style="font-size:11px; color:#4ade80; margin-bottom:6px; display:none;">¡Imagen adjuntada con éxito!</div>
      <div id="wallFeed" style="max-height:220px; overflow-y:auto; font-size:12px;"></div>
    </div>

    <!-- 4. PAYMENTS & REDEEM -->
    <div id="secPay" class="box-section hidden">
      <p style="font-size:12px; margin-bottom:6px; color:#cbd5e1;"><b>BTC y ETH (Verificación Directa por Email):</b></p>
      <div style="font-size:11px;">BTC Real:</div>
      <div class="wallet-box">${BTC_WALLET}</div>
      <div style="font-size:11px;">ETH Real:</div>
      <div class="wallet-box">${ETH_WALLET}</div>
      
      <select id="selectPlan" style="width:100%; padding:10px; background:#1e293b; color:#fff; border-radius:8px; border:none; margin:8px 0; font-size:12px;">
        <option value="REAL">$8.99 = 4 Meses REAL</option>
        <option value="VIP">$16.99 = 8 Meses VIP</option>
        <option value="ONE_TIME">$28.99 = 12 Meses Full</option>
      </select>
      
      <button onclick="requestPaymentCode()" style="font-size:12px; margin-bottom:8px;">Obtener Código e Instrucciones</button>
      <div id="codeResultArea" style="font-size:11px; background:rgba(0,0,0,0.55); padding:8px; border-radius:8px; word-break:break-all; margin-bottom:8px;">Haz clic arriba para generar tu código y enviar captura a po80payments@gmail.com</div>
      
      <input type="text" id="redeemInput" placeholder="Canjear Código SEXCITES-XXXX" autocomplete="off">
      <button onclick="redeemCode()" style="font-size:12px; background:#10b981;">Canjear Meses VIP</button>
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
  const symbols = ['💖', '💗', '❤️', '🔥', '✨'];
  heart.innerHTML = symbols[Math.floor(Math.random() * symbols.length)];
  heart.style.left = Math.random() * 100 + 'vw';
  heart.style.animationDuration = (4.5 + Math.random() * 4) + 's';
  container.appendChild(heart);
  setTimeout(() => { heart.remove(); }, 8000);
}
setInterval(createHeart, 350);

function switchTab(tab) {
  document.getElementById('authError').innerText = '';
  if(tab === 'reg') {
    document.getElementById('regForm').classList.remove('hidden');
    document.getElementById('logForm').classList.add('hidden');
    document.getElementById('btnRegTab').style.background = 'rgba(255,255,255,0.12)';
    document.getElementById('btnLogTab').style.background = 'transparent';
  } else {
    document.getElementById('regForm').classList.add('hidden');
    document.getElementById('logForm').classList.remove('hidden');
    document.getElementById('btnLogTab').style.background = 'rgba(255,255,255,0.12)';
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
  const errorBox = document.getElementById('authError');
  errorBox.innerText = '';

  if(!username || !password) {
    errorBox.innerText = 'Ingresa usuario y contraseña.';
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if(data.success) {
      initUserSession(data.user);
    } else {
      errorBox.innerText = data.error;
    }
  } catch(e) {
    errorBox.innerText = 'Error de conexión. Inténtalo de nuevo.';
  }
}

async function loginUser() {
  const identifier = document.getElementById('lUser').value;
  const password = document.getElementById('lPass').value;
  const errorBox = document.getElementById('authError');
  errorBox.innerText = '';

  if(!identifier || !password) {
    errorBox.innerText = 'Ingresa usuario y contraseña.';
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ identifier, password })
    });
    const data = await res.json();
    if(data.success) {
      initUserSession(data.user);
    } else {
      errorBox.innerText = data.error;
    }
  } catch(e) {
    errorBox.innerText = 'Error de conexión. Inténtalo de nuevo.';
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
  box.innerHTML += '<div style="margin-top:6px; background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span>De: <b>@' + data.senderUsername + '</b></span> <button onclick="acceptRequest(\\'' + data.senderId + '\\', \\'' + data.senderUsername + '\\')" style="width:auto; padding:4px 10px; font-size:10px;">Aceptar</button></div>';
});

function sendFriendRequest() {
  const targetUsername = document.getElementById('friendInput').value;
  socket.emit('friend:request', { senderId: currentUser.id, targetUsername });
  document.getElementById('friendInput').value = '';
}

function acceptRequest(senderId, senderUsername) {
  socket.emit('friend:accept', { userId: currentUser.id, senderId });
  alert('¡Solicitud aceptada! Ya puedes chatear con @' + senderUsername);
  document.getElementById('msgPeerUsername').value = senderUsername;
  switchDashTab('chat');
  loadChatHistory();
}

function loadChatHistory() {
  const peerUser = document.getElementById('msgPeerUsername').value.replace('@', '').trim().toLowerCase();
  if(!peerUser) return alert('Ingresa el usuario de un amigo');
  socket.emit('chat:load-by-username', { userId: currentUser.id, peerUsername: peerUser });
}

socket.on('chat:loaded', (data) => {
  currentPeerId = data.peerId;
  const chatBox = document.getElementById('chatBox');
  chatBox.innerHTML = '';
  if(data.history.length === 0) {
    chatBox.innerHTML = '<div style="color:#94a3b8; text-align:center;">No hay mensajes previos. ¡Empieza a chatear!</div>';
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
  const senderLabel = isMe ? 'Tú' : '@' + peerName;
  const color = isMe ? '#05d9e8' : '#ff2a6d';
  
  let content = m.text;
  if(m.type === 'image') {
    content = '<br><img src="' + m.text + '" style="max-width:140px; border-radius:8px; margin-top:4px;">';
  }

  chatBox.innerHTML += '<div style="margin-bottom:6px;"><b style="color:' + color + ';">' + senderLabel + ':</b> ' + content + '</div>';
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
  const text = document.getElementById('msgText').value;
  if(!currentPeerId || !text) return alert('Carga el historial de un chat o escribe un mensaje.');
  socket.emit('chat:message', { senderId: currentUser.id, recipientId: currentPeerId, text, type: 'text' });
  document.getElementById('msgText').value = '';
}

function sendPhoto(event) {
  const file = event.target.files[0];
  if(!file || !currentPeerId) return alert('Carga un chat primero antes de enviar fotos.');
  const reader = new FileReader();
  reader.onload = function(e) {
    socket.emit('chat:message', { senderId: currentUser.id, recipientId: currentPeerId, text: e.target.result, type: 'image' });
  };
  reader.readAsDataURL(file);
}

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
  if(!text && !attachedWallImage) return alert('Escribe algo o adjunta una imagen.');

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
    container.innerHTML += '<div style="margin-top:4px; padding:6px; background:rgba(0,0,0,0.25); border-radius:6px;"><b style="color:#05d9e8;">@' + data.comment.author + ':</b> ' + data.comment.text + imgHTML + '</div>';
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
  div.style.cssText = "background:rgba(255,255,255,0.03); padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.06);";
  
  let imgHTML = p.image ? '<br><img src="' + p.image + '" style="max-width:100%; border-radius:8px; margin-top:6px;">' : '';
  let likesCount = p.likesCount !== undefined ? p.likesCount : (p.likes ? p.likes.length : 0);
  let hasLiked = p.userHasLiked !== undefined ? p.userHasLiked : (p.likes && p.likes.includes(currentUser.id));
  let likeColor = hasLiked ? '#ff2a6d' : '#cbd5e1';

  let commentsHTML = '<div id="comments_for_' + p.id + '" style="margin-top:8px; padding-left:10px; border-left:2px solid rgba(255,42,109,0.4);">';
  if(p.comments) {
    p.comments.forEach(c => {
      let cImg = c.image ? '<br><img src="' + c.image + '" style="max-width:120px; border-radius:6px; margin-top:3px;">' : '';
      commentsHTML += '<div style="margin-top:4px; padding:6px; background:rgba(0,0,0,0.25); border-radius:6px;"><b style="color:#05d9e8;">@' + c.author + ':</b> ' + c.text + cImg + '</div>';
    });
  }
  commentsHTML += '</div>';

  div.innerHTML = '<b style="color:#ff2a6d;">@' + p.author + '</b>' +
                  '<p style="margin-top:2px; color:#e2e8f0;">' + p.text + '</p>' + imgHTML +
                  '<div style="display:flex; gap:15px; margin-top:8px; font-size:11px;">' +
                    '<button onclick="toggleLike(\\\'' + p.id + '\\\')" id="like_btn_' + p.id + '" style="width:auto; background:none; border:none; color:' + likeColor + '; cursor:pointer; padding:0; font-weight:600;">❤️ <span id="likes_count_' + p.id + '">' + likesCount + '</span> Me gusta</button>' +
                    '<button onclick="sharePost(\\\'' + p.id + '\\\')" style="width:auto; background:none; border:none; color:#05d9e8; cursor:pointer; padding:0; font-weight:600;">🔗 Compartir</button>' +
                  '</div>' +
                  commentsHTML +
                  '<div style="display:flex; gap:4px; margin-top:8px;">' +
                    '<input type="text" id="reply_text_' + p.id + '" placeholder="Escribe respuesta..." style="margin:0; font-size:11px; padding:6px;">' +
                    '<input type="file" id="reply_img_' + p.id + '" accept="image/*" style="display:none;" onchange="handleReplyImage(event, \\\\'' + p.id + '\\\\')">' +
                    '<button onclick="document.getElementById(\\\'reply_img_' + p.id + '\\\').click()" style="width:36px; margin:0; padding:0; background:#334155; font-size:12px;" title="Foto">📷</button>' +
                    '<button onclick="sendComment(\\\'' + p.id + '\\\')" style="width:70px; margin:0; padding:6px; font-size:11px;">Responder</button>' +
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
      btn.style.color = '#ff2a6d';
    } else {
      btn.style.color = '#cbd5e1';
    }
  }
}

function sharePost(postId) {
  navigator.clipboard.writeText(window.location.origin + '#post-' + postId);
  alert('¡Enlace de la publicación copiado al portapapeles!');
}

const replyImages = {};
function handleReplyImage(event, postId) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    replyImages[postId] = e.target.result;
    alert('¡Foto adjuntada a la respuesta!');
  };
  reader.readAsDataURL(file);
}

async function sendComment(postId) {
  const textInput = document.getElementById('reply_text_' + postId);
  const text = textInput.value;
  const image = replyImages[postId] || null;

  if(!text && !image) return alert('Escribe una respuesta o adjunta una imagen.');

  const res = await fetch('/api/post/comment', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, postId, text, image })
  });
  const data = await res.json();
  if(data.success) {
    textInput.value = '';
    delete replyImages[postId];
  }
}

async function requestPaymentCode() {
  const planType = document.getElementById('selectPlan').value;
  const res = await fetch('/api/pay-request', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ userId: currentUser.id, planType })
  });
  const data = acid = await res.json();
  if(data.success) {
    document.getElementById('codeResultArea').innerHTML = '<b style="color:#4ade80;">Código: ' + data.hiddenCode + '</b><br><span style="color:#cbd5e1;">Envía captura a ' + data.adminEmail + '</span>';
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
    document.getElementById('badgeStatus').innerText = 'VIP Activo';
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
  console.log('SEXCITES.COM V17.9 running on port ' + PORT);
});
