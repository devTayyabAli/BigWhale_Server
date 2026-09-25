
const fs = require("fs");
const path = require("path");
const NewsUpdates = require("../models/banner.model");
function getFileBaseUrl(req) {
    if (process.env.MEDIA_BASE_URL) return process.env.MEDIA_BASE_URL;
    if (process.env.BASE_URL) return `${process.env.BASE_URL}/uploads/media`;
    if (req && req.protocol && req.get("host")) {
        return `${req.protocol}://${req.get("host")}/uploads/media`;
    }
    return "https://api.bwscan.io/uploads/media";
}

class NewsBannerController {
    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to create or update news banner
     */
    static async createNewsBanner(req, res) {
    let response = {
        success: false,
        message: "Something went wrong",
        data: {},
        status: 400,
    };

    try {
        // Check if multer processed any files
        if (!req.files || req.files.length === 0) {
            response.message = "No media files uploaded. Please ensure you are sending files correctly.";
            return res.status(response.status).json(response);
        }

        // We only expect one file per banner entry
        if (req.files.length > 1) {
            response.message = "Too many files uploaded. Only one banner image is allowed per upload.";
            response.status = 400;
            return res.status(response.status).json(response);
        }

        // Validate file size
        const file = req.files[0];
        const maxSizeInMB = 50;
        const fileSizeInMB = file.size / (1024 * 1024);

        if (fileSizeInMB > maxSizeInMB) {
            response.message = `File size exceeds the 50 MB limit for file: ${file.originalname}.`;
            response.status = 400;
            return res.status(response.status).json(response);
        }

        // Generate URL for the uploaded file
        const baseUrl = getFileBaseUrl(req);
        const mediaFiles = [{
            name: file.filename,
            size: file.size,
            url: `${baseUrl}/${file.filename}`,
        }];

        const title = req.body?.title || "";
        const bannerPayload = {
            picture: mediaFiles,
            ...(title ? { title } : {}),
        };

        let resultBanner;
        if (req.body?.id || req.body?._id) {
            resultBanner = await NewsUpdates.findByIdAndUpdate(
                req.body.id || req.body._id,
                bannerPayload,
                { new: true }
            );
        } else {
            resultBanner = await NewsUpdates.create(bannerPayload);
        }

        response = {
            success: true,
            message: "News Banner saved successfully",
            data: resultBanner,
            status: 200,
        };

    } catch (error) {
        console.error("Create/Update News Banner Error: ", error);

        // Handle specific errors from Multer
        if (error.code === "LIMIT_FILE_SIZE") {
            response.message = "The file is too large. Maximum file size is 50 MB.";
            response.status = 400;
        } else {
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        }
    } finally {
        return res.status(response.status).json(response);
    }
}


    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to get all support tickets
     */
    static async getNewsBanner(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            const tickets = await NewsUpdates.find().sort({ createdAt: -1 });
            response = {
                success: true,
                message: "News Banner fetched successfully",
                data: tickets,
                status: 200,
            };
        } catch (error) {
            console.error("Get News Banner Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }


    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to delete a support ticket by ID
     */
    static async deletedNewsBanner(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            // Find the News Banner to get the media files
            const bannerId = req.params.id;
            const deletedNewsBanner = await NewsUpdates.findById(bannerId);

            if (!deletedNewsBanner) {
                response.message = "News Banner not found";
                response.status = 404;
                return res.status(response.status).json(response);
            }

            // Delete media files from the server
            const mediaFiles = deletedNewsBanner.picture || [];
            mediaFiles.forEach(file => {
                const filePath = path.join(__dirname, "../uploads/media", file.url.split('/').pop()); // Extract filename from URL
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath); // Delete the file
                }
            });

            // Now delete the ticket
            let deleteTicketRes = await NewsUpdates.findByIdAndDelete(bannerId);

            response = {
                success: true,
                message: "News Banner and associated media files deleted successfully",
                data: deleteTicketRes,
                status: 200,
            };
        } catch (error) {
            console.error("Delete News Banner Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }


}

module.exports = NewsBannerController;
