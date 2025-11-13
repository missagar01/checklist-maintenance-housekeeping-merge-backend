import {
  insertMaintenanceTask,
  getAllMaintenanceTasks,
  getNextTaskNumber,
} from "../services/maintenanceTaskService.js";

/**
 * ✅ Create new maintenance task
 */
// export const createMaintenanceTask = async (req, res) => {
//   try {
//     const body = req.body;

//     // 🧹 Clean and map fields properly
//     const taskData = {
//       time_stamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
//       task_no: body.task_no,
//       serial_no: body.serial_no,
//       machine_name: body.machine_name,
//       given_by: body.given_by,
//       doer_name: body.doer_name,
//       task_type: body.task_type,
//       machine_area: body.machine_area,
//       part_name: body.part_name,
//       need_sound_test: body.need_sound_test === "Yes" ? true : false,
//       temperature: body.temperature,
//       enable_reminders: body.enable_reminders === "Yes" ? true : false,
//       require_attachment: body.require_attachment === "Yes" ? true : false,
//       task_start_date: body.task_start_date, // "2025-11-10 09:00:00"
//       frequency: body.frequency,
//       description: body.description,
//       priority: body.priority,
//       department: body.department,
//     };

//     const inserted = await insertMaintenanceTask(taskData);
//     res.status(201).json({ success: true, data: inserted });
//   } catch (error) {
//     console.error("❌ Task insert error:", error.message);
//     res.status(500).json({
//       success: false,
//       error: error.message || "Failed to insert maintenance task",
//     });
//   }
// };


export const createMaintenanceTask = async (req, res) => {
  try {
    const body = req.body;

    // ✅ Generate next task number from DB
    const nextTaskNo = await getNextTaskNumber();

    const nowIST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );
    const taskData = {
      // time_stamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      // time_stamp: new Date().toISOString(),
      // Generates ISO format with IST correction

time_stamp: nowIST.toISOString(),

      task_no: nextTaskNo,
      serial_no: body.serial_no,
      machine_name: body.machine_name,
      given_by: body.given_by,
      doer_name: body.doer_name,
      task_type: body.task_type,
      machine_area: body.machine_area,
      part_name: body.part_name,
      need_sound_test: body.need_sound_test === "Yes" ? true : false,
      temperature: body.temperature,
      enable_reminders: body.enable_reminders === "Yes" ? true : false,
      require_attachment: body.require_attachment === "Yes" ? true : false,
      task_start_date: body.task_start_date,
      frequency: body.frequency,
      description: body.description,
      priority: body.priority,
      department: body.department,
    };

    const inserted = await insertMaintenanceTask(taskData);
    res.status(201).json({ success: true, data: inserted });
  } catch (error) {
    console.error("❌ Task insert error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to insert maintenance task",
    });
  }
};

/**
 * ✅ Fetch all maintenance tasks
 */
export const fetchAllMaintenanceTasks = async (req, res) => {
  try {
    const tasks = await getAllMaintenanceTasks();
    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    console.error("❌ Fetch error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
