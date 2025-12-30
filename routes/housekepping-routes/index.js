import { Router } from 'express';
import { assignTaskRoutes } from './assignTaskRoutes.js';
import workingDayRoutes from './workingDayRoutes.js';
import uploadRoutes from './uploadRoutes.js';
// const authRoutes = require('./authRoutes');
import dashboardRoutes from './dashboardRoutes.js';
import locationRoutes from './locationRoutes.js';

const router = Router();

router.use('/assigntask', assignTaskRoutes);
router.use('/uploads', uploadRoutes);
router.use('/working-days', workingDayRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/locations', locationRoutes);

export default router;
