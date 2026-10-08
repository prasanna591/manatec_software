import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api } from '../api/client';
import type {
  CheckResult,
  Inspection,
  InspectionKind,
  Ncr,
  NcrStatus,
  QualitySummary,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { canGrant } from '../auth/permissions';
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
  SectionHeader,
  StatTile,
  SuccessBanner,
  TextField,
} from '../components/ui';
import { colors, formatDate, formatDateTime, spacing, typography } from '../theme';

const RESULT_COLOR: Record<string, string> = {
  pending: colors.warn,
  pass: colors.ok,
  fail: colors.danger,
  rework: colors.orange,
};

const SEVERITY_COLOR: Record<string, string> = {
  minor: colors.info,
  major: colors.warn,
  critical: colors.danger,
};

const KINDS: { key: InspectionKind; label: string }[] = [
  { key: 'incoming', label: 'Incoming' },
  { key: 'in_process', label: 'In process' },
  { key: 'final', label: 'Final' },
];


export default function QualityScreen() {
  const { user, can } = useAuth();
  const mayView = can('Quality', 'view');
  const mayCreate = can('Quality', 'create');

  const [tab, setTab] = useState<'inspections' | 'ncrs'>('inspections');
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [ncrs, setNcrs] = useState<Ncr[]>([]);
  const [kind, setKind] = useState<InspectionKind>('incoming');
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!mayView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [sum, insp, list] = await Promise.all([
        api.qualitySummary(),
        api.inspections({ kind }),
        api.ncrs(),
      ]);
      setSummary(sum);
      setInspections(insp);
      setNcrs(list);
    } catch (e) {
      setError(messageOf(e, 'Failed to load quality data'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind, mayView]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!mayView) return <AccessDenied module="Quality" action="view" />;
  if (loading) return <ListSkeleton rows={5} label="Loading quality data" />;

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

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {flash ? <SuccessBanner message={flash} /> : null}
      </View>

      {tab === 'inspections' ? (
        <FlatList
          data={inspections}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={styles.list}
          refreshControl={refresh}
          ListHeaderComponent={
            <>
              {summary ? (
                <View style={styles.tiles}>
                  <StatTile
                    label="Pending"
                    value={summary.pending_total}
                    tone={colors.warn}
                />
                <StatTile
                  label="Failed"
                  value={summary.failed_total}
                  tone={colors.danger}
                />
                <StatTile
                  label="Open NCRs"
                  value={summary.ncr_open}
                  tone={colors.orange}
                />
              </View>
            ) : null}

            {summary && (summary.ncr_overdue > 0 || summary.ncr_critical > 0) ? (
              <View style={styles.alerts}>
                {summary.ncr_overdue > 0 ? (
                  <Badge label={`${summary.ncr_overdue} OVERDUE`} color={colors.danger} />
                ) : null}
                {summary.ncr_critical > 0 ? (
                  <Badge label={`${summary.ncr_critical} CRITICAL`} color={colors.danger} />
                ) : null}
                {summary.ncr_awaiting_verification > 0 ? (
                  <Badge
                    label={`${summary.ncr_awaiting_verification} AWAITING VERIFICATION`}
                    color={colors.info}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.filters}>
              <Chip
                label="Inspections"
                active
                onPress={() => undefined}
              />
              <Chip label="NCRs" active={false} onPress={() => setTab('ncrs')} />
            </View>

<View style={styles.filters}>
              {KINDS.map((k) => (
                <Chip
                  key={k.key}
                  label={k.label}
                  active={kind === k.key}
                  onPress={() => setKind(k.key)}
                />
              ))}
            </View>

            {mayCreate ? (
              <Button
                label={showForm ? 'Close the form' : '+ New inspection'}
                variant={showForm ? 'secondary' : 'primary'}
                compact
                style={styles.raise}
                onPress={() => setShowForm((s) => !s)}
              />
            ) : null}

            {showForm && mayCreate ? (
              <NewInspection
                kind={kind}
                onDone={async (no) => {
                  setShowForm(false);
                  setFlash(`${no} created`);
                  await load();
                }}
                onError={setError}
              />
            ) : null}

            <SectionHeader
              label={`${inspections.length} ${kind.replace('_', ' ')} inspection${inspections.length === 1 ? '' : 's'}`}
            />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="No inspections"
            hint="Raise one when material is received or a stage is signed off."
          />
        }
        renderItem={({ item }) => (
          <InspectionCard
            inspection={item}
            expanded={openId === item.id}
            onToggle={() => setOpenId((c) => (c === item.id ? null : item.id))}
            onDone={load}
            onError={setError}
            onFlash={setFlash}
          />
        )}
      />

      ) : (
        <FlatList
          data={ncrs}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={styles.list}
          refreshControl={refresh}
          ListHeaderComponent={
            <>
              <View style={styles.filters}>
                <Chip
                  label="Inspections"
                  active={false}
                  onPress={() => setTab('inspections')}
              />
              <Chip label="NCRs" active onPress={() => setTab('ncrs')} />
            </View>
            <SectionHeader label={`${ncrs.length} NCR${ncrs.length === 1 ? '' : 's'}`} />
          </>
        }
        ListEmptyComponent={
          <EmptyState title="No NCRs" hint="A failed inspection raises an NCR automatically." />
        }
        renderItem={({ item }) => (
          <NcrCard ncr={item} onDone={load} onError={setError} />
        )}
      />
      )}
    </View>
  );
}

function InspectionCard({
  inspection,
  expanded,
  onToggle,
  onDone,
  onError,
  onFlash,
}: {
  inspection: Inspection;
  expanded: boolean;
  onToggle: () => void;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
  onFlash: (message: string) => void;
}) {
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const pending = inspection.result === 'pending';
  const failed = Object.values(results).filter((r) => r === 'fail').length;
  const answered = Object.keys(results).length;

  const submit = useCallback(async () => {
    setBusy(true);
    onError('');
    try {
      const done = await api.submitInspection(inspection.id, {
        result: failed > 0 ? 'fail' : 'pass',
        checklist: inspection.default_checklist.map((c) => ({
          key: c.key,
          result: results[c.key] ?? 'pass',
        })),
        remarks: remarks.trim(),
        ncr_title: failed > 0 ? `${inspection.product_name || inspection.ref_no} failed ${inspection.kind_label.toLowerCase()}` : undefined,
        ncr_issue: remarks.trim(),
      });
      onFlash(
        done.ncr_id
          ? `${inspection.insp_no} failed — NCR raised`
          : `${inspection.insp_no} recorded as ${done.result}`,
      );
      setResults({});
      setRemarks('');
      await onDone();
    } catch (e) {
      onError(messageOf(e, 'Could not submit the inspection'));
    } finally {
      setBusy(false);
    }
  }, [failed, inspection, onDone, onError, onFlash, remarks, results]);

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {inspection.insp_no}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
            {inspection.kind_label}
            {inspection.ref_no ? ` · ${inspection.ref_no}` : ''}
            {inspection.product_name ? ` · ${inspection.product_name}` : ''}
          </Text>
        </View>
        <Badge
          label={inspection.result_label.toUpperCase()}
          color={RESULT_COLOR[inspection.result] ?? colors.muted}
        />
      </View>

      <View style={styles.facts}>
        <Badge
          label={inspection.severity.toUpperCase()}
          color={SEVERITY_COLOR[inspection.severity] ?? colors.muted}
        />
        <Text style={typography.caption}>
          {inspection.inspector_name || 'Unassigned'} · {formatDate(inspection.inspected_at)}
        </Text>
        {inspection.ncr_id ? <Badge label={`NCR #${inspection.ncr_id}`} color={colors.danger} /> : null}
      </View>

      <Button
        label={expanded ? 'Hide checklist' : `Checklist · ${inspection.default_checklist.length} items`}
        variant="secondary"
        compact
        style={styles.expandBtn}
        onPress={onToggle}
      />

      {expanded ? (
        <View style={styles.expanded}>
          <Divider />
          <SectionHeader label="Checklist" />
          {inspection.default_checklist.map((c) => (
            <View key={c.key} style={styles.checkRow}>
              <Text style={[styles.checkLabel, pending ? styles.checkLabelLive : null]}>
                {c.label}
              </Text>
              {pending ? (
                <View style={styles.checkControls}>
                  {(['pass', 'fail', 'na'] as const).map((r) => (
                    <Chip
                      key={r}
                      label={r.toUpperCase()}
                      active={results[c.key] === r}
                      onPress={() =>
                        setResults((prev) => ({
                          ...prev,
                          [c.key]: prev[c.key] === r ? 'pass' : r,
                        }))
                      }
                      accessibilityLabel={`${c.label}: ${r}`}
                    />
                  ))}
                </View>
              ) : (
                <Badge
                  label={(inspection.checklist.find((x) => x.key === c.key)?.result ?? 'na').toUpperCase()}
                  color={
                    inspection.checklist.find((x) => x.key === c.key)?.result === 'fail'
                      ? colors.danger
                      : colors.ok
                  }
                />
              )}
            </View>
          ))}

          {pending ? (
            <>
              <TextField
                label="Remarks"
                multiline
                placeholder={failed > 0 ? 'What is wrong, and what was measured?' : 'Anything worth recording'}
                value={remarks}
                onChangeText={setRemarks}
              />
              {failed > 0 ? (
                <Text style={styles.warn}>
                  {failed} failed check{failed === 1 ? '' : 's'} — submitting will raise an NCR.
                </Text>
              ) : null}
              <Button
                label={answered === 0 ? 'Submit all-pass' : `Submit · ${answered} checked`}
                loading={busy}
                onPress={submit}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function NcrCard({
  ncr,
  onDone,
  onError,
}: {
  ncr: Ncr;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rootCause, setRootCause] = useState('');
  const [corrective, setCorrective] = useState('');
  const [preventive, setPreventive] = useState('');
  const [verification, setVerification] = useState('');
  const [busy, setBusy] = useState(false);

  const advance = useCallback(
    async (to: NcrStatus) => {
      setBusy(true);
      try {
        await api.advanceNcr(ncr.id, {
          status: to,
          root_cause: rootCause.trim() || undefined,
          corrective_action: corrective.trim() || undefined,
          preventive_action: preventive.trim() || undefined,
          verification: verification.trim() || undefined,
        });
        onError('');
        await onDone();
      } catch (e) {
        onError(messageOf(e, 'Could not advance the NCR'));
      } finally {
        setBusy(false);
      }
    },
    [corrective, ncr.id, onDone, onError, preventive, rootCause, verification],
  );

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {ncr.ncr_no}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
            {ncr.title}
          </Text>
        </View>
        <Badge label={ncr.status_label.toUpperCase()} color={ncr.overdue ? colors.danger : colors.primary} />
      </View>

      <View style={styles.facts}>
        <Badge label={ncr.severity.toUpperCase()} color={SEVERITY_COLOR[ncr.severity] ?? colors.muted} />
        {ncr.overdue ? <Badge label="OVERDUE" color={colors.danger} /> : null}
        <Text style={typography.caption}>
          {ncr.assigned_name || 'Unassigned'} · due {formatDate(ncr.due_date)}
        </Text>
      </View>

      <Button
        label={open ? 'Hide' : 'Details & actions'}
        variant="secondary"
        compact
        style={styles.expandBtn}
        onPress={() => setOpen((o) => !o)}
      />

      {open ? (
        <View style={styles.expanded}>
          <Divider />
          <KeyValue label="Issue" value={ncr.issue || '—'} />
          <KeyValue label="Detected" value={formatDateTime(ncr.detected_at)} />
          <KeyValue label="Reference" value={ncr.ref_no || '—'} />
          {ncr.qty_affected > 0 ? (
            <KeyValue label="Qty affected" value={ncr.qty_affected} />
          ) : null}
          <KeyValue label="Root cause" value={ncr.root_cause || 'Not recorded'} />
          <KeyValue label="Corrective" value={ncr.corrective_action || 'Not recorded'} />
          <KeyValue label="Preventive" value={ncr.preventive_action || 'Not recorded'} />
          <KeyValue label="Verification" value={ncr.verification || 'Not recorded'} />

          {ncr.valid_transitions.length > 0 ? (
            <>
              <SectionHeader label="To move this forward" />
              {ncr.status === 'investigating' || ncr.status === 'open' ? (
                <TextField
                  label="Root cause"
                  required={ncr.valid_transitions.some((t) => t.target_status === 'investigating')}
                  value={rootCause}
                  onChangeText={setRootCause}
                  placeholder="What actually went wrong"
                  containerStyle={styles.field}
                />
              ) : null}
              {ncr.status === 'corrective' ? (
                <TextField
                  label="Corrective action"
                  value={corrective}
                  onChangeText={setCorrective}
                  placeholder="What was done to fix it"
                  containerStyle={styles.field}
                />
              ) : null}
              {ncr.status === 'verification' ? (
                <TextField
                  label="Verification evidence"
                  required
                  multiline
                  value={verification}
                  onChangeText={setVerification}
                  placeholder="How the fix was checked"
                  containerStyle={styles.field}
                />
              ) : null}
              <View style={styles.actions}>
                {ncr.valid_transitions
                  .filter((t) => canGrant(user, t.required_permission))
                  .map((t) => (
                    <Button
                      key={t.target_status}
                      label={t.label}
                      compact
                      variant={t.action === 'reject' ? 'danger' : 'primary'}
                      loading={busy}
                      onPress={() => void advance(t.target_status as NcrStatus)}
                    />
                  ))}
              </View>
            </>
          ) : (
            <Text style={styles.scopeNote}>
              This NCR is {ncr.status_label.toLowerCase()} — no further transitions.
            </Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}

function NewInspection({
  kind,
  onDone,
  onError,
}: {
  kind: InspectionKind;
  onDone: (inspNo: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [refNo, setRefNo] = useState('');
  const [product, setProduct] = useState('');
  const [serial, setSerial] = useState('');
  const [qty, setQty] = useState('1');
  const [severity, setSeverity] = useState<'minor' | 'major' | 'critical'>('minor');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      const created = await api.createInspection({
        kind,
        ref_no: refNo.trim(),
        product_name: product.trim(),
        serial_no: serial.trim(),
        qty: Number(qty) || 1,
        severity,
      });
      await onDone(created.insp_no);
    } catch (e) {
      onError(messageOf(e, 'Could not create the inspection'));
    } finally {
      setBusy(false);
    }
  }, [kind, onDone, onError, product, qty, refNo, serial, severity]);

  return (
    <Card level={2} style={styles.form}>
      <SectionHeader label={`New ${kind.replace('_', ' ')} inspection`} />
      <TextField
        label="Reference"
        hint="Purchase order, work order or batch the material came in against."
        value={refNo}
        onChangeText={setRefNo}
        placeholder="PO00001 / WO-22 / BATCH-A"
        containerStyle={styles.field}
      />
      <TextField
        label="Product"
        value={product}
        onChangeText={setProduct}
        placeholder="Item name"
        containerStyle={styles.field}
      />
      <TextField
        label="Serial number"
        value={serial}
        onChangeText={setSerial}
        placeholder="Optional"
        containerStyle={styles.field}
      />
      <TextField
        label="Quantity"
        value={qty}
        onChangeText={setQty}
        keyboardType="numeric"
        containerStyle={styles.field}
      />
      <SectionHeader label="Severity" />
      <View style={styles.filters}>
        {(['minor', 'major', 'critical'] as const).map((s) => (
          <Chip key={s} label={s} active={severity === s} onPress={() => setSeverity(s)} />
        ))}
      </View>
      <Button label="Create inspection" loading={busy} onPress={submit} />
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
  raise: { alignSelf: 'flex-start', marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.body, fontWeight: '700' },
  facts: { marginTop: spacing.md, gap: spacing.sm },
  expandBtn: { marginTop: spacing.lg },
  expanded: { gap: spacing.xs },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkLabel: { ...typography.caption, flex: 1 },
  checkLabelLive: { ...typography.body, color: colors.text },
  checkControls: { flexDirection: 'row', gap: spacing.sm },
  warn: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  scopeNote: { ...typography.caption, lineHeight: 17, marginTop: spacing.md },
  form: { marginBottom: spacing.lg, gap: spacing.md },
  field: { marginBottom: spacing.sm },
});