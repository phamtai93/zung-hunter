import React from "react";
import { Modal, Form, Input, Switch, message, Alert, Typography } from "antd";
import { Link } from "../../types";
import { LinkRepository } from "../../storage/repositories";
import { URLParser } from "../../utils/url-parser";

const { Text } = Typography;

interface LinkFormProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  editingLink?: Link | null;
}

const LinkForm: React.FC<LinkFormProps> = ({
  open,
  onCancel,
  onSuccess,
  editingLink,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [urlInfo, setUrlInfo] = React.useState<{
    shopId?: string;
    productId?: string;
    isProductUrl: boolean;
  }>({ isProductUrl: false });

  React.useEffect(() => {
    if (open && editingLink) {
      form.setFieldsValue({
        name: editingLink.name,
        url: editingLink.url,
        enabled: editingLink.enabled,
      });

      // Parse URL info for existing link
      const parsed = URLParser.parseProductUrl(editingLink.url);
      setUrlInfo({
        ...parsed,
        isProductUrl: URLParser.isProductUrl(editingLink.url),
      });
    } else if (open) {
      form.resetFields();
      form.setFieldsValue({ enabled: true });
      setUrlInfo({ isProductUrl: false });
    }
  }, [open, editingLink, form]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    if (url) {
      const parsed = URLParser.parseProductUrl(url);
      setUrlInfo({
        ...parsed,
        isProductUrl: URLParser.isProductUrl(url),
      });
    } else {
      setUrlInfo({ isProductUrl: false });
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // Parse URL for shopId and productId
      const parsed = URLParser.parseProductUrl(values.url);

      const linkData = {
        ...values,
        shopId: parsed.shopId,
        productId: parsed.productId,
      };

      if (editingLink) {
        await LinkRepository.update(editingLink.id, linkData);
        message.success("Link updated successfully");
      } else {
        await LinkRepository.create(linkData);
        message.success("Link created successfully");
      }
      onSuccess();
      onCancel();
    } catch (error) {
      message.error("Failed to save link");
      console.error("Error saving link:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateURL = (_: any, value: string) => {
    if (!value) return Promise.reject("URL is required");

    try {
      new URL(value);
      return Promise.resolve();
    } catch {
      return Promise.reject("Please enter a valid URL");
    }
  };

  return (
    <Modal
      title={editingLink ? "Edit Link" : "Add New Link"}
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
          label="Name"
          rules={[
            { required: true, message: "Name is required" },
            { min: 2, message: "Name must be at least 2 characters" },
          ]}
        >
          <Input placeholder="Enter link name" />
        </Form.Item>

        <Form.Item
          name="url"
          label="URL"
          rules={[
            { required: true, message: "URL is required" },
            { validator: validateURL },
          ]}
        >
          <Input
            placeholder="https://example.com/product-name-i.shopId.productId"
            onChange={handleUrlChange}
          />
        </Form.Item>

        {/* URL Parse Info */}
        {urlInfo.isProductUrl && (
          <Alert
            type="success"
            showIcon
            message="Product URL Detected"
            description={
              <div className="space-y-1">
                <Text>
                  <strong>Shop ID:</strong> {urlInfo.shopId}
                </Text>
                <br />
                <Text>
                  <strong>Product ID:</strong> {urlInfo.productId}
                </Text>
              </div>
            }
            className="mb-4"
          />
        )}

        {form.getFieldValue("url") && !urlInfo.isProductUrl && (
          <Alert
            type="info"
            message="Regular URL"
            description={
              <div>
                <Text>This URL will be processed as a regular link.</Text>
                <br />
                <Text type="secondary" className="text-xs">
                  Supported product URL patterns:
                </Text>
                <ul className="text-xs text-gray-500 mt-1">
                  {URLParser.getSupportedPatterns().map((pattern, index) => (
                    <li key={index}>• {pattern}</li>
                  ))}
                </ul>
              </div>
            }
            className="mb-4"
          />
        )}

        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default LinkForm;
