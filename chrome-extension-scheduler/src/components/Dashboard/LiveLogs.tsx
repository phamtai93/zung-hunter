// ===== UPDATED: src/components/Dashboard/LiveLogs.tsx =====
import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Badge, Space, Tooltip, Switch } from 'antd';
import { 
  ClearOutlined, 
  DownloadOutlined, 
  DatabaseOutlined,
  BugOutlined
} from '@ant-design/icons';

interface LogEntry {
  timestamp: Date;
  message: string;
  level: 'info' | 'error' | 'warning' | 'success' | 'debug';
  category?: 'processing' | 'tab' | 'network' | 'system';
  metadata?: any;
}

interface LiveLogsProps {
  debugMode?: boolean;
}

const LiveLogs: React.FC<LiveLogsProps> = ({ debugMode = false }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [filterLevel] = useState<string>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const maxLogs = 200;

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [filteredLogs]);

  // Enhanced log parsing to categorize different types of logs
  const parseLogMessage = (logMessage: string): LogEntry => {
    const timestamp = new Date();
    let level: LogEntry['level'] = 'info';
    let category: LogEntry['category'] = 'system';
    let message = logMessage;

    // Parse emojis and keywords to determine level and category
    if (logMessage.includes('❌') || logMessage.toLowerCase().includes('error')) {
      level = 'error';
    } else if (logMessage.includes('⚠️') || logMessage.toLowerCase().includes('warning')) {
      level = 'warning';
    } else if (logMessage.includes('✅') || logMessage.toLowerCase().includes('success')) {
      level = 'success';
    } else if (logMessage.includes('🔧') || logMessage.includes('📊')) {
      level = 'debug';
    }

    // Determine category
    if (logMessage.includes('tab') || logMessage.includes('Tab') || logMessage.includes('🔗')) {
      category = 'tab';
    } else if (logMessage.includes('request') || logMessage.includes('response') || logMessage.includes('📡') || logMessage.includes('📋')) {
      category = 'network';
    } else if (logMessage.includes('Processing') || logMessage.includes('execution') || logMessage.includes('🚀')) {
      category = 'processing';
    }

    // Extract metadata (tab IDs, URLs, etc.)
    let metadata: any = {};
    
    // Extract tab IDs
    const tabIdMatch = logMessage.match(/tab\s+(\d+)/i);
    if (tabIdMatch) {
      metadata.tabId = parseInt(tabIdMatch[1]);
    }

    // Extract URLs
    const urlMatch = logMessage.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      metadata.url = urlMatch[0];
    }

    // Extract counts
    const countMatch = logMessage.match(/(\d+)\s+(requests?|responses?|items?)/i);
    if (countMatch) {
      metadata.count = parseInt(countMatch[1]);
      metadata.type = countMatch[2];
    }

    return {
      timestamp,
      message,
      level,
      category,
      metadata
    };
  };

  useEffect(() => {
    // Listen for log messages from background script
    const messageListener = (message: any) => {
      if (message.type === 'PROCESSING_STATE_UPDATE' && message.data.logs) {
        const newLogs = message.data.logs.map(parseLogMessage);
        
        setLogs(prevLogs => {
          const combined = [...prevLogs, ...newLogs];
          return combined.slice(-maxLogs);
        });
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Filter logs based on debug mode and level
  useEffect(() => {
    let filtered = logs;

    if (!showDebugLogs && !debugMode) {
      filtered = filtered.filter(log => log.level !== 'debug');
    }

    if (filterLevel !== 'all') {
      filtered = filtered.filter(log => log.level === filterLevel);
    }

    setFilteredLogs(filtered);
  }, [logs, showDebugLogs, filterLevel, debugMode]);

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const logText = filteredLogs.map(log => {
      const metadata = log.metadata ? ` | ${JSON.stringify(log.metadata)}` : '';
      return `[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}(${log.category}): ${log.message}${metadata}`;
    }).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scheduler-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'success': return 'text-green-400';
      case 'debug': return 'text-purple-400';
      default: return 'text-blue-400';
    }
  };

  const getCategoryIcon = (category?: string): string => {
    switch (category) {
      case 'tab': return '🔗';
      case 'network': return '📡';
      case 'processing': return '⚙️';
      default: return '📝';
    }
  };

  const getLogStats = () => {
    const stats = filteredLogs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return stats;
  };

  const logStats = getLogStats();

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Live Logs</span>
            <Badge count={filteredLogs.length} style={{ backgroundColor: '#1890ff' }} />
          </div>
          <Space size="small">
            {debugMode && (
              <Tooltip title="Show debug logs">
                <Switch
                  checked={showDebugLogs}
                  onChange={setShowDebugLogs}
                  size="small"
                  checkedChildren={<BugOutlined />}
                  unCheckedChildren={<BugOutlined />}
                />
              </Tooltip>
            )}
          </Space>
        </div>
      }
      extra={
        <Space size="small">
          {/* Log Level Stats */}
          <Space size="small">
            {Object.entries(logStats).map(([level, count]) => (
              <Badge 
                key={level}
                count={count} 
                size="small"
                style={{ 
                  backgroundColor: level === 'error' ? '#ff4d4f' : 
                                  level === 'warning' ? '#faad14' :
                                  level === 'success' ? '#52c41a' : '#1890ff'
                }}
                title={`${level}: ${count}`}
              />
            ))}
          </Space>

          <Button 
            size="small" 
            icon={<ClearOutlined />}
            onClick={clearLogs}
            disabled={logs.length === 0}
          >
            Clear
          </Button>
          <Button 
            size="small" 
            icon={<DownloadOutlined />}
            onClick={exportLogs}
            disabled={filteredLogs.length === 0}
          >
            Export
          </Button>
        </Space>
      }
    >
      {/* Enhanced Terminal with better styling */}
      <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-80 overflow-y-auto border border-gray-700">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <DatabaseOutlined style={{ fontSize: '24px', marginBottom: '8px' }} />
              <div>Waiting for logs...</div>
              {debugMode && <div className="text-xs mt-2">Debug mode enabled - more details will appear</div>}
            </div>
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div key={index} className="mb-1 leading-relaxed hover:bg-gray-800 px-2 py-1 rounded transition-colors">
              <div className="flex items-start gap-2">
                {/* Timestamp */}
                <span className="text-gray-500 flex-shrink-0 min-w-[70px]">
                  [{log.timestamp.toLocaleTimeString()}]
                </span>
                
                {/* Category Icon */}
                <span className="flex-shrink-0">
                  {getCategoryIcon(log.category)}
                </span>
                
                {/* Level Badge */}
                <span className={`${getLevelColor(log.level)} font-semibold flex-shrink-0 min-w-[60px]`}>
                  {log.level.toUpperCase()}
                </span>
                
                {/* Message */}
                <span className="flex-1 break-words">
                  {log.message}
                </span>
                
                {/* Metadata Tags */}
                {log.metadata && debugMode && (
                  <div className="flex-shrink-0 text-xs">
                    {log.metadata.tabId && (
                      <span className="bg-blue-600 text-white px-1 rounded mr-1">
                        T:{log.metadata.tabId}
                      </span>
                    )}
                    {log.metadata.count && (
                      <span className="bg-green-600 text-white px-1 rounded">
                        {log.metadata.count}
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              {/* URL metadata on separate line for readability */}
              {log.metadata?.url && debugMode && (
                <div className="ml-20 text-blue-300 text-xs truncate">
                  🔗 {log.metadata.url}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Log Summary Footer */}
      {filteredLogs.length > 0 && (
        <div className="mt-3 p-2 bg-gray-50 rounded text-xs flex justify-between items-center">
          <span className="text-gray-600">
            Showing {filteredLogs.length} of {logs.length} logs
          </span>
          <Space size="small">
            <span className="text-gray-500">
              Categories: {new Set(filteredLogs.map(log => log.category)).size}
            </span>
            <span className="text-gray-500">
              Levels: {Object.keys(logStats).length}
            </span>
          </Space>
        </div>
      )}
    </Card>
  );
};

export default LiveLogs;