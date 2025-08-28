// src/components/Layout/Layout.tsx
import React from 'react';
import { Layout as AntLayout, Menu, Typography } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { DashboardOutlined, SettingOutlined, BarChartOutlined } from '@ant-design/icons';

const { Header, Content, Sider } = AntLayout;
const { Title } = Typography;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Cài đặt',
    },
    {
      key: '/report',
      icon: <BarChartOutlined />,
      label: 'Báo cáo',
    },
  ];

  const handleMenuClick = (e: any) => {
    navigate(e.key);
  };

  const selectedKey = location.pathname;

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={250}>
        <div style={{ 
          padding: '16px', 
          textAlign: 'center', 
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <Title level={4} style={{ color: 'white', margin: 0 }}>
            Link Scheduler
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ marginTop: '16px' }}
        />
      </Sider>
      <AntLayout>
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)'
        }}>
          <Title level={3} style={{ margin: 0, lineHeight: '64px' }}>
            {menuItems.find(item => item.key === selectedKey)?.label || 'Dashboard'}
          </Title>
        </Header>
        <Content style={{ 
          background: '#f0f2f5', 
          minHeight: 'calc(100vh - 64px)',
          overflow: 'auto'
        }}>
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;