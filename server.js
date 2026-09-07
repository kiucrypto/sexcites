const express=require("express");
const http=require("http");
const path=require("path");
const fs=require("fs");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const helmet=require("helmet");
const rateLimit=require("express-rate-limit");
const {Server}=require("socket.io");
const {randomUUID}=require("crypto");
const uuid=()=>randomUUID();

const app=express();
const server=http.createServer(app);
const io=new Server(server);
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||"CHANGE_THIS_SECRET_IN_RENDER";
const DB_FILE=path.join(__dirname,"database.json");

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"10mb"}));
app.use(express.urlencoded({extended:true,limit:"10mb"}));
app.use(rateLimit({windowMs:15*60*1000,max:300}));

function emptyDB(){return {users:[],posts:[],comments:[],likes:[],messages:[],friendRequests:[],notifications:[]};}
function loadDB(){try{return fs.existsSync(DB_FILE)?JSON.parse(fs.readFileSync(DB_FILE,"utf8")):emptyDB()}catch{return emptyDB()}}
let db=loadDB();
function save(){fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2))}
function safeUser(u){return {id:u.id,username:u.username,email:u.email,avatar:u.avatar||"",bio:u.bio||"",vip:!!u.vip,createdAt:u.createdAt}}
function token(u){return jwt.sign({id:u.id,email:u.email},JWT_SECRET,{expiresIn:"7d"})}
function auth(req,res,next){
  const h=req.headers.authorization;
  if(!h||!h.startsWith("Bearer "))return res.status(401).json({error:"Authentication required"});
  try{req.user=jwt.verify(h.slice(7),JWT_SECRET);next()}catch{return res.status(401).json({error:"Invalid or expired session"})}
}
function notify(userId,data){
  const n={id:uuid(),userId,...data,createdAt:new Date().toISOString()};
  db.notifications.push(n);save();io.to("user:"+userId).emit("notification",n);
}

app.get("/api/health",(req,res)=>res.json({online:true,name:"SEXCITES.COM"}));

app.post("/api/register",async(req,res)=>{
  const username=String(req.body.username||"").trim();
  const email=String(req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  if(username.length<3||username.length>30)return res.status(400).json({error:"Username must contain 3-30 characters"});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Invalid email"});
  if(password.length<8)return res.status(400).json({error:"Password must contain at least 8 characters"});
  if(db.users.some(u=>u.email===email))return res.status(409).json({error:"Email already registered"});
  if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:"Username already taken"});
  const u={id:uuid(),username,email,passwordHash:await bcrypt.hash(password,12),avatar:"",bio:"",vip:false,createdAt:new Date().toISOString()};
  db.users.push(u);save();
  res.status(201).json({token:token(u),user:safeUser(u)});
});

app.post("/api/login",async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  const u=db.users.find(x=>x.email===email);
  if(!u||!(await bcrypt.compare(password,u.passwordHash)))return res.status(401).json({error:"Invalid email or password"});
  res.json({token:token(u),user:safeUser(u)});
});

app.get("/api/me",auth,(req,res)=>{
  const u=db.users.find(x=>x.id===req.user.id);
  if(!u)return res.status(404).json({error:"User not found"});
  res.json({user:safeUser(u)});
});

app.get("/api/users",auth,(req,res)=>{
  res.json({users:db.users.filter(u=>u.id!==req.user.id).map(safeUser)});
});

app.get("/api/posts",auth,(req,res)=>{
  const posts=db.posts.map(p=>({
    ...p,
    author:safeUser(db.users.find(u=>u.id===p.userId)||{}),
    likes:db.likes.filter(l=>l.postId===p.id).length,
    likedByMe:db.likes.some(l=>l.postId===p.id&&l.userId===req.user.id),
    comments:db.comments.filter(c=>c.postId===p.id).map(c=>({...c,author:safeUser(db.users.find(u=>u.id===c.userId)||{})}))
  })).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  res.json({posts});
});

app.post("/api/posts",auth,(req,res)=>{
  const content=String(req.body.content||"").trim(), image=String(req.body.image||"");
  if(!content&&!image)return res.status(400).json({error:"Post cannot be empty"});
  const p={id:uuid(),userId:req.user.id,content,image,createdAt:new Date().toISOString()};
  db.posts.push(p);save();io.emit("newPost",p);res.status(201).json({post:p});
});

app.post("/api/posts/:id/like",auth,(req,res)=>{
  const exists=db.likes.find(l=>l.postId===req.params.id&&l.userId===req.user.id);
  if(exists)db.likes=db.likes.filter(l=>l.id!==exists.id);
  else db.likes.push({id:uuid(),postId:req.params.id,userId:req.user.id,createdAt:new Date().toISOString()});
  save();const likes=db.likes.filter(l=>l.postId===req.params.id).length;
  io.emit("postLikeUpdated",{postId:req.params.id,likes});
  res.json({liked:!exists,likes});
});

app.post("/api/posts/:id/comments",auth,(req,res)=>{
  const content=String(req.body.content||"").trim();
  if(!content)return res.status(400).json({error:"Comment cannot be empty"});
  const c={id:uuid(),postId:req.params.id,userId:req.user.id,content,createdAt:new Date().toISOString()};
  db.comments.push(c);save();io.emit("newComment",c);res.status(201).json({comment:c});
});

app.get("/api/messages/:userId",auth,(req,res)=>{
  res.json({messages:db.messages.filter(m=>(m.from===req.user.id&&m.to===req.params.userId)||(m.from===req.params.userId&&m.to===req.user.id)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))});
});

app.post("/api/messages/:userId",auth,(req,res)=>{
  const content=String(req.body.content||"").trim(),image=String(req.body.image||"");
  if(!content&&!image)return res.status(400).json({error:"Message cannot be empty"});
  const receiver=db.users.find(u=>u.id===req.params.userId);
  if(!receiver)return res.status(404).json({error:"User not found"});
  const m={id:uuid(),from:req.user.id,to:receiver.id,content,image,createdAt:new Date().toISOString()};
  db.messages.push(m);save();
  io.to("user:"+receiver.id).emit("privateMessage",m);
  io.to("user:"+req.user.id).emit("privateMessage",m);
  res.status(201).json({message:m});
});

app.post("/api/friends/request/:userId",auth,(req,res)=>{
  if(!db.users.some(u=>u.id===req.params.userId))return res.status(404).json({error:"User not found"});
  if(db.friendRequests.some(r=>r.from===req.user.id&&r.to===req.params.userId&&r.status==="pending"))return res.status(409).json({error:"Request already sent"});
  const r={id:uuid(),from:req.user.id,to:req.params.userId,status:"pending",createdAt:new Date().toISOString()};
  db.friendRequests.push(r);save();notify(req.params.userId,{type:"friend_request",from:req.user.id,message:"New friend request"});res.status(201).json({request:r});
});

app.get("/api/friends/requests",auth,(req,res)=>{
  res.json({requests:db.friendRequests.filter(r=>r.to===req.user.id&&r.status==="pending").map(r=>({...r,user:safeUser(db.users.find(u=>u.id===r.from)||{})}))});
});

app.post("/api/friends/:id/accept",auth,(req,res)=>{
  const r=db.friendRequests.find(x=>x.id===req.params.id&&x.to===req.user.id&&x.status==="pending");
  if(!r)return res.status(404).json({error:"Request not found"});
  r.status="accepted";save();notify(r.from,{type:"friend_accepted",message:"Friend request accepted"});res.json({success:true});
});

app.get("/api/notifications",auth,(req,res)=>{
  res.json({notifications:db.notifications.filter(n=>n.userId===req.user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});
});

io.use((socket,next)=>{
  try{socket.user=jwt.verify(socket.handshake.auth.token,JWT_SECRET);next()}catch{next(new Error("Unauthorized"))}
});
io.on("connection",socket=>{
  socket.join("user:"+socket.user.id);
  socket.emit("connected",{message:"Connected to SEXCITES.COM"});
  socket.on("typing",data=>{if(data&&data.receiverId)io.to("user:"+data.receiverId).emit("typing",{userId:socket.user.id})});
});

app.get("/",(req,res)=>res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SEXCITES.COM</title><style>body{margin:0;background:radial-gradient(circle at 20% 20%,#632b75,#090817 45%,#02030b);color:white;font-family:Arial;min-height:100vh;display:grid;place-items:center}main{padding:45px;text-align:center;background:#ffffff12;border:1px solid #ffffff25;border-radius:25px;backdrop-filter:blur(18px);box-shadow:0 0 80px #ff28c855}h1{font-size:48px;color:#ff66d9;text-shadow:0 0 25px #ff22bb}p{color:#ddd}code{color:#63e6ff}</style></head><body><main><h1>SEXCITES.COM</h1><p>Private social dating community for adults.</p><p>Server is online and operational.</p><code>API: /api/health</code></main></body></html>`));
app.use((req,res)=>res.status(404).json({error:"Route not found"}));

server.listen(PORT,"0.0.0.0",()=>console.log("SEXCITES.COM running on port "+PORT));
