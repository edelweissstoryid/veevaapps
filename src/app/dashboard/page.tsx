'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, CalendarDays, LineChart, CircleDollarSign, Clock3, CreditCard, Package, ReceiptText, RefreshCw, Wallet, AlertTriangle, LoaderCircle, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-provider';
import { dateInputJakarta, dateTimeJakarta, errorMessage, rupiah, todayJakarta } from '@/lib/format';
import type { DashboardSummary, OwnerReport, Product, TransactionRecord } from '@/lib/types';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const emptySummary: DashboardSummary = { day_transfer:0, day_cash:0, day_income:0, day_expense:0, month_income:0, year_income:0, month_expense:0, transaction_count:0, recent_transactions:[] };

export default function DashboardPage() {
  const { supabase, profile } = useAuth();
  const [date, setDate] = useState(todayJakarta());
  const [month, setMonth] = useState(String(Number(todayJakarta().slice(5,7))));
  const [year, setYear] = useState(String(todayJakarta().slice(0,4)));
  const [filterDate, setFilterDate] = useState(todayJakarta());
  const [filterMonth, setFilterMonth] = useState(Number(todayJakarta().slice(5,7)));
  const [filterYear, setFilterYear] = useState(Number(todayJakarta().slice(0,4)));
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [report, setReport] = useState<OwnerReport | null>(null);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [activeProductCount, setActiveProductCount] = useState(0);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (targetDate: string, targetMonth: number, targetYear: number) => {
    if (!supabase || !profile) return;
    setPending(true); setError('');
    try {
      if (profile.role === 'admin') {
        const { data, error: rpcError } = await supabase.rpc('get_dashboard_summary', { p_date: targetDate, p_month: targetMonth, p_year: targetYear });
        if (rpcError) throw rpcError;
        setSummary({ ...emptySummary, ...(data as DashboardSummary) });
      } else {
        const start = `${targetDate.slice(0,4)}-01-01`;
        const { data, error: reportError } = await supabase.rpc('get_owner_report', { p_from: start, p_to: targetDate });
        if (reportError) throw reportError;
        setReport(data as OwnerReport);
        const { data: inventory, error: inventoryError } = await supabase.rpc('get_inventory_summary');
        if (inventoryError) throw inventoryError;
        const inventoryData = inventory as { low_stock_products?: Product[]; low_stock_count?: number; critical_count?: number };
        setLowStock(inventoryData.low_stock_products ?? []);
        setLowStockCount(Number(inventoryData.low_stock_count ?? 0));
        setCriticalCount(Number(inventoryData.critical_count ?? 0));
        setActiveProductCount(Number((inventoryData as { active_products?: number }).active_products ?? 0));
      }
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setPending(false); }
  }, [supabase, profile]);

  useEffect(() => { if (profile) void load(filterDate, filterMonth, filterYear); }, [profile, load, filterDate, filterMonth, filterYear]);
  const isOwner = profile?.role === 'owner';
  const ownerMonthly = useMemo(() => report?.monthly ?? [], [report]);

  return <AppShell title={isOwner?'Dashboard Owner':'Dashboard'} subtitle={isOwner?'Ringkasan performa dan kesehatan operasional bisnis.':'Ringkasan arus kas harian serta performa operasional toko.'}>
    {error && <div className="alert alert-error"><AlertTriangle size={18}/><div><strong>Data tidak dapat dimuat</strong><p>{error}</p></div><button className="btn btn-secondary btn-sm" onClick={()=>void load(filterDate,filterMonth,filterYear)}><RefreshCw size={14}/> Coba lagi</button></div>}
    <section className="glass-panel filter-panel"><div className="panel-head" style={{marginBottom:13}}><div><div className="panel-title">{isOwner?'Periode Monitoring':'Filter Data'}</div><div className="panel-subtitle">{isOwner?'Angka dihitung dari transaksi aktif dalam database.':'Atur tanggal laporan harian; ringkasan kumulatif mengikuti tanggal yang dipilih.'}</div></div><CalendarDays size={19} color="#7faeff"/></div><div className="filter-row">
      <div className="filter-field"><label className="filter-label" htmlFor="dashboard-date">{isOwner?'Tanggal akhir laporan':'Pilih tanggal'}</label><input id="dashboard-date" className="input-control" type="date" value={date} onChange={e=>{const value=e.target.value;setDate(value);if(value.length>=7){setMonth(String(Number(value.slice(5,7))));setYear(value.slice(0,4));}}} max={todayJakarta()}/></div>
      {!isOwner && <><div className="filter-field compact"><label className="filter-label" htmlFor="dashboard-month">PILIH BULAN</label><select id="dashboard-month" className="select-control" value={month} onChange={e=>setMonth(e.target.value)}>{['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'].map((label,i)=><option key={label} value={String(i+1)}>{label}</option>)}</select></div><div className="filter-field compact"><label className="filter-label" htmlFor="dashboard-year">PILIH TAHUN</label><select id="dashboard-year" className="select-control" value={year} onChange={e=>setYear(e.target.value)}>{Array.from({length:6},(_,i)=>Number(todayJakarta().slice(0,4))-i).map(y=><option key={y} value={String(y)}>{y}</option>)}</select></div></>}
      <button className="btn btn-primary" disabled={pending || !date || (!isOwner && (!month || !year))} onClick={()=>{setFilterDate(date);setFilterMonth(Number(month));setFilterYear(Number(year));}}>{pending?<LoaderCircle className="spin" size={15}/>:<RefreshCw size={15}/>} Terapkan</button>
      <button className="btn btn-secondary" disabled={pending} onClick={()=>{const today=todayJakarta();const currentMonth=String(Number(today.slice(5,7)));const currentYear=today.slice(0,4);setDate(today);setMonth(currentMonth);setYear(currentYear);setFilterDate(today);setFilterMonth(Number(currentMonth));setFilterYear(Number(currentYear));}}>Reset</button>
    </div></section>

    {!isOwner ? <>
      <div className="stats-grid">
        <Metric title={`Transfer ${filterDate===todayJakarta()?'Hari Ini':'Tanggal Dipilih'}`} value={pending?'Memuat…':rupiah(summary.day_transfer)} tone="metric-blue" icon={<CreditCard size={17}/>} foot="Pemasukan via transfer"/>
        <Metric title={`Tunai ${filterDate===todayJakarta()?'Hari Ini':'Tanggal Dipilih'}`} value={pending?'Memuat…':rupiah(summary.day_cash)} tone="metric-green" icon={<Wallet size={17}/>} foot="Pemasukan tunai"/>
        <Metric title="Total Pemasukan" value={pending?'Memuat…':rupiah(summary.day_income)} tone="metric-cyan" icon={<CircleDollarSign size={17}/>} foot="Total uang masuk"/>
        <Metric title="Total Pengeluaran" value={pending?'Memuat…':rupiah(summary.day_expense)} tone="metric-rose" icon={<ArrowDownRight size={17}/>} foot="Total uang keluar"/>
      </div>
      <div className="stats-grid stats-grid-3">
        <Metric title="Pemasukan Bulan Terpilih" value={pending?'Memuat…':rupiah(summary.month_income)} tone="metric-violet" icon={<LineChart size={17}/>} foot={`${filterMonth}/${filterYear} · sesuai periode terpilih`}/>
        <Metric title="Pemasukan Tahun Terpilih" value={pending?'Memuat…':rupiah(summary.year_income)} tone="metric-navy" icon={<Banknote size={17}/>} foot={`${filterYear} · sampai tanggal laporan / akhir tahun`}/>
        <Metric title="Pengeluaran Bulan Terpilih" value={pending?'Memuat…':rupiah(summary.month_expense)} tone="metric-amber" icon={<ArrowUpRight size={17}/>} foot="Kontrol biaya operasional"/>
      </div>
      <section className="glass-panel panel" style={{marginTop:17}}>
        <div className="panel-head"><div><h2 className="panel-title">Transaksi {filterDate===todayJakarta()?'Hari Ini':`Tanggal ${filterDate}`}</h2><p className="panel-subtitle">{summary.transaction_count} transaksi aktif · Data berdasarkan waktu Asia/Jakarta</p></div><Link href="/transactions" className="panel-action">Kelola transaksi <ArrowRight size={14}/></Link></div>
        <TransactionTable rows={summary.recent_transactions ?? []} loading={pending}/>
      </section>
    </> : <>
      <div className="stats-grid">
        <Metric title="Total Transaksi YTD" value={pending?'Memuat…':String(report?.total_transactions ?? 0)} tone="metric-blue" icon={<ReceiptText size={17}/>} foot="Sejak 1 Januari sampai tanggal laporan"/>
        <Metric title="Total Pemasukan YTD" value={pending?'Memuat…':rupiah(report?.total_income)} tone="metric-green" icon={<CircleDollarSign size={17}/>} foot="Pemasukan tercatat, bukan laba"/>
        <Metric title="Total Pengeluaran YTD" value={pending?'Memuat…':rupiah(report?.total_expense)} tone="metric-rose" icon={<ArrowUpRight size={17}/>} foot="Pengeluaran tercatat"/>
        <Metric title="Stok Perlu Perhatian" value={pending?'Memuat…':String(lowStockCount)} tone="metric-amber" icon={<AlertTriangle size={17}/>} foot={`${criticalCount} produk kritis / habis`}/>
      </div>
      <div className="dashboard-grid">
        <section className="glass-panel panel"><div className="panel-head"><div><h2 className="panel-title">Tren Pemasukan & Pengeluaran</h2><p className="panel-subtitle">Akumulasi bulanan untuk tahun berjalan hingga periode terpilih.</p></div><LineChart size={19} color="#8bb6ff"/></div>
          <div className="chart-legend"><span><i className="legend-dot" style={{background:'#60a5fa'}}/>Pemasukan</span><span><i className="legend-dot" style={{background:'#fb7185'}}/>Pengeluaran</span></div>
          <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={ownerMonthly} margin={{top:16,right:8,left:0,bottom:0}}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity={.25}/><stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/></linearGradient><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb7185" stopOpacity={.2}/><stop offset="95%" stopColor="#fb7185" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill:'#8193ad',fontSize:10}}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#8193ad',fontSize:10}} tickFormatter={v=>v>=1000000?`${(v/1000000).toFixed(0)}jt`:v>=1000?`${(v/1000).toFixed(0)}rb`:String(v)} width={40}/><Tooltip contentStyle={{background:'#111a2b',border:'1px solid rgba(148,163,184,.2)',borderRadius:10,color:'#e5eefc',fontSize:12}} formatter={(v)=>rupiah(Number(v))}/><Area type="monotone" dataKey="income" name="Pemasukan" stroke="#60a5fa" strokeWidth={2} fill="url(#incomeFill)"/><Area type="monotone" dataKey="expense" name="Pengeluaran" stroke="#fb7185" strokeWidth={2} fill="url(#expenseFill)"/></AreaChart></ResponsiveContainer></div>
        </section>
        <section className="glass-panel panel"><div className="panel-head"><div><h2 className="panel-title">Monitoring Stok</h2><p className="panel-subtitle">Item dengan kuantitas paling rendah.</p></div><Link href="/products" className="panel-action">Lihat semua <ArrowRight size={14}/></Link></div>
          <div className="stock-list">{lowStock.length===0?<div className="empty-state"><div className="empty-icon"><Package size={20}/></div><strong>{activeProductCount>0?'Semua stok dalam kondisi aman':'Belum ada data barang'}</strong><p>{activeProductCount>0?'Tidak ada produk aktif di bawah ambang stok minimum.':'Data inventaris akan muncul setelah barang ditambahkan.'}</p></div>:lowStock.slice(0,6).map(p=><div className="stock-list-row" key={p.id}><div className="product-avatar"><Package size={16}/></div><div className="stock-row-info"><div className="stock-row-name">{p.name}</div><div className="stock-row-sub">{p.sku} · {p.unit}</div></div><div className="stock-row-number" style={{color:Number(p.stock_qty)<=0?'#fda4af':Number(p.stock_qty)<=Number(p.min_stock)?'#fcd34d':'#6ee7b7'}}>{p.stock_qty} {p.unit}</div></div>)}</div>
          <div className="alert alert-info" style={{marginTop:14,marginBottom:0}}><ShieldCheck size={16}/><p>Mode Owner adalah <strong>read-only</strong>. Perubahan barang dan transaksi harus dilakukan oleh Admin.</p></div>
        </section>
      </div>
      <section className="glass-panel panel"><div className="panel-head"><div><h2 className="panel-title">Aktivitas Transaksi Terbaru</h2><p className="panel-subtitle">Ringkasan transaksi pada periode tahun berjalan.</p></div><Link href="/reports" className="panel-action">Buka laporan <ArrowRight size={14}/></Link></div><TransactionTable rows={report?.recent_transactions ?? []} loading={pending}/></section>
    </>}
  </AppShell>;
}

function Metric({title,value,tone,icon,foot}:{title:string;value:string;tone:string;icon:React.ReactNode;foot:string}) {
  return <article className={`metric-card ${tone}`}><div className="metric-top"><span className="metric-label">{title}</span><span className="metric-icon">{icon}</span></div><div className="metric-value" title={value}>{value}</div><div className="metric-foot"><Clock3 size={12}/>{foot}</div></article>;
}

function TransactionTable({rows,loading}:{rows: DashboardSummary['recent_transactions'] | OwnerReport['recent_transactions'];loading:boolean}) {
  if (loading) return <div className="empty-state"><LoaderCircle className="spin" size={22}/><p style={{marginTop:10}}>Memuat data transaksi...</p></div>;
  if (!rows?.length) return <div className="empty-state"><div className="empty-icon"><ReceiptText size={20}/></div><strong>Belum ada transaksi pada periode ini</strong><p>Setelah transaksi dicatat, datanya akan muncul di sini.</p></div>;
  return <div className="table-wrap"><table className="data-table" style={{minWidth:650}}><thead><tr><th>WAKTU</th><th>TIPE</th><th>METODE</th><th>NOMINAL</th><th>KETERANGAN</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{dateTimeJakarta(row.occurred_at)}</td><td><span className={`status-badge ${row.transaction_type==='income'?'badge-green':'badge-rose'}`}>{row.transaction_type==='income'?'Pemasukan':'Pengeluaran'}</span></td><td><span className="pill">{row.payment_method==='transfer'?'Transfer':'Tunai'}</span></td><td className={`amount ${row.transaction_type==='income'?'amount-income':'amount-expense'}`}>{rupiah(row.amount)}</td><td><div className="table-primary">{row.description || row.category_name || '—'}</div><div className="table-muted">{row.category_name || 'Tanpa kategori'}</div></td></tr>)}</tbody></table></div>;
}
