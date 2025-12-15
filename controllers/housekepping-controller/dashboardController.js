import { dashboardService } from '../../services/housekepping-services/dashboardServices.js';

const dashboardController = {
  async getSummary(req, res, next) {
    try {
      const { department } = req.query;
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
