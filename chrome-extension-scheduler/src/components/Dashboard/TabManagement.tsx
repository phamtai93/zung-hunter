// ===== FIXED: src/components/Dashboard/TabManagement.tsx =====
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Badge, 
  Space, 
  Modal, 
  message, 
  Tooltip, 
  Tag,
  Typography,
  Collapse,
} from 'antd';
import { 
  DeleteOutlined, 
  EyeOutlined, 
  ReloadOutlined,
  InfoCircleOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { Panel } = Collapse;

interface BackgroundTab {
  scheduleId: string;
  tabId: number;
}

interface TabManagementProps {
  backgroundTabs: BackgroundTab[];
  onTabsChange: () => void;
  debugMode?: boolean;
}

interface TabInfo {
  id: number;
  url?: string;
  title?: string;
  status?: string;
  scheduleId?: string;
}

const TabManagement: React.FC<TabManagementProps> = ({ 
  backgroundTabs, 
  onTabsChange, 
  debugMode = false 
}) => {
  const [tabDetails, setTabDetails] = useState<Map<number, TabInfo>>(new Map());
  const [loading, setLoading] = useState(false);
  const [trackedDataStats, setTrackedDataStats] = useState<Record<string, any>>({});

  // Load detailed tab information
  const loadTabDetails = async () => {
    if (backgroundTabs.length === 0) return;
    
    setLoading(true);
    try {
      const tabDetailsMap = new Map<number, TabInfo>();
      
      for (const bgTab of backgroundTabs) {
        try {
          const tab = await chrome.tabs.get(bgTab.tabId);
          tabDetailsMap.set(bgTab.tabId, {
            id: bgTab.tabId,
            url: tab.url,
            title: tab.title,
            status: tab.status,
            scheduleId: bgTab.scheduleId
          });
        } catch (error) {
          // Tab might have been closed
          tabDetailsMap.set(bgTab.tabId, {
            id: bgTab.tabId,
            url: 'Tab closed or invalid',
            title: 'Invalid Tab',
            status: 'invalid',
            scheduleId: bgTab.scheduleId
          });
        }
      }
      
      setTabDetails(tabDetailsMap);
    } catch (error) {
      console.error('Failed to load tab details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load tracked data statistics
  const loadTrackedDataStats = async () => {
    try {
      const data = await chrome.storage.local.get(['trackedRequests', 'trackedResponses']);
      const requests = data.trackedRequests || [];
      const responses = data.trackedResponses || [];
      
      // Group by schedule ID
      const requestsBySchedule = requests.reduce((acc: any, req: any) => {
        acc[req.scheduleId] = (acc[req.scheduleId] || 0) + 1;
        return acc;
      }, {});
      
      const responsesBySchedule = responses.reduce((acc: any, res: any) => {
        acc[res.scheduleId] = (acc[res.scheduleId] || 0) + 1;
        return acc;
      }, {});

      setTrackedDataStats({ 
        total: { requests: requests.length, responses: responses.length },
        bySchedule: { requests: requestsBySchedule, responses: responsesBySchedule }
      });
    } catch (error) {
      console.error('Failed to load tracked data stats:', error);
    }
  };

  useEffect(() => {
    loadTabDetails();
    loadTrackedDataStats();
  }, [backgroundTabs]);

  // Actions
  const closeTab = async (tabId: number, scheduleId: string) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'CLOSE_SCHEDULE_TABS',
        scheduleId
      });
      message.success(`Closed tab ${tabId}`);
      onTabsChange();
    } catch (error) {
      message.error('Failed to close tab');
    }
  };

  const focusTab = async (tabId: number) => {
    try {
      await chrome.tabs.update(tabId, { active: true });
      message.success('Switched to tab');
    } catch (error) {
      message.error('Failed to switch to tab - tab may be closed');
    }
  };

  const closeAllTabs = async () => {
    Modal.confirm({
      title: 'Close All Background Tabs?',
      content: `This will close ${backgroundTabs.length} background tabs.`,
      icon: <DeleteOutlined />,
      okType: 'danger',
      onOk: async () => {
        try {
          await chrome.runtime.sendMessage({ type: 'CLOSE_ALL_BACKGROUND_TABS' });
          message.success('All tabs closed');
          onTabsChange();
        } catch (error) {
          message.error('Failed to close all tabs');
        }
      }
    });
  };

  const inspectTrackedData = async (scheduleId: string) => {
    try {
      const data = await chrome.storage.local.get(['trackedRequests', 'trackedResponses']);
      const requests = (data.trackedRequests || []).filter((req: any) => req.scheduleId === scheduleId);
      const responses = (data.trackedResponses || []).filter((res: any) => res.scheduleId === scheduleId);
      
      console.log(`📊 Tracked data for schedule ${scheduleId}:`, { requests, responses });
      
      Modal.info({
        title: `Tracked Data - ${scheduleId}`,
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
      message.error('Failed to inspect tracked data');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Tab',
      key: 'tab',
      render: (_: any, record: BackgroundTab) => {
        const detail = tabDetails.get(record.tabId);
        return (
          <div>
            <div className="flex items-center gap-2">
              <Badge 
                count={record.tabId} 
                style={{ backgroundColor: detail?.status === 'complete' ? '#52c41a' : '#1890ff' }} 
              />
              <Tag color={detail?.status === 'complete' ? 'green' : 'blue'}>
                {detail?.status || 'unknown'}
              </Tag>
            </div>
          </div>
        );
      }
    },
    {
      title: 'URL',
      key: 'url',
      render: (_: any, record: BackgroundTab) => {
        const detail = tabDetails.get(record.tabId);
        return (
          <div>
            <Tooltip title={detail?.url}>
              <Text className="text-xs font-mono">
                {detail?.url ? 
                  (detail.url.length > 50 ? detail.url.substring(0, 50) + '...' : detail.url) : 
                  'Loading...'
                }
              </Text>
            </Tooltip>
            {detail?.title && (
              <div className="text-xs text-gray-500 mt-1">
                {detail.title.length > 60 ? detail.title.substring(0, 60) + '...' : detail.title}
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Schedule',
      key: 'schedule',
      render: (_: any, record: BackgroundTab) => {
        const requestCount = trackedDataStats.bySchedule?.requests?.[record.scheduleId] || 0;
        const responseCount = trackedDataStats.bySchedule?.responses?.[record.scheduleId] || 0;
        
        return (
          <div>
            <div className="text-xs font-mono mb-1">
              {record.scheduleId.substring(0, 8)}...
            </div>
            {debugMode && (
              <Space size="small">
                <Badge count={requestCount} size="small" style={{ backgroundColor: '#1890ff' }} title="Requests" />
                <Badge count={responseCount} size="small" style={{ backgroundColor: '#52c41a' }} title="Responses" />
              </Space>
            )}
          </div>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: BackgroundTab) => (
        <Space size="small">
          <Tooltip title="Focus tab">
            <Button
              type="primary"
              icon={<EyeOutlined />}
              size="small"
              onClick={() => focusTab(record.tabId)}
            />
          </Tooltip>
          
          {debugMode && (
            <Tooltip title="Inspect tracked data">
              <Button
                icon={<DatabaseOutlined />}
                size="small"
                onClick={() => inspectTrackedData(record.scheduleId)}
              />
            </Tooltip>
          )}
          
          <Tooltip title="Close tab">
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => closeTab(record.tabId, record.scheduleId)}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  if (backgroundTabs.length === 0 && !debugMode) {
    return null;
  }

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppstoreOutlined />
            <span>Background Tabs Management</span>
            <Badge count={backgroundTabs.length} style={{ backgroundColor: '#52c41a' }} />
          </div>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                loadTabDetails();
                loadTrackedDataStats();
                onTabsChange();
              }}
              loading={loading}
              size="small"
            >
              Refresh
            </Button>
            <Button
              danger
              onClick={closeAllTabs}
              disabled={backgroundTabs.length === 0}
              size="small"
            >
              Close All
            </Button>
          </Space>
        </div>
      }
    >
      {backgroundTabs.length === 0 ? (
        <div className="text-center py-8">
          <AppstoreOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
          <div className="text-gray-500">No background tabs currently open</div>
          <div className="text-xs text-gray-400 mt-2">
            Background tabs will appear here when schedules are executed
          </div>
        </div>
      ) : (
        <>
          <Table
            columns={columns}
            dataSource={backgroundTabs}
            rowKey="tabId"
            pagination={false}
            loading={loading}
            size="small"
            scroll={{ x: true }}
          />

          {debugMode && (
            <Collapse size="small" style={{ marginTop: '16px' }}>
              <Panel header="Debug Information" key="debug">
                <div className="space-y-4">
                  {/* Tracked Data Summary */}
                  <div>
                    <Text strong>Tracked Data Summary</Text>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="p-3 bg-blue-50 rounded">
                        <div className="flex items-center gap-2">
                          <DatabaseOutlined className="text-blue-600" />
                          <div>
                            <div className="font-semibold">{trackedDataStats.total?.requests || 0}</div>
                            <div className="text-xs text-gray-500">Total Requests</div>
                          </div>
                        </div>
                      </div>
                      <div className="p-3 bg-green-50 rounded">
                        <div className="flex items-center gap-2">
                          <DatabaseOutlined className="text-green-600" />
                          <div>
                            <div className="font-semibold">{trackedDataStats.total?.responses || 0}</div>
                            <div className="text-xs text-gray-500">Total Responses</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div>
                    <Text strong>Quick Actions</Text>
                    <div className="flex gap-2 mt-2">
                      <Button 
                        size="small"
                        onClick={() => {
                          chrome.storage.local.get(['trackedRequests', 'trackedResponses'])
                            .then(data => console.log('📊 All tracked data:', data));
                        }}
                      >
                        Log All Data
                      </Button>
                      <Button 
                        size="small"
                        onClick={() => {
                          chrome.storage.local.set({ trackedRequests: [], trackedResponses: [] })
                            .then(() => {
                              message.success('Tracked data cleared');
                              loadTrackedDataStats();
                            });
                        }}
                      >
                        Clear Tracked Data
                      </Button>
                    </div>
                  </div>
                </div>
              </Panel>
            </Collapse>
          )}
        </>
      )}

      {/* Help Section */}
      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f6f6f6', borderRadius: '4px' }}>
        <div className="flex items-start gap-2">
          <InfoCircleOutlined className="text-blue-500 mt-1" />
          <div className="text-xs">
            <div className="font-semibold mb-1">💡 Tab Management Tips:</div>
            <ul className="margin-0 padding-left-4 space-y-1">
              <li><strong>Focus:</strong> Click the eye icon to switch to a background tab for inspection</li>
              <li><strong>Manual Close:</strong> Tabs remain open until manually closed - inspect network activity in DevTools</li>
              <li><strong>Tracked Data:</strong> Request/response data is automatically captured and stored</li>
              <li><strong>Debug Mode:</strong> Enable for detailed tracking information and advanced controls</li>
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TabManagement;