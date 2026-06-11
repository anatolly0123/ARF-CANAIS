import React, { useState, useMemo, useRef } from 'react';
import { Customer, Server, Plan, UserRole } from '../types';
import { Megaphone, MessageSquare, Play, SkipForward, CheckCircle2, AlertCircle, Copy, Trash2, Image as ImageIcon, Sparkles, ChevronRight, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency, isCustomerActive, parseRobustLocalTime } from '../utils';
import { Modal } from '../components/Modal';
import { WhatsappApiSettingsModal, getWhatsappApiConfig } from '../components/WhatsappApiSettingsModal';
import { AutomaticBulkSendModal } from '../components/AutomaticBulkSendModal';

interface BroadcastProps {
  customers: Customer[];
  servers: Server[];
  plans: Plan[];
  userRole: UserRole;
}

export function Broadcast({ customers, servers, plans, userRole }: BroadcastProps) {
  // Filter States
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');

  // Message States
  const [messageText, setMessageText] = useState('Olá *{nome}*! 👋\n\nTemos novidades em nossos canais! Confira a programação atualizada. 🎬🍿');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Wizard States
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [currentWizardIndex, setCurrentWizardIndex] = useState(0);
  const [wizardCompleted, setWizardCompleted] = useState(false);

  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [isAutoBulkSendOpen, setIsAutoBulkSendOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const plansMap = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);
  const serversMap = useMemo(() => new Map(servers.map(s => [s.id, s])), [servers]);

  // Handle Image Upload
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  // Insert variable into message textarea at cursor position
  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const text = textarea.value;

    const newText = text.substring(0, startPos) + variable + text.substring(endPos);
    setMessageText(newText);

    // Reset cursor position after insert
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = startPos + variable.length;
    }, 0);
  };

  // Filter customers based on settings
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const plan = plansMap.get(c.planId || (c as any).plan_id);
      const isTest = plan?.name?.toLowerCase().includes('teste') || false;
      const isActive = isCustomerActive(c.dueDate, isTest);

      // 1. Status Filter
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'inactive' && isActive) return false;

      // 2. Server Filter
      if (serverFilter !== 'all' && (c.serverId || (c as any).server_id || '').toString() !== serverFilter) return false;

      // 3. Plan Filter
      if (planFilter !== 'all' && (c.planId || (c as any).plan_id || '').toString() !== planFilter) return false;

      return true;
    });
  }, [customers, statusFilter, serverFilter, planFilter, plansMap]);

  // Formatter for customized message
  const formatMessageForCustomer = (text: string, c: Customer) => {
    if (!c) return '';
    const plan = plansMap.get(c.planId || (c as any).plan_id);
    const server = serversMap.get(c.serverId || (c as any).server_id);
    const dueDateStr = c.dueDate || (c as any).due_date;
    const dueDateFormatted = dueDateStr ? format(parseRobustLocalTime(dueDateStr), 'dd/MM/yyyy') : '---';

    return text
      .replace(/{nome}/g, c.name)
      .replace(/{valor}/g, formatCurrency(c.amountPaid))
      .replace(/{vencimento}/g, dueDateFormatted)
      .replace(/{plano}/g, plan?.name || 'Plano')
      .replace(/{servidor}/g, server?.name || 'Servidor');
  };

  // Live Message Preview (using the first customer of the list)
  const livePreviewText = useMemo(() => {
    if (filteredCustomers.length === 0) return 'Selecione um público e escreva a mensagem...';
    return formatMessageForCustomer(messageText, filteredCustomers[0]);
  }, [messageText, filteredCustomers]);

  // Start Sending Wizard
  const startWizard = () => {
    if (filteredCustomers.length === 0) return;
    setCurrentWizardIndex(0);
    setWizardCompleted(false);
    setIsWizardOpen(true);
  };

  const handleWizardSend = () => {
    const customer = filteredCustomers[currentWizardIndex];
    if (!customer) return;

    const formattedText = formatMessageForCustomer(messageText, customer);
    window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(formattedText)}`, '_blank');

    if (currentWizardIndex < filteredCustomers.length - 1) {
      setCurrentWizardIndex(prev => prev + 1);
    } else {
      setWizardCompleted(true);
    }
  };

  const handleWizardSkip = () => {
    if (currentWizardIndex < filteredCustomers.length - 1) {
      setCurrentWizardIndex(prev => prev + 1);
    } else {
      setWizardCompleted(true);
    }
  };

  // Modern Clipboard Copy for Images
  const copyImageToClipboard = async () => {
    if (!imagePreview) return;
    try {
      const response = await fetch(imagePreview);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      alert('Imagem copiada para a área de transferência! Cole (Ctrl+V) no chat do WhatsApp.');
    } catch (err) {
      console.error(err);
      alert('Não foi possível copiar automaticamente. Clique com o botão direito na imagem do assistente e selecione "Copiar Imagem".');
    }
  };

  const currentWizardCustomer = filteredCustomers[currentWizardIndex];

  return (
    <div className="space-y-6 pb-24">
      {/* Title */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-3">
          <Megaphone size={28} className="text-[#c8a646]" />
          <h2 className="text-xl font-bold text-white uppercase tracking-widest">Disparos de Mensagem</h2>
        </div>
        {userRole !== 'observer' && (
          <button
            onClick={() => setIsApiSettingsOpen(true)}
            className="p-3 bg-[#161616] border border-white/5 hover:bg-white/5 hover:border-white/10 text-gray-400 hover:text-white rounded-2xl transition-all active:scale-95 flex items-center justify-center shadow-lg"
            title="Configurar WhatsApp API"
          >
            <Settings size={18} />
          </button>
        )}
      </div>

      {/* Target Audience Filter Card */}
      <div className="bg-[#161616] border border-white/5 rounded-3xl p-5 space-y-4 shadow-xl">
        <h3 className="text-xs font-black uppercase tracking-wider text-[#c8a646] flex items-center space-x-2">
          <span>1. Filtros de Público</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Status filter */}
          <div>
            <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#c8a646] transition-colors"
            >
              <option value="all">Todos os Clientes</option>
              <option value="active">Apenas Ativos</option>
              <option value="inactive">Apenas Inativos</option>
            </select>
          </div>

          {/* Server filter */}
          <div>
            <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Servidor</label>
            <select
              value={serverFilter}
              onChange={e => setServerFilter(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#c8a646] transition-colors"
            >
              <option value="all">Todos os Servidores</option>
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Plan filter */}
          <div>
            <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Plano</label>
            <select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#c8a646] transition-colors"
            >
              <option value="all">Todos os Planos</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Counter */}
        <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
          <span className="text-gray-400">Público-Alvo Selecionado:</span>
          <span className="font-bold text-white bg-[#c8a646]/10 text-[#c8a646] px-2.5 py-1 rounded-full border border-[#c8a646]/20">
            {filteredCustomers.length} {filteredCustomers.length === 1 ? 'cliente' : 'clientes'}
          </span>
        </div>
      </div>

      {/* Message Composer Card */}
      <div className="bg-[#161616] border border-white/5 rounded-3xl p-5 space-y-4 shadow-xl">
        <h3 className="text-xs font-black uppercase tracking-wider text-[#c8a646]">
          2. Composição da Mensagem
        </h3>

        {/* Message Input */}
        <div>
          <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Mensagem</label>
          <textarea
            ref={textareaRef}
            rows={4}
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            placeholder="Digite a mensagem de envio..."
            className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#c8a646] transition-colors resize-y leading-relaxed font-sans"
          />
        </div>

        {/* Dynamic Variables helper */}
        <div>
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Variáveis Disponíveis</div>
          <div className="flex flex-wrap gap-2">
            {[
              { tag: '{nome}', desc: 'Nome do cliente' },
              { tag: '{valor}', desc: 'Valor do plano' },
              { tag: '{vencimento}', desc: 'Vencimento (DD/MM)' },
              { tag: '{plano}', desc: 'Nome do plano' },
              { tag: '{servidor}', desc: 'Nome do servidor' }
            ].map(variable => (
              <button
                key={variable.tag}
                onClick={() => insertVariable(variable.tag)}
                className="bg-[#0f0f0f] border border-white/10 hover:border-[#c8a646]/40 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-mono text-gray-400 transition-all active:scale-95"
                title={variable.desc}
              >
                {variable.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Image Attachment */}
        <div className="pt-2">
          <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Imagem / Mídia (Opcional)</label>
          {imagePreview ? (
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f0f] p-2 flex items-center justify-between group">
              <div className="flex items-center space-x-3">
                <img src={imagePreview} alt="Preview" className="w-12 h-12 object-cover rounded-xl border border-white/10" />
                <span className="text-[10px] text-gray-400 font-medium truncate max-w-xs">{imageFile?.name}</span>
              </div>
              <button
                onClick={handleRemoveImage}
                className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-all mr-2 active:scale-95"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <label className="w-full h-12 border border-dashed border-white/10 hover:border-[#c8a646]/30 bg-[#0f0f0f] hover:bg-white/5 rounded-2xl flex items-center justify-center space-x-2 cursor-pointer transition-all active:scale-98">
              <ImageIcon size={16} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-medium">Anexar Imagem</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Message Preview Card */}
      <div className="bg-[#161616] border border-white/5 rounded-3xl p-5 space-y-3 shadow-xl">
        <h3 className="text-xs font-black uppercase tracking-wider text-[#c8a646]">
          3. Pré-Visualização (Primeiro Destinatário)
        </h3>
        <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/5 text-xs text-white whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
          {livePreviewText}
        </div>
      </div>

      {/* Start Button */}
      {userRole !== 'observer' && (
        <button
          onClick={() => {
            const config = getWhatsappApiConfig();
            if (config.apiType === 'manual') {
              startWizard();
            } else {
              setIsAutoBulkSendOpen(true);
            }
          }}
          disabled={filteredCustomers.length === 0}
          className={`w-full py-4 rounded-[22px] font-extrabold uppercase tracking-widest text-xs flex items-center justify-center space-x-2.5 transition-all active:scale-98 ${
            filteredCustomers.length > 0
              ? 'bg-[#c8a646] text-[#0f0f0f] hover:bg-[#e8c666] shadow-lg shadow-[#c8a646]/20'
              : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5'
          }`}
        >
          <Play size={14} fill="currentColor" />
          <span>Iniciar Disparos em Massa</span>
        </button>
      )}

      {/* Sending Wizard Modal */}
      <Modal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} title="Assistente de Disparos" maxWidth="max-w-md">
        {wizardCompleted ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
            <div className="bg-green-500/10 p-4 rounded-full border border-green-500/20 mb-2">
              <CheckCircle2 className="text-green-400" size={40} />
            </div>
            <div>
              <h4 className="font-bold text-white text-lg">Disparos Concluídos!</h4>
              <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                Você processou todos os {filteredCustomers.length} clientes da lista filtrada.
              </p>
            </div>
            <button
              onClick={() => setIsWizardOpen(false)}
              className="w-full py-3 rounded-xl bg-[#c8a646] text-[#0f0f0f] font-bold hover:bg-[#e8c666] transition-all shadow-lg shadow-[#c8a646]/20 text-sm mt-4"
            >
              Finalizar
            </button>
          </div>
        ) : (
          currentWizardCustomer && (
            <div className="space-y-6">
              {/* Progress */}
              <div>
                <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
                  <span className="font-bold uppercase tracking-wider text-[#c8a646]">Disparando Mensagens</span>
                  <span>
                    {currentWizardIndex + 1} de {filteredCustomers.length}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#c8a646] to-[#e8c666] transition-all duration-300"
                    style={{ width: `${((currentWizardIndex + 1) / filteredCustomers.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Current Customer Info */}
              <div className="bg-[#131313] p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white text-base leading-tight">{currentWizardCustomer.name}</div>
                  <div className="text-[10px] text-gray-500 uppercase font-black tracking-wider mt-1">
                    {plansMap.get(currentWizardCustomer.planId || (currentWizardCustomer as any).plan_id)?.name || 'Plano'} •{' '}
                    {serversMap.get(currentWizardCustomer.serverId || (currentWizardCustomer as any).server_id)?.name || 'Servidor'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] text-gray-500 uppercase font-black tracking-widest">Telefone</div>
                  <div className="text-xs font-mono text-white mt-1">{currentWizardCustomer.phone}</div>
                </div>
              </div>

              {/* Text preview */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 text-xs text-gray-400">
                  <MessageSquare size={14} className="text-[#c8a646]" />
                  <span className="font-bold uppercase tracking-wider">Texto da Mensagem</span>
                </div>
                <div className="bg-[#0f0f0f] p-4 rounded-xl border border-white/5 text-xs text-white max-h-36 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                  {formatMessageForCustomer(messageText, currentWizardCustomer)}
                </div>
              </div>

              {/* Image preview & action */}
              {imagePreview && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-bold uppercase tracking-wider">Imagem Anexada</span>
                    <button
                      onClick={copyImageToClipboard}
                      className="text-[#c8a646] hover:text-[#e8c666] font-bold uppercase tracking-wider text-[9px] flex items-center space-x-1 transition-all active:scale-95"
                    >
                      <Copy size={12} />
                      <span>Copiar Imagem</span>
                    </button>
                  </div>
                  <div className="relative w-full rounded-2xl overflow-hidden border border-white/5 bg-[#0f0f0f] p-2 flex flex-col items-center justify-center space-y-2">
                    <img src={imagePreview} alt="Preview" className="max-h-24 object-contain rounded-xl border border-white/10" />
                    <div className="text-[9px] text-[#c8a646] font-bold text-center bg-[#c8a646]/10 px-3 py-1 rounded-full border border-[#c8a646]/20 flex items-center space-x-1">
                      <Sparkles size={10} />
                      <span>Copie e cole (Ctrl+V) no WhatsApp após clicar em Enviar</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setIsWizardOpen(false)}
                  className="px-4 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider shrink-0"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleWizardSkip}
                  className="flex-1 py-3 rounded-xl bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center space-x-2 text-xs font-bold uppercase tracking-wider border border-white/5"
                >
                  <SkipForward size={14} />
                  <span>Pular</span>
                </button>
                <button
                  onClick={handleWizardSend}
                  className="flex-1 py-3 rounded-xl bg-green-500 text-black hover:bg-green-400 font-extrabold transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider shadow-lg shadow-green-500/10"
                >
                  <Play size={14} fill="black" />
                  <span>Enviar</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Automatic Bulk Send Modal */}
      <AutomaticBulkSendModal
        isOpen={isAutoBulkSendOpen}
        onClose={() => setIsAutoBulkSendOpen(false)}
        customers={filteredCustomers}
        plans={plans}
        servers={servers}
        formatMessage={(c) => formatMessageForCustomer(messageText, c)}
        imagePreview={imagePreview}
        updateCustomer={() => {}} // Broadcast doesn't update specific customer state since it's general campaign
      />

      {/* WhatsApp API Settings Modal */}
      <WhatsappApiSettingsModal
        isOpen={isApiSettingsOpen}
        onClose={() => setIsApiSettingsOpen(false)}
      />
    </div>
  );
}
