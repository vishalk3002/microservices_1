const Search = require("../models/Search");
const logger = require("../utils/logger");

//implement caching here for 2 to 5 min
const CACHE_TTL = 120; // 2 minutes (300 = 5 minutes)

const searchPostController = async (req, res) => {
  logger.info("Search endpoint hit!");

  try {
    const { query } = req.query;
    const redis = req.redisClient;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    const cacheKey = `search:${query.toLowerCase()}`;

    // 1️⃣ Redis GET
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.info("Redis cache HIT");
      return res.json(JSON.parse(cached));
    }

    logger.info("Redis cache MISS");

    // 2️⃣ MongoDB query
    const results = await Search.find(
      {
        $text: { $search: query },
      },
      {
        score: { $meta: "textScore" },
        //Limit fields returned (performance)
        content: 1,
        title: 1,
      },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(10);

    // 3️⃣ Redis SET with TTL
    await redis.set(cacheKey, JSON.stringify(results), "EX", CACHE_TTL);

    res.json(results);
  } catch (e) {
    logger.error("Error while searching post!!!", e);
    res.status(500).json({
      success: false,
      message: "Error  while searching post!!!",
    });
  }
};

module.exports = { searchPostController };
