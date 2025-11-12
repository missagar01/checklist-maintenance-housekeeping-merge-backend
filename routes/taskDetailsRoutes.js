import express from "express";
import {
  fetchTaskDetails,
  updateTaskDetails,
  fetchPendingTasksForMachine,
  fetchCompletedTasksForMachine, // ✅ new
} from "../controllers/taskDetailsController.js";
// import { upload } from "../middleware/s3Upload.js"; // ✅ import multer middleware
import upload, { uploadToS3 } from "../middleware/s3Upload.js";

const router = express.Router();

// ✅ Get pending tasks
router.get("/pending/:machineName", fetchPendingTasksForMachine);

router.get("/completed/:machineName", fetchCompletedTasksForMachine); // ✅ new route

// ✅ Get task details
router.get("/:taskNo/:serialNo/:taskType", fetchTaskDetails);

// ✅ Update task + upload image
router.put("/:taskNo", upload.single("file"), updateTaskDetails); // ✅ file field

export default router;
