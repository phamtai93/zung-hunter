import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Card, Button, Badge, Typography, Space, Divider, ConfigProvider, App as AntdApp } from 'antd';
import { 
  SettingOutlined, 
  DashboardOutlined, 
  BarChartOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined 
} from '@ant-design/icons';
import '../styles/globals.css';

const { Text, Title } = Typography;

const PopupContent: React.FC = () => {
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
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 8 }}>Link Scheduler</Title>
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
        <Card size="small" style={{ marginTop: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Currently Processing</Text>
          <div style={{ 
            fontSize: '12px', 
            backgroundColor: '#f5f5f5', 
            padding: 8, 
            borderRadius: 4, 
            maxHeight: 80, 
            overflowY: 'auto' 
          }}>
            {processingState.logs.map((log: string, index: number) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

const Popup: React.FC = () => {
  // Suppress WebSocket errors in extension environment
  React.useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      const message = args[0];
      if (typeof message === 'string' && (
        message.includes('WebSocket') || 
        message.includes('ws://localhost') ||
        message.includes('vite-hmr')
      )) {
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <AntdApp>
        <PopupContent />
      </AntdApp>
    </ConfigProvider>
  );
};

// Initialize popup
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}