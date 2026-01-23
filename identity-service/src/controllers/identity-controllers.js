const Refresh_Token = require("../models/RefreshToken");
const uniqueUser = require("../models/User");
const generateTokens = require("../utils/generateToken");
const logger = require("../utils/logger");
const { validateRegistration, validateLogin } = require("../utils/validation");

// REGISTER: Create new user account
const registerUser = async (req, res) => {
  logger.info("Registration endpoint hit...");
  try {
    // Step 1: Validate request body (email, username, password format)
    const { error } = validateRegistration(req.body);
    if (error) {
      logger.warn("Validation error", { message: error.details[0].message });
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }
    const { email, password, username } = req.body;

    // Step 2: Check if user already exists (by email OR username)
    let user = await uniqueUser.findOne({
      $or: [{ email }, { username }],
    });

    if (user) {
      logger.warn("User already exists", {
        email,
        username,
      });

      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // Step 3: Create new user (password will be hashed by pre-save hook)
    user = new uniqueUser({ username, email, password });
    await user.save();

    //this gives registered user's userID in console/terminal
    logger.info("User registered successfully", { userId: user._id }); // ✅ CORRECT //"_id " is coming from mongoDb

    const { accessToken, refreshToken } = await generateTokens(user);

    res.status(201).json({
      success: true,
      message: "User registered Successfully!",
      accessToken,
      refreshToken,
      userID: user._id,
    });

    /* gives output -> 
    {
    "success": true,
    "message": "User registered Successfully!",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTU0M2Q3NWQyOGQwODQ5ODMyYzBmN2YiLCJ1c2VybmFtZSI6IlJhdDYiLCJpYXQiOjE3NjcxMjg0MzgsImV4cCI6MTc2NzEzMjAzOH0.LG-lFh1hhdKHmMy_oEHsxhoxa1EWFBU_MkJ6brmixoI",
    "refreshToken": "c6d0dec3eaf47556b078329f773a13871035d602ed354eba036d7407cea94ac1e5ef86eedee0bb94",
    "userID": "69543d75d28d0849832c0f7f" }
    */
  } catch (e) {
    logger.error("Registration error occured", e);
    res.status(500).json({
      success: false,
      message: "registerUser : Internal server error",
    });
  }
};

// LOGIN: Authenticate user and return access/refresh tokens
const loginUser = async (req, res) => {
  logger.info("Login endpoint hit...");
  try {
    // Step 1: Validate request body using Joi schema
    // Checks if username and password are provided and valid format
    const { error } = validateLogin(req.body);
    if (error) {
      // If validation fails, return error with specific message
      logger.warn("Validation error", { message: error.details[0].message });
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    // Step 2: Extra safety check (optional, Joi already validates this)
    // Ensures req.body exists and has username AND password
    if (!req.body || (!req.body.username && !req.body.password)) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Step 3: Extract username and password from request
    const { username, password } = req.body;

    // Step 4: Find user in database by username
    // .select("+password") → Include password field (normally hidden for security)
    const user = await uniqueUser.findOne({ username }).select("+password");

    // Step 5: Check if user exists
    if (!user) {
      logger.warn("Invalid user");
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }
    /*Debug: Print received credentials
    console.log(`username:${username}`);
    console.log(`password:${password}`);
    */

    // Step 6: Compare plain password from request with hashed password in DB
    // comparePassword() uses argon2.verify() internally
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      logger.warn("Invalid password");
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Step 7: Password is correct, generate tokens
    // accessToken: Short-lived (15 min), used for API requests
    // refreshToken: Long-lived (7 days), used to get new accessToken
    const { accessToken, refreshToken } = await generateTokens(user);
    res.json({
      accessToken, // Use this for API requests
      refreshToken, // Store this securely, use to refresh tokens
      userID: user._id,
    });
    logger.info(`User logged in successfully with UserID: ${user._id}`);
  } catch (e) {
    // If any unexpected error occurs during login
    logger.error("Login error occured", e);
    res.status(500).json({
      success: false,
      message: "loginUser : Interval server error custom",
    });
  }
};

//refresh token
const refreshTokenUser = async (req, res) => {
  // Log that the refresh token endpoint was accessed for monitoring purposes in the console/terminal
  logger.info("login endpoint hit...");
  try {
    // Extract the refresh token from the request body
    const { refreshToken } = req.body;

    // Validate that a refresh token was provided in the request
    if (!refreshToken) {
      logger.warn("Refresh token is missing");
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Query the database to find the stored refresh token
    const storedToken = await Refresh_Token.findOne({ token: refreshToken });

    // Check if the token exists in the database and hasn't expired
    // Compare the token's expiration date with the current date
    if (!storedToken || storedToken.expiresAt < new Date()) {
      logger.warn("Invalid or expired refresh token");
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token custom",
      });
    }

    // Generate a new pair of access and refresh tokens for the user
    // This provides fresh credentials while maintaining the user's session
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await generateTokens(user);

    // Remove the old refresh token from the database to prevent reuse
    // This is a security measure called "refresh token rotation"
    await Refresh_Token.deleteOne({ _id: storedToken._id });

    // Send the new tokens back to the client
    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (e) {
    // Log any errors that occur during the refresh process
    logger.error("Login error occured", e);

    // Return a 500 Internal Server Error response
    // Note: There's a typo here - "jdon" should be "json"
    res.status(500).json({
      success: false,
      message: "refreshToken : Internal server error",
    });
  }
};

//logout
const logoutUser = async (req, res) => {
  logger.info("Logout endpoint hit...");
  try {
    // Extract the refresh token from the request body
    const { refreshToken } = req.body;

    // Validate that a refresh token was provided in the request
    // Without a refresh token, we cannot identify which session to terminate
    if (!refreshToken) {
      logger.warn("Refresh token missing");
      return res.status(400).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    // Delete the refresh token from the database to invalidate the user's session
    // This prevents the token from being used again to generate new access tokens
    await Refresh_Token.deleteOne({ token: refreshToken });

    // Log successful deletion of the refresh token
    logger.info("Refresh token deleted for logout");

    // Send success response to the client confirming logout
    res.json({
      success: true,
      message: "Logged out successfully!",
    });
  } catch (e) {
    logger.error("Error while logging out", e);
    res.status(500).json({
      success: false,
      message: "logout : Internal server error",
    });
  }
};

module.exports = { registerUser, loginUser, refreshTokenUser, logoutUser };
