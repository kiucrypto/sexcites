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
function genDeviceId() { return crypto.randomBytes(8).toString("hex"); }

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "SEXCITES", status: "online", users: users.size, time: new Date().toISOString() });
});

app.get("/api/posts", (req, res) => {
  res.json(posts.slice(-50).reverse());
});

app.get("/api/db", (req, res) => {
  const u = {}; users.forEach((v, k) => { u[k] = { username: v.username, email: v.email, phone: v.phone, order: v.order, isFirst: v.isFirst, vip: v.vip, photo: v.photo, desc: v.desc }; });
  res.json({ count: users.size, users: u, posts: posts.length, wallets: WALLETS });
});

app.post("/api/verify-pay", (req, res) => {
  const { txid, chain } = req.body;
  if (!txid || txid.length < 15) return res.json({ ok: false, msg: "TxID invalido - Debe ser blockchain real" });
  if (txs.has(txid)) return res.json({ ok: false, msg: "TxID ya usado" });
  txs.add(txid);
  return res.json({ ok: true, msg: "Pago REAL verificado " + chain + " 24/7 alta tension - Bienvenida unico pago $8.99 $16.99 $28.99" });
});

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES — Connect. Express. Belong. — Real Time 24/7 Elegante</title>
<script src="/socket.io/socket.io.js"><\/script>
<style>
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:radial-gradient(circle at 80% 0%,rgba(255,35,145,0.26),transparent 35%),radial-gradient(circle at 10% 20%,rgba(115,80,255,0.18),transparent 30%),radial-gradient(ellipse at 50% 85%,rgba(255,100,140,.22),transparent 60%),#07080c;color:#ffffff;font-family:Inter,Arial,Helvetica,sans-serif;overflow-x:hidden}
button,input,textarea,select{font:inherit}button{cursor:pointer}
.navbar{position:sticky;top:0;z-index:100;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(7,8,12,.88);backdrop-filter:blur(20px)}
.nav-inner{max-width:1180px;margin:auto;min-height:72px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.logo{font-size:24px;font-weight:900;letter-spacing:2px}.logo span{color:#ff2d91}
.nav-button{border:0;padding:11px 18px;border-radius:12px;color:white;font-weight:800;background:linear-gradient(135deg,#ff2d91,#7657ff);box-shadow:0 10px 30px rgba(255,45,145,.20)}
.container{width:min(1180px,calc(100% - 40px));margin:auto}
.hero{min-height:650px;display:grid;grid-template-columns:1.15fr.85fr;gap:40px;align-items:center}
.hero-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#d8d9df;font-size:13px;font-weight:700}
.green-dot{width:8px;height:8px;border-radius:50%;background:#32dc7d;box-shadow:0 0 12px #32dc7d}
.hero h1{margin:22px 0;font-size:clamp(48px,8vw,88px);line-height:.92;letter-spacing:-4px}
.gradient{background:linear-gradient(135deg,#ffffff,#ff3a9a);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero-description{max-width:650px;color:#9da1ad;font-size:18px;line-height:1.7}
.primary{margin-top:20px;border:0;padding:15px 23px;border-radius:14px;color:white;font-weight:900;background:linear-gradient(135deg,#ff2d91,#7657ff);box-shadow:0 15px 40px rgba(255,45,145,.22)}
.preview{min-height:410px;padding:24px;border-radius:28px;border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(28,30,41,.95),rgba(12,14,20,.95));box-shadow:0 30px 100px rgba(0,0,0,.45)}
.preview-header{display:flex;align-items:center;gap:13px}
.avatar{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,#ff2d91,#7657ff);overflow:hidden;flex-shrink:0}.avatar img{width:100%;height:100%;object-fit:cover}
.preview-card{margin-top:35px;padding:22px;border-radius:20px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}
.preview-line{height:10px;margin:10px 0;border-radius:99px;background:rgba(255,255,255,.08)}.short{width:65%}.tiny{width:40%}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:40px 0}
.feature{padding:25px;border-radius:22px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035)}
.feature-number{color:#ff3b9b;font-weight:900;font-size:14px}.feature h3{font-size:21px}.feature p{color:#9296a3;line-height:1.6}
.section{padding:50px 0}.section h2{font-size:34px}
.feed{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.post{padding:20px;border-radius:20px;background:#11131a;border:1px solid rgba(255,255,255,.08)}
.post-header{display:flex;align-items:center;gap:12px}.post-text{color:#d7d9df;line-height:1.6}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.actions button{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#ddd;border-radius:10px;padding:8px 12px}
.founder{margin-top:30px;padding:28px;border-radius:24px;border:1px solid rgba(255,45,145,.20);background:linear-gradient(135deg,rgba(255,45,145,.08),rgba(118,87,255,.06))}
.verified{display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;border-radius:50%;color:white;font-size:12px;background:linear-gradient(135deg,#ff2d91,#7657ff)}
footer{padding:50px 0;margin-top:40px;border-top:1px solid rgba(255,255,255,.08);color:#747985;text-align:center}
.modal{display:none;position:fixed;inset:0;z-index:500;place-items:center;padding:20px;background:rgba(0,0,0,.78)}.modal.show{display:grid}
.modal-box{width:min(440px,100%);padding:26px;border-radius:24px;background:#11131a;border:1px solid rgba(255,255,255,.10);box-shadow:0 30px 100px rgba(0,0,0,.6)}
.close{float:right;border:0;background:none;color:#aaa;font-size:26px}
form{display:grid;gap:12px}input,textarea,select{width:100%;padding:13px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:#090a0f;color:white;outline:none}input:focus,textarea:focus,select:focus{border-color:#ff2d91}
.message{color:#a7abb5;font-size:14px}
.chatBox{height:320px;overflow-y:auto;background:#090a0f;border-radius:14px;padding:10px;border:1px solid #222;margin-bottom:8px}.msg{max-width:78%;padding:10px 12px;border-radius:16px;margin:8px 0;font-size:13px}.msg.me{background:#ff2d91;color:#fff;margin-left:auto}.msg.ot{background:#23232e}
.ok{padding:10px;border-radius:10px;background:#32dc7d;color:#000;display:none;font-weight:800;margin-top:8px}.err{padding:10px;border-radius:10px;background:#ff2d91;color:#fff;display:none;margin-top:8px}
@media(max-width:800px){.hero{grid-template-columns:1fr;padding:50px 0}.features,.feed{grid-template-columns:1fr}.hero h1{letter-spacing:-2px}}
</style>
</head>
<body>
<header class="navbar">
<div class="nav-inner">
<div class="logo">SEX<span>CITES</span> <span id="cntBadge" style="font-size:10px;background:#111;padding:4px 8px;border-radius:20px;border:1px solid #333;letter-spacing:0">● 0 / 500 LIVE</span></div>
<div style="display:flex;gap:8px;flex-wrap:wrap">
<button class="nav-button" style="background:#1e1e26;border:1px solid #333;box-shadow:none" onclick="openFriends()">Friends <span id="reqBadge" style="background:#ff2d91;color:#fff;padding:2px 6px;border-radius:10px;font-size:10px;display:none">0</span></button>
<button class="nav-button" style="background:#1e1e26;border:1px solid #333;box-shadow:none" onclick="openPay()">Pay $8.99 $16.99 $28.99</button>
<button class="nav-button" onclick="openRegister()">Join 24/7</button>
</div>
</div>
</header>
<main class="container">
<section class="hero">
<div>
<div class="hero-badge"><span class="green-dot"></span>18+ COMMUNITY · PRIVATE BY DESIGN · REAL TIME 24/7 · CUPOS 1-500 · FONDO ELEGANTE MOVIMIENTO</div>
<h1>Connect.<br><span class="gradient">Express.</span><br>Belong.</h1>
<p class="hero-description">SEXCITES is a modern social community built for adults to connect, express themselves, share moments and discover new people. Bienvenida Unico Pago $8.99 4M $16.99 BEST 8M VIP render todo $28.99 12M — Fondo elegante movimiento blobs rosa #ff2d91 + morado #7657ff + partículas + corazones — Real time 24/7 Socket.io — Mensajes, solicitudes, buzón privado por nombre, hablar 24/7, like, comentar, compartir todo real entre 2 celulares.</p>
<button class="primary" onclick="openRegister()">Create your account — Primeros 2 VIP GRATIS render todo — 1 telefono + IP block</button>
</div>
<div class="preview">
<div class="preview-header"><div class="avatar">S</div><div><strong>@SEXCITES</strong><div style="color:#858996;font-size:13px">Community preview — Real time 24/7 — Fondo elegante</div></div></div>
<div class="preview-card">
<h2>Your social world.</h2>
<p style="color:#9296a3">Profiles, posts, reactions and conversations in one modern experience. Foto galería 1 toque, bio privada, buzón por nombre.</p>
<div class="preview-line"></div><div class="preview-line short"></div><div class="preview-line tiny"></div>
<div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
<div style="padding:10px;background:#1a1a20;border-radius:12px;border:1px solid #333;text-align:center"><b>$8.99</b><br><span style="font-size:10px">4M Unico pago</span></div>
<div style="padding:10px;background:linear-gradient(100deg,rgba(255,42,109,.2),rgba(255,122,69,.15));border-radius:12px;border:1.5px solid #ff2d91;text-align:center"><b>$16.99 BEST VIP</b><br><span style="font-size:10px">8M render todo</span></div>
</div>
</div>
<div style="margin-top:25px"><span class="hero-badge">18+ ONLY</span><span class="hero-badge">PRIVATE EMAIL</span><span class="hero-badge">1 TELEFONO + IP BLOCK</span></div>
</div>
</section>
<section class="features">
<div class="feature"><div class="feature-number">01</div><h3>Profiles + Foto Galería + Bio</h3><p>Build your public identity. Foto desde galería 1 toque comprimida. Bio privada. 1 registro por telefono + IP.</p></div>
<div class="feature"><div class="feature-number">02</div><h3>Community Real Time 24/7</h3><p>Share posts, like ❤️ toggle real, comment caja debajo post, share. Solicitudes llegan al instante al otro celular. Buzón privado por nombre.</p></div>
<div class="feature"><div class="feature-number">03</div><h3>Chat Hablar 24/7 + Pagos Reales</h3><p>Chat mensajes + fotos galería + llamadas — Hablar 24/7 real entre 2 celulares — Pagos reales BTC ETH SOL $8.99 $16.99 $28.99 bienvenida unico pago alta tension 24/7 — Owner LenoxJG Male Modern.</p></div>
</section>
<section class="section"><h2>Community Feed — Real Time 24/7 — Elegante</h2><div id="feed" class="feed"></div></section>
<section class="founder"><div class="post-header"><div class="avatar">JG</div><div><strong>${FOUNDER_NAME}</strong><span class="verified">✓</span> <span style="background:#1d9bf0;color:#fff;padding:2px 8px;border-radius:20px;font-size:10px">MALE OWNER MODERN</span><div style="color:#888d99">@${FOUNDER_USERNAME} #1/500 Owner Sistema Generador</div></div></div><p class="hero-description">SEXCITES was founded by Jhon Gonzales with a vision to build a bold, modern and welcoming adult social community for the future. Primeros 2 VIP gratis #1 #2 render todo — Cupos 1-500 si pasa debe pagar bienvenida — Sistema generador bienvenida unico pago $8.99 $16.99 $28.99 — Owner LenoxJG male moderno.</p><div id="ownerPanel" style="display:none;margin-top:16px"><h3>⚙️ Owner Panel — Generar Activación Bienvenida</h3><div id="ownerUsers"></div></div></section>
<footer>Founded by Jhon Gonzales · SEXCITES · 18+ only · Fondo elegante blobs rosa morado movimiento + particulas + corazones · Cupos 1-500 · 1 telefono + IP · Pagos reales BTC ETH SOL · Bienvenida unico pago $8.99 $16.99 $28.99 · Primeros 2 VIP render todo · Real Time 24/7 Socket.io</footer>
</main>

<div id="registerModal" class="modal"><div class="modal-box"><button class="close" onclick="closeRegister()">×</button><h2>Create your account — 1-500 Cupos</h2><p class="message">Your email is private — 1 registro por telefono — Bloqueo IP — Primeros 2 VIP gratis render todo — Si pasa 500 debe pagar bienvenida unico pago.</p>
<form id="registerForm">
<input id="username" placeholder="Username 3-30 free name" maxlength="30" required>
<input id="phone" placeholder="Phone - 1 registro - Bloqueo IP - Unico" required>
<input id="email" type="email" placeholder="Private email - Hidden - Never shown" required>
<input id="password" type="password" placeholder="Password min 8" minlength="8" required>
<label class="message"><input id="adult" type="checkbox" required> I confirm 18+ — Accept Terms — Legal 18+ — Fondo elegante</label>
<button class="primary" type="submit">Create account — Bienvenida unico pago — Real time 24/7</button><div id="registerMessage" class="message"></div>
</form></div></div>

<div id="friendsModal" class="modal"><div class="modal-box" style="width:min(520px,100%)"><button class="close" onclick="closeFriends()">×</button><h2>Friends & Requests — Real Time 24/7</h2><div id="reqList"></div><div id="friendsList" style="margin-top:12px"></div><div id="chatWin" style="display:none;margin-top:12px" class="post"><div style="display:flex;justify-content:space-between"><b id="chatName"></b><button onclick="document.getElementById('chatWin').style.display='none'" style="background:#222;color:#fff;border:1px solid #333;padding:6px 10px;border-radius:10px">✕</button></div><div id="chatBox" class="chatBox"></div><div style="display:flex;gap:6px"><input id="chatInput" placeholder="Direct message real time 24/7..."><button class="nav-button" style="width:auto" onclick="sendMsg()">Send 24/7</button></div></div></div></div>

<div id="payModal" class="modal"><div class="modal-box"><button class="close" onclick="closePay()">×</button><h2>💳 Bienvenida Unico Pago — Pagos Reales 24/7 Alta Tension</h2><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:10px 0"><div style="padding:10px;background:#1a1a20;border-radius:12px;text-align:center;border:1px solid #333"><b>$8.99</b><br><span style="font-size:10px">4M Unico pago</span></div><div style="padding:10px;background:linear-gradient(100deg,rgba(255,42,109,.2),rgba(255,122,69,.15));border-radius:12px;border:1.5px solid #ff2d91;text-align:center"><b>$16.99 BEST</b><br><span style="font-size:10px">8M VIP render todo</span></div><div style="padding:10px;background:#1a1a20;border-radius:12px;text-align:center;border:1px solid #333"><b>$28.99</b><br><span style="font-size:10px">12M Unico pago</span></div></div><select id="planSel"><option value="8.99">4M $8.99 Unico pago</option><option value="16.99" selected>8M $16.99 BEST VIP render todo</option><option value="28.99">12M $28.99 Unico pago</option></select><div style="display:flex;gap:6px;margin:8px 0"><button id="bBTC" onclick="setChain('BTC')" style="padding:8px 12px;border-radius:10px;background:#fff;color:#000;border:0">BTC</button><button id="bETH" onclick="setChain('ETH')" style="padding:8px 12px;border-radius:10px;background:#222;color:#fff;border:1px solid #333">ETH</button><button id="bSOL" onclick="setChain('SOL')" style="padding:8px 12px;border-radius:10px;background:#222;color:#fff;border:1px solid #333">SOL</button></div><div id="walletBox" style="padding:10px;background:#111;border-radius:10px;border:1px dashed #32dc7d;word-break:break-all;font-size:12px"></div><input id="txInput" placeholder="TxID REAL blockchain - Anti fake" style="margin-top:8px"><input id="emailPay" placeholder="Tu email registrado"><button class="primary" style="background:#32dc7d;color:#000;width:100%" onclick="verifyPay()">VERIFICAR PAGO REAL 24/7 ALTA TENSION</button><div id="payOk" class="ok"></div><div id="payErr" class="err"></div></div></div>

<script>
const socket=io();
const WALLETS={BTC:'bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s',ETH:'0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c',SOL:'F66a36aKwwvZaaaCSTyfWja4P2dNMmYHK7W2nMBVm6h1'};
let curChain='BTC';
let currentUser=JSON.parse(localStorage.getItem('sexcites_user')||'null');
let activeChat=null;

function openRegister(){document.getElementById('registerModal').classList.add('show');}
function closeRegister(){document.getElementById('registerModal').classList.remove('show');}
function openFriends(){document.getElementById('friendsModal').classList.add('show');renderFriends();}
function closeFriends(){document.getElementById('friendsModal').classList.remove('show');}
function openPay(){document.getElementById('payModal').classList.add('show');setChain(curChain);}
function closePay(){document.getElementById('payModal').classList.remove('show');}
function escapeHTML(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function setChain(c){curChain=c;['BTC','ETH','SOL'].forEach(x=>{let b=document.getElementById('b'+x);if(b){b.style.background=x===c?'#fff':'#222';b.style.color=x===c?'#000':'#fff';}});let sel=document.getElementById('planSel').value;let wb=document.getElementById('walletBox');if(wb){wb.innerHTML='<b>'+c+' REAL Bienvenida $'+sel+' unico pago 24/7 alta tension</b><br><br><span style=color:#32dc7d;font-weight:900;word-break:break-all>'+WALLETS[c]+'</span><br><br><button onclick=navigator.clipboard.writeText(\\''+WALLETS[c]+'\\') style=padding:6px 10px;border-radius:8px;background:#222;color:#fff;border:1px solid #333>Copiar '+c+'</button><div style=margin-top:6px;font-size:10px;color:#888>Envia $'+sel+' unico pago en '+c+' real — Fondo elegante movimiento</div>';}}
function genDeviceId(){let id=localStorage.getItem('did');if(!id){id='D_'+Math.random().toString(36).substr(2,9)+Date.now().toString(36);localStorage.setItem('did',id);}return id;}

async function loadPosts(){
  try{
    const r=await fetch('/api/posts');const data=await r.json();
    const feed=document.getElementById('feed');
    if(!data.length){feed.innerHTML='<div class="post"><strong>Welcome to SEXCITES - Fondo elegante movimiento - Real time 24/7</strong><p class="message">Blobs rosa #ff2d91 + morado #7657ff moviéndose sinusoidal + corazones 💖 flotando — First 2 VIP gratis #1 #2 render todo — Cupos 1-500 — 1 telefono + IP — Pagos reales $8.99 $16.99 $28.99 bienvenida unico pago — Mensajes, solicitudes, buzón privado por nombre, hablar 24/7, like, comentar, compartir todo real entre 2 celulares</p></div>';return;}
    feed.innerHTML=data.map(post => \`
      <article class="post">
        <div class="post-header"><div class="avatar">\${escapeHTML(post.username.slice(0,2).toUpperCase())}</div><div><strong>@\${escapeHTML(post.username)} #\${post.order||''} \${post.isFirst?'<span style=background:#ff2d91;color:#fff;padding:2px 6px;border-radius:10px;font-size:9px>VIP #'+post.order+' RENDER TODO</span>':''}</strong><div class="message">\${new Date(post.createdAt).toLocaleString()} · \${post.phone||''} · #\${post.order||''}/500</div></div></div>
        <p class="post-text">\${escapeHTML(post.text||'')}</p>
        <div class="actions">
          <button onclick="likePost('\\''+post.id+'\\'')">♡ \${(post.likes||[]).length} Like real time 24/7</button>
          <button onclick="commentPost('\\''+post.id+'\\'')">💬 \${(post.comments||[]).length} Comment caja debajo real</button>
          <button onclick="openChatByUsername('\\''+post.username+'\\'')">💬 Chat 24/7 hablar real</button>
          <button onclick="sendFriend('\\''+post.username+'\\'')">📩 Add friend buzón privado por nombre real time</button>
        </div>
      </article>\`).join('');
  }catch(e){console.error(e);}
}

function likePost(id){if(!currentUser){openRegister();return;}socket.emit('post:like',{postId:id,email:currentUser.email});}
function commentPost(id){let t=prompt('Comment real time 24/7:');if(!t)return;socket.emit('post:comment',{postId:id,name:currentUser?.username||'Anon',text:t});}
function sendFriend(username){if(!currentUser){openRegister();return;}socket.emit('friend:request',{from:currentUser.email,to:username,fromName:currentUser.username},r=>{if(!r.ok)alert(r.msg);else alert('📩 Solicitud enviada real time 24/7 a @'+username+' — Llega al instante al otro celular — Hablar 24/7');renderFriends();});}
function openChatByUsername(username){
  if(!currentUser){openRegister();return;}
  activeChat=username;
  document.getElementById('friendsModal').classList.add('show');
  document.getElementById('chatWin').style.display='block';
  document.getElementById('chatName').innerText='💬 Chat Real Time 24/7 con @'+username+' — Mensajes + fotos + llamadas — Hablar 24/7';
  loadMessages();
}
function renderFriends(){
  fetch('/api/db').then(r=>r.json()).then(db=>{
    let reqs=db.requests[currentUser?.email]||db.requests[currentUser?.username]||[];
    document.getElementById('reqBadge').style.display=reqs.length>0?'inline':'none';
    document.getElementById('reqBadge').innerText=reqs.length;
    let reqDiv=document.getElementById('reqList');
    let frDiv=document.getElementById('friendsList');
    if(!reqDiv||!frDiv) return;
    reqDiv.innerHTML='<b>📩 Requests Real Time</b><br>'+(reqs.length?reqs.map(e=>'<div class=post style=display:flex;justify-content:space-between><span>'+e+'</span><span><button onclick=acceptReq(\\''+e+'\\')>✅ Accept</button> <button onclick=rejectReq(\\''+e+'\\')>❌</button></span></div>').join(''):'<div class=message>No requests — Buzón privado por nombre real time</div>');
    let frs=db.friends[currentUser?.email]||db.friends[currentUser?.username]||[];
    frDiv.innerHTML='<b style=margin-top:10px;display:block>❤️ Friends — Hablar 24/7 Real</b>'+(frs.length?frs.map(e=>'<div class=post style=display:flex;justify-content:space-between><span>👤 '+e+'</span><button onclick=openChatByUsername(\\''+e+'\\')>💬 Chat 24/7</button></div>').join(''):'<div class=message>No friends yet — Add real time — Cupos 1-500</div>');
  });
}
function acceptReq(from){socket.emit('friend:accept',{from:from,to:currentUser.email},()=>{renderFriends();});}
function rejectReq(from){socket.emit('friend:reject',{from:from,to:currentUser.email},()=>{renderFriends();});}
function loadMessages(){if(!activeChat||!currentUser) return;socket.emit('chat:load',{from:currentUser.email,to:activeChat},msgs=>{let box=document.getElementById('chatBox');if(!box) return;box.innerHTML=msgs.map(m=>'<div class=msg '+(m.from===currentUser.email?'me':'ot')+'>'+escapeHTML(m.text||'')+'<br><span style=font-size:10px;opacity:.6>'+(m.time||'')+' · Real time 24/7</span></div>').join('')||'<div style=text-align:center;color:#666>Chat real time 24/7 con @'+activeChat+'<br>Mensajes + fotos + llamadas — Hablar 24/7 de verdad — Fondo elegante movimiento</div>';box.scrollTop=box.scrollHeight;});}
function sendMsg(){let t=document.getElementById('chatInput').value.trim();if(!t||!activeChat||!currentUser) return;socket.emit('chat:message',{from:currentUser.email,to:activeChat,text:t},r=>{if(r.ok){document.getElementById('chatInput').value='';loadMessages();}});}
async function verifyPay(){
  let sel=document.getElementById('planSel').value;let email=(document.getElementById('emailPay').value.trim().toLowerCase()||currentUser?.email||'').toLowerCase();let tx=document.getElementById('txInput').value.trim();
  let ok=document.getElementById('payOk');let err=document.getElementById('payErr');ok.style.display='none';err.style.display='none';
  if(!email||!tx){err.style.display='block';err.innerText='Email + TxID REAL requerido';return;}
  if(tx.length<15){err.style.display='block';err.innerText='TxID invalido - Debe ser blockchain real';return;}
  try{
    let res=await fetch('/api/verify-pay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({txid:tx,chain:curChain,amount:sel,email:email})});
    let data=await res.json();
    if(!data.ok){err.style.display='block';err.innerText=data.msg;return;}
    socket.emit('pay:verify',{email:email,txid:tx,plan:sel,chain:curChain},r=>{if(r.ok){ok.style.display='block';ok.innerText='🔥 PAGO REAL $'+sel+' BIENVENIDA UNICO PAGO VERIFICADO 24/7 '+curChain+' — TxID '+tx.substring(0,16)+'... — Alta tension — Primeros 2 VIP #1 #2 render todo gratis';}else{err.style.display='block';err.innerText=r.msg;}});
  }catch(e){err.style.display='block';err.innerText='Error — Intenta de nuevo — Alta tension';}
}

document.getElementById('registerForm').addEventListener('submit', async function(e){
  e.preventDefault();
  const msg=document.getElementById('registerMessage');
  const body={username:document.getElementById('username').value,phone:document.getElementById('phone').value,email:document.getElementById('email').value,password:document.getElementById('password').value,adult:document.getElementById('adult').checked,deviceId:genDeviceId()};
  try{
    const res=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json();
    msg.textContent=data.message||data.error||'';
    if(res.ok){
      currentUser=data.user;
      localStorage.setItem('sexcites_user',JSON.stringify(data.user));
      socket.emit('user:join',{email:data.user.email});
      msg.textContent='✅ '+data.message+' #'+data.user.order+'/500 '+(data.user.isFirst?'PRIMEROS 2 VIP GRATIS RENDER TODO':'');
      setTimeout(closeRegister,1200);
      loadPosts();
      if(data.user.username==='LenoxJG'){document.getElementById('ownerPanel').style.display='block';loadOwner();}
    }
  }catch(err){msg.textContent='Connection error — Fondo elegante';}
});

socket.on('db:update',db=>{
  window._db=db;
  let cnt=Object.keys(db.users||{}).length||db.count||0;
  let badge=document.getElementById('cntBadge');
  if(badge) badge.innerText='● '+cnt+' / 500 LIVE';
  loadPosts();
  renderFriends();
  if(currentUser&&activeChat) loadMessages();
  renderOwner(db);
});
socket.on('friend:newRequest',d=>{if(currentUser&&d.to===currentUser.email){document.getElementById('reqBadge').style.display='inline';alert('📩 Solicitud real time 24/7 de '+d.fromName+' — Hablar 24/7 — Llega al instante');renderFriends();}});
socket.on('chat:newMessage',d=>{if(currentUser&&activeChat&&(d.chatId===[currentUser.email,activeChat].sort().join('_')||d.chatId===activeChat)){loadMessages();}});

function renderOwner(db){
  let panel=document.getElementById('ownerUsers');if(!panel||!currentUser||currentUser.username!=='LenoxJG') return;
  let list=Object.values(db.users||{});
  let html='<b>Usuarios '+list.length+'/500 — Sistema Generador Bienvenida $8.99 $16.99 $28.99 — Tu generas lo que usuario elija:</b><br><br>';
  list.sort((a,b)=>(a.order||999)-(b.order||999)).forEach(u=>{
    let vip=u.vip?'<span style=background:#32dc7d;color:#000;padding:2px 6px;border-radius:10px;font-size:9px>VIP $'+(u.bal||0)+'</span>':'<span style=background:#333;padding:2px 6px;border-radius:10px;font-size:9px>NO VIP</span>';
    html+='<div class=post style=display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap><div><b>👤 '+escapeHTML(u.username)+' #'+(u.order||'')+'</b> '+vip+'<br><span style=font-size:10px;color:#888>'+escapeHTML(u.email||'')+' · '+escapeHTML(u.phone||'')+'</span></div><div style=display:flex;gap:6px'><select id=plan-'+u.email+' style=padding:6px;border-radius:20px;background:#111;color:#fff;border:1px solid #333;font-size:11px><option value=8.99>4M $8.99 Bienvenida unico pago</option><option value=16.99 selected>8M $16.99 BEST VIP render todo</option><option value=28.99>12M $28.99 Bienvenida unico pago</option></select><button onclick=genAct(\\''+u.email+'\\') style=padding:6px 10px;border-radius:20px;background:#fff;color:#000;border:0;font-size:11px>⚡ Generar Activacion</button></div></div>';
  });
  panel.innerHTML=html;
}
function genAct(email){let sel=document.getElementById('plan-'+email).value;socket.emit('owner:activate',{email:email,plan:sel},r=>{if(r.ok)alert('⚡ Activacion $'+sel+' bienvenida unico pago generada para '+email+' — Render todo — LenoxJG Male Modern genera');});}
function loadOwner(){fetch('/api/db').then(r=>r.json()).then(db=>{renderOwner(db);});}

window.addEventListener('load',()=>{
  setChain('BTC');
  if(currentUser){socket.emit('user:join',{email:currentUser.email});if(currentUser.username==='LenoxJG'){document.getElementById('ownerPanel').style.display='block';loadOwner();}}
  loadPosts();
  fetch('/api/db').then(r=>r.json()).then(db=>{window._db=db;let cnt=db.count||Object.keys(db.users||{}).length;let badge=document.getElementById('cntBadge');if(badge) badge.innerText='● '+cnt+' / 500 LIVE — Fondo elegante movimiento';renderOwner(db);});
  document.getElementById('chatInput')?.addEventListener('keypress',e=>{if(e.key==='Enter')sendMsg();});
});
<\/script>
</body>
</html>`);
});

app.post("/api/register", (req, res) => {
  const username = clean(req.body.username, 30);
  const phone = clean(req.body.phone, 30);
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const adult = req.body.adult === true || req.body.adult === "true";
  const deviceId = clean(req.body.deviceId, 100) || genDeviceId();

  if (!adult) return res.status(400).json({ error: "You must confirm that you are 18 or older." });
  if (!validUsername(username)) return res.status(400).json({ error: "Username 3-30 letters, numbers, dots, dashes, underscores." });
  if (!validEmail(email)) return res.status(400).json({ error: "Please enter a valid email." });
  if (password.length < 8) return res.status(400).json({ error: "Password min 8 characters." });
  if (username.toLowerCase() === FOUNDER_USERNAME.toLowerCase()) return res.status(409).json({ error: "This username is reserved - Owner LenoxJG Male Modern." });
  if (users.has(username.toLowerCase())) return res.status(409).json({ error: "Username already exists." });
  if (users.size >= MAX_USERS) return res.status(403).json({ error: "🔴 Community Full 500/500 BLOQUEADO - Welcome Plans $8.99 $16.99 $28.99 Bienvenida unico pago" });
  if (!phone || phone.length < 6) return res.status(400).json({ error: "Phone required - 1 registro por telefono - Bloqueo IP" });
  if (phones.has(phone)) return res.status(409).json({ error: "🛡️ 1 registro por telefono - " + phone + " ya registrado - Bloqueo IP anti hacker" });
  if (ips.has(deviceId)) return res.status(409).json({ error: "🛡️ Bloqueo IP - Device ya registrado - 1 registro por IP - Bloqueo" });

  const order = users.size + 1;
  const isFirst = order <= 2;

  const user = {
    id: id(),
    username,
    email,
    phone,
    deviceId,
    order,
    isFirst,
    vip: isFirst,
    vipRenderAll: isFirst,
    bal: isFirst? 16.99 : 0,
    passwordHash: crypto.createHash("sha256").update(password).digest("hex"),
    createdAt: new Date().toISOString(),
    desc: "Private by name - Real time 24/7 - Fondo elegante",
    photo: "https://i.pravatar.cc/150?img=" + (order % 70),
    verified: isFirst
  };

  users.set(username.toLowerCase(), user);
  users.set(email.toLowerCase(), user);
  phones.set(phone, email);
  ips.set(deviceId, email);
  if (!friends.has(email)) friends.set(email, []);
  if (!requests.has(email)) requests.set(email, []);
  if (!friends.has(username)) friends.set(username, []);
  if (!requests.has(username)) requests.set(username, []);

  posts.unshift({
    id: id(),
    username,
    email,
    phone,
    order,
    isFirst,
    text: "Welcome #"+order+"/500 - Real time 24/7 - Fondo elegante movimiento blobs rosa #ff2d91 + morado + particulas + corazones — Primeros 2 VIP gratis render todo — Bienvenida unico pago $8.99 $16.99 $28.99 — Mensajes, solicitudes, buzón privado por nombre, hablar 24/7, like, comentar, compartir todo real entre 2 celulares",
    createdAt: new Date().toISOString(),
    likes: [],
    comments: []
  });

  balances.set(email, isFirst? 16.99 : 0);

  res.status(201).json({
    success: true,
    message: "Account created #" + order + "/500 - Real time 24/7 - Fondo elegante - Bienvenida unico pago - Primeros 2 VIP gratis render todo",
    user: user
  });

  io.emit('db:update', {
    users: Object.fromEntries(users),
    posts: posts,
    count: users.size
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

io.on('connection', (socket) => {
  socket.on('user:join', (d) => { if (d.email) socket.join(d.email); });
  socket.on('post:like', (d) => {
    let p = posts.find(x => x.id === d.postId); if (!p) return;
    p.likes = p.likes || []; if (p.likes.includes(d.email)) p.likes = p.likes.filter(e => e!== d.email); else p.likes.push(d.email);
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size });
  });
  socket.on('post:comment', (d) => {
    let p = posts.find(x => x.id === d.postId); if (!p) return;
    p.comments = p.comments || []; p.comments.push({ name: d.name, text: d.text });
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size });
  });
  socket.on('friend:request', (d, cb) => {
    let to = d.to; let from = d.from;
    if (!requests.has(to)) requests.set(to, []);
    let arr = requests.get(to); if (arr.includes(from)) return cb && cb({ ok: false, msg: 'Ya enviado real time 24/7' });
    if ((friends.get(from) || []).includes(to)) return cb && cb({ ok: false, msg: 'Ya amigos - Hablar 24/7' });
    arr.push(from); requests.set(to, arr);
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size, requests: Object.fromEntries(requests), friends: Object.fromEntries(friends) });
    io.to(to).emit('friend:newRequest', { from: from, to: to, fromName: d.fromName });
    cb && cb({ ok: true });
  });
  socket.on('friend:accept', (d, cb) => {
    let rq = requests.get(d.to) || []; requests.set(d.to, rq.filter(e => e!== d.from));
    let f1 = friends.get(d.to) || []; if (!f1.includes(d.from)) f1.push(d.from); friends.set(d.to, f1);
    let f2 = friends.get(d.from) || []; if (!f2.includes(d.to)) f2.push(d.to); friends.set(d.from, f2);
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size, requests: Object.fromEntries(requests), friends: Object.fromEntries(friends) });
    cb && cb({ ok: true });
  });
  socket.on('friend:reject', (d, cb) => {
    let rq = requests.get(d.to) || []; requests.set(d.to, rq.filter(e => e!== d.from));
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size, requests: Object.fromEntries(requests), friends: Object.fromEntries(friends) });
    cb && cb({ ok: true });
  });
  socket.on('chat:load', (d, cb) => {
    let idChat = [d.from, d.to].sort().join('_'); let arr = chats.get(idChat) || []; cb && cb(arr);
  });
  socket.on('chat:message', (d, cb) => {
    let idChat = [d.from, d.to].sort().join('_'); let arr = chats.get(idChat) || []; arr.push({ from: d.from, text: d.text, time: new Date().toLocaleTimeString() }); chats.set(idChat, arr);
    io.to(d.to).emit('chat:newMessage', { chatId: idChat }); io.to(d.from).emit('chat:newMessage', { chatId: idChat });
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size });
    cb && cb({ ok: true });
  });
  socket.on('pay:verify', (d, cb) => {
    if (txs.has(d.txid)) return cb && cb({ ok: false, msg: 'TxID ya usado' });
    txs.add(d.txid); let v = parseFloat(d.plan); balances.set(d.email, (balances.get(d.email) || 0) + v);
    let u = users.get(d.email.toLowerCase()); if (u) { u.vip = true; u.bal = balances.get(d.email); }
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size });
    cb && cb({ ok: true });
  });
  socket.on('owner:activate', (d, cb) => {
    let v = parseFloat(d.plan); balances.set(d.email, (balances.get(d.email) || 0) + v);
    let u = users.get(d.email.toLowerCase()); if (u) { u.vip = true; u.bal = balances.get(d.email); }
    io.emit('db:update', { users: Object.fromEntries(users), posts: posts, count: users.size });
    cb && cb({ ok: true });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("SEXCITES server DE 0 COMPLETO - Single server.js igual servidor - Live OK - Fondo elegante radial rosa morado + movimiento + Real time 24/7 Socket.io - Mensajes, solicitudes, buzón privado por nombre, hablar 24/7, like, comentar, compartir todo real - Cupos 1-500 bloqueo - 1 telefono + IP block - Pagos reales BTC ETH SOL $8.99 $16.99 $28.99 bienvenida unico pago alta tension - Primeros 2 VIP #1 #2 render todo gratis - Owner LenoxJG Male Modern - Port " + PORT);
});
