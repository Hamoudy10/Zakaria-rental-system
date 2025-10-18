const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Login controller
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const userQuery = `
      SELECT id, national_id, first_name, last_name, email, phone_number, 
             password_hash, role, is_active, created_at
      FROM users 
      WHERE email = $1 AND is_active = true
    `;
    
    const { rows } = await pool.query(userQuery, [email]);
    
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user.id, user.role);

    // Remove password from response
    const { password_hash, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

// Register controller
const register = async (req, res) => {
  try {
    const { 
      national_id, 
      first_name, 
      last_name, 
      email, 
      phone_number, 
      password, 
      role 
    } = req.body;

    // Validate required fields
    if (!national_id || !first_name || !last_name || !email || !phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already exists
    const existingUserQuery = `
      SELECT id FROM users WHERE email = $1 OR national_id = $2 OR phone_number = $3
    `;
    const existingUser = await pool.query(existingUserQuery, [email, national_id, phone_number]);
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email, national ID, or phone number already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const insertQuery = `
      INSERT INTO users (
        national_id, first_name, last_name, email, phone_number, 
        password_hash, role, is_active
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, created_at
    `;

    const userRole = role || 'tenant'; // Default to tenant if not specified
    
    const { rows } = await pool.query(insertQuery, [
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      hashedPassword,
      userRole,
      true
    ]);

    const newUser = rows[0];
    const token = generateToken(newUser.id, newUser.role);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: newUser,
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

// Get current user
const getCurrentUser = async (req, res) => {
  try {
    const userQuery = `
      SELECT id, national_id, first_name, last_name, email, phone_number, 
             role, is_active, created_at, updated_at
      FROM users 
      WHERE id = $1
    `;
    
    const { rows } = await pool.query(userQuery, [req.user.userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: rows[0]
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Logout controller
const logout = async (req, res) => {
  // Since we're using JWT, we can't invalidate the token on the server
  // The frontend should remove the token from storage
  res.status(200).json({
    success: true,
    message: 'Logout successful'
  });
};

module.exports = {
  login,
  register,
  getCurrentUser,
  logout
};