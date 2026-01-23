const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    // Reference to the User who created this post
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", //References the "User" model (establishes relationship)
      required: true, // Every post must have a user
    },
    content: {
      type: String,
      required: true,
    },
    mediaIds: [
      // from "mediaUrls" to "mediaIds" b'se then it can also be fetched from "mediaDB" and "cloudinary storage"
      {
        type: String,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },

  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    // createdAt: set when document is first created
    // updatedAt: updated every time document is modified
  }
);

//because we will be having a diff service for search
postSchema.index({ content: "text" });

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
