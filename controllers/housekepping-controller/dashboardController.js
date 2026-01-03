import { dashboardService } from '../../services/housekepping-services/dashboardServices.js';
import logger from '../../utils/logger.js';

// Helper function to decode URL-encoded header values (handles non-ASCII characters like Hindi)
const decodeHeader = (value) => {
  if (!value) return '';
  try {
    // Decode URL-encoded values (handles non-ASCII characters)
    return decodeURIComponent(String(value));
  } catch (e) {
    // If decoding fails, return original value
    return String(value);
  }
};

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
  // Express lowercases all header names, so 'x-user-role' becomes 'x-user-role'
  // Try both lowercase and original case for compatibility
  const role = req.headers['x-user-role'] || req.headers['X-User-Role'] || req.query?.role || '';
  const roleLower = role ? String(role).toLowerCase() : '';
  
  // Log all relevant headers for debugging
  const relevantHeaders = {
    'x-user-role': req.headers['x-user-role'],
    'x-user-access1': req.headers['x-user-access1'],
    'x-user-access': req.headers['x-user-access'],
    'X-User-Role': req.headers['X-User-Role'],
    'X-User-Access1': req.headers['X-User-Access1'],
    'X-User-Access': req.headers['X-User-Access']
  };
  
  // For user role, ALWAYS use user_access1 from request header or query parameter
  // IGNORE query department parameter - users cannot override their department access
  // Return all departments from user_access1 so user can see all their department data
  if (roleLower === 'user') {
    // Get user_access1 from header or query parameter (not from JWT token)
    // Try both lowercase and original case, and decode URL-encoded values
    const userAccess1Raw = req.headers['x-user-access1'] || req.headers['X-User-Access1'] || req.query?.user_access1 || '';
    const userAccess1 = decodeHeader(userAccess1Raw);
    if (userAccess1) {
      const departments = parseDepartments(userAccess1);
      if (departments.length > 0) {
        logger.info({ 
          userAccess1, 
          parsedDepartments: departments,
          departmentCount: departments.length,
          role: 'user',
          queryDept: req.query?.department,
          headers: relevantHeaders,
          note: 'Query department parameter ignored for user role - using user_access1 from header/query'
        }, 'User department resolved from user_access1 header/query (query dept ignored)');
        return departments;
      }
    }
    // Fallback to user_access if user_access1 is not available
    const userAccessRaw = req.headers['x-user-access'] || req.headers['X-User-Access'] || req.query?.user_access || '';
    const userAccess = decodeHeader(userAccessRaw);
    if (userAccess) {
      const departments = parseDepartments(userAccess);
      if (departments.length > 0) {
        logger.info({ 
          userAccess, 
          parsedDepartments: departments,
          departmentCount: departments.length,
          role: 'user',
          queryDept: req.query?.department,
          headers: relevantHeaders,
          note: 'Query department parameter ignored for user role - using user_access from header/query'
        }, 'User department resolved from user_access header/query (query dept ignored)');
        return departments;
      }
    }
    // If no departments found, return null to show no data (user should have at least one department)
    logger.warn({ 
      role: 'user',
      queryDept: req.query?.department,
      headers: relevantHeaders,
      allHeaders: Object.keys(req.headers).filter(h => h.toLowerCase().includes('user')),
      note: 'User has no department access - returning null'
    }, 'User has no department access - returning null');
    return null;
  }

  // For admin role: Only filter if query parameter explicitly provides a department
  // If no query parameter, show ALL data (ignore headers - admin should see everything by default)
  const queryDept = req.query?.department;
  if (queryDept && queryDept !== 'all' && String(queryDept).trim() !== '') {
    const departments = parseDepartments(queryDept);
    if (departments.length > 0) {
      logger.info({ 
        queryDept, 
        parsedDepartments: departments,
        role: 'admin',
        note: 'Admin explicitly selected department from query - filtering by selected department'
      }, 'Admin selected department from query');
      return departments;
    }
  }

  // For admin: If no query parameter, return null to show ALL data
  // Do NOT use headers (user_access1) for admin - admin should see all data by default
  logger.info({ 
    role: 'admin',
    queryDept: req.query?.department,
    note: 'Admin with no explicit department filter - showing ALL data (ignoring headers)'
  }, 'Admin - No department filter - showing all data');
  return null; // No department filter - show all data
};

const dashboardController = {
  async getSummary(req, res, next) {
    try {
      // Use resolveDepartment to get department from headers/query (not JWT token)
      // This ensures user role gets filtered by user_access1 from headers
      const department = resolveDepartment(req);
      
      // Enhanced logging for debugging
      const headers = {
        'x-user-role': req.headers['x-user-role'],
        'x-user-access1': req.headers['x-user-access1'],
        'x-user-access': req.headers['x-user-access']
      };
      
      logger.info({ 
        department, 
        departmentType: Array.isArray(department) ? 'array' : typeof department,
        departmentLength: Array.isArray(department) ? department.length : 'N/A',
        queryDept: req.query?.department,
        userRole: req.headers['x-user-role'] || req.query?.role,
        userAccess1: req.headers['x-user-access1'] || req.query?.user_access1,
        userAccess: req.headers['x-user-access'] || req.query?.user_access,
        allHeaders: headers,
        note: 'Dashboard summary - filtering by department from headers/query'
      }, 'Dashboard summary request');
      
      // IMPORTANT: For user role, if no department is resolved, return zero counts
      // This prevents showing all data when user_access1 is missing
      const role = req.headers['x-user-role'] || req.headers['X-User-Role'] || req.query?.role || '';
      const roleLower = role ? String(role).toLowerCase() : '';
      
      if (roleLower === 'user' && !department) {
        logger.warn({
          role: 'user',
          headers: {
            'x-user-role': req.headers['x-user-role'],
            'x-user-access1': req.headers['x-user-access1'],
            'x-user-access': req.headers['x-user-access']
          },
          note: 'User role with no department access - returning zero counts'
        }, 'Dashboard summary - User with no departments');
        
        return res.json({
          total: 0,
          completed: 0,
          pending: 0,
          upcoming: 0,
          overdue: 0,
          progress_percent: 0
        });
      }
      
      const data = await dashboardService.summary({ department });
      
      // Log the result counts for verification
      logger.info({
        result: {
          total: data.total,
          completed: data.completed,
          pending: data.pending,
          upcoming: data.upcoming,
          overdue: data.overdue
        },
        department,
        departmentType: Array.isArray(department) ? 'array' : typeof department,
        departmentCount: Array.isArray(department) ? department.length : 'N/A',
        role: roleLower,
        note: 'Dashboard summary result'
      }, 'Dashboard summary response');
      
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
  },

  // Debug endpoint to check headers and department resolution
  async debug(req, res, next) {
    try {
      const department = resolveDepartment(req);
      const role = req.headers['x-user-role'] || req.headers['X-User-Role'] || req.query?.role || '';
      const userAccess1 = req.headers['x-user-access1'] || req.headers['X-User-Access1'] || req.query?.user_access1 || '';
      
      res.json({
        role,
        userAccess1,
        department,
        departmentType: Array.isArray(department) ? 'array' : typeof department,
        departmentCount: Array.isArray(department) ? department.length : 'N/A',
        headers: {
          'x-user-role': req.headers['x-user-role'],
          'x-user-access1': req.headers['x-user-access1'],
          'x-user-access': req.headers['x-user-access'],
          'X-User-Role': req.headers['X-User-Role'],
          'X-User-Access1': req.headers['X-User-Access1'],
          'X-User-Access': req.headers['X-User-Access']
        },
        allHeaders: Object.keys(req.headers).filter(h => h.toLowerCase().includes('user')),
        query: req.query
      });
    } catch (err) {
      next(err);
    }
  }
};

export { dashboardController };
