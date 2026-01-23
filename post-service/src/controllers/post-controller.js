const Post = require("../models/Post");
const logger = require("../utils/logger");
const { publishEvent } = require("../utils/rabbitmq");
const { validateCreatePost } = require("../utils/validation");

/**
 * Cache invalidation strategy:
 * - Delete single post cache
 * - Increment posts version (NO KEYS, NO SCAN)
 */
async function invalidatePostCache(req, postId) {
  await req.redisClient.del(`post:${postId}`);
  await req.redisClient.incr("posts:version");
}

const createPost = async (req, res) => {
  logger.info("Create post endpoint hit");

  try {
    const { error } = validateCreatePost(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { content, mediaIds } = req.body;

    /*
await Post.create({...}) -> Why it saves without .save()
-> Model.create() does two things:
1) Creates a document
2) Immediately saves it to MongoDB */
    const post = await Post.create({
      user: req.user.userId,
      content,
      mediaIds: mediaIds || [],
    });

    await publishEvent("post.created", {
      postId: post._id.toString(),
      userId: post.user.toString(),
      content: post.content,
      createdAt: post.createdAt,
    });
    await invalidatePostCache(req, post._id.toString());

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      postId: post._id,
    });
  } catch (err) {
    logger.error("Error creating post", err);
    res.status(500).json({ success: false, message: "Error creating post" });
  }
};

const getAllPosts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // ✅ VERSIONED CACHE KEY
    const version = (await req.redisClient.get("posts:version")) || 1;
    const cacheKey = `posts:v${version}:${page}:${limit}`;

    const cached = await req.redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const [posts, total] = await Promise.all([
      Post.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Post.countDocuments(),
    ]);

    const response = {
      posts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total,
    };

    await req.redisClient.setex(cacheKey, 300, JSON.stringify(response));

    res.json(response);
  } catch (err) {
    logger.error("Error fetching posts", err);
    res.status(500).json({ success: false, message: "Error fetching posts" });
  }
};

const getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const cacheKey = `post:${postId}`;

    const cached = await req.redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    await req.redisClient.setex(cacheKey, 3600, JSON.stringify(post));

    res.json(post);
  } catch (err) {
    logger.error("Error fetching post", err);
    res.status(500).json({ success: false, message: "Error fetching post" });
  }
};

const deletePost = async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const deletedPost = await Post.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId,
    });

    if (!deletedPost) {
      return res.status(404).json({
        success: false,
        message: "Post not found or not owned by user",
      });
    }

    //publish post delete method -->
    await publishEvent("post.deleted", {
      postId: deletedPost._id.toString(),
      userId: req.user.userId,
      mediaIds: deletedPost.mediaIds,
    });

    await invalidatePostCache(req, deletedPost._id.toString());
    // await invalidatePostCache(req, req.params.id);

    res.json({
      success: true,
      message: "Post deleted successfully",
      deletedAt: new Date().toISOString(),
      post: {
        id: deletedPost._id,
        content: deletedPost.content,
        mediaIds: deletedPost.mediaIds,
        createdAt: deletedPost.createdAt,
        updatedAt: deletedPost.updatedAt,
      },
    });
  } catch (err) {
    logger.error("Error deleting post", err);
    res.status(500).json({ success: false, message: "Error deleting post" });
  }
};

module.exports = { createPost, getAllPosts, getPost, deletePost };

/*
Which one should you use (important)
✅ Best practice → use the DB source
await invalidatePostCache(req, deletedPost._id.toString());
Why this is better:
(1) Authoritative
-> Comes from MongoDB,Guaranteed to be the actual deleted record

(2) Safer in future refactors
-> If route param changes, If you delete by another field, If IDs are transformed

(3) Clear intent
-> “Invalidate cache for what was deleted”, Not “invalidate cache for what the client asked”

When "req.params.id" is acceptable
It’s fine when:

-> You already validated ownership
-> Deletion succeeded
-> Route structure is stable
But DB-first is cleaner.

One-line rule to remember:
If you have the DB document, use its ID.
If not, fall back to request params.
*/
