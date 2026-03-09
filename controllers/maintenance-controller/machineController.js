import { insertMachine, getAllMachines } from "../../services/maintenance-serices/machineServices.js";

export const createMachine = async (req, res) => {
  try {
    const body = req.body;

    // ✅ Parse JSON strings if needed
    let maintenanceSchedule = body.maintenance_schedule;
    if (typeof maintenanceSchedule === "string") {
      try {
        maintenanceSchedule = JSON.parse(maintenanceSchedule);
      } catch {
        maintenanceSchedule = [];
      }
    }

    // ✅ Prepare data for DB
    const machineData = {
      serial_no: body.serial_no || null,
      machine_name: body.machine_name || null,
      purchase_date: body.purchase_date || null,
      purchase_price: body.purchase_price || null,
      vendor: body.vendor || null,
      model_no: body.model_no || null,
      warranty_expiration: body.warranty_expiration || null,
      manufacturer: body.manufacturer || null,
      maintenance_schedule: JSON.stringify(maintenanceSchedule),
      department: body.department || null,
      location: body.location || null,
      initial_maintenance_date: body.initial_maintenance_date || null,
      user_manual: null,
      purchase_bill: null,
      notes: body.notes || null,
      tag_no: body.tag_no || null,
      user_allot: body.user_allot || null,
    };

    const newMachine = await insertMachine(machineData);

    res.status(201).json({
      message: "Machine created successfully",
      machine: newMachine,
    });
  } catch (error) {
    console.error("❌ Machine Creation Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getMachines = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const machines = await getAllMachines(limit, offset);
    res.status(200).json({
      success: true,
      data: machines,
      page,
      nextPage: machines.length === limit ? page + 1 : null
    });
  } catch (error) {
    console.error("❌ Get Machines Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
