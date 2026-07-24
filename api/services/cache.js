import { createClient } from 'redis';

class CacheService {
    constructor() {
        this.client = null;
        this.memoryCache = new Map();
        this.isConnected = false;
        this.initRedis();
    }

    async initRedis() {
        try {
            this.client = createClient({
                url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
            });

            this.client.on('error', (err) => {
                if (this.isConnected) {
                    console.warn('Redis connection lost, falling back to memory cache:', err.message);
                    this.isConnected = false;
                }
            });

            await this.client.connect();
            this.isConnected = true;
            console.log('Redis cache successfully connected.');
        } catch (error) {
            console.warn('Redis server offline or unavailable. Using in-memory cache fallback.');
            this.isConnected = false;
            this.client = null;
        }
    }

    async get(key) {
        if (this.isConnected && this.client) {
            try {
                const val = await this.client.get(key);
                return val ? JSON.parse(val) : null;
            } catch (err) {
                console.warn('Redis GET failed. Fallback to memory cache:', err.message);
            }
        }
        
        const item = this.memoryCache.get(key);
        if (item) {
            if (item.expiry && item.expiry < Date.now()) {
                this.memoryCache.delete(key);
                return null;
            }
            return item.value;
        }
        return null;
    }

    async set(key, val, ttlSeconds = 60) {
        if (this.isConnected && this.client) {
            try {
                await this.client.set(key, JSON.stringify(val), {
                    EX: ttlSeconds
                });
                return;
            } catch (err) {
                console.warn('Redis SET failed. Fallback to memory cache:', err.message);
            }
        }

        this.memoryCache.set(key, {
            value: val,
            expiry: Date.now() + (ttlSeconds * 1000)
        });
    }

    async delete(key) {
        if (this.isConnected && this.client) {
            try {
                await this.client.del(key);
                return;
            } catch (err) {
                console.warn('Redis DEL failed:', err.message);
            }
        }
        this.memoryCache.delete(key);
    }
}

const cache = new CacheService();
export default cache;
