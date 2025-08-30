// src/components/Report/Report.tsx - Fixed Report Component
import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  DatePicker,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Spin,
} from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  HistoryRepository,
  LinkRepository,
  ScheduleRepository,
} from "../../storage/repositories";
import { ExecutionHistory, Link, Schedule } from "../../types";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text } = Typography;

interface ReportFilter {
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  linkId: string | null;
  scheduleId: string | null;
  status: "all" | "success" | "failed";
}

interface TrackedRequest {
  id: string;
  scheduleId: string;
  tabId: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  modelsData?: any;
  timestamp: number;
  source: "fetch" | "xhr";
  completed: boolean;
}

interface EnrichedExecutionHistory extends ExecutionHistory {
  trackedRequests?: TrackedRequest[];
  linkName?: string;
  scheduleName?: string;
}

const Report: React.FC = () => {
  const [executions, setExecutions] = useState<EnrichedExecutionHistory[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ReportFilter>({
    dateRange: null,
    linkId: null,
    scheduleId: null,
    status: "all",
  });
  const [stats, setStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    successRate: 0,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    // Only reload executions when filter changes, and only after initial data is loaded
    if (initialDataLoaded) {
      loadExecutions();
    }
  }, [filter, initialDataLoaded]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [linksData, schedulesData] = await Promise.all([
        LinkRepository.getAll(),
        ScheduleRepository.getAll(),
      ]);
      setLinks(linksData);
      setSchedules(schedulesData);
      setInitialDataLoaded(true);

      console.log("📊 Loaded initial data:", {
        linksCount: linksData.length,
        schedulesCount: schedulesData.length,
      });

      // Load executions after initial data is loaded
      await loadExecutionsWithData(linksData, schedulesData);
    } catch (error) {
      console.error("Error loading initial data:", error);
      setInitialDataLoaded(true); // Set to true even on error so executions can still load
    } finally {
      setLoading(false);
    }
  };

  const loadExecutionsWithData = async (
    linksData?: Link[],
    schedulesData?: Schedule[]
  ) => {
    try {
      setLoading(true);

      // Use provided data or current state
      const currentLinks = linksData || links;
      const currentSchedules = schedulesData || schedules;

      console.log("🔍 Loading executions with data:", {
        linksCount: currentLinks.length,
        schedulesCount: currentSchedules.length,
        filter,
      });

      // Load execution history
      const allExecutions = await HistoryRepository.getAll(1000);

      // Apply filters
      let filteredExecutions = allExecutions;

      // Filter by date range
      if (filter.dateRange && filter.dateRange[0] && filter.dateRange[1]) {
        const startDate = filter.dateRange[0].startOf("day").toDate();
        const endDate = filter.dateRange[1].endOf("day").toDate();
        filteredExecutions = filteredExecutions.filter((exec) => {
          const execDate = new Date(exec.startTime);
          return execDate >= startDate && execDate <= endDate;
        });
      }

      // Filter by link
      if (filter.linkId) {
        filteredExecutions = filteredExecutions.filter(
          (exec) => exec.linkId === filter.linkId
        );
      }

      // Filter by schedule
      if (filter.scheduleId) {
        filteredExecutions = filteredExecutions.filter(
          (exec) => exec.scheduleId === filter.scheduleId
        );
      }

      // Filter by status
      if (filter.status !== "all") {
        const success = filter.status === "success";
        filteredExecutions = filteredExecutions.filter(
          (exec) => exec.success === success
        );
      }

      // Enrich with link and schedule names + tracked requests
      const enrichedExecutions = await Promise.all(
        filteredExecutions.map(async (exec) => {
          const link = currentLinks.find((l) => l.id === exec.linkId);
          const schedule = currentSchedules.find(
            (s) => s.id === exec.scheduleId
          );

          console.log("🔗 Enriching execution:", {
            execId: exec.id,
            linkId: exec.linkId,
            scheduleId: exec.scheduleId,
            foundLink: link ? link.name : "NOT FOUND",
            foundSchedule: schedule ? schedule.name : "NOT FOUND",
          });

          // Load tracked requests from storage
          let trackedRequests: TrackedRequest[] = [];
          try {
            const storageKey = `tracked_requests_${exec.scheduleId}`;
            const result = await chrome.storage.local.get(storageKey);
            const allTrackedRequests: TrackedRequest[] =
              result[storageKey] || [];

            // Filter requests for this specific execution by timestamp
            const execStartTime = new Date(exec.startTime).getTime();
            const execEndTime = exec.endTime
              ? new Date(exec.endTime).getTime()
              : Date.now();

            trackedRequests = allTrackedRequests.filter((req) => {
              const reqTime = req.timestamp;
              return reqTime >= execStartTime && reqTime <= execEndTime;
            });
          } catch (error) {
            console.warn(
              `Error loading tracked requests for execution ${exec.id}:`,
              error
            );
          }

          const enriched: EnrichedExecutionHistory = {
            ...exec,
            linkName: link?.name || `Unknown Link (ID: ${exec.linkId})`,
            scheduleName:
              schedule?.name || `Unknown Schedule (ID: ${exec.scheduleId})`,
            trackedRequests,
          };

          return enriched;
        })
      );

      setExecutions(enrichedExecutions);

      console.log("✅ Enriched executions completed:", {
        totalExecutions: enrichedExecutions.length,
        withKnownLinks: enrichedExecutions.filter(
          (e) => !e.linkName?.startsWith("Unknown")
        ).length,
        withKnownSchedules: enrichedExecutions.filter(
          (e) => !e.scheduleName?.startsWith("Unknown")
        ).length,
      });

      // Calculate stats
      const total = enrichedExecutions.length;
      const successful = enrichedExecutions.filter(
        (exec) => exec.success
      ).length;
      const failed = total - successful;
      const successRate =
        total > 0 ? Math.round((successful / total) * 100) : 0;

      setStats({ total, successful, failed, successRate });
    } catch (error) {
      console.error("Error loading executions:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadExecutions = async () => {
    return loadExecutionsWithData();
  };

  const handleFilterChange = (key: keyof ReportFilter, value: any) => {
    setFilter((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleReset = () => {
    setFilter({
      dateRange: null,
      linkId: null,
      scheduleId: null,
      status: "all",
    });
  };

  const handleExport = () => {
    if (executions.length === 0) return;

    const csvHeaders = [
      "Thời gian bắt đầu",
      "Thời gian kết thúc",
      "Link",
      "Schedule",
      "Trạng thái",
      "Thời gian chạy (s)",
      "API Tracked",
      "Models Found",
      "Lỗi",
    ];

    const csvData = executions.map((exec) => {
      const duration = exec.endTime
        ? Math.round(
            (new Date(exec.endTime).getTime() -
              new Date(exec.startTime).getTime()) /
              1000
          )
        : 0;

      const apiCount = exec.trackedRequests?.length || 0;
      const modelsFound =
        exec.trackedRequests?.filter((r) => r.modelsData).length || 0;

      return [
        new Date(exec.startTime).toLocaleString("vi-VN"),
        exec.endTime ? new Date(exec.endTime).toLocaleString("vi-VN") : "N/A",
        exec.linkName || "N/A",
        exec.scheduleName || "N/A",
        exec.success ? "Thành công" : "Thất bại",
        duration,
        apiCount,
        modelsFound,
        exec.errorMessage || "",
      ];
    });

    const csvContent = [
      csvHeaders.join(","),
      ...csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `execution-report-${dayjs().format("YYYY-MM-DD")}.csv`;
    link.click();
  };

  const formatDuration = (
    startTime: Date | string,
    endTime?: Date | string
  ): string => {
    if (!endTime) return "N/A";
    const start =
      typeof startTime === "string" ? new Date(startTime) : startTime;
    const end = typeof endTime === "string" ? new Date(endTime) : endTime;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return "N/A";
    }
    const duration = end.getTime() - start.getTime();
    return Math.round(duration / 1000) + "s";
  };

  const loadExecutionDetails = async (execution: EnrichedExecutionHistory) => {
    if (execution.trackedRequests && execution.trackedRequests.length > 0) {
      return; // Already loaded
    }

    setLoadingDetails((prev) => new Set(prev).add(execution.id));

    try {
      // Force reload tracked requests for this execution
      const storageKey = `tracked_requests_${execution.scheduleId}`;
      const result = await chrome.storage.local.get(storageKey);
      const allTrackedRequests: TrackedRequest[] = result[storageKey] || [];

      // Filter by execution timeframe
      const execStartTime = new Date(execution.startTime).getTime();
      const execEndTime = execution.endTime
        ? new Date(execution.endTime).getTime()
        : Date.now();

      const filteredRequests = allTrackedRequests.filter((req) => {
        const reqTime = req.timestamp;
        return reqTime >= execStartTime && reqTime <= execEndTime;
      });

      // Update the execution with tracked requests
      setExecutions((prev) =>
        prev.map((exec) =>
          exec.id === execution.id
            ? { ...exec, trackedRequests: filteredRequests }
            : exec
        )
      );
    } catch (error) {
      console.error("Error loading execution details:", error);
    } finally {
      setLoadingDetails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(execution.id);
        return newSet;
      });
    }
  };

  const columns = [
    {
      title: "Thời gian bắt đầu",
      key: "startTime",
      render: (record: EnrichedExecutionHistory) =>
        new Date(record.startTime).toLocaleString("vi-VN"),
      sorter: (a: EnrichedExecutionHistory, b: EnrichedExecutionHistory) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    },
    {
      title: "Link",
      key: "linkName",
      render: (record: EnrichedExecutionHistory) => record.linkName || "N/A",
    },
    {
      title: "Schedule",
      key: "scheduleName",
      render: (record: EnrichedExecutionHistory) =>
        record.scheduleName || "N/A",
    },
    {
      title: "Trạng thái",
      key: "status",
      render: (record: EnrichedExecutionHistory) => (
        <Tag color={record.success ? "green" : "red"}>
          {record.success ? "Thành công" : "Thất bại"}
        </Tag>
      ),
    },
    {
      title: "Thời gian chạy",
      key: "duration",
      render: (record: EnrichedExecutionHistory) =>
        formatDuration(record.startTime, record.endTime),
    },
    {
      title: "API Tracked",
      key: "apiCount",
      render: (record: EnrichedExecutionHistory) => {
        const apiCount = record.trackedRequests?.length || 0;
        return <Tag color={apiCount > 0 ? "blue" : "default"}>{apiCount}</Tag>;
      },
    },
    {
      title: "Models Data",
      key: "modelsData",
      render: (record: EnrichedExecutionHistory) => {
        const modelsCount =
          record.trackedRequests?.filter((r) => r.modelsData).length || 0;
        return (
          <Tag color={modelsCount > 0 ? "green" : "default"}>
            {modelsCount > 0 ? `${modelsCount} found` : "None"}
          </Tag>
        );
      },
    },
    {
      title: "Logs",
      key: "logs",
      render: (record: EnrichedExecutionHistory) => (
        <Text type="secondary">{record.logs?.length || 0} dòng</Text>
      ),
    },
  ];

  const handleRowExpand = (
    expanded: boolean,
    record: EnrichedExecutionHistory
  ) => {
    if (
      expanded &&
      (!record.trackedRequests || record.trackedRequests.length === 0)
    ) {
      loadExecutionDetails(record);
    }
  };

  const expandedRowRender = (record: EnrichedExecutionHistory) => {
    const isLoadingDetails = loadingDetails.has(record.id);
    const trackedRequests = record.trackedRequests || [];
    const modelsRequests = trackedRequests.filter((req) => req.modelsData);

    if (isLoadingDetails) {
      return (
        <div style={{ padding: "16px", textAlign: "center" }}>
          <Spin /> Loading execution details...
        </div>
      );
    }

    return (
      <div style={{ padding: "16px", backgroundColor: "#fafafa" }}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card size="small" title="Thông tin chi tiết">
              <p>
                <strong>Thời gian kết thúc:</strong>{" "}
                {record.endTime
                  ? new Date(record.endTime).toLocaleString("vi-VN")
                  : "Chưa kết thúc"}
              </p>
              {record.errorMessage && (
                <p>
                  <strong>Lỗi:</strong>{" "}
                  <Text type="danger">{record.errorMessage}</Text>
                </p>
              )}
              <p>
                <strong>API Requests:</strong> {trackedRequests.length} requests
              </p>
              <p>
                <strong>Completed:</strong>{" "}
                {trackedRequests.filter((r) => r.completed).length}
              </p>
              <p>
                <strong>Models Found:</strong> {modelsRequests.length}
              </p>

              {modelsRequests.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text strong>Sample Models Data:</Text>
                  <div
                    style={{
                      marginTop: 4,
                      padding: 8,
                      backgroundColor: "#f5f5f5",
                      borderRadius: 4,
                      fontSize: "12px",
                      maxHeight: "120px",
                      overflow: "auto",
                    }}
                  >
                    <pre>
                      {JSON.stringify(modelsRequests[0]?.modelsData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </Card>
          </Col>

          <Col span={12}>
            <Card size="small" title="Execution Logs">
              <div
                style={{
                  maxHeight: "200px",
                  overflow: "auto",
                  fontSize: "12px",
                  fontFamily: "monospace",
                }}
              >
                {record.logs && record.logs.length > 0 ? (
                  record.logs.map((log, index) => (
                    <div key={index} style={{ marginBottom: "4px" }}>
                      {log}
                    </div>
                  ))
                ) : (
                  <Text type="secondary">Không có logs</Text>
                )}
              </div>
            </Card>
          </Col>
        </Row>

        {trackedRequests.length > 0 && (
          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card
                size="small"
                title={`Tracked API Requests (${trackedRequests.length})`}
              >
                {trackedRequests.map((request, index) => (
                  <div
                    key={index}
                    style={{
                      marginBottom: 16,
                      padding: 12,
                      border: "1px solid #d9d9d9",
                      borderRadius: 4,
                      backgroundColor: request.modelsData ? "#f6ffed" : "#fff",
                    }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <Text strong>{request.method}</Text>
                      <Text code style={{ marginLeft: 8 }}>
                        {request.url.substring(0, 100)}...
                      </Text>
                      <Tag
                        style={{ marginLeft: 8 }}
                        color={request.responseStatus === 200 ? "green" : "red"}
                      >
                        Status: {request.responseStatus}
                      </Tag>
                      <Tag color={request.completed ? "blue" : "orange"}>
                        {request.completed ? "Completed" : "Pending"}
                      </Tag>
                      {request.modelsData && (
                        <Tag color="green" style={{ marginLeft: 4 }}>
                          Models:{" "}
                          {Array.isArray(request.modelsData)
                            ? request.modelsData.length
                            : "Available"}
                        </Tag>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      Source: {request.source} | Time:{" "}
                      {new Date(request.timestamp).toLocaleString("vi-VN")} |
                      Tab: {request.tabId}
                    </div>
                    {request.modelsData && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: "11px",
                          backgroundColor: "#f0f0f0",
                          padding: 4,
                          borderRadius: 2,
                          maxHeight: "80px",
                          overflow: "auto",
                        }}
                      >
                        <Text strong>Models Preview:</Text>
                        <pre style={{ margin: 0 }}>
                          {JSON.stringify(
                            Array.isArray(request.modelsData)
                              ? request.modelsData.slice(0, 2)
                              : request.modelsData,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}
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
              onChange={(dates) => handleFilterChange("dateRange", dates)}
              style={{ width: "100%" }}
              placeholder={["Từ ngày", "Đến ngày"]}
            />
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Link:</Text>
            </div>
            <Select
              value={filter.linkId}
              onChange={(value) => handleFilterChange("linkId", value)}
              style={{ width: "100%" }}
              placeholder="Chọn link"
              allowClear
            >
              {links.map((link) => (
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
              onChange={(value) => handleFilterChange("scheduleId", value)}
              style={{ width: "100%" }}
              placeholder="Chọn schedule"
              allowClear
            >
              {schedules.map((schedule) => (
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
              onChange={(value) => handleFilterChange("status", value)}
              style={{ width: "100%" }}
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
            <Statistic
              title="Thành công"
              value={stats.successful}
              valueStyle={{ color: "#3f8600" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Thất bại"
              value={stats.failed}
              valueStyle={{ color: "#cf1322" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Tỷ lệ thành công"
              value={stats.successRate}
              suffix="%"
              valueStyle={{
                color:
                  stats.successRate > 90
                    ? "#3f8600"
                    : stats.successRate > 70
                    ? "#fa8c16"
                    : "#cf1322",
              }}
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
            onExpand: handleRowExpand,
          }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} của ${total} bản ghi`,
          }}
        />
      </Card>
    </div>
  );
};

export default Report;
