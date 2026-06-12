import { useState, useMemo } from 'react';
import { Customer, Server, Plan, Renewal, UserRole } from '../types';
import { format } from 'date-fns';
import { MessageCircle, RefreshCw, Search, Calendar, Clock, RotateCcw } from 'lucide-react';
import { formatCurrency, isCustomerActive, parseSafeNumber, parseRobustLocalTime, formatWhatsappMessage } from '../utils';
import { RenewModal } from '../components/RenewModal';
import { Modal } from '../components/Modal';

interface RadarProps {
  customers: Customer[];
  servers: Server[];
  plans: Plan[];
  whatsappMessage: string;
  todayMessage: string;
  updateCustomer: (id: string, c: Partial<Customer>) => void;
  addRenewal: (r: Omit<Renewal, 'id'>) => void;
  renewalMessage: string;
  overdueMessage: string;
  testMessage: string;
  userRole: UserRole;
}

type SubTab = 'threeDays' | 'today' | 'oneDayOverdue';

export function Radar({
  customers,
  servers,
  plans,
  whatsappMessage,
  todayMessage,
  updateCustomer,
  addRenewal,
  renewalMessage,
  overdueMessage,
  testMessage,
  userRole
}: RadarProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('threeDays');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetOption, setResetOption] = useState<'threeDays' | 'today' | 'overdue' | 'all'>('threeDays');

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const plansMap = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);
  const serversMap = useMemo(() => new Map(servers.map(s => [s.id, s])), [servers]);

  // Processes and groups active and overdue customers (1 day overdue)
  const { threeDaysCustomers, todayCustomers, oneDayOverdueCustomers } = useMemo(() => {
    const threeDays: Customer[] = [];
    const todayList: Customer[] = [];
    const oneDayOverdue: Customer[] = [];

    customers.forEach(c => {
      const dueDateStr = c.dueDate || (c as any).due_date;
      if (!dueDateStr) return;

      const dueDate = parseRobustLocalTime(dueDateStr.toString());
      if (isNaN(dueDate.getTime())) return;

      const plan = plansMap.get(c.planId || (c as any).plan_id);
      const isTest = plan?.name?.toLowerCase().includes('teste') || false;
      const isActive = isCustomerActive(dueDateStr, isTest);

      const dueTime = new Date(dueDate).setHours(0, 0, 0, 0);
      const days = Math.round((dueTime - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (isActive) {
        if (!isTest && days === 3) {
          threeDays.push(c);
        } else if (days === 1) {
          todayList.push(c);
        }
      } else {
        // Overdue flow (inactive) - Only track if not a test plan and exactly 1 day ago
        if (!isTest && days === 0) {
          oneDayOverdue.push(c);
        }
      }
    });

    // Sort by due date (closest expiration first)
    const sortByDate = (a: Customer, b: Customer) => {
      const dateA = new Date(a.dueDate || (a as any).due_date || '').getTime() || 0;
      const dateB = new Date(b.dueDate || (b as any).due_date || '').getTime() || 0;
      return dateA - dateB;
    };

    threeDays.sort(sortByDate);
    todayList.sort(sortByDate);
    oneDayOverdue.sort(sortByDate);

    return {
      threeDaysCustomers: threeDays,
      todayCustomers: todayList,
      oneDayOverdueCustomers: oneDayOverdue
    };
  }, [customers, plansMap, today]);

  // Filter lists based on search query
  const filterBySearch = (list: Customer[]) => {
    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(c => {
      const server = serversMap.get(c.serverId || (c as any).server_id);
      return (
        c.name.toLowerCase().includes(query) ||
        c.phone.includes(query) ||
        (server?.name || '').toLowerCase().includes(query)
      );
    });
  };

  const filteredThreeDays = useMemo(() => filterBySearch(threeDaysCustomers), [threeDaysCustomers, searchQuery, serversMap]);
  const filteredToday = useMemo(() => filterBySearch(todayCustomers), [todayCustomers, searchQuery, serversMap]);
  const filteredOneDayOverdue = useMemo(() => filterBySearch(oneDayOverdueCustomers), [oneDayOverdueCustomers, searchQuery, serversMap]);

  // Filters customers that are actually ready to be notified (not in cooldown)
  const notifiableList = useMemo(() => {
    const list = activeSubTab === 'threeDays' ? filteredThreeDays : 
                 activeSubTab === 'today' ? filteredToday :
                 filteredOneDayOverdue;
    return list.filter(c => {
      const plan = plansMap.get(c.planId || (c as any).plan_id);
      const isTest = plan?.name?.toLowerCase().includes('teste') || false;
      const dueDateStr = c.dueDate || (c as any).due_date;
      const dueDate = parseRobustLocalTime(dueDateStr);
      const dueTime = new Date(dueDate).setHours(0, 0, 0, 0);
      const days = Math.round((dueTime - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (isTest) {
        const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
        if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
        const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 10;
        return !isRecentlyNotified;
      }

      if (days <= 0) {
        const lastOverdueNotified = c.lastOverdueNotifiedDate || (c as any).last_overdue_notified_date;
        const lastOverdueDate = lastOverdueNotified ? parseRobustLocalTime(lastOverdueNotified) : null;
        if (lastOverdueDate) lastOverdueDate.setHours(0, 0, 0, 0);
        const isOnCooldown = lastOverdueDate && !isNaN(lastOverdueDate.getTime()) && Math.round((today.getTime() - lastOverdueDate.getTime()) / (1000 * 60 * 60 * 24)) < 10;
        return !isOnCooldown;
      }

      if (days === 1) {
        const lastNotifiedStr = c.lastNotifiedDate;
        const isNotifiedToday = lastNotifiedStr ? format(parseRobustLocalTime(lastNotifiedStr), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd') : false;
        return !isNotifiedToday;
      }

      // 3 days
      const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
      if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
      const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 10;
      return !isRecentlyNotified;
    });
  }, [activeSubTab, filteredThreeDays, filteredToday, filteredOneDayOverdue, plansMap, today]);

  // Modal open and close handlers
  const openRenewModal = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const confirmRenew = (renewData: { serverId: string; planId: string; amountPaid: string; dueDate: string }) => {
    if (selectedCustomer) {
      const plan = plans.find(p => p.id === renewData.planId);
      if (plan) {
        const newDueDate = renewData.dueDate;

        updateCustomer(selectedCustomer.id, {
          serverId: renewData.serverId,
          planId: renewData.planId,
          amountPaid: parseSafeNumber(renewData.amountPaid),
          dueDate: newDueDate,
          hasResetCounters: false
        });

        const server = servers.find(s => s.id === renewData.serverId);
        const cost = (server?.costPerActive || 0) * (plan?.months || 1);

        addRenewal({
          customerId: selectedCustomer.id,
          serverId: renewData.serverId,
          planId: renewData.planId,
          amount: parseSafeNumber(renewData.amountPaid),
          cost: cost,
          date: new Date().toISOString()
        });

        const isTest = plan?.name?.toLowerCase().includes('teste') || false;
        const message = formatWhatsappMessage(renewalMessage, {
          name: selectedCustomer.name,
          amount: parseFloat(renewData.amountPaid.replace(',', '.')),
          dueDate: newDueDate
        }, isTest);
        window.open(`https://wa.me/${selectedCustomer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
      }
      setSelectedCustomer(null);
    }
  };

  // Cooldown logic for a specific customer card
  const getNotificationStatus = (c: Customer, days: number) => {
    const plan = plansMap.get(c.planId || (c as any).plan_id);
    const isTest = plan?.name?.toLowerCase().includes('teste') || false;

    if (isTest) {
      const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
      if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
      const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 10;
      return { isDisabled: isRecentlyNotified, messageType: 'test' };
    }

    if (days <= 0) {
      // Overdue clients: Cooldown is 10 days on lastOverdueNotifiedDate
      const lastOverdueNotified = c.lastOverdueNotifiedDate || (c as any).last_overdue_notified_date;
      const lastOverdueDate = lastOverdueNotified ? parseRobustLocalTime(lastOverdueNotified) : null;
      if (lastOverdueDate) lastOverdueDate.setHours(0, 0, 0, 0);
      const isOnCooldown = lastOverdueDate && !isNaN(lastOverdueDate.getTime()) && Math.round((today.getTime() - lastOverdueDate.getTime()) / (1000 * 60 * 60 * 24)) < 10;
      return { isDisabled: !!isOnCooldown, messageType: 'overdue' };
    }

    if (days === 1) {
      // Expiration day: Cooldown is only 1 day (meaning only disable if notified today)
      const lastNotifiedStr = c.lastNotifiedDate;
      const isNotifiedToday = lastNotifiedStr ? format(parseRobustLocalTime(lastNotifiedStr), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd') : false;
      return { isDisabled: isNotifiedToday, messageType: 'today' };
    }

    // 3 Days list: Cooldown is 10 days
    const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
    if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
    const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 10;
    return { isDisabled: isRecentlyNotified, messageType: 'standard' };
  };

  const getDaysText = (c: Customer) => {
    const plan = plansMap.get(c.planId || (c as any).plan_id);
    const isTest = plan?.name?.toLowerCase().includes('teste') || false;

    if (isTest) {
      return 'Teste Ativo';
    }

    const dueDateStr = c.dueDate || (c as any).due_date;
    const dueDate = parseRobustLocalTime(dueDateStr);
    const dueTime = new Date(dueDate).setHours(0, 0, 0, 0);
    const days = Math.round((dueTime - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (days === 1) return 'Vence hoje';
    if (days === 2) return 'Vence amanhã';
    if (days === 0) return 'Vencido há 1 dia';
    if (days < 0) return `Vencido há ${Math.abs(days - 1)} dias`;
    return `Vence em ${days} dias`;
  };

  const handleExecuteReset = () => {
    let targetCount = 0;
    
    customers.forEach(c => {
      const plan = plansMap.get(c.planId || (c as any).plan_id);
      const isTest = plan?.name?.toLowerCase().includes('teste') || false;
      const dueDateStr = c.dueDate || (c as any).due_date;
      if (!dueDateStr) return;

      const dueDate = parseRobustLocalTime(dueDateStr.toString());
      if (isNaN(dueDate.getTime())) return;

      const dueTime = new Date(dueDate).setHours(0, 0, 0, 0);
      const days = Math.round((dueTime - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const isActive = isCustomerActive(dueDateStr, isTest);

      let shouldReset = false;
      let updates: Partial<Customer> = {};

      if (resetOption === 'threeDays') {
        if (!isTest && days === 3) {
          shouldReset = true;
          updates = { lastNotifiedDate: undefined };
        }
      } else if (resetOption === 'today') {
        if (days === 1) {
          shouldReset = true;
          updates = { lastNotifiedDate: undefined };
        }
      } else if (resetOption === 'overdue') {
        if (!isActive) {
          shouldReset = true;
          updates = { lastNotifiedDate: undefined, lastOverdueNotifiedDate: undefined };
        }
      } else if (resetOption === 'all') {
        shouldReset = true;
        updates = { lastNotifiedDate: undefined, lastOverdueNotifiedDate: undefined };
      }

      if (shouldReset) {
        updateCustomer(c.id, updates);
        targetCount++;
      }
    });

    alert(`Sucesso! Tempo de aviso resetado para ${targetCount} clientes.`);
    setIsResetModalOpen(false);
  };

  const currentList = useMemo(() => {
    if (activeSubTab === 'threeDays') return filteredThreeDays;
    if (activeSubTab === 'today') return filteredToday;
    return filteredOneDayOverdue;
  }, [activeSubTab, filteredThreeDays, filteredToday, filteredOneDayOverdue]);

  return (
    <div className="space-y-6 pb-24">
      {/* Header and SubTabs */}
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-3">
            <Clock size={28} className="text-[#c8a646]" />
            <h2 className="text-xl font-bold text-white uppercase tracking-widest text-sm">Radar de Renovação</h2>
          </div>
          {userRole !== 'observer' && (
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="px-3 py-1.5 bg-[#161616] border border-white/5 hover:bg-white/5 hover:border-white/10 text-gray-400 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 active:scale-95 shadow-lg"
              title="Resetar Tempos de Aviso"
            >
              <RotateCcw size={12} />
              <span>Resetar Avisos</span>
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-3.5 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome ou servidor..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#161616] border border-white/5 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-[#c8a646] transition-colors"
          />
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-[#161616] p-1 rounded-2xl border border-white/5">
          <button
            onClick={() => setActiveSubTab('threeDays')}
            className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
              activeSubTab === 'threeDays'
                ? 'bg-[#c8a646] text-[#0f0f0f] shadow-lg shadow-[#c8a646]/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Alerta 3 Dias</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
              activeSubTab === 'threeDays' ? 'bg-[#0f0f0f]/20 text-[#0f0f0f]' : 'bg-white/10 text-gray-300'
            }`}>
              {threeDaysCustomers.length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveSubTab('today')}
            className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
              activeSubTab === 'today'
                ? 'bg-[#c8a646] text-[#0f0f0f] shadow-lg shadow-[#c8a646]/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Vence Hoje</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
              activeSubTab === 'today' ? 'bg-[#0f0f0f]/20 text-[#0f0f0f]' : 'bg-white/10 text-gray-300'
            }`}>
              {todayCustomers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('oneDayOverdue')}
            className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
              activeSubTab === 'oneDayOverdue'
                ? 'bg-[#c8a646] text-[#0f0f0f] shadow-lg shadow-[#c8a646]/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Vencidos 1 Dia</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
              activeSubTab === 'oneDayOverdue' ? 'bg-[#0f0f0f]/20 text-[#0f0f0f]' : 'bg-white/10 text-gray-300'
            }`}>
              {oneDayOverdueCustomers.length}
            </span>
          </button>
        </div>

        </div>

      {/* Customer List */}
      <div className="flex flex-col space-y-4">
        {currentList.length > 0 ? (
          currentList.map(c => {
            const plan = plansMap.get(c.planId || (c as any).plan_id);
            const server = serversMap.get(c.serverId || (c as any).server_id);
            const isTest = plan?.name?.toLowerCase().includes('teste') || false;
            const dueDateStr = c.dueDate || (c as any).due_date;

            const dueDate = parseRobustLocalTime(dueDateStr);
            const dueTime = new Date(dueDate).setHours(0, 0, 0, 0);
            const days = Math.round((dueTime - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            const { isDisabled } = getNotificationStatus(c, days);
            const daysText = getDaysText(c);

            return (
              <div key={c.id} className="w-full">
                <div className="p-4 sm:p-5 rounded-[22px] border border-white/5 shadow-2xl glass-card relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#c8a646]/5 rounded-full -mr-12 -mt-12 blur-2xl pointer-events-none" />

                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
                    <div className="flex justify-between items-start sm:items-center">
                      <div className="flex flex-col">
                        <div className="mb-2.5">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shadow-lg ${
                            days <= 0
                              ? 'bg-red-500 text-white shadow-red-500/10'
                              : (days === 1
                                ? 'bg-amber-500 text-black shadow-amber-500/10'
                                : 'bg-[#c8a646]/20 text-[#c8a646]')
                          }`}>
                            {daysText}
                          </span>
                        </div>
                        <div className="font-bold text-white text-base sm:text-lg leading-tight mb-1">{c.name}</div>
                        <div className="text-[10px] text-[#c8a646] font-black uppercase tracking-wider">
                          {plan?.name || 'Plano'} • {server?.name || 'Servidor'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end space-x-4 w-full sm:w-auto pt-1 sm:pt-0">
                      <div className="text-left sm:text-right mr-2">
                        <div className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Valor</div>
                        <div className="text-lg font-black text-white">{formatCurrency(c.amountPaid)}</div>
                      </div>

                      <div className="flex space-x-2">
                        {/* Notify Button */}
                        <button
                          onClick={() => {
                            const isOverdue = days <= 0;
                            const template = isOverdue ? overdueMessage : (days === 1 ? todayMessage : whatsappMessage);
                            const message = formatWhatsappMessage(template, {
                              name: c.name,
                              amount: c.amountPaid,
                              dueDate: c.dueDate
                            }, isTest);

                            // Update notified timestamp
                            if (isOverdue) {
                              updateCustomer(c.id, { lastOverdueNotifiedDate: format(today, 'yyyy-MM-dd') });
                            } else {
                              updateCustomer(c.id, { lastNotifiedDate: format(today, 'yyyy-MM-dd') });
                            }
                            window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                          }}
                          disabled={isDisabled || userRole === 'observer'}
                          className={`w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl transition-all border ${
                            isDisabled
                              ? 'bg-white/5 text-gray-600 border-white/5 cursor-not-allowed'
                              : 'bg-green-500/10 text-green-400 border-green-500/15 hover:bg-green-500/20 active:scale-95'
                          }`}
                          title={isDisabled ? "Notificado recentemente" : "Mandar mensagem WhatsApp"}
                        >
                          <MessageCircle size={18} />
                        </button>

                        {/* Renew Button */}
                        {userRole !== 'observer' && (
                          <button
                            onClick={() => openRenewModal(c)}
                            className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center bg-white/5 text-gray-400 rounded-2xl hover:text-white hover:bg-white/10 active:scale-95 transition-all border border-white/10"
                            title="Renovar Acesso"
                          >
                            <RefreshCw size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-[#141414] rounded-[32px] border border-white/5 text-center">
            {activeSubTab === 'threeDays' ? (
              <>
                <div className="bg-[#c8a646]/10 p-4 rounded-full border border-[#c8a646]/20 mb-4">
                  <Calendar size={32} className="text-[#c8a646]" />
                </div>
                <h3 className="font-bold text-white text-lg mb-1">Ninguém vencendo em 3 dias</h3>
                <p className="text-gray-500 text-xs max-w-xs leading-relaxed">
                  Todos os clientes estão com prazos diferentes ou a busca não encontrou resultados.
                </p>
              </>
            ) : activeSubTab === 'today' ? (
              <>
                <div className="bg-[#c8a646]/10 p-4 rounded-full border border-[#c8a646]/20 mb-4">
                  <Clock size={32} className="text-[#c8a646]" />
                </div>
                <h3 className="font-bold text-white text-lg mb-1">Tudo em dia!</h3>
                <p className="text-gray-500 text-xs max-w-xs leading-relaxed">
                  Não há clientes vencendo hoje.
                </p>
              </>
            ) : (
              <>
                <div className="bg-[#c8a646]/10 p-4 rounded-full border border-[#c8a646]/20 mb-4">
                  <Clock size={32} className="text-[#c8a646]" />
                </div>
                <h3 className="font-bold text-white text-lg mb-1">Sem vencidos ontem</h3>
                <p className="text-gray-500 text-xs max-w-xs leading-relaxed">
                  Não há clientes que venceram há 1 dia.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Reset Warnings Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Resetar Tempos de Aviso"
        maxWidth="max-w-md"
      >
        <p className="text-gray-400 text-xs mb-5">
          Escolha quais avisos de notificação você deseja limpar para permitir o reenvio hoje:
        </p>

        <div className="space-y-3">
          {[
            { id: 'threeDays', label: 'Alerta de 3 Dias', desc: 'Reseta o cooldown dos clientes que vencem em 3 dias' },
            { id: 'today', label: 'Alerta de Vence Hoje', desc: 'Reseta o cooldown dos clientes que vencem hoje' },
            { id: 'overdue', label: 'Alerta de Vencidos', desc: 'Reseta o cooldown de cobrança dos clientes inativos' },
            { id: 'all', label: 'Todos os Avisos', desc: 'Limpa o histórico de avisos de todos os clientes' }
          ].map(opt => (
            <label
              key={opt.id}
              onClick={() => setResetOption(opt.id as any)}
              className={`relative flex flex-col p-4 cursor-pointer rounded-2xl border transition-all ${
                resetOption === opt.id
                  ? 'bg-[#c8a646]/10 border-[#c8a646]'
                  : 'bg-[#0f0f0f]/50 border-white/10 hover:border-white/20'
              }`}
            >
              <input type="radio" name="resetOption" value={opt.id} checked={resetOption === opt.id} onChange={() => {}} className="sr-only" />
              <span className="font-bold text-white text-xs mb-1">{opt.label}</span>
              <span className="text-[10px] text-gray-400 leading-normal">{opt.desc}</span>
            </label>
          ))}
        </div>

        <div className="flex space-x-3 mt-6">
          <button
            onClick={() => setIsResetModalOpen(false)}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors text-xs uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button
            onClick={handleExecuteReset}
            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all shadow-lg shadow-red-600/10 text-xs uppercase tracking-wider"
          >
            Confirmar Reset
          </button>
        </div>
      </Modal>

      {/* Renew Modal */}
      <RenewModal
        isOpen={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        customer={selectedCustomer}
        servers={servers}
        plans={plans}
        onConfirm={confirmRenew}
      />
    </div>
  );
}
