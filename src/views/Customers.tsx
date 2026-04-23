import React, { useState, useMemo, useRef } from 'react';
import { Customer, Server, Plan, Renewal } from '../types';
import { format, parseISO, addMonths, isAfter, differenceInDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { formatCurrency, isCustomerActive, formatWhatsappMessage, parseSafeNumber, parseRobustLocalTime } from '../utils';
import { Modal } from '../components/Modal';
import { RenewModal } from '../components/RenewModal';
import { Plus, Search, Filter, Phone, RefreshCw, Edit2, Trash2, Calendar, CheckCircle, XCircle, MessageCircle, Users, Award, Star, UserX, ArrowRightLeft, ChevronDown, Check } from 'lucide-react';
import { TransferModal } from '../components/TransferModal';
import { UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface CustomersProps {
  customers: Customer[];
  servers: Server[];
  plans: Plan[];
  whatsappMessage: string;
  addCustomer: (c: Customer) => Promise<boolean>;
  updateCustomer: (id: string, c: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  bulkUpdateCustomers: (updater: (prev: Customer[]) => Customer[]) => void;
  addRenewal: (r: Omit<Renewal, 'id'>) => void;
  renewalMessage: string;
  overdueMessage: string;
  transferCustomer: (customerId: string, newServerId: string) => void;
  userRole: UserRole;
}

export function Customers({
  customers, servers, plans, whatsappMessage,
  addCustomer, updateCustomer, deleteCustomer,
  bulkUpdateCustomers, addRenewal, renewalMessage, overdueMessage,
  transferCustomer, userRole
}: CustomersProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Delete Confirmation State
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Renew State
  const [selectedCustomerForRenew, setSelectedCustomerForRenew] = useState<Customer | null>(null);

  // Transfer State
  const [selectedCustomerForTransfer, setSelectedCustomerForTransfer] = useState<Customer | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [statsFilter, setStatsFilter] = useState<string>('all');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    serverId: servers.length > 0 ? servers[0].id : '',
    planId: plans.length > 0 ? plans[0].id : '',
    amountPaid: plans.length > 0 ? plans[0].defaultPrice.toString() : '0',
    dueDate: format(addMonths(new Date(), plans.length > 0 ? plans[0].months : 1), 'yyyy-MM-dd')
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const handleRenew = (renewData: { serverId: string; planId: string; amountPaid: string }) => {
    if (selectedCustomerForRenew) {
      const plan = plans.find(p => p.id === renewData.planId);
      if (plan) {
        const currentDueDate = parseRobustLocalTime(selectedCustomerForRenew.dueDate);
        currentDueDate.setHours(0, 0, 0, 0);
        const isActive = isAfter(currentDueDate, today) || Math.round((currentDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) === 0;

        // If active, add to current due date. If expired, add to today.
        const baseDate = isActive ? currentDueDate : today;
        const newDueDate = format(addMonths(baseDate, plan.months), 'yyyy-MM-dd');

        updateCustomer(selectedCustomerForRenew.id, {
          serverId: renewData.serverId,
          planId: renewData.planId,
          amountPaid: parseSafeNumber(renewData.amountPaid),
          dueDate: newDueDate,
          hasResetCounters: false
        });

        const server = servers.find(s => s.id === renewData.serverId);
        const cost = (server?.costPerActive || 0) * (plan?.months || 1);

        addRenewal({
          customerId: selectedCustomerForRenew.id,
          serverId: renewData.serverId,
          planId: renewData.planId,
          amount: parseSafeNumber(renewData.amountPaid),
          cost: Number(cost),
          date: new Date().toISOString()
        });

        // Open Renewal Confirmation Message
        const message = formatWhatsappMessage(renewalMessage, {
          name: selectedCustomerForRenew.name,
          amount: parseFloat(renewData.amountPaid.replace(',', '.')),
          dueDate: newDueDate
        });
        window.open(`https://wa.me/${selectedCustomerForRenew.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
      }
      setSelectedCustomerForRenew(null);
    }
  };

  const handleTransfer = (newServerId: string) => {
    if (selectedCustomerForTransfer) {
      transferCustomer(selectedCustomerForTransfer.id, newServerId);
      setSelectedCustomerForTransfer(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseSafeNumber(formData.amountPaid);

    const data = {
      name: formData.name,
      phone: formData.phone,
      serverId: formData.serverId,
      planId: formData.planId,
      amountPaid: amount,
      dueDate: formData.dueDate,
    };

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, data);
    } else {
      const newId = uuidv4();
      const success = await addCustomer({ ...data, id: newId });

      if (success) {
        const server = servers.find(s => s.id === data.serverId);
        const plan = plans.find(p => p.id === data.planId);
        const cost = (server?.costPerActive || 0) * (plan?.months || 1);

        addRenewal({
          customerId: newId,
          serverId: data.serverId,
          planId: data.planId,
          amount: Number(data.amountPaid),
          cost: Number(cost),
          date: new Date().toISOString()
        });

        // Open Renewal Confirmation Message for NEW customer
        const message = formatWhatsappMessage(renewalMessage, {
          name: data.name,
          amount: data.amountPaid,
          dueDate: data.dueDate
        });
        window.open(`https://wa.me/${data.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
      } else {
        alert("Erro ao salvar cliente no banco de dados. Verifique sua conexão.");
      }
    }
    closeModal();
  };

  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        serverId: customer.serverId,
        planId: customer.planId,
        amountPaid: customer.amountPaid.toString(),
        dueDate: customer.dueDate
      });
    } else {
      setEditingCustomer(null);
      const defaultPlan = plans[0];
      setFormData({
        name: '',
        phone: '',
        serverId: servers.length > 0 ? servers[0].id : '',
        planId: defaultPlan?.id || '',
        amountPaid: defaultPlan?.defaultPrice.toString() || '0',
        dueDate: format(addMonths(new Date(), defaultPlan?.months || 1), 'yyyy-MM-dd')
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const confirmDelete = () => {
    if (customerToDelete) {
      deleteCustomer(customerToDelete.id);
      setCustomerToDelete(null);
    }
  };

  const openRenewModal = (customer: Customer) => {
    setSelectedCustomerForRenew(customer);
  };

  // Statistics
  const stats = useMemo(() => {
    let total = 0;
    let mensalista = 0;
    let gratuito = 0;
    let inativos = 0;

    const todayTime = today.getTime();

    customers.forEach(c => {
      const dueDate = parseRobustLocalTime(c.dueDate);
      if (isNaN(dueDate.getTime())) {
        inativos++;
        return;
      }

      dueDate.setHours(0, 0, 0, 0);
      const isActive = dueDate.getTime() >= todayTime;

      if (isActive) {
        total++;
        const plan = plans.find(p => p.id === c.planId);
        if (plan?.name === 'Gratuito') {
          gratuito++;
        } else {
          mensalista++;
        }
      } else {
        inativos++;
      }
    });

    return { total, mensalista, gratuito, inativos };
  }, [customers, plans, today]);


  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const todayTime = today.getTime();

    return customers.filter(c => {
      const dueDate = parseRobustLocalTime(c.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const isActive = dueDate.getTime() >= todayTime;

      // Filter by stats cards
      if (statsFilter === 'ativos' && !isActive) return false;
      if (statsFilter === 'inativos' && isActive) return false;
      
      const plan = plans.find(p => p.id === c.planId);
      const isGratis = plan?.name === 'Gratuito';
      
      if (statsFilter === 'mensal' && (!isActive || isGratis)) return false;
      if (statsFilter === 'gratis' && (!isActive || !isGratis)) return false;

      const matchesSearch = !query || c.name.toLowerCase().includes(query) || c.phone.includes(query);
      if (!matchesSearch) return false;

      const [type, value] = filter.split(':');
      
      if (type === 'server' && c.serverId !== value) return false;
      if (type === 'plan' && c.planId !== value) return false;
      if (type === 'status') {
        const dueDate = parseRobustLocalTime(c.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const isActive = dueDate.getTime() >= todayTime;
        const status = isActive ? 'ativo' : 'vencido';
        if (status !== value) return false;
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.dueDate).getTime() || 0;
      const dateB = new Date(b.dueDate).getTime() || 0;
      return dateA - dateB;
    });
  }, [customers, searchQuery, filter, statsFilter, today, plans]);

  return (
    <div className="pb-24 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <AnimatePresence mode="wait">
          {!isSearchOpen ? (
            <motion.h2 
              key="title"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="text-xl font-bold text-white uppercase tracking-widest"
            >
              Clientes
            </motion.h2>
          ) : (
            <motion.div 
              key="search"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: '100%' }}
              exit={{ opacity: 0, width: 0 }}
              className="flex-1 mr-4 relative"
            >
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#c8a646]" size={18} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setIsSearchOpen(false); }}
                className="w-full bg-[#1a1a1a] border border-[#c8a646]/30 rounded-full pl-10 pr-4 py-2 text-white focus:outline-none focus:border-[#c8a646] transition-all"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center space-x-2">
          {/* Search Toggle */}
          {!isSearchOpen && (
            <button
              onClick={() => {
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
              className="p-2 rounded-full bg-[#1a1a1a] text-gray-400 border border-white/5 hover:border-white/20 transition-all"
            >
              <Search size={24} />
            </button>
          )}

          {/* Filter Button */}
          <div className="relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`p-2 rounded-full transition-all duration-300 border ${
                filter !== 'all' || isFilterOpen
                  ? 'bg-[#c8a646] text-[#0f0f0f] border-[#c8a646] shadow-lg shadow-[#c8a646]/20'
                  : 'bg-[#1a1a1a] text-gray-400 border-white/5 hover:border-white/20'
              }`}
              title="Filtrar"
            >
              <Filter size={24} />
            </button>

            <AnimatePresence>
              {isFilterOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsFilterOpen(false)} 
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute right-0 mt-3 w-72 bg-[#1a1a1a] border border-white/10 rounded-3xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                  >
                    <div className="max-h-[400px] overflow-y-auto py-2 custom-scrollbar">
                      {/* All Option */}
                      <button
                        onClick={() => { setFilter('all'); setIsFilterOpen(false); }}
                        className={`w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors ${filter === 'all' ? 'text-[#c8a646]' : 'text-gray-400'}`}
                      >
                        <span className="font-bold text-sm uppercase tracking-widest">Mostrar Todos</span>
                        {filter === 'all' && <Check size={18} />}
                      </button>

                      {/* Status Group */}
                      <div className="px-6 py-2">
                        <div className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2 flex items-center space-x-2">
                          <Calendar size={12} />
                          <span>Status</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {['ativo', 'vencido'].map(v => (
                            <button
                              key={v}
                              onClick={() => { setFilter(`status:${v}`); setIsFilterOpen(false); }}
                              className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${filter === `status:${v}` ? 'bg-[#c8a646] text-[#0f0f0f] border-[#c8a646]' : 'bg-[#0f0f0f] text-gray-400 border-white/5 hover:border-white/20'}`}
                            >
                              {v === 'ativo' ? 'Ativos' : 'Vencidos'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Servers Group */}
                      <div className="px-6 py-2 mt-2">
                        <div className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2 flex items-center space-x-2">
                          <Filter size={12} />
                          <span>Servidores</span>
                        </div>
                        <div className="space-y-1">
                          {servers.map(s => (
                            <button
                              key={s.id}
                              onClick={() => { setFilter(`server:${s.id}`); setIsFilterOpen(false); }}
                              className={`w-full px-4 py-3 rounded-xl text-left text-sm font-bold transition-all flex items-center justify-between ${filter === `server:${s.id}` ? 'bg-[#c8a646]/10 text-[#c8a646]' : 'text-gray-400 hover:bg-white/5'}`}
                            >
                              <span>{s.name}</span>
                              {filter === `server:${s.id}` && <Check size={16} />}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Plans Group */}
                      <div className="px-6 py-2 mt-2">
                        <div className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2 flex items-center space-x-2">
                          <Award size={12} />
                          <span>Planos</span>
                        </div>
                        <div className="space-y-1">
                          {plans.map(p => (
                            <button
                              key={p.id}
                              onClick={() => { setFilter(`plan:${p.id}`); setIsFilterOpen(false); }}
                              className={`w-full px-4 py-3 rounded-xl text-left text-sm font-bold transition-all flex items-center justify-between ${filter === `plan:${p.id}` ? 'bg-[#c8a646]/10 text-[#c8a646]' : 'text-gray-400 hover:bg-white/5'}`}
                            >
                              <span>{p.name}</span>
                              {filter === `plan:${p.id}` && <Check size={16} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {userRole !== 'observer' && (
            <button
              onClick={() => openModal()}
              className="bg-[#c8a646] text-[#0f0f0f] p-2 rounded-full hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
            >
              <Plus size={24} />
            </button>
          )}
        </div>
      </div>



      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setStatsFilter(statsFilter === 'ativos' ? 'all' : 'ativos')}
          className={`cursor-pointer transition-all duration-300 p-2 sm:p-4 rounded-xl sm:rounded-2xl border ${
            statsFilter === 'ativos' 
              ? 'bg-[#c8a646] border-[#c8a646] shadow-xl shadow-[#c8a646]/20' 
              : 'bg-[#1a1a1a] border-white/5 hover:border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <Users size={14} className={`sm:w-[18px] sm:h-[18px] ${statsFilter === 'ativos' ? 'text-[#0f0f0f]' : 'text-[#c8a646]'}`} />
            {statsFilter === 'ativos' && <Check size={10} className="sm:w-3 sm:h-3 text-[#0f0f0f]" />}
          </div>
          <div className={`text-[7px] sm:text-[10px] font-bold uppercase tracking-tighter sm:tracking-widest ${statsFilter === 'ativos' ? 'text-[#0f0f0f]/60' : 'text-gray-500'}`}>Ativos</div>
          <div className={`text-sm sm:text-2xl font-bold ${statsFilter === 'ativos' ? 'text-[#0f0f0f]' : 'text-white'}`}>{stats.total}</div>
        </motion.div>

        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setStatsFilter(statsFilter === 'mensal' ? 'all' : 'mensal')}
          className={`cursor-pointer transition-all duration-300 p-2 sm:p-4 rounded-xl sm:rounded-2xl border ${
            statsFilter === 'mensal' 
              ? 'bg-blue-600 border-blue-600 shadow-xl shadow-blue-600/20' 
              : 'bg-[#1a1a1a] border-white/5 hover:border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <Award size={14} className={`sm:w-[18px] sm:h-[18px] ${statsFilter === 'mensal' ? 'text-white' : 'text-blue-500'}`} />
            {statsFilter === 'mensal' && <Check size={10} className="sm:w-3 sm:h-3 text-white" />}
          </div>
          <div className={`text-[7px] sm:text-[10px] font-bold uppercase tracking-tighter sm:tracking-widest ${statsFilter === 'mensal' ? 'text-white/70' : 'text-gray-500'}`}>Mensal</div>
          <div className={`text-sm sm:text-2xl font-bold ${statsFilter === 'mensal' ? 'text-white' : 'text-white'}`}>{stats.mensalista}</div>
        </motion.div>

        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setStatsFilter(statsFilter === 'gratis' ? 'all' : 'gratis')}
          className={`cursor-pointer transition-all duration-300 p-2 sm:p-4 rounded-xl sm:rounded-2xl border ${
            statsFilter === 'gratis' 
              ? 'bg-green-600 border-green-600 shadow-xl shadow-green-600/20' 
              : 'bg-[#1a1a1a] border-white/5 hover:border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <Star size={14} className={`sm:w-[18px] sm:h-[18px] ${statsFilter === 'gratis' ? 'text-white' : 'text-green-500'}`} />
            {statsFilter === 'gratis' && <Check size={10} className="sm:w-3 sm:h-3 text-white" />}
          </div>
          <div className={`text-[7px] sm:text-[10px] font-bold uppercase tracking-tighter sm:tracking-widest ${statsFilter === 'gratis' ? 'text-white/70' : 'text-gray-500'}`}>Gratis</div>
          <div className={`text-sm sm:text-2xl font-bold ${statsFilter === 'gratis' ? 'text-white' : 'text-white'}`}>{stats.gratuito}</div>
        </motion.div>

        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setStatsFilter(statsFilter === 'inativos' ? 'all' : 'inativos')}
          className={`cursor-pointer transition-all duration-300 p-2 sm:p-4 rounded-xl sm:rounded-2xl border ${
            statsFilter === 'inativos' 
              ? 'bg-red-600 border-red-600 shadow-xl shadow-red-600/20' 
              : 'bg-[#1a1a1a] border-white/5 hover:border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <UserX size={14} className={`sm:w-[18px] sm:h-[18px] ${statsFilter === 'inativos' ? 'text-white' : 'text-red-500'}`} />
            {statsFilter === 'inativos' && <Check size={10} className="sm:w-3 sm:h-3 text-white" />}
          </div>
          <div className={`text-[7px] sm:text-[10px] font-bold uppercase tracking-tighter sm:tracking-widest ${statsFilter === 'inativos' ? 'text-white/70' : 'text-gray-500'}`}>Inativos</div>
          <div className={`text-sm sm:text-2xl font-bold ${statsFilter === 'inativos' ? 'text-white' : 'text-white'}`}>{stats.inativos}</div>
        </motion.div>
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>Nenhum cliente encontrado.</p>
          </div>
        ) : (
          filteredCustomers.map(customer => {
            const server = servers.find(s => s.id === customer.serverId);
            const plan = plans.find(p => p.id === customer.planId);
            const dueDate = parseRobustLocalTime(customer.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const daysDiff = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const isActive = dueDate.getTime() >= today.getTime();

            const lastNotified = customer.lastNotifiedDate ? parseRobustLocalTime(customer.lastNotifiedDate) : null;
            if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
            const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 7;

            const lastOverdueNotified = customer.lastOverdueNotifiedDate || (customer as any).last_overdue_notified_date;
            const lastOverdueDate = lastOverdueNotified ? parseRobustLocalTime(lastOverdueNotified) : null;
            if (lastOverdueDate) lastOverdueDate.setHours(0, 0, 0, 0);
            const isOnCooldown = lastOverdueDate && !isNaN(lastOverdueDate.getTime()) && Math.round((today.getTime() - lastOverdueDate.getTime()) / (1000 * 60 * 60 * 24)) < 10;

            return (
              <div key={customer.id} className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-4 shadow-lg">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                      <span>{customer.name}</span>
                      {isActive ? (
                        <CheckCircle size={14} className="text-green-500" />
                      ) : (
                        <XCircle size={14} className="text-red-500" />
                      )}
                      {(daysDiff === 1 || daysDiff === 2) && !isRecentlyNotified && (
                        <span className="bg-[#c8a646] text-[#0f0f0f] text-[10px] font-bold px-1.5 py-0.5 rounded">
                          NOTIFICAR
                        </span>
                      )}
                    </h3>
                    <div className="text-xs text-[#c8a646] uppercase tracking-wider mt-1">{server?.name} • {plan?.name}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        const message = formatWhatsappMessage(whatsappMessage, {
                          name: customer.name,
                          amount: customer.amountPaid,
                          dueDate: customer.dueDate
                        });

                        updateCustomer(customer.id, { lastNotifiedDate: format(today, 'yyyy-MM-dd') });
                        window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                      }}
                      className={`p-2 rounded-full transition-colors ${(daysDiff === 1 || daysDiff === 2) && !isRecentlyNotified ? 'bg-green-600/30 text-green-400 animate-pulse' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                      title="WhatsApp"
                    >
                      <Phone size={16} />
                    </button>

                    {userRole !== 'observer' && (
                      <>
                        {!isActive && (
                          <button
                            type="button"
                            onClick={(e) => {
                              const lastOverdueNotified = customer.lastOverdueNotifiedDate;
                              const lastOverdueDate = lastOverdueNotified ? parseRobustLocalTime(lastOverdueNotified) : null;
                              if (lastOverdueDate) lastOverdueDate.setHours(0, 0, 0, 0);
                              const isOnCooldown = lastOverdueDate && !isNaN(lastOverdueDate.getTime()) && Math.round((today.getTime() - lastOverdueDate.getTime()) / (1000 * 60 * 60 * 24)) < 10;

                              if (isOnCooldown) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }

                              const overdueDays = Math.abs(daysDiff - 1);
                              const message = formatWhatsappMessage(overdueMessage, {
                                name: customer.name,
                                amount: customer.amountPaid,
                                dueDate: customer.dueDate
                              });

                              updateCustomer(customer.id, {
                                lastOverdueNotifiedDate: format(today, 'yyyy-MM-dd')
                              });

                              window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                            }}
                            disabled={Boolean(isOnCooldown)}
                            className={`p-2 rounded-full transition-all duration-300 ${isOnCooldown
                              ? 'bg-gray-500/10 text-gray-600 cursor-not-allowed opacity-40 pointer-events-none select-none'
                              : 'bg-red-500/20 text-red-500 hover:bg-red-500/30 animate-bounce'
                              }`}
                            style={{ pointerEvents: isOnCooldown ? 'none' : 'auto' }}
                            title={
                              isOnCooldown
                                ? `Próximo envio em ${10 - differenceInDays(today, lastOverdueDate!)} dias`
                                : "Lembrar Vencimento"
                            }
                          >
                            <MessageCircle size={16} />
                          </button>
                        )}

                        <button onClick={() => openRenewModal(customer)} className="p-2 text-green-400 hover:text-green-300 transition-colors bg-green-500/10 rounded-full" title="Renovar">
                          <RefreshCw size={16} />
                        </button>
                        <button onClick={() => setSelectedCustomerForTransfer(customer)} className="p-2 text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 rounded-full" title="Mudar Servidor">
                          <ArrowRightLeft size={16} />
                        </button>
                        <button onClick={() => openModal(customer)} className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full" title="Editar">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => setCustomerToDelete(customer)} className="p-2 text-red-400 hover:text-red-300 transition-colors bg-red-500/10 rounded-full" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="flex items-center space-x-2 text-sm text-gray-400">
                    <Calendar size={14} />
                    <span className={!isActive ? 'text-red-400 font-medium' : daysDiff <= 10 ? 'text-yellow-500 font-medium' : ''}>
                      {(() => {
                        try {
                          return isNaN(dueDate.getTime()) ? 'Data Inválida' : format(dueDate, 'dd/MM/yyyy');
                        } catch {
                          return 'Data Inválida';
                        }
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-end space-x-2 text-sm font-medium text-white">
                    {formatCurrency(customer.amountPaid)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        title="Excluir Cliente"
      >
        <p className="text-gray-400 text-sm mb-6">
          Tem certeza que deseja excluir o cliente <span className="text-white font-bold">{customerToDelete?.name}</span>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={() => setCustomerToDelete(null)}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmDelete}
            className="flex-1 py-3 rounded-xl bg-red-500/20 text-red-500 font-bold hover:bg-red-500/30 transition-colors"
          >
            Excluir
          </button>
        </div>
      </Modal>

      {/* Renew Modal */}
      <RenewModal
        isOpen={!!selectedCustomerForRenew}
        onClose={() => setSelectedCustomerForRenew(null)}
        customer={selectedCustomerForRenew}
        servers={servers}
        plans={plans}
        onConfirm={handleRenew}
      />

      <TransferModal
        isOpen={!!selectedCustomerForTransfer}
        onClose={() => setSelectedCustomerForTransfer(null)}
        customer={selectedCustomerForTransfer}
        servers={servers}
        onConfirm={handleTransfer}
      />

      {/* Form Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Nome</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">WhatsApp</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="5511999999999"
                className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[#c8a646]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Servidor</label>
            <select
              required
              value={formData.serverId}
              onChange={e => setFormData({ ...formData, serverId: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] appearance-none"
            >
              <option value="" disabled>Selecione um servidor</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Plano</label>
            <select
              required
              value={formData.planId}
              onChange={e => {
                const planId = e.target.value;
                const plan = plans.find(p => p.id === planId);
                if (plan) {
                  setFormData({
                    ...formData,
                    planId,
                    amountPaid: plan.defaultPrice.toString(),
                    dueDate: format(addMonths(new Date(), plan.months), 'yyyy-MM-dd')
                  });
                }
              }}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] appearance-none"
            >
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Valor (R$)</label>
              <input
                type="text"
                required
                value={formData.amountPaid}
                onChange={e => setFormData({ ...formData, amountPaid: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Vencimento</label>
              <input
                type="date"
                required
                value={formData.dueDate}
                onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646]"
              />
            </div>
          </div>

          <div className="flex space-x-3 mt-8 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-[#c8a646] text-[#0f0f0f] font-bold hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


