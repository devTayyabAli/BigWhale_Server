const multer = require("multer");

const profileImgStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, `${__dirname}/../uploads/images`);
  },
  filename(req, file, cb) {
    const ext = file.originalname.split(".");
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `user-${uniqueSuffix}.${ext[ext.length - 1]}`);
  },
});

const uploadProfileImage = multer({ storage: profileImgStorage }).single("profilePicture")
module.exports = {
  uploadProfileImage,
};
