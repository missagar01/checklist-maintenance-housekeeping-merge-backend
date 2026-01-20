import { refreshDeviceSync } from "../services/deviceSync.js";

export const syncDeviceLogs = async (req, res) => {
  try {
    const syncResult = await refreshDeviceSync();
    return res.json({
      success: true,
      message: "NotDone updated based on OUT punches",
      syncResult, // 👈 helpful for debugging
    });
  } catch (error) {
    console.log("SYNC ERROR:", error);
    return res.status(500).json({ error: "Device sync failed" });
  }
};
