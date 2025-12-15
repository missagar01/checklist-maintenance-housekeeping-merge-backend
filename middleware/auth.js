import { verifyToken } from '../utils/jwt.js';
import { ApiError } from './errorHandler.js';
import config from '../utils/config.js';
import { isRevoked, revoke as revokeToken } from '../utils/tokenStore.js';

// Require Authorization: Bearer <token>; sets req.user on success.
// Revoked tokens persisted to disk (best-effort)

const getTokenFromHeader = (authHeader = '') => {
  const trimmed = authHeader.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(' ');
  if (token && /^bearer$/i.test(scheme)) return token;
  // fallback: if no scheme, treat whole header as token
  return trimmed;
};

const requireAuth = (req, _res, next) => {
  try {
    const token = getTokenFromHeader(req.headers.authorization);
    if (!token) throw new ApiError(401, 'Authorization token missing');
    if (isRevoked(token)) throw new ApiError(401, 'Token revoked');

    const payload = verifyToken(token, config.jwtSecret);
    req.user = payload;
    req.token = token;
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
};

const requireAdmin = (req, _res, next) => {
  try {
    let user = req.user;
    if (!user) {
      // Fallback: try to decode token if auth middleware was skipped
      const token = getTokenFromHeader(req.headers.authorization);
      if (token && !isRevoked(token)) {
        user = verifyToken(token, config.jwtSecret);
        req.user = user;
      }
    }
    const role = user && user.role ? String(user.role).toLowerCase() : '';
    if (role !== 'admin') {
      return next(new ApiError(403, 'Admin access required'));
    }
    return next();
  } catch (_e) {
    return next(new ApiError(403, 'Admin access required'));
  }
};

// module.exports = { requireAuth, requireAdmin, revokeToken, getTokenFromHeader };
export { requireAuth, requireAdmin, revokeToken, getTokenFromHeader };