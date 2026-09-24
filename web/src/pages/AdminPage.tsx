import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type { Department, Employee, Role, RolePermissions, User } from '../api/types';

export default function AdminPage() {
  const { message } = App.useApp();
  const { signOut, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedRole, setSelectedRole] = useState<RolePermissions | null>(null);

  const [deptOpen, setDeptOpen] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [deptForm] = Form.useForm();
  const [empForm] = Form.useForm();
  const [userForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, e, r, u] = await Promise.all([api.departments(), api.employees(), api.roles(), api.users()]);
      setDepartments(d);
      setEmployees(e);
      setRoles(r);
      setUsers(u);
    } catch (err) {
      if (isSessionExpired(err)) return void signOut();
      message.error(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [message, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateDept = () => {
    setEditingDept(null);
    deptForm.resetFields();
    setDeptOpen(true);
  };

  const openEditDept = (d: Department) => {
    setEditingDept(d);
    deptForm.setFieldsValue({ code: d.code, name: d.name });
    setDeptOpen(true);
  };

  const submitDept = useCallback(
    async (values: { code: string; name: string }) => {
      setSaving(true);
      try {
        if (editingDept) {
          const updated = await api.updateDepartment(editingDept.id, values);
          setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
          message.success(`Department ${updated.code} updated`);
        } else {
          const dept = await api.createDepartment(values);
          setDepartments((prev) => [...prev, dept]);
          message.success(`Department ${dept.code} created`);
        }
        setDeptOpen(false);
      } catch (err) {
        if (isSessionExpired(err)) return void signOut();
        message.error(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [editingDept, message, signOut],
  );

  const deleteDepartment = useCallback(
    async (d: Department) => {
      try {
        await api.deleteDepartment(d.id);
        setDepartments((prev) => prev.filter((x) => x.id !== d.id));
        message.success(`Department ${d.code} deleted`);
      } catch (err) {
        if (isSessionExpired(err)) return void signOut();
        message.error(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [message, signOut],
  );

  const openCreateEmp = () => {
    setEditingEmp(null);
    empForm.resetFields();
    setEmpOpen(true);
  };

  const openEditEmp = (e: Employee) => {
    setEditingEmp(e);
    empForm.setFieldsValue({ code: e.code, name: e.name, department_id: e.department_id ?? undefined });
    setEmpOpen(true);
  };

  const submitEmp = useCallback(
    async (values: { code: string; name: string; department_id?: number }) => {
      setSaving(true);
      try {
        const body = { ...values, department_id: values.department_id ?? null };
        if (editingEmp) {
          const updated = await api.updateEmployee(editingEmp.id, body);
          setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          message.success(`Employee ${updated.code} updated`);
        } else {
          const emp = await api.createEmployee(body);
          setEmployees((prev) => [...prev, emp]);
          message.success(`Employee ${emp.code} created`);
        }
        setEmpOpen(false);
      } catch (err) {
        if (isSessionExpired(err)) return void signOut();
        message.error(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [editingEmp, message, signOut],
  );

  const deleteEmployee = useCallback(
    async (e: Employee) => {
      try {
        await api.deleteEmployee(e.id);
        setEmployees((prev) => prev.filter((x) => x.id !== e.id));
        message.success(`Employee ${e.code} deleted`);
      } catch (err) {
        if (isSessionExpired(err)) return void signOut();
        message.error(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [message, signOut],
  );

  const openCreateUser = () => {
    setEditingUser(null);
    userForm.resetFields();
    setUserOpen(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    userForm.setFieldsValue({ role_code: u.role_code, password: undefined });
    setUserOpen(true);
  };

  const submitUser = useCallback(
    async (values: { username: string; password?: string; employee_id?: number; role_code: string }) => {
      setSaving(true);
      try {
        if (editingUser) {
          const body: { role_code: string; password?: string } = { role_code: values.role_code };
          if (values.password) body.password = values.password;
          const updated = await api.updateUser(editingUser.id, body);
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, role_code: values.role_code } : u)));
          message.success(`User ${editingUser.username} updated`);
        } else {
          await api.createUser({ ...values, password: values.password!, employee_id: values.employee_id ?? null });
          message.success(`User ${values.username} created`);
        }
        setUserOpen(false);
        void load();
      } catch (err) {
        if (isSessionExpired(err)) return void signOut();
        message.error(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [editingUser, load, message, signOut],
  );

  const deactivateUser = useCallback(
    async (u: User) => {
      try {
        await api.deleteUser(u.id);
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: false } : x)));
        message.success(`User ${u.username} deactivated`);
      } catch (err) {
        if (isSessionExpired(err)) return void signOut();
        message.error(err instanceof Error ? err.message : 'Deactivate failed');
      }
    },
    [message, signOut],
  );

  const showRole = useCallback(async (code: string) => {
    try {
      setSelectedRole(await api.rolePermissions(code));
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load permissions');
    }
  }, [message]);

  const deptColumns: TableProps<Department>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 120 },
    { title: 'Name', dataIndex: 'name' },
    {
      title: 'Active',
      dataIndex: 'active',
      width: 100,
      render: (a: boolean) => (a ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, d) => (
        <Space>
          <Button size="small" onClick={() => openEditDept(d)}>Edit</Button>
          <Popconfirm
            title="Delete this department?"
            description="Fails if it still has employees or tasks."
            onConfirm={() => void deleteDepartment(d)}
          >
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const empColumns: TableProps<Employee>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 130 },
    { title: 'Name', dataIndex: 'name' },
    {
      title: 'Department ID',
      dataIndex: 'department_id',
      width: 140,
      render: (id: number | null) => (id != null ? String(id) : '—'),
    },
    {
      title: 'Active',
      dataIndex: 'active',
      width: 100,
      render: (a: boolean) => (a ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, e) => (
        <Space>
          <Button size="small" onClick={() => openEditEmp(e)}>Edit</Button>
          <Popconfirm
            title="Delete this employee?"
            description="Fails if a user, report, or department still references them."
            onConfirm={() => void deleteEmployee(e)}
          >
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const roleColumns: TableProps<Role>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 140 },
    { title: 'Role', dataIndex: 'name' },
    {
      title: 'Permissions',
      key: 'permissions',
      width: 140,
      render: (_, role) => (
        <Button size="small" onClick={() => void showRole(role.code)}>
          View grants
        </Button>
      ),
    },
  ];

  const userColumns: TableProps<User>['columns'] = [
    { title: 'Username', dataIndex: 'username', width: 160 },
    { title: 'Employee ID', dataIndex: 'employee_id', width: 120, render: (id: number | null) => id ?? '—' },
    { title: 'Role', dataIndex: 'role_code' },
    {
      title: 'Active',
      dataIndex: 'active',
      width: 100,
      render: (a: boolean) => (a ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: '',
      key: 'actions',
      width: 170,
      render: (_, u) => (
        <Space>
          <Button size="small" onClick={() => openEditUser(u)}>Edit</Button>
          {u.id !== user?.id && u.active ? (
            <Popconfirm
              title="Deactivate this user?"
              description="They will no longer be able to log in."
              onConfirm={() => void deactivateUser(u)}
            >
              <Button size="small" danger>Deactivate</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Administration"
      extra={
        <Space>
          <Button icon={<PlusOutlined />} onClick={openCreateDept}>
            Department
          </Button>
          <Button icon={<PlusOutlined />} onClick={openCreateEmp}>
            Employee
          </Button>
          <Button icon={<PlusOutlined />} onClick={openCreateUser}>
            User
          </Button>
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'departments',
            label: 'Departments',
            children: (
              <Table<Department>
                rowKey="id"
                columns={deptColumns}
                dataSource={departments}
                loading={loading}
                pagination={false}
              />
            ),
          },
          {
            key: 'employees',
            label: 'Employees',
            children: (
              <Table<Employee>
                rowKey="id"
                columns={empColumns}
                dataSource={employees}
                loading={loading}
                pagination={false}
              />
            ),
          },
          {
            key: 'users',
            label: 'Users',
            children: (
              <Table<User>
                rowKey="id"
                columns={userColumns}
                dataSource={users}
                loading={loading}
                pagination={false}
              />
            ),
          },
          {
            key: 'roles',
            label: 'Roles',
            children: (
              <Table<Role>
                rowKey="id"
                columns={roleColumns}
                dataSource={roles}
                loading={loading}
                pagination={false}
              />
            ),
          },
        ]}
      />

      <Modal
        title={editingDept ? `Edit department ${editingDept.code}` : 'New department'}
        open={deptOpen}
        onCancel={() => setDeptOpen(false)}
        onOk={() => deptForm.submit()}
        confirmLoading={saving}
        okText={editingDept ? 'Save' : 'Create'}
      >
        <Form form={deptForm} layout="vertical" onFinish={submitDept}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. QA" />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Quality" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingEmp ? `Edit employee ${editingEmp.code}` : 'New employee'}
        open={empOpen}
        onCancel={() => setEmpOpen(false)}
        onOk={() => empForm.submit()}
        confirmLoading={saving}
        okText={editingEmp ? 'Save' : 'Create'}
      >
        <Form form={empForm} layout="vertical" onFinish={submitEmp}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. EMP0001" />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Full name" />
          </Form.Item>
          <Form.Item name="department_id" label="Department">
            <Select
              allowClear
              options={departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingUser ? `Edit user ${editingUser.username}` : 'New user'}
        open={userOpen}
        onCancel={() => setUserOpen(false)}
        onOk={() => userForm.submit()}
        confirmLoading={saving}
        okText={editingUser ? 'Save' : 'Create'}
      >
        <Form form={userForm} layout="vertical" onFinish={submitUser}>
          {!editingUser ? (
            <>
              <Form.Item name="username" label="Username" rules={[{ required: true }]}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="employee_id" label="Employee">
                <Select
                  allowClear
                  options={employees.map((e) => ({ value: e.id, label: `${e.code} — ${e.name}` }))}
                />
              </Form.Item>
            </>
          ) : (
            <Form.Item name="password" label="New password (leave blank to keep)">
              <Input.Password autoComplete="new-password" placeholder="Optional reset" />
            </Form.Item>
          )}
          <Form.Item name="role_code" label="Role" rules={[{ required: true }]}>
            <Select options={roles.map((r) => ({ value: r.code, label: `${r.code} — ${r.name}` }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`Permissions — ${selectedRole?.role ?? ''}`}
        open={selectedRole != null}
        onClose={() => setSelectedRole(null)}
        width={460}
      >
        <Descriptions column={1} bordered size="small">
          {(selectedRole?.permissions ?? []).map((p) => (
            <Descriptions.Item key={p} label={p.split(':')[0]}>
              {p.split(':')[1]}
            </Descriptions.Item>
          ))}
          {!selectedRole?.permissions.length ? <div>No grants</div> : null}
        </Descriptions>
      </Drawer>
    </Card>
  );
}