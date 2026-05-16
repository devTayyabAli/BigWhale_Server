require("dotenv").config();
const createError = require("http-errors");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const connectDB = require("./config/db");
const startCronJobs = require("./cron/index");
const indexRouter = require("./routes/index");
const fs = require("fs");
require('./seeders');

// ── Sentry (production only) ─────────────────────────────────────────
if (process.env.APP_ENV === 'production' && process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

const app = express();

// ── Database ─────────────────────────────────────────────────────────
connectDB();

// ── Cron Jobs ────────────────────────────────────────────────────────
startCronJobs();

// ── Security: trust proxy (needed for rate limiting behind nginx/load balancer)
app.set('trust proxy', 1);

// ── CORS ─────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_BASE_URL,
  process.env.FRONTEND_ADMIN_BASE_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
}));

// ── Security Headers ─────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Remove Express fingerprint
  res.removeHeader('X-Powered-By');
  next();
});

// ── Session ───────────────────────────────────────────────────────────
// SECURITY FIX: session secret was hardcoded as "cyberwolve"
// Now reads from environment variable with a fallback warning
if (!process.env.SESSION_SECRET && process.env.APP_ENV === 'production') {
  console.error('⚠️  SESSION_SECRET env var is not set — using insecure default');
}
app.use(session({
  secret: process.env.SESSION_SECRET || 'bw-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,  // PERF: don't save empty sessions
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.APP_ENV === 'production',
    sameSite: 'lax',
  },
}));

// ── Passport ─────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── View Engine ───────────────────────────────────────────────────────
app.set("view engine", "ejs");

// ── Request Logging ───────────────────────────────────────────────────
// Use 'combined' in production for full Apache-style logs, 'dev' in development
app.use(logger(process.env.APP_ENV === 'production' ? 'combined' : 'dev'));

// ── Body Parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// ── Static Files ──────────────────────────────────────────────────────
app.use(express.static('assets'));
app.use('/uploads/images/', express.static(path.join(__dirname, 'uploads', 'images'), {
  maxAge: '7d',       // Cache static images for 7 days
  etag: true,
}));
app.use('/uploads/media/', express.static(path.join(__dirname, 'uploads', 'media'), {
  maxAge: '7d',
  etag: true,
}));

// ── Image endpoint ────────────────────────────────────────────────────
app.get('/api/uploads/images/:imageName', (req, res) => {
  const { imageName } = req.params;
  // Sanitize: prevent path traversal attacks
  const safeName = path.basename(imageName);
  const imagePath = path.join(__dirname, 'uploads', 'images', safeName);
  if (fs.existsSync(imagePath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});

// ── API Routes ────────────────────────────────────────────────────────
app.use("/api", indexRouter);

// ── 404 Handler ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  next(createError(404));
});

// ── Global Error Handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const isDev  = req.app.get("env") === "development";

  // Never leak stack traces in production
  res.status(status).json({
    success: false,
    status,
    message: err.message || "Internal Server Error",
    ...(isDev && { stack: err.stack }),
  });
});

module.exports = app;
