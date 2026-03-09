import { Router } from 'express';
import { assignTaskController } from '../../controllers/housekepping-controller/assignTaskController.js';
import { validateBody } from '../../middleware/validate.js';
import { assignTaskSchema, updateAssignTaskSchema } from '../../models/assignTask.js';
import { fileURLToPath } from "url";


const router = Router();
// Require a valid token for all assignment routes; per-role filtering is handled inside controllers
// router.use(requireAuth);

const normalizeItem = (item) => {
  if (item && item.delay !== undefined) {
    const n = Number(item.delay);
    if (!Number.isNaN(n)) {
      item.delay = n;
    } else {
      delete item.delay;
    }
  }

  // Fix common key typos from clients
  if (item && item.sttaus !== undefined && item.status === undefined) {
    item.status = item.sttaus;
    delete item.sttaus;
  }
  if (item && item['remark:'] !== undefined && item.remark === undefined) {
    item.remark = item['remark:'];
    delete item['remark:'];
  }
};

const normalizeBody = (req, _res, next) => {
  if (Array.isArray(req.body)) {
    req.body.forEach((item) => normalizeItem(item));
  } else {
    normalizeItem(req.body);
  }
  next();
};

router
  .route('/generate')
  .get(assignTaskController.list)
  .post(
    normalizeBody,
    validateBody(assignTaskSchema),
    assignTaskController.generateFromWorkingDays
  );

router.get('/generate/stats', assignTaskController.stats);

router.get('/generate/overdue', assignTaskController.overdue);

router.get('/generate/not-done', assignTaskController.notDone);

router.get('/generate/today', assignTaskController.today);

router.get('/generate/tomorrow', assignTaskController.tomorrow);

router.get('/generate/today/count', assignTaskController.countToday);
router.get('/generate/tomorrow/count', assignTaskController.countTomorrow);
router.get('/generate/overdue/count', assignTaskController.countOverdue);
router.get('/generate/not-done/count', assignTaskController.countNotDone);

router.get('/generate/pending', assignTaskController.pending);

router.get('/generate/history', assignTaskController.history);

router.post('/generate/delete', assignTaskController.deleteBulk);

// Mark an assignment as confirmed (stores marker in attachment column)
router
  .route('/generate/confirm/bulk')
  .post(
    assignTaskController.confirmAttachmentBulk
  );

// Mark an assignment as confirmed (stores marker in attachment column)
router
  .route('/generate/:id/confirm')
  .post(
    assignTaskController.confirmAttachment
  )

router
  .route('/generate/:id')
  .get(assignTaskController.getById)
  .patch(
    normalizeBody,
    validateBody(updateAssignTaskSchema),
    assignTaskController.update
  )
  .delete(assignTaskController.remove);

export { router as assignTaskRoutes };
