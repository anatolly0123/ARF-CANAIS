import { useState, useMemo } from 'react';
import { Customer, Server, Plan } from '../types';
import { Modal } from './Modal';
import { MessageSquare, ChevronRight, SkipForward, CheckCircle2, Play, AlertCircle } from 'lucide-react';
import { formatWhatsappMessage, formatCurrency } from '../utils';

interface BulkSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  servers: Server[];
  plans: Plan[];
  whatsappMessage: string;
  onSend: (customer: Customer) => void;
}

export function BulkSendModal({
  isOpen,
  onClose,
  customers,
  servers,
  plans,
  whatsappMessage,
  onSend
}: BulkSendModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);

  const plansMap = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);
  const serversMap = useMemo(() => new Map(servers.map(s => [s.id, s])), [servers]);

  const currentCustomer = customers[currentIndex];

  const currentMessagePreview = useMemo(() => {
    if (!currentCustomer) return '';
    const plan = plansMap.get(currentCustomer.planId || (currentCustomer as any).plan_id);
    const isTest = plan?.name?.toLowerCase().includes('teste') || false;
    return formatWhatsappMessage(whatsappMessage, {
      name: currentCustomer.name,
      amount: currentCustomer.amountPaid,
      dueDate: currentCustomer.dueDate
    }, isTest);
  }, [currentCustomer, whatsappMessage, plansMap]);

  const handleSend = () => {
    if (!currentCustomer) return;

    // Trigger opening WhatsApp Web
    onSend(currentCustomer);

    // Advance to next or complete
    if (currentIndex < customers.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleSkip = () => {
    if (currentIndex < customers.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setCompleted(false);
  };

  if (customers.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Envio em Massa">
        <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
          <div className="bg-red-500/10 p-3 rounded-full border border-red-500/20">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          <div>
            <h4 className="font-bold text-white text-lg">Nenhum cliente disponível</h4>
            <p className="text-gray-400 text-xs mt-1">
              Todos os clientes da lista atual já foram notificados recentemente ou não há registros correspondentes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
          >
            Fechar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assistente de Envio" maxWidth="max-w-md">
      {completed ? (
        <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
          <div className="bg-green-500/10 p-4 rounded-full border border-green-500/20 mb-2">
            <CheckCircle2 className="text-green-400" size={40} />
          </div>
          <div>
            <h4 className="font-bold text-white text-lg">Envio Concluído!</h4>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Você processou todos os {customers.length} clientes da fila de envio. As datas de notificação foram atualizadas.
            </p>
          </div>
          <div className="flex space-x-3 w-full pt-4">
            <button
              onClick={handleRestart}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors text-sm"
            >
              Reiniciar
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-[#c8a646] text-[#0f0f0f] font-bold hover:bg-[#e8c666] transition-all shadow-lg shadow-[#c8a646]/20 text-sm"
            >
              Concluir
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Progress Indicator */}
          <div>
            <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
              <span className="font-bold uppercase tracking-wider text-[#c8a646]">Fila de Mensagens</span>
              <span>
                {currentIndex + 1} de {customers.length}
              </span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#c8a646] to-[#e8c666] transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / customers.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Current Customer Card */}
          <div className="bg-[#131313] p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-white text-base leading-tight">{currentCustomer.name}</div>
                <div className="text-[10px] text-gray-500 uppercase font-black tracking-wider mt-1">
                  {plansMap.get(currentCustomer.planId || (currentCustomer as any).plan_id)?.name || 'Plano'} •{' '}
                  {serversMap.get(currentCustomer.serverId || (currentCustomer as any).server_id)?.name || 'Servidor'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] text-gray-500 uppercase font-black tracking-widest">Valor</div>
                <div className="text-sm font-black text-white">{formatCurrency(currentCustomer.amountPaid)}</div>
              </div>
            </div>
          </div>

          {/* Message Preview */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-xs text-gray-400">
              <MessageSquare size={14} className="text-[#c8a646]" />
              <span className="font-bold uppercase tracking-wider">Prévia da Mensagem</span>
            </div>
            <div className="bg-[#0f0f0f] p-4 rounded-xl border border-white/5 text-xs text-white max-h-36 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
              {currentMessagePreview}
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider shrink-0"
            >
              Cancelar
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 py-3 rounded-xl bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center space-x-2 text-xs font-bold uppercase tracking-wider border border-white/5"
            >
              <SkipForward size={14} />
              <span>Pular</span>
            </button>
            <button
              onClick={handleSend}
              className="flex-1 py-3 rounded-xl bg-green-500 text-black hover:bg-green-400 font-extrabold transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider shadow-lg shadow-green-500/10"
            >
              <Play size={14} fill="black" />
              <span>Enviar</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
