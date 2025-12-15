import { getDepartments } from "../../services/maintenance-serices/departmentServices.js";

export const fetchDepartments = async (req, res) => {
  try {
    const departments = await getDepartments();
    res.status(200).json({ success: true, data: departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, error: "Failed to fetch departments" });
  }
};
