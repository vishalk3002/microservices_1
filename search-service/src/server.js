require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Redis = require("ioredis");
const cors = require("cors");
const helmet = require("helmet");

const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const { authenticateRequest } = require("./middleware/authMiddleware");
const { connectToRabbitMQ, consumeEvent } = require("./utils/rabbitmq");

const searchRoutes = require("./routes/search-routes");
const {
  handlePostCreated,
  handlePostDeleted,
} = require("./eventHandlers/search-event-handlers");

const app = express();
const PORT = process.env.PORT || 3004;

/* -------------------- DB --------- ----------- */
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
app.use(express.json());
app.use(helmet());
app.use(cors());

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);

  //Don’t assume req.body always exists.
  if (req.body && Object.keys(req.body).length > 0) {
    logger.info("Request body:", req.body);
  } else {
    logger.info("Request body: <empty or stream>");
  }

  next();
});

/* -------------------- ROUTES -------------------- */
app.use(
  "/api/search",
  authenticateRequest, // 1️⃣ AUTH FIRST,
  //*** Homework - pass redis client as part of your req and then implement redis caching
  (req, res, next) => {
    req.redisClient = redisClient;
    next();
  },

  searchRoutes, // 4️⃣ CONTROLLERS
);

/* -------------------- ERROR HANDLER -------------------- */
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();
    /* -------------------- START -------------------- */
    await consumeEvent("post.created", handlePostCreated);
    await consumeEvent("post.deleted", handlePostDeleted);

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
