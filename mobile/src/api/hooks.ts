import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { api } from './client';
import type {
  Activity,
  DashboardEmployees,
  DashboardOverview,
  DepartmentStatus,
  InspectionKind,
  LoginResponse,
  MachineStatus,
  NcrStatus,
  Notification,
  SearchResponse,
  Task,
  TaskStatus,
  UserProfile,
  VisitStatus,
} from './types';

/**
 * Response types are derived from the client so a client change can never drift
 * from the hook layer. Mutation variables that are already declared in the
 * client are reused the same way via `Parameters<>`.
 */
type Result<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;
type Vars<T extends (...args: never[]) => unknown> = Parameters<T>;

/** Caller-supplied query options. `queryKey`/`queryFn` are owned by each hook. */
type QueryOptions<TData> = Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>;

/**
 * Central query key registry. Screens must invalidate through these keys rather
 * than hand-writing arrays, otherwise a typo silently leaves a list stale.
 */
export const queryKeys = {
  auth: { me: ['auth', 'me'] },
  dashboard: {
    overview: ['dashboard', 'overview'],
    departments: ['dashboard', 'departments'],
    activities: ['dashboard', 'activities'],
    employees: ['dashboard', 'employees'],
  },
  tasks: { my: ['tasks', 'my'] },
  notifications: {
    list: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly],
    unreadCount: ['notifications', 'unreadCount'],
  },
  attendance: {
    today: ['attendance', 'today'],
    me: ['attendance', 'me'],
    roster: (date?: string) => ['attendance', 'roster', date],
  },
  leave: {
    balances: ['leave', 'balances'],
    my: ['leave', 'my'],
    approvals: ['leave', 'approvals'],
  },
  visits: {
    list: (params: Vars<typeof api.visits>[0]) => ['visits', 'list', params],
    summary: ['visits', 'summary'],
    buyers: ['visits', 'buyers'],
  },
  guests: { list: (status?: string) => ['guests', 'list', status] },
  notices: { list: ['notices', 'list'] },
  catalog: {
    products: (q?: string, category?: string) => ['catalog', 'products', q, category],
    categories: ['catalog', 'categories'],
  },
  inventory: {
    stock: ['inventory', 'stock'],
    ledger: (itemId?: number, limit?: number) => ['inventory', 'ledger', itemId, limit],
  },
  procurement: {
    buyList: ['procurement', 'buyList'],
    purchaseOrders: ['procurement', 'purchaseOrders'],
    purchaseOrder: (id: number) => ['procurement', 'purchaseOrder', id],
    purchaseRequisitions: (status?: string) => ['procurement', 'purchaseRequisitions', status],
    purchaseRequisition: (id: number) => ['procurement', 'purchaseRequisition', id],
  },
  production: {
    orders: ['production', 'orders'],
    transitions: (id: number) => ['production', 'transitions', id],
  },
  quotes: { list: ['quotes', 'list'] },
  quality: {
    summary: ['quality', 'summary'],
    inspections: (params: Vars<typeof api.inspections>[0] = {}) => ['quality', 'inspections', params],
    ncrs: (params: Vars<typeof api.ncrs>[0] = {}) => ['quality', 'ncrs', params],
    ncr: (id: number) => ['quality', 'ncr', id],
  },
  machines: {
    list: (workCenter?: string) => ['machines', 'list', workCenter],
    workCenters: ['machines', 'workCenters'],
    summary: ['machines', 'summary'],
    downtime: (days?: number) => ['machines', 'downtime', days],
  },
  materialRequests: { list: ['materialRequests', 'list'] },
  stores: { stockSearch: (q: string) => ['stores', 'stockSearch', q] },
  search: { global: (q: string) => ['search', 'global', q] },
} as const;

// ── Auth ────────────────────────────────────────────────────────────────────

export function useLogin(
  options?: UseMutationOptions<LoginResponse, Error, { username: string; password: string }>,
) {
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.login(username, password),
    ...options,
  });
}

export function useMe(options?: QueryOptions<UserProfile>) {
  return useQuery({ queryKey: queryKeys.auth.me, queryFn: api.me, ...options });
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export function useDashboardOverview(options?: QueryOptions<DashboardOverview>) {
  return useQuery({ queryKey: queryKeys.dashboard.overview, queryFn: api.dashboardOverview, ...options });
}

export function useDashboardDepartments(options?: QueryOptions<DepartmentStatus[]>) {
  return useQuery({
    queryKey: queryKeys.dashboard.departments,
    queryFn: api.dashboardDepartments,
    ...options,
  });
}

export function useDashboardActivities(options?: QueryOptions<Activity[]>) {
  return useQuery({
    queryKey: queryKeys.dashboard.activities,
    queryFn: api.dashboardActivities,
    ...options,
  });
}

export function useDashboardEmployees(options?: QueryOptions<DashboardEmployees>) {
  return useQuery({
    queryKey: queryKeys.dashboard.employees,
    queryFn: api.dashboardEmployees,
    ...options,
  });
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function useMyTasks(options?: QueryOptions<Task[]>) {
  return useQuery({ queryKey: queryKeys.tasks.my, queryFn: api.myTasks, ...options });
}

export function useSetTaskStatus(
  options?: UseMutationOptions<Task, Error, { id: number; status: TaskStatus }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => api.setTaskStatus(id, status),
    onSuccess: (task) => {
      queryClient.setQueryData<Task[]>(queryKeys.tasks.my, (prev) =>
        prev?.map((t) => (t.id === task.id ? task : t)),
      );
    },
    ...options,
  });
}

// ── Notifications ───────────────────────────────────────────────────────────

export function useNotifications(unreadOnly = false, options?: QueryOptions<Notification[]>) {
  return useQuery({
    queryKey: queryKeys.notifications.list(unreadOnly),
    queryFn: () => api.notifications(unreadOnly),
    ...options,
  });
}

export function useUnreadCount(options?: QueryOptions<Result<typeof api.unreadCount>>) {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: api.unreadCount,
    ...options,
  });
}

export function useMarkRead(options?: UseMutationOptions<Result<typeof api.markRead>, Error, number>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(false) });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(true) });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount });
    },
    ...options,
  });
}

// ── Attendance ──────────────────────────────────────────────────────────────

export function useAttendanceToday(
  options?: QueryOptions<Result<typeof api.attendanceToday>>,
) {
  return useQuery({
    queryKey: queryKeys.attendance.today,
    queryFn: api.attendanceToday,
    ...options,
  });
}

export function useAttendanceMe(options?: QueryOptions<Result<typeof api.attendanceMe>>) {
  return useQuery({ queryKey: queryKeys.attendance.me, queryFn: api.attendanceMe, ...options });
}

export function useAttendanceRoster(
  date?: string,
  options?: QueryOptions<Result<typeof api.attendanceRoster>>,
) {
  return useQuery({
    queryKey: queryKeys.attendance.roster(date),
    queryFn: () => api.attendanceRoster(date),
    ...options,
  });
}

export function useAttendanceCheckIn(
  options?: UseMutationOptions<Result<typeof api.attendanceCheckIn>, Error, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.attendanceCheckIn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.today });
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.me });
    },
    ...options,
  });
}

export function useAttendanceCheckOut(
  options?: UseMutationOptions<Result<typeof api.attendanceCheckOut>, Error, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.attendanceCheckOut,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.today });
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.me });
    },
    ...options,
  });
}

// ── Leave ───────────────────────────────────────────────────────────────────

export function useLeaveBalances(options?: QueryOptions<Result<typeof api.leaveBalances>>) {
  return useQuery({ queryKey: queryKeys.leave.balances, queryFn: api.leaveBalances, ...options });
}

export function useLeaveMy(options?: QueryOptions<Result<typeof api.leaveMy>>) {
  return useQuery({ queryKey: queryKeys.leave.my, queryFn: api.leaveMy, ...options });
}

export function useLeaveApprovals(options?: QueryOptions<Result<typeof api.leaveApprovals>>) {
  return useQuery({ queryKey: queryKeys.leave.approvals, queryFn: api.leaveApprovals, ...options });
}

export function useLeaveApply(
  options?: UseMutationOptions<Result<typeof api.leaveApply>, Error, Vars<typeof api.leaveApply>[0]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.leaveApply,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.my });
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.balances });
    },
    ...options,
  });
}

export function useLeaveApprove(
  options?: UseMutationOptions<Result<typeof api.leaveApprove>, Error, { id: number; note?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => api.leaveApprove(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.approvals });
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.my });
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.balances });
    },
    ...options,
  });
}

export function useLeaveReject(
  options?: UseMutationOptions<Result<typeof api.leaveReject>, Error, { id: number; note?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => api.leaveReject(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.approvals });
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.my });
      queryClient.invalidateQueries({ queryKey: queryKeys.leave.balances });
    },
    ...options,
  });
}

// ── Visits ──────────────────────────────────────────────────────────────────

export function useVisits(
  params: Vars<typeof api.visits>[0] = {},
  options?: QueryOptions<Result<typeof api.visits>>,
) {
  return useQuery({
    queryKey: queryKeys.visits.list(params),
    queryFn: () => api.visits(params),
    ...options,
  });
}

export function useVisitSummary(options?: QueryOptions<Result<typeof api.visitSummary>>) {
  return useQuery({ queryKey: queryKeys.visits.summary, queryFn: api.visitSummary, ...options });
}

export function useBuyerTracking(options?: QueryOptions<Result<typeof api.buyerTracking>>) {
  return useQuery({ queryKey: queryKeys.visits.buyers, queryFn: api.buyerTracking, ...options });
}

export function useCreateVisit(
  options?: UseMutationOptions<Result<typeof api.createVisit>, Error, Vars<typeof api.createVisit>[0]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createVisit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.summary });
    },
    ...options,
  });
}

export function useMoveVisit(
  options?: UseMutationOptions<Result<typeof api.moveVisit>, Error, { id: number; to: VisitStatus; note?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to, note }: { id: number; to: VisitStatus; note?: string }) =>
      api.moveVisit(id, to, note),
    onSuccess: (visit) => {
      queryClient.setQueryData<Result<typeof api.visits>>(queryKeys.visits.list({}), (prev) =>
        prev?.map((v) => (v.id === visit.id ? visit : v)),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.summary });
    },
    ...options,
  });
}

export function useAddVisitNote(
  options?: UseMutationOptions<Result<typeof api.addVisitNote>, Error, { id: number; body: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => api.addVisitNote(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
    ...options,
  });
}

export function useCloseVisit(
  options?: UseMutationOptions<Result<typeof api.closeVisit>, Error, { id: number; body: Vars<typeof api.closeVisit>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Vars<typeof api.closeVisit>[1] }) =>
      api.closeVisit(id, body),
    onSuccess: (visit) => {
      queryClient.setQueryData<Result<typeof api.visits>>(queryKeys.visits.list({}), (prev) =>
        prev?.map((v) => (v.id === visit.id ? visit : v)),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.visits.summary });
    },
    ...options,
  });
}

export function usePingVisitLocation(
  options?: UseMutationOptions<Result<typeof api.pingVisitLocation>, Error, { id: number; body: Vars<typeof api.pingVisitLocation>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Vars<typeof api.pingVisitLocation>[1] }) =>
      api.pingVisitLocation(id, body),
    onSuccess: (visit) => {
      queryClient.setQueryData<Result<typeof api.visits>>(queryKeys.visits.list({}), (prev) =>
        prev?.map((v) => (v.id === visit.id ? visit : v)),
      );
    },
    ...options,
  });
}

// ── Guests ──────────────────────────────────────────────────────────────────

export function useGuests(status?: string, options?: QueryOptions<Result<typeof api.guests>>) {
  return useQuery({
    queryKey: queryKeys.guests.list(status),
    queryFn: () => api.guests(status),
    ...options,
  });
}

export function useGuestRegister(
  options?: UseMutationOptions<Result<typeof api.guestRegister>, Error, Vars<typeof api.guestRegister>[0]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.guestRegister,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.list() });
    },
    ...options,
  });
}

export function useGuestAdmit(
  options?: UseMutationOptions<Result<typeof api.guestAdmit>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.guestAdmit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.list() });
    },
    ...options,
  });
}

export function useGuestCheckout(
  options?: UseMutationOptions<Result<typeof api.guestCheckout>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.guestCheckout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.list() });
    },
    ...options,
  });
}

// ── Notices ─────────────────────────────────────────────────────────────────

export function useNotices(options?: QueryOptions<Result<typeof api.notices>>) {
  return useQuery({ queryKey: queryKeys.notices.list, queryFn: api.notices, ...options });
}

export function usePostNotice(
  options?: UseMutationOptions<Result<typeof api.postNotice>, Error, Vars<typeof api.postNotice>[0]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.postNotice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notices.list });
    },
    ...options,
  });
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export function useCatalogProducts(
  q = '',
  category = '',
  options?: QueryOptions<Result<typeof api.catalogProducts>>,
) {
  return useQuery({
    queryKey: queryKeys.catalog.products(q, category),
    queryFn: () => api.catalogProducts(q, category),
    ...options,
  });
}

export function useCatalogCategories(
  options?: QueryOptions<Result<typeof api.catalogCategories>>,
) {
  return useQuery({
    queryKey: queryKeys.catalog.categories,
    queryFn: api.catalogCategories,
    ...options,
  });
}

// ── Inventory ───────────────────────────────────────────────────────────────

export function useInventoryStock(options?: QueryOptions<Result<typeof api.inventoryStock>>) {
  return useQuery({ queryKey: queryKeys.inventory.stock, queryFn: api.inventoryStock, ...options });
}

export function useInventoryLedger(
  itemId?: number,
  limit = 100,
  options?: QueryOptions<Result<typeof api.inventoryLedger>>,
) {
  return useQuery({
    queryKey: queryKeys.inventory.ledger(itemId, limit),
    queryFn: () => api.inventoryLedger(itemId, limit),
    ...options,
  });
}

export function useInventoryMovement(
  options?: UseMutationOptions<Result<typeof api.inventoryMovement>, Error, Vars<typeof api.inventoryMovement>[0]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.inventoryMovement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stock });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.ledger() });
    },
    ...options,
  });
}

// ── Procurement ─────────────────────────────────────────────────────────────

export function useBuyList(
  options?: UseMutationOptions<Result<typeof api.buyList>, Error, { product_id: number; qty: number }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ product_id, qty }: { product_id: number; qty: number }) =>
      api.buyList(product_id, qty),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.buyList });
    },
    ...options,
  });
}

export function usePurchaseOrders(
  options?: QueryOptions<Result<typeof api.purchaseOrders>>,
) {
  return useQuery({
    queryKey: queryKeys.procurement.purchaseOrders,
    queryFn: api.purchaseOrders,
    ...options,
  });
}

export function usePurchaseOrder(
  id: number,
  options?: QueryOptions<Result<typeof api.purchaseOrder>>,
) {
  return useQuery({
    queryKey: queryKeys.procurement.purchaseOrder(id),
    queryFn: () => api.purchaseOrder(id),
    enabled: id > 0,
    ...options,
  });
}

export function useCreatePurchaseOrder(
  options?: UseMutationOptions<
    Result<typeof api.createPurchaseOrder>,
    Error,
    Vars<typeof api.createPurchaseOrder>[0]
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseOrders });
    },
    ...options,
  });
}

export function useIssuePurchaseOrder(
  options?: UseMutationOptions<Result<typeof api.issuePurchaseOrder>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.issuePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseOrders });
    },
    ...options,
  });
}

export function useReceivePurchaseOrder(
  options?: UseMutationOptions<Result<typeof api.receivePurchaseOrder>, Error, { id: number; lines: Vars<typeof api.receivePurchaseOrder>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines }: { id: number; lines: Vars<typeof api.receivePurchaseOrder>[1] }) =>
      api.receivePurchaseOrder(id, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseOrders });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stock });
    },
    ...options,
  });
}

export function useCancelPurchaseOrder(
  options?: UseMutationOptions<Result<typeof api.cancelPurchaseOrder>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.cancelPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseOrders });
    },
    ...options,
  });
}

export function usePurchaseRequisitions(
  status?: string,
  options?: QueryOptions<Result<typeof api.purchaseRequisitions>>,
) {
  return useQuery({
    queryKey: queryKeys.procurement.purchaseRequisitions(status),
    queryFn: () => api.purchaseRequisitions(status),
    ...options,
  });
}

export function usePurchaseRequisition(
  id: number,
  options?: QueryOptions<Result<typeof api.purchaseRequisition>>,
) {
  return useQuery({
    queryKey: queryKeys.procurement.purchaseRequisition(id),
    queryFn: () => api.purchaseRequisition(id),
    enabled: id > 0,
    ...options,
  });
}

export function useSubmitPurchaseRequisition(
  options?: UseMutationOptions<Result<typeof api.submitPurchaseRequisition>, Error, { id: number; note?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => api.submitPurchaseRequisition(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseRequisitions() });
    },
    ...options,
  });
}

export function useApprovePurchaseRequisition(
  options?: UseMutationOptions<Result<typeof api.approvePurchaseRequisition>, Error, { id: number; note?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => api.approvePurchaseRequisition(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseRequisitions() });
    },
    ...options,
  });
}

export function useCreatePoFromPr(
  options?: UseMutationOptions<Result<typeof api.createPoFromPr>, Error, { id: number; body: Vars<typeof api.createPoFromPr>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Vars<typeof api.createPoFromPr>[1] }) =>
      api.createPoFromPr(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseRequisitions() });
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement.purchaseOrders });
    },
    ...options,
  });
}

// ── Production ──────────────────────────────────────────────────────────────

export function useProductionOrders(
  options?: QueryOptions<Result<typeof api.productionOrders>>,
) {
  return useQuery({
    queryKey: queryKeys.production.orders,
    queryFn: api.productionOrders,
    ...options,
  });
}

export function useCreateProductionOrder(
  options?: UseMutationOptions<
    Result<typeof api.createProductionOrder>,
    Error,
    Vars<typeof api.createProductionOrder>[0]
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProductionOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.production.orders });
    },
    ...options,
  });
}

export function useReleaseProductionOrder(
  options?: UseMutationOptions<Result<typeof api.releaseProductionOrder>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.releaseProductionOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.production.orders });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stock });
    },
    ...options,
  });
}

export function useIssueProductionMaterial(
  options?: UseMutationOptions<Result<typeof api.issueProductionMaterial>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.issueProductionMaterial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.production.orders });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stock });
    },
    ...options,
  });
}

export function useSetProductionStatus(
  options?: UseMutationOptions<Result<typeof api.setProductionStatus>, Error, { id: number; status: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.setProductionStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.production.orders });
    },
    ...options,
  });
}

export function useProductionTransitions(
  id: number,
  options?: QueryOptions<Result<typeof api.productionTransitions>>,
) {
  return useQuery({
    queryKey: queryKeys.production.transitions(id),
    queryFn: () => api.productionTransitions(id),
    enabled: id > 0,
    ...options,
  });
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export function useQuotes(options?: QueryOptions<Result<typeof api.quotes>>) {
  return useQuery({ queryKey: queryKeys.quotes.list, queryFn: api.quotes, ...options });
}

export function useCreateQuote(
  options?: UseMutationOptions<Result<typeof api.createQuote>, Error, Vars<typeof api.createQuote>[0]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.list });
    },
    ...options,
  });
}

export function useConfirmQuote(
  options?: UseMutationOptions<Result<typeof api.confirmQuote>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.confirmQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.production.orders });
    },
    ...options,
  });
}

// ── Quality ─────────────────────────────────────────────────────────────────

export function useQualitySummary(options?: QueryOptions<Result<typeof api.qualitySummary>>) {
  return useQuery({ queryKey: queryKeys.quality.summary, queryFn: api.qualitySummary, ...options });
}

export function useInspections(
  params: Vars<typeof api.inspections>[0] = {},
  options?: QueryOptions<Result<typeof api.inspections>>,
) {
  return useQuery({
    queryKey: queryKeys.quality.inspections(params),
    queryFn: () => api.inspections(params),
    ...options,
  });
}

export function useCreateInspection(
  options?: UseMutationOptions<Result<typeof api.createInspection>, Error, Vars<typeof api.createInspection>[0]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createInspection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quality.inspections() });
      queryClient.invalidateQueries({ queryKey: queryKeys.quality.summary });
    },
    ...options,
  });
}

export function useSubmitInspection(
  options?: UseMutationOptions<Result<typeof api.submitInspection>, Error, { id: number; body: Vars<typeof api.submitInspection>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Vars<typeof api.submitInspection>[1] }) =>
      api.submitInspection(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quality.inspections() });
      queryClient.invalidateQueries({ queryKey: queryKeys.quality.ncrs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.quality.summary });
    },
    ...options,
  });
}

export function useNcrs(
  params: Vars<typeof api.ncrs>[0] = {},
  options?: QueryOptions<Result<typeof api.ncrs>>,
) {
  return useQuery({
    queryKey: queryKeys.quality.ncrs(params),
    queryFn: () => api.ncrs(params),
    ...options,
  });
}

export function useNcr(id: number, options?: QueryOptions<Result<typeof api.ncr>>) {
  return useQuery({
    queryKey: queryKeys.quality.ncr(id),
    queryFn: () => api.ncr(id),
    enabled: id > 0,
    ...options,
  });
}

export function useAdvanceNcr(
  options?: UseMutationOptions<Result<typeof api.advanceNcr>, Error, { id: number; body: Vars<typeof api.advanceNcr>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Vars<typeof api.advanceNcr>[1] }) =>
      api.advanceNcr(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quality.ncrs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.quality.summary });
    },
    ...options,
  });
}

// ── Machines ────────────────────────────────────────────────────────────────

export function useMachines(
  workCenter?: string,
  options?: QueryOptions<Result<typeof api.machines>>,
) {
  return useQuery({
    queryKey: queryKeys.machines.list(workCenter),
    queryFn: () => api.machines(workCenter),
    ...options,
  });
}

export function useWorkCenters(options?: QueryOptions<Result<typeof api.workCenters>>) {
  return useQuery({ queryKey: queryKeys.machines.workCenters, queryFn: api.workCenters, ...options });
}

export function useMachineSummary(options?: QueryOptions<Result<typeof api.machineSummary>>) {
  return useQuery({ queryKey: queryKeys.machines.summary, queryFn: api.machineSummary, ...options });
}

export function useDowntimeAnalytics(
  days = 30,
  options?: QueryOptions<Result<typeof api.downtimeAnalytics>>,
) {
  return useQuery({
    queryKey: queryKeys.machines.downtime(days),
    queryFn: () => api.downtimeAnalytics(days),
    ...options,
  });
}

export function useSetMachineStatus(
  options?: UseMutationOptions<
    Result<typeof api.setMachineStatus>,
    Error,
    { id: number; status: MachineStatus; note?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: MachineStatus; note?: string }) =>
      api.setMachineStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.summary });
    },
    ...options,
  });
}

export function useAssignMachineJob(
  options?: UseMutationOptions<Result<typeof api.assignMachineJob>, Error, { id: number; body: Vars<typeof api.assignMachineJob>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Vars<typeof api.assignMachineJob>[1] }) =>
      api.assignMachineJob(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.summary });
    },
    ...options,
  });
}

export function useReportDowntime(
  options?: UseMutationOptions<
    Result<typeof api.reportDowntime>,
    Error,
    { id: number; reason: string; note?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, note }: { id: number; reason: string; note?: string }) =>
      api.reportDowntime(id, reason, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.downtime() });
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.summary });
    },
    ...options,
  });
}

export function useResolveDowntime(
  options?: UseMutationOptions<Result<typeof api.resolveDowntime>, Error, { stopId: number; body: Vars<typeof api.resolveDowntime>[1] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stopId, body }: { stopId: number; body: Vars<typeof api.resolveDowntime>[1] }) =>
      api.resolveDowntime(stopId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.downtime() });
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.summary });
    },
    ...options,
  });
}

// ── Material requests ───────────────────────────────────────────────────────

export function useMaterialRequests(
  options?: QueryOptions<Result<typeof api.materialRequests>>,
) {
  return useQuery({
    queryKey: queryKeys.materialRequests.list,
    queryFn: api.materialRequests,
    ...options,
  });
}

export function useCreateMaterialRequest(
  options?: UseMutationOptions<
    Result<typeof api.createMaterialRequest>,
    Error,
    Vars<typeof api.createMaterialRequest>[0]
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createMaterialRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.list });
    },
    ...options,
  });
}

export function useFulfilMaterialRequest(
  options?: UseMutationOptions<
    Result<typeof api.fulfilMaterialRequest>,
    Error,
    { id: number; warehouse?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, warehouse }: { id: number; warehouse?: string }) =>
      api.fulfilMaterialRequest(id, warehouse),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stock });
    },
    ...options,
  });
}

export function useCancelMaterialRequest(
  options?: UseMutationOptions<Result<typeof api.cancelMaterialRequest>, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.cancelMaterialRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.list });
    },
    ...options,
  });
}

export function useStockSearch(q: string, options?: QueryOptions<Result<typeof api.stockSearch>>) {
  return useQuery({
    queryKey: queryKeys.stores.stockSearch(q),
    queryFn: () => api.stockSearch(q),
    enabled: q.length >= 2,
    ...options,
  });
}

// ── Search ──────────────────────────────────────────────────────────────────

export function useGlobalSearch(q: string, options?: QueryOptions<SearchResponse>) {
  return useQuery({
    queryKey: queryKeys.search.global(q),
    queryFn: () => api.search(q),
    enabled: q.length >= 2,
    ...options,
  });
}