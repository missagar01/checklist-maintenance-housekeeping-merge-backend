import {
  getMaintenanceTasks,
  getPendingMaintenanceTasks,
  getCompletedMaintenanceTasks,
  updateMaintenanceTask,
  getUniqueMachineNames,
  getUniqueAssignedPersonnel,
  getMaintenanceStatistics,
  getUniqueMaintenanceDepartments,
  getUniqueMaintenanceDoerName,
} from "../services/maintenanceServices.js";

// import { uploadToS3 } from "../middleware/s3Upload.js";
import upload, { uploadMaintenanceImageToS3 } from "../middleware/s3Upload.js";

/**
 * Get all maintenance tasks
 */
export const getMaintenanceTasksController = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const filters = {
      search: req.query.search || "",
      machineName: req.query.machineName || "",
      serialNo: req.query.serialNo || "",
      task_status: req.query.status || "",
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
      assignedTo: req.query.assignedTo || "",
      taskType: req.query.taskType || "",
      priority: req.query.priority || ""
    };

    const tasks = await getMaintenanceTasks(page, limit, filters);

    res.status(200).json({
      success: true,
      data: tasks,
      page,
      limit,
      hasMore: tasks.length === limit
    });
  } catch (error) {
    console.error("Error getting maintenance tasks:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * Get pending maintenance tasks
 */
export const getPendingMaintenanceTasksController = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const userId = req.query.userId || null;

    const tasks = await getPendingMaintenanceTasks(page, limit, userId);

    res.status(200).json({
      success: true,
      data: tasks,
      page,
      limit,
      hasMore: tasks.length === limit
    });
  } catch (error) {
    console.error("Error getting pending maintenance tasks:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * Get completed maintenance tasks
 */
export const getCompletedMaintenanceTasksController = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const filters = {
      search: req.query.search || "",
      machineName: req.query.machineName || "",
      serialNo: req.query.serialNo || "",
      assignedTo: req.query.assignedTo || "",
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || ""
    };

    // ✅ IMPORTANT LINE
    const userId = req.query.userId || null;

    const tasks = await getCompletedMaintenanceTasks(
      page,
      limit,
      filters,
      userId          // ✅ PASS USERID
    );

    res.status(200).json({
      success: true,
      data: tasks,
      page,
      limit,
      hasMore: tasks.length === limit
    });
  } catch (error) {
    console.error("Error getting completed maintenance tasks:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};



/**
 * Update maintenance task
 */
/**
 * Update maintenance task
 */
export const updateMaintenanceTaskController = async (req, res) => {
  try {
    const { taskId } = req.params;
    let updateData = { ...req.body };

    // Map frontend field names to database column names
    // In your controller, update the field mapping:
    const fieldMapping = {
      status: "task_status",
      sound_status: "sound_status",
      temperature_status: "temperature_status",
      remarks: "remarks",
      actual_date: "actual_date"
    };


    const mappedData = {};
    Object.keys(updateData).forEach(key => {
      if (fieldMapping[key]) {
        mappedData[fieldMapping[key]] = updateData[key];
      } else if (key !== "image") { // Handle image separately
        mappedData[key] = updateData[key];
      }
    });

    if (req.file) {
      const fileUrl = await uploadMaintenanceImageToS3(req.file); // <-- NEW BUCKET

      mappedData.image_link = fileUrl;
      mappedData.file_name = req.file.originalname;
      mappedData.file_type = req.file.mimetype.split("/")[1];
    }


    const updatedTask = await updateMaintenanceTask(taskId, mappedData);

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: updatedTask
    });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * Update multiple tasks
 */
export const updateMultipleMaintenanceTasksController = async (req, res) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0)
      return res.status(400).json({ success: false, error: "No tasks sent" });

    const results = [];
    const errors = [];

    // ✅ OPTIMIZED: Run multiple updates in PARALLEL
    await Promise.all(
      tasks.map(async (t) => {
        try {
          // 🔥 FIX: Convert "status" → "task_status"
          if (t.status !== undefined) {
            t.task_status = t.status;
            delete t.status;
          }

          // 🔥 Always remove frontend-sent actual_date (we don't need it)
          if (t.actual_date !== undefined) {
            delete t.actual_date;
          }

          const updated = await updateMaintenanceTask(t.taskId, t);
          results.push(updated);
        } catch (error) {
          errors.push({ taskId: t.taskId, error: error.message });
        }
      })
    );


    res.status(200).json({
      success: true,
      data: results,
      errors,
      summary: {
        total: tasks.length,
        updated: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error("Error updating multiple tasks:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * Get machine names
 */
export const getUniqueMachineNamesController = async (req, res) => {
  try {
    const data = await getUniqueMachineNames();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error getting machine names:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * Get assigned personnel names
 */
export const getUniqueAssignedPersonnelController = async (req, res) => {
  try {
    const data = await getUniqueAssignedPersonnel();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error getting personnel names:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * Get statistics
 */
export const getMaintenanceStatisticsController = async (req, res) => {
  try {
    const data = await getMaintenanceStatistics();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error getting statistics:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * Get unique maintenance departments
 */
export const getUniqueMaintenanceDepartmentsController = async (req, res) => {
  try {
    const data = await getUniqueMaintenanceDepartments();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error getting maintenance departments:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// get unique doername
export const getUniqueMaintenanceDoerNameController = async (req, res) => {
  try {
    const data = await getUniqueMaintenanceDoerName();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error getting maintenance doer names:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


