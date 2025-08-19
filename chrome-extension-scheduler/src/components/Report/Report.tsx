// src/components/Report/Report.tsx
import React, { useState, useEffect } from 'react';
import { Typography, Card, Row, Col, Statistic } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { ExecutionHistory, Link, Schedule } from '../../types';
import { HistoryRepository, LinkRepository, ScheduleRepository } from '../../storage/repositories';
import ExecutionHistoryTable from './ExecutionHistory';
import ExecutionDetails from './ExecutionDetails';
import ReportFilters from './ReportFilters';

const { Title } = Typography;

const Report: React.FC = () => {
  const [selectedExecution, setSelectedExecution] = useState<ExecutionHistory | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    successRate: 0
  });
  const [loading, setLoading] = useState(false);
  const [linksMap, setLinksMap] = useState<Record<string, Link>>({});
  const [schedulesMap, setSchedulesMap] = useState<Record<string, Schedule>>({});

  const loadStats = async () => {
    try {
      const statistics = await HistoryRepository.getStats();
      setStats(statistics);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadMappingData = async () => {
    try {
      // Load links
      const links = await LinkRepository.getAll();
      const linksById = links.reduce((acc, link) => {
        acc[link.id] = link;
        return acc;
      }, {} as Record<string, Link>);
      setLinksMap(linksById);

      // Load schedules
      const schedules: Record<string, Schedule> = {};
      for (const link of links) {
        const linkSchedules = await ScheduleRepository.getByLinkId(link.id);
        linkSchedules.forEach(schedule => {
          schedules[schedule.id] = schedule;
        });
      }
      setSchedulesMap(schedules);
    } catch (error) {
      console.error('Error loading mapping data:', error);
    }
  };

  useEffect(() => {
    loadStats();
    loadMappingData();
  }, []);

  const handleViewDetails = (execution: ExecutionHistory) => {
    setSelectedExecution(execution);
    setDetailsOpen(true);
  };

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([loadStats(), loadMappingData()]).finally(() => {
      setLoading(false);
    });
  };

  const handleFilterChange = (filters: any) => {
    // TODO: Implement filtering logic
    console.log('Filters changed:', filters);
  };

  return (
    <div className="space-y-6">
      <div>
        <Title level={2}>Execution Report</Title>
      </div>

      {/* Statistics Cards */}
      <Row gutter={16}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Total Executions"
              value={stats.total}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Successful"
              value={stats.successful}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Failed"
              value={stats.failed}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Success Rate"
              value={stats.successRate}
              precision={1}
              suffix="%"
              valueStyle={{ 
                color: stats.successRate >= 90 ? '#3f8600' : 
                       stats.successRate >= 70 ? '#faad14' : '#cf1322' 
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <ReportFilters
        onFilterChange={handleFilterChange}
        onRefresh={handleRefresh}
        loading={loading}
      />

      {/* Execution History Table */}
      <Card title="Execution History">
        <ExecutionHistoryTable onViewDetails={handleViewDetails} />
      </Card>

      {/* Execution Details Modal */}
      <ExecutionDetails
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        execution={selectedExecution}
        linkName={selectedExecution ? linksMap[selectedExecution.linkId]?.name : undefined}
        scheduleName={selectedExecution ? schedulesMap[selectedExecution.scheduleId]?.name : undefined}
      />
    </div>
  );
};

export default Report;