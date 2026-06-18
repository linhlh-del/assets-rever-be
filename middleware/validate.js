// middleware/validate.js
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join("."),
        message: d.message,
      }));
      return res
        .status(400)
        .json({ success: false, message: "Validation failed", errors });
    }
    next();
  };
};

export default validate;
