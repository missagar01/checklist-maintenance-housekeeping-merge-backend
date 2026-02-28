// routes/uploadRoutes.js
import express from "express";
import upload from "../../middleware/s3Upload1.js";
import { uploadToS3 } from "../../middleware/s3Upload1.js";

const router = express.Router();

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const url = await uploadToS3(req.file);
    res.status(200).json({ success: true, url });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, error: "File upload failed" });
  }
});

export default router;
