import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/backend';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICard } from '@/components/shared/KPICard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserMinus, ClipboardList, AlertTriangle, TrendingDown, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ active: 0, exited: 0, transactions: 0, withoutForms: 0, exitsThisMonth: 0, exitedNoReturn: 0 });
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      // Stats are computed server-side via SECURITY DEFINER RPC.
      // No client-side read of people table is needed; SBC sees only their own
      // transaction-derived counts, admin/DM see global aggregates.
      const [statsRes, recentRes] = await Promise.all([
        supabase.rpc('get_dashboard_stats' as any),
        supabase.from('equipment_transactions_safe').select('*, people(sales_name, pers_id)').order('created_at', { ascending: false }).limit(10),
      ]);

      const s = (statsRes.data || {}) as {
        active?: number; exited?: number; exits_this_month?: number;
        transactions?: number; without_forms?: number; exited_no_return?: number;
      };

      setStats({
        active: s.active ?? 0,
        exited: s.exited ?? 0,
        transactions: s.transactions ?? 0,
        withoutForms: s.without_forms ?? 0,
        exitsThisMonth: s.exits_this_month ?? 0,
        exitedNoReturn: s.exited_no_return ?? 0,
      });
      setRecentTx(recentRes.data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Overview of equipment management" />

        {/* Priority Alert */}
        {stats.exitedNoReturn > 0 && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-destructive/10 p-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-destructive">{stats.exitedNoReturn} exited this month without return form</p>
                  <p className="text-sm text-muted-foreground">These employees need equipment return processing</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/reports')} className="border-destructive/20 text-destructive hover:bg-destructive/10">
                View <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KPICard title="Active Employees" value={stats.active} icon={Users} subtitle="Currently assigned" />
          <KPICard title="Exits This Month" value={stats.exitsThisMonth} icon={UserMinus} subtitle={format(new Date(), 'MMMM yyyy')} trend={stats.exitsThisMonth > 0 ? 'down' : 'neutral'} />
          <KPICard title="Total Transactions" value={stats.transactions} icon={ClipboardList} subtitle="All time" />
          <KPICard title="Missing Forms" value={stats.withoutForms} icon={AlertTriangle} subtitle="Need attention" trend={stats.withoutForms > 0 ? 'down' : 'neutral'} />
          <KPICard title="No Return Form" value={stats.exitedNoReturn} icon={TrendingDown} subtitle="Exited, no return" trend={stats.exitedNoReturn > 0 ? 'down' : 'neutral'} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/transactions')}>
              View all <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : recentTx.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No transactions yet</p>
                <p className="text-sm mt-1">Equipment transactions will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={tx.transaction_type === 'Uitgifte' ? 'completed' : 'pending'} />
                      <div>
                        <p className="text-sm font-semibold">{tx.people?.sales_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.transaction_type} · Pers ID {tx.people?.pers_id}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), 'dd MMM yyyy')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
