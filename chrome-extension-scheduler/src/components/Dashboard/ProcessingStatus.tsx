// ===== FIXED: src/components/Dashboard/ProcessingStatus.tsx =====
import React, { useState, useEffect } from 'react';
import { Card, Badge, Spin, Typography, Progress, Tag, Button, Tooltip, Divider } from 'antd';
import { 
  ClockCircleOutlined, 
  AppstoreOutlined,
  DatabaseOutlined,
  LinkOutlined,
  EyeOutlined,
  ReloadOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface ProcessingState {
  isProcessing: boolean;
  currentLinkId?: string;
  currentScheduleId?: string;
  startTime?: Date;
  logs: string[];
  // Enhanced data from updated scheduler
  openTabIds?: number[];
  trackedRequests?: any[];
  trackedResponses?: any[];
}

interface ProcessingStatusProps {
  backgroundTabsCount: number;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ backgroundTabsCount }) => {
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    logs: []
  });
  const [trackedDataStats, setTrackedDataStats] = useState({ requests: 0, responses: 0 });
  const [lastProcessingTime, setLastProcessingTime] = useState<Date | null>(null);

  useEffect(() => {
    // Get initial state
    loadProcessingState();
    loadTrackedDataStats();

    // Listen for updates
    const messageListener = (message: any) => {
      if (message.type === 'PROCESSING_STATE_UPDATE') {
        setProcessingState(message.data);
        
        // Track when processing starts/stops
        if (message.data.isProcessing && !processingState.isProcessing) {
          // Processing just started
        } else if (!message.data.isProcessing && processingState.isProcessing) {
          // Processing just finished
          setLastProcessingTime(new Date());
          setTimeout(loadTrackedDataStats, 2000); // Refresh tracked data after processing
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [processingState.isProcessing]);

  const loadProcessingState = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PROCESSING_STATE' });
      if (response) {
        setProcessingState(response);
      }
    } catch (error) {
      console.error('Failed to load processing state:', error);
    }
  };

  const loadTrackedDataStats = async () => {
    try {
      const data = await chrome.storage.local.get(['trackedRequests', 'trackedResponses']);
      const requests = data.trackedRequests || [];
      const responses = data.trackedResponses || [];
      setTrackedDataStats({ 
        requests: requests.length, 
        responses: responses.length 
      });
    } catch (error) {
      console.error('Failed to load tracked data stats:', error);
    }
  };

  const getDuration = () => {
    if (!processingState.startTime) return '';
    const duration = Date.now() - new Date(processingState.startTime).getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const getProgressValue = () => {
    if (!processingState.isProcessing) return 0;
    const duration = Date.now() - new Date(processingState.startTime || Date.now()).getTime();
    // Assume max processing time is 2 minutes for progress bar
    return Math.min((duration / 120000) * 100, 95);
  };

  const getTimeSinceLastProcessing = () => {
    if (!lastProcessingTime) return '';
    const diff = Date.now() - lastProcessingTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) return `${minutes}m ${seconds}s ago`;
    return `${seconds}s ago`;
  };

  const inspectCurrentTab = async () => {
    if (processingState.openTabIds && processingState.openTabIds.length > 0) {
      try {
        const tabId = processingState.openTabIds[0];
        await chrome.tabs.update(tabId, { active: true });
      } catch (error) {
        console.error('Failed to switch to tab:', error);
      }
    }
  };

  const forceRefreshData = async () => {
    await loadProcessingState();
    await loadTrackedDataStats();
  };

  const clearTrackedData = async () => {
    try {
      await chrome.storage.local.set({ trackedRequests: [], trackedResponses: [] });
      await loadTrackedDataStats();
    } catch (error) {
      console.error('Failed to clear tracked data:', error);
    }
  };

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              status={processingState.isProcessing ? 'processing' : 'default'}
              text="Processing Status"
            />
          </div>
          <div className="flex items-center gap-2">
            {/* Background Tabs Counter */}
            <Tooltip title={`${backgroundTabsCount} background tabs open`}>
              <Badge count={backgroundTabsCount} size="small" style={{ backgroundColor: '#52c41a' }}>
                <AppstoreOutlined className={backgroundTabsCount > 0 ? 'text-green-500' : 'text-gray-400'} />
              </Badge>
            </Tooltip>
            
            {/* Tracked Data Counter */}
            <Tooltip title={`${trackedDataStats.requests} requests | ${trackedDataStats.responses} responses`}>
              <Badge 
                count={trackedDataStats.requests + trackedDataStats.responses} 
                size="small" 
                style={{ backgroundColor: '#1890ff' }}
              >
                <DatabaseOutlined className={trackedDataStats.requests + trackedDataStats.responses > 0 ? 'text-blue-500' : 'text-gray-400'} />
              </Badge>
            </Tooltip>

            {/* Refresh Button */}
            <Tooltip title="Refresh data">
              <Button size="small" icon={<ReloadOutlined />} onClick={forceRefreshData} />
            </Tooltip>
          </div>
        </div>
      }
    >
      {processingState.isProcessing ? (
        <div className="space-y-4">
          {/* Processing Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Spin size="small" />
              <Text strong>Currently Processing</Text>
              <Tag color="orange">Active</Tag>
            </div>
            {processingState.openTabIds && processingState.openTabIds.length > 0 && (
              <Button 
                size="small" 
                icon={<EyeOutlined />}
                onClick={inspectCurrentTab}
                type="primary"
              >
                Inspect Tab
              </Button>
            )}
          </div>

          {/* Progress Bar */}
          <Progress 
            percent={getProgressValue()} 
            status="active"
            format={(percent) => `${Math.round(percent || 0)}%`}
            strokeColor="#1890ff"
          />
          
          {/* Processing Details */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Link Info */}
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                <LinkOutlined className="text-blue-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500">Processing Link</div>
                  <div className="text-sm font-mono truncate">{processingState.currentLinkId}</div>
                </div>
              </div>
              
              {/* Duration */}
              <div className="flex items-center gap-2 p-2 bg-orange-50 rounded">
                <ClockCircleOutlined className="text-orange-500" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Duration</div>
                  <div className="text-sm font-semibold">{getDuration()}</div>
                </div>
              </div>
            </div>

            {/* Open Tabs Info */}
            {processingState.openTabIds && processingState.openTabIds.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
                <AppstoreOutlined className="text-green-500" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Background Tabs</div>
                  <div className="flex gap-1 flex-wrap">
                    {processingState.openTabIds.map(tabId => (
                      <Tag key={tabId} color="green">{tabId}</Tag>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Current Logs Preview */}
          {processingState.logs.length > 0 && (
            <div>
              <Text strong className="block mb-2">Recent Activity:</Text>
              <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs max-h-32 overflow-y-auto">
                {processingState.logs.slice(-5).map((log, index) => (
                  <div key={index} className="mb-1">
                    <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>
                    <span className="ml-2">{log}</span>
                  </div>
                ))}
                {processingState.logs.length > 5 && (
                  <div className="text-gray-400 italic">
                    ... and {processingState.logs.length - 5} more logs
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Idle State Header */}
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CheckCircleOutlined className="text-green-500 text-xl" />
              <Text className="text-lg">System Ready</Text>
            </div>
            <Text type="secondary">No active processing</Text>
            {lastProcessingTime && (
              <div className="text-xs text-gray-400 mt-1">
                Last processing: {getTimeSinceLastProcessing()}
              </div>
            )}
          </div>

          <Divider />

          {/* System Overview Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Background Tabs Status */}
            <div className="text-center p-3 bg-green-50 rounded">
              <div className="flex items-center justify-center gap-2 mb-2">
                <AppstoreOutlined className={backgroundTabsCount > 0 ? 'text-green-600' : 'text-gray-400'} />
                <Text strong>Background Tabs</Text>
              </div>
              <div className="text-2xl font-bold text-green-600">{backgroundTabsCount}</div>
              <div className="text-xs text-gray-500">
                {backgroundTabsCount > 0 ? 'Ready for inspection' : 'No tabs open'}
              </div>
            </div>

            {/* Tracked Data Status */}
            <div className="text-center p-3 bg-blue-50 rounded">
              <div className="flex items-center justify-center gap-2 mb-2">
                <DatabaseOutlined className="text-blue-600" />
                <Text strong>Tracked Data</Text>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {trackedDataStats.requests + trackedDataStats.responses}
              </div>
              <div className="text-xs text-gray-500">
                {trackedDataStats.requests}req • {trackedDataStats.responses}res
              </div>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="space-y-2">
            <Text strong>Data Breakdown:</Text>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex justify-between items-center p-2 bg-blue-50 rounded text-sm">
                <span>Requests:</span>
                <Badge count={trackedDataStats.requests} style={{ backgroundColor: '#1890ff' }} />
              </div>
              <div className="flex justify-between items-center p-2 bg-green-50 rounded text-sm">
                <span>Responses:</span>
                <Badge count={trackedDataStats.responses} style={{ backgroundColor: '#52c41a' }} />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            <Text strong>Quick Actions:</Text>
            <div className="flex gap-2 flex-wrap">
              <Button 
                size="small"
                icon={<ReloadOutlined />}
                onClick={forceRefreshData}
              >
                Refresh Data
              </Button>
              
              <Button 
                size="small"
                onClick={() => {
                  chrome.storage.local.get(['trackedRequests', 'trackedResponses'])
                    .then(data => console.log('📊 All tracked data:', data));
                }}
              >
                Log Tracked Data
              </Button>

              {(trackedDataStats.requests > 0 || trackedDataStats.responses > 0) && (
                <Button 
                  size="small"
                  danger
                  onClick={clearTrackedData}
                >
                  Clear Data
                </Button>
              )}
            </div>
          </div>

          {/* Tips Section */}
          {backgroundTabsCount === 0 && trackedDataStats.requests === 0 && (
            <div className="text-center p-4 bg-blue-50 rounded">
              <Paragraph className="mb-0 text-sm text-gray-600">
                💡 <strong>Getting Started:</strong> Use "Force Check" to trigger schedule execution, 
                or create a test schedule to see the system in action.
              </Paragraph>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default ProcessingStatus;