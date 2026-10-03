import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, DatePicker, Form, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { CatalogProduct, ProdOrderLineView, ProductionOrder } from '../api/types';

const STATUSES = ['planned', 'released', 'in_production', 'qc', 'packed', 'dispatched', 'cancelled'];

export default function ProductionPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([api.productionOrders(), api.catalogProducts('', '')]);
      setOrders(o.items);
      setProducts(p.items);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load production data');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = (v: { product_id: number; qty: number; due?: { format: (fmt: string) => string } }) => {
    api
      .createProductionOrder({
        product_id: v.product_id,
        qty: v.qty,
        due_date: v.due ? v.due.format('YYYY-MM-DD') : undefined,
      })
      .then(() => {
        message.success('Production order created');
        setOpen(false);
        form.resetFields();
        void load();
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Create failed'));
  };

  const columns: TableProps<ProductionOrder>['columns'] = [
    { title: 'Order', dataIndex: 'order_no', width: 130 },
    { title: 'Product', dataIndex: 'product_name' },
    { title: 'Qty', dataIndex: 'qty', width: 80, align: 'right' },
    { title: 'Due date', dataIndex: 'due_date', width: 110, render: (v: string | null) => v ?? '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      render: (v: string) => <StatusTag status={v} />,
    },
    {
      title: 'Actions',
      width: 320,
      render: (_, r) => (
        <Space>
          {r.status === 'planned' ? (
            <Button
              size="small"
              type="primary"
              onClick={() =>
                api
                  .releaseProductionOrder(r.id)
                  .then(() => {
                    message.success(`${r.order_no} released`);
                    void load();
                  })
                  .catch((e) => message.error(e instanceof Error ? e.message : 'Release failed'))
              }
            >
              Release
            </Button>
          ) : null}
          {['planned', 'released'].includes(r.status) ? (
            <Button
              size="small"
              onClick={() =>
                api
                  .issueProductionMaterial(r.id)
                  .then(() => {
                    message.success(`Material issued on ${r.order_no}`);
                    void load();
                  })
                  .catch((e) => message.error(e instanceof Error ? e.message : 'Issue failed'))
              }
            >
              Issue material
            </Button>
          ) : null}
          {r.status !== 'cancelled' ? (
            <Select
              size="small"
              style={{ width: 120 }}
              value={r.status}
              onChange={(s) =>
                api
                  .setProductionStatus(r.id, s)
                  .then(() => {
                    message.success(`${r.order_no} → ${s}`);
                    void load();
                  })
                  .catch((e) => message.error(e instanceof Error ? e.message : 'Status update failed'))
              }
              options={STATUSES.map((s) => ({ value: s, label: s }))}
            />
          ) : null}
        </Space>
      ),
    },
  ];

  const expandedRow = (r: ProductionOrder) => (
    <Table<ProdOrderLineView>
      rowKey="item_id"
      size="small"
      pagination={false}
      dataSource={r.lines}
      columns={[
        { title: 'Item', dataIndex: 'code', width: 160 },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Plan', dataIndex: 'plan_qty', width: 90, align: 'right' },
        { title: 'Issued', dataIndex: 'issued_qty', width: 90, align: 'right' },
        {
          title: 'Pending',
          dataIndex: 'pending',
          width: 90,
          align: 'right',
          render: (v: number) => (v > 0 ? <Tag color="orange">{v}</Tag> : 0),
        },
      ]}
    />
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Production orders</h2>
        <Space>
          <a onClick={() => void load()}>
            <ReloadOutlined /> Refresh
          </a>
          <Button type="primary" onClick={() => setOpen(true)}>
            New production order
          </Button>
        </Space>
      </div>

      <Card>
        <Table<ProductionOrder>
          rowKey="id"
          columns={columns}
          expandable={{ expandedRowRender: expandedRow }}
          dataSource={orders}
          loading={loading}
          size="middle"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal title="New production order" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} okText="Create">
        <Form form={form} layout="vertical" onFinish={create}>
          <Form.Item name="product_id" label="Product" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Select product" options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.model_code})` }))} />
          </Form.Item>
          <Form.Item name="qty" label="Quantity" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="due" label="Due date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const color: Record<string, string> = {
    planned: 'default',
    released: 'blue',
    in_production: 'geekblue',
    qc: 'purple',
    packed: 'gold',
    dispatched: 'green',
    cancelled: 'red',
  };
  return <Tag color={color[status] ?? 'default'}>{status.toUpperCase()}</Tag>;
}