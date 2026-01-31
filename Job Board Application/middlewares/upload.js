import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure folders exist
const resumeDir = "uploads/resumes";
const imageDir = "uploads/images";

[resumeDir, imageDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "resume") cb(null, resumeDir);
    else if (file.fieldname === "image") cb(null, imageDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${req.user.id}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/x-pdf",
    "image/png",
    "image/jpeg",
    "image/jpg"
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    cb(new Error("Only PDF or image files are allowed"), false);
  } else {
    cb(null, true);
  }
};

// Export Multer
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});
