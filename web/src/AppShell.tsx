import { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  Input,
  Layout,
  List,
  Menu,
  Popover,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  AuditOutlined,
  BellOutlined,
  DashboardOutlined,
  LogoutOutlined,
  OrderedListOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';

import { api } from './api/client';
import type { SearchResult } from './api/types';
import { isSessionExpired, useAuth } from './auth/AuthContext';
import { getUnread, setUnread, subscribeUnread } from './unread';
import DashboardPage from './pages/DashboardPage';
import TasksPage from './pages/TasksPage';
import NotificationsPage from './pages/NotificationsPage';
import AdminPage from './pages/AdminPage';
import AuditPage from './pages/AuditPage';

const { Header, Sider, Content } = Layout;

type Page = 'dashboard' | 'tasks' | 'notifications' | 'admin' | 'audit';

export default function AppShell() {
  const { user, signOut } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');
  const [unread, setUnreadState] = useState(getUnread());
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const perms = new Set(user?.permissions ?? []);
  const has = (module: string) => Array.from(perms).some((p) => p.startsWith(`${module}:`));
  const pagePerm = { dashboard: 'Dashboard', tasks: 'Tasks', admin: 'Employees' } as const;

  useEffect(() => subscribeUnread(() => setUnreadState(getUnread())), []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.search(q);
        setResults(
          res.results.filter((r) => {
            const perm = pagePerm[r.page];
            return !perm || has(perm);
          }),
        );
      } catch (e) {
        if (!isSessionExpired(e)) setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openResult = (r: SearchResult) => {
    setPage(r.page);
    setSearchOpen(false);
    setQuery('');
  };

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const { unread: n } = await api.unreadCount();
        setUnread(n);
      } catch (e) {
        if (isSessionExpired(e)) {
          window.clearInterval(timer);
        }
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const menuItems: MenuProps['items'] = [];
  if (has('Dashboard')) menuItems.push({ key: 'dashboard', icon: <DashboardOutlined />, label: 'Dashboard' });
  if (has('Tasks')) menuItems.push({ key: 'tasks', icon: <OrderedListOutlined />, label: 'My Tasks' });
  if (has('Notifications')) menuItems.push({ key: 'notifications', icon: <BellOutlined />, label: 'Notifications' });
  if (has('Employees')) menuItems.push({ key: 'admin', icon: <TeamOutlined />, label: 'Administration' });
  if (has('Admin')) menuItems.push({ key: 'audit', icon: <AuditOutlined />, label: 'Audit log' });

  const userMenu: MenuProps['items'] = [
    {
      key: 'signout',
      icon: <LogoutOutlined />,
      label: 'Sign out',
      onClick: () => void signOut(),
    },
  ];

  const name = user?.employee?.name ?? user?.username ?? '';
  const code = user?.employee?.code ?? user?.username ?? '';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography.Text strong style={{ color: '#fff' }}>
            {collapsed ? 'M·D' : 'Manatec Digital'}
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[page]}
          items={menuItems}
          onClick={({ key }) => setPage(key as Page)}
        />
      </Sider>

      <Layout>
        <Header style={{ background: '#fff', display: 'flex', alignItems: 'center', gap: 16, paddingInline: 24 }}>
          <Popover
            open={searchOpen}
            onOpenChange={setSearchOpen}
            trigger={['click']}
            placement="bottom"
            styles={{ content: { padding: 8, width: 360, maxHeight: 320, overflow: 'auto' } }}
            content={
              searchLoading ? (
                <Typography.Text type="secondary">Searching…</Typography.Text>
              ) : results.length === 0 ? (
                query.trim().length >= 2 ? (
                  <Typography.Text type="secondary">No matches for “{query.trim()}”</Typography.Text>
                ) : (
                  <Typography.Text type="secondary">Type at least 2 characters</Typography.Text>
                )
              ) : (
                <List
                  size="small"
                  dataSource={results}
                  renderItem={(r) => (
                    <List.Item
                      onClick={() => openResult(r)}
                      style={{ cursor: 'pointer', paddingInline: 8 }}
                    >
                      <List.Item.Meta
                        title={
                          <Typography.Text>
                            <Tag style={{ marginRight: 8 }}>{r.kind}</Tag>
                            {r.label}
                          </Typography.Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )
            }
          >
            <Input.Search
              placeholder="Search order, product, customer, item, employee…"
              allowClear
              style={{ maxWidth: 380, flex: 1 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
            />
          </Popover>
          <div style={{ flex: 1 }} />
          <Badge count={unread} size="small">
            <Button
              shape="circle"
              icon={<BellOutlined />}
              onClick={() => setPage('notifications')}
            />
          </Badge>
          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ background: '#1d4ed8' }} />
              <span>
                {name}
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {code} · {user?.role}
                </Typography.Text>
              </span>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{ margin: 16 }}>
          {page === 'dashboard' ? <DashboardPage /> : null}
          {page === 'tasks' ? <TasksPage /> : null}
          {page === 'notifications' ? <NotificationsPage /> : null}
          {page === 'admin' ? <AdminPage /> : null}
          {page === 'audit' ? <AuditPage /> : null}
        </Content>
      </Layout>
    </Layout>
  );
}