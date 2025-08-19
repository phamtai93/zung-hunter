// src/components/Settings/Settings.tsx
import React from 'react';
import { Typography, Card } from 'antd';
import LinkTable from './LinkTable';

const { Title, Paragraph } = Typography;

const Settings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <Title level={2}>Settings</Title>
        <Paragraph type="secondary">
          Manage your links and their schedules. Each link can have multiple schedules 
          with different execution patterns.
        </Paragraph>
      </div>

      <Card title="Links Management">
        <LinkTable />
      </Card>
    </div>
  );
};

export default Settings;