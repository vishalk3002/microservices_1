const express = require("express");

const { RateLimiterRedis } = require("rate-limiter-flexible");
const Redis = require("ioredis");

const {
  createPost,
  getAllPosts,
  getPost,
  deletePost,
} = require("../controllers/post-controller");

const router = express.Router();

/* -------------------- REDIS -------------------- */
const redisClient = new Redis(process.env.REDIS_URL);

/* -------------------- RATE LIMIT (PER USER) -------------------- */
/* -------- CREATE POST RATE LIMITER -------- */
const createPostLimiter = new RateLimiterRedis({
  storeClient: redisClient, // will inject later
  points: 9,
  duration: 60,
  keyPrefix: "post:create:user",
});

/* -------- RATE LIMIT MIDDLEWARE -------- */
const limitCreatePost = async (req, res, next) => {
  try {
    await createPostLimiter.consume(req.user.userId);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many posts created. Please wait.",
    });
  }
};

router.post("/create-post", limitCreatePost, createPost); // ✅ LIMITED
router.get("/all-posts", getAllPosts);
router.get("/:id", getPost);
router.delete("/:id", deletePost);

module.exports = router;
