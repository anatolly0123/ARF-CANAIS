import React, { useState, useMemo, useRef } from 'react';
import { Customer, Server, Plan, Renewal } from '../types';
import { format, parseISO, addMonths, isAfter, differenceInDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { formatCurrency, isCustomerActive, formatWhatsappMessage, parseSafeNumber, parseRobustLocalTime } from '../utils';
import { Modal } from '../components/Modal';
import { RenewModal } from '../components/RenewModal';
import { Plus, Search, Filter, Phone, RefreshCw, Edit2, Trash2, Calendar, CheckCircle, XCircle, MessageCircle, Users, Award, Star, UserX, ArrowRightLeft } from 'lucide-react';
import { TransferModal } from '../components/TransferModal';

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
  transferCustomer: (customerId: string, newServerId: string) => void;
}

export function Customers({
  customers, servers, plans, whatsappMessage,
  addCustomer, updateCustomer, deleteCustomer,
  bulkUpdateCustomers, addRenewal, renewalMessage,
  transferCustomer
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
  const [serverFilter, setServerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    serverId: servers.length > 0 ? servers[0].id : '',
    planId: plans.length > 0 ? plans[0].id : '',
    amountPaid: plans.length > 0 ? plans[0].defaultPrice.toString() : '0',
    dueDate: format(addMonths(new Date(), plans.length > 0 ? plans[0].months : 1), 'yyyy-MM-dd')
  });

  const today = new Date();

  const handleRenew = (renewData: { serverId: string; planId: string; amountPaid: string }) => {
    if (selectedCustomerForRenew) {
      const plan = plans.find(p => p.id === renewData.planId);
      if (plan) {
        const currentDueDate = parseISO(selectedCustomerForRenew.dueDate);
        const isActive = isAfter(currentDueDate, today) || differenceInDays(currentDueDate, today) === 0;

        // If active, add to current due date. If expired, add to today.
        const baseDate = isActive ? currentDueDate : today;
        const newDueDate = format(addMonths(baseDate, plan.months), 'yyyy-MM-dd');

        updateCustomer(selectedCustomerForRenew.id, {
          serverId: renewData.serverId,
          planId: renewData.planId,
          amountPaid: parseSafeNumber(renewData.amountPaid),
          dueDate: newDueDate
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
    const activeCustomers = customers.filter(c => isCustomerActive(c.dueDate));
    const mensalista = activeCustomers.filter(c => {
      const plan = plans.find(p => p.id === c.planId);
      return plan && plan.name !== 'Gratuito';
    }).length;
    const gratuito = activeCustomers.filter(c => {
      const plan = plans.find(p => p.id === c.planId);
      return plan && plan.name === 'Gratuito';
    }).length;

    const inativos = customers.filter(c => !isCustomerActive(c.dueDate)).length;

    return {
      total: activeCustomers.length,
      mensalista,
      gratuito,
      inativos
    };
  }, [customers, plans]);


  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery);
      const matchesServer = serverFilter === 'all' || c.serverId === serverFilter;

      const isActive = isCustomerActive(c.dueDate);
      const status = isActive ? 'Ativo' : 'Vencido';
      const matchesStatus = statusFilter === 'all' || status.toLowerCase() === statusFilter;

      return matchesSearch && matchesServer && matchesStatus;
    }).sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
  }, [customers, searchQuery, serverFilter, statusFilter, today]);

  return (
    <div className="pb-24 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white uppercase tracking-widest">Clientes</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => openModal()}
            className="bg-[#c8a646] text-[#0f0f0f] p-2 rounded-full hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#1a1a1a] border border-white/5 p-3 rounded-2xl shadow-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Users size={14} className="text-[#c8a646]" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Ativos</span>
          </div>
          <div className="text-xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-[#1a1a1a] border border-white/5 p-3 rounded-2xl shadow-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Award size={14} className="text-blue-500" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mensal</span>
          </div>
          <div className="text-xl font-bold text-white">{stats.mensalista}</div>
        </div>
        <div className="bg-[#1a1a1a] border border-white/5 p-3 rounded-2xl shadow-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Star size={14} className="text-green-500" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Gratis</span>
          </div>
          <div className="text-xl font-bold text-white">{stats.gratuito}</div>
        </div>
        <div className="bg-[#1a1a1a] border border-white/5 p-3 rounded-2xl shadow-lg">
          <div className="flex items-center space-x-2 mb-1">
            <UserX size={14} className="text-red-500" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Inativos</span>
          </div>
          <div className="text-xl font-bold text-white">{stats.inativos}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[#c8a646] transition-colors"
          />
        </div>

        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
            <select
              value={serverFilter}
              onChange={e => setServerFilter(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none appearance-none"
            >
              <option value="all">Todos Servidores</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none appearance-none"
          >
            <option value="all">Todos Status</option>
            <option value="ativo">Ativos</option>
            <option value="vencido">Vencidos</option>
          </select>
        </div>
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
            const dueDate = parseISO(customer.dueDate);
            const daysDiff = differenceInDays(dueDate, today);
            const isActive = isAfter(dueDate, today) || daysDiff === 0;

            const lastOverdueNotified = customer.lastOverdueNotifiedDate || (customer as any).last_overdue_notified_date;
            const lastOverdueDate = lastOverdueNotified ? parseISO(lastOverdueNotified) : null;
            const isOnCooldown = lastOverdueDate && !isNaN(lastOverdueDate.getTime()) && differenceInDays(today, lastOverdueDate) < 10;

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
                      {daysDiff === 7 && customer.lastNotifiedDate !== format(today, 'yyyy-MM-dd') && (
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
                      className={`p-2 rounded-full transition-colors ${daysDiff === 7 && customer.lastNotifiedDate !== format(today, 'yyyy-MM-dd') ? 'bg-green-600/30 text-green-400 animate-pulse' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                      title="WhatsApp"
                    >
                      <Phone size={16} />
                    </button>

                    {!isActive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          if (isOnCooldown) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }

                          const overdueDays = Math.abs(daysDiff);
                          const message = `Olá *${customer.name}*! 👋\n\nPassando para avisar que seu acesso IPTV está vencido há *${overdueDays}* ${overdueDays === 1 ? 'dia' : 'dias'}. ⚠️\n\nGostaria de renovar seu acesso com a gente agora? 😊`;

                          updateCustomer(customer.id, {
                            lastOverdueNotifiedDate: format(today, 'yyyy-MM-dd'),
                            last_overdue_notified_date: format(today, 'yyyy-MM-dd')
                          } as any);

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


