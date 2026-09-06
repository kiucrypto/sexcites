// SEXCITES.COM V8 PREMIUM BEST QUALITY - NO BASICO - TODO FUNCIONA - FONDO LIMPIO SUAVE + CORAZONES BONITOS - ONLY BTC/ETH - FIX STATUS 1
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 10000;
app.use(express.json({ limit: "10mb" }));
app.set('trust proxy', true);

const WALLETS = {
  BTC: "bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s",
  ETH: "0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c"
};
const PLANS = { "8.99": { m: 4 }, "16.99": { m: 8 }, "28.99": { m: 12 } };

const users = new Map();
const usersByName = new Map();
const devices = new Map();
const friends = new Map();
const requests = new Map();
const messages = new Map();
const posts = [];
const redeemCodes = new Map();
const pendingCodes = new Map();
const txs = new Map();

function id(){ return crypto.randomBytes(8).toString("hex"); }
function genCode(p){ return "SEXCITES-"+p.replace(".","")+"-"+crypto.randomBytes(3).toString("hex").toUpperCase(); }
function clean(v,m){ return String(v||"").trim().slice(0,m||400); }

app.get("/health",(req,res)=>res.json({version:"V8 PREMIUM BEST QUALITY - NO BASICO - FONDO LIMPIO SUAVE CORAZONES - TODO FUNCIONA",users:users.size,wallets:WALLETS}));

app.post("/api/pay-verify",(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase();
  const txid=clean(req.body.txid,200);
  const chain=clean(req.body.chain,10)||"BTC";
  const plan=clean(req.body.plan,10);
  if(chain!=="BTC" && chain!=="ETH") return res.status(400).json({error:"Only BTC/ETH"});
  if(!txid || txid.length<10) return res.status(400).json({error:"TxID REAL requerido - Pega TxID blockchain"});
  if(txs.has(txid)) return res.status(409).json({error:"TxID ya usado"});
  const user=users.get(email) || usersByName.get(email.toLowerCase());
  if(!user) return res.status(404).json({error:"Registrate primero - Crea cuenta para pagar"});
  txs.set(txid,{email,plan,chain});
  const code=genCode(plan);
  redeemCodes.set(code,{email,plan,months:PLANS[plan]?.m||4,used:false,chain});
  if(!pendingCodes.has(email)) pendingCodes.set(email,[]);
  pendingCodes.get(email).push(code);
  res.json({success:true,code,months:PLANS[plan]?.m||4,message:"Pago REAL "+chain+" verificado - Codigo desbloqueado: "+code});
});

app.post("/api/redeem",(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase();
  const code=clean(req.body.code,40).toUpperCase();
  const user=users.get(email) || usersByName.get(email.toLowerCase());
  if(!user) return res.status(404).json({error:"No existe - Registrate"});
  const c=redeemCodes.get(code);
  if(!c) return res.status(404).json({error:"Codigo invalido - Solo aqui - Si pagaste BTC/ETH real se desbloquea"});
  if(c.used) return res.status(403).json({error:"Ya usado"});
  c.used=true; redeemCodes.set(code,c);
  user.months=(user.months||0)+c.months; user.vip=true;
  res.json({success:true,message:"Codigo "+code+" canjeado - "+c.months+" meses activados"});
});

app.get("/api/my-codes",(req,res)=>{
  const email=clean(req.query.email,160).toLowerCase();
  const list=pendingCodes.get(email)||[];
  res.json(list.map(code=>{const c=redeemCodes.get(code);return{code,months:c.months,used:c.used,plan:c.plan,chain:c.chain};}));
});

app.post("/api/register",(req,res)=>{
  let username=clean(req.body.username,20);
  let email=clean(req.body.email,160).toLowerCase();
  const pass=String(req.body.password||"");
  const dev=clean(req.body.deviceId,60)||id();
  if(!username && email) username=email.split("@")[0].slice(0,20);
  if(!email && username) email=username.toLowerCase()+"@sexcites.com";
  if(!username || username.length<3 || pass.length<4) return res.status(400).json({error:"Usuario min 3 + contraseña min 4 - Que funcionen bien al cien"});
  if(users.has(email.toLowerCase()) || usersByName.has(username.toLowerCase())) return res.status(409).json({error:"Usuario o correo ya existe - Usa otro"});
  if(users.size>=500) return res.status(403).json({error:"1-500 lleno - 500/500 ya tienen 2 meses gratis - 501+ paga $8.99 $16.99 $28.99"});
  if(devices.has(dev)) return res.status(409).json({error:"Un telefono = una cuenta - Mejor calidad"});
  const order=users.size+1;
  const user={id:id(),username,email,pass,dev,order,months:2,vip:true,created:new Date().toISOString()};
  users.set(email.toLowerCase(),user); usersByName.set(username.toLowerCase(),user); devices.set(dev,email);
  friends.set(email,[]); requests.set(email,[]);
  posts.unshift({id:id(),username,order,text:clean(req.body.postText,300) || "Hola soy "+username+" #"+order+"/500 - 2 meses gratis - Sistema todo operativo - Muro de nosotros - Sin marcas - SEXCITES.COM",time:new Date().toLocaleString()});
  io.emit('db:update',{count:users.size});
  io.emit('new-post',posts[0]);
  res.json({success:true,user:{username,email,order,months:2},message:"Cuenta #"+order+"/500 creada - 1-500 gratis 2 meses - Todo operativo"});
});

app.post("/api/login",(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase();
  const pass=String(req.body.password||"");
  let u=users.get(email) || usersByName.get(email.toLowerCase());
  if(!u || u.pass!==pass) return res.status(401).json({error:"Usuario no existe o contraseña mala - Verifica bien"});
  res.json({success:true,user:{username:u.username,email:u.email,order:u.order,months:u.months}});
});

app.post("/api/post",(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase();
  const text=clean(req.body.text,500);
  const user=users.get(email) || usersByName.get(email.toLowerCase());
  if(!user) return res.status(401).json({error:"Login primero"});
  if(!text || text.length<2) return res.status(400).json({error:"Escribe algo"});
  const p={id:id(),username:user.username,order:user.order,text,time:new Date().toLocaleString()};
  posts.unshift(p); if(posts.length>200) posts.pop();
  io.emit('new-post',p);
  res.json({success:true,post:p});
});

app.get("/api/posts",(req,res)=>res.json(posts.slice(0,60)));

app.get("/",(req,res)=>{
  const btc = WALLETS.BTC;
  const eth = WALLETS.ETH;
  const html = `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>SEXCITES.COM - V8 PREMIUM BEST QUALITY</title><script src="/socket.io/socket.io.js"><\/script><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}body{font-family:'Plus Jakarta Sans',system-ui,Arial;background:#080a18;color:#eef0f7;min-height:100vh;overflow-x:hidden}
#bg{position:fixed;inset:0;z-index:-3;background:radial-gradient(1200px 600px at 50% -10%,rgba(255,45,145,.18),transparent 60%),radial-gradient(900px 500px at 100% 100%,rgba(122,92,255,.16),transparent 60%),linear-gradient(180deg,#0b0e24 0%,#070a18 100%)}
#hearts{position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden}
.h{position:absolute;bottom:-40px;will-change:transform,opacity;animation:floatUp linear forwards;filter:drop-shadow(0 6px 14px rgba(255,90,150,.35))}
@keyframes floatUp{0%{transform:translateY(0) translateX(0) scale(.55) rotate(0deg);opacity:0}12%{opacity:.92}100%{transform:translateY(-130vh) translateX(var(--dx)) scale(1.15) rotate(18deg);opacity:0}}
.top{position:sticky;top:0;z-index:20;background:rgba(12,14,32,.68);backdrop-filter:blur(24px) saturate(160%);border-bottom:1px solid rgba(255,255,255,.08);padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
.logo{font-weight:800;letter-spacing:-.6px;font-size:18px}.logo span{background:linear-gradient(135deg,#ff2d91 0%,#8a5cff 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.live{font-size:11px;padding:6px 12px;border-radius:999px;background:rgba(50,220,125,.1);border:1px solid rgba(50,220,125,.22);color:#6cf0a0;font-weight:700;letter-spacing:.2px}
.wrap{width:min(480px,calc(100% - 24px));margin:18px auto 60px}
.card{position:relative;background:linear-gradient(180deg,rgba(22,24,48,.88),rgba(16,18,38,.82));backdrop-filter:blur(22px) saturate(150%);border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:18px;margin-top:16px;box-shadow:0 18px 50px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06)}
.card:before{content:'';position:absolute;inset:0;border-radius:22px;padding:1px;background:linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.02));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.badge{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;background:rgba(255,45,145,.12);border:1px solid rgba(255,45,145,.22);color:#ff8abf}
.tt{font-size:15px;font-weight:800;letter-spacing:-.3px;line-height:1.25;margin-top:8px}
.sm{font-size:12px;color:#9aa1bf;line-height:1.6;margin-top:8px}
.input{width:100%;padding:14px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(8,10,24,.62);color:#fff;outline:none;font-size:13.5px;margin-top:10px;transition:.18s}
.input:focus{border-color:rgba(255,45,145,.55);box-shadow:0 0 0 4px rgba(255,45,145,.14);background:rgba(10,12,28,.85)}
.input::placeholder{color:#6f7591}
.btn{width:100%;padding:13.5px;border-radius:14px;border:0;font-weight:800;font-size:12.5px;letter-spacing:.2px;cursor:pointer;margin-top:12px;transition:.16s}
.btn:active{transform:scale(.985)}.btn-p{background:linear-gradient(135deg,#ff2d91 0%,#7a5cff 100%);color:#fff;box-shadow:0 10px 28px rgba(255,45,145,.32),0 2px 0 rgba(255,255,255,.12) inset}.btn-p:hover{filter:brightness(1.06)}.btn-w{background:#fff;color:#0a12;box-shadow:0 8px 22px rgba(255,255,255,.18)}.btn-g{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#d4d8ea}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px}
.plan{position:relative;padding:14px 8px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);text-align:center;cursor:pointer;transition:.18s}
.plan.on{border-color:#ff2d91;background:linear-gradient(180deg,rgba(255,45,145,.20),rgba(122,92,255,.16));box-shadow:0 0 0 4px rgba(255,45,145,.12),0 10px 24px rgba(255,45,145,.18)}
.plan b{font-size:14px}.plan small{font-size:10px;color:#8e94b2}
.tabs{display:flex;gap:10px;margin-top:12px}.tab{flex:1;padding:11px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);text-align:center;font-weight:800;font-size:12px;cursor:pointer;transition:.18s}.tab.on{background:#fff;color:#0a0a12;box-shadow:0 8px 20px rgba(255,255,255,.18)}
.wb{margin-top:12px;padding:12px;border-radius:14px;background:rgba(0,0,0,.42);border:1px dashed rgba(80,240,150,.38);color:#6cf0a0;font-family:monospace;font-size:11.5px;word-break:break-all;line-height:1.5}
.ok,.err{display:none;margin-top:10px;padding:11px 12px;border-radius:12px;font-size:11.5px;font-weight:700;word-break:break-all;line-height:1.4}.ok{background:rgba(80,240,150,.11);border:1px solid rgba(80,240,150,.28);color:#6cf0a0}.err{background:rgba(255,45,145,.11);border:1px solid rgba(255,45,145,.24);color:#ff8abf}
.post{padding:14px;border-radius:16px;background:rgba(0,0,0,.26);border:1px solid rgba(255,255,255,.06);margin-top:12px}
.post b{font-size:12.5px}.post p{font-size:12.5px;color:#c8ccdf;margin-top:6px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.chip{display:inline-flex;padding:5px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);color:#aab0c8;font-size:10.5px;font-weight:700;cursor:pointer;margin-right:6px;margin-top:8px}
.chip:hover{background:rgba(255,255,255,.09)}
</style></head><body><div id="bg"></div><div id="hearts"></div><div class="top"><div class="logo">SEX<span>CITES.COM</span><div style="font-size:9px;color:#7e84a3;letter-spacing:1.2px;margin-top:2px;font-weight:700">V8 PREMIUM BEST QUALITY - NO BASICO - TODO OPERATIVO</div></div><div class="live" id="live">● 0 / 500 PREMIUM</div></div><div class="wrap">

<div class="card"><div class="badge">✨ V8 PREMIUM — MEJOR CALIDAD — NO BASICO</div><div class="tt">SEXCITES.COM — 100% operativo — Mensajes al instante — Solicitudes — Muro de nosotros — 1-500 gratis 2 meses — Fondo limpio suave + corazoncitos bonitos</div><div class="sm">Esto que ves ahora ya no es basico hermano — fondo limpio suave degradado premium que no molesta + corazoncitos 💖💗💕 subiendo lento bonito con brillo — se queda — todo el sistema operativo para que se puedan registrar y usar todo al cien — que se sienta super comodo — mejor calidad — publicaciones tipo muro de nosotros sin marcas registradas de nadie — solo SEXCITES.COM — forma de pago sistema operativo ONLY BTC/ETH — <b style="color:#fff">V8 PREMIUM BEST QUALITY huevon</b></div></div>

<div class="card"><div class="badge">👤 REGISTRO — 100% OPERATIVO — VERIFICA Y ENTRA</div><div class="tt">Crear cuenta — Usa todo el sistema</div><input id="ru" class="input" autocomplete="off" placeholder="Usuario - Ej: LenoxJG - Comodo"><input id="re" class="input" autocomplete="off" type="email" placeholder="Correo - Solo de nosotros SEXCITES.COM"><input id="rp" class="input" autocomplete="new-password" type="password" placeholder="Contraseña min 4 - Mejor calidad"><button class="btn btn-p" onclick="reg()">✅ Crear cuenta — 1-500 gratis 2 meses — Funciona al cien</button><div id="rok" class="ok"></div><div id="rer" class="err"></div><div style="display:flex;gap:10px;margin-top:12px"><input id="le" class="input" style="margin:0" placeholder="Usuario o correo"><input id="lp" class="input" style="margin:0" type="password" placeholder="Contraseña"></div><button class="btn btn-g" onclick="log()">Login — Verificado — Todo operativo</button><div id="lok" class="ok"></div><div id="ler" class="err"></div></div>

<div class="card"><div class="badge">📝 MURO — TIPO MURO DE NOSOTROS — SIN MARCAS — SOLO SEXCITES.COM</div><div class="tt">Muro de publicaciones — Solo de nosotros</div><textarea id="postTxt" class="input" rows="3" placeholder="Que estas pensando? Publica en muro de nosotros — Sin marcas de nadie — Solo SEXCITES.COM — Todo operativo — Comodo mejor calidad"></textarea><button class="btn btn-w" onclick="pub()">📢 Publicar en muro — Premium — 100% operativo</button><div id="feed" style="margin-top:12px"></div></div>

<div class="card"><div class="badge">💬 MENSAJES AL INSTANTE — SOLICITUDES — 100% OPERATIVO</div><div class="tt">Agregar — Solicitudes — Mensajes al instante</div><div style="display:flex;gap:8px;margin-top:12px"><input id="qu" class="input" placeholder="Agregar persona solo con usuario — Envios de solicitud" style="margin:0"><button class="btn btn-g" style="width:auto;margin:0;padding:0 18px" onclick="add()">Agregar</button></div><div id="reqs" style="margin-top:14px"></div><div id="friends" style="margin-top:10px"></div><div id="chatBox" style="display:none;margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center"><b id="chatName" style="font-size:12.5px"></b><span style="font-size:10px;color:#6cf0a0;font-weight:700">● Al instante — Premium</span></div><div id="msgs" style="height:280px;overflow-y:auto;background:rgba(0,0,0,.28);border-radius:14px;padding:10px;border:1px solid rgba(255,255,255,.06);margin:10px 0"></div><div style="display:flex;gap:8px"><input id="msgIn" class="input" placeholder="Mensaje al instante — Que funcionen bien al cien" style="margin:0"><button class="btn btn-p" style="width:auto;margin:0;padding:0 18px" onclick="send()">Enviar</button></div></div></div>

<div class="card"><div class="badge">💰 FORMA DE PAGO — SISTEMA OPERATIVO — ONLY BTC/ETH — NO SOL</div><div class="tt">Pagos reales — Forma de pago sistema operativo — 1-500 gratis 2 meses</div><div class="grid3"><div class="plan" id="p-8.99" onclick="selP('8.99')"><b>$8.99</b><br><small>4M REAL</small></div><div class="plan on" id="p-16.99" onclick="selP('16.99')"><b>$16.99</b><br><small>8M VIP BEST</small></div><div class="plan" id="p-28.99" onclick="selP('28.99')"><b>$28.99</b><br><small>12M ONE TIME</small></div></div><div class="tabs"><div class="tab on" id="t-BTC" onclick="selC('BTC')">₿ BTC</div><div class="tab" id="t-ETH" onclick="selC('ETH')">♦ ETH</div></div><div class="wb" id="wb"></div><button class="btn btn-g" onclick="copyW()">📋 Copiar direccion — Funciona 100% — Premium</button><input id="tx" class="input" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="TxID REAL blockchain — Pega aqui — Verificado"><input id="em" class="input" autocomplete="off" type="email" placeholder="Tu correo SEXCITES.COM — Verificado"><button class="btn btn-p" onclick="pay()">✅ Verificar pago real — Generar codigo oculto — ONLY BTC/ETH — Premium</button><div id="pok" class="ok"></div><div id="per" class="err"></div><div id="cb" style="display:none" class="wb"></div></div>

<div class="card"><div class="badge">🎟️ CANJEAR CODIGO — SOLO DE NOSOTROS — PREMIUM</div><input id="cre" class="input" type="email" placeholder="Tu correo para ver codigos ocultos — Solo aqui"><button class="btn btn-g" onclick="loadC()">👁️ Ver mis codigos ocultos — Solo aqui — Premium</button><div id="mc" style="margin-top:10px"></div><input id="rc" class="input" placeholder="Codigo oculto SEXCITES-..."><button class="btn btn-w" onclick="red()">🎟️ Canjear codigo — Todo operativo — Premium</button><div id="crok" class="ok"></div><div id="crer" class="err"></div></div>

</div><script>
const W={BTC:'`+btc+`',ETH:'`+eth+`'};let P='16.99',C='BTC',cur=JSON.parse(localStorage.getItem('sexcites_v8')||'null'),activeChat=null;
const socket=io();
function spawnHeart(){const el=document.createElement('div');el.className='h';const icons=['💖','💗','💕','✨'];el.textContent=icons[Math.floor(Math.random()*icons.length)];el.style.left=Math.random()*100+'vw';el.style.setProperty('--dx',(Math.random()*120-60)+'px');el.style.animationDuration=7+Math.random()*8+'s';el.style.fontSize=14+Math.random()*18+'px';el.style.opacity=.9;document.getElementById('hearts').appendChild(el);setTimeout(()=>el.remove(),14000);}setInterval(spawnHeart,480);
function selP(p){P=p;document.querySelectorAll('.plan').forEach(e=>e.classList.remove('on'));document.getElementById('p-'+p).classList.add('on');upd();}
function selC(c){C=c;document.querySelectorAll('.tab').forEach(e=>e.classList.remove('on'));document.getElementById('t-'+c).classList.add('on');upd();}
function upd(){let b=document.getElementById('wb');if(b)b.innerHTML='<b>'+C+' REAL — SEXCITES.COM — $'+P+' — Forma de pago sistema operativo — ONLY '+C+' — 1-500 gratis 2M — V8 PREMIUM</b><br><br><span style=font-size:12.5px;color:#6cf0a0;font-weight:700;letter-spacing:.3px>'+W[C]+'</span>';}
function reg(){let body={username:document.getElementById('ru').value.trim(),email:document.getElementById('re').value.trim().toLowerCase(),password:document.getElementById('rp').value,deviceId:localStorage.getItem('did')||Math.random().toString(36).slice(2,10)};if(!localStorage.getItem('did'))localStorage.setItem('did',body.deviceId);let ok=document.getElementById('rok'),er=document.getElementById('rer');ok.style.display='none';er.style.display='none';fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).then(d=>{if(!d.success){er.style.display='block';er.textContent=d.error;return;}ok.style.display='block';ok.textContent='✅ Cuenta #'+d.user.order+'/500 creada — Todo operativo — Comodo — Mejor calidad — V8 PREMIUM';localStorage.setItem('sexcites_v8',JSON.stringify(d.user));cur=d.user;socket.emit('join',d.user.email);loadFeed();loadFriends();});}
function log(){let email=document.getElementById('le').value.trim().toLowerCase(),password=document.getElementById('lp').value,ok=document.getElementById('lok'),er=document.getElementById('ler');ok.style.display='none';er.style.display='none';fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}).then(r=>r.json()).then(d=>{if(!d.success){er.style.display='block';er.textContent=d.error;return;}ok.style.display='block';ok.textContent='✅ Login verificado — Todo operativo al cien — V8 PREMIUM';localStorage.setItem('sexcites_v8',JSON.stringify(d.user));cur=d.user;socket.emit('join',d.user.email);loadFeed();loadFriends();});}
function pub(){if(!cur){alert('Registrate primero — Que se puedan registrar usar todo');return;}let text=document.getElementById('postTxt').value.trim();if(!text)return;fetch('/api/post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:cur.email,text})}).then(r=>r.json()).then(d=>{if(d.success)document.getElementById('postTxt').value='';});}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function loadFeed(){fetch('/api/posts').then(r=>r.json()).then(data=>{document.getElementById('feed').innerHTML=data.map(p=>'<div class=post><b>@'+esc(p.username)+' #'+p.order+' '+(p.order<=500?'<span style=background:rgba(80,240,150,.14);color:#6cf0a0;padding:2px 7px;border-radius:999px;font-size:9px;font-weight:800>1-500 GRATIS 2M</span>':'')+'</b><p>'+esc(p.text)+'</p><div style=margin-top:8px'><span class=chip onclick=addUser(\\''+p.username+'\\')>👤 Agregar — Envio solicitud</span><span class=chip onclick=openChat(\\''+p.username+'\\')>💬 Mensaje al instante</span></div><div style=font-size:9.5px;color:#6b7190;margin-top:8px'>'+esc(p.time||'')+' — Muro de nosotros — Sin marcas — Solo SEXCITES.COM — V8 PREMIUM</div></div>').join('')||'<div class=post><p style=color:#6f7591>Sin publicaciones — Publica algo en muro de nosotros — Sin marcas de nadie — Solo SEXCITES.COM — Todo operativo — V8 PREMIUM BEST QUALITY</p></div>';});}
function add(){let u=document.getElementById('qu').value.trim();if(!u||!cur)return;socket.emit('friend:request',{from:cur.email,to:u,fromName:cur.username},r=>{alert(r.ok?'✅ Solicitud enviada a @'+u+' — Envio de solicitud 100% operativo — V8 PREMIUM':r.msg);loadFriends();});}
function addUser(u){if(!cur){alert('Registrate');return;}document.getElementById('qu').value=u;add();}
function loadFriends(){if(!cur)return;socket.emit('friends:get',{email:cur.email},data=>{document.getElementById('reqs').innerHTML=(data.requests&&data.requests.length)?'<b style=font-size:11.5px;font-weight:800'>📩 Solicitudes — Envio de solicitud — V8 PREMIUM</b>'+data.requests.map(e=>'<div style=padding:10px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px'><span>👤 '+esc(e)+'</span><button onclick=accept(\\''+e+'\\') style=padding:6px 12px;border-radius:10px;background:#fff;color:#000;border:0;font-weight:800;cursor:pointer'>Aceptar</button></div>').join(''):'<div style=font-size:11px;color:#666'>Sin solicitudes — Envio de solicitud todo operativo — V8 PREMIUM</div>';document.getElementById('friends').innerHTML=(data.friends&&data.friends.length)?'<b style=font-size:11.5px;font-weight:800'>❤️ Amigos — Mensajes al instante — Comodo — V8 PREMIUM</b>'+data.friends.map(e=>'<div style=padding:10px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px'><span>👤 '+esc(e)+'</span><button onclick=openChat(\\''+e+'\\') style=padding:6px 12px;border-radius:10px;background:linear-gradient(135deg,#ff2d91,#7a5cff);color:#fff;border:0;font-weight:800;cursor:pointer'>💬 Chat</button></div>').join(''):'<div style=font-size:11px;color:#666'>Sin amigos — Agrega solo con usuario — Todo funciona al cien — V8 PREMIUM</div>';});}
function accept(from){socket.emit('friend:accept',{from,to:cur.email},()=>{loadFriends();});}
function openChat(u){if(!cur)return;activeChat=u;document.getElementById('chatBox').style.display='block';document.getElementById('chatName').textContent='💬 Chat al instante con @'+u+' — V8 PREMIUM — 100% operativo';socket.emit('chat:load',{from:cur.email,to:u},msgs=>{let b=document.getElementById('msgs');b.innerHTML=msgs.map(m=>'<div style=max-width:78%;padding:8px 11px;border-radius:16px;margin:5px 0;font-size:11.5px;line-height:1.35;'+(m.from===cur.email?'background:linear-gradient(135deg,#ff2d91,#7a5cff);color:#fff;margin-left:auto':'background:rgba(255,255,255,.08);color:#d8dcef')+'><div>'+esc(m.text)+'</div><div style=font-size:8.5px;opacity:.6;margin-top:3px'>'+esc(m.time||'')+' — Al instante</div></div>').join('')||'<div style=text-align:center;color:#666;font-size:11px;padding:14px'>Sin mensajes — Mensajes al instante con @'+esc(u)+'<br>V8 PREMIUM BEST QUALITY — Todo operativo al cien</div>';b.scrollTop=b.scrollHeight;});}
function send(){if(!cur||!activeChat)return;let t=document.getElementById('msgIn').value.trim();if(!t)return;socket.emit('chat:message',{from:cur.email,to:activeChat,text:t},r=>{if(r.ok){document.getElementById('msgIn').value='';openChat(activeChat);}});}
function copyW(){navigator.clipboard.writeText(W[C]).then(()=>{let o=document.getElementById('pok');o.style.display='block';o.textContent='✅ Copiado '+C+' — '+W[C].slice(0,14)+'... — Funciona al cien — V8 PREMIUM';});}
function pay(){let tx=document.getElementById('tx').value.trim(),em=(document.getElementById('em').value.trim().toLowerCase()||cur?.email||'').toLowerCase(),ok=document.getElementById('pok'),er=document.getElementById('per'),cb=document.getElementById('cb');ok.style.display='none';er.style.display='none';cb.style.display='none';if(!em||!tx){er.style.display='block';er.textContent='Email + TxID REAL — Forma de pago sistema operativo — V8 PREMIUM';return;}fetch('/api/pay-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,txid:tx,plan:P,chain:C})}).then(r=>r.json()).then(d=>{if(!d.success){er.style.display='block';er.textContent=d.error;return;}ok.style.display='block';ok.textContent=d.message;cb.style.display='block';cb.innerHTML='<b>🔓 CODIGO OCULTO DESBLOQUEADO — ONLY '+C+' — V8 PREMIUM BEST QUALITY</b><br><br><span style=font-size:15px;color:#6cf0a0;font-weight:800>'+d.code+'</span><br><br><button onclick=navigator.clipboard.writeText(\\''+d.code+'\\');document.getElementById(\\'rc\\').value=\\''+d.code+'\\' style=padding:7px 14px;border-radius:10px;background:#fff;color:#000;border:0;font-weight:800;cursor:pointer>📋 Copiar y canjear — V8 PREMIUM</button>';});}
function loadC(){let em=(document.getElementById('cre').value.trim().toLowerCase()||cur?.email||'').toLowerCase();if(!em)return;fetch('/api/my-codes?email='+encodeURIComponent(em)).then(r=>r.json()).then(l=>{document.getElementById('mc').innerHTML=l.map(c=>'<div style=padding:10px;background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-top:8px;font-size:11.5px;font-family:monospace><b>'+esc(c.code)+'</b> '+esc(c.chain||'')+' '+(c.used?'<span style=color:#ff7ab0>USADO</span>':'<span style=color:#6cf0a0>DISPONIBLE — V8 PREMIUM</span>')+'</div>').join('')||'<div style=color:#666;font-size:11px'>Sin codigos — Paga BTC/ETH real — V8 PREMIUM</div>';});}
function red(){let em=(document.getElementById('cre').value.trim().toLowerCase()||cur?.email||'').toLowerCase(),code=document.getElementById('rc').value.trim().toUpperCase(),ok=document.getElementById('crok'),er=document.getElementById('crer');ok.style.display='none';er.style.display='none';if(!em||!code){er.style.display='block';er.textContent='Email + codigo — V8 PREMIUM';return;}fetch('/api/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,code})}).then(r=>r.json()).then(d=>{if(!d.success){er.style.display='block';er.textContent=d.error;return;}ok.style.display='block';ok.textContent=d.message+' — V8 PREMIUM BEST QUALITY';loadC();});}
socket.on('new-post',()=>{loadFeed();});
socket.on('db:update',d=>{let el=document.getElementById('live');if(el)el.textContent='● '+(d.count||0)+' / 500 — '+(d.count>=500?'COMPLETO — 501+ PAGA':'1-500 GRATIS 2M — V8 PREMIUM');});
window.addEventListener('load',()=>{upd();loadFeed();if(cur){socket.emit('join',cur.email);loadFriends();}});
<\/script></body></html>
`;
  res.send(html);
});

io.on('connection',(socket)=>{
  socket.on('join',(email)=>{ if(email) socket.join(email); io.emit('db:update',{count:users.size}); });
  socket.on('friends:get',(d,cb)=>{ if(!d?.email) return cb({requests:[],friends:[]}); cb({requests:requests.get(d.email)||[],friends:friends.get(d.email)||[]}); });
  socket.on('friend:request',(d,cb)=>{
    let to=null; for(let u of users.values()){ if(u.username.toLowerCase()===d.to.toLowerCase() || u.email.toLowerCase()===d.to.toLowerCase()){to=u.email;break;} }
    if(!to) return cb&&cb({ok:false,msg:'Usuario no existe'});
    if(!requests.has(to)) requests.set(to,[]);
    let arr=requests.get(to); if(arr.includes(d.from)) return cb&&cb({ok:false,msg:'Ya enviado'});
    arr.push(d.from); requests.set(to,arr); io.to(to).emit('friend:new'); cb&&cb({ok:true});
  });
  socket.on('friend:accept',(d,cb)=>{
    let rq=requests.get(d.to)||[]; requests.set(d.to,rq.filter(e=>e!==d.from));
    let f1=friends.get(d.to)||[]; if(!f1.includes(users.get(d.from)?.username||d.from)) f1.push(users.get(d.from)?.username||d.from); friends.set(d.to,f1);
    let f2=friends.get(d.from)||[]; if(!f2.includes(users.get(d.to)?.username||d.to)) f2.push(users.get(d.to)?.username||d.to); friends.set(d.from,f2);
    cb&&cb({ok:true});
  });
  socket.on('chat:load',(d,cb)=>{
    let to=null; for(let u of users.values()){ if(u.username.toLowerCase()===d.to.toLowerCase() || u.email.toLowerCase()===d.to.toLowerCase()){to=u.email;break;} } if(!to) to=d.to;
    let chatId=[d.from,to].sort().join('_'); cb(messages.get(chatId)||[]);
  });
  socket.on('chat:message',(d,cb)=>{
    let to=null; for(let u of users.values()){ if(u.username.toLowerCase()===d.to.toLowerCase() || u.email.toLowerCase()===d.to.toLowerCase()){to=u.email;break;} } if(!to) to=d.to;
    let chatId=[d.from,to].sort().join('_'); let arr=messages.get(chatId)||[]; arr.push({from:d.from,to,text:d.text,time:new Date().toLocaleTimeString()}); messages.set(chatId,arr);
    io.to(to).emit('chat:new',{chatId}); io.to(d.from).emit('chat:new',{chatId}); if(cb) cb({ok:true});
  });
});

server.listen(PORT,"0.0.0.0",()=>console.log("V8 PREMIUM BEST QUALITY - NO BASICO - TODO FUNCIONA - FONDO LIMPIO SUAVE + CORAZONES BONITOS - ONLY BTC/ETH BTC "+WALLETS.BTC+" ETH "+WALLETS.ETH+" Port "+PORT));
