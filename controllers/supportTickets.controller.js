const SupportTickets = require("../models/supportTickets.model");
const fs = require("fs");
const path = require("path");
const { sendCreateTicketEmail } = require("../helpers/mail");
const { EMAIL_SUBJECT } = require("../config/constants");
FILE_BASE_URL = "https://api.kgc.world/uploads/media"
class SupportTicketsController {
    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to create a new support ticket
     */
    static async createSupportTicket(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            const { userId, subject, description, priority, status, email } = req.body;

            // Check if multer processed any files
            if (!req.files || req.files.length === 0) {
                throw new Error("No media files uploaded. Please ensure you are sending files correctly.");
            }

            // Generate URLs for the uploaded files
            const baseUrl = FILE_BASE_URL;
            const mediaFiles = req.files.map(file => ({
                name: file.filename,
                size: file.size,
                type: file.mimetype.startsWith("image") ? "image" : "video",
                url: `${baseUrl}/${file.filename}`,
            }));

            // Validate number of files
            if (req.files.length > 4) {
                response.message = "Too many files uploaded. Maximum allowed is 4.";
                response.status = 400;
                return res.status(response.status).json(response);
            }

            // Validate each file size (assuming `multer` has already enforced the limits)
            const maxSizeInMB = 50;
            req.files.forEach(file => {
                const fileSizeInMB = file.size / (1024 * 1024);
                if (fileSizeInMB > maxSizeInMB) {
                    response.message = `File size exceeds the 50 MB limit for file: ${file.originalname}.`;
                    response.status = 400;
                    return res.status(response.status).json(response);
                }
            });

            const newTicket = new SupportTickets({
                userId,
                subject,
                description,
                priority,
                status,
                picturesOrVideos: mediaFiles,
            });

            await newTicket.save();
            const mailsubject = EMAIL_SUBJECT.CREATE_TICKET
            const body = ` <p>Thank you for creating a support ticket. Our support team will respond as soon as possible. When our team starts working on your ticket, you will receive an email, and your ticket status will be updated to <b>In Progress</b></p>
       <p> Once your ticket is completed, you will receive another email, and the ticket status will be updated to <b>Completed</b>.</p>`

            sendCreateTicketEmail(email, body, mailsubject)
            response = {
                success: true,
                message: "Support ticket created successfully",
                data: newTicket,
                status: 201,
            };
        } catch (error) {
            console.error("Create Support Ticket Error: ", error);

            // Handle specific errors from Multer
            if (error.message.includes("LIMIT_FILE_SIZE")) {
                response.message = "One of the files is too large. Maximum file size is 50 MB.";
                response.status = 400;
            } else if (error.message.includes("LIMIT_UNEXPECTED_FILE")) {
                response.message = "Too many files uploaded. Maximum allowed is 4.";
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
    static async getAllSupportTickets(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            const tickets = await SupportTickets.find().populate("userId", "name userName");
            response = {
                success: true,
                message: "Support tickets fetched successfully",
                data: tickets,
                status: 200,
            };
        } catch (error) {
            console.error("Get All Support Tickets Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }

    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to get a single support ticket by ID
     */
    static async getSupportTicketById(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            console.log("req.params", req.params)
            const ticket = await SupportTickets.findById(req.params.id).populate("userId", "name userName email profilePicture");
            if (!ticket) {
                response.message = "Support ticket not found";
                response.status = 404;
            } else {
                response = {
                    success: true,
                    message: "Support ticket fetched successfully",
                    data: ticket,
                    status: 200,
                };
            }
        } catch (error) {
            console.error("Get Support Ticket By ID Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }


    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to get a single support ticket by User ID
     */
    static async getSupportTicketsByUserId(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            // Fetch tickets for the given userId from the request parameters
            const userId = req.params.userId;
            const tickets = await SupportTickets.find({ userId }).populate("userId", "name userName");

            if (tickets.length === 0) {
                response.message = "No support tickets found for this user";
                response.status = 404;
            } else {
                response = {
                    success: true,
                    message: "Support tickets fetched successfully",
                    data: tickets,
                    status: 200,
                };
            }
        } catch (error) {
            console.error("Get Support Tickets By User ID Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }


    /**
     * @param req request body
     * @param res callback response object
     * @description This method is to update a support ticket by ID
     */
    static async updateSupportTicket(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            const { userId, subject, description, priority, status, email } = req.body;
            const ticketId = req.params.id;

            // Fetch the existing support ticket
            const existingTicket = await SupportTickets.findById(ticketId);
            if (!existingTicket) {
                response.message = "Support ticket not found";
                response.status = 404;
                return res.status(response.status).json(response);
            }

            // Prepare updated media files
            let mediaFiles = existingTicket.picturesOrVideos || []; // Use existing files as default
            const baseUrl = FILE_BASE_URL;

            // If files are uploaded, handle them
            if (req.files && req.files.length > 0) {
                const newMediaFiles = req.files.map(file => ({
                    name: file.filename,
                    size: file.size,
                    type: file.mimetype.startsWith("image") ? "image" : "video",
                    url: `${baseUrl}/${file.filename}`,
                }));
                mediaFiles = [...mediaFiles, ...newMediaFiles]; // Combine existing and new files
            }




            // Update the ticket with new values
            const updatedTicket = await SupportTickets.findByIdAndUpdate(
                ticketId,
                {
                    userId,
                    subject,
                    description,
                    priority,
                    status,
                    picturesOrVideos: mediaFiles,
                },
                { new: true, runValidators: true }
            );

            if (status == "Pending") {
                const mailsubject = EMAIL_SUBJECT.INPROGRESS_TICKET
                const body = `The support team has started working on your ticket. They will aim to resolve your issue within one or two business days, and your ticket status will be updated to <b>In Progress</b>.</p>

<p>Once your ticket is completed, you will receive another email, and the ticket status will be updated to <b>Completed</b>.</p>`

                sendCreateTicketEmail(email, body, mailsubject)
            }
            if (status == "Completed") {
                const mailsubject = EMAIL_SUBJECT.COMPLETE_TICKET
                const body = `<p>Our support team has resolved your issue, and your ticket is now completed. The ticket status has been updated to <b>Completed</b>. Please review the issue yourself.</p>`

                sendCreateTicketEmail(email, body, mailsubject)

            }


            response = {
                success: true,
                message: "Support ticket updated successfully",
                data: updatedTicket,
                status: 200,
            };
        } catch (error) {
            console.error("Update Support Ticket Error: ", error);
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
    static async deleteSupportTicket(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            // Find the support ticket to get the media files
            const ticketId = req.params.id;
            const deletedTicket = await SupportTickets.findById(ticketId);

            if (!deletedTicket) {
                response.message = "Support ticket not found";
                response.status = 404;
                return res.status(response.status).json(response);
            }

            // Delete media files from the server
            const mediaFiles = deletedTicket.picturesOrVideos || [];
            mediaFiles.forEach(file => {
                const filePath = path.join(__dirname, "../uploads/media", file.url.split('/').pop()); // Extract filename from URL
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath); // Delete the file
                }
            });

            // Now delete the ticket
            let deleteTicketRes = await SupportTickets.findByIdAndDelete(ticketId);

            response = {
                success: true,
                message: "Support ticket and associated media files deleted successfully",
                data: deleteTicketRes,
                status: 200,
            };
        } catch (error) {
            console.error("Delete Support Ticket Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }



    /**
    * @param req request body
    * @param res callback response object
    * @description This method returns the count of different status tickets
    */
    static async getTicketCounts(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            const totalCompletedTickets = await SupportTickets.countDocuments({ status: "Completed" });
            const totalTODOTickets = await SupportTickets.countDocuments({ status: "ToDo" });
            const totalInProgressTickets = await SupportTickets.countDocuments({ status: { $in: ["Pending", "Failed"] } });
            const allTickets = await SupportTickets.countDocuments();

            response = {
                success: true,
                message: "Ticket counts fetched successfully",
                data: {
                    totalCompletedTickets,
                    totalTODOTickets,
                    totalInProgressTickets,
                    allTickets,
                },
                status: 200,
            };
        } catch (error) {
            console.error("Get Ticket Counts Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }


    /**
    * @param req request body
    * @param res callback response object
    * @description This method returns today's created tickets
    */
    static async getTodayCreatedTickets(req, res) {
        let response = {
            success: false,
            message: "Something went wrong",
            data: {},
            status: 400,
        };

        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const todayTickets = await SupportTickets.find({ createdAt: { $gte: startOfDay } }).populate("userId", "name userName");;

            response = {
                success: true,
                message: "Today's tickets fetched successfully",
                data: todayTickets,
                status: 200,
            };
        } catch (error) {
            console.error("Get Today's Tickets Error: ", error);
            response.message = error.message || "An internal server error occurred";
            response.status = 500;
        } finally {
            return res.status(response.status).json(response);
        }
    }
}

module.exports = SupportTicketsController;
