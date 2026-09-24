import { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, List, Tabs, Tag } from 'antd';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { Notification } from '../api/types';
import { setUnread } from '../unread';

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'red',
  critical: 'red',
  high: 'orange',
  normal: 'default',
};

export default function NotificationsPage() {
  const { message } = App.useApp();
  const { signOut } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api.notifications(false);
      setItems(all);
      setUnread(all.filter((n) => !n.read).length);
    } catch (e) {
      if (isSessionExpired(e)) return void signOut();
      message.error(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(
    async (n: Notification) => {
      try {
        await api.markRead(n.id);
        setItems((prev) => {
          const next = prev.map((x) => (x.id === n.id ? { ...x, read: true } : x));
          setUnread(next.filter((x) => !x.read).length);
          return next;
        });
      } catch (e) {
        if (isSessionExpired(e)) return void signOut();
        message.error(e instanceof Error ? e.message : 'Could not mark as read');
      }
    },
    [message, signOut],
  );

  const visible = tab === 'unread' ? items.filter((n) => !n.read) : items;

  return (
    <Tabs
      activeKey={tab}
      onChange={(k) => setTab(k as 'all' | 'unread')}
      items={[
        { key: 'all', label: 'All' },
        { key: 'unread', label: `Unread (${items.filter((n) => !n.read).length})` },
      ]}
    >
      <div style={{ background: '#fff', borderRadius: 8 }}>
        <List<Notification>
          loading={loading}
          dataSource={visible}
          locale={{ emptyText: <Empty description="No notifications" /> }}
          renderItem={(n) => (
            <List.Item
              style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}
              extra={
                !n.read ? (
                  <Button size="small" onClick={() => void markRead(n)}>
                    Mark read
                  </Button>
                ) : (
                  <Tag color={PRIORITY_COLOR[n.priority] ?? 'default'}>{n.priority}</Tag>
                )
              }
            >
              <List.Item.Meta
                title={
                  <span>
                    {n.title}
                    {!n.read ? <Tag color="blue" style={{ marginLeft: 8 }}>New</Tag> : null}
                  </span>
                }
                description={
                  <>
                    {n.body ? <div>{n.body}</div> : null}
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      {n.entity_type ? `${n.entity_type} ${n.entity_ref ?? ''} · ` : ''}
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </Tabs>
  );
}