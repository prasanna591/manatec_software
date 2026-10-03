import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tag } from 'antd';
import type { TableProps, FormInstance } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { BuyList, BuyListRow, CatalogProduct, PoLineView, PurchaseOrder, Supplier } from '../api/types';

export default function ProcurementPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [buyProduct, setBuyProduct] = useState<number | null>(null);
  const [buyQty, setBuyQty] = useState(1);
  const [buyList, setBuyList] = useState<BuyList | null>(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [poForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, po] = await Promise.all([api.catalogProducts('', ''), api.catalogSuppliers(), api.purchaseOrders()]);
      setProducts(p.items);
      setSuppliers(s.items);
      setPos(po.items);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load procurement data');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const runBuyList = () => {
    if (!buyProduct) {
      message.warning('Pick a product first');
      return;
    }
    setBuyLoading(true);
    api
      .buyList(buyProduct, buyQty)
      .then((r) => {
        setBuyList(r);
        if (r.rows.length === 0) message.success('No shortages — target is buildable from stock');
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Buy-list failed'))
      .finally(() => setBuyLoading(false));
  };

  const openCreatePo = () => {
    const lines = buyList?.rows.map((r) => ({ item_id: r.item_id, qty: Math.max(Math.ceil(r.qty_short), 1), unit_price: r.unit_cost })) ?? [];
    poForm.setFieldsValue({ supplier_id: lines.length ? buyList?.rows[0]?.supplier_id : undefined, lines, note: '' });
    setPoOpen(true);
  };

  const poColumns: TableProps<PurchaseOrder>['columns'] = [
    { title: 'PO number', dataIndex: 'po_no', width: 130 },
    { title: 'Supplier', dataIndex: 'supplier_name' },
    { title: 'Status', dataIndex: 'status', width: 110, render: (v: string) => <PoTag status={v} /> },
    { title: 'ETA', dataIndex: 'expected_delivery_date', width: 110, render: (v: string | null, r) => (r.overdue ? <Tag color="red">{v}</Tag> : v ?? '—') },
    { title: 'Value', dataIndex: 'total_value', width: 120, align: 'right', render: (v: number) => `₹${v.toLocaleString()}` },
    {
      title: 'Actions',
      width: 220,
      render: (_, r) => (
        <Space>
          {r.status === 'draft' ? (
            <Button
              size="small"
              type="primary"
              onClick={() =>
                api
                  .issuePurchaseOrder(r.id)
                  .then(() => {
                    message.success(`PO ${r.po_no} issued`);
                    reload();
                  })
                  .catch((e) => message.error(e instanceof Error ? e.message : 'Action failed'))
              }
            >
              Issue
            </Button>
          ) : null}
          {['issued', 'partial'].includes(r.status) ? <ReceiveButton po={r} onDone={reload} /> : null}
          {['draft', 'issued'].includes(r.status) ? (
            <Button
              size="small"
              onClick={() =>
                api
                  .cancelPurchaseOrder(r.id)
                  .then(() => {
                    message.success(`PO ${r.po_no} cancelled`);
                    reload();
                  })
                  .catch((e) => message.error(e instanceof Error ? e.message : 'Cancel failed'))
              }
            >
              Cancel
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  function reload() {
    api
      .purchaseOrders()
      .then((r) => setPos(r.items))
      .catch((e) => message.error(e instanceof Error ? e.message : 'Reload failed'));
  }

  const expandedRow = (r: PurchaseOrder) => (
    <Table<PoLineView>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={r.lines}
      columns={[
        { title: 'Item', dataIndex: 'code', width: 160 },
        { title: 'Description', dataIndex: 'description' },
        { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right' },
        { title: 'Unit price', dataIndex: 'unit_price', width: 100, align: 'right', render: (v: number) => `₹${v}` },
        { title: 'Received', dataIndex: 'received_qty', width: 90, align: 'right' },
        { title: 'Remaining', dataIndex: 'remaining', width: 90, align: 'right' },
      ]}
    />
  );

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Procurement</h2>
        <a onClick={() => void load()}>
          <ReloadOutlined /> Refresh
        </a>
      </Row>

      <Card title="Shortage buy-list" style={{ marginBottom: 16 }}>
        <Row gutter={8} align="middle">
          <Col>
            <Select
              placeholder="Select product"
              showSearch
              optionFilterProp="label"
              style={{ width: 320 }}
              value={buyProduct ?? undefined}
              onChange={setBuyProduct}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Col>
          <Col>
            <InputNumber min={1} value={buyQty} onChange={(v) => setBuyQty(v ?? 1)} addonBefore="target qty" />
          </Col>
          <Col>
            <Button type="primary" loading={buyLoading} onClick={runBuyList}>
              Compute buy-list
            </Button>
          </Col>
          <Col flex="auto" />
          {buyList && (
            <Col>
              <Space>
                <Tag color={buyList.ok_for_target ? 'green' : 'red'}>{buyList.ok_for_target ? 'buildable now' : 'short'}</Tag>
                <span>Total: <b>₹{buyList.total_value.toLocaleString()}</b></span>
                <Button onClick={openCreatePo} disabled={buyList.rows.length === 0}>
                  Create PO from rows
                </Button>
              </Space>
            </Col>
          )}
        </Row>
        {buyList && (
          <Table<BuyListRow>
            rowKey="item_id"
            style={{ marginTop: 12 }}
            size="middle"
            pagination={false}
            dataSource={buyList.rows}
            columns={[
              { title: 'Code', dataIndex: 'code', width: 160 },
              { title: 'Description', dataIndex: 'description' },
              { title: 'Qty short', dataIndex: 'qty_short', width: 90, align: 'right' },
              { title: 'Unit cost', dataIndex: 'unit_cost', width: 100, align: 'right', render: (v: number) => `₹${v}` },
              { title: 'Value', dataIndex: 'value', width: 110, align: 'right', render: (v: number) => `₹${v.toLocaleString()}` },
              { title: 'Lead', width: 80, render: (_, r) => `${r.lead_days_min}–${r.lead_days_max}d` },
              { title: 'Supplier', dataIndex: 'supplier_name' },
            ]}
          />
        )}
      </Card>

      <Card title={`Purchase orders (${pos.length})`}>
        <Table<PurchaseOrder>
          rowKey="id"
          columns={poColumns}
          expandable={{ expandedRowRender: expandedRow }}
          dataSource={pos}
          loading={loading}
          size="middle"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <CreatePoModal open={poOpen} onClose={() => setPoOpen(false)} suppliers={suppliers} form={poForm} onDone={() => { setPoOpen(false); reload(); }} />
    </div>
  );
}

function PoTag({ status }: { status: string }) {
  const color =
    status === 'completed' ? 'green' : status === 'cancelled' ? 'default' : status === 'draft' ? 'default' : status === 'partial' ? 'orange' : 'blue';
  return <Tag color={color}>{status.toUpperCase()}</Tag>;
}

function ReceiveButton({ po, onDone }: { po: PurchaseOrder; onDone: () => void }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  const submit = () => {
    const lines = po.lines.filter((l) => l.remaining > 0).map((l) => ({ line_id: l.id, qty: values[l.id] ?? l.remaining }));
    setSaving(true);
    api
      .receivePurchaseOrder(po.id, lines)
      .then(() => {
        message.success(`Received parts on ${po.po_no}`);
        setOpen(false);
        onDone();
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Receipt failed'))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        Receive
      </Button>
      <Modal title={`Receive on ${po.po_no}`} open={open} onOk={submit} onCancel={() => setOpen(false)} confirmLoading={saving} okText="Post receipt">
        <Table<PoLineView>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={po.lines.filter((l) => l.remaining > 0)}
          columns={[
            { title: 'Item', dataIndex: 'code', width: 150 },
            { title: 'Ordered', dataIndex: 'qty', width: 90, align: 'right' },
            { title: 'Received', dataIndex: 'received_qty', width: 90, align: 'right' },
            { title: 'Remaining', dataIndex: 'remaining', width: 90, align: 'right' },
            {
              title: 'Receive qty',
              width: 110,
              align: 'right',
              render: (_, r) => (
                <InputNumber
                  min={0}
                  max={r.remaining}
                  value={values[r.id]}
                  placeholder={String(r.remaining)}
                  onChange={(v) => setValues((prev) => ({ ...prev, [r.id]: v ?? 0 }))}
                  style={{ width: 90 }}
                />
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
}

function CreatePoModal({
  open,
  onClose,
  suppliers,
  form,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  form: FormInstance;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [lines, setLines] = useState<{ item_id: number; qty: number; unit_price?: number | null }[]>([]);

  useEffect(() => {
    if (open) setLines(form.getFieldValue('lines') ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (v: { supplier_id: number; note?: string }) => {
    if (lines.length === 0) {
      message.warning('No lines');
      return;
    }
    api
      .createPurchaseOrder({ supplier_id: v.supplier_id, lines, note: v.note })
      .then(() => {
        message.success('Purchase order created');
        onDone();
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Create PO failed'));
  };

  return (
    <Modal title="New purchase order" open={open} onOk={() => form.submit()} onCancel={onClose} okText="Create PO">
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="supplier_id" label="Supplier" rules={[{ required: true }]}>
          <Select placeholder="Select supplier" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input />
        </Form.Item>
      </Form>
      <Table
        rowKey="item_id"
        size="small"
        pagination={false}
        dataSource={lines.map((l, i) => ({ ...l, _i: i }))}
        columns={[
          { title: 'Item ID', dataIndex: 'item_id', width: 90 },
          { title: 'Qty', dataIndex: 'qty', width: 100, align: 'right' },
          { title: 'Unit price', dataIndex: 'unit_price', width: 110, align: 'right', render: (v?: number | null) => (v ? `₹${v}` : '—') },
        ]}
      />
    </Modal>
  );
}