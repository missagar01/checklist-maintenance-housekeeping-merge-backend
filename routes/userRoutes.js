import express from "express";
import upload from "../middleware/s3Upload2.js";
import { patchEmpImage } from "../controllers/userController.js";

const router = express.Router();

router.patch(
    "/users/:id/emp-image",
    upload.single("emp_image"),
    patchEmpImage
);

export default router;
