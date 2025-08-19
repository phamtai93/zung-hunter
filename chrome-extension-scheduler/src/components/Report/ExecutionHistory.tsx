// src/components/Report/ExecutionHistory.tsx
import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Typography, Tooltip } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  ClockCircleOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { ExecutionHistory, Link, Schedule } from '../../types';
import { HistoryRepository, LinkRepository, ScheduleRepository } from '../../storage/repositories';

const { Text } = Typography;

interface ExecutionHistoryProps {
  onViewDetails: (history: ExecutionHistory) => void;
}

const ExecutionHistoryTable: React.FC<ExecutionHistoryProps> = ({ onViewDetails }) => {
  const [history, setHistory] = useState<ExecutionHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [linksMap, setLinksMap] = useState<Record<string, Link>>({});
  const [schedulesMap, setSchedulesMap] = useState<Record<string, Schedule>>({});

  const loadHistory = async () => {
    setLoading(true);
    try {
      const historyData = await HistoryRepository.getAll(200);
      setHistory(historyData);

      // Load links and schedules for mapping
      const links = await LinkRepository.getAll();
      const linksById = links.reduce((acc, link) => {
        acc[link.id] = link;
        return acc;
      }, {} as Record<string, Link>);
      setLinksMap(linksById);

      // Load schedules for all unique schedule IDs
      const uniqueScheduleIds = [...new Set(historyData.map(h => h.scheduleId))];
      const schedules: Record<string, Schedule> = {};
      
      for (const scheduleId of uniqueScheduleIds) {
        try {
          // We need to get schedule by iterating through links since we don't have getById
          for (const link of links) {
            const linkSchedules = await ScheduleRepository.getByLinkId(link.id);
            const schedule = linkSchedules.find(s => s.id === scheduleId);
            if (schedule) {
              schedules[scheduleId] = schedule;
              break;
            }
          }
        } catch (error) {
          console.warn(`Schedule ${scheduleId} not found:`, error);
        }
      }
      setSchedulesMap(schedules);
      
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const formatDuration = (startTime: Date, endTime?: Date): string => {
    if (!endTime) return 'Running...';
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const columns = [
    {
      title: 'Status',
      key: 'status',
      width: 80,
      align: 'center' as const,
      render: (record: ExecutionHistory) => {
        if (!record.endTime) {
          return (
            <Tooltip title="Running">
              <ClockCircleOutlined className="text-blue-500" />
            </Tooltip>
          );
        }
        
        return record.success ? (
          <Tooltip title="Success">
            <CheckCircleOutlined className="text-green-500" />
          </Tooltip>
        ) : (
          <Tooltip title="Failed">
            <CloseCircleOutlined className="text-red-500" />
          </Tooltip>
        );
      },
    },
    {
      title: 'Link',
      key: 'link',
      render: (record: ExecutionHistory) => {
        const link = linksMap[record.linkId];
        return link ? (
          <div>
            <Text strong>{link.name}</Text>
            <div className="text-xs text-gray-500 truncate max-w-xs">
              {link.url}
            </div>
          </div>
        ) : (
          <Text type="secondary">Unknown Link</Text>
        );
      },
    },
    {
      title: 'Schedule',
      key: 'schedule',
      render: (record: ExecutionHistory) => {
        const schedule = schedulesMap[record.scheduleId];
        return schedule ? (
          <div>
            <Text>{schedule.name}</Text>
            <div>
              <Tag color="blue">
                {schedule.type}
              </Tag>
            </div>
          </div>
        ) : (
          <Text type="secondary">Unknown Schedule</Text>
        );
      },
    },
    {
      title: 'Start Time',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 150,
      render: (date: Date) => (
        <div className="text-xs">
          <div>{new Date(date).toLocaleDateString()}</div>
          <div className="text-gray-500">
            {new Date(date).toLocaleTimeString()}
          </div>
        </div>
      ),
    },
    {
      title: 'Duration',
      key: 'duration',
      width: 100,
      render: (record: ExecutionHistory) => (
        <Text className="text-xs">
          {formatDuration(record.startTime, record.endTime)}
        </Text>
      ),
    },
    {
      title: 'Result',
      key: 'result',
      width: 120,
      render: (record: ExecutionHistory) => {
        if (!record.endTime) {
          return <Tag color="processing">Running</Tag>;
        }
        
        if (record.success) {
          return <Tag color="success">Success</Tag>;
        }
        
        return (
          <Tooltip title={record.errorMessage}>
            <Tag color="error">Failed</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (record: ExecutionHistory) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => onViewDetails(record)}
          title="View Details"
        />
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={history}
      rowKey="id"
      loading={loading}
      size="small"
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        showTotal: (total, range) => 
          `${range[0]}-${range[1]} of ${total} executions`,
      }}
      locale={{
        emptyText: 'No execution history available'
      }}
    />
  );
};

export default ExecutionHistoryTable;