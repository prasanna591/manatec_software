import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface LoginValues {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFinish(values: LoginValues) {
    setBusy(true);
    setError(null);
    try {
      await signIn(values.username, values.password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
      }}
    >
      <Card style={{ width: 380 }} styles={{ body: { padding: 32 } }}>
        <Typography.Title level={3} style={{ marginTop: 0, textAlign: 'center' }}>
          Manatec Digital
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          Integrated Digital Operations Platform
        </Typography.Paragraph>

        {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}

        <Form<LoginValues> onFinish={onFinish} layout="vertical" requiredMark={false}>
          <Form.Item name="username" label="Employee code" rules={[{ required: true, message: 'Enter your employee code' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" placeholder="e.g. manager" size="large" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="Password" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={busy}>
              SIGN IN
            </Button>
          </Form.Item>
        </Form>

        <Typography.Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 0, marginTop: 16, fontSize: 12 }}>
          Demo: admin / admin123 · manager / demo123
        </Typography.Paragraph>
      </Card>
    </div>
  );
}