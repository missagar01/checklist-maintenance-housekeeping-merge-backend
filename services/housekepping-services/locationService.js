import { locationRepository } from '../../repositories/locationRepository.js';

class LocationService {
  listLocations() {
    return locationRepository.listAll();
  }

  createLocation(payload) {
    return locationRepository.create(payload);
  }
}

const locationService = new LocationService();

export { locationService };
