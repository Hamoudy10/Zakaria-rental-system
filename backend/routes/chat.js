// backend/routes/chat.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authMiddleware } = require('../middleware/authMiddleware');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary storage for chat images
const chatImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'zakaria_rental/chat_images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }]
  }
});

const uploadChatImage = multer({
  storage: chatImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Apply auth middleware to all routes
router.use(authMiddleware);

// ===================== CONVERSATIONS =====================

// Get all conversations for user
router.get('/conversations', chatController.getUserConversations);

// Create new conversation
router.post('/conversations', chatController.createConversation);

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', chatController.getConversationMessages);

// ===================== RECENT CHATS =====================

// Get recent chats with last message info
router.get('/recent-chats', chatController.getRecentChats);

// ===================== MESSAGES =====================

// Send a message
router.post('/messages/send', chatController.sendMessage);

// Mark messages as read
router.post('/messages/mark-read', chatController.markAsRead);

// Mark messages as delivered
router.post('/messages/mark-delivered', chatController.markAsDelivered);

// ===================== SEARCH =====================

// Search messages
router.get('/search', chatController.searchMessages);

// ===================== USERS =====================

// Get available users for new chat
router.get('/available-users', chatController.getAvailableUsers);

// ===================== UNREAD COUNT =====================

// Get total unread count
router.get('/unread-count', chatController.getUnreadChats);

// ===================== ONLINE STATUS =====================

// Update online status
router.post('/status/online', chatController.updateOnlineStatus);

// Get list of online users
router.get('/status/online-users', chatController.getOnlineUsers);

// ===================== IMAGE UPLOAD =====================

// Upload chat image
router.post('/upload-image', uploadChatImage.single('image'), chatController.uploadChatImage);

module.exports = router;