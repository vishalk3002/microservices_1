const express = require("express");
const multer = require("multer");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const Redis = require("ioredis");

const {
  uploadMedia,
  getAllMedias,
} = require("../controllers/media-controller");
const logger = require("../utils/logger");

const { authenticateRequest } = require("../middleware/authMiddleware");

const router = express.Router();

/* -------------------- REDIS -------------------- */
const redisClient = new Redis(process.env.REDIS_URL);

const mediaRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 13, // 13 requests
  duration: 60, // per 60 seconds
  keyPrefix: "post:upload:user",
});

/* -------- RATE LIMIT MIDDLEWARE -------- */
const limitMediaUpload = async (req, res, next) => {
  try {
    await mediaRateLimiter.consume(req.user.userId);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "upload rate limit exceeded",
    });
  }
};

//configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("file");

router.post(
  "/upload",
  authenticateRequest,
  limitMediaUpload,
  (req, res, next) => {
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        logger.error("Multer error while uploading:", err);
        return res.status(400).json({
          message: "Multer error while uploading:",
          error: err.message,
          stack: err.stack,
        });
      } else if (err) {
        logger.error("Unknown error occured while uploading:", err);
        return res.status(500).json({
          message: "Unknown error occured while uploading!!!",
          error: err.message,
          stack: err.stack,
        });
      }
      if (!req.file) {
        return res.status(400).json({
          message: "No file found",
        });
      }
      next();
    });
  },
  uploadMedia
);

router.get("/get", authenticateRequest, getAllMedias);

module.exports = router;
