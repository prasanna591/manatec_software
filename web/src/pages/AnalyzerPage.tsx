import { useCallback, useState } from 'react';
import { App, Button, Card, Col, Input, Row, Statistic, Table, Tag, Upload } from 'antd';
import type { TableProps, UploadFile } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { AnalyzerProduct, AnalyzerReport, AnalyzerRow } from '../api/types';

const COLUMN_OVERRIDES = [
  { key: 'inv_item', label: 'Inventory item column' },
  { key: 'inv_qty', label: 'Inventory qty column' },
  { key: 'master_item', label: 'Master BOM item column' },
  { key: 'master_qty', label: 'Master BOM qty column' },
  { key: 'master_product', label: 'Master BOM product column' },
];

export default function AnalyzerPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [invFiles, setInvFiles] = useState<UploadFile[]>([]);
  const [masterFiles, setMasterFiles] = useState<UploadFile[]>([]);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<AnalyzerReport | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const run = useCallback(async () => {
    const inv = invFiles[0]?.originFileObj;
    const master = masterFiles[0]?.originFileObj;
    if (!inv || !master) {
      message.warning('Upload both an inventory file and a master BOM file');
      return;
    }
    setRunning(true);
    try {
      const r = await api.analyzeBom(inv as File, master as File, overrides);
      setReport(r);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invFiles, masterFiles, overrides]);

  const exportFile = (format: 'xlsx' | 'csv') => {
    if (!report) return;
    api
      .analyzeExport(report.products, format)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bom_report.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : 'Export failed'));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>BOM inventory analyzer</h2>
        <a onClick={() => { setReport(null); setInvFiles([]); setMasterFiles([]); }}>
          <ReloadOutlined /> Reset
        </a>
      </div>

      <Card title="Upload files" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>1 · Inventory file (item, qty)</div>
            <Upload accept=".csv,.xlsx,.xls" beforeUpload={() => false} maxCount={1} fileList={invFiles} onChange={({ fileList }) => setInvFiles(fileList.slice(-1))}>
              <Button>Choose inventory</Button>
            </Upload>
          </Col>
          <Col xs={24} md={8}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>2 · Master BOM file (product, item, qty)</div>
            <Upload accept=".csv,.xlsx,.xls" beforeUpload={() => false} maxCount={1} fileList={masterFiles} onChange={({ fileList }) => setMasterFiles(fileList.slice(-1))}>
              <Button>Choose master BOM</Button>
            </Upload>
          </Col>
          <Col xs={24} md={8}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>3 · Optional column overrides</div>
            {COLUMN_OVERRIDES.map((c) => (
              <Input
                key={c.key}
                placeholder={c.label}
                size="small"
                style={{ marginBottom: 6 }}
                value={overrides[c.key] ?? ''}
                onChange={(e) => setOverrides((prev) => ({ ...prev, [c.key]: e.target.value }))}
              />
            ))}
          </Col>
        </Row>
        <Button type="primary" size="large" loading={running} onClick={() => void run()} style={{ marginTop: 8 }}>
          Analyze BOM
        </Button>
      </Card>

      {report ? <Results report={report} onExport={exportFile} /> : null}
    </div>
  );
}

function Results({
  report,
  onExport,
}: {
  report: AnalyzerReport;
  onExport: (format: 'xlsx' | 'csv') => void;
}) {
  const [selected, setSelected] = useState<AnalyzerProduct | null>(null);

  const productColumns: TableProps<AnalyzerProduct>['columns'] = [
    { title: 'Product', dataIndex: 'name' },
    {
      title: 'Max units buildable',
      dataIndex: 'max_units',
      width: 150,
      align: 'right',
      render: (v: number, r) => (r.status === 'OK' ? <b style={{ color: '#237804' }}>{v}</b> : <Tag color="red">BLOCKED</Tag>),
    },
    { title: 'BOM items', dataIndex: 'bom_item_count', width: 90, align: 'right' },
    { title: 'Missing', dataIndex: 'missing_count', width: 80, align: 'right' },
    { title: 'Short', dataIndex: 'shortage_count', width: 80, align: 'right' },
    { title: 'Leftover qty', dataIndex: 'leftover_total', width: 100, align: 'right' },
    { title: 'Unused qty', dataIndex: 'unused_total', width: 100, align: 'right' },
    {
      title: '',
      width: 80,
      render: (_, r) => (
        <a onClick={() => setSelected(selected?.name === r.name ? null : r)}>{selected?.name === r.name ? 'Hide' : 'Rows'}</a>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Inventory items" value={report.inventory_count} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Products" value={report.product_count} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Buildable" value={report.buildable} valueStyle={{ color: '#237804' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Blocked" value={report.blocked} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={24} md={8}>
          <Card size="small" title="Export report">
            <Button icon={<DownloadOutlined />} onClick={() => onExport('xlsx')} style={{ marginRight: 8 }}>
              Excel
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => onExport('csv')}>
              CSV
            </Button>
          </Card>
        </Col>
      </Row>

      {report.products.some((p) => p.catalog_image || p.catalog_category || p.catalog_price) ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {report.products.filter((p) => p.catalog_image).slice(0, 8).map((p) => (
            <Col key={p.name} xs={12} md={3}>
              <Card size="small" hoverable cover={<img src={p.catalog_image} alt={p.name} style={{ height: 90, objectFit: 'contain', padding: 4 }} />}>
                <div style={{ fontSize: 12 }} title={p.name}>{p.name.slice(0, 40)}{p.name.length > 40 ? '…' : ''}</div>
                <Tag color={p.status === 'OK' ? 'green' : 'red'} style={{ marginTop: 4 }}>{p.max_units} units</Tag>
              </Card>
            </Col>
          ))}
        </Row>
      ) : null}

      <Card>
        <Table<AnalyzerProduct> rowKey="name" columns={productColumns} dataSource={report.products} size="middle" pagination={{ pageSize: 10 }} />
      </Card>

      {selected ? <AnalyzerProductTable product={selected} /> : null}
    </div>
  );
}

function AnalyzerProductTable({ product }: { product: AnalyzerProduct }) {
  const columns: TableProps<AnalyzerRow>['columns'] = [
    { title: 'Item', dataIndex: 'item', width: 220 },
    { title: 'In BOM', dataIndex: 'in_bom', width: 80, render: (v: boolean) => (v ? <Tag color="blue">Yes</Tag> : <Tag>No</Tag>) },
    { title: 'Need/unit', dataIndex: 'need', width: 90, align: 'right' },
    { title: 'Have', dataIndex: 'have', width: 90, align: 'right' },
    { title: 'Capacity', dataIndex: 'capacity', width: 90, align: 'right', render: (v: number | null) => (v === null ? '—' : v) },
    { title: 'Stock after', dataIndex: 'stock_after', width: 100, align: 'right' },
    {
      title: 'Shortage',
      dataIndex: 'shortage',
      width: 100,
      align: 'right',
      render: (v: number, r) => (r.status === 'SHORT' ? <Tag color="red">{v}</Tag> : 0),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <Tag color={v === 'OK' ? 'green' : v === 'SHORT' ? 'red' : 'default'}>{v}</Tag>,
    },
  ];
  return (
    <Card title={`${product.name} — breakdown`} style={{ marginTop: 16 }}>
      <Table<AnalyzerRow> rowKey="item" columns={columns} dataSource={product.rows} size="middle" pagination={{ pageSize: 15 }} />
    </Card>
  );
}