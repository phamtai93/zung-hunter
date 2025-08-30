// src/utils/default-system-settings.ts

// PRIMARY TRACKING TARGET - Shopee product detail API
export const TRACKING_STOCK_LINK = "https://shopee.vn/api/v4/pdp/get_pc";

// Path to models data in API response JSON (dot notation)
export const MODELS_POSITION = "data.item.models";

// Tab management settings
export const TAB_CLOSE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// Hidden tab functionality settings
export const HIDDEN_TAB_SETTINGS = {
  PRELOAD_TIMEOUT: 30000, // 30 seconds timeout for page load
  MAX_CONCURRENT_TABS: 3, // Maximum concurrent hidden tabs
  RETRY_ATTEMPTS: 2, // Retry failed loads
  WAIT_FOR_NETWORK_IDLE: 2000, // Wait 2s after last network activity
  TRACK_ALL_REQUESTS: false, // Only track specified patterns
};

// Storage keys for tracked data
export const STORAGE_KEYS = {
  TRACKED_REQUESTS: "tracked_requests",
  TRACKED_RESPONSES: "tracked_responses",
  HIDDEN_TAB_CACHE: "hidden_tab_cache",
};

// URL MATCHING UTILITIES
export const URL_MATCHING_HELPERS = {
  /**
   * Check if URL matches any tracking pattern
   */
  isTrackingUrl: (url: string): boolean => {
    if (!url || typeof url !== "string") return false;

    // Primary exact match
    if (url.includes(TRACKING_STOCK_LINK)) return true;

    return false;
  },

  /**
   * Extract API info from URL for logging
   */
  extractApiInfo: (
    url: string
  ): { domain: string; path: string; params: string } => {
    try {
      const urlObj = new URL(url);
      return {
        domain: urlObj.hostname,
        path: urlObj.pathname,
        params: urlObj.search,
      };
    } catch (error) {
      return {
        domain: "invalid-url",
        path: url,
        params: "",
      };
    }
  },
};

// VALIDATION HELPERS
export const VALIDATION = {
  /**
   * Validate models position path
   */
  validateModelsPath: (responseData: any): boolean => {
    if (!responseData || typeof responseData !== "object") return false;

    try {
      const pathSegments = MODELS_POSITION.split(".");
      let current = responseData;

      for (const segment of pathSegments) {
        if (!current || typeof current !== "object" || !(segment in current)) {
          return false;
        }
        current = current[segment];
      }

      return current !== null && current !== undefined;
    } catch (error) {
      return false;
    }
  },

  /**
   * Extract models using configured path
   */
  extractModels: (responseData: any): any => {
    if (!responseData || typeof responseData !== "object") return null;

    try {
      const pathSegments = MODELS_POSITION.split(".");
      let current = responseData;

      for (const segment of pathSegments) {
        if (!current || typeof current !== "object" || !(segment in current)) {
          return null;
        }
        current = current[segment];
      }

      return current;
    } catch (error) {
      return null;
    }
  },
};
