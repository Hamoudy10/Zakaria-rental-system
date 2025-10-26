const pool = require('./config/database');

const seedNotifications = async () => {
  try {
    // Get a test user
    const userResult = await pool.query('SELECT id FROM users LIMIT 1');
    
    if (userResult.rows.length === 0) {
      console.log('No users found. Please run user seed first.');
      return;
    }

    const userId = userResult.rows[0].id;

    // Clear existing notifications
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);

    // Insert test notifications
    const testNotifications = [
      {
        title: 'Welcome to Zakaria Rental System',
        message: 'Your account has been successfully created and you can now access all features.',
        type: 'system_alert'
      },
      {
        title: 'Rent Payment Due',
        message: 'Your rent payment for January 2024 is due in 3 days.',
        type: 'payment_reminder'
      },
      {
        title: 'Maintenance Scheduled',
        message: 'Plumbing maintenance is scheduled for your unit on Friday.',
        type: 'maintenance'
      },
      {
        title: 'New Announcement',
        message: 'Please note the office will be closed on Monday for public holiday.',
        type: 'announcement'
      }
    ];

    for (const notification of testNotifications) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, created_at) 
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, notification.title, notification.message, notification.type]
      );
    }

    console.log('✅ Test notifications seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding notifications:', error);
  }
};

// Run if called directly
if (require.main === module) {
  seedNotifications().then(() => {
    console.log('Seed completed');
    process.exit(0);
  });
}

module.exports = seedNotifications;
