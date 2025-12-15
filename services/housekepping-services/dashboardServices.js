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
    return assignTaskService.aggregateStats(cutoff, options);
  }

  async listDepartments() {
    return assignTaskService.listDepartments();
  }
}


const dashboardService = new DashboardService();

export { dashboardService };
