import { useState, useMemo } from 'react';
import { Customer, Server, Plan, Renewal, ManualAddition } from '../types';
import { format, parseISO, isAfter, differenceInDays, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertCircle, MessageCircle, ChevronRight, Server as ServerIcon, Calendar, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { formatCurrency, isCustomerActive, parseSafeNumber, parseRobustLocalTime, formatWhatsappMessage } from '../utils';
import { RenewModal } from '../components/RenewModal';
import { UserRole } from '../types';

interface DashboardProps {
  customers: Customer[];
  servers: Server[];
  plans: Plan[];
  whatsappMessage: string;
  updateCustomer: (id: string, c: Partial<Customer>) => void;
  renewals: Renewal[];
  addRenewal: (r: Omit<Renewal, 'id'>) => void;
  manualAdditions: ManualAddition[];
  renewalMessage: string;
  overdueMessage: string;
  testMessage: string;
  userRole: UserRole;
}

export function Dashboard({ customers, servers, plans, whatsappMessage, updateCustomer, renewals, addRenewal, manualAdditions, renewalMessage, overdueMessage, testMessage, userRole }: DashboardProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Renew State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Calculate stats
  const { grossValue, totalPaidToServers, monthlyGross, monthlyCost, serverStats, expiringCustomers, totalPlansValue } = useMemo(() => {
    const plansMap = new Map(plans.map(p => [p.id, p]));
    const tMonth = today.getMonth();
    const tYear = today.getFullYear();

    let totalGross = 0;
    let totalCost = 0;
    let mGross = 0;
    let mCost = 0;

    const stats: Record<string, { name: string; active: number; monthlyGross: number; monthlyCost: number; accumulatedTotal: number }> = {};
    servers.forEach(s => {
      const sId = (s.id || '').toString();
      if (!sId) return;
      stats[sId] = {
        name: s.name,
        active: 0,
        monthlyGross: 0,
        monthlyCost: 0,
        accumulatedTotal: 0
      };
    });

    // Helper for monthly check - avoids repeated extraction of month/year
    const isCurrentMonth = (d: Date) => {
      return d.getMonth() === tMonth && d.getFullYear() === tYear;
    };

    renewals.forEach(r => {
      const amount = parseSafeNumber(r.amount || (r as any).amount);
      const cost = parseSafeNumber(r.cost || (r as any).cost);
      const dateStr = r.date || (r as any).date || (r as any).created_at;
      const sId = (r.serverId || (r as any).server_id || '').toString();

      totalGross += amount;
      totalCost += cost;

      if (stats[sId]) {
        stats[sId].accumulatedTotal += amount;
      }

      if (dateStr) {
        const d = parseRobustLocalTime(dateStr);
        if (!isNaN(d.getTime()) && isCurrentMonth(d)) {
          const planId = r.planId || (r as any).plan_id;
          const plan = plansMap.get(planId);
          const months = plan ? plan.months : 1;
          const dividedAmount = amount / months;
          const dividedCost = cost / months;

          mGross += dividedAmount;
          mCost += dividedCost;

          if (stats[sId]) {
            stats[sId].monthlyGross += dividedAmount;
            stats[sId].monthlyCost += dividedCost;
          }
        }
      }
    });

    const totalManualAdditions = manualAdditions.reduce((acc, a) => acc + parseSafeNumber(a.amount || (a as any).amount), 0);
    const mAdditions = manualAdditions.reduce((acc, a) => {
      const dateStr = a.date || (a as any).date || (a as any).created_at;
      if (!dateStr) return acc;
      const d = parseRobustLocalTime(dateStr);
      if (!isNaN(d.getTime()) && isCurrentMonth(d)) {
        return acc + parseSafeNumber(a.amount || (a as any).amount);
      }
      return acc;
    }, 0);

    const expiring: Customer[] = [];
    const todayTime = today.getTime();

    customers.forEach(c => {
      const dueDateStr = c.dueDate || (c as any).due_date;
      if (!dueDateStr) return;

      const dueDate = parseRobustLocalTime(dueDateStr.toString());
      if (isNaN(dueDate.getTime())) return;

      const sId = (c.serverId || (c as any).server_id || '').toString();

      // Active check (Excluding tests from financial/server counts)
      const plan = plansMap.get(c.planId || (c as any).plan_id);
      const isTest = plan?.name?.toLowerCase().includes('teste');
      const isActive = isCustomerActive(dueDateStr, isTest);

      if (isActive && !isTest && stats[sId]) {
        stats[sId].active += 1;
      }

      // Days until due (for notification banner)
      const dueTime = new Date(dueDate).setHours(0, 0, 0, 0);
      const daysUntilDue = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24)) + 1;
      
      // Only show in expiring list if:
      // 1. It's a regular customer expiring in 0-2 days
      // 2. It's a test that has ALREADY expired (isActive is false)
      const shouldShowInExpiring = (daysUntilDue >= 0 && daysUntilDue <= 2 && !isTest) || (isTest && !isActive);
      
      if (shouldShowInExpiring) {
        expiring.push(c);
      }
    });

    expiring.sort((a, b) => {
      const dateA = new Date((a.dueDate || (a as any).due_date || '')).getTime() || 0;
      const dateB = new Date((b.dueDate || (b as any).due_date || '')).getTime() || 0;
      return dateA - dateB;
    });

    const totalPlansValue = customers.reduce((acc, c) => {
      const plan = plansMap.get(c.planId || (c as any).plan_id);
      const p = plansMap.get(c.planId || (c as any).plan_id);
      const isT = p?.name?.toLowerCase().includes('teste');
      return isCustomerActive(c.dueDate, isT) ? acc + parseSafeNumber(c.amountPaid) : acc;
    }, 0);

    return {
      grossValue: totalGross,
      totalPaidToServers: totalCost,
      monthlyGross: mGross + mAdditions,
      monthlyCost: mCost,
      serverStats: Object.values(stats),
      expiringCustomers: expiring,
      totalPlansValue
    };
  }, [customers, servers, renewals, manualAdditions, plans, today]);


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

        // Open Renewal Confirmation Message
        const message = formatWhatsappMessage(renewalMessage, {
          name: selectedCustomer.name,
          amount: parseFloat(renewData.amountPaid.replace(',', '.')),
          dueDate: newDueDate
        });
        window.open(`https://wa.me/${selectedCustomer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
      }
      setSelectedCustomer(null);
    }
  };

  const pendingNotifications = useMemo(() => {
    return expiringCustomers.filter(c => {
      const dueDateStr = c.dueDate || (c as any).due_date;
      if (!dueDateStr) return false;
      const dueDate = parseRobustLocalTime(dueDateStr);
      dueDate.setHours(0, 0, 0, 0);
      const days = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
      if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
      const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 7;
      
      return (days === 1 || days === 2) && !isRecentlyNotified;
    });
  }, [expiringCustomers, today]);

  return (
    <div className="space-y-6 pb-24">
      {/* Pending Notifications Banner */}
      {userRole !== 'observer' && pendingNotifications.length > 0 && (
        <div className="bg-[#c8a646] p-4 rounded-2xl flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center space-x-3">
            <div className="bg-[#0f0f0f] p-2 rounded-full">
              <MessageCircle size={20} className="text-[#c8a646]" />
            </div>
            <div>
              <div className="text-[#0f0f0f] font-bold text-sm">Notificações Pendentes</div>
              <div className="text-[#0f0f0f]/70 text-xs font-medium">{pendingNotifications.length} avisos pendentes para hoje</div>
            </div>
          </div>
          <button
            onClick={() => {
              const first = pendingNotifications[0];
              const message = formatWhatsappMessage(whatsappMessage, {
                name: first.name,
                amount: first.amountPaid,
                dueDate: first.dueDate
              });

              updateCustomer(first.id, { lastNotifiedDate: format(today, 'yyyy-MM-dd') });
              window.open(`https://wa.me/${first.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
            }}
            className="bg-[#0f0f0f] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black/80 transition-colors"
          >
            Notificar Agora
          </button>
        </div>
      )}

      {/* Unified Finance Section */}
      <div className="mb-8 p-[1px] bg-gradient-to-br from-[#c8a646]/40 via-white/5 to-red-500/10 rounded-[32px] shadow-2xl">
        <div className="bg-[#121212] rounded-[31px] p-8 relative overflow-hidden">
          {/* Subtle Background Glows */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#c8a646]/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-red-500/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="flex flex-col space-y-8 relative z-10">
            {/* Header Area */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-1">Resumo Financeiro</h2>
                <div className="h-0.5 w-8 bg-[#c8a646] rounded-full" />
              </div>
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-md">
                <DollarSign className="text-[#c8a646]" size={20} />
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-8">
              {/* Bruto Main Metric */}
              <div className="group">
                <div className="flex items-center space-x-2 text-[#c8a646] font-bold text-[10px] uppercase tracking-widest mb-2 opacity-80">
                  <TrendingUp size={12} />
                  <span>Bruto ({format(today, 'MMMM', { locale: ptBR })})</span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-5xl font-black text-white tracking-tighter transition-transform group-hover:scale-[1.02] duration-300 block">
                    {formatCurrency(monthlyGross)}
                  </span>
                </div>
              </div>

              {/* Separator */}
              <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              {/* Custo Metric */}
              <div className="group">
                <div className="flex items-center space-x-2 text-red-500/70 font-bold text-[10px] uppercase tracking-widest mb-2">
                  <TrendingDown size={12} />
                  <span>Custo Mensal</span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-red-500/90 tracking-tighter group-hover:text-red-500 transition-colors">
                    {formatCurrency(monthlyCost)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Server List */}
      {serverStats.length > 0 && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden shadow-lg">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">Resumo por Servidor</h3>
          </div>
          <div className="divide-y divide-white/5">
            {serverStats.map((stat, idx) => (
              <div key={idx} className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="font-bold text-white">{stat.name}</div>
                  <div className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded-md">{stat.active} ativos</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Custo Mensal</div>
                    <div className="text-sm font-bold text-red-400">{formatCurrency(stat.monthlyCost)}</div>
                  </div>
                  <div className="bg-[#0f0f0f] p-3 rounded-xl border border-[#c8a646]/20">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Bruto Mensal</div>
                    <div className="text-sm font-bold text-white">{formatCurrency(stat.monthlyGross)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiring Customers */}
      {expiringCustomers.length > 0 && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden shadow-lg">
          <div className="p-4 border-b border-white/5 flex items-center space-x-2">
            <AlertCircle size={18} className="text-yellow-500" />
            <h3 className="text-sm font-medium uppercase tracking-wider text-white">Clientes vencendo</h3>
          </div>
          <div className="divide-y divide-white/5">
            {expiringCustomers.map(c => {
              const server = servers.find(s => s.id === (c.serverId || (c as any).server_id));
              const dueDate = parseRobustLocalTime(c.dueDate || (c as any).due_date);
              dueDate.setHours(0, 0, 0, 0);
              const days = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;

              const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
              if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
              const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 7;

              const lastOverdueNotified = c.lastOverdueNotifiedDate;
              const lastOverdueDate = lastOverdueNotified ? parseRobustLocalTime(lastOverdueNotified) : null;
              if (lastOverdueDate) lastOverdueDate.setHours(0, 0, 0, 0);
              const isOnCooldown = lastOverdueDate && !isNaN(lastOverdueDate.getTime()) && Math.round((today.getTime() - lastOverdueDate.getTime()) / (1000 * 60 * 60 * 24)) < 10;

              const plan = plans.find(p => p.id === c.planId);
              const isTest = plan?.name?.toLowerCase().includes('teste');
              const isExpiredTest = isTest && !isCustomerActive(c.dueDate, isTest);

              return (
                <div key={c.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white flex items-center space-x-2">
                      <span>{c.name}</span>
                      {isTest && <span className="bg-red-500/20 text-red-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">Teste</span>}
                    </div>
                    <div className="text-xs text-gray-400">
                      {server?.name} • {isTest ? (isExpiredTest ? 'Teste Expirado' : 'Teste em andamento') : (days === 1 ? 'Vence hoje' : days <= 0 ? `Vencido há ${Math.abs(days - 1)} dias` : `Vence em ${days} dias`)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {userRole !== 'observer' && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            const isOverdue = days <= 0 || isExpiredTest;
                            const currentCooldown = isOverdue ? isOnCooldown : isRecentlyNotified;

                            if (currentCooldown) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }

                            let message = '';
                            if (isTest) {
                              message = formatWhatsappMessage(testMessage || '', c);
                              // For tests, we use the regular notification date to avoid spam
                              updateCustomer(c.id, { lastNotifiedDate: format(today, 'yyyy-MM-dd') });
                            } else if (isOverdue) {
                              message = formatWhatsappMessage(overdueMessage, {
                                name: c.name,
                                amount: c.amountPaid,
                                dueDate: c.dueDate
                              });
                              updateCustomer(c.id, { lastOverdueNotifiedDate: format(today, 'yyyy-MM-dd') });
                            } else {
                              message = formatWhatsappMessage(whatsappMessage, {
                                name: c.name,
                                amount: c.amountPaid,
                                dueDate: c.dueDate
                              });
                              updateCustomer(c.id, { lastNotifiedDate: format(today, 'yyyy-MM-dd') });
                            }

                            window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                          }}
                          disabled={Boolean(days <= 0 ? isOnCooldown : isRecentlyNotified)}
                          className={`p-2 rounded-full transition-all duration-300 ${(days <= 0 ? isOnCooldown : isRecentlyNotified)
                              ? 'bg-gray-500/10 text-gray-600 cursor-not-allowed opacity-40 pointer-events-none'
                              : days <= 0
                                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                : 'bg-green-600/20 text-green-500 hover:bg-green-600/30'
                            }`}
                          style={{ pointerEvents: (days <= 0 ? isOnCooldown : isRecentlyNotified) ? 'none' : 'auto' }}
                          title={days <= 0 ? (isOnCooldown ? `Próximo envio em ${10 - Math.round((today.getTime() - lastOverdueDate!.getTime()) / (1000 * 60 * 60 * 24))} dias` : "WhatsApp") : (isRecentlyNotified ? "Já notificado" : "WhatsApp")}
                        >
                          <MessageCircle size={20} />
                        </button>
                        <button
                          onClick={() => openRenewModal(c)}
                          className="p-2 bg-white/5 text-gray-400 rounded-full hover:text-[#c8a646] transition-colors"
                          title="Renovar"
                        >
                          <RefreshCw size={20} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
