const pool = require('../config/database');

const getNotifications = async (req, res) => {
  try {
    const query = `
      SELECT * FROM notifications 
      WHERE user_id = $1 OR user_id IS NULL 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [req.user.userId]);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching notifications'
    });
  }
};

const createNotification = async (req, res) => {
  try {
    const { title, message, user_id } = req.body;
    
    const query = `
      INSERT INTO notifications (title, message, user_id) 
      VALUES ($1, $2, $3) 
      RETURNING *
    `;
    const { rows } = await pool.query(query, [title, message, user_id]);
    
    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating notification'
    });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = 'UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating notification'
    });
  }
};

module.exports = {
  getNotifications,
  createNotification,
  markAsRead
};