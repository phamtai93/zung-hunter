// src/components/Settings/Settings.tsx
import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, Table, Switch, message, Divider, InputNumber, DatePicker } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { Link, Schedule } from '../../types';
import { LinkRepository, ScheduleRepository } from '../../storage/repositories';
import { SchedulerEngine } from '../../utils/scheduler-engine';

const { Option } = Select;

const Settings: React.FC = () => {
  const [links, setLinks] = useState<Link[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [linkForm] = Form.useForm();
  const [scheduleForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load links first
      const linksData = await LinkRepository.getAll();
      setLinks(linksData);
      
      // Then load schedules
      const schedulesData = await ScheduleRepository.getAll();
      setSchedules(schedulesData);
      
    } catch (error) {
      console.error('Error loading data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      message.error('Lỗi khi tải dữ liệu: ' + errorMessage);
    }
  };

  // Thêm link mới
  const handleAddLink = async (values: any) => {
    try {
      setLoading(true);
      await LinkRepository.create({
        name: values.name,
        url: values.url,
        enabled: true
      });
      
      linkForm.resetFields();
      message.success('Thêm link thành công');
      
      // Reload data after successful creation
      await loadData();
      
    } catch (error) {
      console.error('Error adding link:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      message.error('Lỗi khi thêm link: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Tạo schedule mới
  const handleAddSchedule = async (values: any) => {
    try {
      setLoading(true);
      
      let nextRun: Date;
      const scheduleData: Omit<Schedule, 'id' | 'createdAt'> = {
        linkId: values.linkId,
        name: values.name,
        type: values.type,
        quantity: values.quantity || 1,
        enabled: true,
        nextRun: new Date(), // sẽ tính lại bên dưới
        lastRun: undefined
      };

      // Tính toán nextRun dựa trên type
      switch (values.type) {
        case 'cron':
          scheduleData.cronExpression = values.cronExpression;
          nextRun = SchedulerEngine.calculateNextRun({
            ...scheduleData,
            id: 'temp',
            createdAt: new Date()
          } as Schedule);
          break;
        case 'interval':
          scheduleData.intervalMinutes = values.intervalMinutes;
          nextRun = new Date(Date.now() + values.intervalMinutes * 60 * 1000);
          break;
        case 'once':
          scheduleData.oneTimeDate = values.oneTimeDate.toDate();
          nextRun = values.oneTimeDate.toDate();
          break;
        default:
          throw new Error('Loại schedule không hợp lệ');
      }

      scheduleData.nextRun = nextRun;
      
      await ScheduleRepository.create(scheduleData);
      message.success('Tạo lịch thành công');
      scheduleForm.resetFields();
      loadData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      message.error('Lỗi khi tạo lịch: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Xóa link
  const handleDeleteLink = async (id: string) => {
    try {
      await LinkRepository.delete(id);
      message.success('Đã xóa link');
      await loadData();
    } catch (error) {
      console.error('Error deleting link:', error);
      message.error('Lỗi khi xóa link');
    }
  };

  // Bật/tắt link
  const handleToggleLink = async (id: string, enabled: boolean) => {
    try {
      await LinkRepository.update(id, { enabled });
      await loadData();
    } catch (error) {
      console.error('Error updating link:', error);
      message.error('Lỗi khi cập nhật link');
    }
  };

  // Xóa schedule
  const handleDeleteSchedule = async (id: string) => {
    try {
      await ScheduleRepository.delete(id);
      message.success('Đã xóa lịch');
      await loadData();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      message.error('Lỗi khi xóa lịch');
    }
  };

  // Bật/tắt schedule
  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    try {
      await ScheduleRepository.update(id, { enabled });
      await loadData();
    } catch (error) {
      console.error('Error updating schedule:', error);
      message.error('Lỗi khi cập nhật lịch');
    }
  };

  const linkColumns = [
    { title: 'Tên', dataIndex: 'name', key: 'name' },
    { title: 'URL', dataIndex: 'url', key: 'url', width: 300 },
    { 
      title: 'Trạng thái', 
      key: 'enabled',
      render: (record: Link) => (
        <Switch 
          checked={record.enabled} 
          onChange={(checked) => handleToggleLink(record.id, checked)}
        />
      )
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (record: Link) => (
        <Button 
          type="link" 
          danger 
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteLink(record.id)}
        >
          Xóa
        </Button>
      )
    }
  ];

  const scheduleColumns = [
    { title: 'Tên lịch', dataIndex: 'name', key: 'name' },
    { 
      title: 'Link', 
      key: 'linkName',
      render: (record: Schedule) => {
        const link = links.find(l => l.id === record.linkId);
        return link ? link.name : 'N/A';
      }
    },
    { title: 'Loại', dataIndex: 'type', key: 'type' },
    { 
      title: 'Lần chạy tiếp theo', 
      key: 'nextRun',
      render: (record: Schedule) => new Date(record.nextRun).toLocaleString('vi-VN')
    },
    { 
      title: 'Trạng thái', 
      key: 'enabled',
      render: (record: Schedule) => (
        <Switch 
          checked={record.enabled} 
          onChange={(checked) => handleToggleSchedule(record.id, checked)}
        />
      )
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (record: Schedule) => (
        <Button 
          type="link" 
          danger 
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteSchedule(record.id)}
        >
          Xóa
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Thêm Link */}
      <Card title="Thêm Link mới" style={{ marginBottom: 24 }}>
        <Form form={linkForm} layout="horizontal" onFinish={handleAddLink}>
          <Form.Item
            label="Tên Link"
            name="name"
            rules={[{ required: true, message: 'Vui lòng nhập tên link' }]}
          >
            <Input placeholder="Nhập tên link" />
          </Form.Item>
          <Form.Item
            label="URL"
            name="url"
            rules={[
              { required: true, message: 'Vui lòng nhập URL' },
              { type: 'url', message: 'URL không hợp lệ' }
            ]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} icon={<PlusOutlined />}>
              Thêm Link
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Danh sách Links */}
      <Card title="Danh sách Links" style={{ marginBottom: 24 }}>
        <Table 
          columns={linkColumns} 
          dataSource={links} 
          rowKey="id"
          size="small"
        />
      </Card>

      <Divider />

      {/* Tạo Schedule */}
      <Card title="Tạo Lịch mới" style={{ marginBottom: 24 }}>
        <Form form={scheduleForm} layout="horizontal" onFinish={handleAddSchedule}>
          <Form.Item
            label="Link"
            name="linkId"
            rules={[{ required: true, message: 'Vui lòng chọn link' }]}
          >
            <Select placeholder="Chọn link">
              {links.filter(link => link.enabled).map(link => (
                <Option key={link.id} value={link.id}>
                  {link.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Tên lịch"
            name="name"
            rules={[{ required: true, message: 'Vui lòng nhập tên lịch' }]}
          >
            <Input placeholder="Tên lịch" />
          </Form.Item>

          <Form.Item
            label="Loại lịch"
            name="type"
            rules={[{ required: true, message: 'Vui lòng chọn loại lịch' }]}
          >
            <Select placeholder="Chọn loại lịch">
              <Option value="cron">Cron (theo biểu thức)</Option>
              <Option value="interval">Lặp lại (theo phút)</Option>
              <Option value="once">Một lần</Option>
            </Select>
          </Form.Item>

          <Form.Item dependencies={['type']}>
            {({ getFieldValue }) => {
              const type = getFieldValue('type');
              switch (type) {
                case 'cron':
                  return (
                    <Form.Item
                      label="Biểu thức Cron"
                      name="cronExpression"
                      rules={[{ required: true, message: 'Vui lòng nhập biểu thức cron' }]}
                    >
                      <Select placeholder="Chọn hoặc nhập biểu thức cron">
                        <Option value="*/5 * * * *">Mỗi 5 phút</Option>
                        <Option value="*/15 * * * *">Mỗi 15 phút</Option>
                        <Option value="*/30 * * * *">Mỗi 30 phút</Option>
                        <Option value="0 * * * *">Mỗi giờ</Option>
                        <Option value="0 9 * * *">Hàng ngày lúc 9h</Option>
                      </Select>
                    </Form.Item>
                  );
                case 'interval':
                  return (
                    <Form.Item
                      label="Khoảng thời gian (phút)"
                      name="intervalMinutes"
                      rules={[{ required: true, message: 'Vui lòng nhập khoảng thời gian' }]}
                    >
                      <InputNumber min={1} placeholder="Nhập số phút" />
                    </Form.Item>
                  );
                case 'once':
                  return (
                    <Form.Item
                      label="Thời gian chạy"
                      name="oneTimeDate"
                      rules={[{ required: true, message: 'Vui lòng chọn thời gian' }]}
                    >
                      <DatePicker showTime placeholder="Chọn ngày và giờ" />
                    </Form.Item>
                  );
                default:
                  return null;
              }
            }}
          </Form.Item>

          <Form.Item
            label="Số lượng tab"
            name="quantity"
            initialValue={1}
          >
            <InputNumber min={1} max={10} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} icon={<PlusOutlined />}>
              Tạo Lịch
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Danh sách Schedules */}
      <Card title="Danh sách Lịch">
        <Table 
          columns={scheduleColumns} 
          dataSource={schedules} 
          rowKey="id"
          size="small"
        />
      </Card>
    </div>
  );
};

export default Settings;