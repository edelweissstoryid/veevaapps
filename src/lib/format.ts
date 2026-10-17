export const rupiah = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value ?? 0));

export const dateJakarta = (value: string | Date) => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeZone: 'Asia/Jakarta'
}).format(new Date(value));

export const dateTimeJakarta = (value: string | Date) => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta'
}).format(new Date(value));

export const dateInputJakarta = (value?: string | Date) => {
  if (!value) return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
};

export const todayJakarta = () => dateInputJakarta(new Date());
export const timeInputJakarta = (value?: string | Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value ? new Date(value) : new Date());
export const jakartaDateTimeISO = (date: string, time: string) => new Date(`${date}T${time || '12:00'}:00+07:00`).toISOString();
export const numberId = (value: number | string) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value || 0));
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : (typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Terjadi kesalahan yang tidak diketahui.');
