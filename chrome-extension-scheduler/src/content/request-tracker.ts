// src/content/request-tracker.ts - Simplified Content Script (Isolated World)

interface TrackedRequest {
  id: string;
  scheduleId: string;
  tabId: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  modelsData?: any;
  timestamp: number;
  source: "fetch" | "xhr";
  completed: boolean;
}

interface ExtensionSettings {
  TRACKING_STOCK_LINK: string;
  scheduleId: string;
  tabId: number;
  DEBUG?: boolean;
  injectedAt?: number;
}

class RequestTracker {
  private settings: ExtensionSettings | null = null;
  private isReady = false;
  private trackedRequests = new Map<string, TrackedRequest>();
  private heartbeatInterval: number | null = null;
  private webRequestsTracked = 0;
  private scriptInterceptionActive = false;

  constructor() {
    console.log("🚀 Request Tracker initializing...");
    this.init();
  }

  private init() {
    // Wait for page to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup());
    } else {
      this.setup();
    }
  }

  private setup() {
    console.log("📡 Request Tracker setting up...");

    // Wait for settings to be injected by background script
    this.waitForSettings();

    // Setup message listener from main world
    this.setupMainWorldListener();

    // Setup webRequest fallback tracking
    this.setupWebRequestFallback();

    // Start heartbeat
    this.startHeartbeat();
  }

  private waitForSettings() {
    const maxAttempts = 50; // 5 seconds with 100ms intervals
    let attempts = 0;

    const checkSettings = () => {
      attempts++;
      const settings = (window as any).EXTENSION_SETTINGS;

      if (settings?.TRACKING_STOCK_LINK) {
        this.settings = settings;
        console.log("✅ Settings received:", {
          trackingUrl: settings.TRACKING_STOCK_LINK.substring(0, 50) + "...",
          scheduleId: settings.scheduleId,
          tabId: settings.tabId,
          injectedAt: settings.injectedAt
            ? new Date(settings.injectedAt).toLocaleTimeString()
            : "unknown",
        });

        this.isReady = true;
        return true;
      }

      if (attempts >= maxAttempts) {
        console.error(
          "❌ Settings timeout - extension not properly configured"
        );
        return true; // Stop trying
      }

      return false;
    };

    if (!checkSettings()) {
      const retryInterval = setInterval(() => {
        if (checkSettings()) {
          clearInterval(retryInterval);
        }
      }, 100);
    }
  }

  private setupMainWorldListener() {
    window.addEventListener("message", (event) => {
      // Only accept messages from same origin
      if (event.source !== window) return;

      const message = event.data;

      switch (message.type) {
        case "REQUEST_INTERCEPTED":
          this.handleInterceptedRequest(message.data);
          break;

        case "MAIN_WORLD_READY":
          console.log("✅ Main world interceptor is ready");
          this.scriptInterceptionActive = true;
          break;

        default:
          // Ignore other messages
          break;
      }
    });

    console.log("📨 Main world message listener setup complete");
  }

  private setupWebRequestFallback() {
    // This is a fallback method using webRequest API through background script
    // Note: This is less reliable than script injection but provides backup

    console.log("🔄 WebRequest fallback setup (limited data available)");

    // We'll track navigation requests to know when main world might have new data
    const navigationObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name && this.isTrackingUrl(entry.name)) {
          this.webRequestsTracked++;
          console.log(
            "🌐 Navigation to tracking URL detected:",
            entry.name.substring(0, 100)
          );
        }
      });
    });

    try {
      navigationObserver.observe({ entryTypes: ["navigation", "resource"] });
    } catch (error) {
      console.warn("⚠️ Performance observer setup failed:", error);
    }
  }

  private async handleInterceptedRequest(data: any) {
    if (!this.settings || !this.isReady) {
      console.warn("⚠️ Received request but tracker not ready");
      return;
    }

    try {
      console.log("📊 Processing intercepted request:", {
        id: data.id,
        url: data.url.substring(0, 100) + "...",
        method: data.method,
        status: data.responseStatus,
      });

      const trackedRequest: TrackedRequest = {
        id: data.id,
        scheduleId: this.settings.scheduleId,
        tabId: this.settings.tabId,
        url: data.url,
        method: data.method,
        requestHeaders: data.requestHeaders || {},
        requestBody: data.requestBody,
        responseStatus: data.responseStatus,
        responseHeaders: data.responseHeaders || {},
        responseBody: data.responseBody,
        timestamp: data.timestamp,
        source: data.id.startsWith("fetch_") ? "fetch" : "xhr",
        completed: data.responseStatus !== undefined,
        modelsData: null,
      };

      // Extract models data if response is available and successful
      if (data.responseBody && data.responseStatus === 200) {
        const modelsData = this.extractModelsData(data.responseBody);
        if (modelsData) {
          trackedRequest.modelsData = modelsData;
          console.log("📦 Models data extracted:", {
            id: data.id,
            modelsCount: Array.isArray(modelsData)
              ? modelsData.length
              : "not array",
            sampleKeys:
              Array.isArray(modelsData) && modelsData.length > 0
                ? Object.keys(modelsData[0] || {}).slice(0, 3)
                : "none",
          });
        }
      }

      // Store in memory
      this.trackedRequests.set(trackedRequest.id, trackedRequest);

      // Save to storage immediately
      await this.saveToStorage(trackedRequest);

      console.log("✅ Request processed and saved:", {
        id: trackedRequest.id,
        completed: trackedRequest.completed,
        hasModels: !!trackedRequest.modelsData,
        totalTracked: this.trackedRequests.size,
      });
    } catch (error) {
      console.error("❌ Error handling intercepted request:", error);
    }
  }

  private extractModelsData(responseBody: string): any {
    try {
      const jsonData = JSON.parse(responseBody);
      return this.findModelsInData(jsonData);
    } catch (error) {
      // Response is not JSON
      return null;
    }
  }

  private findModelsInData(data: any): any {
    if (!data || typeof data !== "object") return null;

    // Primary path: data.item.models
    if (data.data?.item?.models) {
      return data.data.item.models;
    }

    // Alternative paths
    if (data.item?.models) return data.item.models;
    if (data.models) return data.models;

    // Deep search (limited depth to avoid performance issues)
    return this.searchForModels(data, 0);
  }

  private searchForModels(obj: any, depth: number): any {
    if (depth > 3 || !obj || typeof obj !== "object") return null;

    for (const [key, value] of Object.entries(obj)) {
      if (key === "models" && Array.isArray(value) && value.length > 0) {
        return value;
      }

      if (typeof value === "object" && value !== null) {
        const found = this.searchForModels(value, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  private async saveToStorage(request: TrackedRequest) {
    try {
      const storageKey = `tracked_requests_${request.scheduleId}`;

      // Get existing data
      const result = await chrome.storage.local.get(storageKey);
      const existingData: TrackedRequest[] = result[storageKey] || [];

      // Update or add
      const existingIndex = existingData.findIndex(
        (item) => item.id === request.id
      );
      if (existingIndex >= 0) {
        existingData[existingIndex] = request;
      } else {
        existingData.push(request);
      }

      // Limit storage size (keep last 200 requests per schedule)
      if (existingData.length > 200) {
        existingData.splice(0, existingData.length - 200);
      }

      await chrome.storage.local.set({ [storageKey]: existingData });
    } catch (error) {
      console.error("❌ Error saving to storage:", error);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.settings || !this.isReady) return;

      const completedRequests = Array.from(
        this.trackedRequests.values()
      ).filter((r) => r.completed);
      const modelsFound = completedRequests.filter((r) => r.modelsData);

      const heartbeatData = {
        scheduleId: this.settings.scheduleId,
        tabId: this.settings.tabId,
        totalTracked: this.trackedRequests.size,
        completedRequests: completedRequests.length,
        modelsFound: modelsFound.length,
        webRequestsTracked: this.webRequestsTracked,
        scriptInterceptionActive: this.scriptInterceptionActive,
        lastActivity: Date.now(),
      };

      try {
        chrome.runtime.sendMessage({
          type: "CONTENT_SCRIPT_HEARTBEAT",
          data: heartbeatData,
        });
      } catch (error) {
        // Background script might not be available
        console.warn(
          "⚠️ Heartbeat failed - background script may be unavailable"
        );
      }
    }, 10000) as any; // 10 second intervals
  }

  private isTrackingUrl(url: string): boolean {
    if (!this.settings?.TRACKING_STOCK_LINK) return false;
    return url.includes(this.settings.TRACKING_STOCK_LINK);
  }

  // Public methods for debugging
  public getStats() {
    return {
      isReady: this.isReady,
      settings: this.settings,
      trackedCount: this.trackedRequests.size,
      completedCount: Array.from(this.trackedRequests.values()).filter(
        (r) => r.completed
      ).length,
      modelsCount: Array.from(this.trackedRequests.values()).filter(
        (r) => r.modelsData
      ).length,
      webRequestsTracked: this.webRequestsTracked,
      scriptInterceptionActive: this.scriptInterceptionActive,
    };
  }

  public getTrackedRequests(): TrackedRequest[] {
    return Array.from(this.trackedRequests.values());
  }

  public clearTrackedRequests() {
    this.trackedRequests.clear();
    console.log("🧹 Tracked requests cleared");
  }

  public destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.trackedRequests.clear();
    console.log("💀 Request tracker destroyed");
  }
}

// Initialize tracker when DOM is ready
let tracker: RequestTracker | null = null;

const initTracker = () => {
  if (!tracker) {
    tracker = new RequestTracker();

    // Export for debugging
    (window as any).__requestTracker__ = tracker;
    console.log("🔍 Request tracker available as window.__requestTracker__");
  }
};

// Initialize based on DOM state
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTracker);
} else {
  initTracker();
}

console.log("📡 Request tracker script loaded");
export default RequestTracker;
