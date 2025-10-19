const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Simple inline middleware for testing
const protect = (req, res, next) => {
  req.user = { 
    id: 'test-user-id', 
    userId: 'test', 
    role: 'admin',
    first_name: 'Test',
    last_name: 'User'
  };
  next();
};

console.log('Notifications routes loaded');

// GET ALL NOTIFICATIONS (with filtering options)
router.get('/', protect, async (req, res) => {
  try {
    console.log('Fetching notifications...');
    
    const { 
      user_id, 
      type, 
      is_read, 
      page = 1, 
      limit = 20,
      related_entity_type,
      start_date,
      end_date
    } = req.query;
    
    let query = `
      SELECT 
        n.*,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.role as user_role
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    // Add filters based on query parameters
    if (user_id) {
      paramCount++;
      query += ` AND n.user_id = $${paramCount}`;
      queryParams.push(user_id);
    }

    if (type) {
      paramCount++;
      query += ` AND n.type = $${paramCount}`;
      queryParams.push(type);
    }

    if (is_read !== undefined) {
      paramCount++;
      query += ` AND n.is_read = $${paramCount}`;
      queryParams.push(is_read === 'true');
    }

    if (related_entity_type) {
      paramCount++;
      query += ` AND n.related_entity_type = $${paramCount}`;
      queryParams.push(related_entity_type);
    }

    if (start_date) {
      paramCount++;
      query += ` AND n.created_at >= $${paramCount}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND n.created_at <= $${paramCount}`;
      queryParams.push(end_date);
    }

    // Add ordering and pagination
    query += ` ORDER BY n.created_at DESC`;
    
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM notifications n WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;

    if (user_id) {
      countParamCount++;
      countQuery += ` AND n.user_id = $${countParamCount}`;
      countParams.push(user_id);
    }

    if (type) {
      countParamCount++;
      countQuery += ` AND n.type = $${countParamCount}`;
      countParams.push(type);
    }

    if (is_read !== undefined) {
      countParamCount++;
      countQuery += ` AND n.is_read = $${countParamCount}`;
      countParams.push(is_read === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    console.log(`Found ${result.rows.length} notifications`);
    
    res.json({
      success: true,
      count: result.rows.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});

// GET NOTIFICATION BY ID
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Fetching notification with ID: ${id}`);
    
    const result = await pool.query(`
      SELECT 
        n.*,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.email as user_email,
        u.role as user_role
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification',
      error: error.message
    });
  }
});

// CREATE NEW NOTIFICATION (POST)
router.post('/', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      user_id,
      title,
      message,
      type,
      related_entity_type,
      related_entity_id
    } = req.body;
    
    console.log('🔔 Creating new notification with data:', req.body);
    
    // Validate required fields
    if (!title || !message || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, message, type'
      });
    }
    
    // If user_id is provided, verify the user exists
    if (user_id) {
      const userCheck = await client.query(
        'SELECT id FROM users WHERE id = $1',
        [user_id]
      );
      
      if (userCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'User not found'
        });
      }
    }
    
    // Create the notification
    const notificationResult = await client.query(
      `INSERT INTO notifications (
        user_id, title, message, type, 
        related_entity_type, related_entity_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        user_id || null,
        title,
        message,
        type,
        related_entity_type || null,
        related_entity_id || null
      ]
    );
    
    // If this is a broadcast notification (no specific user), create entries for all relevant users
    if (!user_id) {
      let targetRoles = ['tenant', 'agent'];
      
      // Determine target audience based on notification type
      if (type === 'payment_reminder') {
        targetRoles = ['tenant'];
      } else if (type === 'maintenance_alert') {
        targetRoles = ['tenant', 'agent'];
      } else if (type === 'system_announcement') {
        targetRoles = ['tenant', 'agent', 'admin'];
      }
      
      const usersResult = await client.query(
        'SELECT id FROM users WHERE role = ANY($1) AND is_active = true',
        [targetRoles]
      );
      
      // Create individual notifications for each user
      for (const user of usersResult.rows) {
        await client.query(
          `INSERT INTO notifications (
            user_id, title, message, type, 
            related_entity_type, related_entity_id
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            user.id,
            title,
            message,
            type,
            related_entity_type || null,
            related_entity_id || null
          ]
        );
      }
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Notification created successfully');
    
    res.status(201).json({
      success: true,
      message: user_id ? 'Notification created successfully' : 'Broadcast notification created for all users',
      data: notificationResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating notification:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error creating notification',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE NOTIFICATION (PUT) - mainly for marking as read
router.put('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      is_read,
      title,
      message
    } = req.body;
    
    // Check if notification exists
    const notificationCheck = await pool.query(
      'SELECT id, user_id, is_read FROM notifications WHERE id = $1',
      [id]
    );
    
    if (notificationCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // If marking as read and it's not already read
    let readAt = notificationCheck.rows[0].read_at;
    if (is_read === true && !notificationCheck.rows[0].is_read) {
      readAt = new Date();
    } else if (is_read === false) {
      readAt = null;
    }
    
    const result = await pool.query(
      `UPDATE notifications 
       SET title = COALESCE($1, title),
           message = COALESCE($2, message),
           is_read = COALESCE($3, is_read),
           read_at = $4
       WHERE id = $5
       RETURNING *`,
      [
        title,
        message,
        is_read,
        readAt,
        id
      ]
    );
    
    res.json({
      success: true,
      message: 'Notification updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification',
      error: error.message
    });
  }
});

// MARK NOTIFICATION AS READ (PATCH)
router.patch('/:id/read', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Notification marked as read',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
});

// MARK ALL NOTIFICATIONS AS READ FOR USER
router.patch('/mark-all-read', protect, async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false
       RETURNING COUNT(*) as updated_count`,
      [user_id]
    );
    
    const updatedCount = parseInt(result.rows[0].updated_count);
    
    res.json({
      success: true,
      message: `Marked ${updatedCount} notifications as read`,
      updated_count: updatedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read',
      error: error.message
    });
  }
});

// DELETE NOTIFICATION (DELETE)
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if notification exists
    const notificationCheck = await pool.query(
      'SELECT id, title FROM notifications WHERE id = $1',
      [id]
    );
    
    if (notificationCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: `Notification "${notificationCheck.rows[0].title}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
});

// GET USER'S UNREAD NOTIFICATIONS COUNT
router.get('/user/:userId/unread-count', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      `SELECT COUNT(*) as unread_count 
       FROM notifications 
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    
    res.json({
      success: true,
      unread_count: parseInt(result.rows[0].unread_count)
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread notifications count',
      error: error.message
    });
  }
});

// GET NOTIFICATIONS FOR SPECIFIC USER
router.get('/user/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      is_read, 
      type, 
      limit = 20,
      page = 1 
    } = req.query;
    
    let query = `
      SELECT n.*
      FROM notifications n
      WHERE n.user_id = $1
    `;
    const queryParams = [userId];
    let paramCount = 1;
    
    if (is_read !== undefined) {
      paramCount++;
      query += ` AND n.is_read = $${paramCount}`;
      queryParams.push(is_read === 'true');
    }
    
    if (type) {
      paramCount++;
      query += ` AND n.type = $${paramCount}`;
      queryParams.push(type);
    }
    
    query += ` ORDER BY n.created_at DESC`;
    
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);
    
    const result = await pool.query(query, queryParams);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM notifications 
      WHERE user_id = $1
      ${is_read !== undefined ? 'AND is_read = $2' : ''}
      ${type ? `AND type = $${is_read !== undefined ? '3' : '2'}` : ''}
    `;
    
    const countParams = [userId];
    if (is_read !== undefined) countParams.push(is_read === 'true');
    if (type) countParams.push(type);
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      count: result.rows.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user notifications',
      error: error.message
    });
  }
});

// GET NOTIFICATION STATISTICS
router.get('/stats/overview', protect, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const queryParams = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
      queryParams.push(start_date, end_date);
    }
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_notifications,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN type = 'payment' THEN 1 END) as payment_notifications,
        COUNT(CASE WHEN type = 'maintenance' THEN 1 END) as maintenance_notifications,
        COUNT(CASE WHEN type = 'system' THEN 1 END) as system_notifications,
        COUNT(CASE WHEN type = 'announcement' THEN 1 END) as announcement_notifications
      FROM notifications
      ${dateFilter}
    `, queryParams);
    
    const dailyResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as daily_count,
        COUNT(CASE WHEN is_read = true THEN 1 END) as daily_read
      FROM notifications
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        daily_trends: dailyResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching notification statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification statistics',
      error: error.message
    });
  }
});

module.exports = router;