import { useState, useMemo } from 'react';
import { Customer, Server, Plan, Renewal, ManualAddition } from '../types';
import { format, parseISO, isAfter, differenceInDays, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertCircle, MessageCircle, ChevronRight, Server as ServerIcon, Calendar, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { formatCurrency, isCustomerActive, parseSafeNumber, parseRobustLocalTime, formatWhatsappMessage } from '../utils';
import { RenewModal } from '../components/RenewModal';

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
}

export function Dashboard({ customers, servers, plans, whatsappMessage, updateCustomer, renewals, addRenewal, manualAdditions, renewalMessage }: DashboardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Renew State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Calculate stats
  const { grossValue, totalPaidToServers, netValue, serverStats, expiringCustomers, monthlyGross, monthlyNet, monthlyCost } = useMemo(() => {
    // Helper to check if a date string is in the current month
    const isCurrentMonth = (dateStr: any) => {
      try {
        if (!dateStr) return false;
        const d = parseRobustLocalTime(dateStr);

        if (isNaN(d.getTime())) return false;

        const dMonth = d.getMonth();
        const dYear = d.getFullYear();
        const tMonth = today.getMonth();
        const tYear = today.getFullYear();

        return dMonth === tMonth && dYear === tYear;
      } catch {
        return false;
      }
    };

    // 1. Totals (All-time)
    const totalGross = renewals.reduce((acc, r) => acc + parseSafeNumber(r.amount || (r as any).amount), 0);
    const totalCost = renewals.reduce((acc, r) => acc + parseSafeNumber(r.cost || (r as any).cost), 0);
    const totalManualAdditions = manualAdditions.reduce((acc, a) => acc + parseSafeNumber(a.amount || (a as any).amount), 0);

    // 2. Monthly Stats (Current Month)
    const currentMonthRenewals = renewals.filter(r => isCurrentMonth(r.date || (r as any).date || (r as any).created_at));
    const mGross = currentMonthRenewals.reduce((acc, r) => acc + parseSafeNumber(r.amount || (r as any).amount), 0);
    const mCost = currentMonthRenewals.reduce((acc, r) => acc + parseSafeNumber(r.cost || (r as any).cost), 0);

    const currentMonthAdditions = manualAdditions.filter(a => isCurrentMonth(a.date || (a as any).date || (a as any).created_at));
    const mAdditions = currentMonthAdditions.reduce((acc, a) => acc + parseSafeNumber(a.amount || (a as any).amount), 0);

    const stats: Record<string, { name: string; active: number; monthlyGross: number; monthlyCost: number; accumulatedTotal: number }> = {};
    const expiring: Customer[] = [];

    servers.forEach(s => {
      const sId = (s.id || '').toString();
      if (!sId) return;

      const serverRenewals = renewals.filter(r => {
        const rSId = (r.serverId || (r as any).server_id || '').toString();
        return rSId === sId;
      });
      const accumulatedTotal = serverRenewals.reduce((acc, r) => acc + parseSafeNumber(r.amount || (r as any).amount), 0);

      const serverMonthRenewals = serverRenewals.filter(r => isCurrentMonth(r.date || (r as any).date || (r as any).created_at));
      const serverMonthlyGross = serverMonthRenewals.reduce((acc, r) => acc + parseSafeNumber(r.amount || (r as any).amount), 0);
      const serverMonthlyCost = serverMonthRenewals.reduce((acc, r) => acc + parseSafeNumber(r.cost || (r as any).cost), 0);

      stats[sId] = {
        name: s.name,
        active: 0,
        monthlyGross: serverMonthlyGross,
        monthlyCost: serverMonthlyCost,
        accumulatedTotal
      };
    });

    customers.forEach(c => {
      try {
        const dueDateStr = c.dueDate || (c as any).due_date;
        if (!dueDateStr) return;

        const isActive = isCustomerActive(dueDateStr.toString());
        const sId = (c.serverId || (c as any).server_id || '').toString();

        if (isActive && stats[sId]) {
          stats[sId].active += 1;
        }

        const dParts = dueDateStr.toString().split('-');
        let checkDate = new Date();
        if (dParts.length === 3) {
          checkDate = new Date(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2]));
        } else {
          checkDate = new Date(dueDateStr.toString().replace(/-/g, '/'));
        }
        checkDate.setHours(0, 0, 0, 0);

        const daysUntilDue = differenceInDays(checkDate, today);
        if (daysUntilDue >= -6 && daysUntilDue <= 6) {
          expiring.push(c);
        }
      } catch (e) {
        console.error('Erro ao processar cliente no dashboard:', c.name, e);
      }
    });

    expiring.sort((a, b) => {
      const dateStrA = (a.dueDate || (a as any).due_date || '').toString();
      const dateStrB = (b.dueDate || (b as any).due_date || '').toString();
      if (!dateStrA && !dateStrB) return 0;
      if (!dateStrA) return 1;
      if (!dateStrB) return -1;

      const dateA = new Date(dateStrA).getTime();
      const dateB = new Date(dateStrB).getTime();
      return (dateA || 0) - (dateB || 0);
    });

    return {
      grossValue: totalGross,
      totalPaidToServers: totalCost,
      netValue: (totalGross - totalCost) + totalManualAdditions,
      monthlyGross: mGross,
      monthlyCost: mCost,
      monthlyNet: (mGross - mCost) + mAdditions,
      serverStats: Object.values(stats),
      expiringCustomers: expiring
    };
  }, [customers, servers, renewals, manualAdditions]);

  const openRenewModal = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const confirmRenew = (renewData: { serverId: string; planId: string; amountPaid: string }) => {
    if (selectedCustomer) {
      const plan = plans.find(p => p.id === renewData.planId);
      if (plan) {
        const currentDueDate = parseISO(selectedCustomer.dueDate);
        const isActive = isAfter(currentDueDate, today) || differenceInDays(currentDueDate, today) === 0;

        // If active, add to current due date. If expired, add to today.
        const baseDate = isActive ? currentDueDate : today;
        const newDueDate = format(addMonths(baseDate, plan.months), 'yyyy-MM-dd');

        updateCustomer(selectedCustomer.id, {
          serverId: renewData.serverId,
          planId: renewData.planId,
          amountPaid: parseFloat(renewData.amountPaid.replace(',', '.')),
          dueDate: newDueDate
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
      const days = differenceInDays(parseISO(c.dueDate), today);
      return days === 7 && c.lastNotifiedDate !== format(today, 'yyyy-MM-dd');
    });
  }, [expiringCustomers, today]);

  return (
    <div className="space-y-6 pb-24">
      {/* Pending Notifications Banner */}
      {pendingNotifications.length > 0 && (
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

      {/* Main Cards */}
      <div className="bg-gradient-to-br from-[#c8a646]/20 to-[#1a1a1a] p-6 rounded-3xl border border-[#c8a646]/30 shadow-xl relative overflow-hidden mb-4">
        <div className="absolute top-0 right-0 p-4 opacity-20">
          <DollarSign size={64} className="text-[#c8a646]" />
        </div>
        <div className="relative z-10">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#c8a646] mb-1">Lucro Mensal ({format(today, 'MMMM', { locale: ptBR })})</div>
          <div className="text-4xl font-black text-white">{formatCurrency(monthlyNet)}</div>
          <div className="mt-2 text-[10px] text-gray-500 font-medium">Líquido Total: {formatCurrency(netValue)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <TrendingUp size={16} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Bruto Mensal</span>
          </div>
          <div className="text-xl font-bold text-white">{formatCurrency(monthlyGross)}</div>
          <div className="mt-1 text-[8px] text-gray-600 uppercase">Acumulado: {formatCurrency(grossValue)}</div>
        </div>

        <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <TrendingDown size={16} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Custo Mensal</span>
          </div>
          <div className="text-xl font-bold text-red-400">{formatCurrency(monthlyCost)}</div>
          <div className="mt-1 text-[8px] text-gray-600 uppercase">Acumulado: {formatCurrency(totalPaidToServers)}</div>
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
              const days = differenceInDays(parseISO(c.dueDate || (c as any).due_date), today);

              const lastOverdueNotified = c.lastOverdueNotifiedDate || (c as any).last_overdue_notified_date;
              const lastOverdueDate = lastOverdueNotified ? parseISO(lastOverdueNotified) : null;
              const isOnCooldown = lastOverdueDate && !isNaN(lastOverdueDate.getTime()) && differenceInDays(today, lastOverdueDate) < 10;

              return (
                <div key={c.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white">{c.name}</div>
                    <div className="text-xs text-gray-400">
                      {server?.name} • {days === 0 ? 'Vence hoje' : days < 0 ? `Vencido há ${Math.abs(days)} dias` : `Vence em ${days} dias`}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        if (isOnCooldown) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        const message = formatWhatsappMessage(whatsappMessage, {
                          name: c.name,
                          amount: c.amountPaid,
                          dueDate: c.dueDate
                        });
                        updateCustomer(c.id, {
                          lastOverdueNotifiedDate: format(today, 'yyyy-MM-dd'),
                          last_overdue_notified_date: format(today, 'yyyy-MM-dd')
                        } as any);
                        window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                      }}
                      disabled={Boolean(isOnCooldown)}
                      className={`p-2 rounded-full transition-all duration-300 ${isOnCooldown
                        ? 'bg-gray-500/10 text-gray-600 cursor-not-allowed opacity-40 pointer-events-none'
                        : 'bg-green-600/20 text-green-500 hover:bg-green-600/30'}`}
                      style={{ pointerEvents: isOnCooldown ? 'none' : 'auto' }}
                      title={isOnCooldown ? `Próximo envio em ${10 - differenceInDays(today, lastOverdueDate!)} dias` : "WhatsApp"}
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
