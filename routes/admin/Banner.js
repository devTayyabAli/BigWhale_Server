const express = require("express");
const router = express.Router();
const { uploadMedia } = require("../../utils/uploadMedia.utils");
const NewsBannerController = require("../../controllers/Banner.controller");

// Create news Banner with Media Upload
router.post("/", uploadMedia, NewsBannerController.createNewsBanner);

// Get All, Get by ID, Update, Delete (no changes needed for these unless you want to add upload functionality)
router.get("/", NewsBannerController.getNewsBanner);
router.delete("/:id", NewsBannerController.deletedNewsBanner);


module.exports = router;
