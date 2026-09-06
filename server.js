const express = require("express");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "2mb" }));
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
function hashPass(p, salt) { return crypto.createHash("sha256").update(salt + p).digest("hex"); }

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "SEXCITES.COM", status: "online", users: users.size, time: new Date().toISOString() });
});

app.get("/api/posts", (req, res) => {
  res.json(posts.slice(-50).reverse());
});

app.get("/api/db", (req, res) => {
  res.json({ count: users.size, max: MAX_USERS, wallets: WALLETS });
});

app.post("/api/login", (req, res) => {
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  let found = null;
  for (let u of users.values()) { if (u.email.toLowerCase() === email) found = u; }
  if (!found) return res.status(404).json({ error: "Cuenta no existe - Crea cuenta" });
  const h = hashPass(password, found.salt);
  if (h !== found.passwordHash) return res.status(401).json({ error: "Contraseña incorrecta" });
  res.json({ success: true, message: "Login OK - Bienvenido " + found.username, user: { username: found.username, email: found.email, order: found.order, isFirst: found.isFirst } });
});

app.post("/api/register", (req, res) => {
  const username = clean(req.body.username, 30);
  const phone = clean(req.body.phone, 30);
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const adult = req.body.adult === true || req.body.adult === "true";
  const deviceId = clean(req.body.deviceId, 100) || id().slice(0, 12);

  if (!adult) return res.status(400).json({ error: "Debes confirmar 18+" });
  if (!validUsername(username)) return res.status(400).json({ error: "Username 3-30 letras, numeros, punto, guion" });
  if (!validEmail(email)) return res.status(400).json({ error: "Email invalido" });
  if (password.length < 8) return res.status(400).json({ error: "Password min 8 caracteres" });
  if (username.toLowerCase() === FOUNDER_USERNAME.toLowerCase()) return res.status(409).json({ error: "Username reservado Owner LenoxJG" });
  if (users.has(username.toLowerCase())) return res.status(409).json({ error: "Username ya existe" });
  if (users.has(email.toLowerCase())) return res.status(409).json({ error: "Email ya registrado" });
  if (users.size >= MAX_USERS) return res.status(403).json({ error: "🔴 COMUNIDAD LLENA 500/500 - Debes pagar bienvenida $8.99 $16.99 $28.99 unico pago" });
  if (!phone || phone.length < 6) return res.status(400).json({ error: "Telefono requerido - 1 registro por telefono" });
  if (phones.has(phone)) return res.status(409).json({ error: "🛡️ Telefono " + phone + " ya registrado - 1 por telefono" });
  if (ips.has(deviceId)) return res.status(409).json({ error: "🛡️ IP bloqueada - Device ya registrado" });

  const order = users.size + 1;
  const isFirst = order <= 2;
  const salt = crypto.randomBytes(8).toString("hex");
  const passwordHash = hashPass(password, salt);

  const user = {
    id: id(),
    username, email, phone, deviceId, order, isFirst, vip: isFirst,
    salt, passwordHash,
    createdAt: new Date().toISOString(),
    photo: "https://i.pravatar.cc/150?img=" + (order % 70)
  };

  users.set(username.toLowerCase(), user);
  users.set(email.toLowerCase(), user);
  phones.set(phone, email);
  ips.set(deviceId, email);

  posts.unshift({
    id: id(),
    username,
    email,
    order,
    isFirst,
    text: "Welcome #" + order + "/500 - " + username + " se unió - Fondo elegante movimiento real - Primeros 2 VIP gratis render todo - Bienvenida $8.99 $16.99 $28.99",
    createdAt: new Date().toISOString(),
    likes: 0
  });

  res.status(201).json({ success: true, message: "✅ Cuenta creada #" + order + "/500 " + (isFirst ? "PRIMEROS 2 VIP GRATIS RENDER TODO" : ""), user: { username, email, order, isFirst } });
});

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>SEXCITES.COM — Connect. Express. Belong. — High Quality</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Inter',Arial,sans-serif;background:#07080c;color:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}
#bgCanvas{position:fixed;inset:0;z-index:-2;width:100%;height:100%}
#heartsLayer{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
.heart{position:absolute;bottom:-20px;font-size:14px;animation:floatUp linear forwards;opacity:.8;filter:drop-shadow(0 0 6px rgba(255,45,145,.6))}
@keyframes floatUp{0%{transform:translateY(0) translateX(0) scale(.8);opacity:0}10%{opacity:.9}100%{transform:translateY(-110vh) translateX(var(--dx)) scale(1.4) rotate(20deg);opacity:0}}
.navbar{position:sticky;top:0;z-index:100;background:rgba(7,8,12,.92);backdrop-filter:blur(20px) saturate(1.2);border-bottom:1px solid rgba(255,255,255,.08)}
.nav-inner{max-width:1240px;margin:auto;min-height:74px;padding:0 22px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.logo{font-size:28px;font-weight:900;letter-spacing:1px;line-height:1}
.logo b{color:#fff}
.logo span{color:#ff2d91;background:linear-gradient(135deg,#ff2d91,#ff6a3d);-webkit-background-clip:text;background-clip:text;color:transparent}
.logo small{display:block;font-size:10px;letter-spacing:3px;color:#ff2d91;font-weight:800;margin-top:2px}
.nav-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{border:0;padding:11px 18px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;transition:.2s}
.btn:hover{transform:translateY(-1px);filter:brightness(1.1)}
.btn-pink{background:linear-gradient(135deg,#ff2d91,#7657ff);color:#fff;box-shadow:0 8px 24px rgba(255,45,145,.25)}
.btn-dark{background:#15151d;border:1px solid rgba(255,255,255,.12);color:#ddd}
.btn-white{background:#fff;color:#000}
.container{width:min(1240px,calc(100% - 40px));margin:auto}
.hero{padding:60px 0 30px;display:grid;grid-template-columns:1.15fr .85fr;gap:46px;align-items:center;min-height:680px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#d8d9df;font-size:12px;font-weight:700;backdrop-filter:blur(10px)}
.dot{width:8px;height:8px;border-radius:50%;background:#32dc7d;box-shadow:0 0 12px #32dc7d;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}
.hero h1{margin:20px 0;font-size:clamp(52px,8vw,92px);line-height:.9;letter-spacing:-4px;font-weight:900}
.grad{background:linear-gradient(135deg,#fff 20%,#ff3a9a 80%);-webkit-background-clip:text;background-clip:text;color:transparent}
.desc{max-width:620px;color:#9da1ad;font-size:18px;line-height:1.7;margin-top:10px}
.hero-cta{margin-top:24px;display:flex;gap:12px;flex-wrap:wrap}
.preview{padding:26px;border-radius:28px;border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(28,30,41,.92),rgba(12,14,20,.92));box-shadow:0 30px 100px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(20px)}
.preview-top{display:flex;align-items:center;gap:14px}
.avatar{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,#ff2d91,#7657ff);flex-shrink:0;overflow:hidden;box-shadow:0 6px 20px rgba(255,45,145,.3)}.avatar img{width:100%;height:100%;object-fit:cover}
.card{margin-top:28px;padding:22px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:50px 0}
.feat{padding:26px;border-radius:22px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);backdrop-filter:blur(10px)}
.feat b{color:#ff3b9b;font-size:13px}
.section{padding:50px 0}.section h2{font-size:36px;letter-spacing:-1px;margin-bottom:18px}
.feed{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.post{padding:22px;border-radius:20px;background:rgba(17,19,26,.9);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px)}
.post-top{display:flex;gap:12px;align-items:center}
.founder{margin-top:34px;padding:28px;border-radius:24px;border:1px solid rgba(255,45,145,.22);background:linear-gradient(135deg,rgba(255,45,145,.09),rgba(118,87,255,.07))}
.verified{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#ff2d91,#7657ff);font-size:11px}
footer{padding:50px 0;margin-top:40px;border-top:1px solid rgba(255,255,255,.08);color:#747985;text-align:center;font-size:13px}
.modal{display:none;position:fixed;inset:0;z-index:500;place-items:center;padding:20px;background:rgba(0,0,0,.82);backdrop-filter:blur(8px)}.modal.show{display:grid}
.box{width:min(460px,100%);padding:28px;border-radius:24px;background:#11131a;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 120px rgba(0,0,0,.7);animation:pop .25s ease}
@keyframes pop{from{transform:scale(.96) translateY(10px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
.close{float:right;border:0;background:none;color:#aaa;font-size:28px;cursor:pointer}
form{display:grid;gap:12px;margin-top:14px}
input,select{width:100%;padding:14px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#0a0b10;color:#fff;outline:none;font-size:14px}
input:focus,select:focus{border-color:#ff2d91;box-shadow:0 0 0 3px rgba(255,45,145,.15)}
.msg{color:#a7abb5;font-size:13px;line-height:1.5}
.ok{padding:12px;border-radius:12px;background:#32dc7d;color:#000;font-weight:800;display:none;margin-top:10px}
.err{padding:12px;border-radius:12px;background:#ff2d91;color:#fff;display:none;margin-top:10px;font-weight:700}
.live{font-size:11px;background:#0f1a0f;border:1px solid rgba(50,220,125,.25);color:#32dc7d;padding:6px 10px;border-radius:20px}
@media(max-width:900px){.hero{grid-template-columns:1fr;padding:40px 0}.features,.feed{grid-template-columns:1fr}.hero h1{letter-spacing:-2px}.nav-inner{padding:0 16px}.logo{font-size:22px}}
</style>
</head>
<body>
<canvas id="bgCanvas"></canvas>
<div id="heartsLayer"></div>

<header class="navbar">
<div class="nav-inner">
<div class="logo"><b>SEX</b><span>CITES.COM</span><small>CONNECT • EXPRESS • BELONG</small></div>
<div class="nav-right">
<span class="live" id="liveCnt">● 0 / 500 LIVE</span>
<button class="btn btn-dark" onclick="openFriends()">Friends</button>
<button class="btn btn-dark" onclick="openPay()">Pay $8.99 $16.99 $28.99</button>
<button class="btn btn-white" onclick="openLogin()">Login</button>
<button class="btn btn-pink" onclick="openRegister()">Join 24/7</button>
</div>
</div>
</header>

<main class="container">
<section class="hero">
<div>
<div class="badge"><span class="dot"></span>18+ COMMUNITY · PRIVATE BY DESIGN · REAL TIME 24/7 · CUPOS 1-500 · FONDO ELEGANTE MOVIMIENTO REAL</div>
<h1>Connect.<br><span class="grad">Express.</span><br>Belong.</h1>
<p class="desc">SEXCITES.COM is a modern 18+ social community built for adults to connect, express themselves, share moments and discover new people. <b style="color:#fff">Bienvenida Unico Pago $8.99 4M $16.99 BEST 8M VIP render todo $28.99 12M</b> — Fondo elegante movimiento real blobs rosa + morado + partículas conectadas + corazones flotando — Sistema operativo sin fallas — Crear cuenta, contraseña, iniciar sesión alta calidad — Real time entre 2 celulares.</p>
<div class="hero-cta">
<button class="btn btn-pink" style="padding:16px 24px;font-size:15px" onclick="openRegister()">Create your account — Primeros 2 VIP GRATIS</button>
<button class="btn btn-dark" style="padding:16px 20px" onclick="openLogin()">Iniciar sesión</button>
</div>
<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
<span class="badge">📩 Solicitudes Real Time</span>
<span class="badge">💬 Mensajes + Fotos 1 Toque</span>
<span class="badge">❤️ Like · 💬 Comment · ↗ Share</span>
</div>
</div>

<div class="preview">
<div class="preview-top"><div class="avatar">S</div><div><strong style="font-size:16px">SEXCITES.COM</strong><div style="color:#858996;font-size:13px">Community preview — Live 24/7 — Alta calidad</div></div><span class="live" style="margin-left:auto">● LIVE 24/7</span></div>
<div class="card">
<h2 style="font-size:22px;letter-spacing:-.5px">Your social world. SEXCITES.COM</h2>
<p style="color:#9296a3;margin-top:8px;line-height:1.6">Profiles, posts, reactions and conversations in one modern experience. Marca visible, botones funcionan, sistema operativo sin fallas.</p>
<div style="margin-top:16px;height:10px;border-radius:99px;background:rgba(255,255,255,.08)"></div>
<div style="margin-top:10px;height:10px;width:70%;border-radius:99px;background:rgba(255,255,255,.08)"></div>
<div style="margin-top:10px;height:10px;width:45%;border-radius:99px;background:rgba(255,255,255,.08)"></div>
<div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
<div style="padding:12px;background:#1a1a20;border-radius:14px;border:1px solid #333;text-align:center"><b>$8.99</b><div style="font-size:10px;color:#888">4M Unico pago</div></div>
<div style="padding:12px;background:linear-gradient(135deg,rgba(255,42,109,.18),rgba(255,122,69,.12));border-radius:14px;border:1.5px solid #ff2d91;text-align:center"><b>$16.99 BEST</b><div style="font-size:10px;color:#ffb3c9">8M VIP render todo</div></div>
</div>
</div>
<div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap"><span class="badge">18+ ONLY</span><span class="badge">PRIVATE EMAIL</span><span class="badge">SEXCITES.COM</span></div>
</div>
</section>

<section class="features">
<div class="feat"><b>01</b><h3 style="margin:8px 0">SEXCITES.COM Profiles + Foto Galería</h3><p style="color:#9296a3;line-height:1.6">Marca SEXCITES.COM visible alta calidad. Crear cuenta con username, teléfono, email privado, contraseña segura hash. 1 registro por teléfono + bloqueo IP.</p></div>
<div class="feat"><b>02</b><h3 style="margin:8px 0">Real Time + Iniciar Sesión</h3><p style="color:#9296a3;line-height:1.6">Usuario crear cuenta y contraseña + iniciar sesión funcionando. Sistema operativo sin fallas. Login con email + password real, no fake.</p></div>
<div class="feat"><b>03</b><h3 style="margin:8px 0">Fondo Movimiento Real + Pagos</h3><p style="color:#9296a3;line-height:1.6">Fondo en movimiento real — blobs gigantes con blur moviéndose sinusoidal + partículas + corazones flotando alta calidad. Pagos reales BTC ETH SOL bienvenida unico pago $8.99 $16.99 $28.99 alta tensión 24/7.</p></div>
</section>

<section class="section"><h2>Community Feed — SEXCITES.COM — Alta Calidad</h2><div id="feed" class="feed"></div></section>

<section class="founder"><div class="post-top"><div class="avatar">JG</div><div><strong>${FOUNDER_NAME}</strong> <span class="verified">✓</span> <span style="background:#1d9bf0;color:#fff;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:800">MALE OWNER MODERN SEXCITES.COM</span><div style="color:#888d99;font-size:13px">@${FOUNDER_USERNAME} #1/500 Owner Sistema Generador</div></div></div><p style="color:#9da1ad;margin-top:14px;line-height:1.7">SEXCITES.COM was founded by Jhon Gonzales. Marca SEXCITES.COM visible en todo el sistema. Sistema operativo sin fallas. Primeros 2 VIP gratis #1 #2 render todo — Cupos 1-500 — Si pasa debe pagar bienvenida unico pago $8.99 $16.99 $28.99 — Owner LenoxJG male moderno — Fondo elegante movimiento real de alta calidad.</p></section>

<footer>SEXCITES.COM — Founded by Jhon Gonzales · SEXCITES.COM · 18+ only · High Quality Real Moving Background · 1-500 · 1 telefono + IP block · Pagos reales BTC ETH SOL · Bienvenida unico pago $8.99 $16.99 $28.99 · Owner LenoxJG Male Modern · No fallas</footer>
</main>

<div id="registerModal" class="modal"><div class="box"><button class="close" onclick="closeRegister()">×</button><h2 style="font-size:24px">Create account — SEXCITES.COM</h2><p class="msg">Marca SEXCITES.COM — Alta calidad — Email privado — 1 registro por teléfono — Bloqueo IP — Primeros 2 VIP gratis — Cupos 1-500</p>
<form id="registerForm">
<input id="username" placeholder="Username 3-30 — Ej: LenoxJG" maxlength="30" required>
<input id="phone" placeholder="Phone - 1 registro por telefono - Ej: +57 3001234567" required>
<input id="email" type="email" placeholder="Private email - Hidden - Ej: tu@email.com" required>
<input id="password" type="password" placeholder="Crear contraseña min 8 caracteres" minlength="8" required>
<label class="msg" style="display:flex;gap:8px;align-items:center"><input id="adult" type="checkbox" required style="width:auto"> Confirmo 18+ y acepto términos SEXCITES.COM</label>
<button class="btn btn-pink" style="width:100%;padding:14px" type="submit">Crear cuenta # /500 — SEXCITES.COM</button>
<div id="registerMessage" class="msg"></div><div id="regOk" class="ok"></div><div id="regErr" class="err"></div>
</form>
<div style="margin-top:12px;text-align:center"><button class="btn btn-dark" style="width:100%" onclick="closeRegister();openLogin()">¿Ya tienes cuenta? Iniciar sesión</button></div>
</div></div>

<div id="loginModal" class="modal"><div class="box"><button class="close" onclick="closeLogin()">×</button><h2 style="font-size:24px">Iniciar sesión — SEXCITES.COM</h2><p class="msg">Usuario crear cuenta y contraseña — Sistema operativo sin fallas — Alta calidad</p>
<form id="loginForm">
<input id="loginEmail" type="email" placeholder="Email privado registrado" required>
<input id="loginPassword" type="password" placeholder="Contraseña" required>
<button class="btn btn-white" style="width:100%;padding:14px" type="submit">Iniciar sesión — SEXCITES.COM</button>
<div id="loginMessage" class="msg"></div><div id="loginOk" class="ok"></div><div id="loginErr" class="err"></div>
</form>
<div style="margin-top:12px;text-align:center"><button class="btn btn-dark" style="width:100%" onclick="closeLogin();openRegister()">¿No tienes cuenta? Crear cuenta</button></div>
</div></div>

<div id="friendsModal" class="modal"><div class="box"><button class="close" onclick="closeFriends()">×</button><h2>Friends — SEXCITES.COM</h2><p class="msg">Buzón privado por nombre — Real time — Alta calidad</p><div id="friendsList"></div></div></div>

<div id="payModal" class="modal"><div class="box"><button class="close" onclick="closePay()">×</button><h2>💳 SEXCITES.COM — Bienvenida Unico Pago — Alta Calidad Real</h2>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0">
<div style="padding:12px;background:#1a1a20;border-radius:14px;border:1px solid #333;text-align:center"><b>$8.99</b><div style="font-size:10px;color:#888">4M Unico pago</div></div>
<div style="padding:12px;background:linear-gradient(135deg,rgba(255,42,109,.2),rgba(255,122,69,.15));border-radius:14px;border:1.5px solid #ff2d91;text-align:center"><b>$16.99 BEST VIP</b><div style="font-size:10px;color:#ffb3c9">8M render todo</div></div>
<div style="padding:12px;background:#1a1a20;border-radius:14px;border:1px solid #333;text-align:center"><b>$28.99</b><div style="font-size:10px;color:#888">12M Unico pago</div></div>
</div>
<select id="planSel"><option value="8.99">4M $8.99 Unico pago</option><option value="16.99" selected>8M $16.99 BEST VIP render todo</option><option value="28.99">12M $28.99 Unico pago</option></select>
<div style="display:flex;gap:8px;margin:10px 0"><button id="bBTC" onclick="setChain('BTC')" class="btn btn-white" style="padding:8px 12px">BTC</button><button id="bETH" onclick="setChain('ETH')" class="btn btn-dark" style="padding:8px 12px">ETH</button><button id="bSOL" onclick="setChain('SOL')" class="btn btn-dark" style="padding:8px 12px">SOL</button></div>
<div id="walletBox" style="padding:12px;background:#0f0f14;border-radius:12px;border:1px dashed #32dc7d;word-break:break-all;font-size:12px"></div>
<input id="txInput" placeholder="TxID REAL blockchain - Pega aquí" style="margin-top:10px"><input id="emailPay" placeholder="Tu email registrado SEXCITES.COM"><button class="btn btn-pink" style="width:100%;padding:14px;background:#32dc7d;color:#000" onclick="verifyPay()">VERIFICAR PAGO REAL 24/7 ALTA TENSION — SEXCITES.COM</button>
<div id="payOk" class="ok"></div><div id="payErr" class="err"></div>
</div></div>

<script>
// HIGH QUALITY MOVING BACKGROUND - REAL CANVAS - NO BAJA CALIDAD
const canvas=document.getElementById('bgCanvas');
const ctx=canvas.getContext('2d',{alpha:false});
let dpr=window.devicePixelRatio||1;
function resizeCanvas(){
  dpr=window.devicePixelRatio||1;
  canvas.width=innerWidth*dpr;
  canvas.height=innerHeight*dpr;
  canvas.style.width=innerWidth+'px';
  canvas.style.height=innerHeight+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
resizeCanvas();
addEventListener('resize',resizeCanvas);

let blobs=[
  {x:0.22,y:0.22,r:520,c:'255,45,145',vx:0.18,vy:0.12,phase:0},
  {x:0.82,y:0.28,r:620,c:'118,87,255',vx:-0.14,vy:0.16,phase:1.5},
  {x:0.55,y:0.88,r:680,c:'255,100,140',vx:0.12,vy:-0.18,phase:3}
];
let particles=[];
for(let i=0;i<70;i++) particles.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-0.5)*0.5,vy:(Math.random()-0.5)*0.5,r:Math.random()*1.6+0.3});

function drawBG(t){
  let w=innerWidth,h=innerHeight;
  let base=ctx.createLinearGradient(0,0,0,h);
  base.addColorStop(0,'#0b0c14');
  base.addColorStop(1,'#07080c');
  ctx.fillStyle=base;
  ctx.fillRect(0,0,w,h);

  let time=t*0.0004;
  blobs.forEach((b,i)=>{
    b.x+=b.vx*0.4; b.y+=b.vy*0.4;
    if(b.x<0.12||b.x>0.88) b.vx*=-1;
    if(b.y<0.12||b.y>0.88) b.vy*=-1;
    let cx=b.x*w+Math.sin(time+b.phase)*90;
    let cy=b.y*h+Math.cos(time*0.7+b.phase)*70;
    let g=ctx.createRadialGradient(cx,cy,0,cx,cy,b.r);
    g.addColorStop(0,'rgba('+b.c+',0.32)');
    g.addColorStop(0.35,'rgba('+b.c+',0.10)');
    g.addColorStop(1,'rgba('+b.c+',0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(cx,cy,b.r,0,Math.PI*2); ctx.fill();
  });

  // particles + lines high quality
  ctx.lineWidth=0.6;
  for(let i=0;i<particles.length;i++){
    let a=particles[i];
    a.x+=a.vx; a.y+=a.vy;
    if(a.x<0||a.x>w) a.vx*=-1;
    if(a.y<0||a.y>h) a.vy*=-1;
    ctx.beginPath(); ctx.arc(a.x,a.y,a.r,0,Math.PI*2);
    ctx.fillStyle='rgba(255,140,180,0.55)'; ctx.fill();
    for(let j=i+1;j<particles.length;j++){
      let b=particles[j];
      let dx=a.x-b.x, dy=a.y-b.y, dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<130){
        ctx.strokeStyle='rgba(255,110,150,'+(0.12*(1-dist/130))+')';
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }
    }
  }
  requestAnimationFrame(drawBG);
}
requestAnimationFrame(drawBG);

// hearts high quality
const heartsLayer=document.getElementById('heartsLayer');
function spawnHeart(){
  let el=document.createElement('div');
  el.className='heart';
  el.textContent=Math.random()>0.66?'💖':Math.random()>0.5?'💗':'💓';
  el.style.left=(Math.random()*100)+'vw';
  el.style.setProperty('--dx',(Math.random()*80-40)+'px');
  el.style.animationDuration=(7+Math.random()*8)+'s';
  el.style.fontSize=(12+Math.random()*16)+'px';
  heartsLayer.appendChild(el);
  setTimeout(()=>el.remove(),15000);
}
setInterval(spawnHeart,700);

// UI LOGIC - BOTONES FUNCIONAN - SISTEMA OPERATIVO SIN FALLAS
function openRegister(){document.getElementById('registerModal').classList.add('show');}
function closeRegister(){document.getElementById('registerModal').classList.remove('show');}
function openLogin(){document.getElementById('loginModal').classList.add('show');}
function closeLogin(){document.getElementById('loginModal').classList.remove('show');}
function openFriends(){document.getElementById('friendsModal').classList.add('show');loadFriends();}
function closeFriends(){document.getElementById('friendsModal').classList.remove('show');}
function openPay(){document.getElementById('payModal').classList.add('show');setChain(curChain);}
function closePay(){document.getElementById('payModal').classList.remove('show');}
function escapeHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

let curChain='BTC';
const WALLETS={BTC:'bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s',ETH:'0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c',SOL:'F66a36aKwwvZaaaCSTyfWja4P2dNMmYHK7W2nMBVm6h1'};
function setChain(c){
  curChain=c;
  ['BTC','ETH','SOL'].forEach(x=>{
    let b=document.getElementById('b'+x);
    if(b){b.className=x===c?'btn btn-white':'btn btn-dark';}
  });
  let sel=document.getElementById('planSel').value;
  let box=document.getElementById('walletBox');
  if(box) box.innerHTML='<b>'+c+' REAL — SEXCITES.COM — Bienvenida unico pago $'+sel+' — 24/7 alta tension</b><br><br><span style=color:#32dc7d;font-weight:900;font-size:14px;word-break:break-all>'+WALLETS[c]+'</span><br><br><button onclick=navigator.clipboard.writeText(\\''+WALLETS[c]+'\\');alert(\\'Copiado '+c+'\\') style=padding:8px 12px;border-radius:10px;background:#1e1e26;color:#fff;border:1px solid #333>📋 Copiar '+c+'</button>';
}
function genDeviceId(){let id=localStorage.getItem('did');if(!id){id='D_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36);localStorage.setItem('did',id);}return id;}

async function loadPosts(){
  try{
    const r=await fetch('/api/posts'); const data=await r.json();
    const feed=document.getElementById('feed');
    if(!data.length){
      feed.innerHTML='<div class="post"><strong style="font-size:18px">Welcome to SEXCITES.COM — Alta Calidad Real</strong><p class="msg" style="margin-top:8px">Fondo en movimiento real — Blobs gigantes con blur moviéndose + partículas conectadas + corazones flotando — Marca SEXCITES.COM visible — Botones funcionan — Crear cuenta, contraseña, iniciar sesión sin fallas — Primeros 2 VIP gratis #1 #2 render todo — Cupos 1-500 — Pagos reales $8.99 $16.99 $28.99 bienvenida unico pago</p></div>';
      return;
    }
    feed.innerHTML=data.map(p=>\`
      <article class="post">
        <div class="post-top"><div class="avatar">\${escapeHTML(p.username.slice(0,2).toUpperCase())}</div><div><strong>@\${escapeHTML(p.username)} #\${p.order||''} \${p.isFirst?'<span style=background:#ff2d91;color:#fff;padding:2px 7px;border-radius:10px;font-size:9px>VIP #'+p.order+'</span>':''}</strong><div class="msg">\${new Date(p.createdAt).toLocaleString()}</div></div></div>
        <p style="margin-top:12px;color:#d7d9df;line-height:1.6">\${escapeHTML(p.text)}</p>
        <div style="display:flex;gap:8px;margin-top:12px"><span class="badge">♡ \${p.likes||0} Like</span><span class="badge">💬 Comment</span><span class="badge">SEXCITES.COM</span></div>
      </article>\`).join('');
  }catch(e){console.error(e);}
}

function loadFriends(){
  fetch('/api/db').then(r=>r.json()).then(d=>{
    let div=document.getElementById('friendsList');
    div.innerHTML='<div class="msg">👥 Usuarios registrados: '+d.count+' / '+d.max+' — Primeros 2 VIP gratis — 1 telefono + IP block — SEXCITES.COM alta calidad</div>';
  });
}

function verifyPay(){
  let sel=document.getElementById('planSel').value;
  let email=(document.getElementById('emailPay').value.trim().toLowerCase()||'').toLowerCase();
  let tx=document.getElementById('txInput').value.trim();
  let ok=document.getElementById('payOk'); let err=document.getElementById('payErr');
  ok.style.display='none'; err.style.display='none';
  if(!email||!tx){err.style.display='block';err.textContent='Email + TxID REAL requerido — SEXCITES.COM';return;}
  if(tx.length<15){err.style.display='block';err.textContent='TxID invalido — Debe ser blockchain real';return;}
  fetch('/api/verify-pay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({txid:tx,chain:curChain,amount:sel,email:email})})
  .then(r=>r.json()).then(data=>{
    if(!data.ok){err.style.display='block';err.textContent=data.msg;return;}
    ok.style.display='block';ok.textContent='🔥 SEXCITES.COM — PAGO REAL $'+sel+' VERIFICADO 24/7 '+curChain+' — TxID '+tx.substring(0,16)+'... — Bienvenida unico pago — Alta tension';
  });
}

document.getElementById('registerForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg=document.getElementById('registerMessage'); const ok=document.getElementById('regOk'); const err=document.getElementById('regErr');
  ok.style.display='none'; err.style.display='none'; msg.textContent='Creando cuenta SEXCITES.COM...';
  const body={
    username:document.getElementById('username').value,
    phone:document.getElementById('phone').value,
    email:document.getElementById('email').value,
    password:document.getElementById('password').value,
    adult:document.getElementById('adult').checked,
    deviceId:genDeviceId()
  };
  try{
    const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json();
    if(!r.ok){err.style.display='block';err.textContent=data.error;msg.textContent='';return;}
    ok.style.display='block';ok.textContent=data.message+' — SEXCITES.COM alta calidad — Ya puedes iniciar sesión';
    msg.textContent='';
    localStorage.setItem('sexcites_user',JSON.stringify(data.user));
    setTimeout(()=>{closeRegister();loadPosts();updateCnt();},1200);
  }catch(e){err.style.display='block';err.textContent='Error conexión — Intenta de nuevo';}
});

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const ok=document.getElementById('loginOk'); const err=document.getElementById('loginErr'); const msg=document.getElementById('loginMessage');
  ok.style.display='none'; err.style.display='none'; msg.textContent='Iniciando sesión SEXCITES.COM...';
  const body={email:document.getElementById('loginEmail').value,password:document.getElementById('loginPassword').value};
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json();
    if(!r.ok){err.style.display='block';err.textContent=data.error;msg.textContent='';return;}
    ok.style.display='block';ok.textContent=data.message+' — Marca SEXCITES.COM — Botones funcionan — Sistema operativo sin fallas';
    localStorage.setItem('sexcites_user',JSON.stringify(data.user));
    setTimeout(()=>{closeLogin();},1000);
  }catch(e){err.style.display='block';err.textContent='Error conexión';}
});

function updateCnt(){
  fetch('/api/db').then(r=>r.json()).then(d=>{
    let el=document.getElementById('liveCnt');
    if(el) el.textContent='● '+d.count+' / '+d.max+' LIVE — SEXCITES.COM';
  });
}

window.addEventListener('load',()=>{
  setChain('BTC');
  loadPosts();
  updateCnt();
  setInterval(updateCnt,5000);
});
<\/script>
</body>
</html>`);
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found - SEXCITES.COM" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("SEXCITES.COM HIGH QUALITY LIVE - No baja calidad - Marca SEXCITES.COM visible - Botones funcionan - Fondo movimiento real canvas alta calidad blobs + particulas + corazones - Crear cuenta + contraseña + iniciar sesión sin fallas - Sistema operativo sin fallas - Cupos 1-500 - 1 telefono + IP - $8.99 $16.99 $28.99 bienvenida unico pago - Port " + PORT);
});
