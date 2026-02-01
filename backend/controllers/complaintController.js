// ============================================
// FIXED complaintController.js
// Replace your existing backend/controllers/complaintController.js with this
// ============================================

const pool = require('../config/database');
const NotificationService = require("../services/notificationService");
console.log('✅ Complaint controller loaded successfully');

// Get all complaints
const getComplaints = async (req, res) => {
  try {
    console.log('getComplaints function called');
    let query = `
      SELECT c.*, u.name as tenant_name, p.name as property_name
      FROM complaints c
      LEFT JOIN users u ON c.tenant_id = u.id
      LEFT JOIN properties p ON c.property_id = p.id
    `;
    let params = [];
    
    if (req.user.role === 'tenant') {
      query += ' WHERE c.tenant_id = $1';
      params = [req.user.userId];
    }
    
    query += ' ORDER BY c.created_at DESC';
    
    const { rows } = await pool.query(query, params);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching complaints'
    });
  }
};

// Get single complaint
const getComplaint = async (req, res) => {
  try {
    console.log('getComplaint function called');
    const { id } = req.params;
    
    const query = `
      SELECT c.*, u.name as tenant_name, p.name as property_name
      FROM complaints c
      LEFT JOIN users u ON c.tenant_id = u.id
      LEFT JOIN properties p ON c.property_id = p.id
      WHERE c.id = $1
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    if (req.user.role === 'tenant' && rows[0].tenant_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching complaint'
    });
  }
};

// Create complaint
const createComplaint = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("createComplaint function called");
    const {
      property_id,
      unit_id,
      tenant_id,
      title,
      description,
      priority,
      category,
      categories,
    } = req.body;

    // Validate required fields
    if (!title || !description) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    // Prepare categories JSON if provided
    let categoriesJson = null;
    if (categories && Array.isArray(categories)) {
      categoriesJson = JSON.stringify(categories);
    }

    // Determine the tenant ID (from body or from logged-in user)
    const finalTenantId = tenant_id || req.user.userId || req.user.id;

    const query = `
      INSERT INTO complaints (
        tenant_id, property_id, unit_id, title, description, 
        priority, category, categories, status, raised_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'open', NOW())
      RETURNING *
    `;

    const { rows } = await client.query(query, [
      finalTenantId,
      property_id || null,
      unit_id || null,
      title,
      description,
      priority || "medium",
      category || null,
      categoriesJson,
    ]);

    const newComplaint = rows[0];

    await client.query("COMMIT");

    // ========================================================
    // NOTIFICATION: Complaint Created
    // ========================================================
    try {
      // Get property and tenant details for notification message
      let propertyName = "Unknown Property";
      let unitCode = "";
      let tenantName = "A tenant";
      let assignedAgentId = null;

      if (property_id) {
        const propertyResult = await pool.query(
          "SELECT name FROM properties WHERE id = $1",
          [property_id],
        );
        if (propertyResult.rows.length > 0) {
          propertyName = propertyResult.rows[0].name;
        }

        // Get assigned agent for this property
        const agentResult = await pool.query(
          `SELECT agent_id FROM agent_property_assignments 
           WHERE property_id = $1 AND is_active = true LIMIT 1`,
          [property_id],
        );
        if (agentResult.rows.length > 0) {
          assignedAgentId = agentResult.rows[0].agent_id;
        }
      }

      if (unit_id) {
        const unitResult = await pool.query(
          "SELECT unit_code FROM property_units WHERE id = $1",
          [unit_id],
        );
        if (unitResult.rows.length > 0) {
          unitCode = unitResult.rows[0].unit_code;
        }
      }

      // Get tenant name
      const tenantResult = await pool.query(
        "SELECT first_name, last_name FROM tenants WHERE id = $1",
        [finalTenantId],
      );
      if (tenantResult.rows.length > 0) {
        tenantName = `${tenantResult.rows[0].first_name} ${tenantResult.rows[0].last_name}`;
      }

      const locationInfo = unitCode
        ? `${propertyName} (${unitCode})`
        : propertyName;
      const notificationMessage = `New complaint filed: "${title}" at ${locationInfo} by ${tenantName}. Priority: ${priority || "medium"}.`;

      // Notify all admins
      const adminUsers = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
      );

      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: "New Complaint Filed",
          message: notificationMessage,
          type: "complaint_created",
          relatedEntityType: "complaint",
          relatedEntityId: newComplaint.id,
        });
      }

      // Notify assigned agent if exists
      if (assignedAgentId) {
        await NotificationService.createNotification({
          userId: assignedAgentId,
          title: "New Complaint in Your Property",
          message: notificationMessage,
          type: "complaint_created",
          relatedEntityType: "complaint",
          relatedEntityId: newComplaint.id,
        });
      }

      console.log("✅ Complaint creation notifications sent");
    } catch (notificationError) {
      console.error(
        "❌ Failed to send complaint notifications:",
        notificationError,
      );
      // Don't fail the request if notifications fail
    }
    // ========================================================
    // END NOTIFICATION
    // ========================================================

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      data: newComplaint,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating complaint",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Update complaint - MAIN UPDATE FUNCTION
const updateComplaint = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("updateComplaint function called");
    const { id } = req.params;
    const {
      status,
      response,
      title,
      description,
      priority,
      category,
      categories,
      assigned_agent,
      tenant_id,
      unit_id,
    } = req.body;

    console.log("📝 Updating complaint:", id);
    console.log("📝 Request body:", req.body);

    // Check if complaint exists and get current data
    const checkResult = await client.query(
      `SELECT c.*, t.first_name, t.last_name, p.name as property_name, pu.unit_code
       FROM complaints c
       LEFT JOIN tenants t ON c.tenant_id = t.id
       LEFT JOIN properties p ON c.property_id = p.id
       LEFT JOIN property_units pu ON c.unit_id = pu.id
       WHERE c.id = $1`,
      [id],
    );

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const complaint = checkResult.rows[0];
    const previousStatus = complaint.status;
    const previousAssignedAgent = complaint.assigned_agent;

    // Authorization check for tenants
    if (
      req.user.role === "tenant" &&
      complaint.tenant_id !== req.user.userId &&
      complaint.tenant_id !== req.user.id
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Prepare categories JSON if provided
    let categoriesJson = null;
    if (categories && Array.isArray(categories)) {
      categoriesJson = JSON.stringify(categories);
    }

    let query;
    let values;

    if (req.user.role === "tenant") {
      // Tenants can only update basic fields
      query = `
        UPDATE complaints 
        SET title = COALESCE($1, title), 
            description = COALESCE($2, description), 
            priority = COALESCE($3, priority),
            category = COALESCE($4, category),
            categories = COALESCE($5::jsonb, categories),
            updated_at = NOW()
        WHERE id = $6 AND tenant_id = $7
        RETURNING *
      `;
      values = [
        title,
        description,
        priority,
        category,
        categoriesJson,
        id,
        req.user.userId || req.user.id,
      ];
    } else {
      // Admins and agents can update all fields
      query = `
        UPDATE complaints 
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            priority = COALESCE($3, priority),
            status = COALESCE($4, status), 
            response = COALESCE($5, response),
            category = COALESCE($6, category),
            categories = COALESCE($7::jsonb, categories),
            assigned_agent = COALESCE($8, assigned_agent),
            tenant_id = COALESCE($9, tenant_id),
            unit_id = COALESCE($10, unit_id),
            resolved_at = CASE WHEN $4 = 'resolved' THEN NOW() ELSE resolved_at END,
            resolved_by = CASE WHEN $4 = 'resolved' THEN $12 ELSE resolved_by END,
            updated_at = NOW()
        WHERE id = $11
        RETURNING *
      `;
      values = [
        title,
        description,
        priority,
        status,
        response,
        category,
        categoriesJson,
        assigned_agent,
        tenant_id,
        unit_id,
        id,
        req.user.id,
      ];
    }

    const { rows } = await client.query(query, values);

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Complaint not found or access denied",
      });
    }

    const updatedComplaint = rows[0];

    await client.query("COMMIT");

    // ========================================================
    // NOTIFICATION: Complaint Updated
    // ========================================================
    try {
      const tenantName =
        complaint.first_name && complaint.last_name
          ? `${complaint.first_name} ${complaint.last_name}`
          : "Tenant";
      const propertyInfo = complaint.property_name || "Property";
      const unitInfo = complaint.unit_code || "";
      const locationInfo = unitInfo
        ? `${propertyInfo} (${unitInfo})`
        : propertyInfo;
      const complaintTitle =
        updatedComplaint.title || complaint.title || "Complaint";

      // 1. Notify tenant if status changed
      if (status && status !== previousStatus && complaint.tenant_id) {
        // Get user ID for this tenant (if they have a user account)
        const tenantUserResult = await pool.query(
          "SELECT u.id FROM users u WHERE u.email = (SELECT email FROM tenants WHERE id = $1) OR u.phone_number = (SELECT phone_number FROM tenants WHERE id = $1)",
          [complaint.tenant_id],
        );

        // If tenant has a user account, send in-app notification
        if (tenantUserResult.rows.length > 0) {
          const tenantUserId = tenantUserResult.rows[0].id;

          if (status === "resolved") {
            await NotificationService.createNotification({
              userId: tenantUserId,
              title: "Complaint Resolved",
              message: `Your complaint "${complaintTitle}" has been resolved. Thank you for your patience.`,
              type: "complaint_resolved",
              relatedEntityType: "complaint",
              relatedEntityId: id,
            });
          } else {
            await NotificationService.createNotification({
              userId: tenantUserId,
              title: "Complaint Status Updated",
              message: `Your complaint "${complaintTitle}" status has been updated to: ${status}.`,
              type: "complaint_updated",
              relatedEntityType: "complaint",
              relatedEntityId: id,
            });
          }
        }

        // Also notify admins about status change
        const adminUsers = await pool.query(
          "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
        );

        for (const admin of adminUsers.rows) {
          await NotificationService.createNotification({
            userId: admin.id,
            title:
              status === "resolved"
                ? "Complaint Resolved"
                : "Complaint Status Updated",
            message: `Complaint "${complaintTitle}" at ${locationInfo} has been updated to: ${status}.`,
            type:
              status === "resolved"
                ? "complaint_resolved"
                : "complaint_updated",
            relatedEntityType: "complaint",
            relatedEntityId: id,
          });
        }

        console.log(
          `✅ Complaint status change notifications sent (${previousStatus} → ${status})`,
        );
      }

      // 2. Notify agent if complaint was assigned to them
      if (assigned_agent && assigned_agent !== previousAssignedAgent) {
        await NotificationService.createNotification({
          userId: assigned_agent,
          title: "Complaint Assigned to You",
          message: `A complaint has been assigned to you: "${complaintTitle}" at ${locationInfo}. Priority: ${updatedComplaint.priority || "medium"}.`,
          type: "complaint_assigned",
          relatedEntityType: "complaint",
          relatedEntityId: id,
        });

        console.log(
          `✅ Complaint assignment notification sent to agent ${assigned_agent}`,
        );
      }
    } catch (notificationError) {
      console.error(
        "❌ Failed to send complaint update notifications:",
        notificationError,
      );
      // Don't fail the request if notifications fail
    }
    // ========================================================
    // END NOTIFICATION
    // ========================================================

    console.log("✅ Complaint updated successfully");

    res.json({
      success: true,
      message: "Complaint updated successfully",
      data: updatedComplaint,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Update complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating complaint",
      error: error.message,
    });
  } finally {
    client.release();
  }
};


// Delete complaint
const deleteComplaint = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('deleteComplaint function called');
    const { id } = req.params;
    
    // Delete related records first
    await client.query('DELETE FROM complaint_steps WHERE complaint_id = $1', [id]);
    await client.query('DELETE FROM complaint_updates WHERE complaint_id = $1', [id]);
    
    // Delete the complaint
    const { rows } = await client.query('DELETE FROM complaints WHERE id = $1 RETURNING *', [id]);
    
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Complaint deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting complaint'
    });
  } finally {
    client.release();
  }
};

// Get complaint steps
const getComplaintSteps = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cs.*,
        u.first_name as completed_by_first_name,
        u.last_name as completed_by_last_name
      FROM complaint_steps cs
      LEFT JOIN users u ON cs.completed_by = u.id
      WHERE cs.complaint_id = $1
      ORDER BY cs.step_order ASC
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching complaint steps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint steps',
      error: error.message
    });
  }
};

// Add complaint step
const addComplaintStep = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { step_order, step_description } = req.body;
    
    if (!step_description) {
      return res.status(400).json({
        success: false,
        message: 'Step description is required'
      });
    }
    
    // Get the next step order if not provided
    let finalStepOrder = step_order;
    if (!finalStepOrder) {
      const maxOrderResult = await client.query(
        'SELECT COALESCE(MAX(step_order), 0) + 1 as next_order FROM complaint_steps WHERE complaint_id = $1',
        [id]
      );
      finalStepOrder = maxOrderResult.rows[0].next_order;
    }
    
    const stepResult = await client.query(
      `INSERT INTO complaint_steps (
        complaint_id, step_order, step_description, created_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [id, finalStepOrder, step_description, req.user.id]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Step added successfully',
      data: stepResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding complaint step:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding complaint step',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Toggle step completion
const toggleStepCompletion = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, stepId } = req.params;
    const { is_completed } = req.body;
    
    const updateResult = await client.query(
      `UPDATE complaint_steps 
       SET is_completed = $1,
           completed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
           completed_by = CASE WHEN $1 = true THEN $2 ELSE NULL END
       WHERE id = $3 AND complaint_id = $4
       RETURNING *`,
      [is_completed, req.user.id, stepId, id]
    );
    
    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Step not found'
      });
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: is_completed ? 'Step marked as completed' : 'Step marked as pending',
      data: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error toggling step:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating step',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Export all functions
module.exports = {
  getComplaints,
  getComplaint,
  createComplaint,
  updateComplaint,
  deleteComplaint,
  getComplaintSteps,
  addComplaintStep,
  toggleStepCompletion
};