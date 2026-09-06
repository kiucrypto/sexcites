"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const argon2 = require("argon2");

const app = express();
const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 150,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

const FOUNDER_USERNAME = "LenoxJG";
const FOUNDER_NAME = "Jhon Gonzales";

async function database() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(30) NOT NULL UNIQUE,
      display_name VARCHAR(80) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      bio TEXT DEFAULT '',
      gender VARCHAR(40) DEFAULT '',
      country VARCHAR(80) DEFAULT '',
      age INTEGER,
      avatar TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      is_founder BOOLEAN DEFAULT FALSE,
      is_verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      image TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    );

    CREATE INDEX IF NOT EXISTS posts_created_at_idx
    ON posts(created_at DESC);
  `);

  const founder = await pool.query(
    "SELECT id FROM users WHERE username = $1",
    [FOUNDER_USERNAME]
  );

  if (founder.rows.length === 0 && process.env.FOUNDER_PASSWORD) {
    const passwordHash = await argon2.hash(process.env.FOUNDER_PASSWORD);

    await pool.query(
      `
      INSERT INTO users
      (username, display_name, email, password_hash, bio,
       is_founder, is_verified)
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
      ON CONFLICT (username) DO NOTHING
      `,
      [
        FOUNDER_USERNAME,
        FOUNDER_NAME,
        process.env.FOUNDER_EMAIL,
        passwordHash,
        "Founder of SEXCITES. Building a private, inclusive and modern community for the future."
      ]
    );

    console.log("Official founder account created.");
  }
}

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 30);
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "You must be logged in."
    });
  }

  next();
}

app.get("/api/me", async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }

  const result = await pool.query(
    `
    SELECT id, username, display_name, email, bio, gender,
           country, age, avatar, cover, is_founder, is_verified
    FROM users
    WHERE id = $1
    `,
    [req.session.userId]
  );

  res.json({
    user: result.rows[0] || null
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const {
      username,
      displayName,
      email,
      password,
      age,
      gender,
      country
    } = req.body;

    const cleanUser = cleanUsername(username);
    const cleanName = String(displayName || "").trim().slice(0, 80);
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanUser || cleanUser.length < 3) {
      return res.status(400).json({
        error: "Username must contain at least 3 characters."
      });
    }

    if (!cleanName) {
      return res.status(400).json({
        error: "Display name is required."
      });
    }

    if (!cleanEmail.includes("@")) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        error: "Password must contain at least 8 characters."
      });
    }

    if (Number(age) < 18) {
      return res.status(400).json({
        error: "SEXCITES is an 18+ community."
      });
    }

    if (cleanUser.toLowerCase() === FOUNDER_USERNAME.toLowerCase()) {
      return res.status(409).json({
        error: "This username belongs to the official SEXCITES founder."
      });
    }

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM users"
    );

    if (countResult.rows[0].total >= 500) {
      return res.status(403).json({
        full: true,
        error: "The first community capacity has been reached."
      });
    }

    const existing = await pool.query(
      `
      SELECT id FROM users
      WHERE LOWER(username) = LOWER($1)
         OR LOWER(email) = LOWER($2)
      `,
      [cleanUser, cleanEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Username or email already exists."
      });
    }

    const passwordHash = await argon2.hash(password);

    const result = await pool.query(
      `
      INSERT INTO users
      (username, display_name, email, password_hash,
       age, gender, country)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, display_name, email,
                age, gender, country, is_founder, is_verified
      `,
      [
        cleanUser,
        cleanName,
        cleanEmail,
        passwordHash,
        Number(age),
        String(gender || "").slice(0, 40),
        String(country || "").slice(0, 80)
      ]
    );

    req.session.userId = result.rows[0].id;

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Registration failed."
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const identifier = String(req.body.identifier || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE LOWER(username) = $1
         OR LOWER(email) = $1
      LIMIT 1
      `,
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid login information."
      });
    }

    const user = result.rows[0];
    const valid = await argon2.verify(user.password_hash, password);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid login information."
      });
    }

    req.session.userId = user.id;

    delete user.password_hash;

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Login failed."
    });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true
    });
  });
});

app.get("/api/users/:username", async (req, res) => {
  const username = cleanUsername(req.params.username);

  const result = await pool.query(
    `
    SELECT id, username, display_name, bio, gender, country,
           age, avatar, cover, is_founder, is_verified, created_at
    FROM users
    WHERE LOWER(username) = LOWER($1)
    `,
    [username]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: "User not found."
    });
  }

  res.json({
    user: result.rows[0]
  });
});

app.patch("/api/profile", requireAuth, async (req, res) => {
  const {
    displayName,
    bio,
    gender,
    country,
    age,
    avatar,
    cover
  } = req.body;

  const result = await pool.query(
    `
    UPDATE users
    SET display_name = COALESCE($1, display_name),
        bio = COALESCE($2, bio),
        gender = COALESCE($3, gender),
        country = COALESCE($4, country),
        age = COALESCE($5, age),
        avatar = COALESCE($6, avatar),
        cover = COALESCE($7, cover)
    WHERE id = $8
    RETURNING id, username, display_name, email, bio, gender,
              country, age, avatar, cover, is_founder, is_verified
    `,
    [
      displayName ? String(displayName).slice(0, 80) : null,
      bio ? String(bio).slice(0, 1000) : null,
      gender ? String(gender).slice(0, 40) : null,
      country ? String(country).slice(0, 80) : null,
      age ? Number(age) : null,
      avatar ? String(avatar).slice(0, 500) : null,
      cover ? String(cover).slice(0, 500) : null,
      req.session.userId
    ]
  );

  res.json({
    success: true,
    user: result.rows[0]
  });
});

app.get("/api/posts", async (req, res) => {
  const result = await pool.query(`
    SELECT
      posts.id,
      posts.content,
      posts.image,
      posts.created_at,
      users.username,
      users.display_name,
      users.avatar,
      users.is_founder,
      users.is_verified
    FROM posts
    JOIN users ON users.id = posts.user_id
    ORDER BY posts.created_at DESC
    LIMIT 100
  `);

  res.json({
    posts: result.rows
  });
});

app.post("/api/posts", requireAuth, async (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content || content.length > 3000) {
    return res.status(400).json({
      error: "Post content is required and must be under 3000 characters."
    });
  }

  const result = await pool.query(
    `
    INSERT INTO posts(user_id, content, image)
    VALUES ($1, $2, $3)
    RETURNING id, content, image, created_at
    `,
    [
      req.session.userId,
      content,
      String(req.body.image || "").slice(0, 500)
    ]
  );

  res.json({
    success: true,
    post: result.rows[0]
  });
});

app.get("*", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEXCITES — Private Social Community</title>

<style>
:root {
  --bg: #08090d;
  --panel: #11131b;
  --panel2: #171a25;
  --line: #292d3d;
  --text: #f5f7ff;
  --muted: #9299ad;
  --accent: #ff3d81;
  --accent2: #8b5cf6;
  --success: #32d583;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 15% 10%, #3d1534 0, transparent 30%),
    radial-gradient(circle at 90% 0%, #20154b 0, transparent 32%),
    var(--bg);
  color: var(--text);
  font-family: Inter, Arial, sans-serif;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.nav {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6%;
  border-bottom: 1px solid var(--line);
  background: rgba(8, 9, 13, .8);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.logo {
  font-size: 25px;
  font-weight: 900;
  letter-spacing: -1px;
}

.logo span {
  color: var(--accent);
}

.nav button,
.primary {
  border: 0;
  color: white;
  font-weight: 800;
  border-radius: 14px;
  padding: 13px 20px;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  box-shadow: 0 10px 30px #ff3d8130;
}

.page {
  max-width: 1180px;
  margin: auto;
  padding: 55px 20px;
}

.hero {
  display: grid;
  grid-template-columns: 1.2fr .8fr;
  gap: 40px;
  align-items: center;
  min-height: 560px;
}

h1 {
  font-size: clamp(45px, 7vw, 82px);
  line-height: .98;
  letter-spacing: -5px;
  margin: 0 0 25px;
}

h1 span {
  background: linear-gradient(135deg, #fff, #ff5d99, #a78bfa);
  -webkit-background-clip: text;
  color: transparent;
}

.hero p {
  color: var(--muted);
  font-size: 19px;
  line-height: 1.7;
  max-width: 600px;
}

.card {
  background: linear-gradient(145deg, #171a25, #0e1017);
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 28px;
  box-shadow: 0 25px 80px #0008;
}

.auth {
  width: 100%;
  max-width: 430px;
  margin: auto;
}

.auth h2 {
  margin-top: 0;
  font-size: 28px;
}

input,
textarea,
select {
  width: 100%;
  margin: 7px 0;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #090b11;
  color: white;
  outline: none;
}

input:focus,
textarea:focus,
select:focus {
  border-color: var(--accent);
}

.auth .primary {
  width: 100%;
  margin-top: 12px;
}

.small {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.message {
  margin-top: 15px;
  color: #ff8db5;
}

.hidden {
  display: none !important;
}

.dashboard {
  display: grid;
  grid-template-columns: 240px 1fr 260px;
  gap: 20px;
}

.side,
.feed,
.right {
  min-width: 0;
}

.menu {
  display: grid;
  gap: 8px;
}

.menu button {
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 14px;
  border-radius: 12px;
}

.menu button:hover {
  background: var(--panel2);
  color: white;
}

.postbox {
  margin-bottom: 20px;
}

.post {
  margin-bottom: 15px;
}

.post-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  font-weight: 900;
}

.verified {
  color: #72a7ff;
  font-size: 14px;
}

.post-content {
  color: #e4e7f0;
  line-height: 1.7;
  margin-top: 15px;
  white-space: pre-wrap;
}

.badge {
  display: inline-block;
  color: #ff91b9;
  background: #ff3d8118;
  border: 1px solid #ff3d8140;
  border-radius: 100px;
  padding: 5px 9px;
  font-size: 11px;
  font-weight: 800;
}

@media (max-width: 900px) {
  .hero,
  .dashboard {
    grid-template-columns: 1fr;
  }

  .right {
    display: none;
  }

  .hero {
    text-align: center;
  }

  .hero p {
    margin-left: auto;
    margin-right: auto;
  }

  h1 {
    letter-spacing: -3px;
  }
}
</style>
</head>

<body>

<header class="nav">
  <div class="logo">SEX<span>CITES</span></div>
  <button id="navButton" onclick="showAuth()">Join the community</button>
</header>

<main id="landing" class="page">
  <section class="hero">
    <div>
      <div class="badge">PRIVATE • INCLUSIVE • 18+</div>
      <h1>Your people.<br><span>Your space.</span></h1>
      <p>
        A modern social community built for authentic expression,
        meaningful connections and a more private digital future.
      </p>
      <button class="primary" onclick="showAuth()">Create your account</button>
    </div>

    <div id="authCard" class="card auth hidden">
      <h2 id="authTitle">Create your account</h2>

      <form id="authForm">
        <input id="displayName" placeholder="Display name">
        <input id="username" placeholder="Username">
        <input id="email" type="email" placeholder="Private email">
        <input id="password" type="password" placeholder="Password">
        <input id="age" type="number" min="18" placeholder="Age">
        <input id="gender" placeholder="Gender (optional)">
        <input id="country" placeholder="Country (optional)">

        <button class="primary" type="submit">Create account</button>
      </form>

      <p class="small">
        Your email is private. You must be 18 or older.
      </p>

      <p id="authMessage" class="message"></p>
    </div>
  </section>
</main>

<main id="app" class="page hidden">
  <div class="dashboard">

    <aside class="side card">
      <h3>SEXCITES</h3>
      <div class="menu">
        <button onclick="loadPosts()">Home</button>
        <button onclick="loadProfile()">My profile</button>
        <button onclick="logout()">Log out</button>
      </div>
    </aside>

    <section class="feed">
      <div class="card postbox">
        <h3>Share something</h3>
        <textarea id="postContent" rows="4"
          placeholder="What is happening in your world?"></textarea>
        <button class="primary" onclick="createPost()">Publish</button>
      </div>

      <div id="posts"></div>
    </section>

    <aside class="right card">
      <h3>Official founder</h3>
      <div class="post-head">
        <div class="avatar">JG</div>
        <div>
          <strong>Jhon Gonzales</strong>
          <div class="small">@LenoxJG</div>
        </div>
      </div>
      <p class="small">
        Founder of SEXCITES. This is the only official founder account
        on the platform.
      </p>
      <span class="badge">VERIFIED FOUNDER</span>
    </aside>

  </div>
</main>

<script>
let currentUser = null;

function showAuth() {
  document.getElementById("authCard").classList.remove("hidden");
  document.getElementById("authCard").scrollIntoView({
    behavior: "smooth"
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  return response.json();
}

document.getElementById("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = document.getElementById("authMessage");

  const result = await request("/api/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: document.getElementById("displayName").value,
      username: document.getElementById("username").value,
      email: document.getElementById("email").value,
      password: document.getElementById("password").value,
      age: document.getElementById("age").value,
      gender: document.getElementById("gender").value,
      country: document.getElementById("country").value
    })
  });

  if (!result.success) {
    message.textContent = result.error;
    return;
  }

  currentUser = result.user;
  openApp();
});

async function openApp() {
  document.getElementById("landing").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("navButton").textContent = "SEXCITES";
  await loadPosts();
}

async function loadPosts() {
  const result = await request("/api/posts");
  const posts = document.getElementById("posts");

  posts.innerHTML = result.posts.map(post => `
    <article class="card post">
      <div class="post-head">
        <div class="avatar">
          ${(post.display_name || "U").charAt(0).toUpperCase()}
        </div>
        <div>
          <strong>${escapeHtml(post.display_name)}</strong>
          ${post.is_verified ? '<span class="verified"> ✓</span>' : ""}
          <div class="small">@${escapeHtml(post.username)}</div>
        </div>
      </div>
      <div class="post-content">${escapeHtml(post.content)}</div>
    </article>
  `).join("");
}

async function createPost() {
  const content = document.getElementById("postContent").value.trim();

  if (!content) return;

  const result = await request("/api/posts", {
    method: "POST",
    body: JSON.stringify({ content })
  });

  if (result.success) {
    document.getElementById("postContent").value = "";
    await loadPosts();
  } else {
    alert(result.error);
  }
}

async function loadProfile() {
  if (!currentUser) return;

  alert(
    "Profile: " +
    currentUser.display_name +
    " @" +
    currentUser.username
  );
}

async function logout() {
  await request("/api/logout", {
    method: "POST"
  });

  location.reload();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

(async function init() {
  const result = await request("/api/me");

  if (result.user) {
    currentUser = result.user;
    openApp();
  }
})();
</script>

</body>
</html>
  `);
});

database()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SEXCITES running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
