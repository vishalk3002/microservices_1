const mongoose = require("mongoose");
const argon2 = require("argon2");

const userSchema = new mongoose.Schema(
  {
    // Unique username for the user
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true, // removes extra spaces
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    /* createdAt: {
      type: Date,
      default: Date.now,
    }, Mongoose automatically adds: createdAt,updatedAt
So your manual createdAt field is unnecessary.*/
  },
  {
    timestamps: true,
  }
);

// Keep this one (it's different - it's a text index for searching):
userSchema.index({ username: "text" });

// Pre-save middleware to hash password before saving
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    try {
      this.password = await argon2.hash(this.password, {
        // OPTIMIZATION: Better security options
        type: argon2.argon2id,
        memoryCost: 2 ** 16, // 65536 bytes
        timeCost: 3,
        parallelism: 1,
      });
    } catch (error) {
      return next(error);
    }
  }
});

// Instance method to compare login password with hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    // Verifies plain password against hashed password
    //return await argon2.verify(this.password, candidatePassword);
    if (!this.password) {
      throw new Error("Password hash missing from user document");
    }
    return await argon2.verify(this.password, candidatePassword);
  } catch (error) {
    throw error; // pass error to mongoose
  }
};

/*
"User" → database identity
uniqueUser → JS variable
module.exports → what other files receive */

// Create User model from schema
//"User" is NOT exported,"User" is only for Mongoose’s internal registry
const uniqueUser = mongoose.model("Microservices-User", userSchema); //// Use a separate collection name ("Microservices-User") to avoid conflicts with existing users in MongoDB

// Export User model
module.exports = uniqueUser;
