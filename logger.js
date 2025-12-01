// Logger utility for GitLeetSync extension
(function() {
  function log(...args) {
    const ts = new Date().toISOString();
    console.log(`[GitLeetSync ${ts}]`, ...args);
  }

  function logError(...args) {
    const ts = new Date().toISOString();
    console.error(`[GitLeetSync ERROR ${ts}]`, ...args);
  }

  function logWarn(...args) {
    const ts = new Date().toISOString();
    console.warn(`[GitLeetSync WARN ${ts}]`, ...args);
  }

  // Export to self for service worker or global for other contexts
  if (typeof self !== 'undefined') {
    self.GitLeetSyncLogger = { log, logError, logWarn };
  }
  if (typeof window !== 'undefined') {
    window.GitLeetSyncLogger = { log, logError, logWarn };
  }
})();