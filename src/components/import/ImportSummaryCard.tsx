import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { ParseStats } from '@/lib/import-parsers';
import type { DiffResult } from '@/lib/import-parsers';
import { CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, ArrowRight, Smartphone, Tablet, Box, Shirt, Wrench, CreditCard, ShieldCheck, ShieldAlert, ShieldX, Users, Info, Loader2 } from 'lucide-react';

interface ImportSummaryCardProps<T> {
  stats: ParseStats;
  diff: DiffResult<T> | null;
  fileName: string;
  missingPeopleCount: number;
  missingPeopleCreated: number;
  missingPeopleSkipped: number;
  onReviewImport: () => void;
  onResolveMissingPeople?: () => void;
  loading?: boolean;
}

const FIELD_CONFIG: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'phone', label: 'Phone', icon: <Smartphone className="h-3.5 w-3.5" /> },
  { key: 'tablet', label: 'Tablet', icon: <Tablet className="h-3.5 w-3.5" /> },
  { key: 'demobox', label: 'Demobox', icon: <Box className="h-3.5 w-3.5" /> },
  { key: 'clothing', label: 'Clothing', icon: <Shirt className="h-3.5 w-3.5" /> },
  { key: 'toolkit', label: 'Toolkit', icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: 'izettle', label: 'iZettle', icon: <CreditCard className="h-3.5 w-3.5" /> },
];

type ReadinessState = 'analyzing' | 'blocked' | 'review' | 'ready' | 'nothing_to_import';

function getReadiness<T>(
  diff: DiffResult<T> | null,
  missingPeopleCount: number,
  missingPeopleCreated: number,
  missingPeopleSkipped: number,
  stats: ParseStats,
): ReadinessState {
  const unresolved = missingPeopleCount - missingPeopleCreated - missingPeopleSkipped;

  // ANALYZING: diff not yet computed — neutral state, no action possible yet
  if (!diff) return 'analyzing';

  // BLOCKED: unresolved missing people — must be resolved before import can proceed
  if (unresolved > 0) return 'blocked';

  // NOTHING TO IMPORT: diff is ready but every row is a duplicate
  const allDups = diff.newRows.length === 0 && diff.warningRows.length === 0 && diff.errorRows.length === 0;
  if (allDups) return 'nothing_to_import';

  // NEEDS REVIEW: importable rows may exist, but issues require attention
  // — error rows are reviewable (clean rows can still be imported)
  // — warnings or date parse failures need manual inspection
  if (diff.errorRows.length > 0 || diff.warningRows.length > 0 || stats.dateParseFailures > 0) return 'review';

  // READY: no blockers, no warnings — safe to import
  return 'ready';
}

const readinessConfig: Record<ReadinessState, { label: string; icon: React.ReactNode; className: string }> = {
  analyzing: {
    label: 'Analyzing…',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'bg-muted text-muted-foreground border-border',
  },
  ready: {
    label: 'Ready to Import',
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  review: {
    label: 'Needs Review',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  blocked: {
    label: 'Blocked',
    icon: <ShieldX className="h-3.5 w-3.5" />,
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  nothing_to_import: {
    label: 'Nothing to Import',
    icon: <Info className="h-3.5 w-3.5" />,
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export function ImportSummaryCard<T>({
  stats, diff, fileName, missingPeopleCount, missingPeopleCreated, missingPeopleSkipped,
  onReviewImport, onResolveMissingPeople, loading,
}: ImportSummaryCardProps<T>) {
  const readiness = getReadiness(diff, missingPeopleCount, missingPeopleCreated, missingPeopleSkipped, stats);
  const badge = readinessConfig[readiness];
  const unresolved = missingPeopleCount - missingPeopleCreated - missingPeopleSkipped;

  const diffCounts = diff ? {
    new: diff.newRows.length,
    unchanged: diff.unchangedRows.length,
    warnings: diff.warningRows.length,
    errors: diff.errorRows.length,
  } : null;

  const readyRows = diffCounts ? diffCounts.new : 0;

  // Smart CTA — aligned with readiness state
  let ctaLabel = 'Review & Import';
  let ctaDisabled = false;
  let ctaAction = onReviewImport;
  let showCta = true;

  if (readiness === 'analyzing') {
    showCta = false;
  } else if (readiness === 'blocked' && onResolveMissingPeople) {
    ctaLabel = 'Resolve Missing People';
    ctaAction = onResolveMissingPeople;
  } else if (readiness === 'nothing_to_import') {
    ctaLabel = 'All Duplicates — Nothing to Import';
    ctaDisabled = true;
  } else if (diffCounts && diffCounts.errors > 0 && diffCounts.new === 0) {
    ctaLabel = 'Review Issues';
  }

  return (
    <Card className="mt-4 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Import Analysis Complete</h3>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
              {badge.icon}
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{fileName}</p>
        </div>
      </div>

      <CardContent className="pt-0 space-y-4">
        {/* A. File Intake */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">File Intake</p>
          <div className="grid grid-cols-3 gap-3">
            <MetricBlock value={stats.totalRawRows} label="Total Rows" />
            <MetricBlock value={stats.parsedRows} label="Parsed OK" color="emerald" />
            <MetricBlock
              value={stats.skippedNoPersId + stats.skippedNoDate}
              label="Skipped"
              color={stats.skippedNoPersId + stats.skippedNoDate > 0 ? 'amber' : undefined}
            />
          </div>
        </div>

        {/* B. Entity Resolution */}
        {missingPeopleCount > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Entity Resolution</p>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <span className="text-muted-foreground">Missing detected: <strong className="text-foreground">{missingPeopleCount}</strong></span>
                <span className="text-emerald-600">Created: <strong>{missingPeopleCreated}</strong></span>
                <span className="text-muted-foreground">Skipped: <strong>{missingPeopleSkipped}</strong></span>
                {unresolved > 0 && (
                  <span className="text-destructive font-medium">Unresolved: <strong>{unresolved}</strong></span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* C. Diff Result */}
        {diffCounts && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Diff Result</p>
            <div className="grid grid-cols-4 gap-2">
              <DiffPill label="New" count={diffCounts.new} color="emerald" icon={<CheckCircle2 className="h-3 w-3" />} />
              <DiffPill label="Duplicate" count={diffCounts.unchanged} color="muted" />
              <DiffPill label="Warnings" count={diffCounts.warnings} color="amber" icon={<AlertTriangle className="h-3 w-3" />} tooltip="Importable but flagged for review" />
              <DiffPill label="Errors" count={diffCounts.errors} color="destructive" icon={<XCircle className="h-3 w-3" />} tooltip="Not importable without correction" />
            </div>
          </div>
        )}

        {/* D. Success Rate */}
        {diff && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 text-sm">
            <span className="font-bold tabular-nums text-foreground">{readyRows.toLocaleString()}</span>
            <span className="text-muted-foreground">of</span>
            <span className="font-bold tabular-nums text-foreground">{stats.totalRawRows.toLocaleString()}</span>
            <span className="text-muted-foreground">rows ready</span>
          </div>
        )}

        {/* E. Field Coverage (secondary) */}
        {stats.parsedRows > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Field Coverage</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {FIELD_CONFIG.map(({ key, label, icon }) => {
                const count = stats.fieldCoverage[key] || 0;
                const pct = Math.round((count / stats.parsedRows) * 100);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{icon}</span>
                    <span className="text-xs text-foreground w-16">{label}</span>
                    <div className="flex-1">
                      <Progress value={pct} className="h-1.5" />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Date validity */}
        {stats.dateParseFailures > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-600 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {stats.dateParseFailures} rows with unparseable dates
          </div>
        )}

        {/* F. Smart CTA */}
        {showCta && (
          <Button onClick={ctaAction} disabled={loading || ctaDisabled} className="w-full gap-2">
            {ctaLabel}
            {!ctaDisabled && <ArrowRight className="h-4 w-4" />}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBlock({ value, label, color }: { value: number; label: string; color?: 'emerald' | 'amber' }) {
  const bg = color === 'emerald' ? 'bg-emerald-500/10' : color === 'amber' ? 'bg-amber-500/10' : 'bg-muted/50';
  const text = color === 'emerald' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-600' : '';
  return (
    <div className={`rounded-lg ${bg} p-3 text-center`}>
      <p className={`text-lg font-bold tabular-nums ${text}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function DiffPill({ label, count, color, icon, tooltip }: { label: string; count: number; color: string; icon?: React.ReactNode; tooltip?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
    destructive: 'bg-destructive/10 text-destructive',
    muted: 'bg-muted text-muted-foreground',
  };

  return (
    <div className={`rounded-lg p-2 text-center ${colorMap[color] || colorMap.muted}`} title={tooltip}>
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className="text-sm font-bold tabular-nums">{count.toLocaleString()}</span>
      </div>
      <p className="text-[10px] mt-0.5">{label}</p>
    </div>
  );
}
