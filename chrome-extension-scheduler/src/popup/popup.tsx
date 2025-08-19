import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Card, Button, Badge, Typography, Space, Divider } from 'antd';
import { 
  SettingOutlined, 
  DashboardOutlined, 
  BarChartOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined 
} from '@ant-design/icons';
import '../styles/globals.css';

const { Text, Title } = Typography;

const Popup: React.FC = () => {
  const [processingState, setProcessingState] = useState<any>({
    isProcessing: false,
    logs: []
  });

  useEffect(() => {
    // Get processing state
    chrome.runtime.sendMessage({ type: 'GET_PROCESSING_STATE' }, (response) => {
      if (response) {
        setProcessingState(response);
      }
    });
  }, []);

  const openDashboard = () => {
    chrome.tabs.create({ 
      url: chrome.runtime.getURL('src/options/options.html#/dashboard') 
    });
  };

  const openSettings = () => {
    chrome.tabs.create({ 
      url: chrome.runtime.getURL('src/options/options.html#/settings') 
    });
  };

  const openReport = () => {
    chrome.tabs.create({ 
      url: chrome.runtime.getURL('src/options/options.html#/report') 
    });
  };

  const toggleScheduler = () => {
    const action = processingState.isProcessing ? 'STOP_SCHEDULER' : 'START_SCHEDULER';
    chrome.runtime.sendMessage({ type: action });
  };

  return (
    <div style={{ width: 300, padding: 16 }}>
      <div className="text-center mb-4">
        <Title level={4} className="mb-2">Link Scheduler</Title>
        <Badge 
          status={processingState.isProcessing ? "processing" : "default"} 
          text={processingState.isProcessing ? "Active" : "Idle"}
        />
      </div>

      <Divider />

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Button 
          type="primary" 
          block 
          icon={<DashboardOutlined />}
          onClick={openDashboard}
        >
          Dashboard
        </Button>

        <Button 
          block 
          icon={<SettingOutlined />}
          onClick={openSettings}
        >
          Settings
        </Button>

        <Button 
          block 
          icon={<BarChartOutlined />}
          onClick={openReport}
        >
          Reports
        </Button>

        <Divider />

        <Button 
          type={processingState.isProcessing ? "default" : "primary"}
          block 
          icon={processingState.isProcessing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={toggleScheduler}
        >
          {processingState.isProcessing ? 'Stop Scheduler' : 'Start Scheduler'}
        </Button>
      </Space>

      {processingState.isProcessing && (
        <Card size="small" className="mt-4">
          <Text strong className="block mb-2">Currently Processing</Text>
          <div className="text-xs bg-gray-100 p-2 rounded max-h-20 overflow-y-auto">
            {processingState.logs.map((log: string, index: number) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// Initialize popup
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}