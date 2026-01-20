import { uploadToS3 } from "../middleware/s3Upload2.js";
import { updateEmpImageService } from "../services/userService.js";

export const patchEmpImage = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!req.file) {
            return res.status(400).json({ message: "Image file is required" });
        }

        // Upload to S3
        const imageUrl = await uploadToS3(req.file);

        // Update DB
        const user = await updateEmpImageService(id, imageUrl);

        res.json({
            message: "Employee image updated successfully",
            user,
        });
    } catch (err) {
        console.error("Patch Emp Image Error:", err.message);
        next(err);
    }
};
