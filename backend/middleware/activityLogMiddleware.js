const { logActivity } = require('../services/activityLogService');

const ACTIVITY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_PREFIXES = ['/api/health', '/api/test'];

const extractModule = (path = '') => {
  const parts = path.split('/').filter(Boolean);
  // /api/<module>/...
  if (parts.length >= 2 && parts[0] === 'api') {
    return parts[1];
  }
  return 'system';
};

const activityLogMiddleware = (req, res, next) => {
  if (!ACTIVITY_METHODS.has(req.method)) {
    return next();
  }

  if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  res.on('finish', () => {
    const actorUserId = req.user?.id || null;
    const moduleName = extractModule(req.path);
    const action = `${req.method} ${req.path}`;
    const ipAddress = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
      .toString()
      .split(',')[0]
      .trim();

    logActivity({
      actorUserId,
      module: moduleName,
      action,
      requestMethod: req.method,
      requestPath: req.originalUrl || req.path,
      responseStatus: res.statusCode,
      ipAddress: ipAddress || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: {
        query: req.query || {},
        body_keys: req.body ? Object.keys(req.body) : []
      }
    });
  });

  next();
};

module.exports = activityLogMiddleware;
