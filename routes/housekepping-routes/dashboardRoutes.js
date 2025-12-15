import { Router } from 'express';
import { dashboardController } from '../../controllers/housekepping-controller/dashboardController.js';
// import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

// router.use(requireAuth);
// router.use(requireAdmin);

router.get('/summary', dashboardController.getSummary);
router.get('/departments', dashboardController.getDepartments);

export default router;
