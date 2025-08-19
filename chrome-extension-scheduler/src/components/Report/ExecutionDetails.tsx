
// src/components/Report/ExecutionDetails.tsx
import React from 'react';
import { Modal, Descriptions, Tag, Typography, Timeline, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { ExecutionHistory } from '../../types';

const { Text } = Typography;

interface ExecutionDetailsProps {
  open: boolean;
  onClose: () => void;
  execution: ExecutionHistory | null;
  linkName?: string;
  scheduleName?: string;
}

const ExecutionDetails: React.FC<ExecutionDetailsProps> = ({
  open,
  onClose,
  execution,
  linkName,
  scheduleName
}) => {
  if (!execution) return null;

  const formatDuration = (): string => {
    if (!execution.endTime) return 'Still running...';
    const duration = new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getStatusIcon = () => {
    if (!execution.endTime) return <ClockCircleOutlined className="text-blue-500" />;
    return execution.success ? 
      <CheckCircleOutlined className="text-green-500" /> : 
      <CloseCircleOutlined className="text-red-500" />;
  };

  const getStatusTag = () => {
    if (!execution.endTime) return <Tag color="processing">Running</Tag>;
    return execution.success ? 
      <Tag color="success">Success</Tag> : 
      <Tag color="error">Failed</Tag>;
  };

  return (
    <Modal
      title="Execution Details"
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <div className="space-y-4">
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="Status" span={2}>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              {getStatusTag()}
            </div>
          </Descriptions.Item>
          
          <Descriptions.Item label="Link">
            {linkName || 'Unknown'}
          </Descriptions.Item>
          
          <Descriptions.Item label="Schedule">
            {scheduleName || 'Unknown'}
          </Descriptions.Item>
          
          <Descriptions.Item label="Start Time">
            {new Date(execution.startTime).toLocaleString()}
          </Descriptions.Item>
          
          <Descriptions.Item label="End Time">
            {execution.endTime ? 
              new Date(execution.endTime).toLocaleString() : 
              'Still running...'
            }
          </Descriptions.Item>
          
          <Descriptions.Item label="Duration" span={2}>
            {formatDuration()}
          </Descriptions.Item>
        </Descriptions>

        {execution.errorMessage && (
          <Alert
            type="error"
            message="Error Details"
            description={execution.errorMessage}
            showIcon
          />
        )}

        {execution.executionData && (
          <div>
            <Text strong>Execution Data:</Text>
            <div className="mt-2 bg-gray-100 p-3 rounded">
              <pre className="text-xs overflow-auto">
                {JSON.stringify(execution.executionData, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {execution.logs && execution.logs.length > 0 && (
          <div>
            <Text strong>Execution Logs:</Text>
            <Timeline
              className="mt-3"
              items={execution.logs.map((log) => ({
                children: (
                  <Text className="text-xs font-mono">
                    {log}
                  </Text>
                ),
                color: log.toLowerCase().includes('error') ? 'red' : 'blue'
              }))}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ExecutionDetails;