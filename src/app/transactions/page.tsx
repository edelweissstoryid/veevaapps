'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, CirclePlus, Edit3, LoaderCircle, Package, Plus, RefreshCw, ReceiptText, Search, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-provider';
import { dateInputJakarta, dateTimeJakarta, errorMessage, jakartaDateTimeISO, rupiah, timeInputJakarta } from '@/lib/format';
import type { Product, TransactionCategory, TransactionItem, TransactionRecord, TransactionType } from '@/lib/types';

const PAGE_SIZE = 12;
type ItemDraft = { product_id: string; quantity: string; unit_price: string };
type FormDraft = { id: string | null; request_token: string; date: string; time: string; type: TransactionType; payment: 'transfer'|'cash'; category_id: string; amount: string; description: string; useStock: boolean; items: ItemDraft[] };
const createRequestToken = () => { try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {} return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }); };
const blankForm = (): FormDraft => ({ id:null, request_token:createRequestToken(), date:dateInputJakarta(), time:timeInputJakarta(), type:'income', payment:'transfer', category_id:'', amount:'', description:'', useStock:false, items:[{product_id:'',quantity:'1',unit_price:''}] });

export default function TransactionsPage() {
  const { supabase, profile } = useAuth();
  const [rows, setRows] = useState<TransactionRecord[]>([]);
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormDraft>(blankForm());

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError('');
    try {
      const [transactionResult, categoryResult, productResult] = await Promise.all([
        supabase.from('transactions').select('id,occurred_at,transaction_type,payment_method,amount,description,category_id,stock_direction,created_at,transaction_categories(name),transaction_items(id,product_id,quantity,unit_price,line_total,stock_direction,products(name,sku))').is('deleted_at', null).order('occurred_at', { ascending:false }).limit(500),
        supabase.from('transaction_categories').select('id,name,applies_to,is_active').eq('is_active',true).order('name'),
        supabase.from('products').select('id,sku,name,selling_price,cost_price,stock_qty,unit,min_stock,category_id,is_active').eq('is_active',true).order('name').limit(1000)
      ]);
      if (transactionResult.error) throw transactionResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (productResult.error) throw productResult.error;
      setRows((transactionResult.data ?? []) as unknown as TransactionRecord[]);
      setCategories((categoryResult.data ?? []) as TransactionCategory[]);
      setProducts((productResult.data ?? []) as Product[]);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter(row => {
    const text = `${row.description ?? ''} ${row.transaction_categories?.name ?? ''} ${row.payment_method} ${row.transaction_type} ${row.amount}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (typeFilter === 'all' || row.transaction_type === typeFilter);
  }), [rows, search, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
  const visibleRows = filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  function createNew() { setError(''); setSuccess(''); setForm(blankForm()); setModalOpen(true); }
  function editRow(row: TransactionRecord) {
    const items = (row.transaction_items ?? []).map(item => ({ product_id:item.product_id, quantity:String(item.quantity), unit_price:String(item.unit_price) }));
    setForm({ id:row.id, request_token:'', date:dateInputJakarta(row.occurred_at), time:timeInputJakarta(row.occurred_at), type:row.transaction_type, payment:row.payment_method, category_id:row.category_id ?? '', amount:String(row.amount), description:row.description ?? '', useStock:row.stock_direction !== null, items:items.length ? items : [{product_id:'',quantity:'1',unit_price:''}] });
    setError(''); setSuccess(''); setModalOpen(true);
  }
  async function deleteRow(row: TransactionRecord) {
    if (!supabase) return;
    const confirmed = window.confirm(`Hapus transaksi ${rupiah(row.amount)} tanggal ${dateTimeJakarta(row.occurred_at)}? Jika transaksi mengubah stok, sistem akan membalik efek stoknya. Riwayat audit tetap disimpan.`);
    if (!confirmed) return;
    setError(''); setSuccess(''); setSaving(true);
    try {
      const { error: deleteError } = await supabase.rpc('delete_transaction', { p_id:row.id });
      if (deleteError) throw deleteError;
      setSuccess('Transaksi dihapus. Efek stok (jika ada) sudah dibalik dalam operasi database yang sama.');
      await load();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSaving(false); }
  }

  const activeCategories = categories.filter(c => c.applies_to === 'both' || c.applies_to === form.type);
  const calculatedTotal = form.items.reduce((sum,item) => sum + (Number(item.quantity)||0) * (Number(item.unit_price)||0),0);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setError(''); setSuccess('');
    if (!form.category_id) { setError('Pilih kategori transaksi terlebih dahulu.'); return; }
    if (form.useStock && (!form.items.length || form.items.some(item => !item.product_id || !(Number(item.quantity)>0) || item.unit_price==='' || Number(item.unit_price)<0 || !Number.isFinite(Number(item.quantity)) || !Number.isFinite(Number(item.unit_price))))) { setError('Lengkapi barang, kuantitas, dan harga untuk setiap baris detail stok. Hapus baris kosong yang tidak diperlukan.'); return; }
    const items = form.useStock ? form.items : [];
    if (form.useStock && !items.length) { setError('Tambahkan minimal satu barang dengan kuantitas yang valid.'); return; }
    if (!form.useStock && (!Number(form.amount) || Number(form.amount)<=0)) { setError('Nominal transaksi harus lebih besar dari nol.'); return; }
    setSaving(true);
    try {
      const amount = form.useStock ? items.reduce((sum,item)=>sum+Math.round(Number(item.quantity)*Number(item.unit_price)*100)/100,0) : Number(form.amount);
      const payload = {
        ...(form.id ? { id:form.id } : {}),
        occurred_at:jakartaDateTimeISO(form.date,form.time), ...(form.id ? {} : { idempotency_key:form.request_token }), transaction_type:form.type, payment_method:form.payment,
        amount, category_id:form.category_id, description:form.description.trim() || null,
        stock_direction:form.useStock ? (form.type==='income'?'out':'in') : null
      };
      const lineItems = items.map(item=>({ product_id:item.product_id, quantity:Number(item.quantity), unit_price:Number(item.unit_price) }));
      const { error: saveError } = await supabase.rpc('save_transaction', { p_transaction:payload, p_items:lineItems });
      if (saveError) throw saveError;
      setModalOpen(false);
      setSuccess(form.id ? 'Perubahan transaksi berhasil disimpan.' : 'Transaksi berhasil dicatat.');
      setForm(blankForm());
      await load();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSaving(false); }
  }

  return <AppShell title="Transaksi" subtitle="Input arus kas secara cepat dengan pencatatan perubahan stok yang konsisten." requiredRole="admin">
    {error && <div className="alert alert-error"><AlertTriangle size={17}/><p>{error}</p><button className="icon-button" onClick={()=>setError('')} aria-label="Tutup pesan"><X size={15}/></button></div>}
    {success && <div className="alert alert-success"><CheckCircle2 size={17}/><p>{success}</p><button className="icon-button" onClick={()=>setSuccess('')} aria-label="Tutup pesan"><X size={15}/></button></div>}

    <section className="glass-panel panel" style={{marginBottom:18}}>
      <div className="panel-head"><div><h2 className="panel-title">Input Transaksi</h2><p className="panel-subtitle">Field dasar tetap ringkas. Hubungkan barang hanya untuk transaksi yang berdampak pada stok.</p></div><span className="pill"><ShieldCheckIcon/> Database sync</span></div>
      <form onSubmit={save}>
        <div className="form-grid">
          <div className="form-field"><label className="filter-label" htmlFor="trx-date">TANGGAL & JAM (WIB)</label><div className="date-time-row"><input id="trx-date" className="input-control" type="date" value={form.date} max={dateInputJakarta()} onChange={e=>setForm({...form,date:e.target.value})} required/><input aria-label="Jam transaksi WIB" className="input-control" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} required/></div></div>
          <div className="form-field"><label className="filter-label" htmlFor="trx-type">TIPE TRANSAKSI</label><select id="trx-type" className="select-control" value={form.type} onChange={e=>{const type=e.target.value as TransactionType;setForm({...form,type,category_id:(categories.find(c=>c.applies_to==='both'||c.applies_to===type)?.id ?? ''),useStock:form.useStock});}}>{[{v:'income',l:'Pemasukan'},{v:'expense',l:'Pengeluaran'}].map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
          <div className="form-field"><label className="filter-label">METODE PEMBAYARAN</label><div style={{display:'flex',alignItems:'center',gap:19,minHeight:39,padding:'0 3px'}}><label className="radio-label"><input type="radio" name="payment" value="transfer" checked={form.payment==='transfer'} onChange={()=>setForm({...form,payment:'transfer'})}/> Transfer</label><label className="radio-label"><input type="radio" name="payment" value="cash" checked={form.payment==='cash'} onChange={()=>setForm({...form,payment:'cash'})}/> Tunai</label></div></div>
          <div className="form-field"><label className="filter-label" htmlFor="trx-amount">NOMINAL (RP)</label><input id="trx-amount" className="input-control" type="number" min="1" step="1" inputMode="numeric" value={form.useStock ? String(Math.round(calculatedTotal)) : form.amount} readOnly={form.useStock} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="Contoh: 125000" required={!form.useStock}/>{form.useStock && <small className="field-help">Nominal dihitung dari kuantitas × harga barang.</small>}</div>
          <div className="form-field"><label className="filter-label" htmlFor="trx-category">KATEGORI</label><select id="trx-category" className="select-control" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})} required><option value="">Pilih kategori...</option>{activeCategories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div>
          <div className="form-field"><label className="filter-label" htmlFor="trx-description">KETERANGAN</label><textarea id="trx-description" className="textarea-control" rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Catatan transaksi (opsional)"/></div>
        </div>
        <div className="stock-transaction-toggle"><div><div className="section-label" style={{margin:0}}><Package size={15}/> Kaitkan dengan pergerakan stok?</div><p>{form.type==='income'?'Untuk penjualan barang yang mengurangi stok.':'Untuk pembelian barang yang menambah stok.'}</p></div><label className="toggle-wrap"><input type="checkbox" checked={form.useStock} onChange={e=>setForm({...form,useStock:e.target.checked})}/><span className="toggle-track"/><span className="toggle-text">{form.useStock?'Ya, terkait stok':'Transaksi umum'}</span></label></div>
        {form.useStock && <div className="items-editor"><div className="section-label"><Package size={15}/>{form.type==='income'?'Barang terjual · stok keluar':'Barang dibeli · stok masuk'}</div>
          {form.items.map((item,index)=><div className="line-item" key={`${index}-${item.product_id}`}>
            <div className="line-product"><label className="filter-label">BARANG</label><select className="select-control" value={item.product_id} onChange={e=>{const chosen=products.find(p=>p.id===e.target.value);const next=[...form.items];next[index]={...item,product_id:e.target.value,unit_price:item.unit_price || String(form.type==='income'?(chosen?.selling_price ?? ''):(chosen?.cost_price ?? chosen?.selling_price ?? ''))};setForm({...form,items:next});}} required><option value="">Pilih barang...</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name} (stok {p.stock_qty} {p.unit})</option>)}</select></div>
            <div><label className="filter-label">KUANTITAS</label><input className="input-control" type="number" step="0.001" min="0.001" value={item.quantity} onChange={e=>{const next=[...form.items];next[index]={...item,quantity:e.target.value};setForm({...form,items:next});}} required/></div>
            <div><label className="filter-label">HARGA / UNIT</label><input className="input-control" type="number" min="0" step="0.01" value={item.unit_price} onChange={e=>{const next=[...form.items];next[index]={...item,unit_price:e.target.value};setForm({...form,items:next});}} required/></div>
            <button type="button" className="icon-button line-remove" aria-label="Hapus item" disabled={form.items.length===1} onClick={()=>setForm({...form,items:form.items.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button>
          </div>)}
          <div className="items-bottom"><button type="button" className="btn btn-secondary btn-sm" onClick={()=>setForm({...form,items:[...form.items,{product_id:'',quantity:'1',unit_price:''}]})}><Plus size={14}/> Tambah barang</button><div><span className="table-muted">Total item</span><strong className="amount" style={{display:'block',fontSize:16,color:'#dceaff',marginTop:4}}>{rupiah(calculatedTotal)}</strong></div></div>
        </div>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:9,marginTop:18}}><button type="button" className="btn btn-secondary" onClick={()=>{setForm(blankForm());setError('');}}>Reset form</button><button type="submit" className="btn btn-primary" disabled={saving || loading}>{saving?<LoaderCircle size={16} className="spin"/>:<CirclePlus size={16}/>} {form.id?'SIMPAN PERUBAHAN':'SIMPAN TRANSAKSI'}</button></div>
      </form>
    </section>

    <section className="glass-panel panel"><div className="panel-head"><div><h2 className="panel-title">Riwayat Transaksi Terbaru</h2><p className="panel-subtitle">{filtered.length} transaksi aktif dari data terbaru yang dimuat.</p></div><button className="btn btn-secondary btn-sm" onClick={()=>void load()} disabled={loading}><RefreshCw size={14} className={loading?'spin':''}/> Perbarui</button></div>
      <div className="table-toolbar"><div className="search-box"><Search size={16}/><input className="input-control" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cari keterangan, kategori, metode, nominal..." aria-label="Cari transaksi"/></div><div className="toolbar-actions"><select className="select-control" style={{minWidth:160}} value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPage(1);}} aria-label="Filter tipe transaksi"><option value="all">Semua tipe</option><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option></select></div></div>
      {loading?<div className="empty-state"><LoaderCircle className="spin" size={22}/><p style={{marginTop:9}}>Memuat riwayat transaksi...</p></div>:!visibleRows.length?<div className="empty-state"><div className="empty-icon"><ReceiptText size={20}/></div><strong>Tidak ada transaksi ditemukan</strong><p>Ubah kata kunci atau tambahkan transaksi baru.</p></div>:<div className="table-wrap"><table className="data-table"><thead><tr><th>TANGGAL</th><th>TIPE</th><th>METODE</th><th>NOMINAL</th><th>KATEGORI / KETERANGAN</th><th>DAMPAK STOK</th><th>AKSI</th></tr></thead><tbody>{visibleRows.map(row=><tr key={row.id}><td>{dateTimeJakarta(row.occurred_at)}</td><td><span className={`status-badge ${row.transaction_type==='income'?'badge-green':'badge-rose'}`}>{row.transaction_type==='income'?'Pemasukan':'Pengeluaran'}</span></td><td>{row.payment_method==='transfer'?'Transfer':'Tunai'}</td><td className={`amount ${row.transaction_type==='income'?'amount-income':'amount-expense'}`}>{rupiah(row.amount)}</td><td><div className="table-primary">{row.transaction_categories?.name ?? 'Tanpa kategori'}</div><div className="table-muted">{row.description || '—'}</div></td><td>{row.stock_direction?<span className={`status-badge ${row.stock_direction==='in'?'badge-blue':'badge-violet'}`}>{row.stock_direction==='in'?'Stok masuk':'Stok keluar'}</span>:<span className="table-muted">Tidak terkait</span>}</td><td><div style={{display:'flex',gap:6}}><button className="icon-button" title="Edit transaksi" aria-label="Edit transaksi" disabled={saving} onClick={()=>editRow(row)}><Edit3 size={15}/></button><button className="icon-button" title="Hapus transaksi" aria-label="Hapus transaksi" disabled={saving} onClick={()=>void deleteRow(row)} style={{color:'#fda4af'}}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
      <div className="table-footer"><span>Menampilkan {filtered.length ? (page-1)*PAGE_SIZE+1 : 0}–{Math.min(page*PAGE_SIZE,filtered.length)} dari {filtered.length} transaksi</span><div className="table-footer-actions"><button className="btn btn-secondary btn-sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={13}/> Sebelumnya</button><button className="btn btn-secondary btn-sm" disabled={page>=pageCount} onClick={()=>setPage(p=>p+1)}>Berikutnya <ArrowRight size={13}/></button></div></div>
    </section>

    {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving){setModalOpen(false);setForm(blankForm());}}}><div className="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="transaction-modal-title"><div className="modal-head"><div><h2 id="transaction-modal-title">{form.id?'Edit transaksi':'Transaksi baru'}</h2><p>Gunakan form ini untuk input baru atau memperbaiki transaksi sebelumnya.</p></div><button className="icon-button" aria-label="Tutup modal" onClick={()=>{setModalOpen(false);setForm(blankForm());}} disabled={saving}><X size={18}/></button></div>
      {error && <div className="alert alert-error"><AlertTriangle size={16}/><p>{error}</p></div>}<form onSubmit={save}><div className="form-grid"><div className="form-field"><label className="filter-label">TANGGAL & JAM (WIB)</label><div className="date-time-row"><input className="input-control" aria-label="Tanggal transaksi" type="date" max={dateInputJakarta()} value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/><input className="input-control" aria-label="Jam transaksi WIB" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} required/></div></div><div className="form-field"><label className="filter-label">TIPE</label><select className="select-control" value={form.type} onChange={e=>{const type=e.target.value as TransactionType;setForm({...form,type,category_id:categories.find(c=>c.applies_to==='both'||c.applies_to===type)?.id ?? '',useStock:form.useStock});}}><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option></select></div><div className="form-field"><label className="filter-label">METODE</label><select className="select-control" value={form.payment} onChange={e=>setForm({...form,payment:e.target.value as 'transfer'|'cash'})}><option value="transfer">Transfer</option><option value="cash">Tunai</option></select></div><div className="form-field"><label className="filter-label">NOMINAL (RP)</label><input className="input-control" type="number" min="1" step="1" value={form.useStock?String(Math.round(calculatedTotal)):form.amount} readOnly={form.useStock} onChange={e=>setForm({...form,amount:e.target.value})} required={!form.useStock}/></div><div className="form-field"><label className="filter-label">KATEGORI</label><select className="select-control" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})} required><option value="">Pilih kategori...</option>{activeCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="form-field"><label className="filter-label">KETERANGAN</label><textarea className="textarea-control" rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div></div>
      <div className="section-divider"/><label className="checkbox-line"><input type="checkbox" checked={form.useStock} onChange={e=>setForm({...form,useStock:e.target.checked})}/><span><strong>Transaksi ini memengaruhi stok</strong><small>{form.type==='income'?'Barang keluar dari stok (penjualan).':'Barang masuk ke stok (pembelian).'} Item lama dan baru akan direkonsiliasi secara atomik.</small></span></label>
      {form.useStock && <div className="items-editor" style={{marginTop:16}}>{form.items.map((item,index)=><div className="line-item" key={index}><div className="line-product"><label className="filter-label">BARANG</label><select className="select-control" value={item.product_id} onChange={e=>{const p=products.find(x=>x.id===e.target.value);const next=[...form.items];next[index]={...item,product_id:e.target.value,unit_price:item.unit_price||String(form.type==='income'?(p?.selling_price??''):(p?.cost_price??p?.selling_price??''))};setForm({...form,items:next});}} required><option value="">Pilih barang...</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name} · stok {p.stock_qty}</option>)}</select></div><div><label className="filter-label">KUANTITAS</label><input className="input-control" type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>{const next=[...form.items];next[index]={...item,quantity:e.target.value};setForm({...form,items:next});}} required/></div><div><label className="filter-label">HARGA / UNIT</label><input className="input-control" type="number" min="0" step="0.01" value={item.unit_price} onChange={e=>{const next=[...form.items];next[index]={...item,unit_price:e.target.value};setForm({...form,items:next});}} required/></div><button type="button" className="icon-button line-remove" disabled={form.items.length<=1} onClick={()=>setForm({...form,items:form.items.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button></div>)}<button type="button" className="btn btn-secondary btn-sm" onClick={()=>setForm({...form,items:[...form.items,{product_id:'',quantity:'1',unit_price:''}]})}><Plus size={14}/> Tambah barang</button><div style={{textAlign:'right',marginTop:10}}><span className="table-muted">Total item</span><div className="amount" style={{fontSize:16,marginTop:4}}>{rupiah(calculatedTotal)}</div></div></div>}
      <div className="form-footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>{setModalOpen(false);setForm(blankForm());}}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?<LoaderCircle size={15} className="spin"/>:<CheckCircle2 size={15}/>} {form.id?'Simpan Perubahan':'Simpan Transaksi'}</button></div></form>
    </div></div>}
  </AppShell>;
}

function ShieldCheckIcon(){return <CheckCircle2 size={12} color="#34d399"/>;}
