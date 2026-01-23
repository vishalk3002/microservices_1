const winston = require("winston");
//https://www.npmjs.com/package/winston

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug", //https://www.npmjs.com/package/winston#logging-levels
  format: winston.format.combine(
    //https://www.npmjs.com/package/winston#formats
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(), //String interpolation splat for %d %s-style messages.
    winston.format.json() //colorize() + json() together (conflicting), json() is for machine-readable logs,colorize() is for human-readable logs,Using both together is pointless and messy,Colorized JSON logs are useless (and sometimes broken)
  ),
  defaultMeta: { service: "api-gateway" },
  transports: [
    // Console → readable logs for dev
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),

    //Error logs
    new winston.transports.File({ filename: "error.log", level: "error" }),

    //All logs
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

module.exports = logger;
