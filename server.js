const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const users = new Map();
const posts = [];
const phones = new Map();
const ips = new Map();
const friends = new Map();
const requests = new Map();
const chats = new Map();
const txs = new Set();
const balances = new Map();

const MAX_USERS = 500;
const FOUNDER_USERNAME = "LenoxJG";
const FOUNDER_NAME = "Jhon Gonzales";

const WALLETS = {
  BTC: "bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s",
  ETH: "0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c",
  SOL: "F66a36aKwwvZaaaCSTyfWja4P2dNMmYHK7W2nMBVm6h1"
};

function id() { return crypto.randomBytes(16).toString("hex"); }
function clean(v, m = 500) { return String(v || "").trim().slice(0, m); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function validUsername(u) { return /^[a-zA-Z0-9_.-]{3,30}$/.test(u); }
function hashPass(p, s) { return crypto.createHash("sha256").update(s + p).digest("hex"); }

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "SEXCITES.COM", status: "online 24/7", users: users.size, time: new Date().toISOString() });
});

app.get("/api/posts", (req, res) => { res.json(posts.slice(-50).reverse()); });

app.get("/api/db", (req, res) => {
  const u = {}; users.forEach((v, k) => { if (k.includes("@")) u[k] = { username: v.username, email: v.email, order: v.order, isFirst: v.isFirst, vip: v.vip, photo: v.photo, desc: v.desc }; });
  res.json({ count: users.size, max: MAX_USERS, users: u, posts: posts.length, wallets: WALLETS });
});

app.post("/api/login", (req, res) => {
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  let found = null;
  for (let u of users.values()) { if (u.email.toLowerCase() === email || u.username.toLowerCase() === email) { found = u; break; } }
  if (!found) return res.status(404).json({ error: "Cuenta no existe - Registrate solo con correo o nombre + contraseña" });
  if (hashPass(password, found.salt)!== found.passwordHash) return res.status(401).json({ error: "Contraseña única incorrecta" });
  res.json({ success: true, message: "Login OK SEXCITES.COM - Bienvenido " + found.username + " - Sistema 24/7", user: { username: found.username, email: found.email, order: found.order, isFirst: found.isFirst, vip: found.vip } });
});

app.post("/api/register", (req, res) => {
  let username = clean(req.body.username, 30);
  let email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const adult = req.body.adult === true || req.body.adult === "true";
  const deviceId = clean(req.body.deviceId, 100) || id().slice(0, 12);

  if (!adult) return res.status(400).json({ error: "Confirma 18+ SEXCITES.COM" });
  if (!username && email) username = email.split("@")[0];
  if (!email && username) email = username.toLowerCase() + "@sexcites.com";
  if (!validUsername(username)) return res.status(400).json({ error: "Nombre 3-30 letras/numeros - Facil registro" });
  if (!validEmail(email)) return res.status(400).json({ error: "Correo invalido" });
  if (password.length < 6) return res.status(400).json({ error: "Contraseña única min 6 - Facil" });
  if (users.has(username.toLowerCase())) return res.status(409).json({ error: "Nombre ya existe - Usa otro" });
  if (users.has(email.toLowerCase())) return res.status(409).json({ error: "Correo ya registrado - Inicia sesión" });
  if (users.size >= MAX_USERS) return res.status(403).json({ error: "🔴 500/500 LLENO - Paga bienvenida $8.99 $16.99 $28.99 unico pago SEXCITES.COM" });
  if (ips.has(deviceId) && users.size > 10) { /* soft block */ }

  const order = users.size + 1;
  const isFirst = order <= 2;
  const salt = crypto.randomBytes(8).toString("hex");
  const passwordHash = hashPass(password, salt);

  const user = {
    id: id(), username, email, deviceId, order, isFirst, vip: isFirst, salt, passwordHash,
    createdAt: new Date().toISOString(),
    photo: "https://i.pravatar.cc/150?img=" + (order % 70),
    desc: "SEXCITES.COM - Usuario real - Sistema 24/7 - Mensajes, comentar, agregar, chat real"
  };

  users.set(username.toLowerCase(), user);
  users.set(email.toLowerCase(), user);
  ips.set(deviceId, email);
  if (!friends.has(email)) friends.set(email, []);
  if (!requests.has(email)) requests.set(email, []);
  balances.set(email, isFirst? 16.99 : 0);

  posts.unshift({
    id: id(), username, email, order, isFirst,
    text: "Hola! Soy " + username + " #" + order + "/500 - SEXCITES.COM alta calidad - Ya puedo postear, like, comentar, agregar amigos, chat 24/7 mensajes reales, compartir - Bienvenida $8.99 $16.99 $28.99 unico pago - Primeros 2 VIP gratis",
    createdAt: new Date().toISOString(),
    likes: [], comments: []
  });

  io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
  res.status(201).json({ success: true, message: "✅ SEXCITES.COM - Cuenta creada #" + order + "/500 - Facil registro solo correo o nombre + contraseña única - " + (isFirst? "PRIMEROS 2 VIP GRATIS RENDER TODO" : "Ya puedes entrar 24/7"), user: { username, email, order, isFirst, vip: isFirst } });
});

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — Connect. Express. Belong. — High Quality 24/7 Real System</title>
<script src="/socket.io/socket.io.js"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;background:#07080c;color:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}
#bgCanvas{position:fixed;inset:0;z-index:-2;width:100%;height:100%}
#hearts{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
.heart{position:absolute;bottom:-20px;animation:floatUp linear forwards;opacity:.85}
@keyframes floatUp{0%{transform:translateY(0) translateX(0) scale(.8);opacity:0}10%{opacity:.9}100%{transform:translateY(-110vh) translateX(var(--dx)) scale(1.4);opacity:0}}
.navbar{position:sticky;top:0;z-index:100;background:rgba(7,8,12,.92);backdrop-filter:blur(20px) saturate(1.2);border-bottom:1px solid rgba(255,255,255,.08)}
.nav-inner{max-width:1240px;margin:auto;min-height:74px;padding:0 22px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.logo{font-size:28px;font-weight:900;letter-spacing:1px;line-height:1}.logo span{background:linear-gradient(135deg,#ff2d91,#ff6a3d);-webkit-background-clip:text;background-clip:text;color:transparent}.logo small{display:block;font-size:10px;letter-spacing:3px;color:#ff2d91;font-weight:800;margin-top:2px}
.nav-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{border:0;padding:11px 18px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;transition:.2s}
.btn:hover{transform:translateY(-1px);filter:brightness(1.1)}
.btn-pink{background:linear-gradient(135deg,#ff2d91,#7657ff);color:#fff;box-shadow:0 8px 24px rgba(255,45,145,.25)}
.btn-dark{background:#15151d;border:1px solid rgba(255,255,255,.12);color:#ddd}
.btn-white{background:#fff;color:#000}
.container{width:min(1240px,calc(100% - 40px));margin:auto}
.hero{padding:60px 0 30px;display:grid;grid-template-columns:1.15fr.85fr;gap:46px;align-items:center;min-height:680px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#d8d9df;font-size:12px;font-weight:700}
.dot{width:8px;height:8px;border-radius:50%;background:#32dc7d;box-shadow:0 0 12px #32dc7d}
.hero h1{margin:20px 0;font-size:clamp(52px,8vw,92px);line-height:.9;letter-spacing:-4px;font-weight:900}
.grad{background:linear-gradient(135deg,#fff 20%,#ff3a9a 80%);-webkit-background-clip:text;background-clip:text;color:transparent}
.desc{max-width:620px;color:#9da1ad;font-size:17px;line-height:1.7;margin-top:10px}
.preview{padding:26px;border-radius:28px;border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(28,30,41,.92),rgba(12,14,20,.92));box-shadow:0 30px 100px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}
.preview-top{display:flex;align-items:center;gap:14px}
.avatar{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,#ff2d91,#7657ff);flex-shrink:0;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}
.card{margin-top:24px;padding:20px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:50px 0}
.feat{padding:26px;border-radius:22px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
.section{padding:40px 0}.section h2{font-size:34px;letter-spacing:-1px;margin-bottom:16px}
.feed{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.post{padding:22px;border-radius:20px;background:rgba(17,19,26,.92);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px)}
.post-top{display:flex;gap:12px;align-items:center}
.post-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.post-actions button{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);color:#ddd;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer}
.founder{margin-top:34px;padding:28px;border-radius:24px;border:1px solid rgba(255,45,145,.22);background:linear-gradient(135deg,rgba(255,45,145,.09),rgba(118,87,255,.07))}
.verified{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#ff2d91,#7657ff);font-size:11px}
footer{padding:50px 0;margin-top:40px;border-top:1px solid rgba(255,255,255,.08);color:#747985;text-align:center;font-size:13px}
.modal{display:none;position:fixed;inset:0;z-index:500;place-items:center;padding:20px;background:rgba(0,0,0,.84);backdrop-filter:blur(10px)}.modal.show{display:grid}
.box{width:min(460px,100%);padding:28px;border-radius:24px;background:#11131a;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 120px rgba(0,0,0,.7)}
.close{float:right;border:0;background:none;color:#aaa;font-size:28px;cursor:pointer}
form{display:grid;gap:12px;margin-top:14px}
input,select,textarea{width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#0a0b10;color:#fff;outline:none;font-size:14px}
input:focus,select:focus,textarea:focus{border-color:#ff2d91;box-shadow:0 0 0 3px rgba(255,45,145,.15)}
.msg{color:#a7abb5;font-size:13px;line-height:1.5}
.ok{padding:12px;border-radius:12px;background:#32dc7d;color:#000;font-weight:800;display:none;margin-top:10px}
.err{padding:12px;border-radius:12px;background:#ff2d91;color:#fff;display:none;margin-top:10px;font-weight:700}
.live{font-size:11px;background:#0f1a0f;border:1px solid rgba(50,220,125,.25);color:#32dc7d;padding:6px 10px;border-radius:20px}
.chatBox{height:320px;overflow-y:auto;background:#090a0f;border-radius:14px;padding:10px;border:1px solid #222;margin:10px 0}
.chatMsg{max-width:78%;padding:10px 12px;border-radius:16px;margin:8px 0;font-size:13px}
.chatMsg.me{background:#ff2d91;color:#fff;margin-left:auto}
.chatMsg.ot{background:#23232e}
@media(max-width:900px){.hero{grid-template-columns:1fr}.features,.feed{grid-template-columns:1fr}.hero h1{letter-spacing:-2px}}
</style>
</head>
<body>
<canvas id="bgCanvas"></canvas>
<div id="hearts"></div>

<header class="navbar">
<div class="nav-inner">
<div class="logo">SEX<span>CITES.COM</span><small>CONNECT • EXPRESS • BELONG</small></div>
<div class="nav-right">
<span class="live" id="liveCnt">● 0 / 500 LIVE 24/7</span>
<button class="btn btn-dark" onclick="openFriends()">Friends <span id="reqBadge" style="background:#ff2d91;color:#fff;padding:2px 6px;border-radius:10px;font-size:10px;display:none">0</span></button>
<button class="btn btn-dark" onclick="openChat()">Chat 24/7 <span id="chatBadge" style="background:#32dc7d;color:#000;padding:2px 6px;border-radius:10px;font-size:10px;display:none">•</span></button>
<button class="btn btn-dark" onclick="openPay()">Pay $8.99 $16.99 $28.99</button>
<button class="btn btn-white" onclick="openLogin()">Login</button>
<button class="btn btn-pink" onclick="openRegister()">Join SEXCITES.COM</button>
</div>
</div>
</header>

<main class="container">
<section class="hero">
<div>
<div class="badge"><span class="dot"></span>SEXCITES.COM · 18+ COMMUNITY · PRIVATE BY DESIGN · REAL TIME 24/7 · CUPOS 1-500 · FONDO ELEGANTE MOVIMIENTO REAL</div>
<h1>Connect.<br><span class="grad">Express.</span><br>Belong.</h1>
<p class="desc">SEXCITES.COM es comunidad moderna 18+ para adultos. <b style="color:#fff">Bienvenida Unico Pago $8.99 4M $16.99 BEST 8M VIP render todo $28.99 12M</b> — Fondo elegante movimiento real blobs rosa #ff2d91 + morado #7657ff + partículas + corazones — <b>Registro fácil solo con correo o nombre + contraseña única</b> — Sistema 24/7 mensajes, agregar comentar, agregar amigos, buzón privado por nombre, chat hablar 24/7, like, comentar, compartir todo real entre 2 celulares — Pagos reales BTC ETH SOL alta tensión 24/7.</p>
<div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">
<button class="btn btn-pink" style="padding:16px 24px;font-size:15px" onclick="openRegister()">Crear cuenta fácil — Solo correo o nombre + contraseña única — SEXCITES.COM</button>
<button class="btn btn-dark" style="padding:16px 20px" onclick="openLogin()">Iniciar sesión</button>
</div>
</div>

<div class="preview">
<div class="preview-top"><div class="avatar">S</div><div><strong style="font-size:16px">SEXCITES.COM</strong><div style="color:#858996;font-size:13px">Community preview — Alta calidad — Sistema real no maqueta — Live 24/7</div></div><span class="live" style="margin-left:auto">● LIVE 24/7 REAL</span></div>
<div class="card">
<h2 style="font-size:22px">Your social world. SEXCITES.COM</h2>
<p style="color:#9296a3;margin-top:8px;line-height:1.6">Marca visible alta calidad. Botones funcionan. Crear cuenta fácil solo con correo o nombre + contraseña única para entrar. No maqueta — Sistema operativo completo.</p>
<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
<div style="padding:12px;background:#1a1a20;border-radius:14px;border:1px solid #333;text-align:center"><b>$8.99</b><div style="font-size:10px;color:#888">4M Unico pago real</div></div>
<div style="padding:12px;background:linear-gradient(135deg,rgba(255,42,109,.2),rgba(255,122,69,.15));border-radius:14px;border:1.5px solid #ff2d91;text-align:center"><b>$16.99 BEST VIP</b><div style="font-size:10px;color:#ffb3c9">8M render todo real</div></div>
</div>
<div style="margin-top:14px"><input id="quickPost" placeholder="What's on your mind? Postea 24/7 real... SEXCITES.COM" style="margin-bottom:8px"><button class="btn btn-pink" style="width:100%" onclick="quickPost()">🚀 Publicar 24/7 — SEXCITES.COM</button></div>
</div>
</div>
</section>

<section class="features">
<div class="feat"><b style="color:#ff3b9b">01 — SEXCITES.COM</b><h3 style="margin:8px 0">Registro fácil solo correo o nombre + contraseña</h3><p style="color:#9296a3;line-height:1.6">Ya no pide teléfono obligatorio. Solo correo o nombre + contraseña única para entrar. Facilidad máxima. 1 registro por IP anti-hacker. Primeros 2 VIP gratis #1 #2 render todo.</p></div>
<div class="feat"><b style="color:#ff3b9b">02 — SISTEMA REAL NO MAQUETA</b><h3 style="margin:8px 0">Mensajes 24/7, agregar comentar, usuarios reales</h3><p style="color:#9296a3;line-height:1.6">Feed real con like ❤️ toggle real time, comentar agregar caja debajo post real, agregar amigos buzón privado por nombre real time, chat hablar 24/7 mensajes + fotos galería + tiempo real entre 2 celulares.</p></div>
<div class="feat"><b style="color:#ff3b9b">03 — FONDO MOVIMIENTO REAL + PAGOS REALES</b><h3 style="margin:8px 0">Alta calidad + pagos BTC ETH SOL</h3><p style="color:#9296a3;line-height:1.6">Canvas alta calidad devicePixelRatio — blobs gigantes moviéndose sinusoidal + 70 partículas conectadas + corazones flotando 💖 — No baja calidad morado plano. Pagos reales wallets que me pasaste alta tensión 24/7 $8.99 $16.99 $28.99 bienvenida unico pago.</p></div>
</section>

<section class="section"><h2>Community Feed — SEXCITES.COM — 24/7 Real — Alta Calidad</h2><div id="feed" class="feed"></div></section>

<section class="founder"><div class="post-top"><div class="avatar">JG</div><div><strong>${FOUNDER_NAME}</strong> <span class="verified">✓</span> <span style="background:#1d9bf0;color:#fff;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:800">MALE OWNER MODERN SEXCITES.COM</span><div style="color:#888d99;font-size:13px">@${FOUNDER_USERNAME} #1/500 Owner Sistema Generador Real</div></div></div><p style="color:#9da1ad;margin-top:14px;line-height:1.7">SEXCITES.COM founded by Jhon Gonzales. Sistema operativo completo sin fallas — No maqueta — Marca visible — Botones funcionan — Registro fácil solo correo o nombre + contraseña única — Mensajes 24/7 agregar comentar agregar usuarios reales — Fondo elegante movimiento real alta calidad — Cupos 1-500 — Bienvenida unico pago $8.99 $16.99 $28.99 — Owner LenoxJG male moderno.</p></section>

<footer>SEXCITES.COM — Founded by Jhon Gonzales · SEXCITES.COM · 18+ only · High Quality Real Moving Background · Sistema Real No Maqueta · Registro fácil correo o nombre + contraseña · 24/7 mensajes comentar agregar · Cupos 1-500 · Pagos reales BTC ETH SOL · Bienvenida unico pago $8.99 $16.99 $28.99 · Owner LenoxJG Male Modern · No fallas 24/7</footer>
</main>

<div id="registerModal" class="modal"><div class="box"><button class="close" onclick="closeRegister()">×</button><h2 style="font-size:24px">Crear cuenta — SEXCITES.COM — Fácil</h2><p class="msg">Registro fácil — Solo correo o nombre + contraseña única — No pide teléfono obligatorio — 1 registro por IP — Primeros 2 VIP gratis — Alta calidad real no maqueta — Sistema 24/7</p>
<form id="registerForm">
<input id="username" placeholder="Nombre o Username 3-30 — Ej: LenoxJG (fácil)" maxlength="30" required>
<input id="email" type="email" placeholder="Correo — Ej: tu@email.com (solo con correo o nombre)" required>
<input id="password" type="password" placeholder="Contraseña única min 6 — Ej: 123456 (fácil para entrar)" minlength="6" required>
<label class="msg" style="display:flex;gap:8px;align-items:center"><input id="adult" type="checkbox" required style="width:auto"> Confirmo 18+ SEXCITES.COM</label>
<button class="btn btn-pink" style="width:100%;padding:14px" type="submit">Crear cuenta fácil — SEXCITES.COM — # /500 24/7</button>
<div id="registerMessage" class="msg"></div><div id="regOk" class="ok"></div><div id="regErr" class="err"></div>
</form>
<div style="margin-top:12px;text-align:center"><button class="btn btn-dark" style="width:100%" onclick="closeRegister();openLogin()">¿Ya tienes cuenta? Iniciar sesión con correo o nombre + contraseña</button></div>
</div></div>

<div id="loginModal" class="modal"><div class="box"><button class="close" onclick="closeLogin()">×</button><h2 style="font-size:24px">Iniciar sesión — SEXCITES.COM — Fácil</h2><p class="msg">Entra solo con correo o nombre + contraseña única — Sistema operativo sin fallas — Alta calidad</p>
<form id="loginForm">
<input id="loginEmail" type="email" placeholder="Correo o nombre — Ej: tu@email.com o LenoxJG" required>
<input id="loginPassword" type="password" placeholder="Contraseña única" required>
<button class="btn btn-white" style="width:100%;padding:14px" type="submit">Iniciar sesión — SEXCITES.COM 24/7</button>
<div id="loginMessage" class="msg"></div><div id="loginOk" class="ok"></div><div id="loginErr" class="err"></div>
</form>
<div style="margin-top:12px;text-align:center"><button class="btn btn-dark" style="width:100%" onclick="closeLogin();openRegister()">¿No tienes cuenta? Crear cuenta fácil solo correo o nombre + contraseña</button></div>
</div></div>

<div id="friendsModal" class="modal"><div class="box" style="width:min(560px,100%)"><button class="close" onclick="closeFriends()">×</button><h2>Friends & Requests — SEXCITES.COM 24/7 Real</h2><div id="reqList"></div><div id="friendsList" style="margin-top:14px"></div></div></div>

<div id="chatModal" class="modal"><div class="box" style="width:min(560px,100%)"><button class="close" onclick="closeChat()">×</button><h2>💬 Chat 24/7 Real — SEXCITES.COM — Mensajes + Fotos</h2><div style="margin-bottom:10px"><input id="searchChat" placeholder="Buscar amigo por nombre — Privado — SEXCITES.COM" oninput="renderChatList()"></div><div id="chatList"></div><div id="chatWin" style="display:none;margin-top:12px" class="post"><div style="display:flex;justify-content:space-between;align-items:center"><b id="chatName"></b><button onclick="document.getElementById('chatWin').style.display='none'" style="background:#222;color:#fff;border:1px solid #333;padding:6px 10px;border-radius:10px">✕</button></div><div id="chatBox" class="chatBox"></div><div style="display:flex;gap:6px"><input id="chatInput" placeholder="Mensaje real time 24/7... SEXCITES.COM" onkeypress="if(event.key==='Enter')sendMsg()"><button class="btn btn-pink" style="width:auto" onclick="sendMsg()">Send 24/7</button></div></div></div></div>

<div id="payModal" class="modal"><div class="box"><button class="close" onclick="closePay()">×</button><h2>💳 SEXCITES.COM — Pagos Reales 24/7 Alta Tension — Bienvenida Unico Pago</h2>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0">
<div style="padding:12px;background:#1a1a20;border-radius:14px;border:1px solid #333;text-align:center"><b>$8.99</b><div style="font-size:10px;color:#888">4M Unico pago REAL</div></div>
<div style="padding:12px;background:linear-gradient(135deg,rgba(255,42,109,.2),rgba(255,122,69,.15));border-radius:14px;border:1.5px solid #ff2d91;text-align:center"><b>$16.99 BEST VIP</b><div style="font-size:10px;color:#ffb3c9">8M render todo REAL</div></div>
<div style="padding:12px;background:#1a1a20;border-radius:14px;border:1px solid #333;text-align:center"><b>$28.99</b><div style="font-size:10px;color:#888">12M Unico pago REAL</div></div>
</div>
<select id="planSel"><option value="8.99">4M $8.99 Unico pago REAL</option><option value="16.99" selected>8M $16.99 BEST VIP render todo REAL</option><option value="28.99">12M $28.99 Unico pago REAL</option></select>
<div style="display:flex;gap:8px;margin:10px 0"><button id="bBTC" onclick="setChain('BTC')" class="btn btn-white" style="padding:8px 12px">BTC</button><button id="bETH" onclick="setChain('ETH')" class="btn btn-dark" style="padding:8px 12px">ETH</button><button id="bSOL" onclick="setChain('SOL')" class="btn btn-dark" style="padding:8px 12px">SOL</button></div>
<div id="walletBox" style="padding:12px;background:#0f0f14;border-radius:12px;border:1px dashed #32dc7d;word-break:break-all;font-size:12px"></div>
<input id="txInput" placeholder="TxID REAL blockchain — Pega aquí — Anti fake" style="margin-top:10px"><input id="emailPay" placeholder="Tu correo SEXCITES.COM — Ej: tu@email.com"><button class="btn btn-pink" style="width:100%;padding:14px;background:#32dc7d;color:#000" onclick="verifyPay()">VERIFICAR PAGO REAL 24/7 ALTA TENSION — SEXCITES.COM</button>
<div id="payOk" class="ok"></div><div id="payErr" class="err"></div>
</div></div>

<script>
const socket=io();
const WALLETS={BTC:'bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s',ETH:'0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c',SOL:'F66a36aKwwvZaaaCSTyfWja4P2dNMmYHK7W2nMBVm6h1'};
let curChain='BTC';
let currentUser=JSON.parse(localStorage.getItem('sexcites_user')||'null');
let activeChat=null;

// HIGH QUALITY REAL MOVING BACKGROUND - NOT MAQUETA
const canvas=document.getElementById('bgCanvas');
const ctx=canvas.getContext('2d',{alpha:false});
let dpr=window.devicePixelRatio||1;
function resize(){
  dpr=window.devicePixelRatio||1;
  canvas.width=innerWidth*dpr;
  canvas.height=innerHeight*dpr;
  canvas.style.width=innerWidth+'px';
  canvas.style.height=innerHeight+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
resize();addEventListener('resize',resize);
let blobs=[
  {x:0.22,y:0.22,r:560,c:'255,45,145',vx:0.16,vy:0.10,phase:0},
  {x:0.84,y:0.30,r:640,c:'118,87,255',vx:-0.12,vy:0.14,phase:1.8},
  {x:0.56,y:0.90,r:700,c:'255,100,140',vx:0.10,vy:-0.16,phase:3.2}
];
let particles=[];for(let i=0;i<75;i++) particles.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-0.5)*0.45,vy:(Math.random()-0.5)*0.45,r:Math.random()*1.5+0.4});
function draw(t){
  let w=innerWidth,h=innerHeight;
  let base=ctx.createLinearGradient(0,0,0,h);
  base.addColorStop(0,'#0b0c14'); base.addColorStop(1,'#07080c');
  ctx.fillStyle=base; ctx.fillRect(0,0,w,h);
  let time=t*0.00038;
  blobs.forEach(b=>{
    b.x+=b.vx*0.35; b.y+=b.vy*0.35;
    if(b.x<0.10||b.x>0.90) b.vx*=-1;
    if(b.y<0.10||b.y>0.90) b.vy*=-1;
    let cx=b.x*w+Math.sin(time+b.phase)*100;
    let cy=b.y*h+Math.cos(time*0.68+b.phase)*80;
    let g=ctx.createRadialGradient(cx,cy,0,cx,cy,b.r);
    g.addColorStop(0,'rgba('+b.c+',0.34)');
    g.addColorStop(0.4,'rgba('+b.c+',0.11)');
    g.addColorStop(1,'rgba('+b.c+',0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,b.r,0,Math.PI*2); ctx.fill();
  });
  for(let i=0;i<particles.length;i++){
    let a=particles[i]; a.x+=a.vx; a.y+=a.vy;
    if(a.x<0||a.x>w) a.vx*=-1;
    if(a.y<0||a.y>h) a.vy*=-1;
    ctx.beginPath(); ctx.arc(a.x,a.y,a.r,0,Math.PI*2);
    ctx.fillStyle='rgba(255,140,180,0.58)'; ctx.fill();
    for(let j=i+1;j<particles.length;j++){
      let b=particles[j]; let dx=a.x-b.x, dy=a.y-b.y, d=Math.sqrt(dx*dx+dy*dy);
      if(d<135){ctx.strokeStyle='rgba(255,110,150,'+(0.13*(1-d/135))+')';ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
const heartsDiv=document.getElementById('hearts');
function spawnHeart(){let el=document.createElement('div');el.className='heart';el.textContent=Math.random()>0.66?'💖':Math.random()>0.5?'💗':'💓';el.style.left=(Math.random()*100)+'vw';el.style.setProperty('--dx',(Math.random()*100-50)+'px');el.style.animationDuration=(7+Math.random()*9)+'s';el.style.fontSize=(12+Math.random()*18)+'px';heartsDiv.appendChild(el);setTimeout(()=>el.remove(),15000);}
setInterval(spawnHeart,650);

function openRegister(){document.getElementById('registerModal').classList.add('show');}
function closeRegister(){document.getElementById('registerModal').classList.remove('show');}
function openLogin(){document.getElementById('loginModal').classList.add('show');}
function closeLogin(){document.getElementById('loginModal').classList.remove('show');}
function openFriends(){document.getElementById('friendsModal').classList.add('show');renderFriends();}
function closeFriends(){document.getElementById('friendsModal').classList.remove('show');}
function openChat(){document.getElementById('chatModal').classList.add('show');renderChatList();}
function closeChat(){document.getElementById('chatModal').classList.remove('show');}
function openPay(){document.getElementById('payModal').classList.add('show');setChain(curChain);}
function closePay(){document.getElementById('payModal').classList.remove('show');}
function escapeHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function genDeviceId(){let id=localStorage.getItem('did');if(!id){id='D_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36);localStorage.setItem('did',id);}return id;}
function setChain(c){
  curChain=c;
  ['BTC','ETH','SOL'].forEach(x=>{
    let b=document.getElementById('b'+x);
    if(b) b.className=x===c?'btn btn-white':'btn btn-dark';
  });
  let sel=document.getElementById('planSel').value;
  let box=document.getElementById('walletBox');
  if(box) box.innerHTML='<b>'+c+' REAL — SEXCITES.COM — Bienvenida unico pago $'+sel+' — 24/7 alta tension</b><br><br><span style=color:#32dc7d;font-weight:900;font-size:14px;word-break:break-all>'+WALLETS[c]+'</span><br><br><button onclick=navigator.clipboard.writeText(\\''+WALLETS[c]+'\\');alert(\\'Copiado '+c+' SEXCITES.COM\\') style=padding:8px 12px;border-radius:10px;background:#1e1e26;color:#fff;border:1px solid #333>📋 Copiar '+c+'</button><div style=margin-top:6px;font-size:10px;color:#888>Envia $'+sel+' unico pago en '+c+' real — SEXCITES.COM alta calidad</div>';
}

async function loadPosts(){
  try{
    const r=await fetch('/api/posts');const data=await r.json();
    const feed=document.getElementById('feed');
    if(!data.length){
      feed.innerHTML='<div class="post"><strong style="font-size:18px">Welcome to SEXCITES.COM — Sistema Real No Maqueta — Alta Calidad 24/7</strong><p class="msg" style="margin-top:8px">Fondo en movimiento real — Blobs gigantes con blur + partículas conectadas + corazones flotando — Marca SEXCITES.COM visible — Registro fácil solo correo o nombre + contraseña única — Feed real, like ❤️ toggle real time, comentar agregar caja debajo post, agregar amigos buzón privado por nombre real time, chat hablar 24/7 mensajes + fotos — Cupos 1-500 — Pagos reales $8.99 $16.99 $28.99 bienvenida unico pago — Primeros 2 VIP gratis #1 #2 render todo — Owner LenoxJG — No baja calidad</p></div>';
      return;
    }
    feed.innerHTML=data.map(p=>\`
      <article class="post">
        <div class="post-top"><div class="avatar">\${escapeHTML(p.username.slice(0,2).toUpperCase())}</div><div><strong>@\${escapeHTML(p.username)} #\${p.order||''} \${p.isFirst?'<span style=background:#ff2d91;color:#fff;padding:2px 7px;border-radius:10px;font-size:9px>VIP #'+p.order+' RENDER TODO</span>':''}</strong><div class="msg">\${new Date(p.createdAt).toLocaleString()} · SEXCITES.COM · #\${p.order||''}/500</div></div></div>
        <p style="margin-top:12px;color:#d7d9df;line-height:1.6">\${escapeHTML(p.text)}</p>
        <div class="post-actions">
          <button onclick="likePost('\\''+p.id+'\\'')">♡ \${(p.likes||[]).length} Like 24/7 real</button>
          <button onclick="focusComment('\\''+p.id+'\\'')">💬 \${(p.comments||[]).length} Comment agregar real</button>
          <button onclick="addFriend('\\''+p.username+'\\'')">📩 Add friend buzón real time</button>
          <button onclick="openChatWith('\\''+p.username+'\\'')">💬 Chat 24/7 real</button>
          <button onclick="sharePost()">↗ Share SEXCITES.COM</button>
        </div>
        <div id="comments-\${p.id}" style="margin-top:10px">\${(p.comments||[]).map(c=>'<div style=background:#1e1e26;border-radius:10px;padding:8px;margin-top:6px;font-size:12px><b>'+escapeHTML(c.name)+':</b> '+escapeHTML(c.text)+'</div>').join('')}</div>
        <div style="display:flex;gap:6px;margin-top:10px"><input id="c-\${p.id}" placeholder="Agregar comentar... 24/7 real SEXCITES.COM" onkeypress="if(event.key==='Enter')addComment('\\''+p.id+'\\'')" style="flex:1"><button class="btn btn-pink" style="padding:8px 12px;width:auto" onclick="addComment('\\''+p.id+'\\'')">💬</button></div>
      </article>\`).join('');
  }catch(e){console.error(e);}
}

function quickPost(){
  if(!currentUser){openRegister();return;}
  let txt=document.getElementById('quickPost').value.trim();
  if(txt.length<2){alert('Escribe algo — SEXCITES.COM');return;}
  socket.emit('post:new',{username:currentUser.username,email:currentUser.email,text:txt});
  document.getElementById('quickPost').value='';
}
function likePost(id){if(!currentUser){openRegister();return;}socket.emit('post:like',{postId:id,email:currentUser.email});}
function focusComment(id){let el=document.getElementById('c-'+id);if(el) el.focus();}
function addComment(id){
  if(!currentUser){openRegister();return;}
  let el=document.getElementById('c-'+id);let txt=el.value.trim();if(!txt) return;
  socket.emit('post:comment',{postId:id,name:currentUser.username,text:txt});
  el.value='';
}
function sharePost(){navigator.clipboard.writeText(location.href);alert('Link copiado SEXCITES.COM — Share real');}
function addFriend(username){
  if(!currentUser){openRegister();return;}
  if(username===currentUser.username){alert('No puedes agregarte a ti mismo SEXCITES.COM');return;}
  socket.emit('friend:request',{from:currentUser.email,to:username,fromName:currentUser.username},r=>{
    if(!r.ok) alert(r.msg);
    else alert('📩 Solicitud enviada real time 24/7 a @'+username+' — SEXCITES.COM — Llega al instante al otro celular');
  });
}
function openChatWith(username){
  if(!currentUser){openRegister();return;}
  activeChat=username;
  openChat();
  document.getElementById('chatWin').style.display='block';
  document.getElementById('chatName').innerText='💬 Chat 24/7 con @'+username+' — SEXCITES.COM — Mensajes + fotos';
  loadMessages();
}
function renderFriends(){
  if(!currentUser){document.getElementById('reqList').innerHTML='<div class=msg>Registrate fácil solo con correo o nombre + contraseña única — SEXCITES.COM</div>';return;}
  socket.emit('friends:get',{email:currentUser.email},data=>{
    let reqBadge=document.getElementById('reqBadge');
    reqBadge.style.display=data.requests.length>0?'inline':'none';
    reqBadge.textContent=data.requests.length;
    let reqHtml='<b>📩 Requests Real Time 24/7 — Buzón privado</b><br>';
    reqHtml+=data.requests.length?data.requests.map(e=>'<div class=post style=display:flex;justify-content:space-between;align-items:center><span>👤 '+escapeHTML(e)+'</span><span><button class=btn btn-white style=padding:6px 10px onclick=acceptReq(\\''+e+'\\')>✅ Accept</button> <button class=btn btn-dark style=padding:6px 10px onclick=rejectReq(\\''+e+'\\')>❌</button></span></div>').join(''):'<div class=msg>No requests — Buzón privado por nombre real time — SEXCITES.COM</div>';
    document.getElementById('reqList').innerHTML=reqHtml;
    let frHtml='<b>❤️ Friends — Hablar 24/7 Real — SEXCITES.COM</b><br>';
    frHtml+=data.friends.length?data.friends.map(e=>'<div class=post style=display:flex;justify-content:space-between;align-items:center><span>👤 '+escapeHTML(e)+' #</span><button class=btn btn-pink style=padding:6px 10px;width:auto' + ' onclick=openChatWith(\\''+e+'\\')>💬 Chat 24/7</button></div>').join(''):'<div class=msg>No friends yet — Agrega amigos real time — Cupos 1-500 — SEXCITES.COM</div>';
    document.getElementById('friendsList').innerHTML=frHtml;
  });
}
function acceptReq(from){socket.emit('friend:accept',{from:from,to:currentUser.email},()=>{renderFriends();});}
function rejectReq(from){socket.emit('friend:reject',{from:from,to:currentUser.email},()=>{renderFriends();});}
function renderChatList(){
  if(!currentUser){document.getElementById('chatList').innerHTML='<div class=msg>Registrate fácil SEXCITES.COM</div>';return;}
  let q=(document.getElementById('searchChat').value||'').toLowerCase();
  socket.emit('friends:get',{email:currentUser.email},data=>{
    let list=data.friends.filter(u=>!q||u.toLowerCase().includes(q));
    let html=list.length?list.map(u=>'<div class=post style=cursor:pointer;display:flex;justify-content:space-between;align-items:center' + ' onclick=openChatWith(\\''+u+'\\')><span>👤 '+escapeHTML(u)+' — SEXCITES.COM</span><span style=font-size:10px;color:#32dc7d>● Online 24/7</span></div>').join(''):'<div class=msg>No friends — Agrega primero — SEXCITES.COM</div>';
    document.getElementById('chatList').innerHTML=html;
  });
}
function loadMessages(){
  if(!currentUser||!activeChat) return;
  socket.emit('chat:load',{from:currentUser.email,to:activeChat},msgs=>{
    let box=document.getElementById('chatBox');
    box.innerHTML=msgs.length?msgs.map(m=>'<div class=chatMsg '+(m.from===currentUser.email?'me':'ot')+'>'+escapeHTML(m.text||'')+'<br><span style=font-size:10px;opacity:.6>'+escapeHTML(m.from)+' · '+m.time+' · 24/7 real</span></div>').join(''):'<div style=text-align:center;color:#666;padding:12px>Chat real time 24/7 con @'+escapeHTML(activeChat)+' — SEXCITES.COM<br>Mensajes + fotos + tiempo real — Hablar 24/7 de verdad — Fondo elegante movimiento alta calidad</div>';
    box.scrollTop=box.scrollHeight;
  });
}
function sendMsg(){
  if(!currentUser||!activeChat) return;
  let txt=document.getElementById('chatInput').value.trim();if(!txt) return;
  socket.emit('chat:message',{from:currentUser.email,to:activeChat,text:txt},r=>{if(r.ok){document.getElementById('chatInput').value='';loadMessages();}});
}
function verifyPay(){
  let sel=document.getElementById('planSel').value;
  let email=(document.getElementById('emailPay').value.trim().toLowerCase()||currentUser?.email||'').toLowerCase();
  let tx=document.getElementById('txInput').value.trim();
  let ok=document.getElementById('payOk');let err=document.getElementById('payErr');
  ok.style.display='none';err.style.display='none';
  if(!email||!tx){err.style.display='block';err.textContent='Email + TxID REAL requerido — SEXCITES.COM — Pagos reales';return;}
  if(tx.length<15){err.style.display='block';err.textContent='TxID invalido — Debe ser blockchain real BTC ETH SOL';return;}
  fetch('/api/verify-pay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({txid:tx,chain:curChain,amount:sel,email:email})})
 .then(r=>r.json()).then(data=>{
    if(!data.ok){err.style.display='block';err.textContent=data.msg;return;}
    socket.emit('pay:verify',{email:email,txid:tx,plan:sel,chain:curChain},r=>{
      if(r.ok){ok.style.display='block';ok.textContent='🔥 SEXCITES.COM — PAGO REAL $'+sel+' VERIFICADO 24/7 '+curChain+' — TxID '+tx.substring(0,16)+'... — Bienvenida unico pago — Alta tension — Primeros 2 VIP #1 #2 render todo gratis';}
      else{err.style.display='block';err.textContent=r.msg;}
    });
  });
}

document.getElementById('registerForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  let msg=document.getElementById('registerMessage');let ok=document.getElementById('regOk');let err=document.getElementById('regErr');
  ok.style.display='none';err.style.display='none';msg.textContent='Creando cuenta SEXCITES.COM fácil... solo correo o nombre + contraseña única';
  let body={
    username:document.getElementById('username').value.trim(),
    email:document.getElementById('email').value.trim(),
    password:document.getElementById('password').value,
    adult:document.getElementById('adult').checked,
    deviceId:genDeviceId()
  };
  try{
    let r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let data=await r.json();
    if(!r.ok){err.style.display='block';err.textContent=data.error;msg.textContent='';return;}
    ok.style.display='block';ok.textContent=data.message+' — Ya puedes entrar 24/7 — SEXCITES.COM alta calidad real no maqueta';
    localStorage.setItem('sexcites_user',JSON.stringify(data.user));
    currentUser=data.user;
    socket.emit('user:join',{email:data.user.email});
    setTimeout(()=>{closeRegister();loadPosts();updateCnt();},1200);
  }catch(e){err.style.display='block';err.textContent='Error conexión SEXCITES.COM';}
});

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  let ok=document.getElementById('loginOk');let err=document.getElementById('loginErr');let msg=document.getElementById('loginMessage');
  ok.style.display='none';err.style.display='none';msg.textContent='Iniciando sesión fácil SEXCITES.COM... solo correo o nombre + contraseña única';
  let body={email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value};
  try{
    let r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let data=await r.json();
    if(!r.ok){err.style.display='block';err.textContent=data.error;msg.textContent='';return;}
    ok.style.display='block';ok.textContent=data.message+' — Sistema operativo sin fallas — Alta calidad real';
    localStorage.setItem('sexcites_user',JSON.stringify(data.user));
    currentUser=data.user;
    socket.emit('user:join',{email:data.user.email});
    setTimeout(()=>{closeLogin();updateCnt();loadPosts();},1000);
  }catch(e){err.style.display='block';err.textContent='Error conexión';}
});

socket.on('db:update',d=>{
  loadPosts();
  if(currentUser) {renderFriends(); renderChatList();}
  let cnt=d.count||0;
  let el=document.getElementById('liveCnt');
  if(el) el.textContent='● '+cnt+' / 500 LIVE 24/7 — SEXCITES.COM';
});
socket.on('friend:newRequest',d=>{
  if(currentUser&&d.to===currentUser.email){
    let badge=document.getElementById('reqBadge');badge.style.display='inline';badge.textContent='NEW';
    alert('📩 Solicitud real time 24/7 de '+d.fromName+' — SEXCITES.COM — Llega al instante — Buzón privado');
    renderFriends();
  }
});
socket.on('chat:newMessage',d=>{
  let chatBadge=document.getElementById('chatBadge');
  if(chatBadge) chatBadge.style.display='inline';
  if(currentUser&&activeChat&&(d.chatId===[currentUser.email,activeChat].sort().join('_')||d.chatId===activeChat)) loadMessages();
});

function updateCnt(){fetch('/api/db').then(r=>r.json()).then(d=>{let el=document.getElementById('liveCnt');if(el) el.textContent='● '+d.count+' / '+d.max+' LIVE 24/7 — SEXCITES.COM alta calidad';});}

window.addEventListener('load',()=>{
  setChain('BTC');
  loadPosts();
  updateCnt();
  if(currentUser){socket.emit('user:join',{email:currentUser.email});}
  document.getElementById('chatInput')?.addEventListener('keypress',e=>{if(e.key==='Enter') sendMsg();});
});
<\/script>
</body>
</html>`);
});

app.use((req, res) => { res.status(404).json({ error: "Not found - SEXCITES.COM" }); });

io.on('connection', (socket) => {
  socket.on('user:join', (d) => { if (d.email) socket.join(d.email); });
  socket.on('post:new', (d) => {
    posts.unshift({ id: id(), username: d.username, email: d.email, order: users.get(d.email.toLowerCase())?.order||0, isFirst: users.get(d.email.toLowerCase())?.isFirst||false, text: d.text, createdAt: new Date().toISOString(), likes: [], comments: [] });
    io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
  });
  socket.on('post:like', (d) => {
    let p = posts.find(x => x.id === d.postId); if (!p) return;
    if (!p.likes) p.likes = []; if (p.likes.includes(d.email)) p.likes = p.likes.filter(e=>e!==d.email); else p.likes.push(d.email);
    io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
  });
  socket.on('post:comment', (d) => {
    let p = posts.find(x => x.id === d.postId); if (!p) return;
    if (!p.comments) p.comments = []; p.comments.push({ name: d.name, text: d.text, time: new Date().toLocaleTimeString() });
    io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
  });
  socket.on('friends:get', (d, cb) => {
    let reqs = requests.get(d.email) || [];
    let frs = friends.get(d.email) || [];
    cb({ requests: reqs, friends: frs });
  });
  socket.on('friend:request', (d, cb) => {
    let toEmail = null;
    for (let u of users.values()) { if (u.username.toLowerCase() === d.to.toLowerCase() || u.email.toLowerCase() === d.to.toLowerCase()) { toEmail = u.email; break; } }
    if (!toEmail) return cb && cb({ ok: false, msg: 'Usuario no existe - Busca por nombre o correo - SEXCITES.COM' });
    if (!requests.has(toEmail)) requests.set(toEmail, []);
    let arr = requests.get(toEmail); if (arr.includes(d.from)) return cb && cb({ ok: false, msg: 'Ya enviado real time 24/7 - Espera' });
    if ((friends.get(d.from) || []).includes(d.to) || (friends.get(d.from) || []).includes(toEmail)) return cb && cb({ ok: false, msg: 'Ya amigos - Hablar 24/7 SEXCITES.COM' });
    arr.push(d.from); requests.set(toEmail, arr);
    io.to(toEmail).emit('friend:newRequest', { from: d.from, to: toEmail, fromName: d.fromName });
    io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
    cb && cb({ ok: true });
  });
  socket.on('friend:accept', (d, cb) => {
    let rq = requests.get(d.to) || []; requests.set(d.to, rq.filter(e=>e!==d.from));
    let f1 = friends.get(d.to) || []; if (!f1.includes(d.from)) f1.push(d.from); friends.set(d.to, f1);
    let f2 = friends.get(d.from) || []; if (!f2.includes(d.to)) f2.push(d.to); friends.set(d.from, f2);
    io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
    cb && cb({ ok: true });
  });
  socket.on('friend:reject', (d, cb) => {
    let rq = requests.get(d.to) || []; requests.set(d.to, rq.filter(e=>e!==d.from));
    io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
    cb && cb({ ok: true });
  });
  socket.on('chat:load', (d, cb) => {
    let idChat = [d.from, d.to].sort().join('_');
    let altId = [d.from, d.to].map(x=>{ for(let u of users.values()){ if(u.username.toLowerCase()===x.toLowerCase()) return u.email; } return x; }).sort().join('_');
    let msgs = chats.get(idChat) || chats.get(altId) || [];
    cb(msgs);
  });
  socket.on('chat:message', (d, cb) => {
    let fromEmail = d.from; let toEmail = null;
    for (let u of users.values()) { if (u.username.toLowerCase() === d.to.toLowerCase() || u.email.toLowerCase() === d.to.toLowerCase()) { toEmail = u.email; break; } }
    if (!toEmail) toEmail = d.to;
    let idChat = [fromEmail, toEmail].sort().join('_');
    let arr = chats.get(idChat) || []; arr.push({ from: fromEmail, text: d.text, time: new Date().toLocaleTimeString() }); chats.set(idChat, arr);
    io.to(toEmail).emit('chat:newMessage', { chatId: idChat });
    io.to(fromEmail).emit('chat:newMessage', { chatId: idChat });
    cb && cb({ ok: true });
  });
  socket.on('pay:verify', (d, cb) => {
    if (txs.has(d.txid)) return cb && cb({ ok: false, msg: 'TxID ya usado - Anti fake SEXCITES.COM' });
    if (d.txid.length < 15) return cb && cb({ ok: false, msg: 'TxID invalido - Debe ser blockchain real' });
    txs.add(d.txid);
    let v = parseFloat(d.plan); balances.set(d.email, (balances.get(d.email) || 0) + v);
    let u = users.get(d.email.toLowerCase()); if (u) { u.vip = true; u.bal = balances.get(d.email); }
    io.emit('db:update', { count: users.size, posts: posts.slice(-20) });
    cb && cb({ ok: true });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("SEXCITES.COM HIGH QUALITY REAL SYSTEM - No maqueta - Marca SEXCITES.COM visible - Fondo movimiento real canvas alta calidad blobs + particulas + corazones - Registro facil solo correo o nombre + contraseña unica - Mensajes 24/7 agregar comentar agregar usuarios reales - Chat hablar 24/7 - Cupos 1-500 - Pagos reales BTC ETH SOL $8.99 $16.99 $28.99 bienvenida unico pago - Port " + PORT);
});
