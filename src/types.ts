export interface Server {
  id: string;
  name: string;
  costPerActive: number;
}

export interface Plan {
  id: string;
  name: string;
  defaultPrice: number;
  months: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  serverId: string;
  planId: string;
  amountPaid: number;
  dueDate: string;
  lastNotifiedDate?: string;
  lastOverdueNotifiedDate?: string;
  hasResetCounters?: boolean;
}

export interface Renewal {
  id: string;
  customerId: string;
  serverId: string;
  planId: string; // Added planId for reference
  amount: number;
  cost: number; // Added cost
  date: string;
}

export interface ManualAddition {
  id: string;
  amount: number;
  date: string;
  description: string;
}

export type Tab = 'dashboard' | 'customers' | 'servers' | 'plans' | 'storage' | 'admin' | 'profile';

export type UserRole = 'owner' | 'admin' | 'observer';
