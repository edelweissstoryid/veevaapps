export type Role = 'admin' | 'owner';
export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'transfer' | 'cash';
export type StockDirection = 'in' | 'out' | null;

export interface Profile {
  id: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
}

export interface TransactionCategory {
  id: string;
  name: string;
  applies_to: 'income' | 'expense' | 'both';
  is_active: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  selling_price: number;
  cost_price: number | null;
  stock_qty: number;
  unit: string;
  min_stock: number;
  is_active: boolean;
  product_categories?: { name: string } | null;
}

export interface TransactionItem {
  id?: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
  stock_direction?: 'in' | 'out';
  products?: { name: string; sku: string } | null;
}

export interface TransactionRecord {
  id: string;
  occurred_at: string;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  amount: number;
  description: string | null;
  category_id: string | null;
  stock_direction: StockDirection;
  created_at: string;
  transaction_categories?: { name: string } | null;
  transaction_items?: TransactionItem[];
}

export interface DashboardSummary {
  day_transfer: number;
  day_cash: number;
  day_income: number;
  day_expense: number;
  month_income: number;
  year_income: number;
  month_expense: number;
  transaction_count: number;
  recent_transactions: Array<{
    id: string;
    occurred_at: string;
    transaction_type: TransactionType;
    payment_method: PaymentMethod;
    amount: number;
    description: string | null;
    category_name: string | null;
  }>;
}

export interface OwnerReport {
  from_date: string;
  to_date: string;
  total_transactions: number;
  total_income: number;
  total_expense: number;
  transfer_income: number;
  cash_income: number;
  monthly: Array<{ month: string; income: number; expense: number; transaction_count: number }>;
  recent_transactions: Array<{
    id: string;
    occurred_at: string;
    transaction_type: TransactionType;
    payment_method: PaymentMethod;
    amount: number;
    description: string | null;
    category_name: string | null;
  }>;
}
