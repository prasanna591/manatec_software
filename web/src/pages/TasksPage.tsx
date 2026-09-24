import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Select, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { Task, TaskStatus } from '../api/types';

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'red',
  critical: 'red',
  high: 'orange',
  normal: 'default',
  low: 'default',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  open: 'blue',
  in_progress: 'gold',
  done: 'green',
  cancelled: 'default',
};

export default function TasksPage() {
  const { message } = App.useApp();
  const { user, signOut } = useAuth();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [statusFilter, setStatusFilter] = useState<'active' | 'done' | 'all'>('active');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const canAll = user?.permissions.some((p) => p.startsWith('Dashboard:')) ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = scope === 'all' ? await api.allTasks() : await api.myTasks();
      setTasks(data);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [scope, message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = useCallback(
    async (task: Task, status: TaskStatus) => {
      try {
        const updated = await api.setTaskStatus(task.id, status);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } catch (e) {
        if (isSessionExpired(e)) return void signOut();
        message.error(e instanceof Error ? e.message : 'Update failed');
      }
    },
    [message, signOut],
  );

  const visible = tasks.filter((t) => {
    if (statusFilter === 'active') return t.status === 'open' || t.status === 'in_progress';
    if (statusFilter === 'done') return t.status === 'done';
    return true;
  });

  const columns: TableProps<Task>['columns'] = [
    { title: 'Task', dataIndex: 'title', ellipsis: true },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 160,
      render: (t: string) => <span style={{ textTransform: 'capitalize' }}>{t.replace('_', ' ')}</span>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 110,
      render: (p: string) => <Tag color={PRIORITY_COLOR[p] ?? 'default'}>{p}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (s: TaskStatus) => <Tag color={STATUS_COLOR[s]}>{s.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Due',
      dataIndex: 'due_date',
      width: 130,
      render: (d: string | null) =>
        d ? new Date(d).toLocaleDateString() : <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, task) => (
        <Space>
          {task.status !== 'in_progress' && task.status !== 'done' ? (
            <Button size="small" type="primary" onClick={() => void changeStatus(task, 'in_progress')}>
              Start
            </Button>
          ) : null}
          {task.status !== 'done' ? (
            <Button size="small" type="primary" ghost onClick={() => void changeStatus(task, 'done')}>
              Complete
            </Button>
          ) : (
            <Button size="small" onClick={() => void changeStatus(task, 'open')}>
              Reopen
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Tasks"
      extra={
        <Space>
          {canAll ? (
            <Select
              value={scope}
              style={{ width: 140 }}
              onChange={setScope}
              options={[
                { value: 'mine', label: 'Mine' },
                { value: 'all', label: 'Everyone' },
              ]}
            />
          ) : null}
          <Select
            value={statusFilter}
            style={{ width: 140 }}
            onChange={setStatusFilter}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'all', label: 'All' },
              { value: 'done', label: 'Done' },
            ]}
          />
        </Space>
      }
    >
      <Table<Task>
        rowKey="id"
        columns={columns}
        dataSource={visible}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />
    </Card>
  );
}