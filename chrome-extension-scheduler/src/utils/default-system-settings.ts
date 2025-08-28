// Shopee product API endpoint - primary tracking target
export const TRACKING_STOCK_LINK = 'https://shopee.vn/api/v4/pdp/get_pc';

// Alternative patterns that might also contain useful data
export const ALTERNATIVE_TRACKING_PATTERNS = [
  'api/v4/pdp/get_pc',     // Shopee product detail API
  'api/v4/item/get',       // Shopee item API  
  'api/v4/product/',       // Product-related APIs
  '/api/product/',         // Generic product APIs
];

// Path to models data in the API response JSON
export const MODELS_POSITION = 'data.item.models';

// Tab management settings
export const TAB_CLOSE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

// Additional settings for hidden tabs functionality
export const HIDDEN_TAB_SETTINGS = {
  PRELOAD_TIMEOUT: 30000,        // 30 seconds timeout for page load
  MAX_CONCURRENT_TABS: 3,        // Maximum concurrent hidden tabs
  RETRY_ATTEMPTS: 2,             // Retry failed loads
  WAIT_FOR_NETWORK_IDLE: 2000,   // Wait 2s after last network activity
  TRACK_ALL_REQUESTS: false,     // Only track specified patterns
};

// Storage keys for tracked requests
export const STORAGE_KEYS = {
  TRACKED_REQUESTS: 'tracked_requests',
  TRACKED_RESPONSES: 'tracked_responses',
  HIDDEN_TAB_CACHE: 'hidden_tab_cache'
};