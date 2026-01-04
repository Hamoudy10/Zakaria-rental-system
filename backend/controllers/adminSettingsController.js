const pool = require('../config/database');

/* ============================
   GET ALL SETTINGS
============================ */
const getAllSettings = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT setting_key, setting_value, description, updated_at
      FROM admin_settings
      ORDER BY setting_key
    `);

    // Transform rows → object
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = parseValue(row.setting_value);
    });

    res.json({
      success: true,
      settings
    });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

/* ============================
   GET SETTINGS BY CATEGORY
   (optional, safe fallback)
============================ */
const getSettingsByCategory = async (req, res) => {
  const { category } = req.query;

  try {
    let query = `
      SELECT setting_key, setting_value, description
      FROM admin_settings
    `;
    const params = [];

    if (category) {
      query += ` WHERE setting_key ILIKE $1`;
      params.push(`%${category}%`);
    }

    const result = await pool.query(query, params);

    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = parseValue(row.setting_value);
    });

    res.json({ success: true, settings });
  } catch (err) {
    console.error('Category settings error:', err);
    res.status(500).json({ success: false });
  }
};

/* ============================
   GET SINGLE SETTING
============================ */
const getSettingByKey = async (req, res) => {
  const { key } = req.params;

  try {
    const result = await pool.query(
      `SELECT setting_value FROM admin_settings WHERE setting_key = $1`,
      [key]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }

    res.json({
      success: true,
      value: parseValue(result.rows[0].setting_value)
    });
  } catch (err) {
    console.error('Get setting error:', err);
    res.status(500).json({ success: false });
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
    return res.status(400).json({ success: false, message: 'Value is required' });
  }

  try {
    await pool.query(
      `
      INSERT INTO admin_settings (setting_key, setting_value, updated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      `,
      [key, value.toString(), userId]
    );

    res.json({ success: true, message: 'Setting updated' });
  } catch (err) {
    console.error('Update setting error:', err);
    res.status(500).json({ success: false });
  }
};

/* ============================
   UPDATE MULTIPLE SETTINGS
============================ */
const updateMultipleSettings = async (req, res) => {
  const updates = req.body;
  const userId = req.user?.id;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const [key, value] of Object.entries(updates)) {
      await client.query(
        `
        INSERT INTO admin_settings (setting_key, setting_value, updated_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
        `,
        [key, value.toString(), userId]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Settings updated successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk settings update error:', err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
};

/* ============================
   HELPERS
============================ */
const parseValue = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(value) && value !== '') return Number(value);
  return value;
};

module.exports = {
  getAllSettings,
  getSettingsByCategory,
  getSettingByKey,
  updateSettingByKey,
  updateMultipleSettings
};
