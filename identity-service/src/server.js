// Load environment variables from .env file into process.env
require("dotenv").config();

//// Import Mongoose for MongoDB object modeling and database operations
const mongoose = require("mongoose");

// Import Express framework to build the web server and handle HTTP requests/responses
const express = require("express");

// Import Helmet to secure Express apps by setting various HTTP headers
const helmet = require("helmet");

// Import CORS to enable Cross-Origin Resource Sharing for API access from different domains
const cors = require("cors");

// Import rate limiter using Redis as storage for distributed rate limiting
const { RateLimiterRedis } = require("rate-limiter-flexible");

// Import Redis client to connect to Redis server for caching and rate limiting
const Redis = require("ioredis");

// Import express-rate-limit for additional rate limiting functionality
const { rateLimit } = require("express-rate-limit");

// Import RedisStore to use Redis as backend storage for express-rate-limi
const { RedisStore } = require("rate-limit-redis"); //https://www.npmjs.com/package/rate-limit-redis

// Import application routes for identity service endpoints
const routes = require("./routes/identity-service");

// Import centralized error handling middleware
const errorHandler = require("./middleware/errorHandler");

// Get the port number from environment variables
const PORT = process.env.PORT;

// Import custom logger utility for application logging
const logger = require("./utils/logger");

// Create an Express application instance to handle HTTP requests, routing, and middleware
const app = express();

// Connect to MongoDB database using connection string from environment variables
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("Connected to  mongoDB"))
  .catch((e) => logger.error("Mongo connection error", e));

// Create a Redis client instance for caching and rate limiting
// Connects to Redis server using URL from environment variables
const redisClient = new Redis(process.env.REDIS_URL);
redisClient.on("error", (err) => {
  logger.error("Redis connection error", err);
});

redisClient.on("connect", () => {
  logger.info("Redis connected successfully");
});

// === MIDDLEWARE SETUP ===

// Use Helmet to set security-related HTTP headers (protects against common vulnerabilities)
app.use(helmet());

// Enable CORS to allow requests from different origins/domains
app.use(cors());

// Parse incoming JSON request bodies and make data available in req.body
app.use(express.json());

// Custom logging middleware to track all incoming requests
app.use((req, res, next) => {
  // Log the HTTP method and URL of each incoming request
  logger.info(`Received ${req.method} request to ${req.url}`);

  // Log the request body for debugging purposes
  //logger.info(`Request body, ${req.body}`);
  //Don’t log full request bodies -> ❌ Can leak passwords / tokens
  logger.debug("Request received", {
    method: req.method,
    url: req.url,
  });

  // Pass control to the next middleware in the chain
  next();
});

// === RATE LIMITING SETUP ===

//rate-limiter-flexible counts and limits the number of actions by key and protects from DoS and brute force attacks at any scale
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient, // Use Redis to store rate limit counters
  keyPrefix: "middleware", // Prefix for Redis keys to avoid conflicts
  points: 10, // Maximum number of requests allowed
  duration: 1, // Time window in seconds (10 requests per 1 second)
});

// Apply global rate limiting middleware to all routes
app.use((req, res, next) => {
  rateLimiter
    .consume(req.ip) // Consume 1 point for this IP address
    .then(() => next()) // If within limit, proceed to next middleware
    .catch(() => {
      // If limit exceeded, log warning and return 429 Too Many Requests
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({ success: false, message: "Too many requests" });
    });
});

// Configure stricter rate limiting specifically for sensitive endpoints (login, register)// This provides additional protection against brute force attacks on authentication
//Ip based rate limiting for sensitive endpoints
const sensitiveEndpointsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Time window: 15 minutes
  max: 50, // Maximum 50 requests per window per IP
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers (deprecated)
  handler: (req, res) => {
    // Custom handler when rate limit is exceeded
    logger.warn(`Sensitive endpoint rate limit exceeded for IP:${req.ip}`);
    res.status(429).json({ success: false, message: "Too many requests" });
  },
  store: new RedisStore({
    // Use Redis to store rate limit data (enables distributed rate limiting)
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

// Apply the stricter rate limiter only to the registration endpoint.This prevents automated account creation and abuse
//apply this sensitiveEndpointsLimiter to our routes
app.use("/api/auth/register", sensitiveEndpointsLimiter);

// === ROUTES ===

// Mount all authentication-related routes under /api/auth path
app.use("/api/auth", routes);

// === ERROR HANDLING ===

// Global error handling middleware (should be last middleware)
// Catches any errors from previous middleware or route handlers
app.use(errorHandler);

// === SERVER STARTUP ===

// Start the Express server and listen for incoming requests on specified port
app.listen(PORT, () => logger.info(`Identity service running on port ${PORT}`));

// === GLOBAL ERROR HANDLERS ===

// Handle unhandled promise rejections (promises that reject without .catch()). This prevents the application from crashing silently
//The unhandledRejection handler is a safety net that catches async errors (rejected promises) that don't have try-catch or .catch() blocks.
process.on("unhandledRejection", (reason, promise) => {
  logger.error("unhandled Rejection at", promise, "reason:", reason);
  // In production, you might want to gracefully shut down the server here
});
