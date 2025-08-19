import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Space, Tag, Popconfirm, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ClockCircleOutlined, NumberOutlined } from '@ant-design/icons';
import { Schedule, Link } from '../../types';
import { ScheduleRepository } from '../../storage/repositories';
import ScheduleForm from './ScheduleForm';

const { Text } = Typography;

interface ScheduleManagerProps {
  open: boolean;
  onCancel: () => void;
  link: Link;
}

const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  open,
  onCancel,
  link
}) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const loadSchedules = async () => {
    if (!open || !link) return;
    
    setLoading(true);
    try {
      const linkSchedules = await ScheduleRepository.getByLinkId(link.id);
      setSchedules(linkSchedules);
    } catch (error) {
      message.error('Failed to load schedules');
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, [open, link]);

  const handleDelete = async (scheduleId: string) => {
    try {
      await ScheduleRepository.delete(scheduleId);
      message.success('Schedule deleted successfully');
      loadSchedules();
    } catch (error) {
      message.error('Failed to delete schedule');
      console.error('Error deleting schedule:', error);
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setScheduleFormOpen(true);
  };

  const handleAddNew = () => {
    setEditingSchedule(null);
    setScheduleFormOpen(true);
  };

  const handleFormSuccess = () => {
    loadSchedules();
  };

  const getScheduleTypeColor = (type: string): string => {
    switch (type) {
      case 'cron': return 'blue';
      case 'interval': return 'green';
      case 'once': return 'orange';
      default: return 'default';
    }
  };

  const formatScheduleConfig = (schedule: Schedule): string => {
    switch (schedule.type) {
      case 'cron':
        return schedule.cronExpression || '';
      case 'interval':
        return `Every ${schedule.intervalMinutes} minutes`;
      case 'once':
        return schedule.oneTimeDate?.toLocaleString() || '';
      default:
        return 'Unknown';
    }
  };

  const formatNextRun = (date: Date): string => {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Due now';
    
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Schedule) => (
        <div>
          <Text strong>{text}</Text>
          {!record.enabled && (
            <Tag color="red" className="ml-2">Disabled</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={getScheduleTypeColor(type)}>
          {type.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center' as const,
      render: (quantity: number) => (
        <Tag icon={<NumberOutlined />} color="purple">
          {quantity || 1}
        </Tag>
      ),
    },
    {
      title: 'Configuration',
      key: 'config',
      render: (record: Schedule) => (
        <Text code className="text-xs">
          {formatScheduleConfig(record)}
        </Text>
      ),
    },
    {
      title: 'Next Run',
      dataIndex: 'nextRun',
      key: 'nextRun',
      width: 120,
      render: (date: Date, record: Schedule) => (
        <div className="text-xs">
          <div>{new Date(date).toLocaleString()}</div>
          {record.enabled && (
            <Text type="secondary">
              <ClockCircleOutlined className="mr-1" />
              {formatNextRun(new Date(date))}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (record: Schedule) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Delete Schedule"
            description="Are you sure you want to delete this schedule?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <div>
            <div>Manage Schedules</div>
            <Text type="secondary" className="text-sm font-normal">
              {link?.name} ({link?.url})
            </Text>
          </div>
        }
        open={open}
        onCancel={onCancel}
        footer={null}
        width={900} // Increased width for quantity column
        destroyOnClose
      >
        <div className="mb-4 flex justify-between items-center">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddNew}
          >
            Add Schedule
          </Button>
          
          <div className="text-sm text-gray-500">
            Total: {schedules.length} schedules
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={schedules}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          locale={{
            emptyText: 'No schedules configured'
          }}
        />
      </Modal>

      <ScheduleForm
        open={scheduleFormOpen}
        onCancel={() => setScheduleFormOpen(false)}
        onSuccess={handleFormSuccess}
        linkId={link?.id || ''}
        editingSchedule={editingSchedule}
      />
    </>
  );
};

export default ScheduleManager;