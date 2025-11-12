import {
  getTasksByMachineAndSerial,
  updateTask,
  getPendingTasksByMachine,
  getCompletedTasksByMachine, // ✅ import
} from "../services/taskDetailsServices.js";
import { uploadToS3 } from "../middleware/s3Upload.js";


/**
 * ✅ Get task details
 */
export const fetchTaskDetails = async (req, res) => {
  try {
    const { taskNo, serialNo, taskType } = req.params;
    console.log("🧾 Params:", req.params);

    if (!taskNo || !serialNo)
      return res.status(400).json({ success: false, error: "Task number and serial number are required" });

    const result = await getTasksByMachineAndSerial(taskNo, serialNo, taskType);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Error fetching task details:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Update task details
 */
export const updateTaskDetails = async (req, res) => {
  try {
    const { taskNo } = req.params;
    let updateData = { ...req.body };

    if (!taskNo) {
      return res.status(400).json({ success: false, error: "Task number is required" });
    }

    // ✅ Handle file upload if provided
    if (req.file) {
      const fileUrl = await uploadToS3(req.file);
      updateData.image_link = fileUrl;
      updateData.file_name = req.file.originalname;
      updateData.file_type = req.file.mimetype.split("/")[1];
    }

    // ✅ Continue to update DB
    const updatedTask = await updateTask(taskNo, updateData);

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("❌ Error updating task:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get pending tasks
 */
export const fetchPendingTasksForMachine = async (req, res) => {
  try {
    // path param from URL
    const { machineName } = req.params;
    // query param from ?serialNo=
    const { serialNo } = req.query;

    console.log("✅ Received:", { machineName, serialNo });

    if (!machineName || !serialNo) {
      return res.status(400).json({
        success: false,
        error: "Machine name and serial number are required",
      });
    }

    const pendingTasks = await getPendingTasksByMachine(machineName, serialNo);
    res.status(200).json({ success: true, data: pendingTasks });
  } catch (error) {
    console.error("❌ Error fetching pending tasks:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};




export const fetchCompletedTasksForMachine = async (req, res) => {
  try {
    const { machineName } = req.params;
    const { serialNo } = req.query;

    if (!machineName || !serialNo) {
      return res.status(400).json({
        success: false,
        error: "Machine name and serial number are required",
      });
    }

    const completedTasks = await getCompletedTasksByMachine(machineName, serialNo);
    res.status(200).json({ success: true, data: completedTasks });
  } catch (error) {
    console.error("❌ Error fetching completed tasks:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};