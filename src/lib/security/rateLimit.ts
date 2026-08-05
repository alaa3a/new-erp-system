interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 100,
};

const AUTH_CONFIG: RateLimitConfig = {
  windowMs: 1_000,
  maxRequests: 5,
};

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const ip = xff.split(',')[0].trim();
    if (ip) return ip;
  }
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

function isRateLimited(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    return true;
  }

  entry.timestamps.push(now);
  return false;
}

export function checkRateLimit(request: Request): boolean {
  const ip = getClientIp(request);
  return isRateLimited(`global:${ip}`, DEFAULT_CONFIG);
}

export function checkAuthRateLimit(request: Request): boolean {
  const ip = getClientIp(request);
  return isRateLimited(`auth:${ip}`, AUTH_CONFIG);
}

export function getRateLimitStatus(request: Request): { limited: boolean; remaining: number } {
  const ip = getClientIp(request);
  const now = Date.now();
  const windowStart = now - DEFAULT_CONFIG.windowMs;

  const entry = store.get(`global:${ip}`);
  if (!entry) {
    return { limited: false, remaining: DEFAULT_CONFIG.maxRequests };
  }

  const recent = entry.timestamps.filter((t) => t > windowStart);
  const remaining = Math.max(0, DEFAULT_CONFIG.maxRequests - recent.length);

  return { limited: remaining === 0, remaining };
}
