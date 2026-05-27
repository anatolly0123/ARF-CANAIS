import React, { useState } from 'react';
import { Server, Customer, Plan, UserRole } from '../types';
import { Plus, Edit2, Trash2, Server as ServerIcon, TrendingUp, TrendingDown, DollarSign, RefreshCw, Users } from 'lucide-react';
import { formatCurrency, isCustomerActive } from '../utils';
import { Modal } from '../components/Modal';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
    <div className="pb-24 space-y-6">
      <div className="flex justify-between items-center mb-6 px-1">
        <div>
          <h2 className="text-[10px] font-black text-[#c8a646] uppercase tracking-[0.3em] mb-1">Infraestrutura</h2>
          <div className="text-2xl font-black text-white tracking-widest uppercase">Servidores</div>
        </div>
        {userRole !== 'observer' && (
          <button
            onClick={() => openModal()}
            className="w-12 h-12 flex items-center justify-center bg-[#c8a646] text-[#0f0f0f] rounded-2xl hover:bg-[#e8c666] transition-all shadow-xl shadow-[#c8a646]/20 active:scale-95"
          >
            <Plus size={24} />
          </button>
        )}
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-20 glass-card rounded-[32px] border-dashed border-white/10">
          <ServerIcon size={48} className="mx-auto mb-4 text-gray-700 animate-pulse" />
          <p className="text-gray-500 font-medium">Nenhum servidor operacional registrado.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {servers.map(server => {
            const serverCustomers = customers.filter(c => c.serverId === server.id);
            const activeCustomers = serverCustomers.filter(c => {
              const pid = c.planId || (c as any).plan_id;
              const plan = plans.find(p => p.id === pid);
              const isTest = plan?.name?.toLowerCase().includes('teste');
              return isCustomerActive(c.dueDate, isTest) && !isTest;
            });

            const totalActive = activeCustomers.length;
            const totalGenerated = activeCustomers.reduce((acc, c) => {
              const pid = c.planId || (c as any).plan_id;
              const plan = plans.find(p => p.id === pid);
              const months = plan ? plan.months : 1;
              return acc + (c.amountPaid / months);
            }, 0);

            const totalPaid = activeCustomers.reduce((sum, c) => {
              // @ts-ignore
              if (c.hasResetCounters) return sum;
              return sum + server.costPerActive;
            }, 0);
            const profit = totalGenerated - totalPaid;

            const healthRatio = serverCustomers.length > 0 ? (activeCustomers.length / serverCustomers.length) : 0;
            const healthColor = healthRatio >= 0.8 ? '#22c55e' : healthRatio >= 0.4 ? '#c8a646' : '#ef4444';

            return (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card-highlight rounded-[32px] p-6 shadow-2xl relative overflow-hidden group border border-white/5"
              >
                {/* Visual Status Glow */}
                <div
                  className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-[60px] opacity-10 pointer-events-none transition-colors duration-1000"
                  style={{ backgroundColor: healthColor }}
                />

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 group-hover:border-[#c8a646]/30 transition-colors">
                          <ServerIcon size={24} className="text-[#c8a646]" />
                        </div>
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#1a1a1a] animate-pulse`}
                          style={{ backgroundColor: healthColor }}
                        />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1.5">{server.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Custo por Ativo:</span>
                          <span className="text-[10px] font-black text-white bg-white/5 px-2 py-0.5 rounded-full">{formatCurrency(server.costPerActive)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      {userRole !== 'observer' && (
                        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
                          <button onClick={() => {
                            if (window.confirm(`Resetar contadores do servidor ${server.name}?`)) {
                              resetServerCounters(server.id);
                            }
                          }}
                            className="p-2 text-gray-500 hover:text-yellow-400 transition-colors rounded-xl hover:bg-white/5"
                            title="Resetar Contadores"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button onClick={() => openModal(server)} className="p-2 text-gray-500 hover:text-white transition-colors rounded-xl hover:bg-white/5">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => {
                            if (window.confirm(`Excluir o servidor "${server.name}"?`)) {
                              deleteServer(server.id);
                            }
                          }} className="p-2 text-gray-500 hover:text-red-400 transition-colors rounded-xl hover:bg-white/5">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 rounded-[24px] border border-white/5 hover:bg-white/10 transition-colors flex flex-col justify-center">
                      <div className="flex items-center space-x-2 mb-1 opacity-50">
                        <Users size={12} className="text-gray-400" />
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest font-sans">Ativos</span>
                      </div>
                      <div className="text-lg font-black text-white tracking-tight">{totalActive}</div>
                    </div>

                    <div className="p-4 bg-white/5 rounded-[24px] border border-white/5 hover:bg-white/10 transition-colors flex flex-col justify-center">
                      <div className="flex items-center space-x-2 mb-1 opacity-50">
                        <TrendingUp size={12} className="text-green-500" />
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest font-sans">Gerado</span>
                      </div>
                      <div className="text-lg font-black text-green-400 tracking-tight leading-none whitespace-nowrap">{formatCurrency(totalGenerated)}</div>
                    </div>

                    <div className="p-4 bg-white/5 rounded-[24px] border border-white/5 hover:bg-white/10 transition-colors flex flex-col justify-center">
                      <div className="flex items-center space-x-2 mb-1 opacity-50">
                        <TrendingDown size={12} className="text-red-500" />
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest font-sans">Pago</span>
                      </div>
                      <div className="text-lg font-black text-red-400 tracking-tight leading-none whitespace-nowrap">{formatCurrency(totalPaid)}</div>
                    </div>

                    <div className="p-4 bg-[#c8a646]/10 rounded-[24px] border border-[#c8a646]/20 group-hover:bg-[#c8a646]/20 transition-all shadow-lg shadow-[#c8a646]/5 flex flex-col justify-center">
                      <div className="flex items-center space-x-2 mb-1">
                        <DollarSign size={12} className="text-[#c8a646]" />
                        <span className="text-[8px] font-black text-[#c8a646] uppercase tracking-[0.2em] font-sans">Lucro</span>
                      </div>
                      <div className="text-lg font-black text-white tracking-tight leading-none whitespace-nowrap">{formatCurrency(profit)}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
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
