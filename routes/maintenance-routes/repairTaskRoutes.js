import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  createRepairTask,
  getRepairTasks
} from "../../controllers/maintenance-controller/repairTaskController.js";

const router = express.Router();

// Ensure upload directory exists
const uploadDir = 'uploads/repair';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'repair-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// POST → create repair task
router.post("/", upload.single('task_image'), createRepairTask);

// GET → fetch all repair tasks
router.get("/", getRepairTasks);

export default router;