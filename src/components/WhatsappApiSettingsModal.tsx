import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Settings, Save, X, Send, Smartphone, Globe, Key, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';

export interface WhatsappApiConfig {
  apiType: 'manual' | 'evolution' | 'zapi';
  apiUrl: string;
  instanceName: string;
  token: string;
  clientToken?: string;
}

interface WhatsappApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const getWhatsappApiConfig = (): WhatsappApiConfig => {
  try {
    const configStr = localStorage.getItem('arf_whatsapp_api_config');
    if (configStr) {
      return JSON.parse(configStr);
    }
  } catch (e) {
    console.error(e);
  }
  return {
    apiType: 'manual',
    apiUrl: '',
    instanceName: '',
    token: '',
    clientToken: ''
  };
};

export const saveWhatsappApiConfig = (config: WhatsappApiConfig) => {
  localStorage.setItem('arf_whatsapp_api_config', JSON.stringify(config));
};

export function WhatsappApiSettingsModal({ isOpen, onClose }: WhatsappApiSettingsModalProps) {
  const [config, setConfig] = useState<WhatsappApiConfig>(getWhatsappApiConfig());
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Este é um teste de conexão da API do WhatsApp do painel ARF-CANAIS. 🎉');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedStatus, setSavedStatus] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(getWhatsappApiConfig());
      setTestResult(null);
      setSavedStatus(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    saveWhatsappApiConfig(config);
    setSavedStatus(true);
    setTimeout(() => {
      setSavedStatus(false);
      onClose();
    }, 1200);
  };

  const handleTestConnection = async () => {
    if (!testPhone.trim()) {
      setTestResult({ success: false, message: 'Digite um telefone para teste.' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    const cleanPhone = testPhone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone; // Fallback to Brazil DDI

    try {
      if (config.apiType === 'evolution') {
        const url = `${config.apiUrl.replace(/\/$/, '')}/message/sendText/${config.instanceName}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.token
          },
          body: JSON.stringify({
            number: formattedPhone,
            text: testMessage
          })
        });

        const resData = await response.json();
        if (response.ok) {
          setTestResult({ success: true, message: 'Mensagem de teste enviada com sucesso!' });
        } else {
          setTestResult({ success: false, message: `Erro da API (Evolution): ${resData.message || response.statusText}` });
        }
      } else if (config.apiType === 'zapi') {
        const url = `${config.apiUrl.replace(/\/$/, '')}/instances/${config.instanceName}/token/${config.token}/send-text`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (config.clientToken) {
          headers['Client-Token'] = config.clientToken;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: formattedPhone,
            message: testMessage
          })
        });

        const resData = await response.json();
        if (response.ok && (resData.sent || resData.messageId)) {
          setTestResult({ success: true, message: 'Mensagem de teste enviada com sucesso!' });
        } else {
          setTestResult({ success: false, message: `Erro da API (Z-API): ${resData.message || response.statusText || 'Falha no envio.'}` });
        }
      } else {
        setTestResult({ success: false, message: 'Selecione uma API ativa para testar.' });
      }
    } catch (err: any) {
      console.error(err);
      setTestResult({ success: false, message: `Erro de Conexão: ${err.message || 'Verifique a URL e a internet.'}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configuração de API do WhatsApp" maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Type Select */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Método de Envio</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'manual', label: 'Manual (wa.me)', desc: 'Gratuito, abre abas' },
              { id: 'evolution', label: 'Evolution API', desc: 'Auto, 1 clique' },
              { id: 'zapi', label: 'Z-API', desc: 'Auto, 1 clique' }
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, apiType: item.id as any }))}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  config.apiType === item.id
                    ? 'bg-[#c8a646]/10 border-[#c8a646] text-white'
                    : 'bg-[#0f0f0f]/40 border-white/5 hover:border-white/10 text-gray-400'
                }`}
              >
                <span className="font-bold text-xs">{item.label}</span>
                <span className="text-[9px] opacity-60 mt-1">{item.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {config.apiType === 'manual' ? (
          <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start space-x-3 text-xs text-blue-400">
            <Info size={18} className="shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold">Modo Manual Ativado (Padrão)</span>
              <p className="opacity-80">
                As mensagens serão enviadas abrindo guias do WhatsApp Web ou redirecionando para o aplicativo do WhatsApp.
                Você precisará clicar em "Enviar" individualmente para cada cliente.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* API URL */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">URL da API</label>
              <div className="relative group">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={16} />
                <input
                  type="url"
                  value={config.apiUrl}
                  onChange={e => setConfig(prev => ({ ...prev, apiUrl: e.target.value.trim() }))}
                  placeholder={config.apiType === 'zapi' ? 'https://api.z-api.io' : 'https://sua-api.com'}
                  className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-2 focus:ring-[#c8a646]/20 transition-all text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Instance Name / ID */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                  {config.apiType === 'zapi' ? 'ID da Instância' : 'Nome da Instância'}
                </label>
                <div className="relative group">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={16} />
                  <input
                    type="text"
                    value={config.instanceName}
                    onChange={e => setConfig(prev => ({ ...prev, instanceName: e.target.value.trim() }))}
                    placeholder={config.apiType === 'zapi' ? '3C5...' : 'minha-instancia'}
                    className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-2 focus:ring-[#c8a646]/20 transition-all text-xs"
                  />
                </div>
              </div>

              {/* Token / Key */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                  {config.apiType === 'zapi' ? 'Token da Instância' : 'API Key (Token)'}
                </label>
                <div className="relative group">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={16} />
                  <input
                    type="password"
                    value={config.token}
                    onChange={e => setConfig(prev => ({ ...prev, token: e.target.value.trim() }))}
                    placeholder="••••••••••••••••"
                    className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-2 focus:ring-[#c8a646]/20 transition-all text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Client Token (Z-API only) */}
            {config.apiType === 'zapi' && (
              <div className="space-y-1 animate-in fade-in duration-200">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Client-Token (Opcional)</label>
                <div className="relative group">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={16} />
                  <input
                    type="password"
                    value={config.clientToken || ''}
                    onChange={e => setConfig(prev => ({ ...prev, clientToken: e.target.value.trim() }))}
                    placeholder="Se sua instância exige Client-Token"
                    className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-2 focus:ring-[#c8a646]/20 transition-all text-xs"
                  />
                </div>
              </div>
            )}

            {/* Test Connection Section */}
            <div className="p-4 rounded-2xl bg-[#0f0f0f] border border-white/5 space-y-3">
              <h4 className="text-xs font-bold text-[#c8a646] uppercase tracking-wider">Testar Conexão</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="DDD + Telefone (ex: 11999999999)"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  className="flex-1 bg-[#161616] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c8a646]"
                />
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  {testing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                  <span>Testar</span>
                </button>
              </div>
              
              {testResult && (
                <div className={`p-2.5 rounded-xl text-[11px] flex items-start space-x-2 border animate-in fade-in duration-200 ${
                  testResult.success
                    ? 'bg-green-500/10 text-green-400 border-green-500/15'
                    : 'bg-red-500/10 text-red-400 border-red-500/15'
                }`}>
                  {testResult.success ? <CheckCircle2 className="shrink-0 mt-0.5" size={14} /> : <AlertCircle className="shrink-0 mt-0.5" size={14} />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/5 transition-colors text-xs uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={savedStatus}
            className="flex-1 py-3 bg-[#c8a646] hover:bg-[#e8c666] text-[#0f0f0f] font-black rounded-2xl transition-all shadow-xl shadow-[#c8a646]/10 flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
          >
            {savedStatus ? (
              <>
                <CheckCircle2 size={16} />
                <span>Salvo!</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Salvar Configurações</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
