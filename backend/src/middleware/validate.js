const { badRequest } = require("../utils/errors");

const validate = (schema, part = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return next(badRequest(details[0]?.message || "Invalid request.", details));
  }
  req.valid = { ...(req.valid || {}), [part]: result.data };
  next();
};

module.exports = { validate };
