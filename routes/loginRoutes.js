// routes/loginRoutes.js
import express from "express";
import { loginUserController } from "../controllers/loginController.js";
import { logoutController } from "../controllers/logoutController.js";

const router = express.Router();

// POST /api/login
router.post("/", loginUserController);
router.post("/logout", logoutController);

export default router;
