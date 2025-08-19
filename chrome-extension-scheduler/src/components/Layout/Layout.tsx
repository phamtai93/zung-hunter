import React from 'react';
import { Layout as AntLayout, Menu } from 'antd';
import { DashboardOutlined, SettingOutlined, BarChartOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Ensure we have a valid path for menu selection
  const currentPath = location.pathname || '/dashboard';

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    {
      key: '/report',
      icon: <BarChartOutlined />,
      label: 'Report',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={200}>
        <div className="p-4 text-white text-center font-bold text-lg border-b border-gray-700">
          Link Scheduler
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentPath]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <AntLayout>
        <Content className="p-6 bg-gray-50">
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;