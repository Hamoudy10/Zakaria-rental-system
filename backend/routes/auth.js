// routes/auth.js - UPDATED WITH PROFILE IMAGE UPLOAD AND PASSWORD CHANGE
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const authMiddleware = require('../middleware/authMiddleware').authMiddleware;
const { uploadProfileImage, deleteCloudinaryImage } = require('../middleware/uploadMiddleware');
const { sendPasswordResetEmail } = require('../services/emailService');
const JWT_SECRET = process.env.JWT_SECRET;
const RESET_TOKEN_EXPIRY_MINUTES = Number(process.env.RESET_TOKEN_EXPIRY_MINUTES || 60);
const FRONTEND_URL =
  process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';

if (!JWT_SECRET) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

console.log('✅ AUTH ROUTES LOADED');

const validatePasswordStrength = (password) => {
  if (password.length < 6) {
    return 'New password must be at least 6 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'New password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'New password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'New password must contain at least one number';
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'New password must contain at least one special character (!@#$%^&*)';
  }
  return null;
};

// Token verification endpoint
router.get('/verify-token', authMiddleware, (req, res) => {
  console.log('✅ Token verification successful for user:', req.user.id);
  
  res.json({
    success: true,
    user: {
      id: req.user.id,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      email: req.user.email,
      role: req.user.role,
      phone_number: req.user.phone_number,
      profile_image: req.user.profile_image,
      created_at: req.user.created_at
    }
  });
});

// Register user
const register = async (req, res) => {
  try {
    console.log('📝 Register endpoint called');
    const { national_id, first_name, last_name, email, phone_number, password, role } = req.body;

    // Basic validation
    if (!national_id || !first_name || !last_name || !email || !phone_number || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    const query = `
      INSERT INTO users (national_id, first_name, last_name, email, phone_number, password_hash, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, profile_image, created_at
    `;
    
    const result = await db.query(query, [
      national_id, first_name, last_name, email, phone_number, password_hash, role
    ]);

    const user = result.rows[0];

    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        national_id: user.national_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        profile_image: user.profile_image
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'User with this email or national ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error during registration: ' + error.message
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    console.log('🔐 Login endpoint called');
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const query = `
      SELECT id, national_id, first_name, last_name, email, phone_number, password_hash, role, profile_image, is_active, created_at
      FROM users 
      WHERE email = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const user = result.rows[0];
    
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    console.log(`✅ Login successful for user: ${user.email} (${user.role})`);
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        national_id: user.national_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        profile_image: user.profile_image,
        is_active: user.is_active,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login: ' + error.message
    });
  }
};

// Get user profile (protected route)
const getProfile = async (req, res) => {
  try {
    console.log('👤 GetProfile endpoint called for user:', req.user.id);
    
    // Fetch fresh user data from database to include profile_image
    const result = await db.query(
      `SELECT id, national_id, first_name, last_name, email, phone_number, role, profile_image, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = result.rows[0];
    
    res.json({
      success: true,
      user: {
        id: user.id,
        national_id: user.national_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        profile_image: user.profile_image,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile: ' + error.message
    });
  }
};

// Update user profile (with optional image upload)
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📝 Updating profile for user:', userId);
    console.log('📁 Uploaded file:', req.file);
    console.log('📄 Body data:', req.body);

    const { first_name, last_name, email, phone_number } = req.body;
    
    // Get current user data (to check for existing profile image)
    const currentUser = await db.query(
      'SELECT profile_image FROM users WHERE id = $1',
      [userId]
    );
    
    const oldProfileImage = currentUser.rows[0]?.profile_image;
    
    // Determine new profile image URL
    let profileImageUrl = oldProfileImage; // Keep existing by default
    
    if (req.file && req.file.path) {
      profileImageUrl = req.file.path; // New Cloudinary URL
      
      // Delete old image from Cloudinary if it exists
      if (oldProfileImage) {
        await deleteCloudinaryImage(oldProfileImage);
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(last_name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (phone_number !== undefined) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phone_number);
    }
    if (profileImageUrl !== oldProfileImage) {
      updates.push(`profile_image = $${paramCount++}`);
      values.push(profileImageUrl);
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);
    
    // Add user ID as final parameter
    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, profile_image, is_active, created_at, updated_at
    `;

    console.log('🔄 Update query:', query);
    console.log('🔄 Values:', values);

    const result = await db.query(query, values);
    const updatedUser = result.rows[0];

    console.log('✅ Profile updated successfully:', updatedUser);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Email already in use by another account'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error updating profile: ' + error.message
    });
  }
};

// Delete profile image
const deleteProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('🗑️ Deleting profile image for user:', userId);

    // Get current profile image
    const currentUser = await db.query(
      'SELECT profile_image FROM users WHERE id = $1',
      [userId]
    );

    const currentImage = currentUser.rows[0]?.profile_image;

    if (!currentImage) {
      return res.status(400).json({
        success: false,
        message: 'No profile image to delete'
      });
    }

    // Delete from Cloudinary
    await deleteCloudinaryImage(currentImage);

    // Update database
    const result = await db.query(
      `UPDATE users SET profile_image = NULL, updated_at = NOW() WHERE id = $1
       RETURNING id, national_id, first_name, last_name, email, phone_number, role, profile_image, is_active, created_at, updated_at`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Profile image deleted successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Delete profile image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting profile image: ' + error.message
    });
  }
};

// ==================== CHANGE PASSWORD ====================
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    console.log('🔑 Changing password for user:', userId);

    // Validate required fields
    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const passwordError = validatePasswordStrength(new_password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError
      });
    }

    // Get current password hash from database
    const userResult = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentHashedPassword = userResult.rows[0].password_hash;

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(current_password, currentHashedPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check that new password is different from current
    const isSamePassword = await bcrypt.compare(new_password, currentHashedPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newHashedPassword = await bcrypt.hash(new_password, saltRounds);

    // Update password in database
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHashedPassword, userId]
    );

    console.log('✅ Password changed successfully for user:', userId);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error changing password: ' + error.message
    });
  }
};

// ==================== FORGOT / RESET PASSWORD ====================
const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const genericResponse = {
      success: true,
      message:
        'If an account with that email exists, a password reset link has been sent.'
    };

    const userResult = await db.query(
      `SELECT id, first_name, email
       FROM users
       WHERE email = $1 AND is_active = true
       LIMIT 1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.json(genericResponse);
    }

    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await db.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({
        toEmail: user.email,
        firstName: user.first_name,
        resetUrl,
        expiresMinutes: RESET_TOKEN_EXPIRY_MINUTES
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
    }

    return res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing forgot password request'
    });
  }
};

const resetPassword = async (req, res) => {
  const client = await db.connect();

  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.new_password || '');

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token'
      });
    }

    const tokenRow = tokenResult.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await client.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, tokenRow.user_id]
    );

    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [tokenRow.user_id]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while resetting password'
    });
  } finally {
    client.release();
  }
};

// Debug login endpoint (for testing only)
router.post('/debug-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔍 DEBUG: Login attempt for:', email);
    
    const userResult = await db.query(
      'SELECT id, email, password_hash, first_name, last_name, role, profile_image FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.json({ 
        success: false, 
        message: 'User not found or inactive' 
      });
    }
    
    const user = userResult.rows[0];
    
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.json({ 
        success: false, 
        message: 'Invalid password' 
      });
    }
    
    const testToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({
      success: true,
      token: testToken,
      decoded: jwt.decode(testToken),
      user: { 
        id: user.id, 
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        profile_image: user.profile_image
      }
    });
    
  } catch (error) {
    console.error('❌ Debug login error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Set up routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/profile', authMiddleware, getProfile);

// Profile update with optional image upload
router.put('/profile', authMiddleware, uploadProfileImage, updateProfile);

// Delete profile image
router.delete('/profile/image', authMiddleware, deleteProfileImage);

// Change password route
router.put('/change-password', authMiddleware, changePassword);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ AUTH ROUTES SETUP COMPLETED');

module.exports = router;
