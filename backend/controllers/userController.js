const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

const getUsers = async (req, res) => {
  try {
    const usersResult = await query(
      `SELECT id, national_id, first_name, last_name, email, phone_number, role, 
              is_active, created_at, updated_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      users: usersResult.rows
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

const createUser = async (req, res) => {
  try {
    const { national_id, first_name, last_name, email, phone_number, role, password } = req.body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password || 'default123', 12);

    const newUser = await query(
      `INSERT INTO users (national_id, first_name, last_name, email, phone_number, password_hash, role) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, national_id, first_name, last_name, email, phone_number, role, is_active, created_at`,
      [national_id, first_name, last_name, email, phone_number, hashedPassword, role]
    );

    res.json({
      success: true,
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

module.exports = {
  getUsers,
  createUser
};