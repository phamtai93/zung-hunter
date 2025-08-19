// ===== FIXED: src/components/Dashboard/RealTimeClock.tsx =====
import React, { useState, useEffect } from 'react';
import { Card, Badge, Tooltip, Space, Divider } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  CalendarOutlined,
  ThunderboltOutlined,
  AppstoreOutlined
} from '@ant-design/icons';

interface SystemStatus {
  schedulerRunning: boolean;
  nextExecution?: Date;
  activeProcessing: boolean;
  backgroundTabsCount: number;
}

const RealTimeClock: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    schedulerRunning: false,
    activeProcessing: false,
    backgroundTabsCount: 0
  });

  useEffect(() => {
    // Optimize update frequency - 100ms is enough for smooth display
    const interval = setInterval(() => {
      setTime(new Date());
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Load system status
    const loadSystemStatus = async () => {
      try {
        // Get processing state
        const processingState = await chrome.runtime.sendMessage({ type: 'GET_PROCESSING_STATE' });
        
        // Get background tabs
        const tabsResult = await chrome.runtime.sendMessage({ type: 'GET_BACKGROUND_TABS' });
        
        setSystemStatus({
          schedulerRunning: true, // Assume running if we get response
          activeProcessing: processingState?.isProcessing || false,
          backgroundTabsCount: tabsResult?.tabs?.length || 0,
        });
      } catch (error) {
        setSystemStatus(prev => ({ ...prev, schedulerRunning: false }));
      }
    };

    loadSystemStatus();
    
    // Update status every 5 seconds
    const statusInterval = setInterval(loadSystemStatus, 5000);
    
    // Listen for real-time updates
    const messageListener = (message: any) => {
      if (message.type === 'PROCESSING_STATE_UPDATE') {
        setSystemStatus(prev => ({
          ...prev,
          activeProcessing: message.data.isProcessing
        }));
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(statusInterval);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = Math.floor(date.getMilliseconds() / 100); // Show only 1 decimal
    
    return { hours, minutes, seconds, milliseconds };
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const timeComponents = formatTime(time);

  return (
    <Card 
      className="text-center"
      title={
        <div className="flex items-center justify-between">
          <span className="text-sm">System Clock</span>
          <Space size="small">
            {/* Scheduler Status */}
            <Tooltip title={systemStatus.schedulerRunning ? 'Scheduler Running' : 'Scheduler Stopped'}>
              <Badge 
                status={systemStatus.schedulerRunning ? 'processing' : 'error'} 
                dot 
              />
            </Tooltip>
            
            {/* Active Processing Indicator */}
            {systemStatus.activeProcessing && (
              <Tooltip title="Processing in progress">
                <ThunderboltOutlined className="text-orange-500 animate-pulse" />
              </Tooltip>
            )}
            
            {/* Background Tabs Counter */}
            {systemStatus.backgroundTabsCount > 0 && (
              <Tooltip title={`${systemStatus.backgroundTabsCount} background tabs open`}>
                <Badge count={systemStatus.backgroundTabsCount} size="small" style={{ backgroundColor: '#52c41a' }} />
              </Tooltip>
            )}
          </Space>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Main Clock Display */}
        <div className="relative">
          <div className="text-4xl font-mono font-bold text-blue-600 tracking-wider">
            {timeComponents.hours}:{timeComponents.minutes}:{timeComponents.seconds}
            <span className="text-lg text-blue-400">
              .{timeComponents.milliseconds}
            </span>
          </div>
          
          {/* Processing Indicator Overlay */}
          {systemStatus.activeProcessing && (
            <div className="absolute -top-2 -right-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
            </div>
          )}
        </div>

        {/* Date */}
        <div className="flex items-center justify-center gap-1 text-sm text-gray-500">
          <CalendarOutlined />
          {formatDate(time)}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* System Status Summary */}
        <div className="space-y-2">
          {/* Scheduler Status */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              {systemStatus.schedulerRunning ? (
                <PlayCircleOutlined className="text-green-500" />
              ) : (
                <PauseCircleOutlined className="text-red-500" />
              )}
              <span>Scheduler</span>
            </div>
            <span className={systemStatus.schedulerRunning ? 'text-green-600' : 'text-red-600'}>
              {systemStatus.schedulerRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          {/* Processing Status */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <ThunderboltOutlined className={systemStatus.activeProcessing ? 'text-orange-500' : 'text-gray-400'} />
              <span>Processing</span>
            </div>
            <span className={systemStatus.activeProcessing ? 'text-orange-600' : 'text-gray-500'}>
              {systemStatus.activeProcessing ? 'Active' : 'Idle'}
            </span>
          </div>

          {/* Background Tabs */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <AppstoreOutlined className={systemStatus.backgroundTabsCount > 0 ? 'text-green-500' : 'text-gray-400'} />
              <span>Background Tabs</span>
            </div>
            <Badge 
              count={systemStatus.backgroundTabsCount} 
              size="small" 
              style={{ 
                backgroundColor: systemStatus.backgroundTabsCount > 0 ? '#52c41a' : '#d9d9d9',
                color: systemStatus.backgroundTabsCount > 0 ? 'white' : '#999'
              }} 
            />
          </div>
        </div>

        {/* Timezone Info */}
        <div className="text-xs text-gray-400 border-t pt-2">
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
          <span className="mx-2">•</span>
          UTC{time.getTimezoneOffset() > 0 ? '-' : '+'}
          {Math.abs(time.getTimezoneOffset() / 60).toString().padStart(2, '0')}:
          {Math.abs(time.getTimezoneOffset() % 60).toString().padStart(2, '0')}
        </div>
      </div>
    </Card>
  );
};

export default RealTimeClock;