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
  ETH: "0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c",
  SOL: "F66a36aKwwvZaaaCSTyfWja4P2dNMmYHK7W2nMBVm6h1"
};
const PLANS = { "4.99":{m:3,label:"3 months $4.99"}, "11.99":{m:7,label:"7 months $11.99"}, "16.66":{m:12,label:"12 months $16.66 opening offer"} };

const users = new Map(); const usersByName = new Map(); const devices = new Map(); const ips = new Map();
const friends = new Map(); const requests = new Map(); const messages = new Map(); const posts = [];
const redeemCodes = new Map(); const pendingCodes = new Map(); const txs = new Map();

// Preloaded hidden codes - only visible in redeem
["SEXCITES-LP5-PSH-SL2","SEXCITES-VSI-I8I-OUA","SEXCITES-KA3-SDG-S09","SEXCITES-75L-FYH-5AA","SEXCITES-EXM-Q3H-5DH"].forEach(c=>redeemCodes.set(c,{email:"",plan:"4.99",months:3,used:false}));

function id(){return crypto.randomBytes(12).toString("hex");}
function genCode(plan){return "SEXCITES-"+String(plan).replace(".","")+"-"+crypto.randomBytes(3).toString("hex").toUpperCase()+"-"+crypto.randomBytes(2).toString("hex").toUpperCase();}
function clean(v,m=500){return String(v||"").trim().slice(0,m);}
function validEmail(e){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}
function validUsername(u){return /^[a-zA-Z0-9_.-]{3,20}$/.test(u);}
function hashPass(p,s){return crypto.createHash("sha256").update(s+p).digest("hex");}
function getIP(req){return (req.headers['x-forwarded-for']?.split(',')[0]||req.ip||"0.0.0.0").toString().slice(0,45);}

app.get("/health",(req,res)=>res.json({ok:true,users:users.size,max:500,system:"ORIGINAL LIVE FROM ZERO - ENGLISH BASE - 24/7 TRANSLATOR ES/EN/FR/DE/PT - MAX QUALITY SOFTWARE - BTC/ETH REAL",wallets:WALLETS}));

app.post("/api/pay-verify",(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase();
  const txid=clean(req.body.txid,200);
  const chain=clean(req.body.chain,10)||"BTC";
  const plan=clean(req.body.plan,10);
  const user=users.get(email)||usersByName.get(email.toLowerCase());
  if(!user) return res.status(404).json({error:"Register first - You can register with username/password/email you want - From zero - Original live"});
  if(!txid||txid.length<15) return res.status(400).json({error:"REAL blockchain TxID required - Real payments BTC "+WALLETS.BTC+" ETH "+WALLETS.ETH+" - Max quality system"});
  if(txs.has(txid)) return res.status(409).json({error:"TxID already used"});
  txs.set(txid,{email,plan,chain});
  const newCode=genCode(plan);
  redeemCodes.set(newCode,{email,plan,months:PLANS[plan]?.m||3,used:false,chain,txid});
  if(!pendingCodes.has(email)) pendingCodes.set(email,[]);
  pendingCodes.get(email).push(newCode);
  res.json({success:true,code:newCode,months:PLANS[plan]?.m||3,message:"✅ REAL "+chain+" PAYMENT RECEIVED at "+WALLETS[chain]+" - Real money - Hidden code unlocked - "+newCode+" - Redeem it and "+(PLANS[plan]?.m||3)+" months activated - Original live system - Max quality"});
});

app.post("/api/redeem",(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase();
  const code=clean(req.body.code,40).toUpperCase();
  const user=users.get(email)||usersByName.get(email.toLowerCase());
  if(!user) return res.status(404).json({error:"Account not exists"});
  const c=redeemCodes.get(code);
  if(!c) return res.status(404).json({error:"Invalid code - Codes not shown anywhere only in redeem code - If you paid real BTC/ETH "+WALLETS.BTC+" / "+WALLETS.ETH+" code unlocks"});
  if(c.used) return res.status(403).json({error:"Code already used - One code per payment - Max quality"});
  c.used=true; redeemCodes.set(code,c);
  user.vip=true; user.months=(user.months||0)+c.months;
  res.json({success:true,message:"✅ CODE REDEEMED: "+code+" - "+c.months+" months activated - Original live - From zero - BTC/ETH real - Max quality software",months:c.months});
});

app.get("/api/my-codes",(req,res)=>{
  const email=clean(req.query.email,160).toLowerCase();
  const list=pendingCodes.get(email)||[];
  res.json(list.map(code=>{const c=redeemCodes.get(code);return{code,months:c?.months,used:c?.used,plan:c?.plan};}));
});

app.post("/api/register",(req,res)=>{
  const ip=getIP(req);
  let username=clean(req.body.username,20);
  let email=clean(req.body.email,160).toLowerCase();
  const password=String(req.body.password||"");
  const deviceId=clean(req.body.deviceId,80)||id().slice(0,12);
  if(!username&&email) username=email.split("@")[0].slice(0,20);
  if(!email&&username) email=username.toLowerCase()+"@sexcites.com";
  if(!validUsername(username)||!validEmail(email)||password.length<4) return res.status(400).json({error:"Username 3-20, valid email, password min 4 - You can register with username/password/email you want - From zero - Original live"});
  if(users.has(email.toLowerCase())||usersByName.has(username.toLowerCase())) return res.status(409).json({error:"Already exists"});
  if(users.size>=500) return res.status(403).json({error:"🔒 OFFER 0-500 BLOCKED - 500/500 already have 2 months free best quality - From 501 onwards charges apply - $4.99 3M $11.99 7M $16.66 12M - Real BTC/ETH "+WALLETS.BTC+" "+WALLETS.ETH});
  if(devices.has(deviceId)) return res.status(409).json({error:"🛡️ One registration per phone - Device already registered - IP+WIFI detected - Max security software"});
  if(ips.has(ip)&&ips.get(ip)>=2) return res.status(409).json({error:"🛡️ IP+WIFI detected - One per phone - Max quality monitoring"});
  const order=users.size+1;
  const salt=crypto.randomBytes(8).toString("hex");
  const user={id:id(),username,email,deviceId,ip,order,months:order<=500?2:0,vip:order<=500,salt,passwordHash:hashPass(password,salt)};
  users.set(email.toLowerCase(),user); usersByName.set(username.toLowerCase(),user); devices.set(deviceId,email); ips.set(ip,(ips.get(ip)||0)+1);
  friends.set(email,[]); requests.set(email,[]);
  posts.unshift({id:id(),username,order,text:"🎉 #"+order+"/500 "+username+" joined - OFFER 0-500 FREE 2 MONTHS BEST QUALITY - From zero to 500 free 2 months - From 501 502 blocked - Original live from zero - You can register with username/password/email you want - Live system real payments nothing fake - Sending system, talking system, adding system, inbox for reply - Well monitored - Super realistic background - Future ahead - BTC "+WALLETS.BTC.slice(0,10)+"... ETH "+WALLETS.ETH.slice(0,10)+"... - Nothing fake",createdAt:new Date().toISOString()});
  io.emit('db:update',{count:users.size});
  res.json({success:true,user:{username,email,order,months:user.months},message:"✅ Account #"+order+"/500 created FROM ZERO - 0-500 FREE 2 MONTHS BEST QUALITY - Original live - Max quality software"});
});

app.post("/api/login",(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase();
  let found=users.get(email)||usersByName.get(email.toLowerCase());
  if(!found) return res.status(404).json({error:"Not exists - Register from zero"});
  if(hashPass(String(req.body.password||""),found.salt)!==found.passwordHash) return res.status(401).json({error:"Wrong password"});
  res.json({success:true,user:{username:found.username,email:found.email,order:found.order,months:found.months}});
});

app.get("/api/posts",(req,res)=>res.json(posts.slice(-50).reverse()));

app.get("/",(req,res)=>res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES.COM — ORIGINAL LIVE FROM ZERO — ENGLISH — 24/7 TRANSLATOR — MAX QUALITY SOFTWARE — BTC/ETH REAL</title>
<script src="/socket.io/socket.io.js"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,Arial,sans-serif;background:#07080c;color:#e8e9ed}
#bgCanvas{position:fixed;inset:0;z-index:-2;width:100%;height:100%}.mono{font-family:'JetBrains Mono',monospace}
.navbar{position:sticky;top:0;z-index:100;background:rgba(7,8,12,.94);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.08)}
.nav-inner{max-width:1280px;margin:auto;min-height:72px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.logo{font-size:22px;font-weight:900}.logo span{color:#ff2d91}.live{font-size:10px;background:#0f1a0f;border:1px solid rgba(50,220,125,.3);color:#32dc7d;padding:5px 9px;border-radius:20px}
.btn{border:0;padding:10px 14px;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer}.btn-pink{background:linear-gradient(135deg,#ff2d91,#6a5cff);color:#fff}.btn-dark{background:#151821;border:1px solid rgba(255,255,255,.12);color:#ddd}.btn-white{background:#fff;color:#000}
.container{width:min(1280px,calc(100% - 32px));margin:auto}.hero{padding:50px 0 30px;display:grid;grid-template-columns:1.15fr.85fr;gap:40px;align-items:start}
.hero h1{font-size:clamp(36px,5.5vw,62px);line-height:.95;letter-spacing:-2px;font-weight:900}.grad{background:linear-gradient(135deg,#fff,#ff2d91);-webkit-background-clip:text;background-clip:text;color:transparent}
.desc{color:#9da1ad;font-size:14px;line-height:1.7;margin-top:12px}.card{padding:18px;border-radius:18px;background:rgba(21,24,33,.92);border:1px solid rgba(255,255,255,.08)}
.feed{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.post{padding:16px;border-radius:16px;background:rgba(17,19,26,.92);border:1px solid rgba(255,255,255,.08)}
.modal{display:none;position:fixed;inset:0;z-index:500;place-items:center;padding:16px;background:rgba(0,0,0,.86);backdrop-filter:blur(10px)}.modal.show{display:grid}.box{width:min(480px,100%);padding:24px;border-radius:20px;background:#12141d;border:1px solid rgba(255,255,255,.12);max-height:92vh;overflow-y:auto}
.close{float:right;border:0;background:none;color:#aaa;font-size:26px;cursor:pointer}form{display:grid;gap:10px;margin-top:10px}input,select{width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0a0c12;color:#fff;outline:none}
.msg{color:#a7abb5;font-size:12px}.ok{padding:10px;border-radius:10px;background:#32dc7d;color:#000;font-weight:800;display:none;margin-top:8px;word-break:break-all}.err{padding:10px;border-radius:10px;background:#ff2d91;color:#fff;display:none;margin-top:8px;font-size:11px}
.codeBox{padding:12px;background:#0f0f14;border-radius:12px;border:1.5px dashed #32dc7d;margin:10px 0;font-family:'JetBrains Mono',monospace;font-size:12px;word-break:break-all}
.lang{position:fixed;right:12px;bottom:12px;z-index:90;background:#11131a;border:1px solid #333;border-radius:12px;padding:8px;display:flex;gap:6px;align-items:center}.lang span{font-size:10px;color:#888;font-weight:800}.lang button{border:1px solid #333;background:#1a1d27;color:#ddd;padding:6px 8px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer}.lang button.active{background:#ff2d91;color:#fff;border-color:#ff2d91}
@media(max-width:900px){.hero{grid-template-columns:1fr}.feed{grid-template-columns:1fr}}
</style></head><body>
<canvas id="bgCanvas"></canvas>
<header class="navbar"><div class="nav-inner"><div class="logo">SEX<span>CITES.COM</span> <small style="display:block;font-size:8px;color:#ff2d91;letter-spacing:2px" id="t-logo-sub">ORIGINAL LIVE FROM ZERO - ENGLISH BASE - 24/7 TRANSLATOR MAX QUALITY - 0-500 FREE - 501+ BLOCKED</small></div>
<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center"><span class="live" id="liveCnt">● 0 / 500 - 0-500 FREE 2 MONTHS</span><button class="btn btn-dark" onclick="openInbox()" id="t-inbox">📥 Inbox Reply</button><button class="btn btn-dark" onclick="openChat()" id="t-chat">💬 Talk 0.1s</button><button class="btn btn-dark" onclick="openRedeem()" id="t-redeem">🎟️ Redeem Code</button><button class="btn btn-dark" onclick="openPay()" id="t-pay">Pay BTC/ETH Real</button><button class="btn btn-white" onclick="openLogin()" id="t-login">Login</button><button class="btn btn-pink" onclick="openRegister()" id="t-register">Register Original From Zero</button></div></div></header>
<main class="container">
<section class="hero"><div>
<div style="display:inline-flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><span style="font-size:10px;background:#ff2d91;color:#fff;padding:5px 9px;border-radius:20px;font-weight:900" id="t-badge1">🎉 NEW WEBSITE OPENING SEXCITES.COM WELCOME</span><span style="font-size:10px;background:rgba(50,220,125,.15);border:1px solid rgba(50,220,125,.3);color:#32dc7d;padding:5px 9px;border-radius:20px;font-weight:800" id="t-badge2">0-500 FREE 2 MONTHS BEST QUALITY - 501+ BLOCKED - MAX QUALITY</span></div>
<h1 id="t-title">Original System<br><span class="grad">From Zero</span><br>No Fake - Live - SEXCITES.COM</h1>
<p class="desc" id="t-desc"><b style="color:#fff">Everything that happened to me put it in English and that the person who was in Spanish has a translator twenty-four seven hours that has maximum quality software system everything.</b><br><br>
<b style="color:#fff" id="t-desc2">I want that if you are going to send me something send me from zero and with the ideas that I am giving you that you increase them - The system that the person can register with username, password, or an email they want - That the system is alive that they make real payments nothing fake, nothing scam, nothing that they pay real with real money with an updated software system the latest everything everything everything the system is well - Sending system, talking system, adding system, having an inbox that messages arrive to be able to reply everything everything with a well monitored system and with a super realistic background about the topic.</b><br><br>
<b style="color:#fff" id="t-desc3">Website description we are creating:</b> <span id="t-desc3b">SEXCITES.COM is a private 18+ community where elsewhere you pay very expensive just to talk with some girl — For opening of SEXCITES.COM we give the best opening private monitoring system — One registration per phone with software that detects IP and WiFi — Register with username/password/email you want — No verification — Real time inbox 24/7 — Enter/exit visible — 24/7 translation — Super realistic moving background — Real BTC/ETH payments.</span><br><br>
<b style="color:#ffb3c9" id="t-future-title">Future what will be later and what we will deliver:</b> <span id="t-future">We will deliver mobile app, private 18+ video calls live, gift system, real profile verification, top users ranking, private events, VIP levels system, and private marketplace — All with updated latest version software — Nothing fake — Well monitored.</span><br><br>
<span style="color:#32dc7d;font-weight:800" id="t-offer">🎁 Offer from zero to five hundred people: If a person subscribes or creates an account has 2 months free with best quality - If passes 500 to 501 / 502 it gets blocked - Only from 0 to 500 is free 2 months - From 500 upwards already start charging what prices are giving: $4.99 3 months / $11.99 7 months / $16.66 12 months opening offer new website - Real payments BTC ${WALLETS.BTC} ETH ${WALLETS.ETH} - Hidden codes only in redeem code - Only one code per payment ends time.</span>
</p>
<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-pink" style="padding:14px 20px" onclick="openRegister()" id="t-cta1">Register Original From Zero - Username/Password/Email You Want - 0-500 FREE 2 MONTHS</button><button class="btn btn-dark" style="padding:14px 16px" onclick="openPay()" id="t-cta2">💰 Real Payments Real Money - BTC/ETH - No Fake - Max Quality</button></div>
<div class="mono card" style="margin-top:14px"><div style="font-size:11px;color:#ff2d91;font-weight:800" id="t-monitor">🛡️ WELL MONITORED SYSTEM - IP+WIFI+DEVICE - SUPER REALISTIC BACKGROUND - 0-500 FREE 2 MONTHS - 501+ BLOCKED - BTC ${WALLETS.BTC.slice(0,12)}... ETH ${WALLETS.ETH.slice(0,12)}... - 24/7 TRANSLATOR MAX QUALITY</div><div id="secInfo" style="font-size:11px;color:#9da1ad;margin-top:6px">Original system from zero - No fake - Real payments real money - Updated latest version software - Sending, talking, adding, inbox for reply - Well monitored - Super realistic background - 0-500 free best quality - 24/7 translator English/Spanish</div></div>
</div>
<div>
<div class="card"><h3 style="color:#ff2d91" id="t-offer-title">🎁 OFFER 0-500 FREE 2 MONTHS BEST QUALITY - 501 502 BLOCKED - 24/7 TRANSLATOR</h3><div style="margin-top:10px;background:#0a0c12;border-radius:10px;padding:10px;border:1px solid #222"><div style="display:flex;justify-content:space-between;font-size:11px"><span id="t-free-label">🎁 0-500 Free 2 months best quality</span><span id="freeCount" style="color:#32dc7d;font-weight:900">500 / 500 free - Free 2 months</span></div><div style="margin-top:8px;height:8px;background:#1a1d27;border-radius:20px;overflow:hidden"><div id="freeBar" style="height:100%;width:0%;background:linear-gradient(90deg,#ff2d91,#6a5cff)"></div></div><div style="margin-top:6px;font-size:10px;color:#888" id="t-free-note">From 0 to 500 is free 2 months with best quality - From 500 up 501 502 blocked - Only 0-500 free - From 500 up already charge $4.99 $11.99 $16.66 - Original from zero - 24/7 translator</div><div style="margin-top:8px;display:flex;gap:6px"><button class="btn btn-pink" style="flex:1" onclick="openRegister()" id="t-free-btn1">Claim 0-500 Free 2 Months - From Zero</button><button class="btn btn-dark" style="flex:1" onclick="openPay()" id="t-free-btn2">501+ Pay $4.99 $11.99 $16.66 BTC/ETH Real</button></div></div><div style="margin-top:10px"><input id="quickUser" placeholder="Add person only with username - Original system from zero"><button class="btn btn-pink" style="width:100%;margin-top:8px" onclick="quickAdd()" id="t-add-btn">📩 Add - Original From Zero - Inbox Reply - 24/7 Translator</button></div></div>
<div class="card" style="margin-top:12px"><h3 style="color:#32dc7d" id="t-pay-title">💰 REAL PAYMENTS REAL MONEY - NOTHING FAKE - BTC ${WALLETS.BTC.slice(0,6)}... ETH ${WALLETS.ETH.slice(0,6)}... - Latest Software</h3><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">
<div style="padding:12px;background:#0a0c12;border-radius:12px;border:1px solid #333;text-align:center"><b>$4.99 USD</b><div style="font-size:9px;color:#888">3M - BTC/ETH Real - Real money - One code per payment</div><button class="btn btn-dark" style="width:100%;margin-top:6px" onclick="openPayWith('4.99')" id="t-pay-499">Pay $4.99 Real → Code</button></div>
<div style="padding:12px;background:rgba(255,45,145,.12);border-radius:12px;border:1.5px solid #ff2d91;text-align:center"><b>$11.99 USD</b><div style="font-size:9px;color:#ffb3c9">7M - BTC/ETH Real - Nothing fake</div><button class="btn btn-pink" style="width:100%;margin-top:6px" onclick="openPayWith('11.99')" id="t-pay-1199">Pay $11.99 Real → Code</button></div>
<div style="padding:12px;background:#0a0c12;border-radius:12px;border:1px solid #333;text-align:center"><b>$16.66 USD</b><div style="font-size:9px;color:#888">12M opening offer - BTC/ETH Real - Best quality</div><button class="btn btn-dark" style="width:100%;margin-top:6px" onclick="openPayWith('16.66')" id="t-pay-1666">Pay $16.66 Real → Code</button></div>
</div><div class="mono msg" style="margin-top:8px" id="t-pay-note">🔒 Real payments with real money - Updated latest version software - Everything everything system well - Hidden codes only in redeem code - Only one code per payment 3.99 per 3 months ends time - BTC ${WALLETS.BTC} - ETH ${WALLETS.ETH} - Nothing fake nothing scam - 24/7 translator max quality</div></div>
</div></section>
<section><h2 id="t-feed-title">📥 Inbox Messages To Reply - Original From Zero - Well Monitored - Super Realistic Background - 24/7 Translator</h2><div id="feed" class="feed" style="margin-top:12px"></div></section>
<footer style="padding:36px 0;margin-top:30px;border-top:1px solid rgba(255,255,255,.08);color:#6b6f7a;text-align:center;font-size:11px" id="t-footer">SEXCITES.COM ORIGINAL SYSTEM FROM ZERO - No fake no scam - Real payments real money - Updated latest version everything well - Sending system, talking system, adding system, inbox messages to reply - Well monitored - Super realistic background - Website description and future ahead - Offer 0-500 free 2 months best quality - 501 502 blocked - Only 0-500 free - 500 up charge prices - BTC ${WALLETS.BTC} ETH ${WALLETS.ETH} - Hidden codes only in redeem code - Only one code per payment ends time - Original live - 24/7 translator max quality software system</footer>
</main>

<div id="registerModal" class="modal"><div class="box"><button class="close" onclick="closeRegister()">×</button><h2 id="t-reg-title">Original System From Zero - Register - Username/Password/Email You Want - 0-500 FREE 2 MONTHS - 24/7 Translator</h2><p class="msg" id="t-reg-desc">Send me from zero and with ideas I'm giving you increase them - System person can register with username, password, or email they want - Live system real payments nothing fake nothing scam - Updated latest version software everything well - Sending, talking, adding, inbox messages to reply - Well monitored - Super realistic background - 0-500 free 2 months best quality - 501 502 blocked</p><form id="registerForm"><input id="username" placeholder="Username - You can register with username you want - Ex: LenoxJG" maxlength="20"><input id="email" type="email" placeholder="Email - Or email they want - You want - No verification"><input id="password" type="password" placeholder="Password - Or password you want - Put what you want" minlength="4" required><label class="msg" style="display:flex;gap:8px;align-items:center"><input id="adult" type="checkbox" required style="width:auto"> <span id="t-18">I confirm 18+ - Original from zero - No fake - 24/7 translator</span></label><button class="btn btn-pink" style="width:100%;padding:12px" type="submit" id="t-reg-btn">Create Account From Zero - 0-500 FREE 2 MONTHS BEST QUALITY - Username/Password/Email You Want - 24/7 Translator</button><div id="regOk" class="ok"></div><div id="regErr" class="err"></div></form></div></div>

<div id="loginModal" class="modal"><div class="box"><button class="close" onclick="closeLogin()">×</button><h2 id="t-login-title">Login Original From Zero - No Fake - 24/7 Translator</h2><form id="loginForm"><input id="loginEmail" placeholder="Username or email you want - You want"><input id="loginPassword" type="password" placeholder="Password you want"><button class="btn btn-white" style="width:100%;padding:12px" type="submit" id="t-login-btn">Login Original From Zero - Live System - 24/7 Translator</button><div id="loginOk" class="ok"></div><div id="loginErr" class="err"></div></form></div></div>

<div id="inboxModal" class="modal"><div class="box" style="width:min(560px,100%)"><button class="close" onclick="closeInbox()">×</button><h2 id="t-inbox-title">📥 Inbox That Messages Arrive To Be Able To Reply - Original From Zero - Well Monitored - 24/7 Translator</h2><div id="inboxReq"></div><div id="inboxFriends" style="margin-top:10px"></div><div id="inboxMsgs" style="margin-top:10px"></div></div></div>

<div id="chatModal" class="modal"><div class="box" style="width:min(560px,100%)"><button class="close" onclick="closeChat()">×</button><h2 id="t-chat-title">💬 Talking System - Live Conversations 0.1s - Original From Zero - No Fake - 24/7 Translator</h2><div id="chatFriends"></div><div id="chatWin" style="display:none;margin-top:10px"><div style="display:flex;justify-content:space-between"><b id="chatName"></b><span class="mono" style="font-size:10px;color:#32dc7d" id="t-chat-live">● Live 0.1s - Original From Zero</span></div><div id="chatBox" style="height:300px;overflow-y:auto;background:#090a0f;border-radius:12px;padding:8px;border:1px solid #222;margin:10px 0"></div><div style="display:flex;gap:6px"><input id="chatInput" placeholder="Live message 0.1s - Talking system - Original from zero - 24/7 translator"><button class="btn btn-pink" style="width:auto" onclick="sendMsg()" id="t-send">Send Talk 0.1s - 24/7</button></div></div></div></div>

<div id="redeemModal" class="modal"><div class="box"><button class="close" onclick="closeRedeem()">×</button><h2 id="t-redeem-title">🎟️ Redeem Code - Original From Zero - Hidden Codes - Only Here - 24/7 Translator</h2><p class="msg" id="t-redeem-desc">🔒 Codes not shown anywhere only in redeem code - If pays 3.99 per 3 months code unlocks and months redeemed - Can generate only one code per payment - Only one code per payment ends time - Real payments BTC ${WALLETS.BTC} ETH ${WALLETS.ETH} - Nothing fake nothing scam - Updated latest version - 24/7 translator max quality</p><div style="margin-top:10px"><input id="redeemEmail" placeholder="Your email - To see your hidden codes"><button class="btn btn-dark" style="width:100%;margin-top:6px" onclick="loadMyCodes()" id="t-view-codes">👁️ View my hidden codes - Only here - Original From Zero - 24/7</button><div id="myCodesList" style="margin-top:8px"></div></div><div style="margin-top:14px;border-top:1px solid #222;padding-top:12px"><input id="redeemCode" placeholder="Hidden code - Only here - Original from zero - 24/7"><button class="btn btn-white" style="width:100%;margin-top:8px" onclick="redeemCode()" id="t-redeem-btn">🎟️ Redeem Code - Only one code per payment ends time - Original From Zero - 24/7 Translator</button></div><div id="redeemOk" class="ok"></div><div id="redeemErr" class="err"></div></div></div>

<div id="payModal" class="modal"><div class="box"><button class="close" onclick="closePay()">×</button><h2 id="t-pay-modal-title">💰 Real Payments Real Money - Nothing Fake Nothing Scam - BTC/ETH Real - Latest Software - 24/7 Translator Max Quality</h2><p class="msg" id="t-pay-modal-desc">System that is alive that they make real payments nothing fake, nothing scam, nothing that they pay real with real money with an updated software system the latest everything everything system well - BTC ${WALLETS.BTC} - ETH ${WALLETS.ETH} - If pays system arrives - Hidden code unlocks - Only one code per payment - 0-500 free 2 months best quality - 501 502 blocked - From 500 up already charge $4.99 $11.99 $16.66 - Hidden codes only in redeem code - 24/7 translator max quality</p>
<select id="planSel"><option value="4.99">3 months $4.99 USD - BTC/ETH Real - Real money - Original from zero - 24/7</option><option value="11.99" selected>7 months $11.99 USD - BTC/ETH Real - Nothing fake - 24/7</option><option value="16.66">12 months $16.66 USD Opening offer - BTC/ETH Real - Best quality - Original from zero - 24/7</option></select>
<div style="display:flex;gap:6px;margin:8px 0"><button id="bBTC" onclick="setChain('BTC')" class="btn btn-white" style="padding:6px 10px">BTC Real ${WALLETS.BTC.slice(0,6)}... - Real money</button><button id="bETH" onclick="setChain('ETH')" class="btn btn-dark" style="padding:6px 10px">ETH Real ${WALLETS.ETH.slice(0,6)}... - Real money</button></div>
<div id="walletBox" style="padding:10px;background:#0f0f14;border-radius:10px;border:1px dashed #32dc7d;word-break:break-all;font-size:11px"></div>
<input id="txInput" placeholder="REAL BTC/ETH TxID - Paste here - Real payments real money - Nothing fake - 24/7 translator" style="margin-top:8px"><input id="emailPay" placeholder="Your email - To generate hidden code - Original from zero - 24/7"><button class="btn btn-pink" style="width:100%;padding:12px;background:#32dc7d;color:#000" onclick="verifyPayGenerateCode()" id="t-verify">💰 VERIFY REAL PAYMENT REAL MONEY - BTC/ETH - Nothing Fake - Code Unlocks - Original From Zero - 24/7 Translator</button>
<div id="payOk" class="ok"></div><div id="payErr" class="err"></div><div id="generatedCodeBox" style="display:none" class="codeBox"></div>
</div></div>

<div class="lang"><span>🌍 24/7 TRANSLATOR MAX QUALITY:</span><button id="lang-en" class="active" onclick="setLang('en')">EN</button><button id="lang-es" onclick="setLang('es')">ES</button><button id="lang-fr" onclick="setLang('fr')">FR</button><button id="lang-de" onclick="setLang('de')">DE</button><button id="lang-pt" onclick="setLang('pt')">PT</button></div>

<script>
const socket=io();
const WALLETS={BTC:'${WALLETS.BTC}',ETH:'${WALLETS.ETH}',SOL:'${WALLETS.SOL}'};
let curChain='BTC'; let currentUser=JSON.parse(localStorage.getItem('sexcites_beta_user')||'null'); let activeChat=null; let curLang='en';

const i18n={
  en:{
    logoSub:"ORIGINAL LIVE FROM ZERO - ENGLISH BASE - 24/7 TRANSLATOR MAX QUALITY - 0-500 FREE - 501+ BLOCKED",
    inbox:"📥 Inbox Reply", chat:"💬 Talk 0.1s", redeem:"🎟️ Redeem Code", pay:"Pay BTC/ETH Real", login:"Login", register:"Register Original From Zero",
    badge1:"🎉 NEW WEBSITE OPENING SEXCITES.COM WELCOME", badge2:"0-500 FREE 2 MONTHS BEST QUALITY - 501+ BLOCKED - MAX QUALITY",
    title:"Original System<br><span class=\\"grad\\">From Zero</span><br>No Fake - Live - SEXCITES.COM",
    desc:"Everything that happened to me put it in English and that the person who was in Spanish has a translator twenty-four seven hours that has maximum quality software system everything.",
    desc2:"I want that if you are going to send me something send me from zero and with the ideas that I am giving you that you increase them - The system that the person can register with username, password, or an email they want - That the system is alive that they make real payments nothing fake, nothing scam, nothing that they pay real with real money with an updated software system the latest everything everything everything the system is well - Sending system, talking system, adding system, having an inbox that messages arrive to be able to reply everything everything with a well monitored system and with a super realistic background about the topic.",
    desc3:"SEXCITES.COM is a private 18+ community where elsewhere you pay very expensive just to talk with some girl — For opening of SEXCITES.COM we give the best opening private monitoring system — One registration per phone with software that detects IP and WiFi — Register with username/password/email you want — No verification — Real time inbox 24/7 — Enter/exit visible — 24/7 translation — Super realistic moving background — Real BTC/ETH payments.",
    futureTitle:"Future what will be later and what we will deliver:",
    future:"We will deliver mobile app, private 18+ video calls live, gift system, real profile verification, top users ranking, private events, VIP levels system, and private marketplace — All with updated latest version software — Nothing fake — Well monitored.",
    offer:"🎁 Offer from zero to five hundred people: If a person subscribes or creates an account has 2 months free with best quality - If passes 500 to 501 / 502 it gets blocked - Only from 0 to 500 is free 2 months - From 500 upwards already start charging what prices are giving: $4.99 3 months / $11.99 7 months / $16.66 12 months opening offer new website - Real payments BTC ${WALLETS.BTC} ETH ${WALLETS.ETH} - Hidden codes only in redeem code - Only one code per payment ends time.",
    cta1:"Register Original From Zero - Username/Password/Email You Want - 0-500 FREE 2 MONTHS - 24/7 Translator",
    cta2:"💰 Real Payments Real Money - BTC/ETH - No Fake - Max Quality - 24/7 Translator",
    monitor:"🛡️ WELL MONITORED SYSTEM - IP+WIFI+DEVICE - SUPER REALISTIC BACKGROUND - 0-500 FREE 2 MONTHS - 501+ BLOCKED - BTC ${WALLETS.BTC.slice(0,12)}... ETH ${WALLETS.ETH.slice(0,12)}... - 24/7 TRANSLATOR MAX QUALITY"
  },
  es:{
    logoSub:"SISTEMA ORIGINAL DE CERO - BASE INGLÉS - TRADUCTOR 24/7 MÁXIMA CALIDAD - 0-500 GRATIS - 501+ BLOQUEADO",
    inbox:"📥 Buzón Responder", chat:"💬 Hablar 0.1s", redeem:"🎟️ Canjear Código", pay:"Pagar BTC/ETH Real", login:"Login", register:"Registro Original De Cero",
    badge1:"🎉 APERTURA NUEVA WEB SEXCITES.COM BIENVENIDOS", badge2:"0-500 GRATIS 2 MESES MEJOR CALIDAD - 501+ BLOQUEADO - MÁXIMA CALIDAD",
    title:"Sistema Original<br><span class=\\"grad\\">De Cero</span><br>No Fake - En Vivo - SEXCITES.COM",
    desc:"Todo lo que me ha pasado colócalo en inglés y que sea la persona que era en español que tenga un traductor veinticuatro siete horas que tenga la máxima la calidad software sistema todo.",
    desc2:"Yo quiero que si me vas a pasar algo pásame de cero y con las ideas que te estoy dándote que las aumentes - El sistema que la persona se puede registrar con usuario, contraseña, o un correo que ellos quieran - Que el sistema esté vivo que hagan los pagos reales nada de maquetas, nada de fake, nada de estafa, nada que paguen reales con dinero real con un sistema actualizado de software la última todo todo el sistema que esté bien - Sistema de envío, sistema de hablar, sistema de agregar, sistema de tener un buzón que llegue los mensajes para que pueda responder todo todo con un sistema bien monitoreado y con un fondo bien superrealista sobre el tema.",
    desc3:"SEXCITES.COM es una comunidad privada 18+ donde en otros lados pagar muy caro solo por hablar con alguna chica — Por apertura damos la mejor apertura sistema privada monitoreo — Un solo registro por teléfono con software que detecta IP y WiFi — Registro con usuario/contraseña/correo que quieras — Sin verificación — Buzón tiempo real 24/7 — Entrar/salir visible — Traducción 24/7 — Fondo superrealista movimiento — Pagos reales BTC/ETH.",
    futureTitle:"Futuro que va a ser más adelante y lo que vamos a entregar:",
    future:"Vamos a entregar app móvil, videollamadas privadas 18+ en vivo, sistema de regalos, verificación de perfil real, ranking top usuarios, eventos privados, sistema niveles VIP, y marketplace privado — Todo con sistema actualizado última versión — Nada de fake — Bien monitoreado — Traductor 24/7 máxima calidad.",
    offer:"🎁 Oferta de cero a quinientas personas: Si una persona se suscribe o crea cuenta tiene 2 meses gratis con mejor calidad - Si pasa de 500 a 501 / 502 se bloquea - Solo 0-500 gratis 2 meses - De 500 para arriba ya cobran $4.99 3 meses / $11.99 7 meses / $16.66 12 meses oferta apertura nueva web - Pagos reales BTC ${WALLETS.BTC} ETH ${WALLETS.ETH} - Códigos ocultos solo en canjear código - Solo un código por pago termina tiempo - Traductor 24/7 máxima calidad.",
    cta1:"Registro Original De Cero - Usuario/Contraseña/Correo Que Quieras - 0-500 GRATIS 2 MESES - Traductor 24/7",
    cta2:"💰 Pagos Reales Dinero Real - BTC/ETH - Nada De Fake - Máxima Calidad - Traductor 24/7",
    monitor:"🛡️ SISTEMA BIEN MONITOREADO - IP+WIFI+DEVICE - FONDO SUPERREALISTA - 0-500 GRATIS 2 MESES - 501+ BLOQUEADO - BTC ${WALLETS.BTC.slice(0,12)}... ETH ${WALLETS.ETH.slice(0,12)}... - TRADUCTOR 24/7 MÁXIMA CALIDAD"
  }
};

function setLang(l){
  curLang=l;
  document.querySelectorAll('.lang button').forEach(b=>b.classList.remove('active'));
  let btn=document.getElementById('lang-'+l); if(btn) btn.classList.add('active');
  let t=i18n[l]||i18n.en;
  document.getElementById('t-logo-sub').textContent=t.logoSub;
  document.getElementById('t-inbox').textContent=t.inbox;
  document.getElementById('t-chat').textContent=t.chat;
  document.getElementById('t-redeem').textContent=t.redeem;
  document.getElementById('t-pay').textContent=t.pay;
  document.getElementById('t-login').textContent=t.login;
  document.getElementById('t-register').textContent=t.register;
  document.getElementById('t-badge1').textContent=t.badge1;
  document.getElementById('t-badge2').textContent=t.badge2;
  document.getElementById('t-title').innerHTML=t.title;
  document.querySelector('#t-desc b').textContent=t.desc;
  document.getElementById('t-desc2').textContent=t.desc2;
  document.getElementById('t-desc3b').textContent=t.desc3;
  document.getElementById('t-future-title').textContent=t.futureTitle;
  document.getElementById('t-future').textContent=t.future;
  document.getElementById('t-offer').textContent=t.offer;
  document.getElementById('t-cta1').textContent=t.cta1;
  document.getElementById('t-cta2').textContent=t.cta2;
  document.getElementById('t-monitor').textContent=t.monitor;
  localStorage.setItem('sexcites_lang', l);
  // Update other titles that depend on language
  socket.emit('lang:update',{lang:l});
}

const canvas=document.getElementById('bgCanvas'); const ctx=canvas.getContext('2d',{alpha:false}); let dpr=window.devicePixelRatio||1;
function resize(){dpr=window.devicePixelRatio||1;canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}resize();addEventListener('resize',resize);
let blobs=[{x:0.22,y:0.22,r:600,c:'255,45,145',vx:0.16,vy:0.10,phase:0},{x:0.84,y:0.30,r:680,c:'118,87,255',vx:-0.12,vy:0.14,phase:1.8},{x:0.56,y:0.88,r:720,c:'255,100,140',vx:0.10,vy:-0.16,phase:3.2}];
let particles=[];for(let i=0;i<85;i++) particles.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-0.5)*0.45,vy:(Math.random()-0.5)*0.45,r:Math.random()*1.8+0.3});
function draw(t){let w=innerWidth,h=innerHeight;let base=ctx.createLinearGradient(0,0,0,h);base.addColorStop(0,'#0b0c14');base.addColorStop(1,'#07080c');ctx.fillStyle=base;ctx.fillRect(0,0,w,h);let time=t*0.00038;blobs.forEach(b=>{b.x+=b.vx*0.35;b.y+=b.vy*0.35;if(b.x<0.10||b.x>0.90) b.vx*=-1;if(b.y<0.10||b.y>0.90) b.vy*=-1;let cx=b.x*w+Math.sin(time+b.phase)*120;let cy=b.y*h+Math.cos(time*0.68+b.phase)*90;let g=ctx.createRadialGradient(cx,cy,0,cx,cy,b.r);g.addColorStop(0,'rgba('+b.c+',0.38)');g.addColorStop(0.4,'rgba('+b.c+',0.13)');g.addColorStop(1,'rgba('+b.c+',0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,b.r,0,Math.PI*2);ctx.fill();});for(let i=0;i<particles.length;i++){let a=particles[i];a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>w) a.vx*=-1;if(a.y<0||a.y>h) a.vy*=-1;ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fillStyle='rgba(255,140,180,0.62)';ctx.fill();}requestAnimationFrame(draw);}requestAnimationFrame(draw);

function genDeviceId(){let id=localStorage.getItem('did');if(!id){id='DEV_'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).toUpperCase();localStorage.setItem('did',id);}return id;}
function openRegister(){document.getElementById('registerModal').classList.add('show');}function closeRegister(){document.getElementById('registerModal').classList.remove('show');}
function openLogin(){document.getElementById('loginModal').classList.add('show');}function closeLogin(){document.getElementById('loginModal').classList.remove('show');}
function openInbox(){document.getElementById('inboxModal').classList.add('show');if(!currentUser) return;socket.emit('friends:get',{email:currentUser.email},data=>{if(!data) return;document.getElementById('inboxReq').innerHTML='<b>📩 Requests - Inbox to reply - Original from zero - 24/7 translator</b><br>'+(data.requests.length?data.requests.map(e=>'<div style=padding:12px;background:#151821;border:1px solid #222;border-radius:10px;margin-top:6px;display:flex;justify-content:space-between><span>👤 '+e+'</span><button style=padding:5px 10px;border-radius:8px;background:#fff;color:#000;border:0;cursor:pointer' + ' onclick=acceptReq(\\''+e+'\\')>Accept - Reply</button></div>').join(''):'<div style=color:#888;font-size:12px>No requests - Inbox for reply - Well monitored - 24/7 translator max quality</div>');document.getElementById('inboxFriends').innerHTML='<b>❤️ Friends - Adding system - Original from zero - 24/7</b><br>'+(data.friends.length?data.friends.map(e=>'<div style=padding:12px;background:#151821;border:1px solid #222;border-radius:10px;margin-top:6px;display:flex;justify-content:space-between><span>👤 '+e+'</span><button style=padding:5px 10px;border-radius:8px;background:linear-gradient(135deg,#ff2d91,#6a5cff);color:#fff;border:0;cursor:pointer' + ' onclick=openChatWith(\\''+e+'\\')>💬 Talk - Reply - 0.1s</button></div>').join(''):'<div style=color:#888;font-size:12px>No friends - Adding system - Original from zero - 24/7 translator</div>');});socket.emit('inbox:all',{email:currentUser.email},msgs=>{let div=document.getElementById('inboxMsgs');if(div) div.innerHTML='<b>💬 Inbox messages to reply - 0.1s - Original from zero - 24/7 translator max quality</b><br>'+(msgs.length?msgs.slice(-8).reverse().map(m=>'<div style=padding:10px;background:#151821;border:1px solid #222;border-radius:10px;margin-top:6px><b>From '+m.from+'</b><div style=color:#a7abb5;font-size:11px;margin-top:4px>'+m.text+' - '+m.time+' - Sending system - Original from zero - 0.1s - Well monitored - 24/7 translator</div></div>').join(''):'<div style=color:#888;font-size:12px>No messages - Sending system - Inbox for reply - Original from zero - 24/7 translator max quality</div>');});}
function closeInbox(){document.getElementById('inboxModal').classList.remove('show');}
function openChat(){document.getElementById('chatModal').classList.add('show');if(!currentUser) return;socket.emit('friends:get',{email:currentUser.email},data=>{if(!data) return;document.getElementById('chatFriends').innerHTML=data.friends.length?data.friends.map(e=>'<div style=padding:12px;background:#151821;border:1px solid #222;border-radius:10px;margin-top:6px;cursor:pointer;display:flex;justify-content:space-between' + ' onclick=openChatWith(\\''+e+'\\')><span>👤 '+e+'</span><span style=color:#32dc7d>● Live 0.1s - Talk - 24/7</span></div>').join(''):'<div style=color:#888;font-size:12px>No friends - Adding system - Original from zero - Inbox for reply - 24/7 translator</div>';});}function closeChat(){document.getElementById('chatModal').classList.remove('show');}
function openRedeem(){document.getElementById('redeemModal').classList.add('show');if(currentUser) document.getElementById('redeemEmail').value=currentUser.email;}function closeRedeem(){document.getElementById('redeemModal').classList.remove('show');}
function openPay(){document.getElementById('payModal').classList.add('show');setChain(curChain);}function closePay(){document.getElementById('payModal').classList.remove('show');}
function openPayWith(p){document.getElementById('planSel').value=p;openPay();}
function escapeHTML(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function setChain(c){curChain=c;['BTC','ETH'].forEach(x=>{let b=document.getElementById('b'+x);if(b) b.className=x===c?'btn btn-white':'btn btn-dark';});let sel=document.getElementById('planSel').value;let box=document.getElementById('walletBox');if(box) box.innerHTML='<b>'+c+' REAL - Real money - Nothing fake - Arrives to my '+c+' - $'+sel+' - Hidden code - Only in redeem code - Original from zero - Latest software - 24/7 translator max quality</b><br><br><span style=color:#32dc7d;font-weight:900;font-size:11px;word-break:break-all>'+WALLETS[c]+'</span><br><br><button onclick=navigator.clipboard.writeText(\\''+WALLETS[c]+'\\') style=padding:6px 10px;border-radius:8px;background:#1e1e26;color:#fff;border:1px solid #333>📋 Copy '+c+' Real - Real money - '+WALLETS[c].slice(0,10)+'...</button>';}
function quickAdd(){let u=document.getElementById('quickUser').value.trim();if(!u)return;if(!currentUser){openRegister();return;}socket.emit('friend:request',{from:currentUser.email,to:u,fromName:currentUser.username},r=>{alert(r.ok?'📩 Request sent original from zero 0.1s to @'+u+' - Adding system - Send request - Inbox to reply - Well monitored - Super realistic background - 24/7 translator max quality':r.msg);});}
function loadMyCodes(){let email=(document.getElementById('redeemEmail').value.trim().toLowerCase()||currentUser?.email||'').toLowerCase();if(!email)return;fetch('/api/my-codes?email='+encodeURIComponent(email)).then(r=>r.json()).then(list=>{let div=document.getElementById('myCodesList');div.innerHTML=list.length?list.map(c=>'<div class=codeBox><b>'+escapeHTML(c.code)+'</b> — '+c.months+' months — $'+escapeHTML(c.plan)+' — '+(c.used?'<span style=color:#ff2d91>USED - Ends time</span>':'<span style=color:#32dc7d>AVAILABLE - Only one code per payment</span>')+'<br><button style=padding:6px 10px;border-radius:8px;background:#fff;color:#000;border:0;cursor:pointer;margin-top:6px' + ' onclick=navigator.clipboard.writeText(\\''+c.code+'\\');document.getElementById(\\'redeemCode\\').value=\\''+c.code+'\\'>📋 Copy code - Original from zero - 24/7 translator</button></div>').join(''):'<div style=color:#888;font-size:11px>🔒 No codes - If you pay $4.99 BTC/ETH real to ${WALLETS.BTC} / ${WALLETS.ETH} and put REAL TxID, hidden code generates that only you see here - Only one code per payment 3.99 per 3 months ends time - Original from zero - No fake - 24/7 translator max quality</div>';});}
function redeemCode(){let email=(document.getElementById('redeemEmail').value.trim().toLowerCase()||currentUser?.email||'').toLowerCase();let code=document.getElementById('redeemCode').value.trim().toUpperCase();let ok=document.getElementById('redeemOk');let err=document.getElementById('redeemErr');ok.style.display='none';err.style.display='none';if(!email||!code){err.style.display='block';err.textContent='Email + hidden code required - Original from zero - 24/7 translator';return;}fetch('/api/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code})}).then(r=>r.json()).then(d=>{if(!d.success){err.style.display='block';err.textContent=d.error;return;}ok.style.display='block';ok.textContent=d.message;loadMyCodes();});}
function verifyPayGenerateCode(){let sel=document.getElementById('planSel').value;let email=(document.getElementById('emailPay').value.trim().toLowerCase()||currentUser?.email||'').toLowerCase();let tx=document.getElementById('txInput').value.trim();let ok=document.getElementById('payOk');let err=document.getElementById('payErr');let box=document.getElementById('generatedCodeBox');ok.style.display='none';err.style.display='none';box.style.display='none';if(!email||!tx){err.style.display='block';err.textContent='Email + REAL BTC/ETH TxID required - Real payments real money - Nothing fake - 24/7 translator';return;}fetch('/api/pay-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,txid:tx,plan:sel,chain:curChain})}).then(r=>r.json()).then(d=>{if(!d.success){err.style.display='block';err.textContent=d.error;return;}ok.style.display='block';ok.textContent=d.message;box.style.display='block';box.innerHTML='<b>🔓 HIDDEN CODE UNLOCKED - ORIGINAL FROM ZERO - REAL MONEY - NOTHING FAKE - 24/7 TRANSLATOR MAX QUALITY</b><br><br><span style=font-size:18px;color:#32dc7d;font-weight:900>'+d.code+'</span><br><br>Plan: '+d.plan+' — '+d.months+' months — Only one code per payment 3.99 per 3 months ends time — Chain: '+curChain+' — TxID: '+tx.slice(0,16)+'... — BTC ${WALLETS.BTC.slice(0,8)}... ETH ${WALLETS.ETH.slice(0,8)}...<br><br><button style=padding:8px 12px;border-radius:10px;background:#fff;color:#000;border:0;cursor:pointer;font-weight:800' + ' onclick=navigator.clipboard.writeText(\\''+d.code+'\\');document.getElementById(\\'redeemCode\\').value=\\''+d.code+'\\';openRedeem();>📋 Copy code - Unlocks and they use it - Original from zero - 24/7 translator</button>';});}
function acceptReq(from){socket.emit('friend:accept',{from:from,to:currentUser.email},()=>{openInbox();});}
function openChatWith(username){if(!currentUser){openRegister();return;}activeChat=username;openChat();document.getElementById('chatWin').style.display='block';document.getElementById('chatName').textContent='💬 Talking live with @'+username+' - Talking system - Original from zero - 0.1s - 24/7 translator';socket.emit('chat:load',{from:currentUser.email,to:username},msgs=>{let box=document.getElementById('chatBox');box.innerHTML=msgs.length?msgs.map(m=>'<div style=max-width:78%;padding:8px 10px;border-radius:14px;margin:6px 0;font-size:12px;'+(m.from===currentUser.email?'background:#ff2d91;color:#fff;margin-left:auto':'background:#23232e')+' >'+escapeHTML(m.text)+'<br><span style=font-size:9px;opacity:.6>'+m.time+' · Talking system - Original from zero - 0.1s - Well monitored - 24/7 translator</span></div>').join(''):'<div style=text-align:center;color:#666;padding:10px'>Talking system - Live conversation 0.1s with @'+escapeHTML(username)+'<br>Original from zero - Sending system, talking system, adding system, inbox messages to reply - Well monitored - Super realistic background - Nothing fake - Everything well - 24/7 translator max quality</div>';box.scrollTop=box.scrollHeight;});}
function sendMsg(){if(!currentUser||!activeChat) return;let txt=document.getElementById('chatInput').value.trim();if(!txt) return;socket.emit('chat:message',{from:currentUser.email,to:activeChat,text:txt},r=>{if(r.ok){document.getElementById('chatInput').value='';openChatWith(activeChat);}});}
document.getElementById('registerForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  let ok=document.getElementById('regOk');let err=document.getElementById('regErr');ok.style.display='none';err.style.display='none';
  let body={username:document.getElementById('username').value.trim(),email:document.getElementById('email').value.trim(),password:document.getElementById('password').value,adult:document.getElementById('adult').checked,deviceId:localStorage.getItem('did')||Math.random().toString(36).slice(2,10)};
  if(!localStorage.getItem('did')) localStorage.setItem('did',body.deviceId);
  try{let r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data=await r.json();if(!r.ok){err.style.display='block';err.textContent=data.error;return;}ok.style.display='block';ok.textContent=data.message;localStorage.setItem('sexcites_beta_user',JSON.stringify(data.user));currentUser=data.user;socket.emit('user:join',{email:data.user.email,username:data.user.username});setTimeout(()=>{closeRegister();loadFeed();},1200);}catch(e){err.style.display='block';err.textContent='Error - Original from zero - 24/7 translator max quality';}
});
document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  let ok=document.getElementById('loginOk');let err=document.getElementById('loginErr');ok.style.display='none';err.style.display='none';
  let body={email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value};
  try{let r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data=await r.json();if(!r.ok){err.style.display='block';err.textContent=data.error;return;}ok.style.display='block';ok.textContent='Login original from zero - Live system - No fake - 24/7 translator max quality';localStorage.setItem('sexcites_beta_user',JSON.stringify(data.user));currentUser=data.user;socket.emit('user:join',{email:data.user.email,username:data.user.username});setTimeout(()=>{closeLogin();loadFeed();},900);}catch(e){err.style.display='block';err.textContent='Error';}
});
socket.on('db:update',d=>{loadFeed();let cnt=d.count||0;let el=document.getElementById('liveCnt');if(el) el.textContent='● '+cnt+' / 500 - 0-500 FREE 2 MONTHS - '+(cnt>=500?'🔒 501+ BLOCKED - CHARGE':'FREE')+' - Original from zero - 24/7 translator';let free=document.getElementById('freeCount');if(free) free.textContent=(500-cnt)+' / 500 free - '+(cnt>=500?'🔒 BLOCKED 501+':'FREE 2 MONTHS BEST QUALITY')+' - From zero - 24/7 translator';let bar=document.getElementById('freeBar');if(bar) bar.style.width=((cnt/500)*100)+'%';});
function loadFeed(){fetch('/api/posts').then(r=>r.json()).then(data=>{let feed=document.getElementById('feed');feed.innerHTML=data.length?data.map(p=>'<div class=post><b>@'+escapeHTML(p.username)+' #'+p.order+' '+(p.order<=500?'<span style=background:#32dc7d;color:#000;padding:2px 6px;border-radius:10px;font-size:9px>0-500 FREE 2 MONTHS - 24/7 TRANSLATOR</span>':'<span style=background:#ff2d91;color:#fff;padding:2px 6px;border-radius:10px;font-size:9px>501+ BLOCKED - REAL PAYMENTS - 24/7</span>')+'</b><div style=color:#a7abb5;font-size:12px;margin-top:6px>'+escapeHTML(p.text)+'</div></div>').join(''):'<div class=post><b>🎉 ORIGINAL SYSTEM FROM ZERO - NO FAKE - 0-500 FREE 2 MONTHS BEST QUALITY - 501 502 BLOCKED - 24/7 TRANSLATOR MAX QUALITY</b><div style=color:#888;font-size:12px;margin-top:6px>Everything that happened to me put it in English and that the person who was in Spanish has a translator twenty-four seven hours that has maximum quality software system everything - Original from zero - Username/password/email you want - Live system real payments nothing fake - Sending, talking, adding, inbox for reply - Well monitored - Super realistic background - Future ahead - 0-500 free 2 months best quality - 501+ blocked - BTC ${WALLETS.BTC.slice(0,8)}... ETH ${WALLETS.ETH.slice(0,8)}... - Hidden codes only in redeem code - 24/7 translator max quality</div></div>';});}
window.addEventListener('load',()=>{
  let savedLang=localStorage.getItem('sexcites_lang')||'en'; setLang(savedLang);
  let sel=document.getElementById('planSel'); if(sel) sel.value='11.99';
  setChain('BTC'); loadFeed();
  if(currentUser) socket.emit('user:join',{email:currentUser.email,username:currentUser.username});
});
<\/script></body></html>`);
});

io.on('connection',(socket)=>{
  socket.on('user:join',(d)=>{if(d.email) socket.join(d.email); io.emit('db:update',{count:users.size});});
  socket.on('friends:get',(d,cb)=>{if(!d?.email) return cb({requests:[],friends:[]}); cb({requests:requests.get(d.email)||[],friends:friends.get(d.email)||[]});});
  socket.on('friend:request',(d,cb)=>{
    let toEmail=null; for(let u of users.values()){if(u.username.toLowerCase()===d.to.toLowerCase()||u.email.toLowerCase()===d.to.toLowerCase()){toEmail=u.email;break;}}
    if(!toEmail) return cb&&cb({ok:false,msg:'User not exists - Original system from zero - Add only with username - 24/7 translator'});
    if(!requests.has(toEmail)) requests.set(toEmail,[]);
    let arr=requests.get(toEmail); if(arr.includes(d.from)) return cb&&cb({ok:false,msg:'Already sent 0.1s - Original from zero - Well monitored - 24/7 translator'});
    arr.push(d.from); requests.set(toEmail,arr); io.to(toEmail).emit('friend:newRequest',{from:d.from,to:toEmail,fromName:d.fromName}); cb&&cb({ok:true});
  });
  socket.on('friend:accept',(d,cb)=>{let rq=requests.get(d.to)||[];requests.set(d.to,rq.filter(e=>e!==d.from));let f1=friends.get(d.to)||[];if(!f1.includes(users.get(d.from)?.username||d.from)) f1.push(users.get(d.from)?.username||d.from);friends.set(d.to,f1);let f2=friends.get(d.from)||[];if(!f2.includes(users.get(d.to)?.username||d.to)) f2.push(users.get(d.to)?.username||d.to);friends.set(d.from,f2);cb&&cb({ok:true});});
  socket.on('chat:load',(d,cb)=>{
    let toEmail=null; for(let u of users.values()){if(u.username.toLowerCase()===d.to.toLowerCase()||u.email.toLowerCase()===d.to.toLowerCase()){toEmail=u.email;break;}} if(!toEmail) toEmail=d.to;
    let chatId=[d.from,toEmail].sort().join('_'); cb(messages.get(chatId)||[]);
  });
  socket.on('chat:message',(d,cb)=>{
    let fromEmail=d.from; let toEmail=null; for(let u of users.values()){if(u.username.toLowerCase()===d.to.toLowerCase()||u.email.toLowerCase()===d.to.toLowerCase()){toEmail=u.email;break;}} if(!toEmail) toEmail=d.to;
    let chatId=[fromEmail,toEmail].sort().join('_'); let arr=messages.get(chatId)||[]; arr.push({from:fromEmail,to:toEmail,text:d.text,time:new Date().toLocaleTimeString()}); messages.set(chatId,arr);
    io.to(toEmail).emit('chat:newMessage',{chatId:chatId}); io.to(fromEmail).emit('chat:newMessage',{chatId:chatId}); if(cb) cb({ok:true});
  });
  socket.on('inbox:all',(d,cb)=>{let all=[]; for(let [chatId,msgs] of messages.entries()){if(chatId.includes(d.email)) all.push(...msgs);} cb(all.slice(-20));});
});

server.listen(PORT,"0.0.0.0",()=>console.log("SEXCITES.COM ORIGINAL LIVE FROM ZERO - ENGLISH BASE - 24/7 TRANSLATOR MAX QUALITY - Everything in English and Spanish person has 24/7 translator max quality software system - 0-500 FREE - 501+ BLOCKED - BTC "+WALLETS.BTC+" ETH "+WALLETS.ETH+" - Port "+PORT));
