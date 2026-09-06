const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.set('trust proxy', true); // para IP real

let contador = 0;
let pagosUsados = new Set();
let suscripciones = {}; // email -> {ip, deviceId, vipHasta}
let ipsBloqueadas = new Set();
let ipsRegistro = {}; // ip -> cantidad de cuentas

const WALLETS = {
  BTC: "bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s",
  ETH: "0x4ABCf532fed9D9CFD0d3C4654cDFB56D02cFF21c",
  SOL: "F66a36aKwwvZaaaCSTyfWja4P2dNMmYHK7W2nMBVm6h1"
};

function getIP(req){
  return req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.connection.remoteAddress;
}

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEXCITES VIP - 1 Dispositivo</title>
<style>
body{background:#000;color:#fff;font-family:Arial;text-align:center;padding:15px}
.card{background:#111;padding:20px;border-radius:20px;max-width:540px;margin:auto;border:2px solid #ff0055}
.bar{background:#333;height:22px;border-radius:11px;overflow:hidden}
.fill{background:linear-gradient(90deg,#ff0055,#ffaa00);height:100%;width:0%;transition:1s}
.wallet{background:#1a1a1a;padding:10px;border-radius:10px;margin:8px 0;word-break:break-all;font-size:12px}
button{background:#ff0055;color:#fff;border:none;padding:14px;width:100%;border-radius:10px;font-weight:bold}
input{width:100%;padding:12px;margin:5px 0;border-radius:8px;border:none;box-sizing:border-box}
.error{background:#ff0000;color:#fff;padding:15px;border-radius:10px;font-weight:bold;display:none}
.vip{background:#00ff88;color:#000;padding:15px;border-radius:10px;font-weight:bold;display:none}
</style>
</head>
<body>
<div class="card">
<h1>🔥 SEXCITES VIP 🔥</h1>
<p>🛡️ SISTEMA ANTI-FRAUDE ULTRA - 1 DISPOSITIVO POR PERSONA</p>
<h2 id="cont">0 / 500</h2>
<div class="bar"><div id="fill" class="fill"></div></div>
<p><span id="ipShow"></span> | Dispositivo bloqueado tras registro</p>

<div id="errorBox" class="error"></div>

<div id="formBox">
<input id="email" placeholder="Tu email (1 cuenta por dispositivo)">
<button onclick="activar()">ACTIVAR 2 MESES GRATIS VIP - 1 DISPOSITIVO</button>
</div>

<div style="margin-top:15px">
<h3>PAGO REAL - DESBLOQUEO DE POR VIDA $25</h3>
<div class="wallet">BTC: ${WALLETS.BTC}<br><button onclick="copy('${WALLETS.BTC}')">Copiar BTC</button></div>
<div class="wallet">ETH: ${WALLETS.
