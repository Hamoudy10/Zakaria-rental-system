const db = require('../config/database');

const logActivity = async ({
  actorUserId = null,
  module = 'system',
  action = 'unknown',
  entityType = null,
  entityId = null,
  requestMethod = null,
  requestPath = null,
  responseStatus = null,
  ipAddress = null,
  userAgent = null,
  metadata = null
} = {}) => {
  try {
    await db.query(
      `
      INSERT INTO system_activity_logs (
        actor_user_id, module, action, entity_type, entity_id,
        request_method, request_path, response_status, ip_address, user_agent, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        actorUserId,
        module,
        action,
        entityType,
        entityId,
        requestMethod,
        requestPath,
        responseStatus,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (error) {
    // Best-effort logger: never fail request flow because audit insert failed.
    console.error('Activity log write failed:', error.message);
  }
};

module.exports = {
  logActivity
};
