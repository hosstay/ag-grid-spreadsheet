class GlobalExpressionCache {
  constructor() {
    this.cache = [];
  }

  addToCache(req, exp, val) {
    let cacheIndex = -1;

    for (const i in this.cache) {
      if (this.cache[i].user === req.user.username) {
        cacheIndex = i;
        break;
      }
    }

    if (cacheIndex !== -1) {
      this.cache[cacheIndex].expressions.push({exp: exp, val: val});
    } else {
      this.cache.push({
        user: req.user.username,
        expressions: [{exp: exp, val: val}]
      });
    }

    return;
  }

  findExprInCache(req, exp) {
    let cacheIndex = -1;

    for (const i in this.cache) {
      if (this.cache[i].user === req.user.username) {
        cacheIndex = i;
        break;
      }
    }

    if (cacheIndex !== -1) {
      for (const i in this.cache[cacheIndex].expressions) {
        if (this.cache[cacheIndex].expressions[i].exp === exp) {
          return this.cache[cacheIndex].expressions[i].val;
        }
      }

      return false;
    } else {
      return false;
    }
  }

  clearCache(req) {
    let cacheIndex = -1;

    for (const i in this.cache) {
      if (this.cache[i].user === req.user.username) {
        cacheIndex = i;
        break;
      }
    }

    if (cacheIndex !== -1) {
      this.cache.splice(cacheIndex, 1);
    }

    return;
  }
}

module.exports = GlobalExpressionCache;