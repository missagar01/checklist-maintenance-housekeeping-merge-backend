// controllers/logoutController.js
export const logoutController = (_req, res) => {
  try {
    return res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("Logout Error:", err);
    return res.status(500).json({ error: "Failed to log out" });
  }
};
