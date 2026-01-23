const cloudinary = require("cloudinary").v2;
const logger = require("./logger");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//upload media to cloudinary
// Upload an image
const uploadMediaToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto", //image/video automatiaclly detected
      },
      (error, result) => {
        if (error) {
          logger.error("Error while uploading media to cloudinary", error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(file.buffer);
  });
};

const deleteMediaFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info("Media deleted successfully from cloud storage", publicId);
    return result;
  } catch (e) {
    logger.error("Error deleting media from cloudinary", e);
    throw e;
  }
};

module.exports = { uploadMediaToCloudinary, deleteMediaFromCloudinary };

/*
❌ Trailing space in resource_type

You wrote:

resource_type: "auto ",


⚠️ That space at the end makes Cloudinary treat it as an invalid resource type.

Cloudinary then:

-> hits a wrong internal route
-> returns an HTML 404 page
-> your SDK expects JSON
-> boom 💥 →
Unexpected token '<', "<!DOCTYPE "... is not valid JSON



🔴 ROOT CAUSE #2 (ENV VARIABLE NAMES ARE WRONG)

You configured Cloudinary like this:

cloudinary.config({
  cloud_name: process.env.cloud_name,
  api_key: process.env.api_key,
  api_secret: process.env.api_secret,
});


But Cloudinary expects (by convention and almost every tutorial):

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=


If your .env uses uppercase (very likely), then all three values are undefined.

That again causes:

-> invalid endpoint
-> HTML response
-> JSON parse failure

✅ FIX (recommended)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

*/
