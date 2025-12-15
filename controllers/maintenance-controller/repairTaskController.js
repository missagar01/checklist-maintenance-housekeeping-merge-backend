import {
  insertRepairTask,
  getNextRepairTaskNumber,
  getAllRepairTasks
} from "../../services/maintenance-serices/repairTaskServices.js";

export const createRepairTask = async (req, res) => {
  try {
    const body = req.body;
    
    // Generate task number for repair
    const nextTaskNo = await getNextRepairTaskNumber();
    
    const nowIST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    // Handle image if uploaded (using multer)
    let imageLink = "";
    if (req.file) {
      // Store relative path
      imageLink = `/uploads/repair/${req.file.filename}`;
    }

    // Prepare task data - map frontend fields to repair_system table
    const taskData = {
      time_stamp: nowIST.toISOString(),
      task_no: nextTaskNo,
      serial_no: body.serial_no || body.tag_no || '',
      machine_name: body.machine_name || '',
      machine_part_name: body.part_name || '',
      given_by: body.given_by || '',
      doer_name: body.doer_name || '',
      problem_with_machine: body.description || '',
      enable_reminders: body.enable_reminders || false,
      require_attachment: body.require_attachment || false,
      task_start_date: body.task_start_date || null, // Format: "DD/MM/YYYY HH:MM:SS"
      task_ending_date: body.task_ending_date || null, // Format: "DD/MM/YYYY HH:MM:SS"
      priority: body.priority || 'Medium',
      department: body.department || '',
      location: body.location || '',
      image_link: imageLink
    };

    console.log("📝 Repair Task Data to Insert:", taskData);

    // Insert into repair system database only
    const inserted = await insertRepairTask(taskData);
    
    res.status(201).json({ 
      success: true, 
      data: inserted,
      message: "Repair task created successfully" 
    });
  } catch (error) {
    console.error("❌ Repair task creation error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create repair task"
    });
  }
};

export const getRepairTasks = async (req, res) => {
  try {
    const tasks = await getAllRepairTasks();
    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    console.error("❌ Fetch repair tasks error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};