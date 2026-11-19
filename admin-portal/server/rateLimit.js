import rateLimit from 'express-rate-limit';

export function createApiRateLimiter(maxRequests = 120, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'RATE_LIMITED',
      message: 'تم تجاوز الحد المسموح للطلبات. يرجى المحاولة بعد قليل.',
    },
  });
}

export function createSensitiveRateLimiter(maxRequests = 20, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'SENSITIVE_RATE_LIMITED',
      message: 'تم تقييد العمليات الحساسة مؤقتاً للحماية الأمنية.',
    },
  });
}
