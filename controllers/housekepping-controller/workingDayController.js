import { workingDayRepository } from '../../repositories/workingDayRepository.js';

const workingDayController = {
  async list(_req, res, next) {
    try {
      const days = await workingDayRepository.findAll();
      res.json(days);
    } catch (err) {
      next(err);
    }
  }
};

export { workingDayController };
