const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Configure storage
const mediaStorage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads/media");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const ext = file.originalname.split(".");
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `media-${uniqueSuffix}.${ext[ext.length - 1]}`);
  },
});

// Multer instance to handle single or multiple file uploads from any field name (mediaFiles, image, etc.)
const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
}).any();

module.exports = {
  uploadMedia,
};
