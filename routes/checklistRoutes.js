import express from "express";
import {
  getPendingChecklist,
  getChecklistHistory,
  updateChecklist,
  adminDoneChecklist,
  updateHrManagerChecklist,
  rejectHrManagerChecklist,
  submitChecklistRemarkAndUserStatus,
  patchChecklistStatus,
  getChecklistForHrApproval,
  getChecklistDepartments,
  getChecklistDoers
} from "../controllers/checklistController.js";

const router = express.Router();

router.get("/pending", getPendingChecklist);
router.get("/history", getChecklistHistory);
router.post("/update", updateChecklist);
router.post("/user-status", submitChecklistRemarkAndUserStatus);
router.patch("/admin-status", patchChecklistStatus);
router.post("/admin-done", adminDoneChecklist);
router.patch("/admin-role", updateHrManagerChecklist);
router.patch("/reject-role", rejectHrManagerChecklist);
router.get("/hr-manager", getChecklistForHrApproval);
router.get("/departments", getChecklistDepartments);
router.get("/doers", getChecklistDoers);

export default router;
