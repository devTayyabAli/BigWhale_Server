const express = require("express");
const router = express.Router();
const { uploadMedia } = require("../utils/uploadMedia.utils");
const SupportTicketsController = require("../controllers/supportTickets.controller");

router.get('/counts', SupportTicketsController.getTicketCounts);
router.get('/today', SupportTicketsController.getTodayCreatedTickets);
// Create Support Ticket with Media Upload
router.post("/", uploadMedia, SupportTicketsController.createSupportTicket);

// Get All, Get by ID, Update, Delete (no changes needed for these unless you want to add upload functionality)
router.get("/", SupportTicketsController.getAllSupportTickets);
router.get("/:userId", SupportTicketsController.getSupportTicketsByUserId);
router.get("/tickets/:id", SupportTicketsController.getSupportTicketById);
router.put("/:id", uploadMedia,SupportTicketsController.updateSupportTicket);
router.delete("/:id", SupportTicketsController.deleteSupportTicket);


module.exports = router;
