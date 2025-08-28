// src/content/request-tracker.ts
import { TRACKING_STOCK_LINK, ALTERNATIVE_TRACKING_PATTERNS, MODELS_POSITION } from '../utils/default-system-settings';

class RequestTracker {
  private originalFetch: typeof fetch;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open;
  private originalXHRSend: typeof XMLHttpRequest.prototype.send;
  private isInitialized: boolean = false;
  
  constructor() {
    // Prevent multiple initializations
    if (window.__REQUEST_TRACKER_INITIALIZED__) {
      return;
    }
    
    this.originalFetch = window.fetch;
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    
    this.init();
  }

  private init() {
    if (this.isInitialized) return;
    
    console.log('🚀 Request tracker initializing EARLY for:', location.href);
    
    // Mark as initialized globally FIRST
    window.__REQUEST_TRACKER_INITIALIZED__ = true;
    this.isInitialized = true;
    
    // Override network APIs IMMEDIATELY - this is critical for early capture
    this.interceptFetch();
    this.interceptXHR();
    
    console.log('✅ Request tracker initialized and READY for API tracking');
    console.log('📡 Tracking patterns:', [TRACKING_STOCK_LINK, ...ALTERNATIVE_TRACKING_PATTERNS]);
    
    // Notify background that content script is ready (non-blocking)
    setTimeout(() => this.notifyReady(), 0);
  }

  private notifyReady() {
    try {
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_READY',
        data: { 
          url: location.href,
          timestamp: new Date().toISOString(),
          patterns: [TRACKING_STOCK_LINK, ...ALTERNATIVE_TRACKING_PATTERNS]
        }
      }).then(response => {
        console.log('✅ Notified background script of readiness:', response);
      }).catch((error) => {
        console.warn('⚠️ Could not notify background script:', error);
      });
      
      // Test URL pattern matching for current page
      console.log('🧪 Testing URL patterns for current page:');
      console.log(`Current URL: ${location.href}`);
      console.log(`Will track: ${this.shouldTrackUrl(location.href)}`);
      
      // Test some example URLs
      const testUrls = [
        'https://shopee.vn/api/v4/pdp/get_pc?item_id=123',
        'https://example.com/api/v4/pdp/get_pc'
      ];
      
      testUrls.forEach(url => {
        console.log(`Test URL ${url}: ${this.shouldTrackUrl(url) ? '✅ MATCH' : '❌ NO MATCH'}`);
      });
      
    } catch (error) {
      console.warn('Could not notify background of content script ready:', error);
    }
  }

  private interceptFetch() {
    const self = this;
    
    console.log('🔧 Overriding fetch API...');
    
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
      let url: string;
      
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = String(input);
      }
      
      console.log('📡 Fetch intercepted:', url.substring(0, 100));
      
      // Check if this URL should be tracked
      if (self.shouldTrackUrl(url)) {
        console.log('🎯 FETCH URL MATCHES - Starting tracking:', url);
        
        try {
          // Capture complete request data
          const requestHeaders = self.headersToObject(init?.headers);
          const requestBody = self.getRequestBody(init?.body);
          const method = init?.method || 'GET';
          
          const requestData = {
            url,
            method,
            headers: requestHeaders,
            body: requestBody,
            timestamp: new Date().toISOString()
          };

          console.log('📤 Request data captured:', {
            url: url.substring(0, 100),
            method,
            headersCount: Object.keys(requestHeaders).length,
            hasBody: !!requestBody
          });

          // Execute original fetch
          const response = await self.originalFetch.call(this, input, init);
          
          // Clone response to read body without consuming it
          const responseClone = response.clone();
          let responseBody: any;
          let modelsJson: any = null;
          
          try {
            const responseText = await responseClone.text();
            console.log('📥 Response text length:', responseText.length);
            
            // Try to parse as JSON
            try {
              responseBody = JSON.parse(responseText);
              console.log('✅ Response parsed as JSON successfully');
              
              // Extract models data if JSON parsing successful
              modelsJson = self.extractModelsFromResponse(responseBody);
              console.log('🎯 Models extraction result:', modelsJson ? 'SUCCESS' : 'NO_MODELS');
              
            } catch (e) {
              responseBody = responseText; // Keep as text if not JSON
              console.log('⚠️ Response is not JSON, keeping as text');
            }
          } catch (e) {
            responseBody = 'Failed to read response body';
            console.error('❌ Failed to read response body:', e);
          }

          // Capture complete response data
          const responseHeaders = self.headersToObject(response.headers);
          
          console.log('📥 Response data captured:', {
            status: response.status,
            headersCount: Object.keys(responseHeaders).length,
            bodyType: typeof responseBody,
            hasModels: !!modelsJson
          });

          // Send complete tracked data to background script
          self.sendTrackedData({
            url,
            method,
            requestHeaders,
            requestBody,
            responseHeaders,
            responseBody,
            responseStatus: response.status,
            responseStatusText: response.statusText,
            modelsJson, // Include extracted models
            timestamp: new Date().toISOString(),
            captureSource: 'fetch'
          });

          return response;
          
        } catch (error) {
          console.error('❌ Error tracking fetch request:', error);
          // Still execute original fetch even if tracking fails
          return self.originalFetch.call(this, input, init);
        }
      } else {
        // Don't log non-tracked URLs to avoid spam
        // console.log('⏭️ URL not tracked, skipping');
      }
      
      // Execute original fetch for non-tracked URLs
      return self.originalFetch.call(this, input, init);
    };
    
    console.log('✅ Fetch API override complete');
  }

  private interceptXHR() {
    const self = this;
    
    // Override XMLHttpRequest.open
    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ) {
      const urlString = typeof url === 'string' ? url : url.toString();
      
      // Store request info for later use
      (this as any)._trackedUrl = urlString;
      (this as any)._trackedMethod = method;
      (this as any)._trackedRequestHeaders = {};
      
      // If this should be tracked, set up event listeners
      if (self.shouldTrackUrl(urlString)) {
        console.log('🎯 Tracking XHR request:', urlString);
        
        // Override setRequestHeader to capture all headers
        const originalSetHeader = this.setRequestHeader.bind(this);
        this.setRequestHeader = function(header: string, value: string) {
          (this as any)._trackedRequestHeaders[header] = value;
          return originalSetHeader(header, value);
        };
        
        this.addEventListener('readystatechange', function() {
          if (this.readyState === 4) { // DONE
            try {
              const responseHeaders = self.parseResponseHeaders(this.getAllResponseHeaders());
              
              let responseBody: any = this.responseText;
              let modelsJson: any = null;
              
              // Try to parse response as JSON and extract models
              try {
                const parsedResponse = JSON.parse(this.responseText);
                responseBody = parsedResponse;
                modelsJson = self.extractModelsFromResponse(parsedResponse);
              } catch (e) {
                // Keep as text if not JSON
                responseBody = this.responseText;
              }
              
              console.log('📥 XHR Response data captured:', {
                status: this.status,
                headers: Object.keys(responseHeaders),
                bodySize: typeof responseBody === 'string' ? responseBody.length : 'object',
                modelsFound: modelsJson ? 'Yes' : 'No'
              });
              
              // Send complete tracked data
              self.sendTrackedData({
                url: urlString,
                method: method,
                requestHeaders: (this as any)._trackedRequestHeaders || {},
                requestBody: (this as any)._trackedRequestBody,
                responseHeaders,
                responseBody,
                responseStatus: this.status,
                responseStatusText: this.statusText,
                modelsJson, // Include extracted models
                timestamp: new Date().toISOString(),
                captureSource: 'xhr'
              });
            } catch (error) {
              console.error('Error tracking XHR response:', error);
            }
          }
        });
      }
      
      // Call original open
      return self.originalXHROpen.call(this, method, url, async ?? true, username, password);
    };

    // Override XMLHttpRequest.send
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      // Store request body for tracking
      if (self.shouldTrackUrl((this as any)._trackedUrl)) {
        (this as any)._trackedRequestBody = self.getRequestBody(body);
        
        console.log('📤 XHR Request data captured:', {
          url: (this as any)._trackedUrl,
          method: (this as any)._trackedMethod,
          headers: Object.keys((this as any)._trackedRequestHeaders || {}),
          hasBody: !!body
        });
      }
      
      // Call original send
      return self.originalXHRSend.call(this, body);
    };
  }

  private shouldTrackUrl(url: string): boolean {
    console.log('🔍 Content script checking URL:', url.substring(0, 150));
    
    try {
      // Primary check: exact URL match
      if (url.includes(TRACKING_STOCK_LINK)) {
        console.log('✅ URL matches PRIMARY pattern:', TRACKING_STOCK_LINK);
        return true;
      }
      
      // Secondary check: alternative patterns
      for (const pattern of ALTERNATIVE_TRACKING_PATTERNS) {
        if (url.includes(pattern)) {
          console.log('✅ URL matches ALTERNATIVE pattern:', pattern);
          return true;
        }
      }
      
      console.log('❌ URL does NOT match any tracking patterns');
      console.log('📋 Available patterns:', [TRACKING_STOCK_LINK, ...ALTERNATIVE_TRACKING_PATTERNS]);
      
      return false;
    } catch (error) {
      console.error('❌ Error checking URL for tracking:', error);
      return false;
    }
  }

  private headersToObject(headers: HeadersInit | Headers | undefined): Record<string, string> {
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

  private parseResponseHeaders(headerStr: string): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (!headerStr) return headers;
    
    const lines = headerStr.trim().split(/[\r\n]+/);
    lines.forEach(line => {
      const parts = line.split(': ');
      const header = parts.shift();
      const value = parts.join(': ');
      if (header) {
        headers[header.toLowerCase()] = value;
      }
    });
    
    return headers;
  }

  /**
   * Extract models data from API response using MODELS_POSITION path
   */
  private extractModelsFromResponse(responseBody: any): any {
    if (!responseBody) return null;
    
    try {
      // Parse MODELS_POSITION path (e.g., "data.item.models")
      const pathSegments = MODELS_POSITION.split('.');
      let current = responseBody;
      
      for (const segment of pathSegments) {
        if (current && typeof current === 'object' && segment in current) {
          current = current[segment];
        } else {
          console.warn(`Models path segment '${segment}' not found in response`);
          return null;
        }
      }
      
      console.log('📊 Models data extracted:', current);
      return current;
    } catch (error) {
      console.error('Error extracting models from response:', error);
      return null;
    }
  }

  private getRequestBody(body: any): any {
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
    
    return body;
  }

  private async sendTrackedData(data: any) {
    try {
      const tabId = await this.getCurrentTabId();
      
      // Add tab ID and enhanced metadata
      const trackedData = {
        ...data,
        tabId,
        url: data.url,
        source: 'contentScript',
        pageUrl: location.href,
        userAgent: navigator.userAgent
      };

      console.log('📤 Preparing to send COMPLETE tracked data:', {
        tabId,
        url: trackedData.url?.substring(0, 100),
        method: trackedData.method,
        hasRequestHeaders: Object.keys(trackedData.requestHeaders || {}).length > 0,
        hasRequestBody: !!trackedData.requestBody,
        hasResponseHeaders: Object.keys(trackedData.responseHeaders || {}).length > 0,
        hasResponseBody: !!trackedData.responseBody,
        hasModels: !!trackedData.modelsJson,
        responseStatus: trackedData.responseStatus
      });

      console.log('📤 Full tracked data structure:', {
        keys: Object.keys(trackedData),
        dataSize: JSON.stringify(trackedData).length
      });

      // Send to background script
      chrome.runtime.sendMessage({
        type: 'API_REQUEST_TRACKED',
        data: trackedData
      }).then(response => {
        console.log('✅ Message sent to background, response:', response);
      }).catch(error => {
        console.error('❌ Error sending tracked data to background:', error);
      });

    } catch (error) {
      console.error('❌ Error preparing tracked data:', error);
    }
  }

  private async getCurrentTabId(): Promise<number> {
    try {
      console.log('🔍 Getting current tab ID...');
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({type: 'GET_CURRENT_TAB_ID'}, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('⚠️ Error getting tab ID:', chrome.runtime.lastError);
            resolve(0);
            return;
          }
          console.log('📋 Got tab ID:', response?.tabId);
          resolve(response?.tabId || 0);
        });
      });
    } catch (error) {
      console.warn('Could not get current tab ID:', error);
      return 0;
    }
  }
}

// Declare global flag to prevent multiple initializations
declare global {
  interface Window {
    __REQUEST_TRACKER_INITIALIZED__?: boolean;
    __requestTracker__?: RequestTracker; // For debugging purposes
  }
}

// ⚡ CRITICAL: Initialize immediately to hook network APIs as early as possible
console.log('🚀 Content script file loaded for:', location.href);

const tracker = new RequestTracker();

// Additional initialization for different document states (safety net)
const initTracker = () => {
  if (!window.__REQUEST_TRACKER_INITIALIZED__) {
    console.log('🔄 Fallback tracker initialization');
    new RequestTracker();
  } else {
    console.log('✅ Tracker already initialized, skipping fallback');
  }
};

// Multiple initialization points to ensure we never miss the early window
if (document.readyState === 'loading') {
  console.log('📄 Document still loading, setting up listeners');
  document.addEventListener('DOMContentLoaded', initTracker);
  document.addEventListener('readystatechange', initTracker);
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
  console.log('📄 Document already loaded, trying fallback init');
  initTracker();
}

// Extra safety: initialize on window load as well
window.addEventListener('load', () => {
  console.log('🪟 Window loaded, final fallback init');
  initTracker();
});

// Export for potential debugging
window.__requestTracker__ = tracker;

// Debug current URL patterns
console.log('🎯 Content script armed for URL:', location.href);
console.log('🎯 Will track patterns:', [TRACKING_STOCK_LINK, ...ALTERNATIVE_TRACKING_PATTERNS]);