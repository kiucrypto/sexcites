const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const { v4: uuid } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_RENDER";
const DB_FILE = path.join(__dirname, "database.json");

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests. Try again later." },
});

app.use("/api/", limiter);

function loadDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const initialDatabase = {
      users: [],
      posts: [],
      comments: [],
      likes: [],
      messages: [],
      friendRequests: [],
      notifications: [],
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(initialDatabase, null, 2));
    return initialDatabase;
  }

  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return {
      users: [],
      posts: [],
      comments: [],
      likes: [],
      messages: [],
      friendRequests: [],
      notifications: [],
    };
  }
}

let db = loadDatabase();

function saveDatabase() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  const token = header.replace("Bearer ", "");

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired session",
    });
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar || "",
    bio: user.bio || "",
    vip: Boolean(user.vip),
    createdAt: user.createdAt,
  };
}

function notifyUser(userId, notification) {
  db.notifications.push({
    id: uuid(),
    userId,
    ...notification,
    createdAt: new Date().toISOString(),
  });

  saveDatabase();

  io.to(`user:${userId}`).emit("notification", notification);
}

/* HEALTH CHECK */

app.get("/api/health", (req, res) => {
  res.json({
    online: true,
    name: "SEXCITES.COM",
    time: new Date().toISOString(),
  });
});

/* REGISTER */

app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Username, email and password are required",
      });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({
        error: "Username must contain 3 to 30 characters",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must contain at least 8 characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.trim();

    const emailExists = db.users.some(
      (user) => user.email === normalizedEmail
    );

    if (emailExists) {
      return res.status(409).json({
        error: "Email already registered",
      });
    }

    const usernameExists = db.users.some(
      (user) =>
        user.username.toLowerCase() === normalizedUsername.toLowerCase()
    );

    if (usernameExists) {
      return res.status(409).json({
        error: "Username already taken",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = {
      id: uuid(),
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      avatar: "",
      bio: "",
      vip: false,
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);
    saveDatabase();

    const token = createToken(user);

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Registration failed",
    });
  }
});

/* LOGIN */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = db.users.find(
      (item) => item.email === String(email).toLowerCase().trim()
    );

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const token = createToken(user);

    res.json({
      message: "Login successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Login failed",
    });
  }
});

/* CURRENT USER */

app.get("/api/me", auth, (req, res) => {
  const user = db.users.find((item) => item.id === req.user.id);

  if (!user) {
    return res.status(404).json({
      error: "User not found",
    });
  }

  res.json({
    user: publicUser(user),
  });
});

/* USERS */

app.get("/api/users", auth, (req, res) => {
  const users = db.users
    .filter((user) => user.id !== req.user.id)
    .map(publicUser);

  res.json({ users });
});

/* POSTS */

app.get("/api/posts", auth, (req, res) => {
  const posts = db.posts
    .map((post) => {
      const author = db.users.find((user) => user.id === post.userId);

      return {
        ...post,
        author: author ? publicUser(author) : null,
        likes: db.likes.filter((like) => like.postId === post.id).length,
        likedByMe: db.likes.some(
          (like) =>
            like.postId === post.id && like.userId === req.user.id
        ),
        comments: db.comments
          .filter((comment) => comment.postId === post.id)
          .map((comment) => {
            const commentUser = db.users.find(
              (user) => user.id === comment.userId
            );

            return {
              ...comment,
              author: commentUser ? publicUser(commentUser) : null,
            };
          }),
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ posts });
});

app.post("/api/posts", auth, (req, res) => {
  const { content, image } = req.body;

  if (!content && !image) {
    return res.status(400).json({
      error: "Post content or image is required",
    });
  }

  const post = {
    id: uuid(),
    userId: req.user.id,
    content: content || "",
    image: image || "",
    createdAt: new Date().toISOString(),
  };

  db.posts.push(post);
  saveDatabase();

  io.emit("newPost", post);

  res.status(201).json({
    message: "Post published",
    post,
  });
});

/* LIKE / UNLIKE */

app.post("/api/posts/:postId/like", auth, (req, res) => {
  const post = db.posts.find((item) => item.id === req.params.postId);

  if (!post) {
    return res.status(404).json({
      error: "Post not found",
    });
  }

  const existingLike = db.likes.find(
    (like) =>
      like.postId === req.params.postId && like.userId === req.user.id
  );

  if (existingLike) {
    db.likes = db.likes.filter((like) => like.id !== existingLike.id);
  } else {
    db.likes.push({
      id: uuid(),
      postId: req.params.postId,
      userId: req.user.id,
      createdAt: new Date().toISOString(),
    });
  }

  saveDatabase();

  io.emit("postLikeUpdated", {
    postId: req.params.postId,
    likes: db.likes.filter(
      (like) => like.postId === req.params.postId
    ).length,
  });

  res.json({
    liked: !existingLike,
  });
});

/* COMMENTS */

app.post("/api/posts/:postId/comments", auth, (req, res) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({
      error: "Comment cannot be empty",
    });
  }

  const post = db.posts.find((item) => item.id === req.params.postId);

  if (!post) {
    return res.status(404).json({
      error: "Post not found",
    });
  }

  const comment = {
    id: uuid(),
    postId: req.params.postId,
    userId: req.user.id,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };

  db.comments.push(comment);
  saveDatabase();

  io.emit("newComment", comment);

  res.status(201).json({
    comment,
  });
});

/* FRIEND REQUESTS */

app.post("/api/friends/request/:userId", auth, (req, res) => {
  const targetUser = db.users.find(
    (user) => user.id === req.params.userId
  );

  if (!targetUser) {
    return res.status(404).json({
      error: "User not found",
    });
  }

  if (targetUser.id === req.user.id) {
    return res.status(400).json({
      error: "You cannot add yourself",
    });
  }

  const alreadyExists = db.friendRequests.find(
    (request) =>
      request.from === req.user.id &&
      request.to === targetUser.id
  );

  if (alreadyExists) {
    return res.status(409).json({
      error: "Friend request already sent",
    });
  }

  const request = {
    id: uuid(),
    from: req.user.id,
    to: targetUser.id,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  db.friendRequests.push(request);
  saveDatabase();

  notifyUser(targetUser.id, {
    type: "friend_request",
    from: req.user.id,
    message: "You received a new friend request",
  });

  res.status(201).json({
    message: "Friend request sent",
    request,
  });
});

app.get("/api/friends/requests", auth, (req, res) => {
  const requests = db.friendRequests
    .filter(
      (request) =>
        request.to === req.user.id && request.status === "pending"
    )
    .map((request) => {
      const user = db.users.find((item) => item.id === request.from);

      return {
        ...request,
        user: user ? publicUser(user) : null,
      };
    });

  res.json({ requests });
});

app.post("/api/friends/:requestId/accept", auth, (req, res) => {
  const request = db.friendRequests.find(
    (item) =>
      item.id === req.params.requestId &&
      item.to === req.user.id &&
      item.status === "pending"
  );

  if (!request) {
    return res.status(404).json({
      error: "Friend request not found",
    });
  }

  request.status = "accepted";
  saveDatabase();

  notifyUser(request.from, {
    type: "friend_accepted",
    message: "Your friend request was accepted",
  });

  res.json({
    message: "Friend request accepted",
  });
});

/* PRIVATE MESSAGES */

app.get("/api/messages/:userId", auth, (req, res) => {
  const messages = db.messages
    .filter(
      (message) =>
        (message.from === req.user.id &&
          message.to === req.params.userId) ||
        (message.from === req.params.userId &&
          message.to === req.user.id)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  res.json({ messages });
});

app.post("/api/messages/:userId", auth, (req, res) => {
  const { content, image } = req.body;

  if (!content && !image) {
    return res.status(400).json({
      error: "Message cannot be empty",
    });
  }

  const receiver = db.users.find(
    (user) => user.id === req.params.userId
  );

  if (!receiver) {
    return res.status(404).json({
      error: "Receiver not found",
    });
  }

  const message = {
    id: uuid(),
    from: req.user.id,
    to: receiver.id,
    content: content || "",
    image: image || "",
    createdAt: new Date().toISOString(),
  };

  db.messages.push(message);
  saveDatabase();

  io.to(`user:${receiver.id}`).emit("privateMessage", message);
  io.to(`user:${req.user.id}`).emit("privateMessage", message);

  res.status(201).json({
    message,
  });
});

/* NOTIFICATIONS */

app.get("/api/notifications", auth, (req, res) => {
  const notifications = db.notifications
    .filter((notification) => notification.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ notifications });
});

/* SOCKET.IO */

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid socket authentication"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.user.id;

  socket.join(`user:${userId}`);

  console.log(`User connected: ${userId}`);

  socket.emit("connected", {
    message: "Connected to SEXCITES.COM",
  });

  socket.on("joinPrivateRoom", ({ userId: otherUserId }) => {
    const roomId = [userId, otherUserId].sort().join(":");
    socket.join(`private:${roomId}`);
  });

  socket.on("typing", ({ receiverId }) => {
    io.to(`user:${receiverId}`).emit("typing", {
      userId,
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${userId}`);
  });
});

/* SPA FALLBACK */

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* START SERVER */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SEXCITES.COM running on port ${PORT}`);
});
