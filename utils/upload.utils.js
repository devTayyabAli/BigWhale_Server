const multer = require("multer");
const fs = require("fs");
const path = require("path");

const profileImgStorage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads/images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const ext = file.originalname.split(".");
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `user-${uniqueSuffix}.${ext[ext.length - 1]}`);
  },
});

const uploadProfileImage = multer({
  storage: profileImgStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
}).single("profilePicture");

module.exports = {
  uploadProfileImage,
};
