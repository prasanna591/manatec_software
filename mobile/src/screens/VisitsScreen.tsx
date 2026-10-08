import { useCallback, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api } from '../api/client';
import type { Visit, VisitCloseBody, VisitStatus, VisitSummary } from '../api/types';
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
  Monogram,
  Row,
  SectionHeader,
  StatTile,
  SuccessBanner,
  TextField,
} from '../components/ui';
import { usePressFeedback } from '../motion';
import { colors, formatDate, formatDateTime, spacing, typography } from '../theme';

const STATUS_COLOR: Record<VisitStatus, string> = {
  created: colors.muted,
  confirmed: colors.info,
  on_the_way: colors.violet,
  arrived: colors.teal,
  meeting: colors.primary,
  follow_up: colors.warn,
  completed: colors.ok,
  cancelled: colors.danger,
};

const TYPE_LABEL: Record<string, string> = {
  supplier: 'Supplier',
  customer: 'Customer',
  buyer: 'Buyer',
  vendor: 'Vendor',
  guest: 'Guest',
  official: 'Official',
  other: 'Other',
};

const FILTERS: { key: 'open' | 'mine' | 'all'; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Mine' },
  { key: 'all', label: 'All' },
];

export default function VisitsScreen() {
  const { user, can } = useAuth();
  const mayView = can('Visits', 'view');
  const mayCreate = can('Visits', 'create');
  const mayTrack = can('BuyerTracking', 'view');

  const [scope, setScope] = useState<'open' | 'mine' | 'all'>('open');
  const [rows, setRows] = useState<Visit[]>([]);
  const [summary, setSummary] = useState<VisitSummary | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!mayView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [list, sum] = await Promise.all([api.visits({ scope }), api.visitSummary()]);
      setRows(list);
      setSummary(sum);
    } catch (e) {
      setError(messageOf(e, 'Failed to load visits'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mayView, scope]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Advance a visit to the next state the API offers, then reload. */
  const advance = useCallback(
    async (visit: Visit, to: VisitStatus) => {
      setBusyId(visit.id);
      setError(null);
      try {
        await api.moveVisit(visit.id, to);
        setFlash(`${visit.visit_no} → ${to.replace(/_/g, ' ')}`);
        await load();
      } catch (e) {
        setError(messageOf(e, 'Could not update the visit'));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  /** Records the outcome, which the API requires before a visit can complete. */
  const close = useCallback(
    async (visit: Visit, body: VisitCloseBody) => {
      setBusyId(visit.id);
      setError(null);
      try {
        const done = await api.closeVisit(visit.id, body);
        setClosingId(null);
        setFlash(`${done.visit_no} closed`);
        await load();
      } catch (e) {
        setError(messageOf(e, 'Could not close the visit'));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  // Expanding only reveals the actions the API already offered in `valid_transitions`,
  // so it never needs a round trip.
  const toggle = useCallback((visit: Visit) => {
    setExpanded((current) => (current === visit.id ? null : visit.id));
  }, []);

  if (!mayView) return <AccessDenied module="Visits" action="view" />;
  if (loading) return <ListSkeleton rows={5} label="Loading visits" />;

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {flash ? <SuccessBanner message={flash} /> : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListHeaderComponent={
          <>
            {summary ? (
              <View style={styles.tiles}>
                <StatTile label="Today" value={summary.today} tone={colors.primary} />
                <StatTile label="On the way" value={summary.on_the_way} tone={colors.violet} />
                <StatTile label="In meeting" value={summary.in_meeting} tone={colors.teal} />
              </View>
            ) : null}

            {summary && (summary.awaiting_confirmation > 0 || summary.followups_due > 0) ? (
              <View style={styles.alerts}>
                {summary.awaiting_confirmation > 0 ? (
                  <Badge
                    label={`${summary.awaiting_confirmation} awaiting confirmation`}
                    color={colors.info}
                  />
                ) : null}
                {summary.followups_due > 0 ? (
                  <Badge
                    label={`${summary.followups_due} follow-up${summary.followups_due === 1 ? '' : 's'} due`}
                    color={colors.warn}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.filters}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  active={scope === f.key}
                  onPress={() => setScope(f.key)}
                />
              ))}
            </View>

            {mayCreate ? (
              <Button
                label={showForm ? 'Close the form' : '+ Raise a visit'}
                variant={showForm ? 'secondary' : 'primary'}
                compact
                style={styles.raise}
                icon={
                  <Ionicons
                    name={showForm ? 'close' : 'person-add'}
                    size={15}
                    color={showForm ? colors.text : '#ffffff'}
                  />
                }
                onPress={() => setShowForm((s) => !s)}
              />
            ) : null}

            {showForm && mayCreate ? (
              <RaiseVisitForm
                hostName={user?.employee?.name ?? user?.username ?? ''}
                onDone={async (no) => {
                  setShowForm(false);
                  setFlash(`${no} raised`);
                  await load();
                }}
                onError={setError}
              />
            ) : null}

            {mayTrack ? (
              <BuyerTrackingPanel onError={setError} />
            ) : (
              <Text style={styles.scopeNote}>
                Visitor locations are restricted to security and management.
              </Text>
            )}

            <SectionHeader label={`${rows.length} visit${rows.length === 1 ? '' : 's'}`} />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="No visits here"
            hint="Raise one and the host department picks it up from here."
          />
        }
        renderItem={({ item }) => (
          <VisitCard
            visit={item}
            expanded={expanded === item.id}
            busy={busyId === item.id}
            onToggle={() => toggle(item)}
            onAdvance={(to) => void advance(item, to)}
            onError={setError}
            closing={closingId === item.id}
            onToggleClose={() =>
              setClosingId((c) => (c === item.id ? null : item.id))
            }
            onClose={(body) => void close(item, body)}
          />
        )}
      />
    </View>
  );
}

function VisitCard({
  visit,
  expanded,
  busy,
  onToggle,
  onAdvance,
  onError,
  closing,
  onToggleClose,
  onClose,
}: {
  visit: Visit;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onAdvance: (to: VisitStatus) => void;
  onError: (message: string) => void;
  closing: boolean;
  onToggleClose: () => void;
  onClose: (body: VisitCloseBody) => void;
}) {
  const { user } = useAuth();
  const closed = visit.status === 'completed' || visit.status === 'cancelled';

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Monogram label={visit.visitor_name} seed={visit.visit_no} size={40} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {visit.visitor_name}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
            {TYPE_LABEL[visit.visit_type] ?? visit.visit_type} · {visit.visit_no}
          </Text>
        </View>
        <Badge
          label={visit.status_label.toUpperCase()}
          color={STATUS_COLOR[visit.status] ?? colors.muted}
        />
      </View>

      <View style={styles.facts}>
        <Text style={typography.bodyMuted} numberOfLines={2}>
          {visit.company ? `${visit.company} · ` : ''}
          {visit.purpose || 'No purpose recorded'}
        </Text>
        <Text style={typography.caption}>
          {formatDate(visit.visit_date)} · {visit.expected_time || 'no time'} · Host{' '}
          {visit.host_name || 'unassigned'}
        </Text>
        {visit.food_arrangement !== 'none' ? (
          <Badge
            label={visit.food_arrangement.replace(/_/g, ' ').toUpperCase()}
            color={colors.orange}
          />
        ) : null}
        {visit.transport_required ? (
          <Badge label={visit.vehicle_no ? `TRANSPORT · ${visit.vehicle_no}` : 'TRANSPORT'} color={colors.teal} />
        ) : null}
        {visit.valid_transitions.length > 0 ? (
          <Badge label={`${visit.valid_transitions.length} NEXT STEP${visit.valid_transitions.length === 1 ? '' : 'S'}`} color={colors.primary} />
        ) : null}
      </View>

      <Button
        label={expanded ? 'Hide details' : 'Details & actions'}
        variant="secondary"
        compact
        style={styles.expandBtn}
        onPress={onToggle}
      />

      {expanded ? (
        <View style={styles.expanded}>
          <Divider />
          <KeyValue label="Department" value={visit.department_name || '—'} />
          <KeyValue label="Contact" value={visit.contact || '—'} />
          <KeyValue label="Requirement" value={visit.requirement || '—'} />
          <KeyValue label="Raised" value={formatDateTime(visit.created_at)} />
          <KeyValue label="Arrived" value={formatDateTime(visit.arrived_at)} />
          {visit.location && (visit.location.latitude !== null || visit.location.note) ? (
            <KeyValue
              label="Last location"
              value={
                visit.location.latitude !== null
                  ? `${visit.location.latitude.toFixed(4)}, ${(visit.location.longitude ?? 0).toFixed(4)}`
                  : visit.location.note
              }
            />
          ) : null}

          {visit.can_close ? (
            <Button
              label={closing ? 'Cancel closing' : 'Close with outcome'}
              variant={closing ? 'secondary' : 'success'}
              style={styles.actions}
              disabled={busy}
              onPress={onToggleClose}
            />
          ) : null}

          {!closed && visit.valid_transitions.length > 0 ? (
            <View style={styles.actions}>
              {visit.valid_transitions
                .filter((t) => canGrant(user, t.required_permission))
                .map((t) => (
                  <Button
                    key={t.target_status}
                    label={t.label}
                    compact
                    variant={t.action === 'cancel' ? 'danger' : 'primary'}
                    disabled={busy}
                    onPress={() => onAdvance(t.target_status as VisitStatus)}
                  />
                ))}
            </View>
          ) : null}

          {closing ? (
            <CloseVisitForm busy={busy} onCancel={onToggleClose} onSubmit={onClose} />
          ) : null}

          <AddNote visitId={visit.id} disabled={busy} onError={onError} />
        </View>
      ) : null}
    </Card>
  );
}

function AddNote({
  visitId,
  disabled,
  onError,
}: {
  visitId: number;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = useCallback(async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.addVisitNote(visitId, body.trim());
      setBody('');
      setSaved(true);
    } catch (e) {
      onError(messageOf(e, 'Could not add the note'));
    } finally {
      setBusy(false);
    }
  }, [body, onError, visitId]);

  return (
    <View style={styles.noteBlock}>
      <TextField
        label="Add a note"
        multiline
        placeholder="What happened at the meeting"
        value={body}
        onChangeText={(v) => {
          setBody(v);
          setSaved(false);
        }}
      />
      <Row gap={spacing.md}>
        <Button label={saved ? 'Note added' : 'Save note'} compact disabled={disabled || busy} onPress={submit} />
      </Row>
    </View>
  );
}

/**
 * En-route buyers only. `api.buyerTracking()` returns 403 for roles without the
 * `BuyerTracking` module, so this panel is only mounted when the app already
 * knows the role has it.
 */
function BuyerTrackingPanel({ onError }: { onError: (message: string) => void }) {
  const [rows, setRows] = useState<Visit[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await api.buyerTracking());
    } catch (e) {
      onError(messageOf(e, 'Could not load buyer tracking'));
    } finally {
      setBusy(false);
    }
  }, [onError]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const enRoute = rows.filter((v) => v.status === 'on_the_way');

  return (
    <View style={styles.tracker}>
      <PressableRow
        onPress={() => setOpen((o) => !o)}
        label={`Buyer tracking · ${enRoute.length} en route`}
        expanded={open}
      />
      {open
        ? enRoute.map((v) => (
            <View key={v.id} style={styles.trackRow}>
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {v.visitor_name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {v.company || '—'} · {v.expected_time || 'no time'}
                </Text>
                {v.location?.note ? (
                  <Text style={typography.caption} numberOfLines={2}>
                    {v.location.note}
                  </Text>
                ) : null}
              </View>
              {v.location?.latitude !== null && v.location?.latitude !== undefined ? (
                <Badge label="LOCATED" color={colors.teal} />
              ) : (
                <Badge label="NO PING" color={colors.textLight} />
              )}
            </View>
          ))
        : null}
      {open && enRoute.length === 0 ? (
        <Text style={styles.scopeNote}>No buyer is currently on the way in.</Text>
      ) : null}
    </View>
  );
}

function PressableRow({
  label,
  onPress,
  expanded,
}: {
  label: string;
  onPress: () => void;
  expanded: boolean;
}) {
  const { onPressIn, onPressOut, animatedStyle } = usePressFeedback();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      hitSlop={8}
      style={styles.trackerToggleHit}
    >
      <Row gap={spacing.sm}>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.primary}
        />
        <Text style={styles.trackerToggle}>{label}</Text>
      </Row>
      <Animated.View style={animatedStyle} />
    </Pressable>
  );
}

function RaiseVisitForm({
  hostName,
  onDone,
  onError,
}: {
  hostName: string;
  onDone: (visitNo: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [type, setType] = useState<Visit['visit_type']>('supplier');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [purpose, setPurpose] = useState('');
  const [requirement, setRequirement] = useState('');
  const [host, setHost] = useState(hostName);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [food, setFood] = useState<Visit['food_arrangement']>('none');
  const [transport, setTransport] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!name.trim()) {
      onError('Visitor name is required.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.createVisit({
        visit_type: type,
        visitor_name: name.trim(),
        company: company.trim(),
        contact: contact.trim(),
        purpose: purpose.trim(),
        requirement: requirement.trim(),
        visit_date: date || null,
        expected_time: time,
        food_arrangement: food,
        transport_required: transport,
      });
      await onDone(created.visit_no);
    } catch (e) {
      onError(messageOf(e, 'Could not raise the visit'));
    } finally {
      setBusy(false);
    }
  }, [company, contact, date, food, name, onDone, onError, purpose, requirement, time, transport, type]);

  return (
    <Card level={2} style={styles.form}>
      <SectionHeader label="Raise a visit" />
      <View style={styles.filters}>
        {Object.entries(TYPE_LABEL).map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            active={type === key}
            onPress={() => setType(key as Visit['visit_type'])}
          />
        ))}
      </View>
      <TextField label="Visitor name" required value={name} onChangeText={setName} placeholder="Full name" />
      <TextField label="Company" value={company} onChangeText={setCompany} placeholder="Optional" />
      <TextField
        label="Contact"
        value={contact}
        onChangeText={setContact}
        placeholder="Phone or email"
        keyboardType="phone-pad"
      />
      <TextField
        label="Purpose"
        value={purpose}
        onChangeText={setPurpose}
        placeholder="Why are they coming?"
        containerStyle={styles.field}
      />
      <TextField
        label="Requirement"
        value={requirement}
        onChangeText={setRequirement}
        placeholder="Anything the host must arrange"
        containerStyle={styles.field}
      />
      <View style={styles.pair}>
        <TextField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          containerStyle={styles.pairItem}
        />
        <TextField
          label="Time"
          value={time}
          onChangeText={setTime}
          placeholder="10:00"
          containerStyle={styles.pairItem}
        />
      </View>
      <TextField
        label="Host"
        hint="The employee they are coming to see."
        value={host}
        onChangeText={setHost}
        containerStyle={styles.field}
      />
      <SectionHeader label="Hospitality" />
      <View style={styles.filters}>
        {(['none', 'refreshments', 'lunch', 'full_meals'] as const).map((f) => (
          <Chip
            key={f}
            label={f === 'none' ? 'None' : f.replace(/_/g, ' ')}
            active={food === f}
            onPress={() => setFood(f)}
          />
        ))}
      </View>
      <Chip
        label={transport ? 'Transport required' : 'No transport'}
        active={transport}
        onPress={() => setTransport((t) => !t)}
      />
      <Button label="Raise visit" loading={busy} onPress={submit} style={styles.submit} />
    </Card>
  );
}

const OUTCOMES: { key: keyof VisitCloseBody; label: string }[] = [
  { key: 'outcome_requirement', label: 'Requirement confirmed' },
  { key: 'outcome_sample', label: 'Sample given' },
  { key: 'outcome_purchase', label: 'Purchase agreed' },
  { key: 'outcome_followup', label: 'Needs a follow-up' },
];

/**
 * Closing records what was actually agreed. `next_action` is required because a
 * closed visit with nothing agreed is indistinguishable from a missed one, and
 * ticking "needs a follow-up" without a date would leave the task undated.
 */
function CloseVisitForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: VisitCloseBody) => void;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>({
    outcome_requirement: false,
    outcome_sample: false,
    outcome_purchase: false,
    outcome_followup: false,
  });
  const [nextAction, setNextAction] = useState('');
  const [followupDue, setFollowupDue] = useState('');
  const [touched, setTouched] = useState(false);

  const nothingPicked = !OUTCOMES.some((o) => outcomes[o.key]);
  const missingAction = nextAction.trim().length === 0;
  const missingDate = outcomes.outcome_followup && followupDue.trim().length === 0;
  const invalid = nothingPicked || missingAction || missingDate;

  return (
    <View style={styles.closeForm}>
      <SectionHeader label="Outcome of the meeting" />
      {OUTCOMES.map((o) => (
        <Chip
          key={o.key}
          label={outcomes[o.key] ? `✓ ${o.label}` : o.label}
          active={!!outcomes[o.key]}
          onPress={() =>
            setOutcomes((prev) => ({ ...prev, [o.key]: !prev[o.key] }))
          }
        />
      ))}

      <TextField
        label="Next action"
        required
        multiline
        placeholder="What happens now, and who owns it"
        value={nextAction}
        onChangeText={(v) => {
          setNextAction(v);
          setTouched(true);
        }}
        containerStyle={styles.field}
      />

      {outcomes.outcome_followup ? (
        <TextField
          label="Follow-up due"
          required
          hint="A dated task is created for the owning department."
          value={followupDue}
          onChangeText={(v) => {
            setFollowupDue(v);
            setTouched(true);
          }}
          placeholder="YYYY-MM-DD"
          containerStyle={styles.field}
        />
      ) : null}

      {touched && nothingPicked ? (
        <Text style={styles.formError}>Tick at least one outcome.</Text>
      ) : null}
      {touched && missingAction ? (
        <Text style={styles.formError}>Say what happens next.</Text>
      ) : null}
      {touched && missingDate ? (
        <Text style={styles.formError}>A follow-up needs a due date.</Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Close visit"
          variant="success"
          loading={busy}
          disabled={invalid}
          onPress={() =>
            onSubmit({
              outcome_requirement: !!outcomes.outcome_requirement,
              outcome_sample: !!outcomes.outcome_sample,
              outcome_purchase: !!outcomes.outcome_purchase,
              outcome_followup: !!outcomes.outcome_followup,
              next_action: nextAction.trim(),
              followup_due: outcomes.outcome_followup ? followupDue.trim() : null,
            })
          }
          style={styles.flex}
        />
        <Button label="Cancel" variant="secondary" compact onPress={onCancel} />
      </View>
    </View>
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
  scopeNote: { ...typography.caption, lineHeight: 17, marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.body, fontWeight: '700' },
  facts: { marginTop: spacing.md, gap: spacing.sm },
  expandBtn: { marginTop: spacing.lg },
  expanded: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  noteBlock: { marginTop: spacing.lg, gap: spacing.md },
  tracker: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  trackerToggleHit: { minHeight: 36, justifyContent: 'center' },
  trackerToggle: { ...typography.section, flex: 1 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  form: { marginBottom: spacing.lg, gap: spacing.md },
  field: { marginBottom: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
  submit: { marginTop: spacing.sm },
  closeForm: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.okSoft,
    gap: spacing.sm,
  },
  formError: { ...typography.caption, color: colors.danger, fontWeight: '600' },
});