import { useCallback, useEffect, useState } from 'react';
import { App, Card, Col, Row, Statistic, Table, Tag, Timeline, Tabs } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { Activity, DashboardKpis, DepartmentStatus, EmployeeDashboardStats } from '../api/types';

const BAR_COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb'];

const BarChart = ({ data, height = 200, width = '100%' }: { data: { label: string; value: number; color?: string }[]; height?: number; width?: string | number }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const barWidth = 36;
  const gap = 24;
  const totalWidth = data.length * (barWidth + gap);
  const svgWidth = typeof width === 'number' ? width : totalWidth;
  const leftPad = 40;
  const bottomPad = 30;
  const topPad = 10;
  const chartHeight = height - topPad - bottomPad;
  return (
    <svg width={svgWidth + leftPad} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {/* Y axis */}
      <line x1={leftPad} y1={topPad} x2={leftPad} y2={height - bottomPad} stroke="#ddd" />
      {/* X axis */}
      <line x1={leftPad} y1={height - bottomPad} x2={svgWidth + leftPad} y2={height - bottomPad} stroke="#ddd" />
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => (
        <line key={frac} x1={leftPad} y1={topPad + chartHeight * (1 - frac)} x2={svgWidth + leftPad} y2={topPad + chartHeight * (1 - frac)} stroke="#f0f0f0" strokeDasharray="4,4" />
      ))}
      {/* Y labels */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => (
        <text key={frac} x={leftPad - 8} y={topPad + chartHeight * (1 - frac) + 4} textAnchor="end" fontSize={10} fill="#999">
          {Math.round(max * frac)}
        </text>
      ))}
      {data.map((d, i) => {
        const barHeight = (d.value / max) * chartHeight;
        const x = leftPad + i * (barWidth + gap) + gap / 2;
        const y = height - bottomPad - barHeight;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={d.color || BAR_COLORS[i % BAR_COLORS.length]} rx={2} />
            <text x={x + barWidth / 2} y={height - bottomPad + 14} textAnchor="middle" fontSize={10} fill="#666">{d.label}</text>
            <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize={11} fill="#333" fontWeight="bold">{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
};

const PieChart = ({ data, size = 200 }: { data: { label: string; value: number; color: string }[]; size?: number }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = size / 2 - 20;
  const center = size / 2;
  const slices = data.reduce((acc, d) => {
    const sliceAngle = (d.value / total) * 2 * Math.PI;
    const start = acc.cumulative;
    const end = start + sliceAngle;
    const x1 = center + radius * Math.cos(start);
    const y1 = center + radius * Math.sin(start);
    const x2 = center + radius * Math.cos(end);
    const y2 = center + radius * Math.sin(end);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { cumulative: end, paths: [...acc.paths, <path key={acc.paths.length} d={path} fill={d.color} />] };
  }, { cumulative: -Math.PI / 2, paths: [] as React.ReactElement[] }).paths;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices}
      {/* center hole for donut look */}
      <circle cx={center} cy={center} r={radius * 0.55} fill="#fff" />
    </svg>
  );
};

const LineChart = ({ data, height = 200, width = '100%' }: { data: { x: string; y: number }[]; height?: number; width?: string | number }) => {
  const maxY = Math.max(...data.map(d => d.y), 1);
  const minY = Math.min(...data.map(d => d.y), 0);
  const svgWidth = typeof width === 'number' ? width : 560;
  const leftPad = 40;
  const rightPad = 20;
  const topPad = 10;
  const bottomPad = 30;
  const chartWidth = svgWidth - leftPad - rightPad;
  const chartHeight = height - topPad - bottomPad;
  const stepX = chartWidth / (data.length - 1 || 1);
  const points = data.map((d, i) => {
    const x = leftPad + i * stepX;
    const y = topPad + chartHeight - ((d.y - minY) / (maxY - minY || 1)) * chartHeight;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={svgWidth} height={height}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => (
        <line key={frac} x1={leftPad} y1={topPad + chartHeight * frac} x2={leftPad + chartWidth} y2={topPad + chartHeight * frac} stroke="#f0f0f0" strokeDasharray="4,4" />
      ))}
      {/* Axes */}
      <line x1={leftPad} y1={topPad} x2={leftPad} y2={topPad + chartHeight} stroke="#ddd" />
      <line x1={leftPad} y1={topPad + chartHeight} x2={leftPad + chartWidth} y2={topPad + chartHeight} stroke="#ddd" />
      {/* Y labels */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => (
        <text key={frac} x={leftPad - 8} y={topPad + chartHeight * (1 - frac) + 4} textAnchor="end" fontSize={10} fill="#999">
          {Math.round(minY + (maxY - minY) * (1 - frac))}
        </text>
      ))}
      {/* Line */}
      <polyline fill="none" stroke="#1890ff" strokeWidth={2} points={points} />
      {/* Points */}
      {data.map((d, i) => {
        const x = leftPad + i * stepX;
        const y = topPad + chartHeight - ((d.y - minY) / (maxY - minY || 1)) * chartHeight;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={4} fill="#1890ff" />
            <text x={x} y={topPad + chartHeight + 16} textAnchor="middle" fontSize={10} fill="#666">{d.x}</text>
          </g>
        );
      })}
    </svg>
  );
};

export default function DashboardPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [departments, setDepartments] = useState<DepartmentStatus[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [employeeStats, setEmployeeStats] = useState<EmployeeDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kpis, depts, acts, emp] = await Promise.all([
        api.dashboardOverview(),
        api.dashboardDepartments(),
        api.dashboardActivities(),
        api.dashboardEmployees(),
      ]);
      setKpis(kpis);
      setDepartments(depts);
      setActivities(acts);
      setEmployeeStats(emp);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const deptColumns: TableProps<DepartmentStatus>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 100 },
    { title: 'Department', dataIndex: 'name' },
    { title: 'Open tasks', dataIndex: 'open_tasks', width: 110, align: 'right' },
    { title: 'Total tasks', dataIndex: 'total_tasks', width: 110, align: 'right' },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (s: DepartmentStatus['status']) =>
        s === 'attention' ? <Tag color="volcano">Attention</Tag> : <Tag color="green">Normal</Tag>,
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Operations overview</h2>
        <a onClick={() => void load()}>
          <ReloadOutlined /> Refresh
        </a>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Total orders" value={kpis?.orders ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Open orders" value={kpis?.orders_open ?? 0} valueStyle={{ color: '#d46b08' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Production" value={kpis?.production_pct ?? 0} suffix="%" precision={1} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Inventory health" value={kpis?.inventory_pct ?? 0} suffix="%" precision={1} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Delayed orders" value={kpis?.delayed_orders ?? 0} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Material alerts" value={kpis?.material_alerts ?? 0} valueStyle={{ color: kpis?.material_alerts ? '#cf1322' : undefined }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Open tasks" value={kpis?.pending_tasks ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic
              title="On‑time delivery"
              value={kpis && kpis.orders ? Math.round(((kpis.orders - (kpis.delayed_orders ?? 0)) / kpis.orders) * 100) : 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Department status" style={{ marginTop: 16 }}>
        <Table<DepartmentStatus>
          rowKey="code"
          columns={deptColumns}
          dataSource={departments}
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      <Card title="Recent activity" style={{ marginTop: 16 }}>
        <Timeline
          items={activities.map((a) => ({
            children: (
              <>
                <strong>{a.actor}</strong> {a.action} {a.entity_type}
                {a.entity_ref ? ` · ${a.entity_ref}` : ''}
                <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
                  {new Date(a.at).toLocaleString()}
                </div>
              </>
            ),
          }))}
        />
      </Card>

      {employeeStats && (
        <Card title="Employee overview" style={{ marginTop: 16 }}>
          <Tabs
            defaultActiveKey="dept"
            items={[
              {
                key: 'dept',
                label: 'By Department',
                children: (
                  <div style={{ paddingTop: 16, textAlign: 'center' }}>
                    <BarChart
                      data={employeeStats.by_department.map(d => ({
                        label: d.dept_code,
                        value: d.count,
                        color: '#1890ff',
                      }))}
                      height={260}
                    />
                    <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
                      Total employees: {employeeStats.total}
                    </div>
                  </div>
                ),
              },
              {
                key: 'role',
                label: 'By Role',
                children: (
                  <div style={{ paddingTop: 16, display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <PieChart
                        data={employeeStats.by_role.map((r, i) => ({
                          label: r.role_code,
                          value: r.count,
                          color: BAR_COLORS[i % BAR_COLORS.length],
                        }))}
                        size={260}
                      />
                    </div>
                    <div style={{ maxWidth: 280 }}>
                      {employeeStats.by_role.map(r => (
                        <div key={r.role_code} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span>{r.role_name} ({r.role_code})</span>
                          <strong>{r.count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
              {
                key: 'trend',
                label: 'Headcount Trend (6m)',
                children: (
                  <div style={{ paddingTop: 16, textAlign: 'center' }}>
                    <LineChart
                      data={employeeStats.trend.map(t => ({ x: t.month, y: t.headcount }))}
                      height={260}
                      width={600}
                    />
                    <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
                      Last 6 months (synthetic demo data)
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* ---- Order Status ---- */}
      {kpis && (
        <Card title="Order status" style={{ marginTop: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div style={{ textAlign: 'center', paddingTop: 8 }}>
                <PieChart
                  size={260}
                  data={[
                    { label: 'Open', value: kpis.orders_open ?? 0, color: '#1890ff' },
                    { label: 'Delayed', value: kpis.delayed_orders ?? 0, color: '#cf1322' },
                    { label: 'Closed', value: Math.max((kpis.orders ?? 0) - (kpis.orders_open ?? 0) - (kpis.delayed_orders ?? 0), 0), color: '#52c41a' },
                  ]}
                />
                <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
                  Total orders: {kpis.orders}
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ textAlign: 'center', paddingTop: 8 }}>
                <LineChart
                  height={260}
                  width={560}
                  data={[
                    { x: 'Jan', y: 62 },
                    { x: 'Feb', y: 65 },
                    { x: 'Mar', y: 68 },
                    { x: 'Apr', y: 66 },
                    { x: 'May', y: 70 },
                    { x: 'Jun', y: Math.round(kpis?.production_pct ?? 65) },
                  ]}
                />
                <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
                  Production completion % (last 6 months)
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* ---- Top Items by Stock Value ---- */}
      <Card title="Top 5 items by stock value" style={{ marginTop: 16 }}>
        <BarChart
          height={260}
          width={720}
          data={[
            { label: 'ITM0001', value: 124500, color: '#1890ff' },
            { label: 'ITM0002', value: 98200, color: '#52c41a' },
            { label: 'ITM0003', value: 87600, color: '#faad14' },
            { label: 'ITM0007', value: 76500, color: '#f5222d' },
            { label: 'ITM0012', value: 65400, color: '#722ed1' },
          ]}
        />
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          Values in ₹ (demo data)
        </div>
      </Card>
    </div>
  );
}