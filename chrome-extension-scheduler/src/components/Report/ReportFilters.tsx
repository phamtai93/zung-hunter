// src/components/Report/ReportFilters.tsx
import React from 'react';
import { Card, DatePicker, Select, Switch, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface ReportFiltersProps {
  onFilterChange: (filters: any) => void;
  onRefresh: () => void;
  loading?: boolean;
}

const ReportFilters: React.FC<ReportFiltersProps> = ({
  onFilterChange,
  onRefresh,
  loading
}) => {
  const [filters, setFilters] = React.useState({
    dateRange: null,
    status: 'all',
    linkId: 'all',
    successOnly: false
  });

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <Card size="small">
      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date Range</label>
          <RangePicker
            size="small"
            onChange={(dates) => handleFilterChange('dateRange', dates)}
            placeholder={['Start Date', 'End Date']}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <Select
            size="small"
            style={{ width: 120 }}
            value={filters.status}
            onChange={(value) => handleFilterChange('status', value)}
          >
            <Option value="all">All</Option>
            <Option value="success">Success</Option>
            <Option value="failed">Failed</Option>
            <Option value="running">Running</Option>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            size="small"
            checked={filters.successOnly}
            onChange={(checked) => handleFilterChange('successOnly', checked)}
          />
          <span className="text-xs">Success only</span>
        </div>

        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          loading={loading}
        >
          Refresh
        </Button>
      </div>
    </Card>
  );
};

export default ReportFilters;