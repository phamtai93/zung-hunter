// src/content/request-tracker.ts

  const CONFIG = {
    TRACKING_STOCK_LINK: 'https://shopee.vn/api/v4/pdp/get_pc',
    ALTERNATIVE_PATTERNS: [
      '/api/v4/pdp/get_pc',
      'api/v4/pdp/get_pc', 
      '/api/v4/item/get',
      'api/v4/item/get',
      '/api/v4/product/',
      'api/v4/product/'
    ],
    MODELS_POSITION: 'data.item.models'
  };

// Simple interfaces
interface TrackedRequestData {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  timestamp: string;
}

// Global declarations
declare global {
  interface Window {
    __REQUEST_TRACKER_INITIALIZED__?: boolean;
    __requestTracker__?: RequestTracker;
  }
}

class RequestTracker {
  private originalFetch!: typeof fetch;
  private isInitialized: boolean = false;
  private trackedCount: number = 0;

  constructor() {
    // Prevent multiple initialization
    if (window.__REQUEST_TRACKER_INITIALIZED__) {
      console.log('🔄 RequestTracker already initialized');
      return;
    }

    this.originalFetch = window.fetch.bind(window);
    this.init();
  }

  private init(): void {
    if (this.isInitialized) return;

    try {
      console.log('🚀 RequestTracker initializing for:', location.href);
      console.log('🎯 Target patterns:', [CONFIG.TRACKING_STOCK_LINK, ...CONFIG.ALTERNATIVE_PATTERNS]);

      // Mark as initialized immediately
      window.__REQUEST_TRACKER_INITIALIZED__ = true;
      this.isInitialized = true;

      // Setup interceptors
      this.setupFetchInterceptor();
      this.setupXHRInterceptor();

      // Test URL matching
      this.testUrlPatterns();

      // Notify background
      this.notifyBackgroundReady();

      console.log('✅ RequestTracker initialized successfully');

    } catch (error) {
      console.error('❌ Error initializing RequestTracker:', error);
    }
  }

  private setupFetchInterceptor(): void {
    const self = this;

    console.log('🔧 Setting up fetch interceptor...');

    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      let url: string;

      // Extract URL from different input types
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = String(input);
      }

      // Check if URL should be tracked
      if (self.shouldTrackUrl(url)) {
        console.log('🎯 FETCH INTERCEPTED:', url.substring(0, 100) + '...');
        return self.handleTrackedFetch(input, init, url);
      }

      // Use original fetch for non-tracked URLs
      return self.originalFetch.call(this, input, init);
    };

    console.log('✅ Fetch interceptor ready');
  }

  private async handleTrackedFetch(input: RequestInfo | URL, init: RequestInit | undefined, url: string): Promise<Response> {
    const requestId = `fetch-${Date.now()}-${Math.random()}`;

    try {
      console.log('📤 Processing tracked fetch:', url);

      // Capture request data
      const method = init?.method || 'GET';
      const requestHeaders = this.extractHeaders(init?.headers);
      const requestBody = await this.extractBody(init?.body);

      const requestData: TrackedRequestData = {
        requestId,
        url,
        method,
        headers: requestHeaders,
        body: requestBody,
        timestamp: new Date().toISOString()
      };

      console.log('📋 Request captured:', {
        url: url.substring(0, 100) + '...',
        method,
        hasHeaders: Object.keys(requestHeaders).length > 0,
        hasBody: !!requestBody
      });

      // Execute the actual request
      const response = await this.originalFetch.call(window, input, init);

      // Process response
      await this.processResponse(response, requestData);

      return response;

    } catch (error) {
      console.error('❌ Error in tracked fetch:', error);
      // Still return the response even if tracking fails
      return this.originalFetch.call(window, input, init);
    }
  }

  private setupXHRInterceptor(): void {
    const self = this;

    console.log('🔧 Setting up XHR interceptor...');

    const OriginalXHR = window.XMLHttpRequest;

    window.XMLHttpRequest.prototype.open  = function() {
      const xhr = new OriginalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      const originalSetRequestHeader = xhr.setRequestHeader;

      let trackingData: any = null;

      // Override open
      xhr.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
        const urlString = url.toString();

        if (self.shouldTrackUrl(urlString)) {
          console.log('🎯 XHR INTERCEPTED:', urlString.substring(0, 100) + '...');

          trackingData = {
            requestId: `xhr-${Date.now()}-${Math.random()}`,
            url: urlString,
            method: method,
            headers: {},
            timestamp: new Date().toISOString()
          };
        }

        return originalOpen.call(this, method, url, async !== false, username, password);
      };

      // Override setRequestHeader to capture headers
      xhr.setRequestHeader = function(name: string, value: string) {
        if (trackingData) {
          trackingData.headers[name] = value;
        }
        return originalSetRequestHeader.call(this, name, value);
      };

      // Override send
      xhr.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
        if (trackingData) {
          trackingData.body = self.extractBody(body);

          console.log('📤 XHR request data captured:', {
            url: trackingData.url,
            method: trackingData.method,
            hasBody: !!body
          });

          // Setup response listener
          xhr.addEventListener('readystatechange', function() {
            if (xhr.readyState === XMLHttpRequest.DONE && trackingData) {
              self.processXHRResponse(xhr, trackingData);
            }
          });
        }

        return originalSend.call(this, body);
      };

      return xhr;
    };

    // Copy static properties
    Object.setPrototypeOf(window.XMLHttpRequest, OriginalXHR);
    Object.defineProperties(window.XMLHttpRequest, Object.getOwnPropertyDescriptors(OriginalXHR));

    console.log('✅ XHR interceptor ready');
  }

  private async processResponse(response: Response, requestData: TrackedRequestData): Promise<void> {
    try {
      // Clone response to avoid consuming original
      const responseClone = response.clone();
      const responseHeaders = this.extractHeaders(response.headers);

      // Get response body
      let responseBody: any = null;
      let responseText = '';

      try {
        responseText = await responseClone.text();
        console.log('📥 Response received, length:', responseText.length);

        // Try to parse as JSON
        try {
          responseBody = JSON.parse(responseText);
          console.log('✅ Response parsed as JSON');
        } catch (e) {
          responseBody = responseText;
          console.log('ℹ️ Response kept as text');
        }
      } catch (e) {
        console.error('❌ Failed to read response:', e);
        responseBody = 'Failed to read response';
      }

      // Extract models data
      let modelsJson: any = null;
      if (typeof responseBody === 'object' && responseBody) {
        modelsJson = this.extractModels(responseBody);
        if (modelsJson) {
          console.log('🎯 Models data found!', {
            type: typeof modelsJson,
            isArray: Array.isArray(modelsJson),
            length: Array.isArray(modelsJson) ? modelsJson.length : null
          });
        }
      }

      // Prepare complete data
      const completeData = {
        ...requestData,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          modelsJson: modelsJson
        },
        captureSource: 'fetch'
      };

      // Send to background script
      await this.sendToBackground(completeData);

      this.trackedCount++;
      console.log(`✅ Request tracked successfully (${this.trackedCount} total)`);

    } catch (error) {
      console.error('❌ Error processing response:', error);
    }
  }

  private processXHRResponse(xhr: XMLHttpRequest, requestData: any): void {
    try {
      const responseHeaders = this.parseXHRHeaders(xhr.getAllResponseHeaders());

      let responseBody: any = xhr.responseText;
      let modelsJson: any = null;

      try {
        const parsedResponse = JSON.parse(xhr.responseText);
        responseBody = parsedResponse;
        modelsJson = this.extractModels(parsedResponse);
      } catch (e) {
        // Keep as text
      }

      if (modelsJson) {
        console.log('🎯 XHR Models data found!', {
          type: typeof modelsJson,
          isArray: Array.isArray(modelsJson),
          length: Array.isArray(modelsJson) ? modelsJson.length : null
        });
      }

      const completeData = {
        ...requestData,
        response: {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeaders,
          body: responseBody,
          modelsJson: modelsJson
        },
        captureSource: 'xhr'
      };

      this.sendToBackground(completeData);

      this.trackedCount++;
      console.log(`✅ XHR tracked successfully (${this.trackedCount} total)`);

    } catch (error) {
      console.error('❌ Error processing XHR response:', error);
    }
  }

  private shouldTrackUrl(url: string): boolean {
    try {
      // Primary check
      if (url.includes(CONFIG.TRACKING_STOCK_LINK)) {
        console.log('✅ PRIMARY MATCH:', CONFIG.TRACKING_STOCK_LINK);
        return true;
      }

      // Alternative patterns
      for (const pattern of CONFIG.ALTERNATIVE_PATTERNS) {
        if (url.includes(pattern)) {
          console.log('✅ ALTERNATIVE MATCH:', pattern);
          return true;
        }
      }

      return false;

    } catch (error) {
      console.error('❌ Error checking URL:', error);
      return false;
    }
  }

  private extractModels(responseBody: any): any {
    if (!responseBody || typeof responseBody !== 'object') {
      return null;
    }

    try {
      const pathSegments = CONFIG.MODELS_POSITION.split('.');
      let current = responseBody;

      console.log('🔍 Extracting models using path:', CONFIG.MODELS_POSITION);

      for (const segment of pathSegments) {
        if (current && typeof current === 'object' && segment in current) {
          current = current[segment];
          console.log(`  ✅ Found segment '${segment}'`);
        } else {
          console.log(`  ❌ Segment '${segment}' not found`);
          return null;
        }
      }

      console.log('📊 Models extracted successfully:', {
        type: typeof current,
        isArray: Array.isArray(current),
        length: Array.isArray(current) ? current.length : null
      });

      return current;

    } catch (error) {
      console.error('❌ Error extracting models:', error);
      return null;
    }
  }

  private async sendToBackground(data: any): Promise<void> {
    try {
      const tabId = await this.getCurrentTabId();

      const message = {
        type: 'API_REQUEST_TRACKED',
        data: {
          ...data,
          tabId,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent
        }
      };

      console.log('📤 Sending to background:', {
        url: data.url?.substring(0, 100),
        status: data.response?.status,
        hasModels: !!data.response?.modelsJson
      });

      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(message)
          .then(response => {
            console.log('✅ Background confirmed:', response);
          })
          .catch(error => {
            console.warn('⚠️ Background communication failed:', error.message);
          });
      } else {
        console.warn('⚠️ Chrome APIs not available');
      }

    } catch (error) {
      console.error('❌ Error sending to background:', error);
    }
  }

  private getCurrentTabId(): Promise<number> {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({type: 'GET_CURRENT_TAB_ID'}, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('Could not get tab ID:', chrome.runtime.lastError.message);
              resolve(0);
            } else {
              resolve(response?.tabId || 0);
            }
          });
        } else {
          resolve(0);
        }
      } catch (error) {
        console.warn('Error getting tab ID:', error);
        resolve(0);
      }
    });
  }

  private notifyBackgroundReady(): void {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'CONTENT_SCRIPT_READY',
          data: {
            url: location.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            trackingPatterns: [CONFIG.TRACKING_STOCK_LINK, ...CONFIG.ALTERNATIVE_PATTERNS]
          }
        }).then(response => {
          console.log('✅ Background notified:', response);
        }).catch(error => {
          console.warn('⚠️ Background notification failed (normal if dashboard not open):', error.message);
        });
      }
    } catch (error) {
      console.warn('Could not notify background:', error);
    }
  }

  private testUrlPatterns(): void {
    const testUrls = [
      'https://shopee.vn/api/v4/pdp/get_pc?item_id=123',
      'https://shopee.vn/api/v4/pdp/get_pc',
      'https://abc.shopee.vn/api/v4/pdp/get_pc?test=1',
      'https://example.com/api/v4/item/get',
      'https://random.com/not/matching/url'
    ];

    console.log('🧪 Testing URL patterns:');
    testUrls.forEach(url => {
      const matches = this.shouldTrackUrl(url);
      console.log(`  ${matches ? '✅' : '❌'} ${url}`);
    });
  }

  // Helper methods
  private extractHeaders(headers: HeadersInit | Headers | undefined): Record<string, string> {
    if (!headers) return {};

    if (headers instanceof Headers) {
      const obj: Record<string, string> = {};
      headers.forEach((value, key) => {
        obj[key] = value;
      });
      return obj;
    }

    if (Array.isArray(headers)) {
      const obj: Record<string, string> = {};
      headers.forEach(([key, value]) => {
        obj[key] = value;
      });
      return obj;
    }

    return headers as Record<string, string>;
  }

  private parseXHRHeaders(headerStr: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!headerStr) return headers;

    headerStr.trim().split(/[\r\n]+/).forEach(line => {
      const parts = line.split(': ');
      const header = parts.shift();
      const value = parts.join(': ');
      if (header) {
        headers[header.toLowerCase()] = value;
      }
    });

    return headers;
  }

  private extractBody(body: any): any {
    if (!body) return null;

    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch (e) {
        return body;
      }
    }

    if (body instanceof FormData) {
      const formObj: Record<string, any> = {};
      body.forEach((value, key) => {
        formObj[key] = value;
      });
      return formObj;
    }

    if (body instanceof URLSearchParams) {
      const params: Record<string, string> = {};
      body.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    }

    return body;
  }
}

// Initialize with multiple strategies
function initRequestTracker(): void {
  try {
    if (!window.__REQUEST_TRACKER_INITIALIZED__) {
      console.log('🔄 Initializing RequestTracker...');
      const tracker = new RequestTracker();
      window.__requestTracker__ = tracker;
    }
  } catch (error) {
    console.error('❌ Failed to initialize RequestTracker:', error);
  }
}

// Multiple initialization strategies for maximum coverage
console.log('📋 Document ready state:', document.readyState);

// Strategy 1: Immediate (most important)
initRequestTracker();

// Strategy 2: DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRequestTracker);
}

// Strategy 3: Window load
window.addEventListener('load', initRequestTracker);

// Strategy 4: Delayed fallbacks
setTimeout(initRequestTracker, 100);
setTimeout(initRequestTracker, 500);
setTimeout(initRequestTracker, 1000);

console.log('✅ Content script setup complete for:', location.href);

// Export for debugging
export default RequestTracker;