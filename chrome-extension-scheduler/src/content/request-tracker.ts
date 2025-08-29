// src/content/request-tracker.ts - Isolated World Bridge (CRXJS compatible)

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
  source: 'fetch' | 'xhr';
  completed: boolean;
}

interface ExtensionSettings {
  TRACKING_STOCK_LINK: string;
  scheduleId: string;
  tabId: number;
  DEBUG?: boolean;
}

class IsolatedWorldBridge {
  private settings: ExtensionSettings | null = null;
  private isInitialized = false;
  private trackedRequests = new Map<string, TrackedRequest>();
  private heartbeatInterval: number | null = null;

  constructor() {
    console.log('Isolated world bridge initializing...');
    this.init();
  }

  private init() {
    // Wait for settings from extension
    this.waitForSettings();
    
    // Setup message listener from main world
    this.setupMessageListener();
    
    // Setup periodic heartbeat to background
    this.setupHeartbeat();
  }

  private waitForSettings() {
    const checkSettings = () => {
      const settings = (window as any).EXTENSION_SETTINGS;
      if (settings?.TRACKING_STOCK_LINK) {
        this.settings = settings;
        console.log('Isolated world: Settings received', {
          trackingUrl: settings.TRACKING_STOCK_LINK.substring(0, 50) + '...',
          scheduleId: settings.scheduleId,
          tabId: settings.tabId
        });
        
        // Now inject main world script
        this.injectMainWorldScript();
        return true;
      }
      return false;
    };

    // Try immediately
    if (!checkSettings()) {
      // Retry every 100ms for up to 10 seconds
      let attempts = 0;
      const maxAttempts = 100;
      
      const retryInterval = setInterval(() => {
        attempts++;
        if (checkSettings() || attempts >= maxAttempts) {
          clearInterval(retryInterval);
          if (attempts >= maxAttempts) {
            console.error('Isolated world: Settings timeout - extension may not be properly configured');
          }
        }
      }, 100);
    }
  }

  private async injectMainWorldScript() {
    try {
      // Get current tab ID
      const tabId = await this.getCurrentTabId();
      
      // Read main world script content
      const scriptUrl = chrome.runtime.getURL('src/content/main-world-interceptor.ts');
      const response = await fetch(scriptUrl);
      const scriptContent = await response.text();
      
      // Inject into main world via executeScript
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        code: scriptContent
      } as any); // Type assertion to bypass Chrome API type issues
      
      console.log('Isolated world: Main world script injected successfully');
      this.isInitialized = true;
      
    } catch (error) {
      console.error('Isolated world: Failed to inject main world script:', error);
      
      // Fallback: Notify background to inject it
      try {
        chrome.runtime.sendMessage({
          type: 'INJECT_MAIN_WORLD_SCRIPT',
          tabId: this.settings?.tabId
        });
      } catch (msgError) {
        console.error('Isolated world: Failed to request main world injection:', msgError);
      }
    }
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      // Only listen to messages from same origin
      if (event.source !== window) return;

      const message = event.data;
      
      switch (message.type) {
        case 'REQUEST_INTERCEPTED':
          this.handleInterceptedRequest(message.data);
          break;
          
        case 'MAIN_WORLD_READY':
          console.log('Isolated world: Main world interceptor is ready');
          break;
          
        default:
          // Ignore other messages
          break;
      }
    });
    
    console.log('Isolated world: Message listener setup complete');
  }

  private async handleInterceptedRequest(data: any) {
    if (!this.settings) {
      console.warn('Isolated world: Received request but no settings available');
      return;
    }

    try {
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
        source: data.id.startsWith('fetch_') ? 'fetch' : 'xhr',
        completed: data.responseStatus !== undefined,
        modelsData: null
      };

      // Extract models data if response is available
      if (data.responseBody && data.responseStatus === 200) {
        try {
          const jsonData = JSON.parse(data.responseBody);
          const modelsData = this.extractModelsData(jsonData);
          if (modelsData) {
            trackedRequest.modelsData = modelsData;
            console.log('Isolated world: Models data extracted', {
              id: data.id,
              modelsCount: Array.isArray(modelsData) ? modelsData.length : 'not array'
            });
          }
        } catch (parseError) {
          // Response is not JSON, that's okay
        }
      }

      // Store in memory
      this.trackedRequests.set(trackedRequest.id, trackedRequest);

      // Save to storage immediately
      await this.saveToStorage(trackedRequest);

      console.log('Isolated world: Request processed and saved', {
        id: trackedRequest.id,
        url: trackedRequest.url.substring(0, 100),
        status: trackedRequest.responseStatus,
        hasModels: !!trackedRequest.modelsData
      });

    } catch (error) {
      console.error('Isolated world: Error handling intercepted request:', error);
    }
  }

  private extractModelsData(responseData: any): any {
    if (!responseData || typeof responseData !== 'object') return null;

    try {
      // Primary path: data.item.models
      if (responseData.data?.item?.models) {
        return responseData.data.item.models;
      }

      // Alternative paths
      if (responseData.item?.models) return responseData.item.models;
      if (responseData.models) return responseData.models;

      // Deep search
      return this.searchForModels(responseData);
      
    } catch (error) {
      console.error('Error extracting models data:', error);
      return null;
    }
  }

  private searchForModels(obj: any, depth = 0): any {
    if (depth > 3 || !obj || typeof obj !== 'object') return null;

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'models' && Array.isArray(value)) {
        return value;
      }
      
      if (typeof value === 'object' && value !== null) {
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
      const existingIndex = existingData.findIndex(item => item.id === request.id);
      if (existingIndex >= 0) {
        existingData[existingIndex] = request;
      } else {
        existingData.push(request);
      }

      // Limit storage size
      if (existingData.length > 100) {
        existingData.splice(0, existingData.length - 100);
      }

      await chrome.storage.local.set({ [storageKey]: existingData });

    } catch (error) {
      console.error('Isolated world: Error saving to storage:', error);
    }
  }

  private setupHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      if (!this.settings || !this.isInitialized) return;

      const completedRequests = Array.from(this.trackedRequests.values()).filter(r => r.completed);
      const modelsFound = completedRequests.filter(r => r.modelsData);

      const summary = {
        scheduleId: this.settings.scheduleId,
        tabId: this.settings.tabId,
        totalTracked: this.trackedRequests.size,
        completedRequests: completedRequests.length,
        modelsFound: modelsFound.length,
        lastActivity: Date.now(),
        isMainWorldActive: this.isInitialized
      };

      try {
        chrome.runtime.sendMessage({
          type: 'CONTENT_SCRIPT_HEARTBEAT',
          data: summary
        });
      } catch (error) {
        // Background script might not be available
      }
    }, 10000) as any;
  }

  private async getCurrentTabId(): Promise<number> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }, (response) => {
          resolve(response?.tabId || this.settings?.tabId || 0);
        });
      } catch (error) {
        resolve(this.settings?.tabId || 0);
      }
    });
  }

  // Public methods for debugging and feature extension
  public getStats() {
    return {
      isInitialized: this.isInitialized,
      settings: this.settings,
      trackedCount: this.trackedRequests.size,
      completedCount: Array.from(this.trackedRequests.values()).filter(r => r.completed).length,
      modelsCount: Array.from(this.trackedRequests.values()).filter(r => r.modelsData).length
    };
  }

  public getTrackedRequests() {
    return Array.from(this.trackedRequests.values());
  }

  public clearTrackedRequests() {
    this.trackedRequests.clear();
    console.log('Isolated world: Tracked requests cleared');
  }

  // Future extension point
  public async executeCustomAction(action: string, data?: any) {
    console.log(`Isolated world: Custom action requested: ${action}`, data);
    
    // Example: Future features can be added here
    switch (action) {
      case 'EXTRACT_PAGE_DATA':
        // Custom page data extraction
        break;
        
      case 'MODIFY_REQUESTS':
        // Request modification logic
        break;
        
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }

  public destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.trackedRequests.clear();
    console.log('Isolated world bridge destroyed');
  }
}

// Initialize bridge
const bridge = new IsolatedWorldBridge();

// Export for debugging and future extensions
if (typeof window !== 'undefined') {
  (window as any).__isolatedWorldBridge__ = bridge;
  console.log('Isolated world bridge available as window.__isolatedWorldBridge__');
}

export default IsolatedWorldBridge;