// import { logger } from '../utils/logger.js';
import logger from '../utils/logger.js';


class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const notFoundHandler = (req, res) => {
  res.status(404).json({ message: 'Route not found' });
};

// Centralized error handler
const errorHandler = (err, req, res, _next) => {
  // Handle common Postgres duplicate key constraint
  if (err && err.code === '23505') {
    const message = err.detail || err.message || 'Duplicate key value violates unique constraint';
    const status = 409;
    logger.error({ err, path: req.path }, 'Request failed');
    return res.status(status).json({ message });
  }

  const status = err instanceof ApiError ? err.statusCode : 500;
  const body = {
    message: err.message || 'Internal server error',
    ...(err instanceof ApiError && err.details ? { details: err.details } : {})
  };

  logger.error({ err, path: req.path }, 'Request failed');
  res.status(status).json(body);
};

export { ApiError, notFoundHandler, errorHandler };
