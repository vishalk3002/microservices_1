const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  // Log full error (stack preferred)
  logger.error(err.stack || err.message);

  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
};

module.exports = errorHandler;
