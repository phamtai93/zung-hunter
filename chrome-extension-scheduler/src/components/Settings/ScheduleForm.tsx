// src/components/Settings/ScheduleForm.tsx
import React from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  Switch,
  message,
  Alert,
} from "antd";
import { Schedule } from "../../types";
import { ScheduleRepository } from "../../storage/repositories";
import { SchedulerEngine } from "../../utils/scheduler-engine";
import { DEFAULT_CRON_EXPRESSIONS } from "../../utils/constants";

const { Option } = Select;

interface ScheduleFormProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  linkId: string;
  editingSchedule?: Schedule | null;
}

const ScheduleForm: React.FC<ScheduleFormProps> = ({
  open,
  onCancel,
  onSuccess,
  linkId,
  editingSchedule,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [scheduleType, setScheduleType] = React.useState<
    "cron" | "interval" | "once"
  >("once"); // Changed default
  const [cronError, setCronError] = React.useState<string>("");

  React.useEffect(() => {
    if (open && editingSchedule) {
      form.setFieldsValue({
        name: editingSchedule.name,
        type: editingSchedule.type,
        cronExpression: editingSchedule.cronExpression,
        intervalMinutes: editingSchedule.intervalMinutes,
        oneTimeDate: editingSchedule.oneTimeDate
          ? new Date(editingSchedule.oneTimeDate)
          : null,
        quantity: editingSchedule.quantity || 1, // Default to 1 if not set
        enabled: editingSchedule.enabled,
      });
      setScheduleType(editingSchedule.type);
    } else if (open) {
      form.resetFields();
      form.setFieldsValue({
        enabled: true,
        type: "once", // Changed default from 'interval' to 'once'
        quantity: 1, // Default quantity
        oneTimeDate: null, // Default to null for once type
      });
      setScheduleType("once"); // Changed default
    }
  }, [open, editingSchedule, form]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // Calculate next run time
      const scheduleData = {
        linkId,
        name: values.name,
        type: values.type,
        cronExpression: values.cronExpression,
        intervalMinutes: values.intervalMinutes,
        oneTimeDate: values.oneTimeDate,
        quantity: values.quantity || 1, // Ensure quantity has a default value
        enabled: values.enabled,
        nextRun: new Date(), // Will be calculated properly
      };

      // Calculate actual next run
      try {
        scheduleData.nextRun = SchedulerEngine.calculateNextRun(
          scheduleData as Schedule
        );
      } catch (error) {
        message.error(
          `Invalid schedule configuration: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        setLoading(false);
        return;
      }

      if (editingSchedule) {
        await ScheduleRepository.update(editingSchedule.id, scheduleData);
        message.success("Schedule updated successfully");
      } else {
        await ScheduleRepository.create(scheduleData);
        message.success("Schedule created successfully");
      }

      onSuccess();
      onCancel();
    } catch (error) {
      message.error("Failed to save schedule");
      console.error("Error saving schedule:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateCronExpression = async (_: any, value: string) => {
    if (scheduleType !== "cron") return Promise.resolve();
    if (!value) return Promise.reject("Cron expression is required");

    if (!SchedulerEngine.validateCronExpression(value)) {
      setCronError("Invalid cron expression format");
      return Promise.reject("Invalid cron expression format");
    }

    setCronError("");
    return Promise.resolve();
  };

  const handleTypeChange = (value: "cron" | "interval" | "once") => {
    setScheduleType(value);
    setCronError("");

    // Reset type-specific fields and set defaults
    if (value === "interval") {
      form.setFieldValue("intervalMinutes", 60);
      form.setFieldValue("oneTimeDate", null);
    } else if (value === "once") {
      form.setFieldValue("intervalMinutes", null);
      form.setFieldValue("cronExpression", null);
      // Set default to 5 minutes from now if no date set
      if (!form.getFieldValue("oneTimeDate")) {
        const defaultDate = new Date();
        defaultDate.setMinutes(defaultDate.getMinutes() + 5);
        form.setFieldValue("oneTimeDate", defaultDate);
      }
    } else if (value === "cron") {
      form.setFieldValue("intervalMinutes", null);
      form.setFieldValue("oneTimeDate", null);
    }
  };

  const cronPresets = [
    { label: "Every minute", value: DEFAULT_CRON_EXPRESSIONS.EVERY_MINUTE },
    { label: "Every hour", value: DEFAULT_CRON_EXPRESSIONS.EVERY_HOUR },
    { label: "Daily at 9 AM", value: DEFAULT_CRON_EXPRESSIONS.EVERY_DAY },
    {
      label: "Weekly (Monday 9 AM)",
      value: DEFAULT_CRON_EXPRESSIONS.EVERY_WEEK,
    },
    {
      label: "Monthly (1st day 9 AM)",
      value: DEFAULT_CRON_EXPRESSIONS.EVERY_MONTH,
    },
  ];

  return (
    <Modal
      title={editingSchedule ? "Edit Schedule" : "Add New Schedule"}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnClose
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        preserve={false}
      >
        <Form.Item
          name="name"
          label="Schedule Name"
          rules={[
            { required: true, message: "Schedule name is required" },
            { min: 2, message: "Name must be at least 2 characters" },
          ]}
        >
          <Input placeholder="Enter schedule name" />
        </Form.Item>

        <Form.Item
          name="type"
          label="Schedule Type"
          rules={[{ required: true, message: "Schedule type is required" }]}
        >
          <Select
            onChange={handleTypeChange}
            placeholder="Select schedule type"
          >
            <Option value="once">One Time (Run once at specific time)</Option>
            <Option value="interval">Interval (Repeat every X minutes)</Option>
            <Option value="cron">Cron Expression (Advanced scheduling)</Option>
          </Select>
        </Form.Item>

        {scheduleType === "once" && (
          <Form.Item
            name="oneTimeDate"
            label="Execution Date & Time"
            rules={[
              { required: true, message: "Execution date is required" },
              {
                validator: (_, value) => {
                  if (value && value.isBefore(new Date())) {
                    return Promise.reject(
                      "Execution time must be in the future"
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: "100%" }}
              placeholder="Select date and time"
              showNow={false}
            />
          </Form.Item>
        )}

        {scheduleType === "interval" && (
          <Form.Item
            name="intervalMinutes"
            label="Interval (Minutes)"
            rules={[
              { required: true, message: "Interval is required" },
              {
                type: "number",
                min: 1,
                message: "Interval must be at least 1 minute",
              },
            ]}
          >
            <InputNumber
              min={1}
              max={60 * 24 * 7} // Max 1 week
              placeholder="60"
              style={{ width: "100%" }}
              addonAfter="minutes"
            />
          </Form.Item>
        )}

        {scheduleType === "cron" && (
          <>
            <Form.Item
              name="cronExpression"
              label="Cron Expression"
              rules={[{ validator: validateCronExpression }]}
              help={cronError || "Format: minute hour day month weekday"}
            >
              <Input placeholder="0 9 * * 1-5" />
            </Form.Item>

            <Form.Item label="Quick Presets">
              <Select
                placeholder="Select a preset"
                allowClear
                onChange={(value) =>
                  form.setFieldValue("cronExpression", value)
                }
              >
                {cronPresets.map((preset) => (
                  <Option key={preset.value} value={preset.value}>
                    {preset.label} ({preset.value})
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Alert
              type="info"
              message="Cron Expression Help"
              description={
                <div className="text-xs">
                  <div>* * * * * = minute hour day month weekday</div>
                  <div>Examples:</div>
                  <div>• "0 9 * * 1-5" = 9 AM on weekdays</div>
                  <div>• "*/30 * * * *" = Every 30 minutes</div>
                  <div>• "0 0 1 * *" = First day of every month</div>
                </div>
              }
              className="mb-4"
            />
          </>
        )}

        {/* Quantity Field - Always visible */}
        <Form.Item
          name="quantity"
          label="Quantity"
          rules={[
            { required: true, message: "Quantity is required" },
            {
              type: "number",
              min: 1,
              max: 10000,
              message: "Quantity must be between 1 and 10,000",
            },
          ]}
          tooltip="Number of items to process in this execution"
        >
          <InputNumber
            min={1}
            max={10000}
            placeholder="1"
            style={{ width: "100%" }}
            addonAfter="items"
          />
        </Form.Item>

        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ScheduleForm;
