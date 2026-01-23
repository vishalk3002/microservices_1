const Joi = require("joi");

const validateCreatePost = (data) => {
  const schema = Joi.object({
    content: Joi.string().min(3).max(850).required(),
    mediaIds: Joi.array(),
  });

  return schema.validate(data, { abortEarly: false });
};

module.exports = { validateCreatePost };
