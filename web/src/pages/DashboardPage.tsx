import { useCallback, useEffect, useState } from 'react';
import { App, Card, Col, Row, Statistic, Table, Tag, Timeline } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { Activity, DashboardKpis, DepartmentStatus } from '../api/types';

export default function DashboardPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [departments, setDepartments] = useState<DepartmentStatus[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kpis, depts, acts] = await Promise.all([
        api.dashboardOverview(),
        api.dashboardDepartments(),
        api.dashboardActivities(),
      ]);
      setKpis(kpis);
      setDepartments(depts);
      setActivities(acts);
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
        <Col xs={12} md={4}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Total orders" value={kpis?.orders ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Open orders" value={kpis?.orders_open ?? 0} valueStyle={{ color: '#d46b08' }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Production" value={kpis?.production_pct ?? 0} suffix="%" precision={1} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Inventory health" value={kpis?.inventory_pct ?? 0} suffix="%" precision={1} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Delayed orders" value={kpis?.delayed_orders ?? 0} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card loading={loading} styles={{ body: { textAlign: 'center' } }}>
            <Statistic title="Material alerts" value={kpis?.material_alerts ?? 0} valueStyle={{ color: kpis?.material_alerts ? '#cf1322' : undefined }} />
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
    </div>
  );
}