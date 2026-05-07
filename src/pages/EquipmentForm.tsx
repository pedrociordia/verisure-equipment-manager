import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/backend';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, ChevronRight, ChevronLeft, Check, Package, ArrowDownToLine, ArrowUpFromLine, Smartphone, Monitor, Box, Shirt, Wrench, CreditCard, BookOpen, IdCard, KeyRound, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { validateSignatureSize, MAX_SIGNATURE_SIZE } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import SignatureCanvas from 'react-signature-canvas';
import type { Person } from '@/types';
import { isValidImei } from '@/lib/debt';
import { AlertTriangle } from 'lucide-react';

const PHONE_DAMAGE = ['Geen Schade', 'Vergrendeld Google-Account/Telefoon Patroon', 'Gebroken Scherm', 'Niet Functionerend', 'Verloren of Gestolen'];
const TABLET_DAMAGE = ['Geen Schade', 'Vergrendeld Google-Account/Tablet Patroon', 'Gebroken Scherm', 'Niet Functionerend', 'Verloren of Gestolen'];
const IZETTLE_DAMAGE = ['Geen Schade', 'Deuken of Krassen', 'Gebroken Scherm', 'Niet Functionerend', 'Verloren of Gestolen'];

const defaultEq = {
  phone: false, phoneDetails: { verisure_number: '', brand: '', imei: '', sim_pin: '', charger: false, damage: 'Geen Schade' },
  tablet: false, tabletDetails: { brand: 'Dell Latitude 5440', laptop_number: '', charger: false, damage: 'Geen Schade' },
  demobox: false, demoboxDetails: { installation_number: '', items: [] as string[] },
  clothing: false, clothingDetails: { items: [] as string[] },
  toolkit: false, toolkitDetails: { complete: true, missing_parts: [] as string[] },
  izettle: false, izettleDetails: { damage: 'Geen Schade' },
  sales_binder: false, id_card: false, access_pass: false,
};

export default function EquipmentForm() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [phoneModels, setPhoneModels] = useState<string[]>([]);
  const [demoboxItems, setDemoboxItems] = useState<string[]>([]);
  const [clothingItems, setClothingItems] = useState<string[]>([]);
  const [toolkitItems, setToolkitItems] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [txType, setTxType] = useState<'Uitgifte' | 'Ingeleverd'>('Uitgifte');
  const [submitting, setSubmitting] = useState(false);
  const [eq, setEq] = useState({ ...defaultEq });
  const [prefillLoading, setPrefillLoading] = useState(false);

  const empSigRef = useRef<SignatureCanvas>(null);
  const sbcSigRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    async function load() {
      // Admin loads the full people list; SBC uses the scoped search RPC instead.
      const [pRes, pmRes, priceRes] = await Promise.all([
        role !== 'sbc'
          ? supabase.from('people').select('*').order('sales_name')
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('phone_models').select('name').eq('active', true),
        supabase.from('equipment_prices').select('category, item_name').eq('active', true),
      ]);
      if (role !== 'sbc') {
        setAllPeople((pRes.data ?? []) as Person[]);
      }
      setPhoneModels((pmRes.data || []).map(m => m.name));
      const prices = priceRes.data || [];
      setDemoboxItems(prices.filter(p => p.category === 'demobox').map(p => p.item_name));
      setClothingItems(prices.filter(p => p.category === 'clothing').map(p => p.item_name));
      setToolkitItems(prices.filter(p => p.category === 'toolkit').map(p => p.item_name));
    }
    load();
  }, [role]);

  // SBC: debounced scoped search via search_people_for_sbc RPC.
  // Never reads the full people table; returns max 50 minimum-field records.
  useEffect(() => {
    if (role !== 'sbc') return;
    if (searchQuery.trim().length < 2) {
      setAllPeople([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_people_for_sbc' as any, {
        query: searchQuery.trim(),
        include_exited: txType === 'Ingeleverd',
      });
      setAllPeople((data ?? []) as Person[]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, txType, role]);

  // Admin: apply client-side filtering over full list.
  // SBC: server-side RPC already filtered by query term and exit status.
  const people = role === 'sbc'
    ? allPeople
    : txType === 'Ingeleverd'
      ? allPeople
      : allPeople.filter(p => !p.exit_date);

  const filteredPeople = role === 'sbc'
    ? people
    : people.filter(p =>
        searchQuery === '' || p.sales_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(p.pers_id).includes(searchQuery) || p.sales_id.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Pre-fill equipment from latest Uitgifte when doing Ingeleverd
  const prefillFromHandout = useCallback(async (personId: string) => {
    if (txType !== 'Ingeleverd') return;
    setPrefillLoading(true);
    const { data } = await supabase
      .from('equipment_transactions')
      .select('*')
      .eq('person_id', personId)
      .eq('transaction_type', 'Uitgifte')
      .order('transaction_date', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const tx = data[0];
      setEq({
        phone: tx.phone,
        phoneDetails: tx.phone_details ? { ...(tx.phone_details as any), damage: 'Geen Schade' } : defaultEq.phoneDetails,
        tablet: tx.tablet,
        tabletDetails: tx.tablet_details ? { ...(tx.tablet_details as any), damage: 'Geen Schade' } : defaultEq.tabletDetails,
        demobox: tx.demobox,
        demoboxDetails: tx.demobox_details ? (tx.demobox_details as any) : defaultEq.demoboxDetails,
        clothing: tx.clothing,
        clothingDetails: tx.clothing_details ? (tx.clothing_details as any) : defaultEq.clothingDetails,
        toolkit: tx.toolkit,
        toolkitDetails: tx.toolkit_details ? (tx.toolkit_details as any) : defaultEq.toolkitDetails,
        izettle: tx.izettle,
        izettleDetails: tx.izettle_details ? { ...(tx.izettle_details as any), damage: 'Geen Schade' } : defaultEq.izettleDetails,
        sales_binder: tx.sales_binder,
        id_card: tx.id_card,
        access_pass: tx.access_pass,
      });
      toast({ title: 'Pre-filled from latest handout', description: 'Review and adjust items as needed.' });
    }
    setPrefillLoading(false);
  }, [txType, toast]);

  const handlePersonSelect = (p: Person) => {
    setSelectedPerson(p);
    if (txType === 'Ingeleverd') {
      prefillFromHandout(p.id);
    }
  };

  const handleSubmit = async () => {
    if (!selectedPerson || !user) return;
    setSubmitting(true);

    const empSig = empSigRef.current?.isEmpty() ? null : empSigRef.current?.toDataURL();
    const sbcSig = sbcSigRef.current?.isEmpty() ? null : sbcSigRef.current?.toDataURL();

    if (!empSig || !sbcSig) {
      toast({ title: 'Signatures required', description: 'Both signatures are mandatory', variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Validate signature size
    if (!validateSignatureSize(empSig)) {
      toast({ title: 'Signature too large', description: 'Employee signature is too complex. Please simplify and try again.', variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    if (!validateSignatureSize(sbcSig)) {
      toast({ title: 'Signature too large', description: 'SBC signature is too complex. Please simplify and try again.', variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    const hasEquipment = eq.phone || eq.tablet || eq.demobox || eq.clothing || eq.toolkit || eq.izettle || eq.sales_binder || eq.id_card || eq.access_pass;
    if (!hasEquipment) {
      toast({ title: 'No equipment selected', description: 'Select at least one equipment item', variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('equipment_transactions').insert({
      person_id: selectedPerson.id,
      transaction_type: txType,
      transaction_date: new Date().toISOString().split('T')[0],
      sbc_user_id: user.id,
      sbc_name: profile?.full_name || user.email,
      sbc_signature: sbcSig,
      employee_signature: empSig,
      phone: eq.phone,
      phone_details: eq.phone ? eq.phoneDetails : null,
      tablet: eq.tablet,
      tablet_details: eq.tablet ? eq.tabletDetails : null,
      demobox: eq.demobox,
      demobox_details: eq.demobox ? eq.demoboxDetails : null,
      clothing: eq.clothing,
      clothing_details: eq.clothing ? eq.clothingDetails : null,
      toolkit: eq.toolkit,
      toolkit_details: eq.toolkit ? eq.toolkitDetails : null,
      izettle: eq.izettle,
      izettle_details: eq.izettle ? eq.izettleDetails : null,
      sales_binder: eq.sales_binder,
      id_card: eq.id_card,
      access_pass: eq.access_pass,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Transaction saved successfully!' });
      logAudit('create', 'equipment_transaction', selectedPerson.id, { type: txType, person_pers_id: selectedPerson.pers_id });
      navigate('/transactions');
    }
    setSubmitting(false);
  };

  const steps = ['Select Employee', 'Transaction Type', 'Equipment', 'Signatures'];

  const toggleItem = (key: 'demoboxDetails' | 'clothingDetails' | 'toolkitDetails', itemsKey: 'items' | 'missing_parts', item: string) => {
    setEq(prev => {
      const det = prev[key] as any;
      const list: string[] = det[itemsKey];
      const next = list.includes(item) ? list.filter(i => i !== item) : [...list, item];
      return { ...prev, [key]: { ...det, [itemsKey]: next } };
    });
  };

  // When switching transaction type, reset equipment and person
  const handleTxTypeChange = (type: 'Uitgifte' | 'Ingeleverd') => {
    setTxType(type);
    if (selectedPerson && type === 'Ingeleverd') {
      prefillFromHandout(selectedPerson.id);
    } else {
      setEq({ ...defaultEq });
    }
  };

  const eqSections = [
    { key: 'phone', icon: Smartphone, label: 'Phone', color: 'text-blue-500' },
    { key: 'tablet', icon: Monitor, label: 'Tablet / Laptop', color: 'text-purple-500' },
    { key: 'demobox', icon: Box, label: 'Demobox', color: 'text-amber-500' },
    { key: 'clothing', icon: Shirt, label: 'Work Clothing', color: 'text-green-500' },
    { key: 'toolkit', icon: Wrench, label: 'Toolkit', color: 'text-orange-500' },
    { key: 'izettle', icon: CreditCard, label: 'iZettle', color: 'text-cyan-500' },
  ];

  // Summary for review
  const getEquipmentSummary = () => {
    const items: string[] = [];
    if (eq.phone) items.push(`Phone (${eq.phoneDetails.brand || 'No model'})`);
    if (eq.tablet) items.push('Tablet');
    if (eq.demobox) items.push(`Demobox (${eq.demoboxDetails.items.length} items)`);
    if (eq.clothing) items.push(`Clothing (${eq.clothingDetails.items.length} items)`);
    if (eq.toolkit) items.push(eq.toolkitDetails.complete ? 'Toolkit (Complete)' : `Toolkit (${eq.toolkitDetails.missing_parts.length} missing)`);
    if (eq.izettle) items.push('iZettle');
    if (eq.sales_binder) items.push('Sales Binder');
    if (eq.id_card) items.push('ID Card');
    if (eq.access_pass) items.push('Access Pass');
    return items;
  };

  return (
    <AppLayout allowedRoles={['admin', 'sbc']}>
      <div className="max-w-3xl mx-auto space-y-6">
        <PageHeader title="New Transaction" description="Record equipment handout or return" />

        {/* Progress Steps */}
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center justify-center h-10 w-10 rounded-full text-sm font-bold transition-all shrink-0 ${
                  i < step ? 'bg-success text-success-foreground cursor-pointer hover:opacity-80' :
                  i === step ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                  'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="h-5 w-5" /> : i + 1}
              </button>
              <span className={`text-sm hidden md:inline ${i <= step ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{s}</span>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded-full transition-colors ${i < step ? 'bg-success' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        {/* Step 0: Select Employee */}
        {step === 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> Select Employee</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name, Pers ID, or Sales ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-12" />
              </div>
              {txType === 'Ingeleverd' && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  Showing all employees (including exited) for returns
                </div>
              )}
              <div className="max-h-[400px] overflow-y-auto space-y-1.5">
                {filteredPeople.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">
                      {role === 'sbc' && searchQuery.trim().length < 2
                        ? 'Type at least 2 characters to search'
                        : 'No employees found'}
                    </p>
                  </div>
                ) : filteredPeople.slice(0, 50).map(p => (
                  <button
                    key={p.id}
                    onClick={() => handlePersonSelect(p)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      selectedPerson?.id === p.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                        : 'hover:bg-muted/50 hover:border-muted-foreground/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{p.sales_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Pers ID: {p.pers_id} · {p.sales_id} · {p.branch_name || 'No branch'}
                        </p>
                      </div>
                      {p.exit_date && (
                        <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">Exited</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <Button onClick={() => setStep(1)} disabled={!selectedPerson} className="w-full h-12 text-base">
                Continue <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Transaction Type */}
        {step === 1 && (
          <Card className="border-none shadow-lg">
            <CardHeader><CardTitle>Transaction Type</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">Employee</p>
                <p className="font-semibold text-lg">{selectedPerson?.sales_name}</p>
                <p className="text-xs text-muted-foreground">Pers ID: {selectedPerson?.pers_id} · {selectedPerson?.branch_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleTxTypeChange('Uitgifte')}
                  className={`rounded-2xl border-2 p-8 text-center transition-all ${
                    txType === 'Uitgifte'
                      ? 'border-success bg-success/5 shadow-md'
                      : 'border-border hover:border-success/40'
                  }`}
                >
                  <ArrowUpFromLine className={`h-8 w-8 mx-auto mb-3 ${txType === 'Uitgifte' ? 'text-success' : 'text-muted-foreground'}`} />
                  <p className="font-bold text-lg">Uitgifte</p>
                  <p className="text-sm text-muted-foreground mt-1">Equipment Handout</p>
                </button>
                <button
                  onClick={() => handleTxTypeChange('Ingeleverd')}
                  className={`rounded-2xl border-2 p-8 text-center transition-all ${
                    txType === 'Ingeleverd'
                      ? 'border-warning bg-warning/5 shadow-md'
                      : 'border-border hover:border-warning/40'
                  }`}
                >
                  <ArrowDownToLine className={`h-8 w-8 mx-auto mb-3 ${txType === 'Ingeleverd' ? 'text-warning' : 'text-muted-foreground'}`} />
                  <p className="font-bold text-lg">Ingeleverd</p>
                  <p className="text-sm text-muted-foreground mt-1">Equipment Return</p>
                </button>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(0)} className="h-12"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep(2)} className="flex-1 h-12 text-base">Continue <ChevronRight className="h-5 w-5 ml-1" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Equipment */}
        {step === 2 && (
          <div className="space-y-4">
            {prefillLoading && (
              <div className="rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground animate-pulse">
                Loading previous handout data...
              </div>
            )}

            {/* Phone */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2"><Smartphone className="h-5 w-5 text-blue-500" /></div>
                  <CardTitle className="text-base">Phone</CardTitle>
                </div>
                <Switch checked={eq.phone} onCheckedChange={v => setEq(p => ({ ...p, phone: v }))} />
              </CardHeader>
              {eq.phone && (
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Verisure Number (10 digits)</Label><Input maxLength={10} value={eq.phoneDetails.verisure_number} onChange={e => setEq(p => ({ ...p, phoneDetails: { ...p.phoneDetails, verisure_number: e.target.value } }))} /></div>
                    <div>
                      <Label>Brand / Model</Label>
                      <Select value={eq.phoneDetails.brand} onValueChange={v => setEq(p => ({ ...p, phoneDetails: { ...p.phoneDetails, brand: v } }))}>
                        <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                        <SelectContent>{phoneModels.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>IMEI (15 digits)</Label>
                      <Input
                        maxLength={15}
                        value={eq.phoneDetails.imei}
                        onChange={e => setEq(p => ({ ...p, phoneDetails: { ...p.phoneDetails, imei: e.target.value } }))}
                      />
                      {eq.phoneDetails.imei && !isValidImei(eq.phoneDetails.imei) && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-500">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>IMEI looks invalid (must be 15 digits and not a placeholder). You can still save, but phone debt will be calculated without it.</span>
                        </p>
                      )}
                    </div>
                    <div><Label>SIM PIN (4 digits)</Label><Input maxLength={4} value={eq.phoneDetails.sim_pin} onChange={e => setEq(p => ({ ...p, phoneDetails: { ...p.phoneDetails, sim_pin: e.target.value } }))} /></div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch checked={eq.phoneDetails.charger} onCheckedChange={v => setEq(p => ({ ...p, phoneDetails: { ...p.phoneDetails, charger: v } }))} />
                      <Label>Charger</Label>
                      <span className="text-xs text-muted-foreground">(€10 if not returned)</span>
                    </div>
                    <div className="flex-1">
                      <Label>Damage</Label>
                      <Select value={eq.phoneDetails.damage} onValueChange={v => setEq(p => ({ ...p, phoneDetails: { ...p.phoneDetails, damage: v } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PHONE_DAMAGE.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Tablet */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-purple-500/10 p-2"><Monitor className="h-5 w-5 text-purple-500" /></div>
                  <CardTitle className="text-base">Tablet / Laptop</CardTitle>
                </div>
                <Switch checked={eq.tablet} onCheckedChange={v => setEq(p => ({ ...p, tablet: v }))} />
              </CardHeader>
              {eq.tablet && (
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Brand</Label><Input disabled value={eq.tabletDetails.brand} /></div>
                    <div><Label>Laptop/IMEI Number</Label><Input value={eq.tabletDetails.laptop_number} onChange={e => setEq(p => ({ ...p, tabletDetails: { ...p.tabletDetails, laptop_number: e.target.value } }))} /></div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2"><Switch checked={eq.tabletDetails.charger} onCheckedChange={v => setEq(p => ({ ...p, tabletDetails: { ...p.tabletDetails, charger: v } }))} /><Label>Charger</Label></div>
                    <div className="flex-1">
                      <Label>Damage</Label>
                      <Select value={eq.tabletDetails.damage} onValueChange={v => setEq(p => ({ ...p, tabletDetails: { ...p.tabletDetails, damage: v } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TABLET_DAMAGE.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Demobox */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-500/10 p-2"><Box className="h-5 w-5 text-amber-500" /></div>
                  <CardTitle className="text-base">Demobox</CardTitle>
                </div>
                <Switch checked={eq.demobox} onCheckedChange={v => setEq(p => ({ ...p, demobox: v }))} />
              </CardHeader>
              {eq.demobox && (
                <CardContent className="space-y-3 pt-0">
                  <div><Label>Installation Number</Label><Input value={eq.demoboxDetails.installation_number} onChange={e => setEq(p => ({ ...p, demoboxDetails: { ...p.demoboxDetails, installation_number: e.target.value } }))} /></div>
                  <Label>Items</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {demoboxItems.map(item => (
                      <label key={item} className="flex items-center gap-2 rounded-xl border p-3 hover:bg-muted/50 cursor-pointer text-sm transition-colors">
                        <Checkbox checked={eq.demoboxDetails.items.includes(item)} onCheckedChange={() => toggleItem('demoboxDetails', 'items', item)} />
                        {item}
                      </label>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Clothing */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-500/10 p-2"><Shirt className="h-5 w-5 text-green-500" /></div>
                  <CardTitle className="text-base">Work Clothing</CardTitle>
                </div>
                <Switch checked={eq.clothing} onCheckedChange={v => setEq(p => ({ ...p, clothing: v }))} />
              </CardHeader>
              {eq.clothing && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {clothingItems.map(item => (
                      <label key={item} className="flex items-center gap-2 rounded-xl border p-3 hover:bg-muted/50 cursor-pointer text-sm transition-colors">
                        <Checkbox checked={eq.clothingDetails.items.includes(item)} onCheckedChange={() => toggleItem('clothingDetails', 'items', item)} />
                        {item}
                      </label>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Toolkit */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-orange-500/10 p-2"><Wrench className="h-5 w-5 text-orange-500" /></div>
                  <CardTitle className="text-base">Toolkit</CardTitle>
                </div>
                <Switch checked={eq.toolkit} onCheckedChange={v => setEq(p => ({ ...p, toolkit: v }))} />
              </CardHeader>
              {eq.toolkit && (
                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-center gap-2"><Switch checked={eq.toolkitDetails.complete} onCheckedChange={v => setEq(p => ({ ...p, toolkitDetails: { ...p.toolkitDetails, complete: v } }))} /><Label>Complete & no damage</Label></div>
                  {!eq.toolkitDetails.complete && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {toolkitItems.map(item => (
                        <label key={item} className="flex items-center gap-2 rounded-xl border p-3 hover:bg-muted/50 cursor-pointer text-sm transition-colors">
                          <Checkbox checked={eq.toolkitDetails.missing_parts.includes(item)} onCheckedChange={() => toggleItem('toolkitDetails', 'missing_parts', item)} />
                          {item}
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* iZettle */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-cyan-500/10 p-2"><CreditCard className="h-5 w-5 text-cyan-500" /></div>
                  <CardTitle className="text-base">iZettle</CardTitle>
                </div>
                <Switch checked={eq.izettle} onCheckedChange={v => setEq(p => ({ ...p, izettle: v }))} />
              </CardHeader>
              {eq.izettle && (
                <CardContent className="pt-0">
                  <Label>Damage</Label>
                  <Select value={eq.izettleDetails.damage} onValueChange={v => setEq(p => ({ ...p, izettleDetails: { ...p.izettleDetails, damage: v } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{IZETTLE_DAMAGE.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </CardContent>
              )}
            </Card>

            {/* Simple toggles */}
            <Card className="border-none shadow-sm">
              <CardContent className="p-4 space-y-4">
                {([
                  ['sales_binder', 'Sales Binder', BookOpen, 'text-indigo-500', 'bg-indigo-500/10'],
                  ['id_card', 'ID Card', IdCard, 'text-rose-500', 'bg-rose-500/10'],
                  ['access_pass', 'Access Pass (Toegangspas)', KeyRound, 'text-teal-500', 'bg-teal-500/10'],
                ] as const).map(([key, label, Icon, color, bg]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                      <Label className="text-sm font-medium">{label}</Label>
                    </div>
                    <Switch checked={(eq as any)[key]} onCheckedChange={v => setEq(p => ({ ...p, [key]: v }))} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="h-12"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(3)} className="flex-1 h-12 text-base">Continue to Signatures <ChevronRight className="h-5 w-5 ml-1" /></Button>
            </div>
          </div>
        )}

        {/* Step 3: Signatures + Review */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Review Summary */}
            <Card className="border-none shadow-sm bg-muted/30">
              <CardHeader><CardTitle className="text-base">Review Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Employee:</span> <strong>{selectedPerson?.sales_name}</strong></div>
                  <div><span className="text-muted-foreground">Type:</span> <strong className={txType === 'Uitgifte' ? 'text-success' : 'text-warning'}>{txType}</strong></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {getEquipmentSummary().map((item, i) => (
                    <span key={i} className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">{item}</span>
                  ))}
                  {getEquipmentSummary().length === 0 && <span className="text-sm text-muted-foreground">No equipment selected</span>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader><CardTitle className="text-base">Employee Signature</CardTitle></CardHeader>
              <CardContent>
                <div className="border-2 border-dashed rounded-xl bg-white overflow-hidden">
                  <SignatureCanvas ref={empSigRef} canvasProps={{ className: 'w-full h-48' }} />
                </div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => empSigRef.current?.clear()}>Clear Signature</Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader><CardTitle className="text-base">SBC Signature ({profile?.full_name})</CardTitle></CardHeader>
              <CardContent>
                <div className="border-2 border-dashed rounded-xl bg-white overflow-hidden">
                  <SignatureCanvas ref={sbcSigRef} canvasProps={{ className: 'w-full h-48' }} />
                </div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => sbcSigRef.current?.clear()}>Clear Signature</Button>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="h-12"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-12 text-base">
                {submitting ? 'Saving...' : 'Submit Transaction'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
