import { useState, useEffect, useMemo, useRef } from 'react';
import { Customer, Server, Plan } from '../types';
import { Modal } from './Modal';
import { Play, Pause, Square, CheckCircle2, AlertCircle, Loader2, Sparkles, Sliders } from 'lucide-react';
import { getWhatsappApiConfig } from './WhatsappApiSettingsModal';
import { format } from 'date-fns';

interface AutomaticBulkSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  plans: Plan[];
  servers: Server[];
  formatMessage: (customer: Customer) => string;
  imagePreview: string | null; // base64 string or URL
  updateCustomer: (id: string, c: Partial<Customer>) => void;
}

type SendState = 'idle' | 'running' | 'paused' | 'completed' | 'stopped';
type CustomerStatus = 'pending' | 'sending' | 'success' | 'error';

interface SendResult {
  status: CustomerStatus;
  error?: string;
}

export function AutomaticBulkSendModal({
  isOpen,
  onClose,
  customers,
  plans,
  servers,
  formatMessage,
  imagePreview,
  updateCustomer
}: AutomaticBulkSendModalProps) {
  const [sendState, setSendState] = useState<SendState>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [results, setResults] = useState<Record<string, SendResult>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  const plansMap = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);
  const serversMap = useMemo(() => new Map(servers.map(s => [s.id, s])), [servers]);

  const stateRef = useRef<SendState>('idle');
  const indexRef = useRef<number>(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync for asynchronous loops
  useEffect(() => {
    stateRef.current = sendState;
  }, [sendState]);

  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setSendState('idle');
      setCurrentIndex(0);
      setCountdown(null);
      setLogs(['Aguardando início do disparo automático...']);
      
      const initialResults: Record<string, SendResult> = {};
      customers.forEach(c => {
        initialResults[c.id] = { status: 'pending' };
      });
      setResults(initialResults);
    }
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isOpen, customers]);

  const addLog = (message: string) => {
    const time = format(new Date(), 'HH:mm:ss');
    setLogs(prev => [`[${time}] ${message}`, ...prev]);
  };

  const executeSend = async (customer: Customer): Promise<{ success: boolean; error?: string }> => {
    const config = getWhatsappApiConfig();
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const message = formatMessage(customer);

    try {
      if (config.apiType === 'evolution') {
        const hasImage = !!imagePreview;
        const endpoint = hasImage ? 'sendMedia' : 'sendText';
        const url = `${config.apiUrl.replace(/\/$/, '')}/message/${endpoint}/${config.instanceName}`;
        
        let body: any;
        if (hasImage) {
          body = {
            number: formattedPhone,
            mediaMessage: {
              mediatype: 'image',
              caption: message,
              media: imagePreview
            }
          };
        } else {
          body = {
            number: formattedPhone,
            text: message
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.token
          },
          body: JSON.stringify(body)
        });

        const resData = await response.json();
        if (response.ok) {
          return { success: true };
        } else {
          return { success: false, error: resData.message || response.statusText || 'Erro desconhecido' };
        }
      } else if (config.apiType === 'zapi') {
        const hasImage = !!imagePreview;
        const endpoint = hasImage ? 'send-image' : 'send-text';
        const url = `${config.apiUrl.replace(/\/$/, '')}/instances/${config.instanceName}/token/${config.token}/${endpoint}`;
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (config.clientToken) {
          headers['Client-Token'] = config.clientToken;
        }

        let body: any;
        if (hasImage) {
          body = {
            phone: formattedPhone,
            image: imagePreview,
            caption: message
          };
        } else {
          body = {
            phone: formattedPhone,
            message: message
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        const resData = await response.json();
        if (response.ok && (resData.sent || resData.messageId)) {
          return { success: true };
        } else {
          return { success: false, error: resData.message || response.statusText || 'Erro desconhecido' };
        }
      } else {
        return { success: false, error: 'Configuração de API inválida' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro de conexão' };
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runBulkSendLoop = async () => {
    setSendState('running');
    addLog('Iniciando disparos...');

    while (indexRef.current < customers.length && stateRef.current === 'running') {
      const activeIndex = indexRef.current;
      const customer = customers[activeIndex];

      // 1. Update status to sending
      setResults(prev => ({
        ...prev,
        [customer.id]: { status: 'sending' }
      }));
      addLog(`Enviando para ${customer.name}...`);

      // 2. Perform request
      const response = await executeSend(customer);

      if (stateRef.current !== 'running' && stateRef.current !== 'paused') {
        // Stopped or completed in the middle
        break;
      }

      if (response.success) {
        setResults(prev => ({
          ...prev,
          [customer.id]: { status: 'success' }
        }));
        addLog(`Sucesso: Mensagem enviada para ${customer.name}.`);
        
        // Update local and database customer lastNotifiedDate
        try {
          updateCustomer(customer.id, { lastNotifiedDate: format(new Date(), 'yyyy-MM-dd') });
        } catch (dbErr) {
          console.error('Failed to update notified date:', dbErr);
        }
      } else {
        setResults(prev => ({
          ...prev,
          [customer.id]: { status: 'error', error: response.error }
        }));
        addLog(`Erro ao enviar para ${customer.name}: ${response.error}`);
      }

      const nextIndex = activeIndex + 1;
      
      if (nextIndex >= customers.length) {
        setSendState('completed');
        addLog('Processo concluído! Todas as mensagens foram processadas.');
        break;
      }

      // Move index forward
      setCurrentIndex(nextIndex);

      // 3. Delay countdown
      if (stateRef.current === 'running') {
        let remaining = delaySeconds;
        setCountdown(remaining);
        
        // Start countdown interval
        await new Promise<void>((resolve) => {
          countdownIntervalRef.current = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              setCountdown(null);
              resolve();
            } else {
              setCountdown(remaining);
            }
          }, 1000);
        });
      }
    }
  };

  const handleStart = () => {
    runBulkSendLoop();
  };

  const handlePause = () => {
    setSendState('paused');
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(null);
    addLog('Envio pausado pelo usuário.');
  };

  const handleStop = () => {
    setSendState('stopped');
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(null);
    addLog('Envio cancelado pelo usuário.');
  };

  const getSuccessCount = () => (Object.values(results) as SendResult[]).filter(r => r.status === 'success').length;
  const getErrorCount = () => (Object.values(results) as SendResult[]).filter(r => r.status === 'error').length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Disparo Automático em Massa" maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Connection Notice */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-3 flex justify-between items-center text-xs">
          <div className="flex items-center space-x-2">
            <Sparkles size={16} className="text-[#c8a646]" />
            <span className="text-gray-400">Público-Alvo: <strong className="text-white">{customers.length}</strong></span>
          </div>
          <div className="flex items-center space-x-2 text-gray-500">
            <span>Sucesso: <strong className="text-green-400">{getSuccessCount()}</strong></span>
            <span>•</span>
            <span>Erros: <strong className="text-red-400">{getErrorCount()}</strong></span>
          </div>
        </div>

        {/* Progress Bar & Status */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span className="font-bold uppercase tracking-wider text-[#c8a646]">
              {sendState === 'running' && 'Enviando...'}
              {sendState === 'paused' && 'Pausado'}
              {sendState === 'completed' && 'Concluído'}
              {sendState === 'stopped' && 'Cancelado'}
              {sendState === 'idle' && 'Pronto para iniciar'}
            </span>
            <span>
              {currentIndex} de {customers.length} ({Math.round((currentIndex / customers.length) * 100)}%)
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                sendState === 'completed'
                  ? 'bg-green-500'
                  : sendState === 'stopped'
                  ? 'bg-red-500'
                  : 'bg-gradient-to-r from-[#c8a646] to-[#e8c666]'
              }`}
              style={{ width: `${(currentIndex / customers.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Countdown Timer Alert */}
        {countdown !== null && (
          <div className="p-3 bg-[#c8a646]/10 border border-[#c8a646]/20 rounded-2xl text-center text-xs text-[#c8a646] font-bold animate-pulse">
            Próximo envio em {countdown} segundos...
          </div>
        )}

        {/* Delay Control (only when not running) */}
        <div className="p-4 bg-[#0f0f0f] border border-white/5 rounded-2xl space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
              <Sliders size={14} className="text-[#c8a646]" />
              Intervalo entre mensagens
            </span>
            <span className="font-bold text-white">{delaySeconds}s</span>
          </div>
          <input
            type="range"
            min="2"
            max="15"
            value={delaySeconds}
            onChange={e => setDelaySeconds(Number(e.target.value))}
            disabled={sendState === 'running'}
            className="w-full accent-[#c8a646] cursor-pointer"
          />
          <p className="text-[10px] text-gray-500">
            Recomendamos no mínimo 5 segundos para evitar bloqueios ou sobrecarga na conta de WhatsApp.
          </p>
        </div>

        {/* Two-Column split for logs and customers list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-52">
          {/* Log Console */}
          <div className="bg-[#080808] border border-white/5 rounded-2xl p-3 flex flex-col h-full overflow-hidden">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 shrink-0">Histórico de Eventos</div>
            <div className="flex-1 overflow-y-auto space-y-1.5 text-[10px] font-mono text-gray-400 pr-1 custom-scrollbar">
              {logs.map((log, i) => (
                <div key={i} className="leading-tight whitespace-pre-wrap">{log}</div>
              ))}
            </div>
          </div>

          {/* Recipients List */}
          <div className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-3 flex flex-col h-full overflow-hidden">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 shrink-0">Lista de Destinatários</div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {customers.map((c, idx) => {
                const plan = plansMap.get(c.planId || (c as any).plan_id);
                const server = serversMap.get(c.serverId || (c as any).server_id);
                const res = results[c.id] || { status: 'pending' };

                return (
                  <div key={c.id} className="flex justify-between items-center text-xs p-1.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{c.name}</p>
                      <p className="text-[9px] text-gray-500 truncate mt-0.5">{plan?.name || 'Plano'} • {server?.name || 'Servidor'}</p>
                    </div>
                    <div className="shrink-0 ml-2">
                      {res.status === 'pending' && <span className="w-4 h-4 rounded-full bg-white/5 border border-white/10 block" title="Pendente" />}
                      {res.status === 'sending' && <Loader2 className="animate-spin text-[#c8a646]" size={16} title="Enviando" />}
                      {res.status === 'success' && <CheckCircle2 className="text-green-500" size={16} title="Sucesso" />}
                      {res.status === 'error' && <AlertCircle className="text-red-500" size={16} title={`Erro: ${res.error}`} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Buttons Controls */}
        <div className="flex gap-3 pt-3">
          {sendState === 'idle' && (
            <button
              onClick={handleStart}
              className="flex-1 py-4 bg-[#c8a646] hover:bg-[#e8c666] text-[#0f0f0f] font-black rounded-2xl transition-all shadow-xl shadow-[#c8a646]/10 flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
            >
              <Play size={16} fill="black" />
              <span>Iniciar Disparos Automáticos</span>
            </button>
          )}

          {sendState === 'running' && (
            <>
              <button
                onClick={handlePause}
                className="flex-1 py-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
              >
                <Pause size={16} />
                <span>Pausar</span>
              </button>
              <button
                onClick={handleStop}
                className="flex-1 py-4 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
              >
                <Square size={16} fill="currentColor" />
                <span>Parar</span>
              </button>
            </>
          )}

          {sendState === 'paused' && (
            <>
              <button
                onClick={handleStart}
                className="flex-1 py-4 bg-[#c8a646] hover:bg-[#e8c666] text-[#0f0f0f] font-black rounded-2xl transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
              >
                <Play size={16} fill="black" />
                <span>Retomar</span>
              </button>
              <button
                onClick={handleStop}
                className="flex-1 py-4 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
              >
                <Square size={16} fill="currentColor" />
                <span>Parar</span>
              </button>
            </>
          )}

          {(sendState === 'completed' || sendState === 'stopped') && (
            <button
              onClick={onClose}
              className="flex-1 py-4 bg-[#161616] border border-white/10 hover:bg-white/5 text-white font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
            >
              <span>Fechar Janela</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
