// routes/settingRoutes.js
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getDepartments,
  getDepartmentsOnly,
  getGivenByData,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  patchSystemAccess,
  patchVerifyAccess,
  patchVerifyAccessDept
} from "../controllers/settingController.js";

const router = express.Router();

// Apply authMiddleware to all routes below
router.use(authMiddleware);

// USERS
router.get("/users", getUsers);
router.get("/users/:id", getUserById);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// DEPARTMENTS
router.get("/departments", getDepartments); // Gets all departments with given_by
router.get("/departments-only", getDepartmentsOnly); // Gets only unique department names
router.get("/given-by", getGivenByData); // Gets only unique given_by values
router.post("/departments", createDepartment);
router.put("/departments/:id", updateDepartment);
router.delete("/departments/:id", deleteDepartment);
router.patch("/users/:id/system_access", patchSystemAccess);
router.patch("/users/:id/verify-access", patchVerifyAccess);
router.patch("/users/:id/verify-access-dept", patchVerifyAccessDept);

export default router;
