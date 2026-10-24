class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new ApiError(400, "BAD_REQUEST", message, details);
const unauthorized = (message = "Please log in to continue.") => new ApiError(401, "UNAUTHORIZED", message);
const notFound = (message = "Not found.") => new ApiError(404, "NOT_FOUND", message);
const conflict = (code, message) => new ApiError(409, code, message);
const unprocessable = (code, message) => new ApiError(422, code, message);
const unavailable = (code, message) => new ApiError(503, code, message);

module.exports = { ApiError, badRequest, unauthorized, notFound, conflict, unprocessable, unavailable };
