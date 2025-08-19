// src/components/Settings/LinkTable.tsx
import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Switch, Tag, Popconfirm, message, Typography, Tooltip } from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  SettingOutlined,
  LinkOutlined,
  ShopOutlined,
  TagOutlined
} from '@ant-design/icons';
import { Link } from '../../types';
import { LinkRepository, ScheduleRepository } from '../../storage/repositories';
import LinkForm from './LinkForm';
import ScheduleManager from './ScheduleManager';

const { Text } = Typography;

interface LinkTableProps {
  onRefresh?: () => void;
}

const LinkTable: React.FC<LinkTableProps> = ({ onRefresh }) => {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [scheduleManagerOpen, setScheduleManagerOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  const [scheduleCounts, setScheduleCounts] = useState<Record<string, number>>({});

  const loadLinks = async () => {
    setLoading(true);
    try {
      const allLinks = await LinkRepository.getAll();
      setLinks(allLinks);
      
      // Load schedule counts for each link
      const counts: Record<string, number> = {};
      for (const link of allLinks) {
        const schedules = await ScheduleRepository.getByLinkId(link.id);
        counts[link.id] = schedules.length;
      }
      setScheduleCounts(counts);
      
      onRefresh?.();
    } catch (error) {
      message.error('Failed to load links');
      console.error('Error loading links:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const handleDelete = async (linkId: string) => {
    try {
      await LinkRepository.delete(linkId);
      message.success('Link deleted successfully');
      loadLinks();
    } catch (error) {
      message.error('Failed to delete link');
      console.error('Error deleting link:', error);
    }
  };

  const handleToggleEnabled = async (linkId: string, enabled: boolean) => {
    try {
      await LinkRepository.update(linkId, { enabled });
      message.success(`Link ${enabled ? 'enabled' : 'disabled'} successfully`);
      loadLinks();
    } catch (error) {
      message.error('Failed to update link status');
      console.error('Error updating link:', error);
    }
  };

  const handleEdit = (link: Link) => {
    setEditingLink(link);
    setLinkFormOpen(true);
  };

  const handleAddNew = () => {
    setEditingLink(null);
    setLinkFormOpen(true);
  };

  const handleManageSchedules = (link: Link) => {
    setSelectedLink(link);
    setScheduleManagerOpen(true);
  };

  const handleFormSuccess = () => {
    loadLinks();
  };

  const openUrl = (url: string) => {
    chrome.tabs.create({ url });
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      ellipsis: true,
      render: (text: string, record: Link) => (
        <div>
          <Text strong>{text}</Text>
          {!record.enabled && (
            <Tag color="red" className="ml-2">Disabled</Tag>
          )}
          {record.productId && record.shopId && (
            <Tag color="blue" className="ml-2">Product</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
      render: (url: string) => (
        <div className="flex items-center gap-2">
          <Text code className="text-xs">{url}</Text>
          <Button
            type="text"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => openUrl(url)}
            title="Open URL"
          />
        </div>
      ),
    },
    {
      title: 'Shop ID',
      dataIndex: 'shopId',
      key: 'shopId',
      width: 120,
      render: (shopId: string) => (
        shopId ? (
          <Tooltip title="Shop ID">
            <Tag icon={<ShopOutlined />} color="green">
              {shopId}
            </Tag>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        )
      ),
    },
    {
      title: 'Product ID',
      dataIndex: 'productId',
      key: 'productId',
      width: 120,
      render: (productId: string) => (
        productId ? (
          <Tooltip title="Product ID">
            <Tag icon={<TagOutlined />} color="orange">
              {productId}
            </Tag>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        )
      ),
    },
    {
      title: 'Schedules',
      key: 'schedules',
      width: 130,
      align: 'center' as const,
      render: (record: Link) => (
        <Tag color={scheduleCounts[record.id] > 0 ? 'blue' : 'default'}>
          {scheduleCounts[record.id] || 0}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 90,
      render: (date: Date) => (
        <Text type="secondary" className="text-xs">
          {new Date(date).toLocaleDateString()}
        </Text>
      ),
    },
    {
      title: 'Enabled',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      align: 'center' as const,
      render: (enabled: boolean, record: Link) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggleEnabled(record.id, checked)}
          size="small"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (record: Link) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => handleManageSchedules(record)}
            title="Manage Schedules"
          />
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            title="Edit Link"
          />
          <Popconfirm
            title="Delete Link"
            description="This will also delete all schedules and history for this link. Are you sure?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              title="Delete Link"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddNew}
        >
          Add Link
        </Button>
        
        <div className="text-sm text-gray-500">
          Total: {links.length} links | Products: {links.filter(l => l.productId && l.shopId).length}
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={links}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total, range) => 
            `${range[0]}-${range[1]} of ${total} links`,
        }}
        locale={{
          emptyText: 'No links configured. Click "Add Link" to get started.'
        }}
        scroll={{ x: 1000 }} // Enable horizontal scroll for small screens
      />

      <LinkForm
        open={linkFormOpen}
        onCancel={() => setLinkFormOpen(false)}
        onSuccess={handleFormSuccess}
        editingLink={editingLink}
      />

      {selectedLink && (
        <ScheduleManager
          open={scheduleManagerOpen}
          onCancel={() => setScheduleManagerOpen(false)}
          link={selectedLink}
        />
      )}
    </>
  );
};

export default LinkTable;