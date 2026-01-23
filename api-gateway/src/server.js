require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const logger = require("./utils/logger");
const proxy = require("express-http-proxy");
const errorHandler = require("./middleware/errorHandler");
const { validateToken } = require("./middleware/authMiddleware");

const app = express();

const PORT = process.env.PORT;

const redisClient = new Redis(process.env.REDIS_URL);

app.use(helmet());
app.use(cors());
app.use(express.json());

//rate limiting
const rateLimitOptions = rateLimit({
  windowMs: 15 * 60 * 1000, // Time window: 15 minutes
  max: 50, // Maximum 50 requests per window per IP address
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable deprecated X-RateLimit-* headers
  handler: (req, res) => {
    logger.warn(`Sensitive endpoint rate limit exceeded for IP:${req.ip}`);
    res.status(429).json({ success: false, message: "Too many requests" });
  },
  store: new RedisStore({
    // Use Redis to store rate limit counters (enables distributed rate limiting)
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

// Apply rate limiting to all routes in the API Gateway
app.use(rateLimitOptions);

// === REQUEST LOGGING MIDDLEWARE ===

// Log all incoming requests for monitoring and debugging
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body, ${req.body}`);
  // Pass control to the next middleware
  next();
});

// === PROXY CONFIGURATION ===

/*

more refined words ->
API Gateway Proxy Pattern:
- Client makes request to API Gateway: localhost:3000/v1/auth/register
- Gateway rewrites the path and forwards to Identity Service: localhost:3001/api/auth/register
- Identity Service processes the request and sends response back through the gateway
- This provides a unified entry point and abstracts backend service URLs from clients
{creating proxy ->  so that api-gateway/ sites eg -> v1/auth/register running at 3000 redirects to identity-service/sites eg -> api/auth/register running at 3001

finalResult -> localhost:3000/v1/auth/register -> localhost:3001/api/auth/register}

for this we use: "express-http-proxy" -> Express middleware to proxy request to "another host"/"backend services"  and pass response back to original caller. 
*/

// Configure common proxy options for all microservices
const proxyOptions = {
  // Transform the request path before forwarding to backend service
  // Converts /v1/* paths to /api/* paths
  proxyReqPathResolver: (req) => {
    return req.originalUrl.replace(/^\/v1/, "/api");
  },

  // Handle errors that occur during proxying
  proxyErrorhandler: (err, res, next) => {
    logger.error(`Proxy error:${err.message}`);
    res.status(500).json({
      message: `Internal server error`,
      error: err.message,
    });
  },
};

// === MICROSERVICE PROXIES ===
//MUst be xreated for each micro-service

// Set up proxy middleware to forward authentication requests to Identity Service
app.use(
  "/v1/auth", // Route pattern: Any request starting with /v1/auth will be intercepted. Example: /v1/auth/register, /v1/auth/login, /v1/auth/logout
  proxy(process.env.IDENTITY_SERVICE_URL, {
    // Target URL where requests will be forwarded. Example: If IDENTITY_SERVICE_URL = "http://localhost:3001". Then /v1/auth/register → http://localhost:3001/api/auth/register

    ...proxyOptions, // Spread operator: Include common proxy configuration. This adds: proxyReqPathResolver (path rewriting) and proxyErrorhandler

    //Decorator function to modify the request before forwarding to backend service
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      // proxyReqOpts: Request options object that will be sent to backend. srcReq: Original incoming request from the client

      // Ensure the Content-Type header is set to JSON
      // This guarantees backend service receives proper content type
      proxyReqOpts.headers["Content-Type"] = "application/json";

      // Return the modified request options to be sent to backend
      return proxyReqOpts;
    },

    // Decorator function to process the response from backend before sending to client
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      // proxyRes: Response object from the backend service
      // proxyResData: Raw response data (body) from backend
      // userReq: Original request from the client
      // userRes: Response object to send back to the client

      // Log the HTTP status code received from Identity Service. Useful for monitoring and debugging backend service health
      logger.info(
        `Response received from Identity service:${proxyRes.statusCode}`,
      );
      // Example log: "Response received from Identity service: 200"
      // or "Response received from Identity service: 401"

      // Return the response data unchanged to be sent back to the client
      // If you wanted to modify the response, you would transform proxyResData here
      return proxyResData;
    },
  }),
);

// set up proxy middleware for post-service
app.use(
  "/v1/posts",
  validateToken,
  proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Post service: ${proxyRes.statusCode}`,
      );

      return proxyResData;
    },
  }),
);

//add these after each service craeation that use api-gateway authentication
// set up proxy middleware for media-service
app.use(
  "/v1/media",
  validateToken,
  proxy(process.env.MEDIA_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
      if (!srcReq.headers["content-type"].startsWith("multipart/form-data")) {
        proxyReqOpts.headers["content-type"] = "application/json";
      }

      return proxyReqOpts;
    },

    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from media service: ${proxyRes.statusCode}`,
      );

      return proxyResData;
    },

    parseReqBody: false,
  }),
);

// set up proxy middleware for search-service
app.use(
  "/v1/search",
  validateToken,
  proxy(process.env.SEARCH_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Post service: ${proxyRes.statusCode}`,
      );

      return proxyResData;
    },
  }),
);

// === ERROR HANDLING ===

// Global error handling middleware (must be last middleware). Catches any errors from proxying or other middleware
app.use(errorHandler);

//setting up proxy for our post-service

app.listen(PORT, () => {
  logger.info(`API Gateway is running on port ${PORT}`);
  logger.info(
    `Identity service is running on port ${process.env.IDENTITY_SERVICE_URL}`,
  );
  logger.info(
    `Post service is running on port ${process.env.POST_SERVICE_URL}`,
  );

  logger.info(
    `Post service is running on port ${process.env.MEDIA_SERVICE_URL}`,
  );
  logger.info(
    `Post service is running on port ${process.env.SEARCH_SERVICE_URL}`,
  );
  logger.info(`Redis Url ${process.env.REDIS_URL}`);
});

/*
**API Gateway Architecture Overview:**
```
┌───────────┐
│   Client  │
│  (Browser)│
└──┬────────┘
   │ HTTP Request: 
   │ localhost:3000/v1/auth/register
   ▼
┌──────────────────────────────┐
│      API Gateway (Port 3000) │
│  - Rate Limiting             │
│  - Request Logging           │
│  - Path Rewriting (/v1 → /api│
│  - Security Headers          │
└───┬──────────────────────────┘
    │ Proxied Request: 
    │localhost:3001/api/auth/register
    ▼
┌─────────────────────────────┐
│ Identity Service (Port 3001)│
│  - Authentication           │
│  - User Management          │
│  - Token Generation         │
└────┬────────────────────────┘
     │ Response
     ▼
┌─────────────────────┐
│      API Gateway    │
│ - Logs Response     │
│ - Returns to Client │
└─────┬───────────────┘
      │
      ▼
┌─────────────┐
│   Client    │
│  Receives   │
│  Response   │
└─────────────┘

Benefits of this API Gateway pattern:
1. Single entry point - Clients only need to know one URL
2. Security - Rate limiting and security headers applied at gateway level
3. Abstraction - Backend service URLs hidden from clients
4. Monitoring - Centralized logging of all requests
5. Scalability - Easy to add more microservices behind the gateway
6. Flexibility - Can route to different services based on path
*/
