/**
 * NUNULIA — Redis Cache Utility
 *
 * Uses dynamic import to avoid loading ioredis at module init time
 * (which causes Cloud Functions deployment timeout).
 */

import * as logger from "firebase-functions/logger";

let redisClient: any = null;

/**
 * Get or create a Redis client. Uses dynamic import to avoid
 * loading ioredis during Cloud Functions cold start analysis.
 */
export async function getRedis(redisUrl: string): Promise<any> {
  if (redisClient && redisClient.status === "ready") {
    return redisClient;
  }

  // Close stale client before creating a new one to prevent connection leaks
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {
      // Ignore disconnect errors on stale client
    }
    redisClient = null;
  }

  const ioredis = await import("ioredis");
  const Redis = ioredis.default || ioredis;

  redisClient = new (Redis as any)(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
    connectTimeout: 5000,
    lazyConnect: true,
  });

  redisClient.on("error", (err: Error) => {
    logger.error("[Redis] Connection error:", err.message);
  });

  redisClient.on("connect", () => {
    logger.info("[Redis] Connected successfully");
  });

  await redisClient.connect().catch((err: Error) => {
    logger.error("[Redis] Initial connect failed:", err.message);
  });

  return redisClient;
}

/**
 * Cache-aside pattern: try cache first, compute on miss, store result.
 */
export async function cacheGet<T>(
  redis: any,
  key: string,
  ttlSeconds: number,
  computeFn: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      logger.debug(`[Cache] HIT: ${key}`);
      return JSON.parse(cached) as T;
    }
  } catch (err: any) {
    logger.warn(`[Cache] GET failed for ${key}:`, err.message);
  }

  const result = await computeFn();

  try {
    await redis.set(key, JSON.stringify(result), "EX", ttlSeconds);
    logger.debug(`[Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
  } catch (err: any) {
    logger.warn(`[Cache] SET failed for ${key}:`, err.message);
  }

  return result;
}

/**
 * Invalidate a cache key or pattern.
 */
export async function cacheInvalidate(redis: any, pattern: string): Promise<void> {
  try {
    if (pattern.includes("*")) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info(`[Cache] Invalidated ${keys.length} keys matching: ${pattern}`);
      }
    } else {
      await redis.del(pattern);
    }
  } catch (err: any) {
    logger.warn(`[Cache] Invalidate failed for ${pattern}:`, err.message);
  }
}
