import express from "express";
import {
  fetchChecklist,
  fetchDelegation,
  deleteChecklistTasks,
  deleteDelegationTasks,
  updateChecklistTask,
  fetchUsers
} from "../controllers/quickTaskController.js";

const router = express.Router();

router.get("/checklist", async (req, res) => {
  const {
    page = 0,
    pageSize = 50,
    nameFilter = ""
  } = req.query;

  const result = await fetchChecklist(
    Number(page),
    Number(pageSize),
    nameFilter
  );

  res.json(result);
});

/**
 * GET DELEGATION (UNIQUE TASKS)
 * Example:
 * /delegation?page=0&pageSize=50&nameFilter=John
 */
router.get("/delegation", async (req, res) => {
  const {
    page = 0,
    pageSize = 50,
    nameFilter = ""
  } = req.query;

  const result = await fetchDelegation(
    Number(page),
    Number(pageSize),
    nameFilter
  );

  res.json(result);
});

router.post("/delete-checklist", async (req, res) => {
  const result = await deleteChecklistTasks(req.body.tasks);
  res.json(result);
});

router.post("/delete-delegation", async (req, res) => {
  const result = await deleteDelegationTasks(req.body.taskIds);
  res.json(result);
});

router.post("/update-checklist", async (req, res) => {
  try {
    const { updatedTask, originalTask } = req.body;
    
    if (!updatedTask) {
      return res.status(400).json({ error: "updatedTask is required" });
    }

    if (!updatedTask.task_id) {
      return res.status(400).json({ error: "task_id is required in updatedTask" });
    }

    const result = await updateChecklistTask(updatedTask, originalTask);
    res.json(result);
  } catch (error) {
    console.error("Error in update-checklist route:", error);
    res.status(500).json({ error: error.message || "Failed to update checklist task" });
  }
});

router.get("/users", async (req, res) => {
  const result = await fetchUsers();
  res.json(result);
});

export default router;
