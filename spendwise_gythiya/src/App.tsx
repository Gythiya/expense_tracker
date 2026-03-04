/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  PieChart as PieChartIcon, 
  LayoutDashboard, 
  Settings, 
  Wallet,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Tag,
  TrendingUp,
  TrendingDown,
  Coins,
  Edit2
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval, 
  parseISO 
} from 'date-fns';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Category, Expense, MonthlyIncome, DEFAULT_CATEGORIES, COLORS } from './types';
import { auth, db, googleProvider, isFirebaseConfigured } from './firebase';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDocs
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // State
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('spendwise_expenses');
    return saved ? JSON.parse(saved) : [];
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('spendwise_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  const [monthlyIncomes, setMonthlyIncomes] = useState<MonthlyIncome[]>(() => {
    const saved = localStorage.getItem('spendwise_incomes');
    return saved ? JSON.parse(saved) : [];
  });

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);

  // Form State
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tempIncome, setTempIncome] = useState('');

  // Auth & Sync
  useEffect(() => {
    if (!auth) {
      setIsAuthLoading(false);
      return;
    }

    // Handle redirect result
    getRedirectResult(auth).catch((error) => {
      console.error('Redirect error:', error);
    });

    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
      if (!u) {
        // Reset to local storage data on logout
        const savedExpenses = localStorage.getItem('spendwise_expenses');
        const savedCats = localStorage.getItem('spendwise_categories');
        const savedIncomes = localStorage.getItem('spendwise_incomes');
        setExpenses(savedExpenses ? JSON.parse(savedExpenses) : []);
        setCategories(savedCats ? JSON.parse(savedCats) : DEFAULT_CATEGORIES);
        setMonthlyIncomes(savedIncomes ? JSON.parse(savedIncomes) : []);
      }
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) return;

    const qExpenses = query(collection(db, 'expenses'), where('userId', '==', user.uid));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    });

    const qCats = query(collection(db, 'categories'), where('userId', '==', user.uid));
    const unsubCats = onSnapshot(qCats, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Category));
      if (docs.length > 0) setCategories(docs);
    });

    const qIncomes = query(collection(db, 'incomes'), where('userId', '==', user.uid));
    const unsubIncomes = onSnapshot(qIncomes, (snapshot) => {
      setMonthlyIncomes(snapshot.docs.map(d => ({ ...d.data() } as MonthlyIncome)));
    });

    return () => {
      unsubExpenses();
      unsubCats();
      unsubIncomes();
    };
  }, [user]);

  // Persistence (Fallback)
  useEffect(() => {
    if (!user) localStorage.setItem('spendwise_expenses', JSON.stringify(expenses));
  }, [expenses, user]);

  useEffect(() => {
    localStorage.setItem('spendwise_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('spendwise_incomes', JSON.stringify(monthlyIncomes));
  }, [monthlyIncomes]);

  // Derived Data
  const currentMonthKey = format(currentMonth, 'yyyy-MM');
  
  const currentIncome = useMemo(() => {
    return monthlyIncomes.find(inc => inc.monthYear === currentMonthKey)?.amount || 0;
  }, [monthlyIncomes, currentMonthKey]);

  const filteredExpenses = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return expenses
      .filter(exp => isWithinInterval(parseISO(exp.date), { start, end }))
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  }, [expenses, currentMonth]);

  const totalExpense = useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [filteredExpenses]);

  const balance = currentIncome - totalExpense;
  const spentPercentage = currentIncome > 0 ? Math.min((totalExpense / currentIncome) * 100, 100) : 0;

  const chartData = useMemo(() => {
    const dataMap = new Map<string, { name: string; value: number; color: string }>();
    
    filteredExpenses.forEach(exp => {
      const cat = categories.find(c => c.id === exp.categoryId) || { name: 'Unknown', color: '#ccc' };
      const current = dataMap.get(exp.categoryId) || { name: cat.name, value: 0, color: cat.color };
      dataMap.set(exp.categoryId, { ...current, value: current.value + exp.amount });
    });

    return Array.from(dataMap.values());
  }, [filteredExpenses, categories]);

  // Handlers
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !categoryId) return;

    const expenseData = {
      amount: parseFloat(amount),
      description,
      categoryId,
      date: new Date(date).toISOString(),
    };

    if (user && db) {
      await addDoc(collection(db, 'expenses'), { ...expenseData, userId: user.uid });
    } else {
      const newExpense: Expense = {
        id: crypto.randomUUID(),
        ...expenseData,
      };
      setExpenses([newExpense, ...expenses]);
    }
    
    setAmount('');
    setDescription('');
    setIsAddModalOpen(false);
  };

  const handleUpdateIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(tempIncome) || 0;

    if (user && db) {
      const q = query(collection(db, 'incomes'), where('userId', '==', user.uid), where('monthYear', '==', currentMonthKey));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        await setDoc(doc(db, 'incomes', snapshot.docs[0].id), { monthYear: currentMonthKey, amount: amountNum, userId: user.uid });
      } else {
        await addDoc(collection(db, 'incomes'), { monthYear: currentMonthKey, amount: amountNum, userId: user.uid });
      }
    } else {
      const existing = monthlyIncomes.findIndex(inc => inc.monthYear === currentMonthKey);
      if (existing >= 0) {
        const updated = [...monthlyIncomes];
        updated[existing].amount = amountNum;
        setMonthlyIncomes(updated);
      } else {
        setMonthlyIncomes([...monthlyIncomes, { monthYear: currentMonthKey, amount: amountNum }]);
      }
    }
    setIsIncomeModalOpen(false);
  };

  const handleDeleteExpense = async (id: string) => {
    if (user && db) {
      await deleteDoc(doc(db, 'expenses', id));
    } else {
      setExpenses(expenses.filter(e => e.id !== id));
    }
  };

  const handleLogin = async (useRedirect = false) => {
    if (!auth || isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      if (useRedirect) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/configuration-not-found') {
        alert('Firebase Error: Google Sign-In is not enabled in your Firebase Console.');
      } else if (error.code === 'auth/unauthorized-domain') {
        const currentDomain = window.location.hostname;
        alert(`Firebase Error: This domain (${currentDomain}) is not authorized. Please add it to your Firebase Console.`);
      } else if (error.code === 'auth/popup-blocked') {
        alert('Popup blocked! Please allow popups for this site or try the "Redirect Login" option.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup
      } else {
        alert(`Login failed: ${error.message}\n\nTry clicking the "Troubleshoot" link below.`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };
  const handleLogout = () => auth && signOut(auth);

  const handleAddCategory = async (name: string) => {
    if (!name) return;
    const categoryData = {
      name,
      color: COLORS[categories.length % COLORS.length],
    };

    if (user && db) {
      await addDoc(collection(db, 'categories'), { ...categoryData, userId: user.uid });
    } else {
      const newCat: Category = {
        id: crypto.randomUUID(),
        ...categoryData,
      };
      const updated = [...categories, newCat];
      setCategories(updated);
      localStorage.setItem('spendwise_categories', JSON.stringify(updated));
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (categories.length <= 1) return;
    
    if (user && db) {
      await deleteDoc(doc(db, 'categories', id));
    } else {
      const updated = categories.filter(c => c.id !== id);
      setCategories(updated);
      localStorage.setItem('spendwise_categories', JSON.stringify(updated));
      const fallbackId = categories.find(c => c.id !== id)?.id || '';
      setExpenses(expenses.map(e => e.categoryId === id ? { ...e, categoryId: fallbackId } : e));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 pb-20 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-zinc-200/50 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 rotate-3">
              <Wallet className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">SpendWise</h1>
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Financial Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isFirebaseConfigured ? (
              <div className="flex items-center gap-3">
                {user ? (
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-zinc-900">{user.displayName}</p>
                      <button onClick={handleLogout} className="text-[10px] font-bold text-zinc-400 hover:text-rose-500 uppercase tracking-wider">Logout</button>
                    </div>
                    <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-zinc-200" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <button 
                      onClick={() => handleLogin(false)}
                      disabled={isLoggingIn}
                      className={cn(
                        "text-xs font-bold px-4 py-2 rounded-xl transition-all",
                        isLoggingIn ? "bg-zinc-200 text-zinc-400 cursor-not-allowed" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      )}
                    >
                      {isLoggingIn ? 'Connecting...' : 'Sync with Google'}
                    </button>
                    <button 
                      onClick={() => handleLogin(true)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-600 underline decoration-zinc-200"
                    >
                      Trouble logging in? Try Redirect
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-lg border border-amber-100">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Local Mode</span>
              </div>
            )}
            
            <div className="flex items-center gap-2 bg-zinc-100/80 p-1 rounded-2xl border border-zinc-200/50">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-zinc-500 hover:text-zinc-900"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-4 font-bold min-w-[140px] text-center text-zinc-800">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-zinc-500 hover:text-zinc-900"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Main Stats Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 glass-card p-8 relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-800 text-white border-none shadow-2xl shadow-zinc-200"
          >
            <div className="relative z-10 flex flex-col h-full justify-between gap-8">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-zinc-400 text-sm font-medium mb-1 uppercase tracking-wider">Total Balance</p>
                  <h2 className="text-5xl font-bold tracking-tighter">₹{balance.toLocaleString()}</h2>
                </div>
                <button 
                  onClick={() => {
                    setTempIncome(currentIncome.toString());
                    setIsIncomeModalOpen(true);
                  }}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl backdrop-blur-md transition-all group"
                >
                  <Edit2 className="w-5 h-5 text-zinc-300 group-hover:text-white" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-8 border-t border-white/10 pt-8">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Income</span>
                  </div>
                  <p className="text-2xl font-bold">₹{currentIncome.toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-rose-400">
                    <TrendingDown className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Expenses</span>
                  </div>
                  <p className="text-2xl font-bold">₹{totalExpense.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <span>Spending Progress</span>
                  <span className={cn(spentPercentage > 90 ? "text-rose-400" : "text-emerald-400")}>
                    {spentPercentage.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${spentPercentage}%` }}
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      spentPercentage > 90 ? "bg-rose-500" : "bg-emerald-500"
                    )}
                  />
                </div>
              </div>
            </div>
            {/* Background Decoration */}
            <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-[-20%] left-[-10%] w-64 h-64 bg-rose-500/10 rounded-full blur-3xl" />
          </motion.div>

          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-6 flex flex-col justify-between h-[calc(50%-12px)] bg-white border-zinc-200/60"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Transactions</span>
                <div className="p-2 bg-zinc-100 rounded-xl">
                  <Calendar className="w-4 h-4 text-zinc-500" />
                </div>
              </div>
              <div className="text-4xl font-bold tracking-tighter text-zinc-900">{filteredExpenses.length}</div>
              <p className="text-xs text-zinc-500">Recorded this month</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-6 flex flex-col justify-between h-[calc(50%-12px)] bg-white border-zinc-200/60"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Categories</span>
                <div className="p-2 bg-zinc-100 rounded-xl">
                  <Tag className="w-4 h-4 text-zinc-500" />
                </div>
              </div>
              <div className="text-4xl font-bold tracking-tighter text-zinc-900">{categories.length}</div>
              <p className="text-xs text-zinc-500">Active budget groups</p>
            </motion.div>
          </div>
        </div>

        {/* Charts & List */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Visualization */}
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-800">
                <PieChartIcon className="w-5 h-5 text-emerald-600" />
                Expense Distribution
              </h2>
            </div>
            
            <div className="glass-card p-8 h-[400px] flex items-center justify-center bg-white">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={90}
                      outerRadius={130}
                      paddingAngle={8}
                      dataKey="value"
                      stroke="none"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '20px', 
                        border: 'none', 
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                        padding: '12px 16px'
                      }}
                      itemStyle={{ fontWeight: 'bold' }}
                      formatter={(value: number) => `₹${value.toLocaleString()}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center gap-4 text-zinc-400">
                  <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center border border-dashed border-zinc-200">
                    <Coins className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-medium italic">No data for this month</p>
                </div>
              )}
            </div>

           <div className="grid grid-cols-1 gap-2">
  {[...chartData].sort((a,b) => b.value - a.value).map((item) => (
    <div key={item.name} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-zinc-100 hover:border-zinc-200 transition-all group">
      
      <div 
        className="w-2 h-8 rounded-full" 
        style={{ backgroundColor: item.color }} 
      />

      <div className="flex-1">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          {item.name}
        </p>

        <p className="font-bold text-zinc-900">
          ₹{item.value.toLocaleString()}
        </p>
      </div>

      <div className="text-xs font-bold text-zinc-400 bg-zinc-50 px-2 py-1 rounded-lg">
        {((item.value / totalExpense) * 100).toFixed(0)}%
      </div>

    </div>
  ))}
</div>
          </section>

          {/* Expense List */}
          <section className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-800">
                <LayoutDashboard className="w-5 h-5 text-emerald-600" />
                Recent Transactions
              </h2>
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 text-sm font-bold bg-emerald-600 text-white px-4 py-2.5 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Add Expense
              </button>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((expense) => {
                    const category = categories.find(c => c.id === expense.categoryId);
                    return (
                      <motion.div
                        key={expense.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-card p-4 flex items-center justify-between group hover:shadow-md transition-all bg-white border-zinc-200/50"
                      >
                        <div className="flex items-center gap-4">
                          <div 
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-sm"
                            style={{ backgroundColor: category?.color || '#ccc' }}
                          >
                            {category?.name[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900">{expense.description}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                              <span>{format(parseISO(expense.date), 'MMM dd, yyyy')}</span>
                              <span className="w-1 h-1 bg-zinc-300 rounded-full" />
                              <span style={{ color: category?.color }}>{category?.name}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-bold text-lg text-zinc-900">₹{expense.amount.toLocaleString()}</div>
                          </div>
                          <button 
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="p-2.5 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[32px] border border-dashed border-zinc-200 text-zinc-400 gap-4">
                    <div className="p-4 bg-zinc-50 rounded-full">
                      <Calendar className="w-8 h-8 text-zinc-300" />
                    </div>
                    <p className="text-sm font-medium italic">No transactions found for this month</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>

      {/* Floating Action Button for Categories */}
      <button 
        onClick={() => setIsCategoryModalOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-white shadow-2xl border border-zinc-200 rounded-[24px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 group"
      >
        <Settings className="w-7 h-7 text-zinc-400 group-hover:text-emerald-600 transition-colors" />
      </button>

      {/* Income Modal */}
      <AnimatePresence>
        {isIncomeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsIncomeModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm p-10"
            >
              <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center mb-6">
                <TrendingUp className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-zinc-900">Set Monthly Income</h2>
              <p className="text-zinc-500 text-sm mb-8">Enter your total expected income for {format(currentMonth, 'MMMM')}.</p>
              
              <form onSubmit={handleUpdateIncome} className="space-y-6">
                <div className="relative">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-zinc-300">₹</span>
                  <input 
                    type="number" 
                    autoFocus
                    required
                    value={tempIncome}
                    onChange={(e) => setTempIncome(e.target.value)}
                    className="w-full pl-12 pr-6 py-5 bg-zinc-50 border border-zinc-200 rounded-2xl text-2xl font-bold focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                    placeholder="0"
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsIncomeModalOpen(false)}
                    className="flex-1 py-4 bg-zinc-100 text-zinc-600 font-bold rounded-2xl hover:bg-zinc-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                  >
                    Update Income
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900">New Expense</h2>
              </div>

              <form onSubmit={handleAddExpense} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 ml-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-bold text-zinc-300">₹</span>
                    <input 
                      type="number" 
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-xl font-bold focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 ml-1">Description</label>
                  <input 
                    type="text" 
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-6 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl font-medium focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
                    placeholder="What was this for?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 ml-1">Category</label>
                    <select 
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-5 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl font-bold text-zinc-700 appearance-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 ml-1">Date</label>
                    <input 
                      type="date" 
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-5 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl font-bold text-zinc-700 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-4 bg-zinc-100 text-zinc-600 font-bold rounded-2xl hover:bg-zinc-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200"
                  >
                    Add Transaction
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Manager Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10 max-h-[85vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <Tag className="w-6 h-6 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900">Categories</h2>
              </div>
              
              <div className="flex gap-2 mb-8">
                <input 
                  type="text" 
                  id="new-cat-input"
                  placeholder="New category name..."
                  className="flex-1 px-6 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 font-medium"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCategory((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    const input = document.getElementById('new-cat-input') as HTMLInputElement;
                    handleAddCategory(input.value);
                    input.value = '';
                  }}
                  className="p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                    <div className="flex items-center gap-4">
                      <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: cat.color }} />
                      <span className="font-bold text-zinc-700">{cat.name}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-2 text-zinc-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="w-full py-4 bg-zinc-100 text-zinc-600 font-bold rounded-2xl hover:bg-zinc-200 transition-all mt-8"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
