import { dashboardService } from '../../services/housekepping-services/dashboardServices.js';

// Helper function to resolve department from token or query (same logic as assignTaskController)
const parseDepartments = (value) => {
  if (!value) return [];
  if (typeof value !== 'string') return Array.isArray(value) ? value.map(d => d.replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
  
  return value
    .split(',')
    .map(d => {
      const normalized = d.replace(/\s+/g, ' ').trim();
      return normalized;
    })
    .filter(Boolean);
};

const resolveDepartment = (req) => {
  // For housekeeping, prioritize user_access1 over user_access
  // Prioritize user_access1 from token for housekeeping (if available)
  const userAccess1 = req.user?.user_access1 || req.user?.userAccess1 || '';
  if (userAccess1) {
    const departments = parseDepartments(userAccess1);
    if (departments.length > 0) {
      return departments;
    }
  }

  // Fallback to user_access if user_access1 is not available
  const userAccess = req.user?.user_access || req.user?.userAccess || req.user?.department || '';
  if (userAccess) {
    const departments = parseDepartments(userAccess);
    if (departments.length > 0) {
      return departments;
    }
  }

  const role = req.user?.role ? String(req.user.role).toLowerCase() : '';
  // For user role, require user_access1 or user_access
  if (role === 'user') {
    return null; // Let service handle or return empty to show nothing
  }

  // For other roles, fall back to query parameter
  const queryDept = req.query?.department;
  if (!queryDept) return null;
  
  const departments = parseDepartments(queryDept);
  return departments.length > 0 ? departments : null;
};

const dashboardController = {
  async getSummary(req, res, next) {
    try {
      // Use resolveDepartment to get department from token or query
      // This ensures user role gets filtered by user_access from token
      const department = resolveDepartment(req);
      const data = await dashboardService.summary({ department });
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async getDepartments(_req, res, next) {
    try {
      const departments = await dashboardService.listDepartments();
      res.json(departments);
    } catch (err) {
      next(err);
    }
  }
};

export { dashboardController };
