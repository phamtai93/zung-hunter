// src/components/Report/Report.tsx
import React, { useState, useEffect } from 'react';
import { Card, Table, DatePicker, Select, Button, Space, Tag, Typography, Row, Col, Statistic } from 'antd';
import { SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { HistoryRepository, LinkRepository, ScheduleRepository } from '../../storage/repositories';
import { ExecutionHistory, Link, Schedule } from '../../types';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text } = Typography;

interface ReportFilter {
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  linkId: string | null;
  scheduleId: string | null;
  status: 'all' | 'success' | 'failed';
}

const Report: React.FC = () => {
  const [executions, setExecutions] = useState<ExecutionHistory[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>({
    dateRange: null,
    linkId: null,
    scheduleId: null,
    status: 'all'
  });
  const [stats, setStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    successRate: 0
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadExecutions();
  }, [filter]);

  const loadInitialData = async () => {
    try {
      const [linksData, schedulesData] = await Promise.all([
        LinkRepository.getAll(),
        ScheduleRepository.getAll()
      ]);
      setLinks(linksData);
      setSchedules(schedulesData);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const loadExecutions = async () => {
    try {
      setLoading(true);
      
      // Load all executions first
      const allExecutions = await HistoryRepository.getAll(1000);
      
      // Apply filters
      let filteredExecutions = allExecutions;

      // Filter by date range
      if (filter.dateRange && filter.dateRange[0] && filter.dateRange[1]) {
        const startDate = filter.dateRange[0].startOf('day').toDate();
        const endDate = filter.dateRange[1].endOf('day').toDate();
        filteredExecutions = filteredExecutions.filter(exec => {
          const execDate = new Date(exec.startTime);
          return execDate >= startDate && execDate <= endDate;
        });
      }

      // Filter by link
      if (filter.linkId) {
        filteredExecutions = filteredExecutions.filter(exec => exec.linkId === filter.linkId);
      }

      // Filter by schedule
      if (filter.scheduleId) {
        filteredExecutions = filteredExecutions.filter(exec => exec.scheduleId === filter.scheduleId);
      }

      // Filter by status
      if (filter.status !== 'all') {
        const success = filter.status === 'success';
        filteredExecutions = filteredExecutions.filter(exec => exec.success === success);
      }

      setExecutions(filteredExecutions);

      // Calculate stats
      const total = filteredExecutions.length;
      const successful = filteredExecutions.filter(exec => exec.success).length;
      const failed = total - successful;
      const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

      setStats({ total, successful, failed, successRate });
      
    } catch (error) {
      console.error('Error loading executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof ReportFilter, value: any) => {
    setFilter(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleReset = () => {
    setFilter({
      dateRange: null,
      linkId: null,
      scheduleId: null,
      status: 'all'
    });
  };

  const handleExport = () => {
    if (executions.length === 0) return;

    const csvHeaders = [
      'Thời gian bắt đầu',
      'Thời gian kết thúc', 
      'Link',
      'Schedule',
      'Trạng thái',
      'Thời gian chạy (s)',
      'Lỗi'
    ];

    const csvData = executions.map(exec => {
      const link = links.find(l => l.id === exec.linkId);
      const schedule = schedules.find(s => s.id === exec.scheduleId);
      const duration = exec.endTime 
        ? Math.round((new Date(exec.endTime).getTime() - new Date(exec.startTime).getTime()) / 1000)
        : 0;

      return [
        new Date(exec.startTime).toLocaleString('vi-VN'),
        exec.endTime ? new Date(exec.endTime).toLocaleString('vi-VN') : 'N/A',
        link?.name || 'N/A',
        schedule?.name || 'N/A',
        exec.success ? 'Thành công' : 'Thất bại',
        duration,
        exec.errorMessage || ''
      ];
    });

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `execution-report-${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
  };

  const formatDuration = (startTime: Date | string, endTime?: Date | string): string => {
    if (!endTime) return 'N/A';
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
    const duration = end.getTime() - start.getTime();
    return Math.round(duration / 1000) + 's';
  };

  const columns = [
    {
      title: 'Thời gian bắt đầu',
      key: 'startTime',
      render: (record: ExecutionHistory) => new Date(record.startTime).toLocaleString('vi-VN'),
      sorter: (a: ExecutionHistory, b: ExecutionHistory) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    },
    {
      title: 'Link',
      key: 'linkName',
      render: (record: ExecutionHistory) => {
        const link = links.find(l => l.id === record.linkId);
        return link ? link.name : 'N/A';
      }
    },
    {
      title: 'Schedule',
      key: 'scheduleName',
      render: (record: ExecutionHistory) => {
        const schedule = schedules.find(s => s.id === record.scheduleId);
        return schedule ? schedule.name : 'N/A';
      }
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (record: ExecutionHistory) => (
        <Tag color={record.success ? 'green' : 'red'}>
          {record.success ? 'Thành công' : 'Thất bại'}
        </Tag>
      )
    },
    {
      title: 'Thời gian chạy',
      key: 'duration',
      render: (record: ExecutionHistory) => formatDuration(record.startTime, record.endTime)
    },
    {
      title: 'API Tracked',
      key: 'apiCount',
      render: (record: ExecutionHistory) => {
        const apiCount = record.executionData?.trackedRequests?.length || 0;
        return <Tag>{apiCount}</Tag>;
      }
    },
    {
      title: 'Models Data',
      key: 'modelsData',
      render: (record: ExecutionHistory) => {
        const hasModels = record.executionData?.trackedRequests?.some(
          (req: any) => req.response?.modelsJson
        );
        return (
          <Tag color={hasModels ? 'green' : 'default'}>
            {hasModels ? 'Available' : 'None'}
          </Tag>
        );
      }
    },
    {
      title: 'Logs',
      key: 'logs',
      render: (record: ExecutionHistory) => (
        <Text type="secondary">{record.logs.length} dòng</Text>
      )
    }
  ];

  const expandedRowRender = (record: ExecutionHistory) => {
    const trackedRequests = record.executionData?.trackedRequests || [];
    const modelsData = trackedRequests.find((req: any) => req.response?.modelsJson)?.response?.modelsJson;
    
    return (
      <div style={{ padding: '16px', backgroundColor: '#fafafa' }}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card size="small" title="Thông tin chi tiết">
              <p><strong>Thời gian kết thúc:</strong> {
                record.endTime ? new Date(record.endTime).toLocaleString('vi-VN') : 'Chưa kết thúc'
              }</p>
              {record.errorMessage && (
                <p><strong>Lỗi:</strong> <Text type="danger">{record.errorMessage}</Text></p>
              )}
              <p><strong>API Tracked:</strong> {trackedRequests.length} requests</p>
              {modelsData && (
                <>
                  <p><strong>Models Data:</strong> 
                    <Tag color="green" style={{ marginLeft: 8 }}>
                      {Array.isArray(modelsData) ? `${modelsData.length} models` : 'Available'}
                    </Tag>
                  </p>
                  {Array.isArray(modelsData) && modelsData.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <Text strong>Sample Model:</Text>
                      <div style={{ 
                        marginTop: 4, 
                        padding: 8, 
                        backgroundColor: '#f5f5f5', 
                        borderRadius: 4,
                        fontSize: '12px',
                        maxHeight: '100px',
                        overflow: 'auto'
                      }}>
                        <pre>{JSON.stringify(modelsData[0], null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="Logs">
              <div style={{ maxHeight: '200px', overflow: 'auto', fontSize: '12px', fontFamily: 'monospace' }}>
                {record.logs.map((log, index) => (
                  <div key={index} style={{ marginBottom: '4px' }}>
                    {log}
                  </div>
                ))}
                {record.logs.length === 0 && (
                  <Text type="secondary">Không có logs</Text>
                )}
              </div>
            </Card>
          </Col>
        </Row>
        
        {trackedRequests.length > 0 && (
          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card size="small" title="Tracked API Requests">
                {trackedRequests.map((request: any, index: number) => (
                  <div key={index} style={{ marginBottom: 16, padding: 12, border: '1px solid #d9d9d9', borderRadius: 4 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong>{request.method}</Text> <Text code>{request.url}</Text>
                      <Tag style={{ marginLeft: 8 }}>Status: {request.response?.status}</Tag>
                      {request.response?.modelsJson && (
                        <Tag color="green" style={{ marginLeft: 4 }}>Models Available</Tag>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Source: {request.captureSource} | Time: {new Date(request.timestamp).toLocaleString('vi-VN')}
                    </div>
                  </div>
                ))}
              </Card>
            </Col>
          </Row>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Filter Section */}
      <Card title="Bộ lọc" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Khoảng thời gian:</Text>
            </div>
            <RangePicker
              value={filter.dateRange}
              onChange={(dates) => handleFilterChange('dateRange', dates)}
              style={{ width: '100%' }}
              placeholder={['Từ ngày', 'Đến ngày']}
            />
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Link:</Text>
            </div>
            <Select
              value={filter.linkId}
              onChange={(value) => handleFilterChange('linkId', value)}
              style={{ width: '100%' }}
              placeholder="Chọn link"
              allowClear
            >
              {links.map(link => (
                <Option key={link.id} value={link.id}>
                  {link.name}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Schedule:</Text>
            </div>
            <Select
              value={filter.scheduleId}
              onChange={(value) => handleFilterChange('scheduleId', value)}
              style={{ width: '100%' }}
              placeholder="Chọn schedule"
              allowClear
            >
              {schedules.map(schedule => (
                <Option key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Trạng thái:</Text>
            </div>
            <Select
              value={filter.status}
              onChange={(value) => handleFilterChange('status', value)}
              style={{ width: '100%' }}
            >
              <Option value="all">Tất cả</Option>
              <Option value="success">Thành công</Option>
              <Option value="failed">Thất bại</Option>
            </Select>
          </Col>
        </Row>
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button 
              type="primary" 
              icon={<SearchOutlined />} 
              onClick={loadExecutions}
              loading={loading}
            >
              Tìm kiếm
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Đặt lại
            </Button>
            <Button 
              icon={<DownloadOutlined />} 
              onClick={handleExport}
              disabled={executions.length === 0}
            >
              Xuất CSV
            </Button>
          </Space>
        </div>
      </Card>

      {/* Stats */}
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Tổng số lần chạy" value={stats.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Thành công" value={stats.successful} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Thất bại" value={stats.failed} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Tỷ lệ thành công" 
              value={stats.successRate} 
              suffix="%" 
              valueStyle={{ color: stats.successRate > 90 ? '#3f8600' : stats.successRate > 70 ? '#fa8c16' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Results Table */}
      <Card title={`Kết quả (${executions.length} bản ghi)`}>
        <Table
          columns={columns}
          dataSource={executions}
          rowKey="id"
          loading={loading}
          expandable={{
            expandedRowRender,
            rowExpandable: (_record) => true,
          }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} của ${total} bản ghi`
          }}
        />
      </Card>
    </div>
  );
};

export default Report;