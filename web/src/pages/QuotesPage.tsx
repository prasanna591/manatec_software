import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { CatalogProduct, Quote } from '../api/types';

export default function QuotesPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, p] = await Promise.all([api.quotes(), api.catalogProducts('', '')]);
      setQuotes(q.items);
      setProducts(p.items);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = (v: { product_id: number; qty: number; customer_name?: string; customer_phone?: string; unit_price?: number; notes?: string }) => {
    api
      .createQuote({
        product_id: v.product_id,
        qty: v.qty,
        customer_name: v.customer_name,
        customer_phone: v.customer_phone,
        unit_price: v.unit_price ?? null,
        notes: v.notes,
      })
      .then(() => {
        message.success('Quote created with ATP-based delivery date');
        setOpen(false);
        form.resetFields();
        void load();
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Create failed'));
  };

  const columns: TableProps<Quote>['columns'] = [
    { title: 'Quote', dataIndex: 'quote_no', width: 120 },
    { title: 'Customer', dataIndex: 'customer_name', render: (v: string) => v || '—' },
    { title: 'Product', dataIndex: 'product_name' },
    { title: 'Qty', dataIndex: 'qty', width: 70, align: 'right' },
    { title: 'Total', dataIndex: 'total_value', width: 110, align: 'right', render: (v: number) => `₹${v.toLocaleString()}` },
    {
      title: 'Promised',
      dataIndex: 'promised_date',
      width: 110,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Availability',
      width: 140,
      render: (_, r) =>
        r.availability.buildable_from_stock ? (
          <Tag color="green">from stock</Tag>
        ) : (
          <Tag color="orange">+{r.availability.max_lead_days}d lead</Tag>
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (v: string) => (
        <Tag color={v === 'confirmed' ? 'green' : v === 'expired' ? 'red' : 'blue'}>{v.toUpperCase()}</Tag>
      ),
    },
    {
      title: '',
      width: 100,
      render: (_, r) =>
        r.status !== 'confirmed' ? (
          <Button
            size="small"
            type="primary"
            onClick={() =>
              api
                .confirmQuote(r.id)
                .then((res) => {
                  message.success(`Quote ${r.quote_no} confirmed → ${res.order_no}`);
                  void load();
                })
                .catch((e) => message.error(e instanceof Error ? e.message : 'Confirm failed'))
            }
          >
            Confirm
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Sales quotes</h2>
        <Space>
          <a onClick={() => void load()}>
            <ReloadOutlined /> Refresh
          </a>
          <Button type="primary" onClick={() => setOpen(true)}>
            New quote
          </Button>
        </Space>
      </div>

      <Card>
        <Table<Quote> rowKey="id" columns={columns} dataSource={quotes} loading={loading} size="middle" pagination={{ pageSize: 10 }} />
      </Card>

      <Modal title="New quote" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} okText="Create quote">
        <Form form={form} layout="vertical" onFinish={create}>
          <Form.Item name="product_id" label="Product" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Select product" options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.model_code})` }))} />
          </Form.Item>
          <Form.Item name="qty" label="Quantity" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit_price" label="Unit price (blank = catalogue price)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="customer_name" label="Customer name">
            <Input />
          </Form.Item>
          <Form.Item name="customer_phone" label="Customer phone">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}