const mongoose = require("mongoose");

const connectDB = () => {
  const DB_URI = process.env.MONGO_DATABASE_BASE_URI;

  if (!DB_URI) {
    console.error("MONGO_DATABASE_BASE_URI is not set in environment variables");
    process.exit(1);
  }

  mongoose.connect(DB_URI, {
    // ── Connection pool ───────────────────────────────────────────
    maxPoolSize: 20,          // max concurrent connections (default 5 is too low)
    minPoolSize: 5,           // keep 5 connections warm
    // ── Timeouts ──────────────────────────────────────────────────
    serverSelectionTimeoutMS: 10000,  // fail fast if no server found
    socketTimeoutMS: 45000,           // close idle sockets after 45s
    connectTimeoutMS: 10000,          // connection attempt timeout
    // ── Heartbeat ─────────────────────────────────────────────────
    heartbeatFrequencyMS: 10000,      // check server health every 10s
    // ── Write concern ─────────────────────────────────────────────
    w: "majority",                    // wait for majority write acknowledgment
    // ── Auto-index (disable in production for performance) ────────
    autoIndex: process.env.APP_ENV !== "production",
  }).catch(err => {
    console.error("MongoDB initial connection error:", err.message);
    process.exit(1);
  });

  const dbConnection = mongoose.connection;

  dbConnection.once("open", async () => {
    console.log("✅ MongoDB connected");
    // Ensure all performance indexes exist on startup
    const { ensureIndexes } = require("./indexes");
    await ensureIndexes();
  });

  dbConnection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });

  dbConnection.on("disconnected", () => {
    console.warn("MongoDB disconnected — attempting reconnect...");
  });

  dbConnection.on("reconnected", () => {
    console.log("✅ MongoDB reconnected");
  });
};

module.exports = connectDB;
