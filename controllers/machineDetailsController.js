import * as machineService from "../services/machineDetailsServices.js";

export const getAllMachines = async (req, res) => {
  try {
    const data = await machineService.getAllMachines();
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error fetching machines:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getMachineBySerial = async (req, res) => {
  try {
    const { serialNo } = req.params;
    const machine = await machineService.getMachineBySerial(serialNo);
    if (!machine) return res.status(404).json({ success: false, error: "Machine not found" });
    res.json({ success: true, data: machine });
  } catch (err) {
    console.error("Error fetching machine:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const updateMachine = async (req, res) => {
  try {
    const { serialNo } = req.params;
    const updatedData = req.body;
    const updated = await machineService.updateMachine(serialNo, updatedData);
    if (!updated) return res.status(404).json({ success: false, error: "Machine not found" });
    res.json({ success: true, message: "Machine updated successfully" });
  } catch (err) {
    console.error("Error updating machine:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getMachineHistory = async (req, res) => {
  try {
    const { serialNo } = req.params;
    console.log("🟢 getMachineHistory called with serialNo:", serialNo);

    const data = await machineService.getMachineHistory(serialNo);
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Error fetching history:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
