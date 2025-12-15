import { insertMachine, getAllMachines } from "../../services/maintenance-serices/machineServices.js";
import { uploadMaintenanceImageToS3 } from "../../middleware/s3Upload.js";

export const createMachine = async (req, res) => {
  try {
    const body = req.body;
    let userManualUrl = null;
    let purchaseBillUrl = null;

    // ✅ Upload files to S3
    if (req.files?.user_manual?.[0]) {
      userManualUrl = await uploadMaintenanceImageToS3(req.files.user_manual[0]);
    }
    if (req.files?.purchase_bill?.[0]) {
      purchaseBillUrl = await uploadMaintenanceImageToS3(req.files.purchase_bill[0]);
    }

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
      user_manual: userManualUrl || null,
      purchase_bill: purchaseBillUrl || null,
      notes: body.notes || null,
      tag_no: body.tag_no || null,
      user_allot: body.user_allot || null,
    };

    const machine = await insertMachine(machineData);
    res.status(201).json({ success: true, data: machine });
  } catch (error) {
    console.error("Insert error:", error.message);
    res.status(500).json({ success: false, error: "Failed to insert machine" });
  }
};

export const fetchAllMachines = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const machines = await getAllMachines(limit, offset);

    return res.status(200).json({
      success: true,
      data: machines,
      page,
      nextPage: machines.length === limit ? page + 1 : null,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


