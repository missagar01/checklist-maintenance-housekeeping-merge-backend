import { addNewChecklistTaskService } from "../services/AddNewTask.service.js";

export const addNewTaskController = async (req, res) => {
  try {
    const task = await addNewChecklistTaskService(req.body);

    return res.status(201).json({
      success: true,
      message: "Checklist task added successfully",
      data: task,
    });
  } catch (error) {
    console.error("Add checklist task error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add checklist task",
      error: error.message,
    });
  }
};
