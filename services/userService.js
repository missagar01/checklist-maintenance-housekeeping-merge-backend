import {pool} from "../config/db.js";

export const updateEmpImageService = async (userId, imageUrl) => {
    if (!imageUrl) {
        const err = new Error("Image URL is required");
        err.statusCode = 400;
        throw err;
    }

    const result = await pool.query(
        `
        UPDATE users
        SET emp_image = $1
        WHERE id = $2
        RETURNING id, emp_image
        `,
        [imageUrl, userId]
    );

    if (result.rowCount === 0) {
        const err = new Error("User not found");
        err.statusCode = 404;
        throw err;
    }

    return result.rows[0];
};
