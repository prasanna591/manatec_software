import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
  Upload,
  Typography,
} from 'antd';
import type { TableProps, UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';

import { api } from '../api/client';
import { isSessionExpired, useAuth } from '../auth/AuthContext';
import type {
  Department,
  Employee,
  EmployeeImportResult,
  EmployeeImportRow,
  Role,
  RolePermissions,
  User,
} from '../api/types';

const { Text } = Typography;

/**
 * What each role actually unlocks on the phone, per FRS 5.2. Shown next to a
 * freshly generated login so the person issuing credentials can tell the
 * employee up front which department menus they will get.
 */
const ROLE_ACCESS: Record<string, string> = {
  OPER: 'Attendance, leave, notices, visits, catalog, stock, quality NCRs',
  QINSP: 'Operator, plus production orders and quality inspection',
  STORES: 'Attendance, leave, notices, catalog, stock, material requests',
  PUR: 'Attendance, leave, notices, procurement, production, stock, material requests',
  PROD: 'Attendance, leave, notices, production, catalog, stock',
  LOG: 'Attendance, leave, notices, visits, catalog, stock, quality NCRs',
  QUAL: 'Quality inspections, production, visits, stock, catalog',
  DH: 'Full department oversight incl. machines and quotes',
  MGMT: 'Everything, incl. guest visits, machines and quotes',
  HR: 'Administration, users and employees',
  ADMIN: 'Unrestricted',
};

function describeRoleAccess(roleCode?: string): string {
  if (!roleCode) return '—';
  return ROLE_ACCESS[roleCode] ?? 'Role-defined access';
}

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
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<EmployeeImportResult | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [deptForm] = Form.useForm();
  const [empForm] = Form.useForm();
  const [userForm] = Form.useForm();

  /**
   * The admin page is reachable by anyone with `Employees:view`, which per
   * FRS 5.2 is management, accounts and HR -- but only HR holds
   * `Employees:create`. Gating the buttons on the actual action (rather than
   * showing them and letting the API 403) keeps a manager's screen honest:
   * they see the roster, they don't get controls that cannot work.
   */
  const can = useCallback(
    (module: string, action: string) => (user?.permissions ?? []).includes(`${module}:${action}`),
    [user],
  );
  const canCreateEmp = can('Employees', 'create');
  const canEditEmp = can('Employees', 'edit');
  const canCreateDept = can('Employees', 'create');
  const canEditDept = can('Employees', 'edit');
  const canDelete = can('Admin', 'delete');

  const deptNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of departments) m.set(d.id, `${d.code} · ${d.name}`);
    return m;
  }, [departments]);

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

  const openImport = useCallback(() => {
    setImportResult(null);
    setImportOpen(true);
  }, []);

  const downloadTemplate = useCallback(async () => {
    try {
      const blob = await api.employeeImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employee-import-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to download the template');
    }
  }, [message]);

  const uploadEmployees = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportResult(null);
      try {
        const res = await api.importEmployees(file);
        setImportResult(res);
        if (res.accounts_created > 0) {
          message.success(
            `${res.employees_created + res.employees_updated} employee(s) saved, ${res.accounts_created} mobile login(s) created`,
          );
        } else {
          message.success(`${res.employees_created + res.employees_updated} employee(s) saved`);
        }
        if (res.employees_created + res.employees_updated > 0) await load();
      } catch (err) {
        if (isSessionExpired(err)) return void signOut();
        message.error(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setImporting(false);
      }
    },
    [load, message, signOut],
  );

  const importUploadProps: UploadProps = {
    accept: '.csv,text/csv',
    multiple: false,
    showUploadList: false,
    disabled: importing,
    beforeUpload: (file) => {
      void uploadEmployees(file as unknown as File);
      return false; // we POST it ourselves
    },
  };

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
      render: (_, d) =>
        canEditDept || canDelete ? (
          <Space>
            {canEditDept ? <Button size="small" onClick={() => openEditDept(d)}>Edit</Button> : null}
            {canDelete ? (
              <Popconfirm
                title="Delete this department?"
                description="Fails if it still has employees or tasks."
                onConfirm={() => void deleteDepartment(d)}
              >
                <Button size="small" danger>Delete</Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null,
    },
  ];

  const empColumns: TableProps<Employee>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 130 },
    { title: 'Name', dataIndex: 'name' },
    {
      title: 'Department',
      dataIndex: 'department_id',
      width: 240,
      render: (id: number | null) => (id != null ? deptNameById.get(id) ?? `#${id}` : '—'),
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
      render: (_, e) =>
        canEditEmp || canDelete ? (
          <Space>
            {canEditEmp ? <Button size="small" onClick={() => openEditEmp(e)}>Edit</Button> : null}
            {canDelete ? (
              <Popconfirm
                title="Delete this employee?"
                description="Fails if a user, report, or department still references them."
                onConfirm={() => void deleteEmployee(e)}
              >
                <Button size="small" danger>Delete</Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null,
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
    {
      title: 'Employee ID',
      dataIndex: 'employee_id',
      width: 200,
      render: (id: number | null) => {
        if (id == null) return '—';
        const emp = employees.find((e) => e.id === id);
        return emp ? `${emp.code} · ${emp.name}` : `#${id}`;
      },
    },
    {
      title: 'Role',
      dataIndex: 'role_code',
      render: (code: string) => {
        const role = roles.find((r) => r.code === code);
        return role ? `${code} · ${role.name}` : code;
      },
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
      width: 170,
      render: (_, u) =>
        canEditEmp || canDelete ? (
          <Space>
            {canEditEmp ? <Button size="small" onClick={() => openEditUser(u)}>Edit</Button> : null}
            {canDelete && u.id !== user?.id && u.active ? (
              <Popconfirm
                title="Deactivate this user?"
                description="They will no longer be able to log in."
                onConfirm={() => void deactivateUser(u)}
              >
                <Button size="small" danger>Deactivate</Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null,
    },
  ];

  return (
    <Card
      title="Administration"
      extra={
        <Space>
          {canCreateDept ? (
            <Button icon={<PlusOutlined />} onClick={openCreateDept}>
              Department
            </Button>
          ) : null}
          {canCreateEmp ? (
            <Button icon={<PlusOutlined />} onClick={openCreateEmp}>
              Employee
            </Button>
          ) : null}
          {canCreateEmp ? (
            <Button icon={<UploadOutlined />} onClick={openImport}>
              Import employees
            </Button>
          ) : null}
          {canEditEmp ? (
            <Button icon={<PlusOutlined />} onClick={openCreateUser}>
              User
            </Button>
          ) : null}
        </Space>
      }
    >
      {canCreateEmp || canEditEmp ? null : (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Read-only access"
          description="Your role can view employees, users and roles, but cannot add or change them. Bulk import is available to HR and Accounts."
        />
      )}
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
        title="Bulk import employees"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        footer={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => void downloadTemplate()}>
              Download CSV template
            </Button>
            <Button type="primary" onClick={() => setImportOpen(false)}>
              Done
            </Button>
          </Space>
        }
        width={860}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="One row per employee"
            description={
              <span>
                Columns: <Text code>employee_code</Text>, <Text code>name</Text>,{' '}
                <Text code>department_code</Text>, <Text code>manager_code</Text>, <Text code>phone</Text>,{' '}
                <Text code>email</Text>, <Text code>username</Text>, <Text code>role_code</Text>,{' '}
                <Text code>password</Text>. Existing employee codes are updated. Add a{' '}
                <Text code>username</Text> and <Text code>role_code</Text> to also create the mobile
                login — leave <Text code>password</Text> blank and a strong one is generated.
              </span>
            }
          />
          <Upload.Dragger {...importUploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drop a CSV here, or click to choose one</p>
            <p className="ant-upload-hint">A row is validated on its own — bad rows are reported, not fatal.</p>
          </Upload.Dragger>
          {importing ? <Text type="secondary">Uploading and creating accounts…</Text> : null}

          {importResult ? (
            <>
              <Space wrap>
                <Tag color="blue">{importResult.rows} rows</Tag>
                <Tag color="green">{importResult.employees_created} created</Tag>
                <Tag>{importResult.employees_updated} updated</Tag>
                <Tag color="purple">{importResult.accounts_created} logins</Tag>
                {importResult.failed ? <Tag color="red">{importResult.failed} failed</Tag> : null}
              </Space>

              {importResult.accounts_created > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Share these logins now — passwords are not shown again"
                  description={
                    <Table<EmployeeImportRow>
                      rowKey="row"
                      size="small"
                      pagination={false}
                      showHeader
                      columns={[
                        { title: 'Username', dataIndex: 'username' },
                        { title: 'Password', dataIndex: 'password', render: (p: string) => <Text code>{p}</Text> },
                        { title: 'Role', dataIndex: 'role_code' },
                        {
                          title: 'Mobile access',
                          render: (_, a) => <Text type="secondary">{describeRoleAccess(a.role_code)}</Text>,
                        },
                      ]}
                      dataSource={importResult.accounts}
                    />
                  }
                />
              ) : null}

              <Table<EmployeeImportRow>
                rowKey="row"
                size="small"
                pagination={false}
                columns={[
                  { title: 'Row', dataIndex: 'row', width: 70 },
                  { title: 'Employee', dataIndex: 'employee_code', width: 150 },
                  {
                    title: 'Result',
                    dataIndex: 'status',
                    width: 110,
                    render: (s: EmployeeImportRow['status']) =>
                      s === 'created' ? (
                        <Tag color="green">created</Tag>
                      ) : s === 'updated' ? (
                        <Tag>updated</Tag>
                      ) : (
                        <Tag color="red">failed</Tag>
                      ),
                  },
                  { title: 'Detail', dataIndex: 'detail' },
                ]}
                dataSource={importResult.results}
              />
            </>
          ) : null}
        </Space>
      </Modal>

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