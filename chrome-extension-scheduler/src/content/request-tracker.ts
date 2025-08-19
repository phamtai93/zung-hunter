// ===== FIXED: src/content/request-tracker.ts - Proper XHR headers tracking =====

interface TrackedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  linkId: string;
  scheduleId: string;
}

interface TrackedResponse {
  id: string;
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  responseTime: number;
}

// Interface for enhanced XMLHttpRequest with tracking
interface EnhancedXMLHttpRequest extends XMLHttpRequest {
  _method?: string;
  _url?: string;
  _headers?: Record<string, string>;  // Store request headers
}

class RequestTracker {
  private linkId: string = '';
  private scheduleId: string = '';

  constructor() {
    this.setupRequestInterception();
    this.listenForInitData();
  }

  private listenForInitData() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'INIT_TRACKING') {
        this.linkId = event.data.linkId || '';
        this.scheduleId = event.data.scheduleId || '';
        console.log('Request tracking initialized for:', this.linkId);
      }
    });
  }

  private setupRequestInterception() {
    // Store original methods
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    // Override XMLHttpRequest.open
    XMLHttpRequest.prototype.open = function(
      method: string, 
      url: string | URL, 
      async?: boolean, 
      user?: string | null, 
      password?: string | null
    ): void {
      try {
        const enhancedXHR = this as EnhancedXMLHttpRequest;
        enhancedXHR._method = method;
        enhancedXHR._url = typeof url === 'string' ? url : url.toString();
        enhancedXHR._headers = {}; // Initialize headers storage
        
        // Call original with proper arguments
        if (arguments.length === 2) {
          return originalXHROpen.call(this, method, url, false);
        } else if (arguments.length === 3) {
          return originalXHROpen.call(this, method, url, async!);
        } else if (arguments.length === 4) {
          return originalXHROpen.call(this, method, url, async!, user);
        } else {
          return originalXHROpen.call(this, method, url, async!, user, password);
        }
      } catch (error) {
        console.error('XMLHttpRequest.open failed:', error);
        throw error;
      }
    };

    // FIXED: Override setRequestHeader to capture headers
    XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string): void {
      try {
        const enhancedXHR = this as EnhancedXMLHttpRequest;
        
        // Store header for tracking
        if (!enhancedXHR._headers) {
          enhancedXHR._headers = {};
        }
        enhancedXHR._headers[name.toLowerCase()] = value;
        
        // Call original method
        return originalXHRSetRequestHeader.call(this, name, value);
      } catch (error) {
        console.error('XMLHttpRequest.setRequestHeader failed:', error);
        throw error;
      }
    };

    // Override XMLHttpRequest.send
    XMLHttpRequest.prototype.send = function(body?: BodyInit | Document | null): void {
      const tracker = RequestTrackerInstance.getInstance();
      tracker.trackXHRRequest(this as EnhancedXMLHttpRequest, body);
      return originalXHRSend.call(this, body as Document);
    };

    // Override fetch (unchanged, but added for completeness)
    const originalFetch = window.fetch;
    window.fetch = async function(
      input: RequestInfo | URL, 
      init?: RequestInit
    ): Promise<Response> {
      const tracker = RequestTrackerInstance.getInstance();
      const requestId = tracker.generateRequestId();
      
      let url: string;
      let method = 'GET';
      let headers: Record<string, string> = {};
      let body: string | undefined;

      // Parse input parameter
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
        method = input.method || 'GET';
        if (input.headers) {
          headers = tracker.headersToObject(input.headers);
        }
        if (input.body) {
          try {
            body = await input.clone().text();
          } catch (e) {
            body = undefined;
          }
        }
      } else {
        url = String(input);
      }

      if (init) {
        method = init.method || method;
        if (init.headers) {
          headers = { ...headers, ...tracker.headersToObject(init.headers) };
        }
        body = init.body ? String(init.body) : body;
      }

      // Track request if it matches TRACKING_STOCK_LINK
      if (tracker.shouldTrackUrl(url)) {
        const trackedRequest: TrackedRequest = {
          id: requestId,
          url,
          method,
          headers,
          body,
          timestamp: Date.now(),
          linkId: tracker.linkId,
          scheduleId: tracker.scheduleId
        };

        tracker.saveTrackedRequest(trackedRequest);
      }

      // Make the actual request
      const startTime = Date.now();
      try {
        const response = await originalFetch.call(window, input, init);
        
        // Track response if request was tracked
        if (tracker.shouldTrackUrl(url)) {
          const responseTime = Date.now() - startTime;
          let responseBody: string | undefined;
          
          try {
            responseBody = await response.clone().text();
          } catch (e) {
            responseBody = `[Unable to read response: ${e}]`;
          }
          
          const trackedResponse: TrackedResponse = {
            id: tracker.generateRequestId(),
            requestId,
            status: response.status,
            statusText: response.statusText,
            headers: tracker.headersToObject(response.headers),
            body: responseBody,
            timestamp: Date.now(),
            responseTime
          };

          tracker.saveTrackedResponse(trackedResponse);
        }

        return response;
      } catch (error) {
        // Track error response
        if (tracker.shouldTrackUrl(url)) {
          const trackedResponse: TrackedResponse = {
            id: tracker.generateRequestId(),
            requestId,
            status: 0,
            statusText: error instanceof Error ? error.message : 'Network Error',
            headers: {},
            timestamp: Date.now(),
            responseTime: Date.now() - startTime
          };

          tracker.saveTrackedResponse(trackedResponse);
        }
        throw error;
      }
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldTrackUrl(url: string): boolean {
    try {
      const TRACKING_STOCK_LINK = (window as any).EXTENSION_SETTINGS?.TRACKING_STOCK_LINK || '';
      
      if (!TRACKING_STOCK_LINK) {
        return false;
      }

      return url.includes(TRACKING_STOCK_LINK) || url === TRACKING_STOCK_LINK;
    } catch (error) {
      console.error('Error checking URL tracking:', error);
      return false;
    }
  }

  private headersToObject(headers: HeadersInit): Record<string, string> {
    const result: Record<string, string> = {};

    try {
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          result[key] = value;
        });
      } else if (Array.isArray(headers)) {
        headers.forEach(([key, value]) => {
          if (typeof key === 'string' && typeof value === 'string') {
            result[key] = value;
          }
        });
      } else if (headers && typeof headers === 'object') {
        Object.entries(headers).forEach(([key, value]) => {
          if (typeof key === 'string' && typeof value === 'string') {
            result[key] = value;
          }
        });
      }
    } catch (error) {
      console.error('Error converting headers:', error);
    }

    return result;
  }

  private saveTrackedRequest(request: TrackedRequest): void {
    try {
      window.postMessage({
        type: 'SAVE_TRACKED_REQUEST',
        data: request
      }, '*');
    } catch (error) {
      console.error('Failed to save tracked request:', error);
    }
  }

  private saveTrackedResponse(response: TrackedResponse): void {
    try {
      window.postMessage({
        type: 'SAVE_TRACKED_RESPONSE',
        data: response
      }, '*');
    } catch (error) {
      console.error('Failed to save tracked response:', error);
    }
  }

  private trackXHRRequest(xhr: EnhancedXMLHttpRequest, body?: BodyInit | Document | null): void {
    const url = xhr._url;
    const method = xhr._method;

    if (!url || !this.shouldTrackUrl(url)) return;

    const requestId = this.generateRequestId();
    const startTime = Date.now();

    // FIXED: Now we can get the actual request headers!
    const trackedRequest: TrackedRequest = {
      id: requestId,
      url,
      method: method || 'GET',
      headers: xhr._headers || {}, // Use captured headers
      body: body ? String(body) : undefined,
      timestamp: Date.now(),
      linkId: this.linkId,
      scheduleId: this.scheduleId
    };

    this.saveTrackedRequest(trackedRequest);

    // Track response
    const originalOnReadyStateChange = xhr.onreadystatechange;
    
    xhr.onreadystatechange = (event: Event) => {
      if (xhr.readyState === 4) {
        const responseTime = Date.now() - startTime;
        const trackedResponse: TrackedResponse = {
          id: this.generateRequestId(),
          requestId,
          status: xhr.status,
          statusText: xhr.statusText,
          headers: this.getXHRResponseHeaders(xhr),
          body: xhr.responseText,
          timestamp: Date.now(),
          responseTime
        };

        this.saveTrackedResponse(trackedResponse);
      }

      if (originalOnReadyStateChange) {
        try {
          originalOnReadyStateChange.call(xhr, event);
        } catch (error) {
          console.error('Error in original onreadystatechange:', error);
        }
      }
    };
  }

  private getXHRResponseHeaders(xhr: XMLHttpRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    
    try {
      const headerString = xhr.getAllResponseHeaders();
      if (headerString) {
        headerString.split('\r\n').forEach(line => {
          const parts = line.split(': ');
          if (parts.length === 2) {
            headers[parts[0].toLowerCase()] = parts[1];
          }
        });
      }
    } catch (error) {
      console.error('Error getting response headers:', error);
    }
    
    return headers;
  }
}

// Singleton pattern for tracker
class RequestTrackerInstance extends RequestTracker {
  private static instance: RequestTrackerInstance | null = null;
  
  static getInstance(): RequestTrackerInstance {
    if (!RequestTrackerInstance.instance) {
      RequestTrackerInstance.instance = new RequestTrackerInstance();
    }
    return RequestTrackerInstance.instance;
  }

  static updateSettings(settings: { TRACKING_STOCK_LINK: string }) {
    (window as any).EXTENSION_SETTINGS = settings;
  }
}

// Initialize request tracking when script loads
if (typeof window !== 'undefined') {
  try {
    RequestTrackerInstance.getInstance();
    console.log('Request tracker initialized successfully');
  } catch (error) {
    console.error('Failed to initialize request tracker:', error);
  }
}

// Export for external access
if (typeof window !== 'undefined') {
  (window as any).RequestTracker = RequestTrackerInstance;
}

// ===== TESTING: XHR Headers Capture =====
// Add this function to test header capture
function testXHRHeaderCapture() {
  console.log('🧪 Testing XHR header capture...');
  
  const xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://httpbin.org/post');
  
  // Set some headers to test capture
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', 'Bearer test-token');
  xhr.setRequestHeader('X-Custom-Header', 'test-value');
  
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      console.log('✅ XHR request completed');
      
      // Check if headers were captured
      const enhancedXHR = xhr as any;
      console.log('📋 Captured headers:', enhancedXHR._headers);
    }
  };
  
  xhr.send(JSON.stringify({ test: 'data' }));
}

// Make test function available in console
if (typeof window !== 'undefined') {
  (window as any).testXHRHeaderCapture = testXHRHeaderCapture;
}

// ===== EXPLANATION COMMENT =====
/*
WHY getXHRHeaders() RETURNED EMPTY OBJECT BEFORE:

XMLHttpRequest API Limitation:
- xhr.open() → Can capture method, URL
- xhr.send() → Can capture body  
- xhr.getAllResponseHeaders() → Can get response headers
- ❌ NO METHOD to get request headers after they're set

Solution:
- Override xhr.setRequestHeader() to capture headers when they're set
- Store headers in xhr._headers property
- Use captured headers in getXHRHeaders()

Now we can capture:
✅ Request headers (via setRequestHeader override)
✅ Request method, URL (via open override)  
✅ Request body (via send override)
✅ Response headers (via getAllResponseHeaders)
✅ Response body (via responseText)

Complete request/response tracking achieved!
*/