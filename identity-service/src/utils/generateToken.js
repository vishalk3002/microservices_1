const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Refresh_Token = require("../models/RefreshToken");

const generateTokens = async (user) => {
  // Defensive check — fail fast ,Helps avoid silent failures.
  if (!user?._id) {
    throw new Error("Invalid user object");
  }

  const accessToken = jwt.sign(
    {
      userId: user._id, //"_id " is coming from mongoDb
      username: user.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: "60m" } //in real life if there is no movement for 5 min from client side then ask user do you want to continue if activity detected cancel logout else logout
    /*Production often uses:
       -> 5–15 minutes
       -> Silent refresh using refresh token*/
  );
  /*Refresh token should be hashed in DB
If DB leaks, attackers can use tokens directly.
  const refreshToken = crypto.createHash("sha256").update(token).digest("hex")
*/
  const refreshToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); //refresh token expires in 7 days

  await Refresh_Token.create({
    token: refreshToken,
    user: user._id,
    expiresAt,
  });

  return { accessToken, refreshToken };
};

module.exports = generateTokens;

//this code is not production based , that code takes years to build , any youtube video telling you they can do it in single video they are lying
