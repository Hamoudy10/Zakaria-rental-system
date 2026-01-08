const pool = require('../config/database');
const cronService = require('../services/cronService');

/* ============================
   GET ALL SETTINGS
============================ */
const getAllSettings = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT setting_key, setting_value, description, updated_at, updated_by
      FROM admin_settings
      ORDER BY 
        CASE 
          WHEN setting_key = 'billing_day' THEN 1
          WHEN setting_key = 'paybill_number' THEN 2
          WHEN setting_key LIKE 'sms_%' THEN 3
          WHEN setting_key LIKE 'mpesa_%' THEN 4
          ELSE 5
        END,
        setting_key
    `);

    // Transform rows → array for frontend
    const settingsArray = result.rows.map(row => ({
      key: row.setting_key,
      value: parseValue(row.setting_value),
      description: row.description,
      updated_at: row.updated_at,
      updated_by: row.updated_by
    }));

    // Group settings by category for better organization
    const groupedSettings = {
      billing: settingsArray.filter(s => 
        s.key === 'billing_day' || s.key === 'paybill_number' || 
        s.key === 'company_name' || s.key.includes('billing')
      ),
      sms: settingsArray.filter(s => s.key.includes('sms_')),
      mpesa: settingsArray.filter(s => s.key.includes('mpesa_')),
      fees: settingsArray.filter(s => 
        s.key === 'late_fee_percentage' || s.key === 'grace_period_days'
      ),
      general: settingsArray.filter(s => 
        !s.key.includes('sms_') && !s.key.includes('mpesa_') && 
        s.key !== 'billing_day' && s.key !== 'paybill_number' &&
        s.key !== 'company_name' && s.key !== 'late_fee_percentage' && 
        s.key !== 'grace_period_days'
      )
    };

    res.json({
      success: true,
      settings: settingsArray,
      grouped: groupedSettings
    });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch settings',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/* ============================
   GET SETTINGS BY CATEGORY
============================ */
const getSettingsByCategory = async (req, res) => {
  const { category } = req.query;

  try {
    let query = `
      SELECT setting_key, setting_value, description, updated_at, updated_by
      FROM admin_settings
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (category) {
      if (category === 'billing') {
        query += ` AND (setting_key = $${++paramCount} OR setting_key = $${++paramCount} OR setting_key = $${++paramCount} OR setting_key ILIKE $${++paramCount})`;
        params.push('billing_day', 'paybill_number', 'company_name', '%billing%');
      } else if (category === 'sms') {
        query += ` AND setting_key ILIKE $${++paramCount}`;
        params.push('%sms%');
      } else if (category === 'mpesa') {
        query += ` AND setting_key ILIKE $${++paramCount}`;
        params.push('%mpesa%');
      } else if (category === 'fees') {
        query += ` AND (setting_key = $${++paramCount} OR setting_key = $${++paramCount})`;
        params.push('late_fee_percentage', 'grace_period_days');
      } else {
        query += ` AND setting_key ILIKE $${++paramCount}`;
        params.push(`%${category}%`);
      }
    }

    query += ` ORDER BY setting_key`;

    const result = await pool.query(query, params);

    const settingsArray = result.rows.map(row => ({
      key: row.setting_key,
      value: parseValue(row.setting_value),
      description: row.description,
      updated_at: row.updated_at,
      updated_by: row.updated_by
    }));

    res.json({ 
      success: true, 
      settings: settingsArray,
      count: settingsArray.length
    });
  } catch (err) {
    console.error('Category settings error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch category settings'
    });
  }
};

/* ============================
   GET SINGLE SETTING
============================ */
const getSettingByKey = async (req, res) => {
  const { key } = req.params;

  try {
    const result = await pool.query(
      `SELECT setting_value, description, updated_at, updated_by 
       FROM admin_settings 
       WHERE setting_key = $1`,
      [key]
    );

    if (!result.rows.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Setting not found' 
      });
    }

    const row = result.rows[0];
    
    // Get user who last updated
    let updatedByUser = null;
    if (row.updated_by) {
      try {
        const userResult = await pool.query(
          `SELECT first_name, last_name FROM users WHERE id = $1`,
          [row.updated_by]
        );
        if (userResult.rows.length > 0) {
          updatedByUser = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`;
        }
      } catch (userErr) {
        console.error('Error fetching user:', userErr);
      }
    }

    res.json({
      success: true,
      setting: {
        key,
        value: parseValue(row.setting_value),
        description: row.description,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
        updated_by_name: updatedByUser
      }
    });
  } catch (err) {
    console.error('Get setting error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch setting'
    });
  }
};

/* ============================
   UPDATE SINGLE SETTING
============================ */
const updateSettingByKey = async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  const userId = req.user?.id;

  if (value === undefined) {
    return res.status(400).json({ 
      success: false, 
      message: 'Value is required' 
    });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Validate specific settings
    if (key === 'billing_day') {
      const day = parseInt(value, 10);
      if (isNaN(day) || day < 1 || day > 28) {
        throw new Error('Billing day must be between 1 and 28');
      }
    }

    if (key === 'paybill_number') {
      const paybillRegex = /^\d{5,10}$/;
      if (!paybillRegex.test(value.toString())) {
        throw new Error('Paybill number must be 5-10 digits');
      }
    }

    if (key === 'late_fee_percentage') {
      const percentage = parseFloat(value);
      if (isNaN(percentage) || percentage < 0 || percentage > 50) {
        throw new Error('Late fee percentage must be between 0 and 50');
      }
    }

    if (key === 'grace_period_days') {
      const days = parseInt(value, 10);
      if (isNaN(days) || days < 0 || days > 30) {
        throw new Error('Grace period days must be between 0 and 30');
      }
    }

    // Update the setting
    await client.query(
      `
      INSERT INTO admin_settings (setting_key, setting_value, updated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      `,
      [key, value.toString(), userId]
    );

    await client.query('COMMIT');

    // If billing_day is updated, restart cron service
    if (key === 'billing_day') {
      try {
        cronService.stop();
        await cronService.start();
        console.log('✅ Cron service restarted with new billing day:', value);
      } catch (cronErr) {
        console.error('Failed to restart cron service:', cronErr);
        // Don't fail the request, just log the error
      }
    }

    res.json({ 
      success: true, 
      message: 'Setting updated successfully',
      setting: {
        key,
        value: parseValue(value.toString()),
        updated_at: new Date()
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update setting error:', err);
    
    let errorMessage = 'Failed to update setting';
    if (err.message.includes('must be between')) {
      errorMessage = err.message;
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
};

/* ============================
   UPDATE MULTIPLE SETTINGS
============================ */
const updateMultipleSettings = async (req, res) => {
  const updates = req.body;
  const userId = req.user?.id;

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid payload: must be an object with key-value pairs' 
    });
  }

  const client = await pool.connect();
  let restartCron = false;

  try {
    await client.query('BEGIN');

    const validationErrors = [];

    for (const [key, value] of Object.entries(updates)) {
      // Validate specific settings
      if (key === 'billing_day') {
        const day = parseInt(value, 10);
        if (isNaN(day) || day < 1 || day > 28) {
          validationErrors.push('Billing day must be between 1 and 28');
        } else {
          restartCron = true;
        }
      }

      if (key === 'paybill_number') {
        const paybillRegex = /^\d{5,10}$/;
        if (!paybillRegex.test(value.toString())) {
          validationErrors.push('Paybill number must be 5-10 digits');
        }
      }

      if (key === 'late_fee_percentage') {
        const percentage = parseFloat(value);
        if (isNaN(percentage) || percentage < 0 || percentage > 50) {
          validationErrors.push('Late fee percentage must be between 0 and 50');
        }
      }

      if (key === 'grace_period_days') {
        const days = parseInt(value, 10);
        if (isNaN(days) || days < 0 || days > 30) {
          validationErrors.push('Grace period days must be between 0 and 30');
        }
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(', '));
      }

      // Update each setting
      await client.query(
        `
        INSERT INTO admin_settings (setting_key, setting_value, updated_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [key, value.toString(), userId]
      );
    }

    await client.query('COMMIT');

    // Restart cron if billing day changed
    if (restartCron) {
      try {
        cronService.stop();
        await cronService.start();
        console.log('✅ Cron service restarted after multiple settings update');
      } catch (cronErr) {
        console.error('Failed to restart cron service:', cronErr);
      }
    }

    res.json({ 
      success: true, 
      message: `${Object.keys(updates).length} settings updated successfully` 
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk settings update error:', err);
    
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Failed to update settings'
    });
  } finally {
    client.release();
  }
};

/* ============================
   RESET TO DEFAULTS
============================ */
const resetToDefaults = async (req, res) => {
  const userId = req.user?.id;
  
  // Define default settings for billing system
  const defaultSettings = {
    'billing_day': '28',
    'paybill_number': '',
    'company_name': 'Rental Management System',
    'sms_billing_template': 'Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.',
    'late_fee_percentage': '5',
    'grace_period_days': '5',
    'sms_enabled': 'true',
    'auto_billing_enabled': 'true'
  };

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    for (const [key, value] of Object.entries(defaultSettings)) {
      await client.query(
        `
        INSERT INTO admin_settings (setting_key, setting_value, updated_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [key, value, userId]
      );
    }

    await client.query('COMMIT');

    // Restart cron with default billing day
    try {
      cronService.stop();
      await cronService.start();
      console.log('✅ Cron service restarted with defaults');
    } catch (cronErr) {
      console.error('Failed to restart cron service:', cronErr);
    }

    res.json({ 
      success: true, 
      message: 'Settings reset to defaults successfully'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset to defaults error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset settings to defaults' 
    });
  } finally {
    client.release();
  }
};

/* ============================
   GET SETTINGS FOR BILLING
============================ */
const getBillingConfig = async (req, res) => {
  try {
    const keys = [
      'billing_day', 
      'paybill_number', 
      'company_name', 
      'sms_billing_template',
      'late_fee_percentage',
      'grace_period_days',
      'sms_enabled',
      'auto_billing_enabled'
    ];

    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
    
    const result = await pool.query(
      `SELECT setting_key, setting_value 
       FROM admin_settings 
       WHERE setting_key IN (${placeholders})`,
      keys
    );

    const config = {};
    keys.forEach(key => {
      const row = result.rows.find(r => r.setting_key === key);
      config[key] = row ? parseValue(row.setting_value) : getDefaultValue(key);
    });

    res.json({
      success: true,
      config
    });

  } catch (err) {
    console.error('Get billing config error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch billing configuration'
    });
  }
};

/* ============================
   HELPERS
============================ */
const parseValue = (value) => {
  if (value === null || value === undefined) return '';
  
  const strValue = value.toString().trim();
  
  if (strValue.toLowerCase() === 'true') return true;
  if (strValue.toLowerCase() === 'false') return false;
  
  // Check if it's a number (integer or float)
  if (!isNaN(strValue) && strValue !== '' && !isNaN(parseFloat(strValue))) {
    return strValue.includes('.') ? parseFloat(strValue) : parseInt(strValue, 10);
  }
  
  return strValue;
};

const getDefaultValue = (key) => {
  const defaults = {
    'billing_day': 28,
    'paybill_number': '',
    'company_name': 'Rental Management System',
    'sms_billing_template': 'Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.',
    'late_fee_percentage': 5,
    'grace_period_days': 5,
    'sms_enabled': true,
    'auto_billing_enabled': true
  };
  return defaults[key] || '';
};

/* ============================
   INITIALIZE DEFAULTS (for server startup)
============================ */
const initializeDefaultSettings = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const defaultSettings = [
      { 
        setting_key: 'billing_day', 
        setting_value: '28', 
        description: 'Day of month for automatic billing (1-28)' 
      },
      { 
        setting_key: 'paybill_number', 
        setting_value: '', 
        description: 'Business paybill number for SMS instructions' 
      },
      { 
        setting_key: 'company_name', 
        setting_value: 'Rental Management System', 
        description: 'Company name for SMS signature' 
      },
      { 
        setting_key: 'sms_billing_template', 
        setting_value: 'Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.', 
        description: 'SMS template for billing notifications. Available variables: {tenantName}, {month}, {unitCode}, {rent}, {water}, {arrears}, {total}, {paybill}' 
      },
      { 
        setting_key: 'late_fee_percentage', 
        setting_value: '5', 
        description: 'Late fee percentage applied to overdue payments' 
      },
      { 
        setting_key: 'grace_period_days', 
        setting_value: '5', 
        description: 'Number of grace days before late fee is applied' 
      },
      { 
        setting_key: 'sms_enabled', 
        setting_value: 'true', 
        description: 'Enable or disable SMS notifications' 
      },
      { 
        setting_key: 'auto_billing_enabled', 
        setting_value: 'true', 
        description: 'Enable or disable automatic monthly billing' 
      },
      { 
        setting_key: 'mpesa_paybill_number', 
        setting_value: '', 
        description: 'M-Pesa paybill number for payments' 
      },
      { 
        setting_key: 'mpesa_passkey', 
        setting_value: '', 
        description: 'M-Pesa Lipa Na M-Pesa passkey' 
      },
      { 
        setting_key: 'mpesa_consumer_key', 
        setting_value: '', 
        description: 'M-Pesa consumer key for API access' 
      },
      { 
        setting_key: 'mpesa_consumer_secret', 
        setting_value: '', 
        description: 'M-Pesa consumer secret for API access' 
      }
    ];
    
    for (const setting of defaultSettings) {
      const checkResult = await client.query(
        `SELECT id FROM admin_settings WHERE setting_key = $1`,
        [setting.setting_key]
      );
      
      if (checkResult.rows.length === 0) {
        await client.query(
          `INSERT INTO admin_settings (setting_key, setting_value, description)
           VALUES ($1, $2, $3)`,
          [setting.setting_key, setting.setting_value, setting.description]
        );
        console.log(`✅ Default setting added: ${setting.setting_key}`);
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ Default admin settings initialized');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing default settings:', error);
  } finally {
    client.release();
  }
};

module.exports = {
  getAllSettings,
  getSettingsByCategory,
  getSettingByKey,
  updateSettingByKey,
  updateMultipleSettings,
  resetToDefaults,
  getBillingConfig,
  initializeDefaultSettings
};