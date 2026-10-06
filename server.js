const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const db = require("./database");
const sanitize = require("sanitize-filename");
const AdmZip = require("adm-zip");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const COOKIE_SECRET =
  process.env.COOKIE_SECRET || "change_this_to_a_random_string";
const MAX_FILE_SIZE =
  parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024 * 1024; // 2GB
const STORAGE_CAP =
  parseInt(process.env.STORAGE_CAP) || 10 * 1024 * 1024 * 1024; // 10GB
const AUTO_EXPIRE_HOURS = parseFloat(process.env.AUTO_EXPIRE_HOURS) || 0;
const BLOCKED_EXTENSIONS = (
  process.env.BLOCKED_EXTENSIONS || ".exe,.bat,.sh,.cmd"
)
  .split(",")
  .map((e) => e.trim().toLowerCase());

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});
app.use("/api", limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts.",
});

// Auth Middleware
const authMiddleware = (req, res, next) => {
  if (!APP_PASSWORD) return next();
  if (req.path === "/login" || req.path === "/health") return next();
  const token = req.signedCookies.auth_token;
  if (token === "authenticated") return next();
  res.status(401).json({ error: "Unauthorized" });
};

// Storage configuration
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Check Storage Cap
const checkStorageCap = (req, res, next) => {
  const total = db
    .getAll()
    .reduce(
      (sum, item) => (item.type === "file" ? sum + (item.size || 0) : sum),
      0,
    );
  if (total >= STORAGE_CAP) {
    return res.status(507).json({ error: "Storage cap exceeded." });
  }
  next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return cb(new Error("File type not allowed"));
    }
    cb(null, true);
  },
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/api", authMiddleware);

// API Routes
app.post("/api/login", loginLimiter, (req, res) => {
  const { password } = req.body;
  if (password === APP_PASSWORD) {
    res.cookie("auth_token", "authenticated", {
      httpOnly: true,
      signed: true,
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    authRequired: !!APP_PASSWORD,
    authenticated: req.signedCookies.auth_token === "authenticated",
  }),
);

app.post("/api/items/text", (req, res) => {
  const { content, room, deviceName } = req.body;
  if (!content) return res.status(400).json({ error: "Content required" });
  const item = {
    id: uuidv4(),
    type: "text",
    room: room || "public",
    content,
    filename: null,
    original_filename: null,
    mime_type: null,
    size: null,
    device_name: deviceName || "Unknown Device",
    created_at: Date.now(),
  };
  insertItem(item);
  io.to(item.room).emit("item:created", item);
  res.json(item);
});

app.post(
  "/api/items/file",
  checkStorageCap,
  upload.array("files"),
  (req, res) => {
    const room = req.body.room || "public";
    const deviceName = req.body.deviceName || "Unknown Device";
    const items = [];

    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: "No files uploaded" });

    for (const file of req.files) {
      const item = {
        id: uuidv4(),
        type: "file",
        room,
        content: null,
        filename: file.filename,
        original_filename: sanitize(file.originalname),
        mime_type: file.mimetype,
        size: file.size,
        device_name: deviceName,
        created_at: Date.now(),
      };
      insertItem(item);
      items.push(item);
      io.to(room).emit("item:created", item);
    }
    res.json(items);
  },
);

app.get("/api/items", (req, res) => {
  const room = req.query.room || "public";
  const type = req.query.type;
  const q = req.query.q;

  let items = db.getAll().filter((i) => i.room === room);

  if (type && type !== "all") {
    if (type === "documents") {
      items = items.filter(
        (i) =>
          i.type === "file" &&
          (i.mime_type.includes("pdf") || i.mime_type.includes("doc")),
      );
    } else if (type === "images") {
      items = items.filter(
        (i) => i.type === "file" && i.mime_type.startsWith("image/"),
      );
    } else if (type === "videos") {
      items = items.filter(
        (i) => i.type === "file" && i.mime_type.startsWith("video/"),
      );
    } else if (type === "text") {
      items = items.filter((i) => i.type === "text");
    } else {
      items = items.filter(
        (i) =>
          i.type === "file" &&
          !i.mime_type.startsWith("image/") &&
          !i.mime_type.startsWith("video/") &&
          !i.mime_type.includes("pdf"),
      );
    }
  }
  if (q) {
    const qLower = q.toLowerCase();
    items = items.filter(
      (i) =>
        (i.content && i.content.toLowerCase().includes(qLower)) ||
        (i.original_filename &&
          i.original_filename.toLowerCase().includes(qLower)),
    );
  }

  items.sort((a, b) => b.created_at - a.created_at);
  res.json(items);
});

app.get("/api/items/:id/download", (req, res) => {
  const item = db.getById(req.params.id);
  if (!item || item.type !== "file") return res.status(404).send("Not found");

  const filePath = path.join(uploadsDir, item.filename);
  if (!fs.existsSync(filePath))
    return res.status(404).send("File missing on disk");

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(item.original_filename)}"`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", item.mime_type || "application/octet-stream");

  res.sendFile(filePath);
});

app.get("/api/items/:id/stream", (req, res) => {
  const item = db.getById(req.params.id);
  if (!item || item.type !== "file") return res.status(404).send("Not found");

  const filePath = path.join(uploadsDir, item.filename);
  if (!fs.existsSync(filePath))
    return res.status(404).send("File missing on disk");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", item.mime_type || "application/octet-stream");

  // Basic range support for video/audio seeking
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (start >= fileSize) {
      res
        .status(416)
        .send("Requested range not satisfiable\\n" + start + " >= " + fileSize);
      return;
    }
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": item.mime_type,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": item.mime_type,
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

app.delete("/api/items/:id", (req, res) => {
  const item = db.getById(req.params.id);
  if (item) {
    deleteItem(item);
    io.to(item.room).emit("item:deleted", item.id);
  }
  res.json({ success: true });
});

app.delete("/api/items", (req, res) => {
  const room = req.query.room || "public";
  const items = db.getAll().filter((i) => i.room === room);
  items.forEach(deleteItem);
  io.to(room).emit("room:cleared");
  res.json({ success: true });
});

app.get("/api/download-all", (req, res) => {
  const room = req.query.room || "public";
  const items = db.getAll().filter((i) => i.room === room && i.type === "file");
  const zip = new AdmZip();
  let added = 0;
  items.forEach((item) => {
    const filePath = path.join(uploadsDir, item.filename);
    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath, "", item.original_filename);
      added++;
    }
  });
  if (added === 0) return res.status(404).send("No files to download");

  const zipBuffer = zip.toBuffer();
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="easyshare_${room}.zip"`,
  );
  res.setHeader("Content-Type", "application/zip");
  res.send(zipBuffer);
});

// Catch-all for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Helper Functions
function insertItem(item) {
  db.insert(item);
}

function deleteItem(item) {
  db.delete(item.id);
  if (item.type === "file" && item.filename) {
    const filePath = path.join(uploadsDir, item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// Housekeeping
if (AUTO_EXPIRE_HOURS > 0) {
  setInterval(
    () => {
      const cutoff = Date.now() - AUTO_EXPIRE_HOURS * 60 * 60 * 1000;
      const expired = db.getAll().filter((i) => i.created_at < cutoff);
      expired.forEach((item) => {
        deleteItem(item);
        io.to(item.room).emit("item:deleted", item.id);
      });
    },
    15 * 60 * 1000,
  ); // Check every 15 minutes
}

// WebSocket
const roomCounts = {};
io.on("connection", (socket) => {
  let currentRoom = "public";

  socket.on("join", (room) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      roomCounts[currentRoom] = Math.max(0, (roomCounts[currentRoom] || 1) - 1);
      io.to(currentRoom).emit("presence:update", roomCounts[currentRoom]);
    }
    currentRoom = room || "public";
    socket.join(currentRoom);
    roomCounts[currentRoom] = (roomCounts[currentRoom] || 0) + 1;
    io.to(currentRoom).emit("presence:update", roomCounts[currentRoom]);
  });

  socket.on("disconnect", () => {
    if (currentRoom) {
      roomCounts[currentRoom] = Math.max(0, (roomCounts[currentRoom] || 1) - 1);
      io.to(currentRoom).emit("presence:update", roomCounts[currentRoom]);
    }
  });
});

const getLocalIp = () => {
  const os = require("os");
  const ifaces = os.networkInterfaces();
  for (const dev in ifaces) {
    const iface = ifaces[dev].filter(
      (details) => details.family === "IPv4" && details.internal === false,
    );
    if (iface.length > 0) return iface[0].address;
  }
  return "localhost";
};

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Universal Share app running!`);
  console.log(`- Local:   http://localhost:${PORT}`);
  console.log(`- Network: http://${getLocalIp()}:${PORT}`);
});
