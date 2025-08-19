// ===== UPDATED: src/components/Dashboard/Dashboard.tsx =====
import React, { useState, useEffect } from 'react';
import { Row, Col, Button, Typography, Badge, Modal, message, Space } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  ReloadOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  BugOutlined,
  ThunderboltOutlined,
  EyeOutlined
} from '@ant-design/icons';
import RealTimeClock from './RealTimeClock';
import ProcessingStatus from './ProcessingStatus';
import UpcomingSchedules from './UpcomingSchedules';
import LiveLogs from './LiveLogs';
import TabManagement from './TabManagement';

const { Title } = Typography;

interface BackgroundTab {
  scheduleId: string;
  tabId: number;
}

const Dashboard: React.FC = () => {
  const [backgroundTabs, setBackgroundTabs] = useState<BackgroundTab[]>([]);
  const [debugMode, setDebugMode] = useState(false);

  // Load background tabs periodically
  const loadBackgroundTabs = async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_BACKGROUND_TABS' });
      setBackgroundTabs(result.tabs || []);
    } catch (error) {
      console.error('Failed to load background tabs:', error);
    }
  };

  useEffect(() => {
    loadBackgroundTabs();
    const interval = setInterval(loadBackgroundTabs, 5000);
    return () => clearInterval(interval);
  }, []);

  // ===== SCHEDULER CONTROLS =====
  const forceScheduleCheck = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'FORCE_SCHEDULE_CHECK' });
      if (response?.success) {
        message.success('Schedule check triggered');
        console.log('Schedule check triggered');
      }
    } catch (error) {
      message.error('Failed to trigger schedule check');
    }
  };

  const startScheduler = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'START_SCHEDULER' });
      message.success('Scheduler started');
    } catch (error) {
      message.error('Failed to start scheduler');
    }
  };

  const stopScheduler = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_SCHEDULER' });
      message.success('Scheduler stopped');
    } catch (error) {
      message.error('Failed to stop scheduler');
    }
  };

  // ===== TAB MANAGEMENT =====
  const closeAllTabs = async () => {
    if (backgroundTabs.length === 0) {
      message.info('No background tabs to close');
      return;
    }

    Modal.confirm({
      title: 'Close All Background Tabs?',
      content: `This will close ${backgroundTabs.length} background tabs. Continue?`,
      icon: <DeleteOutlined />,
      okType: 'danger',
      onOk: async () => {
        try {
          await chrome.runtime.sendMessage({ type: 'CLOSE_ALL_BACKGROUND_TABS' });
          message.success('All background tabs closed');
          loadBackgroundTabs();
        } catch (error) {
          message.error('Failed to close tabs');
        }
      }
    });
  };

  const inspectRandomTab = async () => {
    if (backgroundTabs.length === 0) {
      message.warning('No background tabs available');
      return;
    }

    try {
      const randomTab = backgroundTabs[Math.floor(Math.random() * backgroundTabs.length)];
      await chrome.tabs.update(randomTab.tabId, { active: true });
      message.success(`Switched to tab ${randomTab.tabId}`);
    } catch (error) {
      message.error('Failed to switch to tab');
    }
  };

  // ===== DEBUG FUNCTIONS =====
  const showTrackedData = async () => {
    try {
      const data = await chrome.storage.local.get(['trackedRequests', 'trackedResponses']);
      console.log('📊 Current tracked data:', data);
      
      const requests = data.trackedRequests || [];
      const responses = data.trackedResponses || [];
      
      Modal.info({
        title: 'Tracked Data Summary',
        content: (
          <div>
            <p><strong>Requests:</strong> {requests.length}</p>
            <p><strong>Responses:</strong> {responses.length}</p>
            <p><small>Check console for detailed data</small></p>
          </div>
        ),
        width: 400
      });
    } catch (error) {
      message.error('Failed to get tracked data');
    }
  };

  const testDebugMode = () => {
    setDebugMode(!debugMode);
    message.info(debugMode ? 'Debug mode disabled' : 'Debug mode enabled');
  };

  return (
    <div className="space-y-6">
      {/* ===== HEADER WITH CONTROLS ===== */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Title level={2} className="mb-0">Dashboard</Title>
          <Badge count={backgroundTabs.length} style={{ backgroundColor: '#52c41a' }}>
            <AppstoreOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
          </Badge>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {/* Scheduler Controls */}
          <Space.Compact>
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />}
              onClick={startScheduler}
            >
              Start
            </Button>
            <Button 
              icon={<PauseCircleOutlined />}
              onClick={stopScheduler}
            >
              Stop
            </Button>
            <Button 
              icon={<ReloadOutlined />}
              onClick={forceScheduleCheck}
            >
              Force Check
            </Button>
          </Space.Compact>

          {/* Tab Management Controls */}
          <Space.Compact>
            <Button 
              icon={<EyeOutlined />}
              onClick={inspectRandomTab}
              disabled={backgroundTabs.length === 0}
            >
              Inspect Tab
            </Button>
            <Button 
              danger
              icon={<DeleteOutlined />}
              onClick={closeAllTabs}
              disabled={backgroundTabs.length === 0}
            >
              Close All ({backgroundTabs.length})
            </Button>
          </Space.Compact>

          {/* Debug Controls */}
          {debugMode && (
            <Space.Compact>
              <Button 
                icon={<ThunderboltOutlined />}
                onClick={showTrackedData}
              >
                Show Data
              </Button>
            </Space.Compact>
          )}

          <Button 
            type={debugMode ? 'primary' : 'default'}
            icon={<BugOutlined />}
            onClick={testDebugMode}
          >
            Debug
          </Button>
        </div>
      </div>

      {/* ===== DEBUG INFO PANEL ===== */}
      {debugMode && (
        <div style={{ 
          background: '#f6f6f6', 
          padding: '12px', 
          borderRadius: '6px',
          border: '1px dashed #d9d9d9'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>🔧 Debug Mode</strong></span>
            <Space>
              <span>Background Tabs: {backgroundTabs.length}</span>
              <Button 
                size="small" 
                onClick={loadBackgroundTabs}
              >
                Refresh Count
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* ===== MAIN DASHBOARD GRID ===== */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <RealTimeClock />
        </Col>
        <Col xs={24} md={16}>
          <ProcessingStatus backgroundTabsCount={backgroundTabs.length} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <UpcomingSchedules />
        </Col>
        <Col xs={24} lg={12}>
          <LiveLogs debugMode={debugMode} />
        </Col>
      </Row>

      {/* ===== TAB MANAGEMENT PANEL ===== */}
      {(debugMode || backgroundTabs.length > 0) && (
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <TabManagement 
              backgroundTabs={backgroundTabs} 
              onTabsChange={loadBackgroundTabs}
              debugMode={debugMode}
            />
          </Col>
        </Row>
      )}
    </div>
  );
};

export default Dashboard;