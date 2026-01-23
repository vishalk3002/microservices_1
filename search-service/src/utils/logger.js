const winston = require("winston");

// Create logger instance with configuration
const logger = winston.createLogger({
  // Set log level based on environment
  // Production: only "info" and above (info, warn, error)
  // Development: "debug" and above (all levels)
  level: process.env.NODE_ENV === "production" ? "info" : "debug",

  //// Combine multiple format options
  format: winston.format.combine(
    // Add timestamp to each log (when it happened)
    winston.format.timestamp(),

    // Include error stack traces in logs
    winston.format.errors({ stack: true }),

    // Enable string interpolation like console.log
    // Example: logger.info("User %s logged in", username)
    winston.format.splat(),

    // Format logs as JSON (machine-readable for log aggregation services)
    // NOT combining with colorize() because JSON can't have colors
    winston.format.json()
    //colorize() + json() together (conflicting), json() is for machine-readable logs,colorize() is for human-readable logs,Using both together is pointless and messy,Colorized JSON logs are useless (and sometimes broken)
  ),
  // Add this metadata to every log automatically
  defaultMeta: { service: "search-service" },

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
    // File: error.log
    //Error logs
    new winston.transports.File({
      filename: "error.log",
      level: "error", // Only log errors here
    }),

    // Transport 3: All logs file
    // Saves ALL logs (info, warn, error, debug, etc)
    // File: combined.log
    //All logs
    new winston.transports.File({
      filename: "combined.log", // No level specified = captures all levels
    }),
  ],
});

module.exports = logger;
