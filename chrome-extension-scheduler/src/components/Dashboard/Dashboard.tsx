// src/components/Dashboard/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Space, Badge, Row, Col, Select, Button } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { ScheduleRepository } from '../../storage/repositories';
import { Logger, LogEntry, LogLevel } from '../../utils/logger';
import { Schedule } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

interface ActiveTab {
  id: string;
  linkName: string;
  url: string;
  startTime: Date | string;
  status: string;
  requestCount: number;
}

const Dashboard: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTabs, setActiveTabs] = useState<ActiveTab[]>([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string>('all');
  const [isSchedulerRunning, setIsSchedulerRunning] = useState(false);
  const [stats, setStats] = useState({
    totalSchedules: 0,
    activeSchedules: 0,
    completedToday: 0
  });

  // Đồng hồ thời gian thực (cập nhật mỗi 100ms để có độ chính xác cao)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Load dữ liệu ban đầu
  useEffect(() => {
    console.log('Dashboard component initialized'); // Debug log
    
    // Suppress WebSocket errors in extension environment
    const originalError = console.error;
    console.error = (...args) => {
      const message = args[0];
      if (typeof message === 'string' && (
        message.includes('WebSocket') || 
        message.includes('ws://localhost') ||
        message.includes('vite-hmr')
      )) {
        // Suppress WebSocket related errors in extension
        return;
      }
      originalError.apply(console, args);
    };
    
    // Load initial data
    loadData();
    
    // Log dashboard initialization (this will trigger background notification)
    Logger.info('Dashboard opened', { timestamp: new Date().toISOString() }, 'DASHBOARD');
    
    // Refresh data every 5 seconds
    const interval = setInterval(loadData, 5000);
    
    return () => {
      clearInterval(interval);
      // Restore original console.error
      console.error = originalError;
    };
  }, []);

  // Lắng nghe tin nhắn từ background script
  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      console.log('🔍 Dashboard received message:', message.type);
      
      try {
        switch (message.type) {
          case 'TAB_OPENED':
            console.log('📂 TAB_OPENED data:', message.data);
            handleTabOpened(message.data);
            break;
          case 'TAB_UPDATED':
            console.log('🔄 TAB_UPDATED data:', message.data);
            handleTabUpdated(message.data);
            break;
          case 'TAB_CLOSED':
            console.log('❌ TAB_CLOSED data:', message.data);
            handleTabClosed(message.data);
            break;
          case 'API_TRACKED':
            console.log('🎯 API_TRACKED RAW MESSAGE:', JSON.stringify(message, null, 2));
            handleApiTracked(message.data);
            break;
          case 'SCHEDULER_STATUS':
            console.log('⚙️ SCHEDULER_STATUS data:', message.data);
            setIsSchedulerRunning(message.data?.isRunning || false);
            break;
          case 'NEW_LOG_ENTRY':
            console.log('📝 NEW_LOG_ENTRY data:', message.data);
            handleNewLogEntry(message.data);
            break;
          default:
            console.log('❓ Unknown message type:', message.type);
            break;
        }
      } catch (error) {
        console.error('Error handling message in dashboard:', error);
      }
    };

    console.log('Dashboard setting up message listener'); // Debug log
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const loadData = async () => {
    try {
      // Load upcoming schedules
      const schedules = await ScheduleRepository.getUpcoming(10);
      setUpcomingSchedules(schedules);

      // Load stats
      const scheduleStats = await ScheduleRepository.getStats();
      setStats({
        totalSchedules: scheduleStats.total,
        activeSchedules: scheduleStats.active,
        completedToday: 0 // TODO: tính từ history
      });

      // Load stored logs only on first load (don't overwrite real-time logs)
      if (logs.length === 0) {
        await Logger.loadStoredLogs();
        const storedLogs = Logger.getLogs();
        setLogs(storedLogs.slice(-50)); // Last 50 logs
      }

      // Get scheduler status
      try {
        chrome.runtime.sendMessage({ type: 'GET_SCHEDULER_STATUS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Could not get scheduler status:', chrome.runtime.lastError);
            return;
          }
          setIsSchedulerRunning(response?.isRunning || false);
        });
      } catch (error) {
        console.warn('Error getting scheduler status:', error);
      }
      
      // Get active tabs
      try {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TABS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Could not get active tabs:', chrome.runtime.lastError);
            return;
          }
          if (response?.tabs && Array.isArray(response.tabs)) {
            setActiveTabs(response.tabs);
          }
        });
      } catch (error) {
        console.warn('Error getting active tabs:', error);
      }
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Don't show error message to user, just log it
    }
  };

  const handleTabOpened = (data: any) => {
    // Ensure we have valid ID and data
    const tabId = data.tabId?.toString() || `tab-${Date.now()}-${Math.random()}`;
    
    const newTab: ActiveTab = {
      id: tabId,
      linkName: data.linkName || 'Unknown Link',
      url: data.url || '',
      startTime: data.startTime ? new Date(data.startTime) : new Date(),
      status: 'loading',
      requestCount: 0
    };
    
    setActiveTabs(prev => {
      // Remove any existing tab with same ID first
      const filtered = prev.filter(tab => tab.id !== tabId);
      return [...filtered, newTab];
    });
  };

  const handleTabUpdated = (data: any) => {
    setActiveTabs(prev => prev.map(tab => 
      tab.id === data.tabId?.toString()
        ? { ...tab, status: data.status || 'unknown' }
        : tab
    ));
    
    // Log status change for visibility
    if (data.status === 'ready') {
      console.log(`📡 Tab ${data.tabId} is ready for API tracking`);
    }
  };

  const handleTabClosed = (data: any) => {
    setActiveTabs(prev => prev.filter(tab => tab.id !== data.tabId?.toString()));
  };

  const handleApiTracked = (data: any) => {
    console.log('📊 Processing API_TRACKED data:', data);
    
    setActiveTabs(prev => prev.map(tab => 
      tab.id === data.tabId?.toString()
        ? { 
            ...tab, 
            requestCount: (tab.requestCount || 0) + 1, 
            status: 'tracking' 
          }
        : tab
    ));
    
    // Enhanced logging for API tracking with fallbacks for undefined values
    console.log(`🎯 API tracked via ${data.source || 'unknown'}:`, {
      tabId: data.tabId || 'unknown',
      url: data.url || data.trackedData?.url || 'unknown',
      method: data.method || data.trackedData?.method || 'unknown',
      hasModels: data.hasModels || false,
      modelsCount: data.modelsCount || 0,
      source: data.source || 'unknown',
      hasRequestHeaders: data.hasRequestHeaders || false,
      hasResponseHeaders: data.hasResponseHeaders || false,
      hasResponseBody: data.hasResponseBody || false,
      responseStatus: data.responseStatus || data.trackedData?.response?.status || 'unknown'
    });
    
    if (data.hasModels) {
      console.log(`📊 Models data found via ${data.source}: ${data.modelsCount} models`);
    }
    
    if (data.note) {
      console.log(`ℹ️ Note: ${data.note}`);
    }
    
    // Debug data completeness if available
    if (data.dataCompleteness) {
      console.log('📋 Data completeness:', data.dataCompleteness);
    }
  };

  const handleNewLogEntry = (data: any) => {
    try {
      console.log('Dashboard received new log entry:', data); // Debug log
      
      const logEntry = {
        timestamp: new Date(data.timestamp),
        level: data.level,
        message: data.message,
        data: data.data,
        category: data.category
      };
      
      setLogs(prev => {
        const newLogs = [...prev, logEntry];
        // Keep only last 100 logs for performance
        return newLogs.slice(-100);
      });
    } catch (error) {
      console.error('Error handling new log entry:', error);
    }
  };

  const toggleScheduler = () => {
    try {
      const action = isSchedulerRunning ? 'STOP_SCHEDULER' : 'START_SCHEDULER';
      chrome.runtime.sendMessage({ type: action }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error toggling scheduler:', chrome.runtime.lastError);
          return;
        }
        // Status will be updated via message listener
      });
    } catch (error) {
      console.error('Error sending scheduler command:', error);
    }
  };

  const formatTime = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (!dateObj || isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    
    return dateObj.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + '.' + String(dateObj.getMilliseconds()).padStart(3, '0');
  };

  const getTimeUntilNext = (nextRun: Date): string => {
    const now = new Date();
    const diff = nextRun.getTime() - now.getTime();
    
    if (diff <= 0) return 'Quá hạn';
    
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
      return `${minutes}p ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const getStatusColor = (status: string | undefined): string => {
    if (!status) return 'default';
    switch (status.toLowerCase()) {
      case 'loading': return 'blue';
      case 'ready': return 'cyan';
      case 'tracking': return 'green';
      case 'error': return 'red';
      default: return 'default';
    }
  };

  const getLevelColor = (level: LogLevel): string => {
    switch (level) {
      case LogLevel.ERROR: return 'red';
      case LogLevel.WARNING: return 'orange';
      case LogLevel.INFO: return 'blue';
      case LogLevel.DEBUG: return 'gray';
      default: return 'default';
    }
  };

  const filteredLogs = (selectedTabId && selectedTabId !== 'all') 
    ? logs.filter(log => log.category === selectedTabId)
    : logs;

  const activeTabColumns = [
    {
      title: 'Link',
      dataIndex: 'linkName',
      key: 'linkName'
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (record: ActiveTab) => (
        <Tag color={getStatusColor(record.status)}>
          {record.status ? record.status.toUpperCase() : 'UNKNOWN'}
        </Tag>
      )
    },
    {
      title: 'API Tracked',
      dataIndex: 'requestCount',
      key: 'requestCount',
      render: (count: number, record: ActiveTab) => (
        <div>
          <Badge count={count || 0} />
          {count > 0 && (
            <div style={{ fontSize: '10px', color: '#666', marginTop: 2 }}>
              webRequest + script
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Thời gian bắt đầu',
      key: 'startTime',
      render: (record: ActiveTab) => {
        if (!record.startTime) return 'N/A';
        return formatTime(record.startTime);
      }
    },
    {
      title: 'Thời gian chạy',
      key: 'duration',
      render: (record: ActiveTab) => {
        if (!record.startTime) return 'N/A';
        try {
          const startTime = typeof record.startTime === 'string' ? new Date(record.startTime) : record.startTime;
          if (isNaN(startTime.getTime())) return 'N/A';
          
          const diff = currentTime.getTime() - startTime.getTime();
          const seconds = Math.floor(diff / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          
          if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
          } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
          }
          return `${seconds}s`;
        } catch (error) {
          console.error('Error calculating duration:', error);
          return 'N/A';
        }
      }
    }
  ];

  const upcomingColumns = [
    {
      title: 'Tên lịch',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'Loại',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag>{type?.toUpperCase() || 'UNKNOWN'}</Tag>
    },
    {
      title: 'Thời gian chạy tiếp theo',
      key: 'nextRun',
      render: (record: Schedule) => {
        try {
          return formatTime(record.nextRun);
        } catch (error) {
          return 'Invalid Date';
        }
      }
    },
    {
      title: 'Còn lại',
      key: 'timeUntil',
      render: (record: Schedule) => {
        try {
          return (
            <Text strong>{getTimeUntilNext(new Date(record.nextRun))}</Text>
          );
        } catch (error) {
          return <Text type="secondary">N/A</Text>;
        }
      }
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header với thời gian và điều khiển */}
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card>
            <Space direction="vertical" size="small">
              <Title level={3} style={{ margin: 0 }}>
                {formatTime(currentTime)}
              </Title>
              <Text type="secondary">Thời gian thực (với mili giây)</Text>
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <Space>
              <Button 
                type={isSchedulerRunning ? "default" : "primary"}
                icon={isSchedulerRunning ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={toggleScheduler}
              >
                {isSchedulerRunning ? 'Dừng Scheduler' : 'Chạy Scheduler'}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadData}>
                Làm mới
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Thống kê */}
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
                {stats.totalSchedules}
              </Title>
              <Text>Tổng số lịch</Text>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ margin: 0, color: '#52c41a' }}>
                {stats.activeSchedules}
              </Title>
              <Text>Lịch đang hoạt động</Text>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ margin: 0, color: '#722ed1' }}>
                {activeTabs.length}
              </Title>
              <Text>Tab đang mở</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Tabs đang hoạt động */}
      <Card title="Tabs đang hoạt động" style={{ marginBottom: 24 }}>
        <Table
          columns={activeTabColumns}
          dataSource={activeTabs.filter(tab => tab.id)} // Filter out tabs without ID
          rowKey={(record) => `active-tab-${record.id}`}
          size="small"
          pagination={false}
        />
      </Card>

      {/* Lịch sắp tới */}
      <Card title="Lịch sắp tới" style={{ marginBottom: 24 }}>
        <Table
          columns={upcomingColumns}
          dataSource={upcomingSchedules.filter(schedule => schedule.id)} // Filter out schedules without ID
          rowKey={(record) => `upcoming-schedule-${record.id}`}
          size="small"
          pagination={false}
        />
      </Card>

      {/* Logs */}
      <Card 
        title="Logs theo thời gian thực"
        extra={
          <Select 
            value={selectedTabId} 
            onChange={(value) => setSelectedTabId(value || 'all')} // Ensure value is never null
            style={{ width: 200 }}
          >
            <Option value="all">Tất cả logs</Option>
            {activeTabs
              .filter(tab => tab.id && tab.linkName) // Filter out tabs with null/undefined values
              .map(tab => (
                <Option key={tab.id} value={tab.id}>
                  {tab.linkName}
                </Option>
              ))}
          </Select>
        }
      >
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {filteredLogs.map((log, index) => {
            // Create unique key from timestamp, level, message and index as fallback
            const uniqueKey = `log-${log.timestamp.getTime()}-${log.level}-${index}`;
            
            return (
              <div key={uniqueKey} style={{ 
                padding: '4px 0', 
                borderBottom: '1px solid #f0f0f0',
                fontSize: '12px',
                fontFamily: 'monospace'
              }}>
                <Space size="small">
                  <Text type="secondary">
                    {formatTime(log.timestamp)}
                  </Text>
                  <Tag color={getLevelColor(log.level)}>
                    {log.level.toUpperCase()}
                  </Tag>
                  {log.category && (
                    <Tag>{log.category}</Tag>
                  )}
                  <span>{log.message}</span>
                </Space>
                {log.data && (
                  <div style={{ marginLeft: 16, color: '#666' }}>
                    {JSON.stringify(log.data, null, 2)}
                  </div>
                )}
              </div>
            );
          })}
          {filteredLogs.length === 0 && (
            <Text type="secondary">Chưa có logs</Text>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;