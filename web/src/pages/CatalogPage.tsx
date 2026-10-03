import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Table, Tabs, Tag } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { CatalogItem, CatalogProduct, Supplier } from '../api/types';

export default function CatalogPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, cats] = await Promise.all([api.catalogProducts('', ''), api.catalogCategories()]);
      setProducts(p.items);
      setCategories(cats.items);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load catalogue');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Product catalogue</h2>
        <a onClick={() => void load()}>
          <ReloadOutlined /> Refresh
        </a>
      </div>

      <Tabs
        items={[
          {
            key: 'products',
            label: `Products (${products.length})`,
            children: <ProductsTab products={products} categories={categories} loading={loading} />,
          },
          { key: 'items', label: 'Item master', children: <ItemsTab /> },
          { key: 'suppliers', label: `Suppliers (${suppliers.length})`, children: <SuppliersTab onLoaded={setSuppliers} /> },
        ]}
      />
    </div>
  );
}

function ProductsTab({ products, categories, loading }: { products: CatalogProduct[]; categories: string[]; loading: boolean }) {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState(products);
  const [busy, setBusy] = useState(loading);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.catalogProducts(q, category);
      setRows(r.items);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to filter products');
    } finally {
      setBusy(false);
    }
  }, [q, category, message, signOut]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [q, category, load]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search products…"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Select
          placeholder="All categories"
          allowClear
          style={{ width: 260 }}
          value={category || undefined}
          onChange={(v) => setCategory(v ?? '')}
          options={categories.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <Card loading={busy}>
        {rows.length === 0 ? (
          <Tag>No products</Tag>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {rows.map((p) => (
              <Card
                key={p.id}
                size="small"
                hoverable
                cover={
                  p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      style={{ height: 150, objectFit: 'contain', padding: 8, background: '#fafafa' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        height: 150,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#fafafa',
                        color: '#bbb',
                      }}
                    >
                      No image
                    </div>
                  )
                }
              >
                <Card.Meta
                  title={<div style={{ fontSize: 13 }}>{p.name}</div>}
                  description={
                    <>
                      <Tag>{p.category || 'uncategorised'}</Tag>
                      <div style={{ fontWeight: 600, color: '#111' }}>₹{p.price_raw || p.price_value}</div>
                    </>
                  }
                />
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ItemsTab() {
  const { message } = App.useApp();
  const [q, setQ] = useState('');
  const [data, setData] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.catalogItems(q);
      setData(r.items);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [q, message]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [q, load]);

  const createItem = (body: Record<string, unknown>) => {
    api
      .createItem(body)
      .then(() => {
        message.success('Item created');
        setOpen(false);
        form.resetFields();
        void load();
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Create failed'));
  };

  const columns: TableProps<CatalogItem>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 160 },
    { title: 'Description', dataIndex: 'description' },
    { title: 'Class', dataIndex: 'source_class', width: 90, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Lead time', width: 110, render: (_, r) => `${r.lead_time_days_min}–${r.lead_time_days_max}d` },
    { title: 'On hand', dataIndex: 'on_hand', width: 90, align: 'right' },
    { title: 'Available', dataIndex: 'available', width: 90, align: 'right', render: (v?: number) => <b>{v ?? '-'}</b> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search item code…"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <Button type="primary" onClick={() => setOpen(true)}>
          New item
        </Button>
      </div>
      <Table<CatalogItem> rowKey="id" columns={columns} dataSource={data} loading={loading} size="middle" pagination={{ pageSize: 20 }} />
      <Modal title="New item" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} okText="Create">
        <Form form={form} layout="vertical" onFinish={createItem}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="source_class" label="Lead-time class" initialValue="medium">
            <Select options={['import', 'long', 'medium', 'short', 'fabricated'].map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="lead_time_days_min" label="Lead time min (days)" initialValue={10}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="lead_time_days_max" label="Lead time max (days)" initialValue={20}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="min_qty" label="Reorder level (min qty)" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="uom" label="UOM" initialValue="pcs">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function SuppliersTab({ onLoaded }: { onLoaded: (rows: Supplier[]) => void }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.catalogSuppliers();
      setData(r.items);
      onLoaded(r.items);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [message, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: TableProps<Supplier>['columns'] = [
    { title: 'Supplier', dataIndex: 'name' },
    { title: 'Contact', dataIndex: 'contact', width: 220 },
    { title: 'Lead time', dataIndex: 'lead_time_days_default', width: 100, render: (v: number) => `${v}d` },
    { title: 'Rating', dataIndex: 'rating', width: 90, render: (v: number) => '★'.repeat(v) || '—' },
    {
      title: 'Status',
      dataIndex: 'is_active',
      width: 90,
      render: (v: boolean) => (v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" onClick={() => setOpen(true)}>
          New supplier
        </Button>
      </div>
      <Table<Supplier> rowKey="id" columns={columns} dataSource={data} loading={loading} size="middle" pagination={{ pageSize: 10 }} />
      <Modal title="New supplier" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} okText="Create">
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) =>
            api
              .createSupplier(v)
              .then(() => {
                message.success('Supplier created');
                setOpen(false);
                form.resetFields();
                void load();
              })
              .catch((e) => message.error(e instanceof Error ? e.message : 'Create failed'))
          }
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contact" label="Contact">
            <Input />
          </Form.Item>
          <Form.Item name="lead_time_days_default" label="Default lead time (days)" initialValue={20}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rating" label="Rating (1–5)" initialValue={3}>
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}