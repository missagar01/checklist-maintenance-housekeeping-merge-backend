import { Router } from 'express';
import { locationController } from '../../controllers/housekepping-controller/locationController.js';

const router = Router();

router.get('/', locationController.list);
router.post('/',  locationController.create);

export default router;
