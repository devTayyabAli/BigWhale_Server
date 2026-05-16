const errorHandler = (err, req, res, next) => {
  if (err.isJoi) {
    // Handle Joi validation errors
    const errorDetails = err.details.map((detail) => {
      return {
        message: detail.message,
        path: detail.path.join('.'),
      };
    });
    return res.status(400).json({ errors: errorDetails });
  }
  // Handle other errors
  console.error(err);
  return res.status(500).json({ message: 'Internal Server Error' });
};

module.exports = errorHandler;
