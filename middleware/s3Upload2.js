import multer from "multer";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import dotenv from "dotenv";

dotenv.config();

// S3 Client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Multer (memory)
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Upload helper
export const uploadToS3 = async (file) => {
    const key = `emp/${Date.now()}_${file.originalname}`;

    const uploadTask = new Upload({
        client: s3,
        params: {
            Bucket: process.env.AWS_EMP_IMG_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        }
    });

    const result = await uploadTask.done();

    // Public URL
    return `https://${process.env.AWS_EMP_IMG_BUCKET_NAME}.s3.amazonaws.com/${key}`;
};

export default upload;