const multer = require("multer");

// Configure storage
const mediaStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, `${__dirname}/../uploads/media`);
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
