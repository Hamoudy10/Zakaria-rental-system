const { query } = require('../config/database');

const getProperties = async (req, res) => {
  try {
    const propertiesResult = await query(`
      SELECT p.*, 
             COUNT(pu.id) as total_units,
             COUNT(CASE WHEN pu.is_occupied = false AND pu.is_active = true THEN 1 END) as available_units
      FROM properties p
      LEFT JOIN property_units pu ON p.id = pu.property_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      properties: propertiesResult.rows
    });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
};

const createProperty = async (req, res) => {
  try {
    const { property_code, name, address, county, town, description, total_units } = req.body;

    const newProperty = await query(
      `INSERT INTO properties (property_code, name, address, county, town, description, total_units, available_units) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) 
       RETURNING *`,
      [property_code, name, address, county, town, description, total_units]
    );

    res.json({
      success: true,
      property: newProperty.rows[0]
    });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create property'
    });
  }
};

module.exports = {
  getProperties,
  createProperty
};