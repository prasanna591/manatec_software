import { useCallback, useEffect, useState } from 'react';
import { App, Card, Input, Select, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { AuditEntry } from '../api/types';

const ACTION_COLOR: Record<string, string> = {
  login: 'blue',
  create: 'green',
  status_change: 'gold',
  sync: 'purple',
};

export default function AuditPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState<string | undefined>();
  const [actor, setActor] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.audit({ entityType, actor, limit: 200 }));
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [entityType, actor, message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: TableProps<AuditEntry>['columns'] = [
    {
      title: 'When',
      dataIndex: 'at',
      width: 190,
      render: (at: string) => new Date(at).toLocaleString(),
    },
    { title: 'Actor', dataIndex: 'actor', width: 140 },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 140,
      render: (a: string) => <Tag color={ACTION_COLOR[a] ?? 'default'}>{a}</Tag>,
    },
    { title: 'Entity', dataIndex: 'entity_type', width: 150 },
    { title: 'Ref', dataIndex: 'entity_ref', width: 140 },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (ip: string | null) => ip ?? '—' },
  ];

  return (
    <Card
      title="Audit log"
      extra={
        <Space>
          <Input placeholder="Actor" allowClear onChange={(e) => setActor(e.target.value || undefined)} />
          <Select
            placeholder="Entity type"
            allowClear
            style={{ width: 180 }}
            onChange={setEntityType}
            options={Array.from(new Set(rows.map((r) => r.entity_type))).map((v) => ({
              value: v,
              label: v,
            }))}
          />
        </Space>
      }
    >
      <Table<AuditEntry>
        rowKey={(r) => `${r.at}-${r.action}-${r.actor}`}
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 25, showSizeChanger: false }}
        expandable={{
          expandedRowRender: (r) => (
            <pre style={{ margin: 0, fontSize: 12 }}>
              {JSON.stringify({ before: r.before, after: r.after }, null, 2)}
            </pre>
          ),
        }}
      />
    </Card>
  );
}