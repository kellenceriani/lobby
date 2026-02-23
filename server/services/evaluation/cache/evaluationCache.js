class EvaluationCache {
  constructor(defaultTtlMs = 30000) {
    this.defaultTtlMs = Math.max(250, Number(defaultTtlMs) || 30000);
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(String(key));
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(String(key));
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.store.set(String(key), {
      value,
      expiresAt: Date.now() + Math.max(250, Number(ttlMs) || this.defaultTtlMs)
    });
  }

  delete(key) {
    this.store.delete(String(key));
  }

  clear() {
    this.store.clear();
  }
}

module.exports = {
  EvaluationCache
};
