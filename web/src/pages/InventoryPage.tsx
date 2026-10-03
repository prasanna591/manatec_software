import { useCallback, useEffect, useState } from 'react';
import { App, Badge, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { InventoryLedgerRow, StockAlert, StockRow } from '../api/types';

export default function InventoryPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementOpen, setMovementOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.inventoryStock();
      setStock(r.items);
      setAlerts(r.alerts.items);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = stock.reduce(
    (acc, r) => ({
      value: acc.value + r.stock_value,
      below: acc.below + (r.below_min ? 1 : 0),
    }),
    { value: 0, below: 0 },
  );

  const columns: TableProps<StockRow>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 160 },
    { title: 'Description', dataIndex: 'description' },
    { title: 'On hand', dataIndex: 'on_hand', width: 90, align: 'right' },
    { title: 'In transit', dataIndex: 'in_transit', width: 90, align: 'right' },
    { title: 'Committed', dataIndex: 'committed', width: 100, align: 'right' },
    {
      title: 'Available',
      dataIndex: 'available',
      width: 100,
      align: 'right',
      render: (v: number) => <b style={{ color: v < 0 ? '#cf1322' : '#111' }}>{v}</b>,
    },
    { title: 'Unit cost', dataIndex: 'unit_cost', width: 100, align: 'right', render: (v: number) => `₹${v}` },
    { title: 'Stock value', dataIndex: 'stock_value', width: 120, align: 'right', render: (v: number) => `₹${v.toLocaleString()}` },
    {
      title: 'Reorder',
      width: 90,
      align: 'center',
      render: (_, r) =>
        r.below_min ? (
          <Tag color="red">Low</Tag>
        ) : r.min_qty > 0 ? (
          <Tag color="green">OK</Tag>
        ) : (
          <Tag>—</Tag>
        ),
    },
  ];

  const submitMovement = (v: { item_id?: number; item_code?: string; qty_delta: number; note?: string; trans_type?: string }) => {
    if (!v.item_id && !v.item_code) {
      message.warning('Pick an item (code or id)');
      return;
    }
    api
      .inventoryMovement({
        qty_delta: v.qty_delta,
        item_id: v.item_id || undefined,
        item_code: v.item_code || undefined,
        note: v.note,
        trans_type: v.trans_type,
      })
      .then(() => {
        message.success('Movement posted');
        setMovementOpen(false);
        form.resetFields();
        void load();
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Post failed'));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Part inventory</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            Refresh
          </Button>
          <Button type="primary" onClick={() => setMovementOpen(true)}>
            Post movement
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Card size="small">Total stock value: <b>₹{totals.value.toLocaleString()}</b></Card>
        <Card size="small">Items below reorder: <Badge count={totals.below} color={totals.below ? 'red' : 'green'} /></Card>
      </div>

      <Tabs
        items={[
          {
            key: 'stock',
            label: `Stock (${stock.length})`,
            children: (
              <Card>
                <Table<StockRow> rowKey="item_id" columns={columns} dataSource={stock} loading={loading} size="middle" pagination={{ pageSize: 20 }} />
              </Card>
            ),
          },
          {
            key: 'alerts',
            label: `Low-stock alerts (${alerts.length})`,
            children: <AlertsTab alerts={alerts} />,
          },
          { key: 'ledger', label: 'Ledger', children: <LedgerTab /> },
        ]}
      />

      <Modal title="Post stock movement" open={movementOpen} onOk={() => form.submit()} onCancel={() => setMovementOpen(false)} okText="Post">
        <Form form={form} layout="vertical" onFinish={submitMovement}>
          <Form.Item name="item_id" label="Item ID">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="item_code" label="…or item code">
            <Input />
          </Form.Item>
          <Form.Item name="qty_delta" label="Quantity delta (+ receive / − issue)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="trans_type" label="Transaction type" initialValue="adj">
            <Select options={['adj', 'grn', 'issue', 'sale'].map((t) => ({ value: t, label: t.toUpperCase() }))} />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function AlertsTab({ alerts }: { alerts: StockAlert[] }) {
  const columns: TableProps<StockAlert>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 160 },
    { title: 'Description', dataIndex: 'description' },
    { title: 'On hand', dataIndex: 'on_hand', width: 90, align: 'right' },
    { title: 'Reorder level', dataIndex: 'min_qty', width: 110, align: 'right' },
    { title: 'Short', dataIndex: 'short', width: 90, align: 'right', render: (v: number) => <Tag color="red">{v}</Tag> },
  ];
  return <Card><Table<StockAlert> rowKey="item_id" columns={columns} dataSource={alerts} size="middle" pagination={false} /></Card>;
}

function LedgerTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<InventoryLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .inventoryLedger(undefined, 200)
      .then((r) => setRows(r.items))
      .catch((e) => message.error(e instanceof Error ? e.message : 'Failed to load ledger'))
      .finally(() => setLoading(false));
  }, [message]);

  const columns: TableProps<InventoryLedgerRow>['columns'] = [
    { title: 'When', dataIndex: 'created_at', width: 180, render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Code', dataIndex: 'code', width: 160 },
    { title: 'Description', dataIndex: 'description' },
    { title: 'Type', dataIndex: 'trans_type', width: 100, render: (v: string) => <Tag color={v === 'issue' ? 'orange' : 'blue'}>{v.toUpperCase()}</Tag> },
    { title: 'Delta', dataIndex: 'qty_delta', width: 90, align: 'right', render: (v: number) => <b>{v > 0 ? `+${v}` : v}</b> },
    { title: 'Note', dataIndex: 'note' },
  ];

  return <Card><Table<InventoryLedgerRow> rowKey="id" columns={columns} dataSource={rows} loading={loading} size="middle" pagination={{ pageSize: 30 }} /></Card>;
}