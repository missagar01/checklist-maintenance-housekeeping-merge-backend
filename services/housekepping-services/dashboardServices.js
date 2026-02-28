import { assignTaskService } from '../../services/housekepping-services/assignTaskServices.js';

const getEndOfYesterday = () => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(23, 59, 59, 999);
  return cutoff;
};

class DashboardService {
  async summary(options = {}) {
    const cutoff = getEndOfYesterday();
    // Log the options being passed to aggregateStats for debugging
    const logger = (await import('../../utils/logger.js')).default;
    logger.info({
      department: options.department,
      departmentType: Array.isArray(options.department) ? 'array' : typeof options.department,
      departmentCount: Array.isArray(options.department) ? options.department.length : 'N/A',
      allOptions: options
    }, 'DashboardService.summary - calling aggregateStats with options');
    return assignTaskService.aggregateStats(cutoff, options);
  }

  async listDepartments() {
    return assignTaskService.listDepartments();
  }
}


const dashboardService = new DashboardService();

export { dashboardService };
