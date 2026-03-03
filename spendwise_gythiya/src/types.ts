import { format } from 'date-fns';

export type Category = {
  id: string;
  name: string;
  color: string;
};

export type Expense = {
  id: string;
  amount: number;
  description: string;
  categoryId: string;
  date: string; // ISO string
};

export type MonthlyIncome = {
  monthYear: string; // format: "yyyy-MM"
  amount: number;
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: '1', name: 'Food', color: '#f43f5e' }, // Rose
  { id: '2', name: 'Rent', color: '#3b82f6' }, // Blue
  { id: '3', name: 'Investment', color: '#10b981' }, // Emerald
  { id: '4', name: 'Transport', color: '#f59e0b' }, // Amber
  { id: '5', name: 'Entertainment', color: '#8b5cf6' }, // Violet
  { id: '6', name: 'Others', color: '#64748b' }, // Slate
];

export const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'
];
