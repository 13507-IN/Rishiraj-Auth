const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      params: req.params,
      query: req.query
    });
    req.body = parsed.body || req.body;
    req.params = parsed.params || req.params;
    req.query = parsed.query || req.query;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = validate;