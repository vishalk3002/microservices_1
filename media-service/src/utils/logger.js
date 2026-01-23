const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",

  format: winston.format.combine(
    winston.format.timestamp(),

    winston.format.errors({ stack: true }),

    winston.format.splat(),

    winston.format.json()
  ),
  // Add this metadata to every log automatically
  defaultMeta: { service: "media-service" },

  // Define where logs are written
  transports: [
    // Transport 1: Console (for development)
    // Readable, colorized output for developers
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),

    // Transport 2: Error log file
    // Only saves logs with level "error"

    new winston.transports.File({
      filename: "error.log",
      level: "error", // Only log errors here
    }),

    // Transport 3: All logs file

    new winston.transports.File({
      filename: "combined.log", // No level specified = captures all levels
    }),
  ],
});

module.exports = logger;
