import { Router } from 'express';
import { assignTaskRoutes } from './assignTaskRoutes.js';
import workingDayRoutes from './workingDayRoutes.js';
import uploadRoutes from './uploadRoutes.js';
// const authRoutes = require('./authRoutes');
import dashboardRoutes from './dashboardRoutes.js';
// const userRoutes = require('./userRoutes');

const router = Router();

// router.use('/auth', authRoutes);
router.use('/assigntask', assignTaskRoutes);
router.use('/uploads', uploadRoutes);
router.use('/working-days', workingDayRoutes);
router.use('/dashboard', dashboardRoutes);
// router.use('/users', userRoutes);

export default router;
