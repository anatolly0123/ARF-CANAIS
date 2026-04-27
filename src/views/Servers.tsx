import React, { useState } from 'react';
import { Server, Customer, Plan, UserRole } from '../types';
import { Plus, Edit2, Trash2, Server as ServerIcon } from 'lucide-react';
import { parseISO, isAfter, differenceInDays } from 'date-fns';
import { formatCurrency } from '../utils';
import { Modal } from '../components/Modal';

interface ServersProps {
  servers: Server[];
  customers: Customer[];
  plans: Plan[];
  addServer: (s: Omit<Server, 'id'>) => void;
  updateServer: (id: string, s: Partial<Server>) => void;
  deleteServer: (id: string) => void;
  resetServerCounters: (id: string) => void;
  userRole: UserRole;
}

export function Servers({ servers, customers, plans, addServer, updateServer, deleteServer, resetServerCounters, userRole }: ServersProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [formData, setFormData] = useState({ name: '', costPerActive: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cost = parseFloat(formData.costPerActive.replace(',', '.'));
    if (isNaN(cost)) return;

    if (editingServer) {
      updateServer(editingServer.id, { name: formData.name, costPerActive: cost });
    } else {
      addServer({ name: formData.name, costPerActive: cost });
    }
    closeModal();
  };

  const openModal = (server?: Server) => {
    if (server) {
      setEditingServer(server);
      setFormData({ name: server.name, costPerActive: server.costPerActive.toString() });
    } else {
      setEditingServer(null);
      setFormData({ name: '', costPerActive: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingServer(null);
    setFormData({ name: '', costPerActive: '' });
  };

  const today = new Date();

  return (
    <div className="pb-24 space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white uppercase tracking-widest">Servidores</h2>
        {userRole !== 'observer' && (
          <button
            onClick={() => openModal()}
            className="bg-[#c8a646] text-[#0f0f0f] p-2 rounded-full hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
          >
            <Plus size={24} />
          </button>
        )}
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ServerIcon size={48} className="mx-auto mb-4 opacity-20" />
          <p>Nenhum servidor cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map(server => {
            const activeCustomers = customers.filter(c => {
              if (c.serverId !== server.id) return false;
              const dueDate = parseISO(c.dueDate);
              return isAfter(dueDate, today) || differenceInDays(dueDate, today) === 0;
            });
            const totalActive = activeCustomers.length;
            const totalGenerated = activeCustomers.reduce((acc, c) => {
              const plan = plans.find(p => p.id === c.planId);
              const months = plan ? plan.months : 1;
              return acc + (c.amountPaid / months);
            }, 0);

            // Calculate total cost (Monthly)
            const totalPaid = activeCustomers.reduce((sum, c) => {
              if (c.hasResetCounters) return sum; // If reset, this customer doesn't cost anything for the current cycle
              return sum + server.costPerActive;
            }, 0);
            const profit = totalGenerated - totalPaid;

            return (
              <div key={server.id} className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-5 shadow-lg relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{server.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">Custo por ativo: <span className="text-white">{formatCurrency(server.costPerActive)}</span></p>
                  </div>
                  <div className="flex space-x-2">
                    {userRole !== 'observer' && (
                      <>
                        <button onClick={() => {
                          if (window.confirm(`Tem certeza que deseja resetar os contadores de Gerado, Pago e Lucro para o servidor ${server.name}? Isso zerará os valores do ciclo atual para todos os clientes ativos neste servidor.`)) {
                            resetServerCounters(server.id);
                          }
                        }}
                          className="p-2 text-yellow-400 hover:text-yellow-300 transition-colors bg-yellow-500/10 rounded-full"
                          title="Resetar Contadores Mensais"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                        </button>
                        <button onClick={() => openModal(server)} className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => {
                          if (window.confirm(`Tem certeza que deseja excluir o servidor "${server.name}"? Esta ação não pode ser desfeita.`)) {
                            deleteServer(server.id);
                          }
                        }} className="p-2 text-red-400 hover:text-red-300 transition-colors bg-red-500/10 rounded-full">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Ativos</div>
                    <div className="text-lg font-semibold text-white">{totalActive}</div>
                  </div>
                  <div className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Gerado</div>
                    <div className="text-lg font-semibold text-green-400">{formatCurrency(totalGenerated)}</div>
                  </div>
                  <div className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Pago</div>
                    <div className="text-lg font-semibold text-red-400">{formatCurrency(totalPaid)}</div>
                  </div>
                  <div className="bg-[#0f0f0f] p-3 rounded-xl border border-[#c8a646]/20">
                    <div className="text-[10px] uppercase tracking-wider text-[#c8a646] mb-1">Lucro</div>
                    <div className="text-lg font-bold text-white">{formatCurrency(profit)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingServer ? 'Editar Servidor' : 'Novo Servidor'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Nome do Servidor</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] transition-colors"
              placeholder="Ex: Servidor X"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Custo por Ativo (R$)</label>
            <input
              type="text"
              required
              value={formData.costPerActive}
              onChange={e => setFormData({ ...formData, costPerActive: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] transition-colors"
              placeholder="Ex: 5.50"
            />
          </div>
          <div className="flex space-x-3 mt-8">
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
