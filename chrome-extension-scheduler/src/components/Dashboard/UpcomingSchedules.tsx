// ===== ENHANCED: src/components/Dashboard/UpcomingSchedules.tsx =====
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  List, 
  Tag, 
  Typography, 
  Empty, 
  Button, 
  Space, 
  Tooltip, 
  Badge, 
  Modal, 
  message,
  Dropdown,
  Switch,
  Divider
} from 'antd';
import { 
  ClockCircleOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  MoreOutlined,
  ThunderboltOutlined,
  StopOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { ScheduleRepository, LinkRepository } from '../../storage/repositories';
import { Schedule, Link } from '../../types';

const { Text } = Typography;

interface UpcomingExecution {
  schedule: Schedule;
  link: Link;
  timeUntil: number;
  isOverdue: boolean;
  isProcessing: boolean;
  hasBackgroundTabs: boolean;
}

interface ProcessingInfo {
  currentScheduleId?: string;
  backgroundTabs: Array<{ scheduleId: string; tabId: number }>;
}

const UpcomingSchedules: React.FC = () => {
  const [upcomingExecutions, setUpcomingExecutions] = useState<UpcomingExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingInfo, setProcessingInfo] = useState<ProcessingInfo>({ backgroundTabs: [] });
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [showAllSchedules, setShowAllSchedules] = useState(false);

  const loadUpcomingSchedules = async () => {
    try {
      setLoading(true);
      
      // Get schedules based on filter
      const schedules = showAllSchedules 
        ? await ScheduleRepository.getActiveSchedules()
        : await ScheduleRepository.getUpcoming(20);
      
      const now = Date.now();
      const executionsWithLinks = await Promise.all(
        schedules.map(async (schedule) => {
          const link = await LinkRepository.getById(schedule.linkId);
          const timeUntil = schedule.nextRun.getTime() - now;
          const isOverdue = timeUntil < 0;
          
          return {
            schedule,
            link: link!,
            timeUntil,
            isOverdue,
            isProcessing: processingInfo.currentScheduleId === schedule.id,
            hasBackgroundTabs: processingInfo.backgroundTabs.some(tab => tab.scheduleId === schedule.id)
          };
        })
      );
      
      let filtered = executionsWithLinks.filter(e => e.link);
      
      // Apply overdue filter
      if (showOverdueOnly) {
        filtered = filtered.filter(e => e.isOverdue);
      }
      
      // Sort: overdue first, then by time until execution
      filtered.sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return Math.abs(a.timeUntil) - Math.abs(b.timeUntil);
      });
      
      setUpcomingExecutions(filtered);
    } catch (error) {
      console.error('Error loading upcoming schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProcessingInfo = async () => {
    try {
      // Get current processing state
      const processingState = await chrome.runtime.sendMessage({ type: 'GET_PROCESSING_STATE' });
      
      // Get background tabs
      const tabsResult = await chrome.runtime.sendMessage({ type: 'GET_BACKGROUND_TABS' });
      
      setProcessingInfo({
        currentScheduleId: processingState?.currentScheduleId,
        backgroundTabs: tabsResult?.tabs || []
      });
    } catch (error) {
      console.error('Error loading processing info:', error);
    }
  };

  useEffect(() => {
    loadUpcomingSchedules();
    loadProcessingInfo();
    
    // Refresh every 10 seconds
    const interval = setInterval(() => {
      loadUpcomingSchedules();
      loadProcessingInfo();
    }, 10000);
    
    // Listen for processing updates
    const messageListener = (message: any) => {
      if (message.type === 'PROCESSING_STATE_UPDATE') {
        loadProcessingInfo();
        loadUpcomingSchedules(); // Refresh to update processing status
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [showOverdueOnly, showAllSchedules]);

  // Actions
  const executeScheduleNow = async (scheduleId: string, scheduleName: string) => {
    Modal.confirm({
      title: 'Execute Schedule Now?',
      content: `Execute "${scheduleName}" immediately?`,
      icon: <PlayCircleOutlined />,
      onOk: async () => {
        try {
          await chrome.runtime.sendMessage({ 
            type: 'FORCE_EXECUTE_SCHEDULE',
            scheduleId 
          });
          message.success(`Schedule "${scheduleName}" execution started`);
          loadProcessingInfo();
        } catch (error) {
          message.error('Failed to execute schedule');
        }
      }
    });
  };

  const checkScheduleStatus = async (scheduleId: string) => {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'CHECK_SCHEDULE_NOW',
        scheduleId
      });
      
      Modal.info({
        title: 'Schedule Status',
        content: (
          <div>
            <p><strong>Schedule ID:</strong> {scheduleId}</p>
            <p><strong>Is Due:</strong> {result.isDue ? 'Yes' : 'No'}</p>
            {result.error && <p><strong>Error:</strong> {result.error}</p>}
          </div>
        )
      });
    } catch (error) {
      message.error('Failed to check schedule status');
    }
  };

  const inspectScheduleTabs = async (scheduleId: string) => {
    const scheduleTabs = processingInfo.backgroundTabs.filter(tab => tab.scheduleId === scheduleId);
    
    if (scheduleTabs.length === 0) {
      message.info('No background tabs for this schedule');
      return;
    }
    
    try {
      // Focus the first tab
      await chrome.tabs.update(scheduleTabs[0].tabId, { active: true });
      message.success(`Switched to tab ${scheduleTabs[0].tabId}`);
    } catch (error) {
      message.error('Failed to switch to tab');
    }
  };

  const toggleSchedule = async (schedule: Schedule) => {
    try {
      await ScheduleRepository.update(schedule.id, { enabled: !schedule.enabled });
      message.success(`Schedule ${schedule.enabled ? 'disabled' : 'enabled'}`);
      loadUpcomingSchedules();
    } catch (error) {
      message.error('Failed to toggle schedule');
    }
  };

  const formatTimeUntil = (milliseconds: number, isOverdue: boolean): string => {
    const absMs = Math.abs(milliseconds);
    const seconds = Math.floor(absMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let timeStr = '';
    if (days > 0) timeStr = `${days}d ${hours % 24}h`;
    else if (hours > 0) timeStr = `${hours}h ${minutes % 60}m`;
    else if (minutes > 0) timeStr = `${minutes}m ${seconds % 60}s`;
    else timeStr = `${seconds}s`;

    return isOverdue ? `${timeStr} ago` : timeStr;
  };

  const getScheduleTypeColor = (type: string): string => {
    switch (type) {
      case 'cron': return 'blue';
      case 'interval': return 'green';
      case 'once': return 'orange';
      default: return 'default';
    }
  };

  const getActionMenuItems = (execution: UpcomingExecution) => [
    {
      key: 'execute',
      label: 'Execute Now',
      icon: <PlayCircleOutlined />,
      onClick: () => executeScheduleNow(execution.schedule.id, execution.schedule.name)
    },
    {
      key: 'check',
      label: 'Check Status',
      icon: <CheckCircleOutlined />,
      onClick: () => checkScheduleStatus(execution.schedule.id)
    },
    ...(execution.hasBackgroundTabs ? [{
      key: 'inspect',
      label: 'Inspect Tabs',
      icon: <EyeOutlined />,
      onClick: () => inspectScheduleTabs(execution.schedule.id)
    }] : []),
    {
      key: 'toggle',
      label: execution.schedule.enabled ? 'Disable' : 'Enable',
      icon: execution.schedule.enabled ? <StopOutlined /> : <PlayCircleOutlined />,
      onClick: () => toggleSchedule(execution.schedule)
    }
  ];

  const overdueCount = upcomingExecutions.filter(e => e.isOverdue).length;
  const processingCount = upcomingExecutions.filter(e => e.isProcessing).length;
  const tabsCount = upcomingExecutions.filter(e => e.hasBackgroundTabs).length;

  return (
    <Card 
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Upcoming Executions</span>
            {overdueCount > 0 && (
              <Badge count={overdueCount} style={{ backgroundColor: '#ff4d4f' }} />
            )}
            {processingCount > 0 && (
              <Badge count={processingCount} style={{ backgroundColor: '#faad14' }} />
            )}
          </div>
          <Space size="small">
            <Tooltip title="Show overdue only">
              <Switch 
                size="small"
                checked={showOverdueOnly}
                onChange={setShowOverdueOnly}
                checkedChildren={<ExclamationCircleOutlined />}
                unCheckedChildren={<ClockCircleOutlined />}
              />
            </Tooltip>
            <Tooltip title="Show all schedules">
              <Switch 
                size="small"
                checked={showAllSchedules}
                onChange={setShowAllSchedules}
                checkedChildren="All"
                unCheckedChildren="24h"
              />
            </Tooltip>
          </Space>
        </div>
      }
      loading={loading}
      extra={
        <Space>
          <Button 
            size="small" 
            icon={<ReloadOutlined />}
            onClick={() => {
              loadUpcomingSchedules();
              loadProcessingInfo();
            }}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      {upcomingExecutions.length === 0 ? (
        <Empty 
          description={showOverdueOnly ? "No overdue executions" : "No upcoming executions"}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <>
          {/* Summary Stats */}
          {(overdueCount > 0 || processingCount > 0 || tabsCount > 0) && (
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <div className="flex gap-4 text-xs">
                {overdueCount > 0 && (
                  <div className="flex items-center gap-1">
                    <ExclamationCircleOutlined className="text-red-500" />
                    <span>{overdueCount} overdue</span>
                  </div>
                )}
                {processingCount > 0 && (
                  <div className="flex items-center gap-1">
                    <ThunderboltOutlined className="text-orange-500" />
                    <span>{processingCount} processing</span>
                  </div>
                )}
                {tabsCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span>📱</span>
                    <span>{tabsCount} with tabs</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <List
            size="small"
            dataSource={upcomingExecutions}
            renderItem={(item) => (
              <List.Item 
                className={`
                  ${item.isOverdue ? 'bg-red-50 border-l-4 border-red-400' : ''}
                  ${item.isProcessing ? 'bg-orange-50 border-l-4 border-orange-400' : ''}
                  p-3 rounded transition-colors hover:bg-gray-50
                `}
              >
                <div className="w-full">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Text strong className="text-sm">{item.link.name}</Text>
                        
                        {/* Status Indicators */}
                        <Space size="small">
                          {item.isProcessing && (
                            <Tooltip title="Currently processing">
                              <ThunderboltOutlined className="text-orange-500 animate-pulse" />
                            </Tooltip>
                          )}
                          
                          {item.hasBackgroundTabs && (
                            <Tooltip title="Has background tabs">
                              <Badge count="T" size="small" style={{ backgroundColor: '#52c41a' }} />
                            </Tooltip>
                          )}
                          
                          {!item.schedule.enabled && (
                            <Tag color="red" >Disabled</Tag>
                          )}
                        </Space>
                      </div>
                      
                      <Text type="secondary" className="text-xs block">
                        {item.schedule.name}
                      </Text>
                      
                      <div className="text-xs text-gray-400 mt-1">
                        Quantity: {item.schedule.quantity || 1}
                      </div>
                    </div>
                    
                    <div className="text-right flex flex-col items-end gap-2">
                      {/* Schedule Type & Time */}
                      <div className="flex items-center gap-1">
                        <Tag color={getScheduleTypeColor(item.schedule.type)} >
                          {item.schedule.type}
                        </Tag>
                        
                        <div className={`text-xs flex items-center gap-1 ${
                          item.isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'
                        }`}>
                          <ClockCircleOutlined />
                          {formatTimeUntil(item.timeUntil, item.isOverdue)}
                        </div>
                      </div>
                      
                      {/* Quick Actions */}
                      <Space size="small">
                        {/* Quick Execute Button */}
                        <Tooltip title="Execute now">
                          <Button 
                            type="primary" 
                            size="small"
                            icon={<PlayCircleOutlined />}
                            onClick={() => executeScheduleNow(item.schedule.id, item.schedule.name)}
                            disabled={item.isProcessing}
                          />
                        </Tooltip>
                        
                        {/* Inspect Tabs Button */}
                        {item.hasBackgroundTabs && (
                          <Tooltip title="Inspect background tabs">
                            <Button 
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => inspectScheduleTabs(item.schedule.id)}
                            />
                          </Tooltip>
                        )}
                        
                        {/* More Actions Menu */}
                        <Dropdown
                          menu={{ items: getActionMenuItems(item) }}
                          trigger={['click']}
                          placement="bottomRight"
                        >
                          <Button size="small" icon={<MoreOutlined />} />
                        </Dropdown>
                      </Space>
                    </div>
                  </div>
                </div>
              </List.Item>
            )}
          />
          
          {/* Footer Summary */}
          <Divider style={{ margin: '12px 0' }} />
          <div className="text-xs text-gray-500 text-center">
            Showing {upcomingExecutions.length} schedules
            {showAllSchedules ? ' (all active)' : ' (next 24 hours)'}
            {showOverdueOnly && ' (overdue only)'}
          </div>
        </>
      )}
    </Card>
  );
};

export default UpcomingSchedules;