import { dashboardService } from '../../services/housekepping-services/dashboardServices.js';
import logger from '../../utils/logger.js';

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
  const role = req.user?.role ? String(req.user.role).toLowerCase() : '';
  
  // For user role, always use token-based department (user_access1 or user_access)
  if (role === 'user') {
    const userAccess1 = req.user?.user_access1 || req.user?.userAccess1 || '';
    if (userAccess1) {
      const departments = parseDepartments(userAccess1);
      if (departments.length > 0) {
        return departments;
      }
    }
    const userAccess = req.user?.user_access || req.user?.userAccess || req.user?.department || '';
    if (userAccess) {
      const departments = parseDepartments(userAccess);
      if (departments.length > 0) {
        return departments;
      }
    }
    return null; // Let service handle or return empty to show nothing
  }

  // For admin role, prioritize query parameter (explicit selection) over token
  // This allows admin to filter by department using dropdown
  const queryDept = req.query?.department;
  if (queryDept && queryDept !== 'all' && String(queryDept).trim() !== '') {
    const departments = parseDepartments(queryDept);
    if (departments.length > 0) {
      logger.info({ queryDept, parsedDepartments: departments }, 'Admin selected department from query');
      return departments;
    }
  }

  // Fallback to token-based department if no query parameter
  const userAccess1 = req.user?.user_access1 || req.user?.userAccess1 || '';
  if (userAccess1) {
    const departments = parseDepartments(userAccess1);
    if (departments.length > 0) {
      return departments;
    }
  }

  const userAccess = req.user?.user_access || req.user?.userAccess || req.user?.department || '';
  if (userAccess) {
    const departments = parseDepartments(userAccess);
    if (departments.length > 0) {
      return departments;
    }
  }

  return null; // No department filter
};

const dashboardController = {
  async getSummary(req, res, next) {
    try {
      // Use resolveDepartment to get department from token or query
      // This ensures user role gets filtered by user_access from token
      const department = resolveDepartment(req);
      // Log for debugging
      logger.info({ 
        department, 
        queryDept: req.query?.department,
        userRole: req.user?.role 
      }, 'Dashboard summary request');
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
