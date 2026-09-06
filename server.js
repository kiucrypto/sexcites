const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ===============================
// SECURITY HEADERS
// ===============================

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  next();
});

// ===============================
// BASIC DATA
// ===============================

const users = new Map();
const posts = [];

const MAX_USERS = 500;

const FOUNDER_USERNAME = "LenoxJG";
const FOUNDER_NAME = "Jhon Gonzales";

// ===============================
// HELPERS
// ===============================

function id() {
  return crypto.randomBytes(16).toString("hex");
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validUsername(username) {
  return /^[a-zA-Z0-9_.-]{3,30}$/.test(username);
}

// ===============================
// HOME PAGE
// ===============================

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0">

<title>SEXCITES — Connect. Express. Belong.</title>

<meta
name="description"
content="SEXCITES is a modern 18+ social community.">

<style>

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background:
    radial-gradient(
      circle at 80% 0%,
      rgba(255, 35, 145, 0.16),
      transparent 35%
    ),
    radial-gradient(
      circle at 10% 20%,
      rgba(115, 80, 255, 0.12),
      transparent 30%
    ),
    #07080c;

  color: #ffffff;

  font-family:
    Inter,
    Arial,
    Helvetica,
    sans-serif;
}

button,
input,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.navbar {
  position: sticky;
  top: 0;
  z-index: 100;

  border-bottom: 1px solid rgba(255,255,255,.08);

  background:
    rgba(7,8,12,.82);

  backdrop-filter: blur(20px);
}

.nav-inner {
  max-width: 1180px;
  margin: auto;

  min-height: 72px;

  padding: 0 20px;

  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 2px;
}

.logo span {
  color: #ff2d91;
}

.nav-button {
  border: 0;

  padding: 11px 18px;

  border-radius: 12px;

  color: white;

  font-weight: 800;

  background:
    linear-gradient(
      135deg,
      #ff2d91,
      #7657ff
    );

  box-shadow:
    0 10px 30px rgba(255,45,145,.20);
}

.container {
  width: min(1180px, calc(100% - 40px));

  margin: auto;
}

.hero {
  min-height: 650px;

  display: grid;

  grid-template-columns:
    1.15fr
    .85fr;

  gap: 40px;

  align-items: center;
}

.hero-badge {
  display: inline-flex;

  align-items: center;

  gap: 8px;

  padding: 8px 13px;

  border-radius: 999px;

  border: 1px solid
    rgba(255,255,255,.12);

  background:
    rgba(255,255,255,.04);

  color: #d8d9df;

  font-size: 13px;

  font-weight: 700;
}

.green-dot {
  width: 8px;
  height: 8px;

  border-radius: 50%;

  background: #32dc7d;

  box-shadow:
    0 0 12px #32dc7d;
}

.hero h1 {
  margin: 22px 0;

  font-size:
    clamp(48px, 8vw, 88px);

  line-height: .92;

  letter-spacing: -4px;
}

.gradient {
  background:
    linear-gradient(
      135deg,
      #ffffff,
      #ff3a9a
    );

  -webkit-background-clip: text;

  background-clip: text;

  color: transparent;
}

.hero-description {
  max-width: 650px;

  color: #9da1ad;

  font-size: 18px;

  line-height: 1.7;
}

.primary {
  margin-top: 20px;

  border: 0;

  padding: 15px 23px;

  border-radius: 14px;

  color: white;

  font-weight: 900;

  background:
    linear-gradient(
      135deg,
      #ff2d91,
      #7657ff
    );

  box-shadow:
    0 15px 40px
    rgba(255,45,145,.22);
}

.preview {
  min-height: 410px;

  padding: 24px;

  border-radius: 28px;

  border: 1px solid
    rgba(255,255,255,.10);

  background:
    linear-gradient(
      180deg,
      rgba(28,30,41,.95),
      rgba(12,14,20,.95)
    );

  box-shadow:
    0 30px 100px
    rgba(0,0,0,.45);
}

.preview-header {
  display: flex;

  align-items: center;

  gap: 13px;
}

.avatar {
  width: 54px;
  height: 54px;

  border-radius: 17px;

  display: grid;

  place-items: center;

  font-weight: 900;

  background:
    linear-gradient(
      135deg,
      #ff2d91,
      #7657ff
    );
}

.preview-card {
  margin-top: 35px;

  padding: 22px;

  border-radius: 20px;

  background:
    rgba(255,255,255,.045);

  border:
    1px solid
    rgba(255,255,255,.07);
}

.preview-line {
  height: 10px;

  margin: 10px 0;

  border-radius: 99px;

  background:
    rgba(255,255,255,.08);
}

.short {
  width: 65%;
}

.tiny {
  width: 40%;
}

.features {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 18px;

  padding: 40px 0;
}

.feature {
  padding: 25px;

  border-radius: 22px;

  border:
    1px solid
    rgba(255,255,255,.08);

  background:
    rgba(255,255,255,.035);
}

.feature-number {
  color: #ff3b9b;

  font-weight: 900;

  font-size: 14px;
}

.feature h3 {
  font-size: 21px;
}

.feature p {
  color: #9296a3;

  line-height: 1.6;
}

.section {
  padding: 50px 0;
}

.section h2 {
  font-size: 34px;
}

.feed {
  display: grid;

  grid-template-columns:
    repeat(2, 1fr);

  gap: 18px;
}

.post {
  padding: 20px;

  border-radius: 20px;

  background: #11131a;

  border:
    1px solid
    rgba(255,255,255,.08);
}

.post-header {
  display: flex;

  align-items: center;

  gap: 12px;
}

.post-text {
  color: #d7d9df;

  line-height: 1.6;
}

.actions {
  display: flex;

  gap: 8px;
}

.actions button {
  border: 1px solid
    rgba(255,255,255,.08);

  background:
    rgba(255,255,255,.04);

  color: #ddd;

  border-radius: 10px;

  padding: 8px 12px;
}

.founder {
  margin-top: 30px;

  padding: 28px;

  border-radius: 24px;

  border:
    1px solid
    rgba(255,45,145,.20);

  background:
    linear-gradient(
      135deg,
      rgba(255,45,145,.08),
      rgba(118,87,255,.06)
    );
}

.verified {
  display: inline-flex;

  align-items: center;

  justify-content: center;

  width: 21px;
  height: 21px;

  border-radius: 50%;

  color: white;

  font-size: 12px;

  background:
    linear-gradient(
      135deg,
      #ff2d91,
      #7657ff
    );
}

footer {
  padding: 50px 0;

  margin-top: 40px;

  border-top:
    1px solid
    rgba(255,255,255,.08);

  color: #747985;

  text-align: center;
}

.modal {
  display: none;

  position: fixed;

  inset: 0;

  z-index: 500;

  place-items: center;

  padding: 20px;

  background:
    rgba(0,0,0,.78);
}

.modal.show {
  display: grid;
}

.modal-box {
  width: min(440px, 100%);

  padding: 26px;

  border-radius: 24px;

  background: #11131a;

  border:
    1px solid
    rgba(255,255,255,.10);

  box-shadow:
    0 30px 100px
    rgba(0,0,0,.6);
}

.close {
  float: right;

  border: 0;

  background: none;

  color: #aaa;

  font-size: 26px;
}

form {
 
