import React, { useState } from 'react';
import { Plan, ManualAddition, UserRole } from '../types';
import { Settings, Edit2, MessageSquare, PlusCircle, MinusCircle, DollarSign } from 'lucide-react';
import { formatCurrency, parseSafeNumber } from '../utils';
import { Modal } from '../components/Modal';

interface PlansProps {
  plans: Plan[];
  updatePlan: (id: string, price: number) => void;
  whatsappMessage: string;
  setWhatsappMessage: (msg: string) => void;
  renewalMessage: string;
  setRenewalMessage: (msg: string) => void;
  overdueMessage: string;
  setOverdueMessage: (msg: string) => void;
  testMessage: string;
  setTestMessage: (msg: string) => void;
  addManualAddition: (addition: Omit<ManualAddition, 'id'>) => void;
  manualAdditions: ManualAddition[];
  userRole: UserRole;
}

export function Plans({ 
  plans, updatePlan, whatsappMessage, setWhatsappMessage, 
  renewalMessage, setRenewalMessage, overdueMessage, setOverdueMessage, 
  testMessage, setTestMessage,
  addManualAddition, manualAdditions, userRole 
}: PlansProps) {
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [priceInput, setPriceInput] = useState('');

  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [editingMessageType, setEditingMessageType] = useState<'whatsapp' | 'renewal' | 'overdue' | 'test'>('whatsapp');
  const [messageInput, setMessageInput] = useState('');

  const [isAddingMoney, setIsAddingMoney] = useState(false);
  const [moneyAction, setMoneyAction] = useState<'add' | 'remove'>('add');
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyDescription, setMoneyDescription] = useState('');

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setPriceInput(plan.defaultPrice.toString());
  };

  const handleSavePlan = () => {
    if (editingPlan) {
      const price = parseSafeNumber(priceInput);
      if (!isNaN(price)) {
        updatePlan(editingPlan.id, price);
      }
      setEditingPlan(null);
    }
  };

  const handleEditMessage = (type: 'whatsapp' | 'renewal' | 'overdue') => {
    setEditingMessageType(type);
    if (type === 'renewal') setMessageInput(renewalMessage);
    else if (type === 'overdue') setMessageInput(overdueMessage);
    else if (type === 'test') setMessageInput(testMessage);
    else setMessageInput(whatsappMessage);
    setIsEditingMessage(true);
  };

  const handleSaveMessage = () => {
    if (editingMessageType === 'renewal') {
      setRenewalMessage(messageInput);
    } else if (editingMessageType === 'overdue') {
      setOverdueMessage(messageInput);
    } else if (editingMessageType === 'test') {
      setTestMessage(messageInput);
    } else {
      setWhatsappMessage(messageInput);
    }
    setIsEditingMessage(false);
  };

  const handleOpenMoneyModal = (action: 'add' | 'remove') => {
    setMoneyAction(action);
    setIsAddingMoney(true);
  };

  const handleAddMoney = () => {
    let amount = parseSafeNumber(moneyAmount);
    if (amount > 0) {
      if (moneyAction === 'remove') {
        amount = -amount;
      }
      addManualAddition({
        amount,
        description: moneyDescription || (moneyAction === 'add' ? 'Adição manual' : 'Remoção manual'),
        date: new Date().toISOString()
      });
      setIsAddingMoney(false);
      setMoneyAmount('');
      setMoneyDescription('');
    }
  };

  return (
    <div className="pb-24 space-y-8">
      {/* Plans Section */}
      <section>
        <div className="flex items-center space-x-3 mb-6">
          <Settings size={28} className="text-[#c8a646]" />
          <h2 className="text-xl font-bold text-white uppercase tracking-widest">Planos Padrão</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {plans.map(plan => (
            <div key={plan.id} className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5 shadow-lg flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-400">{plan.months} {plan.months === 1 ? 'mês' : 'meses'}</p>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-xl font-bold text-[#c8a646]">
                  {formatCurrency(plan.defaultPrice)}
                </div>
                {userRole !== 'observer' && (
                  <button
                    onClick={() => handleEditPlan(plan)}
                    className="p-2 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add Money Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <DollarSign size={28} className="text-[#c8a646]" />
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">Saldo Manual</h2>
          </div>
          {userRole !== 'observer' && (
            <div className="flex space-x-2">
              <button
                onClick={() => handleOpenMoneyModal('remove')}
                className="bg-red-500/20 text-red-400 p-2 rounded-full hover:bg-red-500/30 transition-colors"
              >
                <MinusCircle size={24} />
              </button>
              <button
                onClick={() => handleOpenMoneyModal('add')}
                className="bg-[#c8a646] text-[#0f0f0f] p-2 rounded-full hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
              >
                <PlusCircle size={24} />
              </button>
            </div>
          )}
        </div>

        <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-400">Gerencie entradas e saídas extras.</p>
            <div className={`text-xl font-bold ${manualAdditions.reduce((acc, curr) => acc + parseSafeNumber(curr.amount), 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(manualAdditions.reduce((acc, curr) => acc + parseSafeNumber(curr.amount), 0))}
            </div>
          </div>

          {manualAdditions.length > 0 && (
            <div className="space-y-2 mt-4 pt-4 border-t border-white/5">
              {manualAdditions.slice().reverse().slice(0, 5).map(add => (
                <div key={add.id} className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{add.description}</span>
                  <span className={`font-medium ${add.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {add.amount > 0 ? '+' : ''}{formatCurrency(add.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* WhatsApp Message Section (Expiring) */}
      <section>
        <div className="flex items-center space-x-3 mb-6">
          <MessageSquare size={28} className="text-[#c8a646]" />
          <h2 className="text-xl font-bold text-white uppercase tracking-widest text-sm">Aviso de Vencimento</h2>
        </div>

        <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs text-gray-400">Mensagem padrão enviada para clientes próximos do vencimento.</p>
            {userRole !== 'observer' && (
              <button
                onClick={() => handleEditMessage('whatsapp')}
                className="p-2 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0 ml-4"
              >
                <Edit2 size={18} />
              </button>
            )}
          </div>
          <div className="bg-[#0f0f0f] p-4 rounded-xl border border-white/5">
            <p className="text-white text-xs whitespace-pre-wrap">{whatsappMessage}</p>
          </div>
        </div>
      </section>

      {/* WhatsApp Message Section (Renewal) */}
      <section>
        <div className="flex items-center space-x-3 mb-6">
          <MessageSquare size={28} className="text-green-500" />
          <h2 className="text-xl font-bold text-white uppercase tracking-widest text-sm">Confirmação de Renovação</h2>
        </div>

        <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs text-gray-400">Mensagem enviada logo após confirmar uma renovação.</p>
            {userRole !== 'observer' && (
              <button
                onClick={() => handleEditMessage('renewal')}
                className="p-2 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0 ml-4"
              >
                <Edit2 size={18} />
              </button>
            )}
          </div>
          <div className="bg-[#0f0f0f] p-4 rounded-xl border border-white/5">
            <p className="text-white text-xs whitespace-pre-wrap">{renewalMessage}</p>
          </div>
        </div>
      </section>

      {/* WhatsApp Message Section (Overdue) */}
      <section>
        <div className="flex items-center space-x-3 mb-6">
          <MessageSquare size={28} className="text-red-500" />
          <h2 className="text-xl font-bold text-white uppercase tracking-widest text-sm">Aviso Após o Vencimento</h2>
        </div>

        <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs text-gray-400">Mensagem que é enviada para clientes que já estão vencidos.</p>
            {userRole !== 'observer' && (
              <button
                onClick={() => handleEditMessage('overdue')}
                className="p-2 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0 ml-4"
              >
                <Edit2 size={18} />
              </button>
            )}
          </div>
          <div className="bg-[#0f0f0f] p-4 rounded-xl border border-white/5">
            <p className="text-white text-xs whitespace-pre-wrap">{overdueMessage}</p>
          </div>
        </div>
      </section>

      {/* WhatsApp Message Section (Test) */}
      <section>
        <div className="flex items-center space-x-3 mb-6">
          <MessageSquare size={28} className="text-orange-500" />
          <h2 className="text-xl font-bold text-white uppercase tracking-widest text-sm">Aviso de Teste Expirado</h2>
        </div>

        <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs text-gray-400">Mensagem enviada após o vencimento do teste de 4 horas.</p>
            {userRole !== 'observer' && (
              <button
                onClick={() => handleEditMessage('test')}
                className="p-2 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0 ml-4"
              >
                <Edit2 size={18} />
              </button>
            )}
          </div>
          <div className="bg-[#0f0f0f] p-4 rounded-xl border border-white/5">
            <p className="text-white text-xs whitespace-pre-wrap">{testMessage}</p>
          </div>
        </div>
      </section>

      {/* Edit Plan Modal */}
      <Modal
        isOpen={!!editingPlan}
        onClose={() => setEditingPlan(null)}
        title="Editar Plano"
      >
        <p className="text-gray-400 text-sm mb-6">Defina o valor padrão para o plano {editingPlan?.name}.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Valor Padrão (R$)</label>
            <input
              type="text"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] transition-colors text-lg"
              autoFocus
            />
          </div>

          <div className="flex space-x-3 mt-8">
            <button
              onClick={() => setEditingPlan(null)}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSavePlan}
              className="flex-1 py-3 rounded-xl bg-[#c8a646] text-[#0f0f0f] font-bold hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
            >
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Message Modal */}
      <Modal
        isOpen={isEditingMessage}
        onClose={() => setIsEditingMessage(false)}
        title={editingMessageType === 'renewal' ? "Mensagem de Renovação" : editingMessageType === 'overdue' ? "Aviso Após o Vencimento" : editingMessageType === 'test' ? "Aviso de Teste Expirado" : "Aviso de Vencimento"}
      >
        <p className="text-gray-400 text-xs mb-4">
          Variáveis disponíveis:<br />
          <span className="text-[#c8a646]">{"{nome}"}</span> - Nome do cliente<br />
          <span className="text-[#c8a646]">{"{valor}"}</span> - Valor do plano<br />
          <span className="text-[#c8a646]">{"{dias}"}</span> - Dias para vencer<br />
          <span className="text-[#c8a646]">{"{vencimento}"}</span> - Data de vencimento
        </p>

        <div className="space-y-4">
          <div>
            <textarea
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] transition-colors text-sm h-32 resize-none"
              autoFocus
            />
          </div>

          <div className="flex space-x-3 mt-8">
            <button
              onClick={() => setIsEditingMessage(false)}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveMessage}
              className="flex-1 py-3 rounded-xl bg-[#c8a646] text-[#0f0f0f] font-bold hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
            >
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Money Modal */}
      <Modal
        isOpen={isAddingMoney}
        onClose={() => setIsAddingMoney(false)}
        title={moneyAction === 'add' ? 'Adicionar Dinheiro' : 'Remover Dinheiro'}
      >
        <p className="text-gray-400 text-sm mb-6">
          Insira o valor que deseja {moneyAction === 'add' ? 'adicionar ao' : 'remover do'} saldo.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Valor (R$)</label>
            <input
              type="text"
              value={moneyAmount}
              onChange={e => setMoneyAmount(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] transition-colors text-lg"
              autoFocus
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Descrição (Opcional)</label>
            <input
              type="text"
              value={moneyDescription}
              onChange={e => setMoneyDescription(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] transition-colors text-sm"
              placeholder={moneyAction === 'add' ? 'Ex: Venda extra' : 'Ex: Pagamento de despesa'}
            />
          </div>

          <div className="flex space-x-3 mt-8">
            <button
              onClick={() => setIsAddingMoney(false)}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddMoney}
              className={`flex-1 py-3 rounded-xl font-bold transition-colors ${moneyAction === 'add'
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                }`}
            >
              {moneyAction === 'add' ? 'Adicionar' : 'Remover'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

