require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Redis = require("ioredis");
const cors = require("cors");
const helmet = require("helmet");
const mediaRoutes = require("./routes/media-routes");
const logger = require("./utils/logger");

const errorHandler = require("./middleware/errorHandler");
const { connectToRabbitMQ, consumeEvent } = require("./utils/rabbitmq");
const { handlePostDeleted } = require("./eventHandlers/media-event-handlers");

const app = express();
const PORT = process.env.PORT || 3003;

//connect to mongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("Connected to mongoDB for media-service"))
  .catch((e) => logger.error("Mongo connection error", e));

app.use(cors());
app.use(helmet());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body, ${req.body}`);
  next();
});

//Routes
app.use("/api/media", mediaRoutes);

/* -------------------- ERROR HANDLER -------------------- */
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();

    //consume all the events
    //after this we need another folder for handling events so -> media-service/src/eventHandlers-> media-event-handlers.js
    await consumeEvent("post.deleted", handlePostDeleted);

    /* -------------------- START -------------------- */
    app.listen(PORT, () => {
      logger.info(`Media service running on port ${PORT}`);
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
