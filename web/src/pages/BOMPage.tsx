import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Col, Row, Select, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { AtpCoverage, AtpResult, BomMeta, BomProduct, BomTreeNode } from '../api/types';

export default function BOMPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [products, setProducts] = useState<BomProduct[]>([]);
  const [atp, setAtp] = useState<AtpResult[]>([]);
  const [total, setTotal] = useState(0);
  const [ok, setOk] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([api.bomProducts(), api.atpBuildable()]);
      setProducts(b.items);
      setAtp(a.products);
      setTotal(b.total);
      setOk(b.ok);
      setBlocked(b.blocked);
      if (b.items.length > 0 && selected === null) setSelected(b.items[0].product_id);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load BOM data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const detail = selected !== null ? (atp.find((a) => a.product_id === selected) ?? null) : null;

  const columns: TableProps<BomProduct>['columns'] = [
    { title: 'Product', dataIndex: 'product_name' },
    {
      title: 'Buildable now',
      dataIndex: 'buildable_now',
      width: 140,
      render: (v: number | null) =>
        v === null ? <Tag>No BOM</Tag> : v > 0 ? <Tag color="green">{v} units</Tag> : <Tag color="red">0</Tag>,
    },
    { title: 'Limiting item', dataIndex: 'limiting_item', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Components', dataIndex: 'line_count', width: 110, align: 'right' },
    { title: 'Shortage value', dataIndex: 'shortage_value', width: 120, align: 'right', render: (v: number) => `₹${v.toLocaleString()}` },
    {
      title: '',
      width: 80,
      render: (_, r) => (
        <a onClick={() => setSelected(r.product_id)}>Open</a>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Bill of materials · Available-to-promise</h2>
        <a onClick={() => void load()}>
          <ReloadOutlined /> Refresh
        </a>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col><Tag color="blue">{total} products with BOM</Tag></Col>
        <Col><Tag color="green">{ok} buildable now</Tag></Col>
        <Col><Tag color="red">{blocked} stockshort</Tag></Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Table<BomProduct>
          rowKey="product_id"
          columns={columns}
          dataSource={products}
          loading={loading}
          size="middle"
          pagination={false}
        />
      </Card>

      {selected !== null ? <BomDetail productId={selected} atp={detail} /> : null}
    </div>
  );
}

function BomDetail({ productId, atp }: { productId: number; atp: AtpResult | null }) {
  const { message } = App.useApp();
  const [meta, setMeta] = useState<BomMeta | null>(null);
  const [tree, setTree] = useState<BomTreeNode[]>([]);
  const [qty, setQty] = useState<number>(1);
  const [whatIf, setWhatIf] = useState<AtpResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.bomDetail(productId);
      setMeta(d.meta);
      setTree(d.tree);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load BOM detail');
    } finally {
      setLoading(false);
    }
  }, [productId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const runWhatIf = () => {
    api
      .atpWhatIf(productId, qty)
      .then(setWhatIf)
      .catch((e) => message.error(e instanceof Error ? e.message : 'What-if failed'));
  };

  const coverageColumns: TableProps<AtpCoverage>['columns'] = [
    { title: 'Item', dataIndex: 'code', width: 160 },
    { title: 'Description', dataIndex: 'description' },
    { title: 'Need/unit', dataIndex: 'need_per_unit', width: 100, align: 'right' },
    { title: 'Req. for target', dataIndex: 'req_for_target', width: 120, align: 'right' },
    { title: 'On hand', dataIndex: 'on_hand', width: 90, align: 'right' },
    { title: 'In transit', dataIndex: 'in_transit', width: 100, align: 'right' },
    { title: 'Committed', dataIndex: 'committed', width: 100, align: 'right' },
    { title: 'Available', dataIndex: 'avail', width: 90, align: 'right' },
    { title: 'Short', dataIndex: 'short', width: 80, align: 'right', render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : 0) },
    { title: 'Lead', width: 70, render: (_, r) => `${r.lead_days_min}–${r.lead_days_max}d` },
  ];

  const active = whatIf ?? (atp && atp.product_id === productId ? atp : null);

  return (
    <Card title={meta?.product_name ?? `BOM #${productId}`} loading={loading}>
      <Row gutter={8} align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Tag>{meta?.revs?.[0]?.status}</Tag>
        </Col>
        <Col>Revision {meta?.revs?.[0]?.rev_no}</Col>
        <Col flex="auto" />
        <Col>Build</Col>
        <Col>
          <Select value={qty} onChange={setQty} style={{ width: 90 }} options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: n }))} />
        </Col>
        <Col>
          <Button type="primary" onClick={runWhatIf}>
            What-if
          </Button>
        </Col>
      </Row>

      {active && (
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col>
            <Tag color={active.ok_for_target ? 'green' : 'red'}>
              {active.ok_for_target ? 'Feasible from stock' : 'Short of target'}
            </Tag>
          </Col>
          <Col>Buildable now: <b>{active.buildable_now ?? 0}</b></Col>
          <Col>Shortage value: <b>₹{active.shortage_value.toLocaleString()}</b></Col>
          <Col>Max lead: <b>{active.max_lead_days}d</b></Col>
        </Row>
      )}

      <Table<AtpCoverage>
        rowKey="item_id"
        columns={coverageColumns}
        dataSource={active?.coverage ?? []}
        size="middle"
        pagination={{ pageSize: 10 }}
      />

      {tree.length > 0 && (
        <Card title="BOM tree" size="small" style={{ marginTop: 12 }}>
          <TreeNodes nodes={tree} depth={0} />
        </Card>
      )}
    </Card>
  );
}

function TreeNodes({ nodes, depth }: { nodes: BomTreeNode[]; depth: number }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {nodes.map((n) => (
        <li key={`${n.item_id}-${n.code}`} style={{ marginBottom: 4 }}>
          <span style={{ fontWeight: n.is_assembly ? 600 : 400 }}>
            {n.code} — {n.description} <Tag>{n.qty}</Tag>
            {n.scrap_pct > 0 ? <Tag color="orange">{n.scrap_pct}% scrap</Tag> : null}
            {n.is_assembly ? <Tag color="purple">sub-assembly</Tag> : null}
          </span>
          {n.children.length > 0 ? <TreeNodes nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}