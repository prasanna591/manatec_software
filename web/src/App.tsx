import { Spin } from 'antd';

import { useAuth } from './auth/AuthContext';
import AppShell from './AppShell';
import LoginPage from './pages/LoginPage';

export default function App() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return user ? <AppShell /> : <LoginPage />;
}