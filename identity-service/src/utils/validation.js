const Joi = require("joi");

const validateRegistration = (data) => {
  const schema = Joi.object({
    //trim inputs (prevents invisible bugs)
    username: Joi.string().min(3).max(50).trim().required(),
    email: Joi.string().email().trim().required(),
    password: Joi.string().min(8).required(),
  });

  //return schema.validate(data);

  // abortEarly: false → do NOT stop at the first validation error;
  // instead, return ALL validation errors at once (better UX & debugging)
  return schema.validate(data, { abortEarly: false });
};

const validateLogin = (data) => {
  const schema = Joi.object({
    username: Joi.string().min(3).max(50).trim().required(), //username validation instead of email
    password: Joi.string().min(8).required(),
  });

  return schema.validate(data, { abortEarly: false });
};

module.exports = { validateRegistration, validateLogin };

/*
What abortEarly means -->
Default behavior (abortEarly: true)

Joi stops validation as soon as it finds the first error.

Example input:

{
  "username": "ab",
  "email": "not-an-email",
  "password": "123"
}


You get only one error back (e.g. username too short).
With abortEarly: false
Joi continues validating every field and collects all errors.

You get:
    ->username too short
    ->email invalid
    ->password too short

Why this is better (real-world reason)
    ✔ Better frontend error display
    ✔ Fewer back-and-forth requests
    ✔ Easier debugging during development
    ✔ Cleaner API responses

Interview-ready one-liner
If asked:
Why abortEarly: false?
Answer:“So the client receives all validation errors in one response instead of fixing them one by one.”
 */
