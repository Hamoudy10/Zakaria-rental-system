const express = require('express');
const { login, register, getCurrentUser, logout } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', protect, getCurrentUser);
router.post('/logout', protect, logout);

module.exports = router;