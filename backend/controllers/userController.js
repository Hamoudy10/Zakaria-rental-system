// controllers/userController.js
const db = require('../config/database');
const bcrypt = require('bcryptjs');

const userController = {
  // Get all users (Admin only)
  getAllUsers: async (req, res) => {
    try {
      const { role, search } = req.query;
      let query = 'SELECT id, national_id, first_name, last_name, email, phone_number, role, is_active, created_at FROM users WHERE 1=1';
      const params = [];
      let paramCount = 0;

      if (role) {
        paramCount++;
        query += ` AND role = $${paramCount}`;
        params.push(role);
      }

      if (search) {
        paramCount++;
        query += ` AND (first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      query += ' ORDER BY created_at DESC';

      const result = await db.query(query, params);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  },

  // Get tenants for agent (only tenants in agent's assigned properties)
  getTenantsForAgent: async (req, res) => {
    try {
      const agentId = req.user.id;

      const query = `
        SELECT DISTINCT 
          u.id,
          u.national_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          u.role,
          u.is_active,
          u.created_at,
          p.name as property_name,
          pu.unit_number,
          ta.lease_start_date,
          ta.monthly_rent
        FROM users u
        INNER JOIN tenant_allocations ta ON u.id = ta.tenant_id
        INNER JOIN property_units pu ON ta.unit_id = pu.id
        INNER JOIN properties p ON pu.property_id = p.id
        INNER JOIN complaints c ON pu.id = c.unit_id
        WHERE c.assigned_agent = $1 
          AND u.role = 'tenant'
          AND ta.is_active = true
        ORDER BY u.first_name, u.last_name
      `;

      const result = await db.query(query, [agentId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching tenants for agent:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tenants'
      });
    }
  },

  // Get user profile
  getUserProfile: async (req, res) => {
    try {
      const userId = req.user.id;
      
      const query = `
        SELECT id, national_id, first_name, last_name, email, phone_number, role, 
               profile_image, is_active, created_at, notification_preferences
        FROM users 
        WHERE id = $1
      `;
      
      const result = await db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile'
      });
    }
  },

  // Update user profile
  updateUserProfile: async (req, res) => {
    try {
      const userId = req.user.id;
      const { first_name, last_name, email, phone_number, profile_image, notification_preferences } = req.body;
      
      const query = `
        UPDATE users 
        SET first_name = $1, last_name = $2, email = $3, phone_number = $4, 
            profile_image = $5, notification_preferences = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING id, national_id, first_name, last_name, email, phone_number, role, 
                  profile_image, is_active, created_at, notification_preferences
      `;
      
      const result = await db.query(query, [
        first_name, last_name, email, phone_number, 
        profile_image, notification_preferences, userId
      ]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0],
        message: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user profile'
      });
    }
  },

  // Create user (Admin only)
  createUser: async (req, res) => {
    try {
      const { national_id, first_name, last_name, email, phone_number, password, role } = req.body;
      
      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1 OR national_id = $2',
        [email, national_id]
      );
      
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'User with this email or national ID already exists'
        });
      }
      
      // Hash password
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);
      
      const query = `
        INSERT INTO users (national_id, first_name, last_name, email, phone_number, password_hash, role, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, national_id, first_name, last_name, email, phone_number, role, is_active, created_at
      `;
      
      const result = await db.query(query, [
        national_id, first_name, last_name, email, phone_number, password_hash, role, req.user.id
      ]);
      
      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'User created successfully'
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create user'
      });
    }
  },

  // Update user (Admin only)
  updateUser: async (req, res) => {
    try {
      const userId = req.params.id;
      const { first_name, last_name, email, phone_number, role, is_active } = req.body;
      
      const query = `
        UPDATE users 
        SET first_name = $1, last_name = $2, email = $3, phone_number = $4, 
            role = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING id, national_id, first_name, last_name, email, phone_number, role, is_active, created_at
      `;
      
      const result = await db.query(query, [
        first_name, last_name, email, phone_number, role, is_active, userId
      ]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0],
        message: 'User updated successfully'
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user'
      });
    }
  },

  // Delete user (Admin only)
  deleteUser: async (req, res) => {
    let client;
    try {
      const userId = req.params.id;
      
      // Don't allow users to deactivate themselves
      if (userId === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate your own account'
        });
      }

      client = await db.connect();
      await client.query('BEGIN');

      const targetUserResult = await client.query(
        `SELECT id, first_name, last_name, role, is_active
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId]
      );

      if (targetUserResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const targetUser = targetUserResult.rows[0];

      if (!targetUser.is_active) {
        await client.query('COMMIT');
        return res.json({
          success: true,
          message: 'User is already inactive'
        });
      }

      if (targetUser.role === 'admin') {
        const activeAdminsResult = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM users
           WHERE role = 'admin' AND is_active = true AND id != $1`,
          [userId]
        );

        if (activeAdminsResult.rows[0].count === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Cannot deactivate the last active admin account'
          });
        }
      }

      await client.query(
        `UPDATE users
         SET is_active = false,
             is_online = false,
             last_seen = NOW(),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId]
      );

      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: `User ${targetUser.first_name} ${targetUser.last_name} deactivated successfully`
      });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Error rolling back user deactivation:', rollbackError);
        }
      }

      console.error('Error deleting user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to deactivate user'
      });
    } finally {
      if (client) client.release();
    }
  },

  // Get all agents for admin management
  getAllAgents: async (req, res) => {
    try {
      const query = `
        SELECT 
          u.id,
          u.national_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          u.is_active,
          u.created_at,
          COUNT(DISTINCT c.id) as assigned_complaints,
          COUNT(DISTINCT p.id) as managed_properties
        FROM users u
        LEFT JOIN complaints c ON u.id = c.assigned_agent AND c.status IN ('open', 'in_progress')
        LEFT JOIN property_units pu ON c.unit_id = pu.id
        LEFT JOIN properties p ON pu.property_id = p.id
        WHERE u.role = 'agent'
        GROUP BY u.id, u.national_id, u.first_name, u.last_name, u.email, u.phone_number, u.is_active, u.created_at
        ORDER BY u.first_name, u.last_name
      `;

      const result = await db.query(query);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching agents:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch agents'
      });
    }
  }
};

module.exports = userController;
