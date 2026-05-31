import { useState, useMemo } from 'react';
import { Customer, Server, Plan, Renewal, ManualAddition } from '../types';
import { format, parseISO, isAfter, differenceInDays, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, DollarSign, Users, MessageCircle, ChevronRight, Server as ServerIcon, Calendar, CheckCircle, Clock, RefreshCw } from 'lucide-react';
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
  const { grossValue, totalPaidToServers, monthlyGross, monthlyCost, serverStats, expiringCustomers, totalPlansValue, chartData } = useMemo(() => {
    const plansMap = new Map(plans.map(p => [p.id, p]));
    const tMonth = today.getMonth();
    const tYear = today.getFullYear();
    const todayTime = today.getTime();

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

    // Chart Data Calculation (Last 6 months)
    const monthsData: Record<string, { month: string; total: number; timestamp: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(tYear, tMonth - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthsData[key] = {
        month: format(d, 'MMM', { locale: ptBR }),
        total: 0,
        timestamp: d.getTime()
      };
    }

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
        if (!isNaN(d.getTime())) {
          // Add to chart
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          if (monthsData[key]) {
            monthsData[key].total += amount;
          }

          if (isCurrentMonth(d)) {
            const planId = r.planId || (r as any).plan_id;
            const plan = plansMap.get(planId);
            const months = plan && plan.months > 0 ? plan.months : 1;
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
      }
    });

    const totalManualAdditions = manualAdditions.reduce((acc, a) => acc + parseSafeNumber(a.amount || (a as any).amount), 0);
    const mAdditions = manualAdditions.reduce((acc, a) => {
      const dateStr = a.date || (a as any).date || (a as any).created_at;
      if (!dateStr) return acc;
      const d = parseRobustLocalTime(dateStr);
      if (!isNaN(d.getTime())) {
        // Add to chart
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthsData[key]) {
          monthsData[key].total += parseSafeNumber(a.amount || (a as any).amount);
        }

        if (isCurrentMonth(d)) {
          return acc + parseSafeNumber(a.amount || (a as any).amount);
        }
      }
      return acc;
    }, 0);

    const expiring: Customer[] = [];

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
      const isTest = plan?.name?.toLowerCase().includes('teste');
      return isCustomerActive(c.dueDate, isTest) ? acc + parseSafeNumber(c.amountPaid) : acc;
    }, 0);

    return {
      grossValue: totalGross,
      totalPaidToServers: totalCost,
      monthlyGross: mGross + mAdditions,
      monthlyCost: mCost,
      serverStats: Object.values(stats),
      expiringCustomers: expiring,
      totalPlansValue,
      chartData: Object.values(monthsData).sort((a, b) => a.timestamp - b.timestamp)
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

  const pendingNotifications = useMemo(() => {
    const plansMap = new Map(plans.map(p => [p.id, p]));
    return expiringCustomers.filter(c => {
      const plan = plansMap.get(c.planId || (c as any).plan_id);
      const isTest = plan?.name?.toLowerCase().includes('teste');

      const dueDateStr = c.dueDate || (c as any).due_date;
      if (!dueDateStr) return false;
      const dueDate = parseRobustLocalTime(dueDateStr);
      const isActive = isCustomerActive(dueDateStr, isTest);

      const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
      if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
      const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 7;

      if (isTest) {
        return !isActive && !isRecentlyNotified;
      }

      dueDate.setHours(0, 0, 0, 0);
      const days = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return (days === 1 || days === 2) && !isRecentlyNotified;
    });
  }, [expiringCustomers, today, plans]);

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
              <div className="text-[#0f0f0f]/70 text-xs font-medium">
                {(() => {
                  const testsCount = pendingNotifications.filter(c => {
                    const pid = c.planId || (c as any).plan_id;
                    const plan = plans.find(p => p.id === pid);
                    return plan?.name?.toLowerCase().includes('teste');
                  }).length;
                  const regularsCount = pendingNotifications.length - testsCount;

                  const parts = [];
                  if (regularsCount > 0) parts.push(`${regularsCount} ${regularsCount === 1 ? 'aviso' : 'avisos'}`);
                  if (testsCount > 0) parts.push(`${testsCount} ${testsCount === 1 ? 'teste expirado' : 'testes expirados'}`);

                  return parts.join(' e ') + ' para hoje';
                })()}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              const first = pendingNotifications[0];
              const pid = first.planId || (first as any).plan_id;
              const plan = plans.find(p => p.id === pid);
              const isTest = plan?.name?.toLowerCase().includes('teste');
              const isOverdue = !isCustomerActive(first.dueDate, isTest);

              let message = '';
              if (isTest) {
                message = formatWhatsappMessage(testMessage, first, isTest);
              } else if (isOverdue) {
                message = formatWhatsappMessage(overdueMessage, {
                  name: first.name,
                  amount: first.amountPaid,
                  dueDate: first.dueDate
                }, isTest);
              } else {
                message = formatWhatsappMessage(whatsappMessage, {
                  name: first.name,
                  amount: first.amountPaid,
                  dueDate: first.dueDate
                }, isTest);
              }

              updateCustomer(first.id, { lastNotifiedDate: format(today, 'yyyy-MM-dd') });
              window.open(`https://wa.me/${first.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
            }}
            className="bg-[#0f0f0f] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black/80 transition-colors"
          >
            Notificar Agora
          </button>
        </div>
      )}

      {/* Glass Wallet - Modernized Financial View */}
      <div className="glass-card-highlight rounded-[32px] p-6 sm:p-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#c8a646]/10 rounded-full blur-[60px] pointer-events-none group-hover:scale-110 transition-transform duration-700" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-red-500/5 rounded-full blur-[60px] pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-[#c8a646]/10 rounded-xl border border-[#c8a646]/20">
                <DollarSign size={16} className="text-[#c8a646]" />
              </div>
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Faturamento Bruto</h2>
            </div>
            <div className="text-[10px] font-bold text-[#c8a646] uppercase bg-[#c8a646]/5 px-3 py-1 rounded-full border border-[#c8a646]/10">
              {format(today, 'MMMM', { locale: ptBR })}
            </div>
          </div>

          <div className="flex flex-col space-y-1">
            <div className="text-5xl sm:text-6xl font-black text-white tracking-tighter flex items-baseline">
              {formatCurrency(monthlyGross)}
              <span className="ml-2 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.6)]" />
            </div>
            <div className="flex items-center space-x-2 text-red-500/60 font-bold text-[10px] uppercase tracking-widest pl-1">
              <TrendingDown size={14} />
              <span>Saída Operacional: {formatCurrency(monthlyCost)}</span>
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
            <div className="flex flex-col">
              <span className="text-[8px] text-gray-500 font-black uppercase">Ativos Totais</span>
              <span className="text-xl font-bold text-white tracking-tight">{customers.filter(c => isCustomerActive(c.dueDate, false)).length}</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[8px] text-gray-500 font-black uppercase">Servidores Online</span>
              <span className="text-xl font-bold text-white tracking-tight">{servers.length}</span>
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

      {/* Renewal Radar - Priority Actions */}
      {expiringCustomers.length > 0 && (
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-black text-[#c8a646] uppercase tracking-[0.3em]">Radar de Renovação</h2>
            <span className="bg-[#c8a646]/10 text-[#c8a646] text-[8px] font-bold px-2 py-0.5 rounded-full border border-[#c8a646]/20">Prioridade Máxima</span>
          </div>

          <div className="flex flex-col space-y-3 pb-4">
            {expiringCustomers.map(c => {
              const pid = c.planId || (c as any).plan_id;
              const plan = plans.find(p => p.id === pid);
              const isTest = plan?.name?.toLowerCase().includes('teste');
              const dueDate = parseRobustLocalTime(c.dueDate || (c as any).due_date);
              const days = Math.round((dueDate.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
              const isExpired = days <= 0;

              const lastNotified = c.lastNotifiedDate ? parseRobustLocalTime(c.lastNotifiedDate) : null;
              if (lastNotified) lastNotified.setHours(0, 0, 0, 0);
              const isRecentlyNotified = lastNotified && !isNaN(lastNotified.getTime()) && Math.round((today.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24)) < 7;

              // Do not disable if it's expired, only if it's green (not expired) and already notified recently
              const isGreenButtonDisabled = !isExpired && isRecentlyNotified;

              return (
                <div key={c.id} className="w-full">
                  <div className={`p-4 sm:p-5 rounded-[20px] border border-white/5 shadow-2xl glass-card relative overflow-hidden group transition-transform`}>
                    <div className={`absolute top-0 right-0 w-20 h-20 ${isExpired ? 'bg-red-500/10' : 'bg-[#c8a646]/5'} rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none`} />

                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
                      <div className="flex justify-between items-start sm:items-center sm:w-auto">
                        <div className="flex flex-col">
                          <div className="mb-2">
                            <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg ${isExpired ? 'bg-red-600 text-white shadow-red-600/20' : 'bg-[#c8a646]/20 text-[#c8a646]'}`}>
                              {isExpired ? 'Vencido' : `Vence em ${days}d`}
                            </span>
                          </div>
                          <div className="font-bold text-white text-base sm:text-lg leading-tight mb-1">{c.name}</div>
                          <div className="text-[10px] text-[#c8a646] font-black uppercase tracking-wider">{plan?.name || 'Plano'}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end space-x-4 w-full sm:w-auto pt-1 sm:pt-0">
                        <div className="text-left sm:text-right mr-2">
                          <div className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Valor</div>
                          <div className="text-lg font-black text-white">{formatCurrency(c.amountPaid)}</div>
                        </div>
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              const message = formatWhatsappMessage(isExpired ? overdueMessage : whatsappMessage, {
                                name: c.name,
                                amount: c.amountPaid,
                                dueDate: c.dueDate
                              }, isTest);
                              updateCustomer(c.id, { lastNotifiedDate: format(today, 'yyyy-MM-dd') });
                              window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                            }}
                            disabled={isGreenButtonDisabled}
                            className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl transition-all border ${
                              isExpired 
                                ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20' 
                                : isGreenButtonDisabled 
                                  ? 'bg-green-500/5 text-green-500/30 border-green-500/5 cursor-not-allowed'
                                  : 'bg-green-500/10 text-green-400 border-green-500/10 hover:bg-green-500/20'
                            }`}
                          >
                            <MessageCircle size={18} />
                          </button>
                          <button
                            onClick={() => {
                              // @ts-ignore
                              openRenewModal(c);
                            }}
                            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white/5 text-gray-400 rounded-xl sm:rounded-2xl hover:text-white transition-all border border-white/10"
                          >
                            <RefreshCw size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
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
