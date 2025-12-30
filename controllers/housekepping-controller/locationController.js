import { locationService } from '../../services/housekepping-services/locationService.js';

const locationController = {
  async list(req, res, next) {
    try {
      const locations = await locationService.listLocations();
      res.json(locations);
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { location } = req.body || {};

      if (!location || !location.toString().trim()) {
        return res.status(400).json({ message: 'Location is required' });
      }

      const created = await locationService.createLocation({
        location: location.toString(),
      });

      if (!created) {
        return res.status(500).json({ message: 'Failed to insert location' });
      }

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
};

export { locationController };
