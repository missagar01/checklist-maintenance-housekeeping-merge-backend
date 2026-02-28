// s3Upload.js
import multer from "multer";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import dotenv from "dotenv";

dotenv.config();

// 1️⃣ Initialize S3 client (AWS SDK v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION, // e.g. "us-east-1"
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2️⃣ Multer setup (store in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 3️⃣ Upload function to S3
export const uploadToS3 = async (file) => {
  try {
    console.log("🚀 uploadToS3 called with:", {
      name: file.originalname,
      type: file.mimetype,
      size: file.buffer?.length
    });

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `uploads/${Date.now()}_${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    const parallelUploads3 = new Upload({
      client: s3,
      params,
    });

    const result = await parallelUploads3.done();
    console.log("✅ Uploaded to S3:", result.Location || params.Key);

    return `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${params.Key}`;
  } catch (err) {
    console.error("❌ Error uploading to S3:", err);
    throw err;
  }
};


export default upload;


export const uploadMaintenanceImageToS3 = async (file) => {
  try {
    const bucket = process.env.MAINTENANCE_BUCKET_NAME; // new-machine-image
    if (!bucket) throw new Error("MAINTENANCE_BUCKET_NAME is missing");

    const params = {
      Bucket: bucket,
      Key: `maintenance/${Date.now()}_${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    const uploadTask = new Upload({
      client: s3,
      params,
    });

    const result = await uploadTask.done();

    return `https://${bucket}.s3.amazonaws.com/${params.Key}`;
  } catch (err) {
    console.error("❌ Maintenance image upload error:", err);
    throw err;
  }
};