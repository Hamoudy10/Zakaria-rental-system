const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware').authMiddleware;

// Apply auth middleware to all routes
router.use(authMiddleware);

// Conversation routes
router.get('/conversations', chatController.getUserConversations);
router.post('/conversations', chatController.createConversation);
router.get('/conversations/:conversationId/messages', chatController.getConversationMessages);

// Message routes
router.post('/messages/send', chatController.sendMessage);
router.post('/messages/mark-read', chatController.markAsRead);

// Search and user routes
router.get('/search', chatController.searchMessages);
router.get('/available-users', chatController.getAvailableUsers);

router.get('/unread-count', chatController.getUnreadChats);


module.exports = router;