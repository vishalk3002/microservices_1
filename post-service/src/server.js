require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Redis = require("ioredis");
const cors = require("cors");
const helmet = require("helmet");

const logger = require("./utils/logger");
const postRoutes = require("./routes/post-routes");
const errorHandler = require("./middleware/errorHandler");
const { authenticateRequest } = require("./middleware/authMiddleware");
const { connectToRabbitMQ } = require("./utils/rabbitmq");

const app = express();
const PORT = process.env.PORT || 3002;

/* -------------------- DB -------------------- */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("MongoDB connected"))
  .catch((err) => logger.error("Mongo error", err));

/* -------------------- REDIS -------------------- */
const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on("error", (err) => {
  logger.error("Redis connection error", err);
});

redisClient.on("connect", () => {
  logger.info("Redis connected successfully");
});

/* -------------------- GLOBAL MIDDLEWARE -------------------- */
app.use(helmet());
app.use(cors());
app.use(express.json());

/* -------------------- ROUTES -------------------- */
app.use(
  "/api/posts",
  authenticateRequest, // 1️⃣ AUTH FIRST

  //rate limiter in post-routes.js is trying to use req.redisClient, but it's being instantiated before the request even happens.You need to create the rate limiter inside the middleware where req.redisClient
  (req, res, next) => {
    req.redisClient = redisClient; // 3️⃣ REDIS INJECTION
    next();
  },
  postRoutes // 4️⃣ CONTROLLERS
);

/* -------------------- ERROR HANDLER -------------------- */
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();
    /* -------------------- START -------------------- */
    app.listen(PORT, () => {
      logger.info(`Post service running on port ${PORT}`);
    });
  } catch (e) {
    logger.error("Failed to connect to server", e);
    process.exit(1);
  }
}

startServer();

/* -------------------- SAFETY -------------------- */
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason);
});
