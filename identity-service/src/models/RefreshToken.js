const mongoose = require("mongoose");
// Define the schema for storing refresh tokens
//A database schema is the logical design or blueprint that defines how data is organized and structured within a database. It outlines the tables, columns, relationships, and constraints (like data types, primary and foreign keys, and unique constraints) that govern the data, but does not contain the actual data itself.
const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true, // Must always have a token
      unique: true, // Each token can only exist once (prevents duplicates)
    },
    // Reference to the User who owns this refresh token
    user: {
      type: mongoose.Schema.Types.ObjectId, // MongoDB's unique ID type
      ref: "User", // Links to the "User" model(The file name "User.js" that's why didn't use name "Users.js" etc)
      required: true, // Every token must belong to a user
    },
    // When this refresh token expires
    expiresAt: {
      type: Date, // JavaScript Date object
      required: true, // Example: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) = 7 days from now
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// TTL (Time-To-Live) Index: Automatically delete expired tokens
// This MongoDB feature automatically removes documents when expiresAt date is reached
// expireAfterSeconds: 0 means delete immediately when expiresAt time arrives
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Why this is useful:
// - No need to manually delete expired tokens
// - Keeps database clean automatically
// - MongoDB runs cleanup every 60 seconds by default

const Refresh_Token = mongoose.model("RefreshToken", refreshTokenSchema);
module.exports = Refresh_Token;

/*
═══════════════════════════════════════════════════════════════════
HOW THIS WORKS IN PRACTICE:

1. User logs in → You create a refresh token and save it to DB
   {
     token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     user: ObjectId("507f1f77bcf86cd799439011"),
     expiresAt: 2025-01-05T18:35:31.681Z,
     createdAt: 2024-12-29T18:35:31.681Z,
     updatedAt: 2024-12-29T18:35:31.681Z
   }

2. When refresh token expires on 2025-01-05, MongoDB automatically deletes it

3. If user tries to refresh after expiration, token doesn't exist in DB

4. User must login again to get new tokens

═══════════════════════════════════════════════════════════════════
KEY CONCEPTS:

✓ unique: true        → Only one copy of each token can exist
✓ ref: "User"         → Creates relationship between RefreshToken and User
✓ TTL Index           → Automatic cleanup of expired tokens
✓ timestamps: true    → Track when token was created/updated

═══════════════════════════════════════════════════════════════════
COMMON OPERATIONS:

// Save new refresh token
const newToken = new Refresh_Token({
  token: jwtToken,
  user: userId,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
});
await newToken.save();

// Find token to verify it exists
const storedToken = await Refresh_Token.findOne({ token: tokenValue });

// Delete token (logout)
await Refresh_Token.deleteOne({ token: tokenValue });

// Find all tokens for a user
const userTokens = await Refresh_Token.find({ user: userId });

═══════════════════════════════════════════════════════════════════
*/
