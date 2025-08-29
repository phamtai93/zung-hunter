// src/content/main-world-interceptor.ts
// This file gets injected into MAIN world

interface InterceptedData {
  type: 'REQUEST_INTERCEPTED';
  data: {
    id: string;
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody?: string;
    responseStatus?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    timestamp: number;
  };
}

// Extended XMLHttpRequest interface with custom properties
interface ExtendedXMLHttpRequest extends XMLHttpRequest {
  _requestHeaders?: Record<string, string>;
  _method?: string;
  _url?: string;
  _requestId?: string;
}

// Main world interceptor - runs in page context
(function() {
  console.log('Main world interceptor starting...');
  
  // Get settings from global scope (injected by background)
  const settings = (window as any).EXTENSION_SETTINGS;
  if (!settings?.TRACKING_STOCK_LINK) {
    console.warn('Main world: No tracking settings found');
    return;
  }

  const TRACKING_URL = settings.TRACKING_STOCK_LINK;
  console.log('Main world: Tracking URL:', TRACKING_URL);

  let requestCounter = 0;

  // Enhanced XHR tracking with header capture
  const OriginalXHR = window.XMLHttpRequest;
  const originalOpen = OriginalXHR.prototype.open;
  const originalSend = OriginalXHR.prototype.send;
  const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

  OriginalXHR.prototype.setRequestHeader = function(name: string, value: string) {
    const xhr = this as ExtendedXMLHttpRequest;
    if (!xhr._requestHeaders) {
      xhr._requestHeaders = {};
    }
    xhr._requestHeaders[name.toLowerCase()] = value;
    return originalSetRequestHeader.call(this, name, value);
  };

  OriginalXHR.prototype.open = function(method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
    const xhr = this as ExtendedXMLHttpRequest;
    const urlString = typeof url === 'string' ? url : url.toString();
    
    xhr._method = method;
    xhr._url = urlString;
    xhr._requestHeaders = {};

    if (urlString.includes(TRACKING_URL)) {
      requestCounter++;
      const requestId = `xhr_${Date.now()}_${requestCounter}`;
      xhr._requestId = requestId;
      
      console.log(`Main world XHR intercepted: ${urlString}`);
    }

    return originalOpen.call(this, method, url, async !== false, user, password);
  };

  OriginalXHR.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as ExtendedXMLHttpRequest;
    
    if (xhr._requestId) {
      const startTime = Date.now();
      
      // Setup response handler
      const originalOnReadyStateChange = xhr.onreadystatechange;
      xhr.onreadystatechange = function(event: Event) {
        if (xhr.readyState === 4) {
          const responseHeaders: Record<string, string> = {};
          try {
            const headerString = xhr.getAllResponseHeaders();
            if (headerString) {
              headerString.split('\r\n').forEach(line => {
                const parts = line.split(': ');
                if (parts.length === 2) {
                  responseHeaders[parts[0].toLowerCase()] = parts[1];
                }
              });
            }
          } catch (e) {
            console.warn('Error parsing response headers:', e);
          }

          const interceptedData: InterceptedData = {
            type: 'REQUEST_INTERCEPTED',
            data: {
              id: xhr._requestId!,
              url: xhr._url!,
              method: xhr._method!,
              requestHeaders: xhr._requestHeaders || {},
              requestBody: body ? String(body) : undefined,
              responseStatus: xhr.status,
              responseHeaders,
              responseBody: xhr.responseText,
              timestamp: startTime
            }
          };

          // Send to isolated world via postMessage
          window.postMessage(interceptedData, '*');
          
          console.log('Main world: XHR data sent to isolated world', {
            id: xhr._requestId,
            status: xhr.status,
            responseLength: xhr.responseText.length
          });
        }

        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.call(xhr, event);
        }
      };
    }

    return originalSend.call(this, body);
  };

  // Fetch interception
  const originalFetch = window.fetch;
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = '';
    let method = 'GET';
    let headers: Record<string, string> = {};
    let body: string | undefined;

    // Extract request data
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input instanceof Request) {
      url = input.url;
      method = input.method;
      // Cannot easily extract headers/body from Request without consuming
    }

    if (init) {
      method = init.method || method;
      if (init.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([key, value]) => {
            headers[key.toLowerCase()] = value;
          });
        } else {
          Object.entries(init.headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
              headers[key.toLowerCase()] = value;
            }
          });
        }
      }
      body = init.body ? String(init.body) : undefined;
    }

    if (url.includes(TRACKING_URL)) {
      requestCounter++;
      const requestId = `fetch_${Date.now()}_${requestCounter}`;
      const startTime = Date.now();
      
      console.log(`Main world fetch intercepted: ${url}`);
      
      try {
        const response = await originalFetch.call(this, input, init);
        
        // Extract response data
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key.toLowerCase()] = value;
        });

        const responseClone = response.clone();
        const responseText = await responseClone.text();

        const interceptedData: InterceptedData = {
          type: 'REQUEST_INTERCEPTED',
          data: {
            id: requestId,
            url,
            method,
            requestHeaders: headers,
            requestBody: body,
            responseStatus: response.status,
            responseHeaders,
            responseBody: responseText,
            timestamp: startTime
          }
        };

        // Send to isolated world
        window.postMessage(interceptedData, '*');
        
        console.log('Main world: Fetch data sent to isolated world', {
          id: requestId,
          status: response.status,
          responseLength: responseText.length
        });

        return response;
        
      } catch (error) {
        console.error('Main world fetch error:', error);
        
        // Send error data
        const interceptedData: InterceptedData = {
          type: 'REQUEST_INTERCEPTED',
          data: {
            id: requestId,
            url,
            method,
            requestHeaders: headers,
            requestBody: body,
            responseStatus: 0,
            responseHeaders: {},
            responseBody: `Error: ${error}`,
            timestamp: startTime
          }
        };

        window.postMessage(interceptedData, '*');
        throw error;
      }
    }

    return originalFetch.call(this, input, init);
  };

  console.log('Main world interceptor fully initialized');
  
  // Notify isolated world that main world is ready
  window.postMessage({ type: 'MAIN_WORLD_READY' }, '*');
})();