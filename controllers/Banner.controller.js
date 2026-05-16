
const fs = require("fs");
const path = require("path");
const NewsUpdates = require("../models/banner.model");
FILE_BASE_URL = "https://api.kgc.world/uploads/media"
// FILE_BASE_URL = "http://localhost:8000/uploads/media"


class NewsBannerController {
    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to create a new support ticket
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

        // We only expect one file, so if more are uploaded, it's an error.
        if (req.files.length > 1) {
            response.message = "Too many files uploaded. Only one banner image is allowed.";
            response.status = 400;
            return res.status(response.status).json(response);
        }

        // Validate file size (assuming `multer` has already enforced the limits)
        const file = req.files[0];
        const maxSizeInMB = 50;
        const fileSizeInMB = file.size / (1024 * 1024);

        if (fileSizeInMB > maxSizeInMB) {
            response.message = `File size exceeds the 50 MB limit for file: ${file.originalname}.`;
            response.status = 400;
            return res.status(response.status).json(response);
        }

        // Generate URL for the uploaded file
        const baseUrl = FILE_BASE_URL; // Make sure FILE_BASE_URL is defined
        const mediaFiles = [{
            name: file.filename,
            size: file.size,
            url: `${baseUrl}/${file.filename}`,
        }];

        // Find and update the existing banner, or create a new one if it doesn't exist
        const filter = {}; // An empty filter will match the first document
        const update = { picture: mediaFiles };
        const options = {
            upsert: true, // Create a new document if one doesn't exist
            new: true, // Return the modified document rather than the original
            runValidators: true, // Ensure schema validators are run
        };

        const updatedBanner = await NewsUpdates.findOneAndUpdate(filter, update, options);

        response = {
            success: true,
            message: "News Banner updated successfully",
            data: updatedBanner,
            status: 200, // 200 OK since it could be an update
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
            const tickets = await NewsUpdates.find();
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
