import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { DowntimeAnalytics, Machine, MachineStatus, MachineSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { messageOf } from '../auth/session';
import {
  AccessDenied,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorBanner,
  KeyValue,
  ListSkeleton,
  Meter,
  SectionHeader,
  StatTile,
  SuccessBanner,
  TextField,
} from '../components/ui';
import { colors, spacing, typography } from '../theme';

const STATUS_COLOR: Record<MachineStatus, string> = {
  running: colors.ok,
  idle: colors.textLight,
  setup: colors.info,
  maintenance: colors.warn,
  down: colors.danger,
  offline: colors.muted,
};

/** Label for the reason codes in `DOWNTIME_REASONS`, kept next to the palette. */
const REASON_LABEL: Record<string, string> = {
  tool_breakage: 'Tool breakage',
  material_unavailable: 'Material unavailable',
  machine_fault: 'Machine fault',
  setup: 'Setup / changeover',
  maintenance: 'Planned maintenance',
  power_failure: 'Power failure',
  operator_unavailable: 'Operator unavailable',
  quality_issue: 'Quality hold',
  other: 'Other',
};

export default function MachineShopScreen() {
  const { can } = useAuth();
  const mayView = can('Machines', 'view');
  const mayEdit = can('Machines', 'edit');

  const [tab, setTab] = useState<'shop' | 'downtime'>('shop');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [summary, setSummary] = useState<MachineSummary | null>(null);
  const [analytics, setAnalytics] = useState<DowntimeAnalytics | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!mayView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [list, sum, down] = await Promise.all([
        api.machines(),
        api.machineSummary(),
        api.downtimeAnalytics(30),
      ]);
      setMachines(list);
      setSummary(sum);
      setAnalytics(down);
    } catch (e) {
      setError(messageOf(e, 'Failed to load the machine shop'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mayView]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Every mutation goes through here so a failure surfaces once, not per control. */
  const run = useCallback(
    async (id: number, fn: () => Promise<unknown>, done: string) => {
      setBusyId(id);
      setError(null);
      try {
        await fn();
        setFlash(done);
        await load();
      } catch (e) {
        setError(messageOf(e, 'Action failed'));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (!mayView) return <AccessDenied module="Machines" action="view" />;
  if (loading) return <ListSkeleton rows={5} label="Loading the machine shop" />;

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={colors.primary}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    />
  );

  const tabSwitcher = (
    <View style={styles.filters}>
      <Chip label="Machines" active={tab === 'shop'} onPress={() => setTab('shop')} />
      <Chip
        label="Downtime"
        active={tab === 'downtime'}
        onPress={() => setTab('downtime')}
      />
    </View>
  );

  if (tab === 'downtime') {
    return (
      <View style={styles.screen}>
        <View style={styles.bannerWrap}>
          {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
          {flash ? <SuccessBanner message={flash} /> : null}
        </View>
        <FlatList
          data={analytics?.by_machine ?? []}
          keyExtractor={(m) => String(m.machine_id)}
          contentContainerStyle={styles.list}
          refreshControl={refresh}
          ListHeaderComponent={
            <>
              {tabSwitcher}
              {analytics ? (
                <>
                  <View style={styles.tiles}>
                    <StatTile
                      label="Stops (30d)"
                      value={analytics.total_stops}
                      tone={colors.warn}
                    />
                    <StatTile
                      label="Lost hours"
                      value={`${Math.round(analytics.total_minutes / 60)}h`}
                      tone={colors.danger}
                    />
                  </View>

                  <SectionHeader label="Why machines stopped" />
                  <Card>
                    {analytics.by_reason.map((b, index) => (
                      <View key={b.reason}>
                        {index > 0 ? <Divider /> : null}
                        <View style={styles.reasonTop}>
                          <Text style={styles.reasonLabel} numberOfLines={1}>
                            {b.label}
                          </Text>
                          <Text style={styles.reasonMinutes}>
                            {b.minutes}m · {b.share_pct}%
                          </Text>
                        </View>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                width: `${Math.max(3, b.share_pct)}%`,
                                backgroundColor: colors.danger,
                              },
                            ]}
                          />
                        </View>
                        <Text style={typography.caption}>
                          {b.count} stop{b.count === 1 ? '' : 's'}
                          {b.open > 0 ? ` · ${b.open} still open` : ''}
                        </Text>
                      </View>
                    ))}
                    {analytics.by_reason.length === 0 ? (
                      <Text style={typography.caption}>No downtime recorded in this window.</Text>
                    ) : null}
                  </Card>

                  <SectionHeader label="Per machine" />
                </>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <EmptyState title="No downtime recorded" hint="Nothing has stopped in the last 30 days." />
          }
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{item.code}</Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {item.name} · {item.status_label}
                  </Text>
                </View>
                <Badge
                  label={`${item.downtime_minutes}m`}
                  color={item.downtime_minutes > 0 ? colors.danger : colors.ok}
                />
              </View>
              <View style={styles.meters}>
                <Meter label="Utilisation" value={item.utilization_pct} tone={colors.primary} />
                <Meter label="OEE" value={item.oee_pct} tone={colors.teal} />
                <Meter label="Tool life" value={item.tool_life_pct} tone={colors.warn} />
              </View>
            </Card>
          )}
          ListFooterComponent={
            analytics && analytics.recent.length > 0 ? (
              <View>
                <SectionHeader label="Recent stops" />
                {analytics.recent.slice(0, 10).map((r) => (
                  <Card key={r.id} style={styles.card}>
                    <View style={styles.top}>
                      <View style={styles.flex}>
                        <Text style={styles.name}>{r.machine_code}</Text>
                        <Text style={typography.caption} numberOfLines={1}>
                          {r.reason_label} · {r.reported_by || 'unattributed'}
                        </Text>
                      </View>
                      <Badge
                        label={r.open ? 'OPEN' : `${r.minutes}m`}
                        color={r.open ? colors.danger : colors.muted}
                      />
                    </View>
                    {r.resolution ? (
                      <Text style={styles.resolution} numberOfLines={2}>
                        {r.resolution}
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </View>
            ) : null
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {flash ? <SuccessBanner message={flash} /> : null}
      </View>

      <FlatList
        data={machines}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.list}
        refreshControl={refresh}
        ListHeaderComponent={
          <>
            {tabSwitcher}

            {summary ? (
              <>
                <View style={styles.tiles}>
                  <StatTile label="Running" value={summary.running} tone={colors.ok} />
                  <StatTile label="Down" value={summary.down} tone={colors.danger} />
                  <StatTile
                    label="Utilisation"
                    value={`${summary.utilization_pct}%`}
                    tone={colors.primary}
                  />
                </View>

                {summary.low_tool_life.length > 0 ? (
                  <View style={styles.alerts}>
                    {summary.low_tool_life.map((m) => (
                      <Badge
                        key={m.id}
                        label={`${m.code} TOOL ${m.tool_life_pct}%`}
                        color={m.tool_life_pct < 20 ? colors.danger : colors.warn}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}

            <SectionHeader label={`${machines.length} machines`} />
          </>
        }
        ListEmptyComponent={
          <EmptyState title="No machines registered" hint="Ask the administrator to add the machine register." />
        }
        renderItem={({ item }) => (
          <MachineCard
            machine={item}
            expanded={openId === item.id}
            busy={busyId === item.id}
            mayEdit={mayEdit}
            onToggle={() => setOpenId((c) => (c === item.id ? null : item.id))}
            onStatus={(status) =>
              void run(
                item.id,
                () => api.setMachineStatus(item.id, status),
                `${item.code} set to ${status}`,
              )
            }
            onJob={(ref, part, operator) =>
              void run(
                item.id,
                () =>
                  api.assignMachineJob(item.id, {
                    job_ref: ref,
                    part_no: part,
                    operator_name: operator,
                  }),
                `${item.code} running ${ref}`,
              )
            }
            onDown={(reason, note) =>
              void run(
                item.id,
                () => api.reportDowntime(item.id, reason, note),
                `${item.code} marked down`,
              )
            }
            onResolve={(stopId, resolution) =>
              void run(
                item.id,
                () => api.resolveDowntime(stopId, { resolution }),
                `${item.code} back in service`,
              )
            }
          />
        )}
      />
    </View>
  );
}

function MachineCard({
  machine,
  expanded,
  busy,
  mayEdit,
  onToggle,
  onStatus,
  onJob,
  onDown,
  onResolve,
}: {
  machine: Machine;
  expanded: boolean;
  busy: boolean;
  mayEdit: boolean;
  onToggle: () => void;
  onStatus: (status: MachineStatus) => void;
  onJob: (jobRef: string, partNo: string, operator: string) => void;
  onDown: (reason: string, note: string) => void;
  onResolve: (stopId: number, resolution: string) => void;
}) {
  const [jobRef, setJobRef] = useState('');
  const [partNo, setPartNo] = useState('');
  const [operator, setOperator] = useState('');
  const [reason, setReason] = useState('machine_fault');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${machine.code} ${machine.name}, ${machine.status_label}`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.top}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[machine.status] }]} />
          <View style={styles.flex}>
            <Text style={styles.name}>{machine.code}</Text>
            <Text style={typography.caption} numberOfLines={1}>
              {machine.name} · {machine.work_center}
            </Text>
          </View>
          <Badge
            label={machine.status_label.toUpperCase()}
            color={STATUS_COLOR[machine.status] ?? colors.muted}
          />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textLight}
          />
        </View>
      </Pressable>

      {machine.open_downtime ? (
        <View style={styles.downStrip}>
          <Ionicons name="warning" size={15} color={colors.danger} />
          <Text style={styles.downStripText}>
            {machine.open_downtime.reason_label} · {machine.open_downtime.minutes}m down
          </Text>
        </View>
      ) : null}

      {machine.current_job ? (
        <Text style={typography.caption}>
          {machine.current_job}
          {machine.part_no ? ` · ${machine.part_no}` : ''}
          {machine.running_minutes > 0 ? ` · ${machine.running_minutes}m elapsed` : ''}
        </Text>
      ) : null}

      <View style={styles.meters}>
        <Meter label="Utilisation" value={machine.utilization_pct} tone={colors.primary} />
        <Meter label="OEE" value={machine.oee_pct} tone={colors.teal} />
        <Meter label="Tool life" value={machine.tool_life_pct} tone={colors.warn} />
      </View>

      {!mayEdit ? null : expanded ? (
        <View style={styles.expanded}>
          <Divider />

          {machine.open_downtime ? (
            <>
              <SectionHeader label="Clear the stop" />
              <TextField
                label="Resolution"
                required
                multiline
                placeholder="What was replaced or done, and the machine released"
                value={resolution}
                onChangeText={setResolution}
                containerStyle={styles.field}
              />
              <Button
                label="Resolve & release"
                variant="success"
                loading={busy}
                disabled={!resolution.trim()}
                onPress={() => onResolve(machine.open_downtime!.id, resolution.trim())}
              />
              <SectionHeader label="Report a new stop" />
            </>
          ) : (
            <>
              <SectionHeader label="Report downtime" />
              <View style={styles.filters}>
                {Object.entries(REASON_LABEL).map(([key, label]) => (
                  <Chip
                    key={key}
                    label={label}
                    active={reason === key}
                    onPress={() => setReason(key)}
                  />
                ))}
              </View>
              <TextField
                label="Note"
                value={note}
                onChangeText={setNote}
                placeholder="Optional detail"
                containerStyle={styles.field}
              />
              <Button
                label="Mark machine down"
                variant="danger"
                loading={busy}
                onPress={() => onDown(reason, note.trim())}
              />
              <SectionHeader label="Start a job" />
            </>
          )}

          <TextField
            label="Job reference"
            value={jobRef}
            onChangeText={setJobRef}
            placeholder="PO00011 / WO-22"
            containerStyle={styles.field}
          />
          <TextField
            label="Part number"
            value={partNo}
            onChangeText={setPartNo}
            placeholder="Optional"
            containerStyle={styles.field}
          />
          <TextField
            label="Operator"
            value={operator}
            onChangeText={setOperator}
            placeholder="Optional"
            containerStyle={styles.field}
          />
          <Button
            label="Assign job"
            loading={busy}
            disabled={!jobRef.trim()}
            onPress={() => onJob(jobRef.trim(), partNo.trim(), operator.trim())}
          />

          <SectionHeader label="Set status" />
          <View style={styles.filters}>
            {(['idle', 'setup', 'maintenance', 'offline'] as const).map((s) => (
              <Chip
                key={s}
                label={s}
                active={machine.status === s}
                onPress={() => onStatus(s)}
              />
            ))}
          </View>

          {machine.notes ? (
            <Text style={styles.note} numberOfLines={3}>
              {machine.notes}
            </Text>
          ) : null}
        </View>
      ) : (
        <KeyValue label="Est. completion" value={machine.est_completion ?? '—'} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bannerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  tiles: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  alerts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  name: { ...typography.body, fontWeight: '700' },
  meters: { marginTop: spacing.md },
  downStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  downStripText: { ...typography.caption, color: colors.danger, fontWeight: '700', flex: 1 },
  expanded: { gap: spacing.xs },
  field: { marginBottom: spacing.sm },
  note: { ...typography.caption, marginTop: spacing.md, fontStyle: 'italic' },
  resolution: { ...typography.caption, marginTop: spacing.md },
  reasonTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  reasonLabel: { ...typography.body, fontWeight: '600', flex: 1 },
  reasonMinutes: { ...typography.caption, fontWeight: '700', color: colors.text },
  barTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.bgSoft,
    overflow: 'hidden',
    marginVertical: 6,
  },
  barFill: { height: '100%', borderRadius: 4 },
});