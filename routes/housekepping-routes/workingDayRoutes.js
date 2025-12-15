import { Router } from 'express';
import { workingDayController } from '../../controllers/housekepping-controller/workingDayController.js';


const router = Router();

router.get('/', workingDayController.list);

// module.exports = router;
export default router;
