export const TRACKING_STOCK_LINK = 'https://shopee.vn/api/v4/pdp/get_pc'; // Your actual tracking URL
export const MODELS_POSITION = 'data.item.models';

// Additional settings for hidden tabs functionality
export const HIDDEN_TAB_SETTINGS = {
  PRELOAD_TIMEOUT: 30000,        // 30 seconds timeout for page load
  MAX_CONCURRENT_TABS: 3,        // Maximum concurrent hidden tabs
  RETRY_ATTEMPTS: 2,             // Retry failed loads
  WAIT_FOR_NETWORK_IDLE: 2000,   // Wait 2s after last network activity
  TRACK_ALL_REQUESTS: false,     // Only track TRACKING_STOCK_LINK by default
};

// Storage keys for tracked requests
export const STORAGE_KEYS = {
  TRACKED_REQUESTS: 'tracked_requests',
  TRACKED_RESPONSES: 'tracked_responses',
  HIDDEN_TAB_CACHE: 'hidden_tab_cache'
};