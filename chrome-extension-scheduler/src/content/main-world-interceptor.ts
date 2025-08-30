// src/content/main-world-interceptor.ts - Fixed Main World Script

interface InterceptedData {
  type: "REQUEST_INTERCEPTED";
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

interface ExtendedXMLHttpRequest extends XMLHttpRequest {
  _requestHeaders?: Record<string, string>;
  _method?: string;
  _url?: string;
  _requestId?: string;
}

// Main world interceptor - runs in page context
(function () {
  console.log("🌍 Main world interceptor initializing...");

  // Wait for settings to be available
  const waitForSettings = () => {
    const settings = (window as any).EXTENSION_SETTINGS;
    console.log(settings);
    if (!settings?.TRACKING_STOCK_LINK) {
      // Retry in 100ms
      setTimeout(waitForSettings, 100);
      return;
    }

    console.log("✅ Main world: Settings found, starting interception");
    startInterception(settings);
  };

  const startInterception = (settings: any) => {
    const TRACKING_URL = settings.TRACKING_STOCK_LINK;
    const TRACKING_PATH = new URL(TRACKING_URL).pathname;
    let requestCounter = 0;

    console.log(
      "🎯 Main world: Targeting URL pattern:",
      TRACKING_URL.substring(0, 50) + "..."
    );

    // Helper function to check if URL should be tracked
    const shouldTrackUrl = (url: string): boolean => {
      return !!url && typeof url === "string" && url.includes(TRACKING_PATH);
    };

    // Enhanced XHR interception
    const OriginalXHR = window.XMLHttpRequest;
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

    // Override setRequestHeader to capture headers
    OriginalXHR.prototype.setRequestHeader = function (
      name: string,
      value: string
    ) {
      const xhr = this as ExtendedXMLHttpRequest;
      if (!xhr._requestHeaders) {
        xhr._requestHeaders = {};
      }
      xhr._requestHeaders[name.toLowerCase()] = value;
      return originalSetRequestHeader.call(this, name, value);
    };

    // Override open to capture method and URL
    OriginalXHR.prototype.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      user?: string | null,
      password?: string | null
    ) {
      const xhr = this as ExtendedXMLHttpRequest;
      const urlString = typeof url === "string" ? url : url.toString();

      xhr._method = method;
      xhr._url = urlString;
      xhr._requestHeaders = {};

      // Check if this URL should be tracked
      if (shouldTrackUrl(urlString)) {
        requestCounter++;
        const requestId = `xhr_${Date.now()}_${requestCounter}`;
        xhr._requestId = requestId;

        console.log("🔍 XHR intercepted:", {
          id: requestId,
          method: method,
          url:
            urlString.substring(0, 100) + (urlString.length > 100 ? "..." : ""),
        });
      }

      return originalOpen.call(
        this,
        method,
        url,
        async !== false,
        user,
        password
      );
    };

    // Override send to capture request body and setup response handling
    OriginalXHR.prototype.send = function (
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      const xhr = this as ExtendedXMLHttpRequest;

      if (xhr._requestId) {
        const startTime = Date.now();

        // Setup response handler
        const originalOnReadyStateChange = xhr.onreadystatechange;
        xhr.onreadystatechange = function (event: Event) {
          try {
            if (xhr.readyState === 4) {
              // Extract response headers
              const responseHeaders: Record<string, string> = {};
              try {
                const headerString = xhr.getAllResponseHeaders();
                if (headerString) {
                  headerString.split("\r\n").forEach((line) => {
                    const parts = line.split(": ");
                    if (parts.length === 2) {
                      responseHeaders[parts[0].toLowerCase()] = parts[1];
                    }
                  });
                }
              } catch (headerError) {
                console.warn("⚠️ Error parsing response headers:", headerError);
              }

              const interceptedData: InterceptedData = {
                type: "REQUEST_INTERCEPTED",
                data: {
                  id: xhr._requestId!,
                  url: xhr._url!,
                  method: xhr._method!,
                  requestHeaders: xhr._requestHeaders || {},
                  requestBody: body ? String(body) : undefined,
                  responseStatus: xhr.status,
                  responseHeaders,
                  responseBody: xhr.responseText,
                  timestamp: startTime,
                },
              };

              // Send to isolated world
              window.postMessage(interceptedData, "*");

              console.log("✅ XHR data sent to isolated world:", {
                id: xhr._requestId,
                status: xhr.status,
                responseLength: xhr.responseText?.length || 0,
                hasResponse: !!xhr.responseText,
              });
            }
          } catch (error) {
            console.error("❌ Error in XHR response handler:", error);
          }

          // Call original handler if it exists
          if (originalOnReadyStateChange) {
            try {
              originalOnReadyStateChange.call(xhr, event);
            } catch (error) {
              console.warn(
                "⚠️ Original onreadystatechange handler error:",
                error
              );
            }
          }
        };
      }

      return originalSend.call(this, body);
    };

    // Enhanced Fetch interception
    const originalFetch = window.fetch;
    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      let url = "";
      let method = "GET";
      let headers: Record<string, string> = {};
      let body: string | undefined;

      // Extract request information
      try {
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input instanceof Request) {
          url = input.url;
          method = input.method;
          // Note: Cannot easily extract headers/body from Request without consuming
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
                if (typeof value === "string") {
                  headers[key.toLowerCase()] = value;
                }
              });
            }
          }
          body = init.body ? String(init.body) : undefined;
        }
      } catch (error) {
        console.warn("⚠️ Error extracting fetch request data:", error);
      }

      // Check if this URL should be tracked
      if (shouldTrackUrl(url)) {
        requestCounter++;
        const requestId = `fetch_${Date.now()}_${requestCounter}`;
        const startTime = Date.now();

        console.log("🔍 Fetch intercepted:", {
          id: requestId,
          method: method,
          url: url.substring(0, 100) + (url.length > 100 ? "..." : ""),
        });

        try {
          const response = await originalFetch.call(this, input, init);

          // Extract response headers
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key.toLowerCase()] = value;
          });

          // Clone response to read body without consuming original
          const responseClone = response.clone();
          let responseText = "";

          try {
            responseText = await responseClone.text();
          } catch (bodyError) {
            console.warn("⚠️ Error reading response body:", bodyError);
          }

          const interceptedData: InterceptedData = {
            type: "REQUEST_INTERCEPTED",
            data: {
              id: requestId,
              url,
              method,
              requestHeaders: headers,
              requestBody: body,
              responseStatus: response.status,
              responseHeaders,
              responseBody: responseText,
              timestamp: startTime,
            },
          };

          // Send to isolated world
          window.postMessage(interceptedData, "*");

          console.log("✅ Fetch data sent to isolated world:", {
            id: requestId,
            status: response.status,
            responseLength: responseText.length,
            hasResponse: !!responseText,
          });

          return response;
        } catch (error) {
          console.error("❌ Fetch request error:", error);

          // Send error data to isolated world
          const interceptedData: InterceptedData = {
            type: "REQUEST_INTERCEPTED",
            data: {
              id: requestId,
              url,
              method,
              requestHeaders: headers,
              requestBody: body,
              responseStatus: 0,
              responseHeaders: {},
              responseBody: `Fetch Error: ${error}`,
              timestamp: startTime,
            },
          };

          window.postMessage(interceptedData, "*");
          throw error;
        }
      }

      // For non-tracked URLs, use original fetch
      return originalFetch.call(this, input, init);
    };

    console.log("🎯 Main world interceptor fully initialized");

    // Notify isolated world that main world is ready
    window.postMessage({ type: "MAIN_WORLD_READY" }, "*");
  };

  // Start waiting for settings
  waitForSettings();
})();
