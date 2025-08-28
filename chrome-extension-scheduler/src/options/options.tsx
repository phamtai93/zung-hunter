import React from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ConfigProvider } from "antd";
import Layout from "../components/Layout/Layout";
import Dashboard from "../components/Dashboard/Dashboard";
import Settings from "../components/Settings/Settings";
import Report from "../components/Report/Report";
import "../styles/globals.css";

const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1890ff",
        },
      }}
    >
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Layout>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/report" element={<Report />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ConfigProvider>
  );
};

// Initialize the app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
