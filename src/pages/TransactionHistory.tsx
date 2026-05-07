import { useEffect, useState } from 'react';
import { usePagination } from '@/hooks/use-pagination';
import { TablePagination } from '@/components/shared/TablePagination';
import { supabase } from '@/lib/backend';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Download, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { buildCsv, downloadCsv } from '@/lib/csv-utils';
import { logAudit } from '@/lib/audit';
import type { EquipmentTransaction } from '@/types';

const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-excel',
];

export default function TransactionHistory() {
  const { user, role } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);

  useEffect(() => {
    async function fetch() {
      // Use safe view (excludes signatures + device details JSONB). RLS enforces SBC own-only server-side.
      const query = supabase.from('equipment_transactions_safe' as any).select('*, people(sales_name, pers_id, sales_id)').order('created_at', { ascending: false });
      const { data } = await query;
      setTransactions(data || []);
      setLoading(false);
    }
    fetch();
  }, [role, user]);

  const filtered = transactions.filter(tx => {
    const matchSearch = search === '' ||
      tx.people?.sales_name?.toLowerCase().includes(search.toLowerCase()) ||
      String(tx.people?.pers_id).includes(search);
    const matchType = filterType === 'all' || tx.transaction_type === filterType;
    return matchSearch && matchType;
  });

  const txPagination = usePagination({ totalItems: filtered.length });

  useEffect(() => { txPagination.resetPage(); }, [search, filterType]);

  const paginatedTx = filtered.slice(txPagination.startIndex, txPagination.endIndex);

  // Only admin can export transaction history
  const canExport = role === 'admin';

  const handleExportClick = () => {
    if (!canExport) return;
    if (filtered.length > 500) {
      setExportConfirmOpen(true);
    } else {
      doExport();
    }
  };

  const doExport = () => {
    const headers = ['Date', 'Type', 'Employee', 'Pers ID', 'Phone', 'Tablet', 'Demobox', 'Clothing', 'Toolkit', 'iZettle', 'Sales Binder', 'ID Card', 'Access Pass'];
    const rows = filtered.map(tx =>
      [tx.transaction_date, tx.transaction_type, tx.people?.sales_name, tx.people?.pers_id, tx.phone, tx.tablet, tx.demobox, tx.clothing, tx.toolkit, tx.izettle, tx.sales_binder, tx.id_card, tx.access_pass]
    );
    const csv = buildCsv(headers, rows);
    downloadCsv(csv, 'transactions.csv');
    logAudit('export', 'transactions', 'all', { row_count: filtered.length, filters: { search, filterType } });
    setExportConfirmOpen(false);
  };

  // Fetch full detail (including signatures) only for admin
  const handleViewDetail = async (tx: any) => {
    if (role === 'admin') {
      setDetailLoading(true);
      const { data } = await supabase
        .from('equipment_transactions')
        .select('*, people(sales_name, pers_id, sales_id)')
        .eq('id', tx.id)
        .single();
      setDetail(data || tx);
      setDetailLoading(false);
    } else {
      setDetail(tx);
    }
  };

  return (
    <AppLayout allowedRoles={['admin', 'sbc']}>
      <div className="space-y-6">
        <PageHeader title="Transaction History" description="View all equipment transactions">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportClick}><Download className="h-4 w-4 mr-1" /> Export</Button>
          )}
        </PageHeader>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Uitgifte">Handout</SelectItem>
              <SelectItem value="Ingeleverd">Return</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Pers ID</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>SBC</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [1,2,3,4].map(i => <TableRow key={i}>{[1,2,3,4,5,6,7].map(j => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                ) : (
                  paginatedTx.map(tx => {
                    const eqCount = [tx.phone, tx.tablet, tx.demobox, tx.clothing, tx.toolkit, tx.izettle, tx.sales_binder, tx.id_card, tx.access_pass].filter(Boolean).length;
                    return (
                      <TableRow key={tx.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm">{format(new Date(tx.transaction_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell><StatusBadge status={tx.transaction_type === 'Uitgifte' ? 'completed' : 'pending'} /></TableCell>
                        <TableCell className="font-medium">{tx.people?.sales_name}</TableCell>
                        <TableCell className="font-mono text-sm">{tx.people?.pers_id}</TableCell>
                        <TableCell className="text-sm">{eqCount} item{eqCount !== 1 ? 's' : ''}</TableCell>
                        <TableCell className="text-sm">{tx.sbc_name}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewDetail(tx)}><Eye className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <TablePagination
              currentPage={txPagination.currentPage}
              totalPages={txPagination.totalPages}
              pageSize={txPagination.pageSize}
              totalItems={filtered.length}
              startIndex={txPagination.startIndex}
              endIndex={txPagination.endIndex}
              hasNext={txPagination.hasNext}
              hasPrev={txPagination.hasPrev}
              onPageChange={txPagination.setPage}
              onPageSizeChange={txPagination.setPageSize}
            />
          </CardContent>
        </Card>

        <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Transaction Details</DialogTitle></DialogHeader>
            {detailLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">Loading details...</div>
            ) : detail && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Employee:</span> {detail.people?.sales_name}</div>
                  <div><span className="text-muted-foreground">Type:</span> {detail.transaction_type}</div>
                  <div><span className="text-muted-foreground">Date:</span> {detail.transaction_date}</div>
                  <div><span className="text-muted-foreground">SBC:</span> {detail.sbc_name}</div>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <h4 className="font-semibold">Equipment</h4>
                  {/* Non-admin roles see only equipment booleans (safe view excludes *_details) */}
                  {detail.phone && <div>📱 Phone{role === 'admin' && detail.phone_details ? `: ${detail.phone_details?.brand} — ${detail.phone_details?.verisure_number}` : ''}</div>}
                  {detail.tablet && <div>💻 Tablet{role === 'admin' && detail.tablet_details ? `: ${detail.tablet_details?.brand}` : ''}</div>}
                  {detail.demobox && <div>📦 Demobox{role === 'admin' && detail.demobox_details ? `: ${detail.demobox_details?.items?.join(', ')}` : ''}</div>}
                  {detail.clothing && <div>👕 Clothing{role === 'admin' && detail.clothing_details ? `: ${detail.clothing_details?.items?.join(', ')}` : ''}</div>}
                  {detail.toolkit && <div>🔧 Toolkit{role === 'admin' && detail.toolkit_details ? `: ${detail.toolkit_details?.complete ? 'Complete' : detail.toolkit_details?.missing_parts?.join(', ')}` : ''}</div>}
                  {detail.izettle && <div>💳 iZettle{role === 'admin' && detail.izettle_details ? `: ${detail.izettle_details?.damage}` : ''}</div>}
                  {detail.sales_binder && <div>📋 Sales Binder</div>}
                  {detail.id_card && <div>🪪 ID Card</div>}
                  {detail.access_pass && <div>🔑 Access Pass</div>}
                </div>
                {/* Signatures only visible for admin (fetched from base table) */}
                {role === 'admin' && (detail.employee_signature || detail.sbc_signature) && (
                  <div className="border-t pt-3 space-y-2">
                    <h4 className="font-semibold">Signatures</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {detail.employee_signature && (
                        <div><p className="text-xs text-muted-foreground mb-1">Employee</p><img src={detail.employee_signature} alt="Signature" className="border rounded h-20 w-full object-contain bg-white" /></div>
                      )}
                      {detail.sbc_signature && (
                        <div><p className="text-xs text-muted-foreground mb-1">SBC</p><img src={detail.sbc_signature} alt="Signature" className="border rounded h-20 w-full object-contain bg-white" /></div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Large export confirmation */}
        <Dialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirm Export</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              You are about to export <strong>{filtered.length}</strong> rows. This action will be logged.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportConfirmOpen(false)}>Cancel</Button>
              <Button onClick={doExport}>Export</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
