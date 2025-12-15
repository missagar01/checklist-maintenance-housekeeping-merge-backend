import { ApiError } from './errorHandler.js';

const validateBody = (schema) => (req, _res, next) => {
  const input = req.body === undefined ? {} : req.body;
  const result = schema.safeParse(input);
  if (!result.success) {
    return next(new ApiError(400, 'Validation failed', result.error.format()));
  }
  req.body = result.data;
  next();
};

export { validateBody };
