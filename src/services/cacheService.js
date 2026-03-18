// Simplified cache service without Redis
// For now, use in-memory cache

class CacheService {
  constructor() {
    this.cache = new Map();
    this.TTL = {
      SHORT: 300,
      MEDIUM: 1800,
      LONG: 3600,
      VERY_LONG: 86400
    };
  }

  async get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key, value, ttl = this.TTL.MEDIUM) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + (ttl * 1000)
    });
    return true;
  }

  async delete(key) {
    return this.cache.delete(key);
  }

  async clearAll() {
    this.cache.clear();
    return true;
  }
}

module.exports = new CacheService();
