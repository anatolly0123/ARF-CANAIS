import { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Database, Download, Upload, Trash2, HardDrive, Calendar as CalendarIcon, TrendingUp, TrendingDown, DollarSign, Image as ImageIcon, History } from 'lucide-react';
import { Customer, Server, Plan, Renewal, ManualAddition } from '../types';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale'; // Added for locale support in date formatting
import { formatCurrency, parseCurrency, parseExcelDate } from '../utils';
import { Modal } from '../components/Modal';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

interface StorageProps {
  customers: Customer[];
  servers: Server[];
  plans: Plan[];
  renewals: Renewal[];
  manualAdditions: ManualAddition[];
  bulkUpdateCustomers: (updater: (prev: Customer[]) => Customer[]) => void;
  setServers: (servers: Server[]) => void;
  setPlans: (plans: Plan[]) => void;
  setRenewals: (renewals: Renewal[]) => void;
  setManualAdditions: (additions: ManualAddition[]) => void;
  appIcon: string | null;
  setAppIcon: (icon: string | null) => void;
  syncToCloud: () => Promise<void>;
}

export function Storage({ customers, servers, plans, renewals, manualAdditions, bulkUpdateCustomers, setServers, setPlans, setRenewals, setManualAdditions, appIcon, setAppIcon, syncToCloud }: StorageProps) {
  const [storageSize, setStorageSize] = useState<string>('0 KB');
  const [isFullHistoryOpen, setIsFullHistoryOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<Customer[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    const calculateSize = () => {
      let total = 0;
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += (localStorage[key].length + key.length) * 2;
        }
      }
      setStorageSize((total / 1024).toFixed(2) + ' KB');
    };
    calculateSize();
  }, [customers, servers, plans]);

  const handleDownloadTemplate = () => {
    const template = [
      {
        'Nome': 'João Silva',
        'Telefone': '11999999999',
        'Servidor': servers[0]?.name || 'Servidor Exemplo',
        'Plano': plans[0]?.name || 'Mensal',
        'Valor Pago': plans[0]?.defaultPrice || 35.00,
        'Vencimento (DD/MM/AAAA)': format(new Date(), 'dd/MM/yyyy')
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "modelo_importacao_clientes.xlsx");
  };

  const handleImportSpreadsheet = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const newCustomers: Customer[] = data.map((row: any) => {
          // Normalize column names to be more forgiving
          const getVal = (possibleNames: string[]) => {
            const keys = Object.keys(row);
            // 1. Try exact match (case insensitive)
            for (const name of possibleNames) {
              const found = keys.find(k => k.toLowerCase().trim() === name.toLowerCase());
              if (found) return row[found];
            }
            // 2. Try partial match
            for (const name of possibleNames) {
              const found = keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
              if (found) return row[found];
            }
            return undefined;
          };

          const serverName = getVal(['Servidor', 'Server', 'Servidores', 'Srv'])?.toString().trim();
          const planName = getVal(['Plano', 'Plan', 'Planos', 'Pln'])?.toString().trim();
          const rawAmount = getVal(['Valor Pago', 'Valor', 'Amount', 'Preço', 'Mensalidade', 'Pago', 'Total']);
          const rawDate = getVal([
            'Vencimento (DD/MM/AAAA)',
            'Vencimento',
            'Due Date',
            'Data',
            'Vence',
            'Validade',
            'Expira',
            'Venc',
            'Data de Vencimento',
            'Final'
          ]);

          const server = servers.find(s => s.name.toLowerCase().trim() === serverName?.toLowerCase()) ||
            servers.find(s => s.name.toLowerCase().includes(serverName?.toLowerCase() || ''));

          const plan = plans.find(p => p.name.toLowerCase().trim() === planName?.toLowerCase()) ||
            plans.find(p => p.name.toLowerCase().includes(planName?.toLowerCase() || ''));

          const amountPaid = parseCurrency(rawAmount) || (plan?.defaultPrice || 0);
          const dueDate = parseExcelDate(rawDate);

          return {
            id: uuidv4(),
            name: getVal(['Nome', 'Name', 'Cliente', 'Usuário'])?.toString() || 'Sem Nome',
            phone: getVal(['Telefone', 'Phone', 'WhatsApp', 'Celular'])?.toString() || '',
            serverId: server?.id || (servers[0]?.id || ''),
            planId: plan?.id || (plans[0]?.id || ''),
            amountPaid,
            dueDate
          };
        });

        if (newCustomers.length > 0) {
          setImportPreview(newCustomers);
          setIsImportModalOpen(true);
        } else {
          alert('Nenhum dado válido encontrado na planilha.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao processar a planilha. Verifique se o formato está correto.');
      }
      e.target.value = ''; // Reset input
    };
    reader.readAsBinaryString(file);
  };

  const confirmImport = () => {
    // 1. Update Customers
    bulkUpdateCustomers(prev => [...prev, ...importPreview]);

    // 2. Generate Renewals for each customer to update dashboard
    const newRenewals: Renewal[] = importPreview.map(c => {
      const server = servers.find(s => s.id === c.serverId);
      const plan = plans.find(p => p.id === c.planId);
      const cost = (server?.costPerActive || 0) * (plan?.months || 1);

      return {
        id: uuidv4(),
        customerId: c.id,
        serverId: c.serverId,
        planId: c.planId,
        amount: c.amountPaid,
        cost: cost,
        date: new Date().toISOString()
      };
    });

    setRenewals([...renewals, ...newRenewals]);

    setIsImportModalOpen(false);
    setImportPreview([]);
    alert(`${importPreview.length} clientes importados com sucesso!`);
  };

  const handleExportAll = () => {
    const data = {
      customers,
      servers,
      plans,
      renewals,
      manualAdditions,
      appIcon,
      version: '1.2',
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_arf_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportAll = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        if (json.customers && Array.isArray(json.customers)) {
          bulkUpdateCustomers(() => json.customers);
        }
        if (json.servers && Array.isArray(json.servers)) {
          setServers(json.servers);
        }
        if (json.plans && Array.isArray(json.plans)) {
          setPlans(json.plans);
        }
        if (json.renewals && Array.isArray(json.renewals)) {
          setRenewals(json.renewals);
        }
        if (json.manualAdditions && Array.isArray(json.manualAdditions)) {
          setManualAdditions(json.manualAdditions);
        }
        if (json.appIcon) {
          setAppIcon(json.appIcon);
        }

        if (confirm('Backup restaurado localmente com sucesso! Deseja enviar esses dados para a nuvem agora para que fiquem disponíveis em todos os seus aparelhos?')) {
          syncToCloud();
        } else {
          alert('Backup restaurado localmente.');
        }
      } catch (err) {
        alert('Erro ao importar backup. Verifique o arquivo.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    if (confirm('TEM CERTEZA? Isso apagará TODOS os seus dados (Clientes, Servidores e Planos). Esta ação não pode ser desfeita.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleIconUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAppIcon(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [showRawData, setShowRawData] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const monthlyStats = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);

    const monthRenewals = renewals.filter(r => {
      const rDate = parseISO(r.date);
      return isWithinInterval(rDate, { start, end });
    });

    const monthAdditions = manualAdditions.filter(a => {
      const aDate = parseISO(a.date);
      return isWithinInterval(aDate, { start, end });
    });

    const gross = monthRenewals.reduce((acc, r) => acc + r.amount, 0) +
      monthAdditions.filter(a => a.amount > 0).reduce((acc, a) => acc + a.amount, 0);

    const cost = monthRenewals.reduce((acc, r) => acc + (r.cost || 0), 0) +
      Math.abs(monthAdditions.filter(a => a.amount < 0).reduce((acc, a) => acc + a.amount, 0));

    const transactions: { id: string; date: string; description: string; amount: number; type: 'profit' | 'expense' }[] = [];

    monthRenewals.forEach(r => {
      const customer = customers.find(c => c.id === r.customerId);
      const customerName = customer ? customer.name : 'Cliente Excluído';

      if (r.amount > 0) {
        transactions.push({
          id: `ren-gross-${r.id}`,
          date: r.date,
          description: `Renovação: ${customerName}`,
          amount: r.amount,
          type: 'profit'
        });
      }
      if (r.cost && r.cost > 0) {
        transactions.push({
          id: `ren-cost-${r.id}`,
          date: r.date,
          description: `Custo Servidor: ${customerName}`,
          amount: r.cost,
          type: 'expense'
        });
      }
    });

    monthAdditions.forEach(a => {
      if (a.amount > 0) {
        transactions.push({
          id: `add-${a.id}`,
          date: a.date,
          description: a.description || 'Adição manual',
          amount: a.amount,
          type: 'profit'
        });
      } else if (a.amount < 0) {
        transactions.push({
          id: `add-${a.id}`,
          date: a.date,
          description: a.description || 'Remoção manual',
          amount: Math.abs(a.amount),
          type: 'expense'
        });
      }
    });

    transactions.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

    return {
      gross,
      cost,
      net: gross - cost,
      transactions
    };
  }, [selectedMonth, renewals, manualAdditions, customers]);

  return (
    <div className="space-y-6 pb-24">
      {/* Monthly Stats Section */}
      <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5 shadow-lg">
        <div className="flex flex-col space-y-4 mb-6">
          <div className="flex items-center space-x-3">
            <CalendarIcon size={24} className="text-[#c8a646]" />
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">Faturamento</h2>
          </div>
          <div className="bg-[#0f0f0f] rounded-xl px-4 py-3 border border-white/5 w-full">
            <input
              type="month"
              value={format(selectedMonth, 'yyyy-MM')}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month] = e.target.value.split('-');
                  setSelectedMonth(new Date(parseInt(year), parseInt(month) - 1));
                }
              }}
              className="bg-transparent text-base font-bold text-white uppercase tracking-wider outline-none cursor-pointer w-full [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-500/10 rounded-xl">
                <TrendingUp size={20} className="text-green-400" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Entrou (Bruto)</div>
                <div className="text-lg font-bold text-white">{formatCurrency(monthlyStats.gross)}</div>
              </div>
            </div>
          </div>

          <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-500/10 rounded-xl">
                <TrendingDown size={20} className="text-red-400" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Saiu (Custo)</div>
                <div className="text-lg font-bold text-white">{formatCurrency(monthlyStats.cost)}</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#c8a646]/20 to-[#0f0f0f] p-4 rounded-2xl border border-[#c8a646]/30 flex items-center justify-between mt-2">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-[#c8a646]/20 rounded-xl">
                <DollarSign size={20} className="text-[#c8a646]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#c8a646] mb-1">Sobrou (Líquido)</div>
                <div className="text-xl font-black text-white">{formatCurrency(monthlyStats.net)}</div>
              </div>
            </div>
          </div>
        </div>

        {monthlyStats.transactions.length > 0 && (
          <div className="mt-8 pt-6 border-t border-white/5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Histórico de Transações</h3>
              <button
                onClick={() => setIsFullHistoryOpen(true)}
                className="text-[10px] text-[#c8a646] font-bold uppercase tracking-widest hover:underline"
              >
                Ver Todos
              </button>
            </div>
            <div className="space-y-3">
              {monthlyStats.transactions.slice(0, 5).map(tx => (
                <div key={tx.id} className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5 flex justify-between items-center">
                  <div>
                    <div className="text-sm text-white font-medium">{tx.description}</div>
                    <div className="text-[10px] text-gray-500">{format(parseISO(tx.date), "dd/MM/yyyy 'às' HH:mm")}</div>
                  </div>
                  <div className={`text-sm font-bold ${tx.type === 'profit' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.type === 'profit' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* App Customization Section */}
      <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5 shadow-lg">
        <div className="flex items-center space-x-4 mb-6">
          <div className="bg-[#c8a646] p-3 rounded-2xl">
            <ImageIcon size={24} className="text-[#0f0f0f]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">Aparência</h2>
            <p className="text-xs text-gray-400 font-medium">Personalize seu aplicativo</p>
          </div>
        </div>

        <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
              {appIcon ? (
                <img src={appIcon} alt="App Icon" className="w-full h-full object-cover" />
              ) : (
                <div className="text-3xl font-black text-white/20">A</div>
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-white">Ícone do App</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Mude o ícone da home</div>
            </div>
          </div>
          <div className="flex space-x-2">
            {appIcon && (
              <button
                onClick={() => setAppIcon(null)}
                className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors"
                title="Resetar para o padrão"
              >
                <Trash2 size={20} />
              </button>
            )}
            <label className="p-3 bg-[#c8a646] text-[#0f0f0f] rounded-xl hover:bg-[#e8c666] transition-colors cursor-pointer shadow-lg shadow-[#c8a646]/20">
              <Upload size={20} />
              <input type="file" accept="image/*" onChange={handleIconUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-[#c8a646]/20 to-[#1a1a1a] p-6 rounded-3xl border border-[#c8a646]/30 shadow-xl">
        <div className="flex items-center space-x-4 mb-6">
          <div className="bg-[#c8a646] p-3 rounded-2xl">
            <HardDrive size={24} className="text-[#0f0f0f]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">Armazenamento</h2>
            <p className="text-xs text-gray-400 font-medium">Gerencie seus dados locais</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Espaço Usado</div>
            <div className="text-lg font-bold text-white">{storageSize}</div>
          </div>
          <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Total Registros</div>
            <div className="text-lg font-bold text-[#c8a646]">{customers.length + servers.length + plans.length + renewals.length + manualAdditions.length}</div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={syncToCloud}
            className="w-full flex items-center justify-between p-4 bg-[#c8a646] text-[#0f0f0f] rounded-2xl hover:bg-[#e8c666] transition-all shadow-xl shadow-[#c8a646]/20 font-bold group"
          >
            <div className="flex items-center space-x-3">
              <Upload size={20} />
              <div className="text-left">
                <div className="text-sm">Sincronizar com a Nuvem</div>
                <div className="text-[10px] opacity-70 uppercase tracking-wider">Enviar dados locais para o Supabase</div>
              </div>
            </div>
          </button>

          <button
            onClick={handleExportAll}
            className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <Download size={20} className="text-[#c8a646]" />
              <div className="text-left">
                <div className="text-sm font-bold text-white">Exportar Backup</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Salvar tudo em arquivo .json</div>
              </div>
            </div>
          </button>

          <label className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors cursor-pointer group">
            <div className="flex items-center space-x-3">
              <Upload size={20} className="text-blue-400" />
              <div className="text-left">
                <div className="text-sm font-bold text-white">Importar Backup</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Restaurar de um arquivo .json</div>
              </div>
            </div>
            <input type="file" accept=".json" onChange={handleImportAll} className="hidden" />
          </label>

          <button
            onClick={() => setShowRawData(!showRawData)}
            className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <Database size={20} className="text-purple-400" />
              <div className="text-left">
                <div className="text-sm font-bold text-white">{showRawData ? 'Esconder Dados Brutos' : 'Ver Dados Brutos'}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Inspecionar JSON local</div>
              </div>
            </div>
          </button>

          <button
            onClick={handleClearAll}
            className="w-full flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-2xl hover:bg-red-500/20 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <Trash2 size={20} className="text-red-500" />
              <div className="text-left">
                <div className="text-sm font-bold text-red-500">Limpar Tudo</div>
                <div className="text-[10px] text-red-500/70 uppercase tracking-wider">Apagar permanentemente</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Bulk Import Section */}
      <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5 shadow-lg">
        <div className="flex items-center space-x-4 mb-6">
          <div className="bg-green-500 p-3 rounded-2xl">
            <Database size={24} className="text-[#0f0f0f]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">Importação em Massa</h2>
            <p className="text-xs text-gray-400 font-medium">Importe clientes via planilha</p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleDownloadTemplate}
            className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <Download size={20} className="text-green-400" />
              <div className="text-left">
                <div className="text-sm font-bold text-white">Baixar Modelo</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Modelo Excel para importação</div>
              </div>
            </div>
          </button>

          <label className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors cursor-pointer group">
            <div className="flex items-center space-x-3">
              <Upload size={20} className="text-[#c8a646]" />
              <div className="text-left">
                <div className="text-sm font-bold text-white">Importar Planilha</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Carregar arquivo .xlsx ou .csv</div>
              </div>
            </div>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleImportSpreadsheet} className="hidden" />
          </label>
        </div>
      </div>

      {showRawData && (
        <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/10 overflow-x-auto">
          <pre className="text-[10px] text-gray-400 font-mono">
            {JSON.stringify({ customers, servers, plans, renewals, manualAdditions }, null, 2)}
          </pre>
        </div>
      )}

      {/* Import Preview Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Confirmar Importação"
      >
        <p className="text-gray-400 text-sm mb-6">
          Localizamos {importPreview.length} clientes na sua planilha. Deseja importá-los agora?
        </p>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar mb-8">
          {importPreview.map((c, i) => (
            <div key={i} className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5 flex justify-between items-center text-xs">
              <div>
                <div className="font-bold text-white">{c.name}</div>
                <div className="text-gray-500">{c.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-[#c8a646] font-bold">{formatCurrency(c.amountPaid)}</div>
                <div className="text-gray-500">{format(parseISO(c.dueDate), 'dd/MM/yyyy')}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setIsImportModalOpen(false)}
            className="flex-1 py-4 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-xs"
          >
            Cancelar
          </button>
          <button
            onClick={confirmImport}
            className="flex-1 py-4 rounded-2xl bg-green-500 text-[#0f0f0f] font-bold hover:bg-green-600 transition-colors uppercase tracking-widest text-xs shadow-lg shadow-green-500/20"
          >
            Confirmar
          </button>
        </div>
      </Modal>

      {/* Full History Modal */}
      <Modal
        isOpen={isFullHistoryOpen}
        onClose={() => setIsFullHistoryOpen(false)}
        title="Histórico Completo"
      >
        <div className="flex items-center space-x-2 mb-6">
          <History size={18} className="text-[#c8a646]" />
          <span className="text-gray-400 text-xs uppercase tracking-widest font-bold">
            {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {monthlyStats.transactions.map(tx => (
            <div key={tx.id} className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/5 flex justify-between items-center">
              <div>
                <div className="text-sm text-white font-bold mb-1">{tx.description}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                  {format(parseISO(tx.date), "dd/MM/yyyy 'às' HH:mm")}
                </div>
              </div>
              <div className={`text-base font-black ${tx.type === 'profit' ? 'text-green-400' : 'text-red-400'}`}>
                {tx.type === 'profit' ? '+' : '-'}{formatCurrency(tx.amount)}
              </div>
            </div>
          ))}

          {monthlyStats.transactions.length === 0 && (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">Nenhuma transação encontrada para este mês.</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsFullHistoryOpen(false)}
          className="w-full mt-8 py-4 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-xs"
        >
          Fechar
        </button>
      </Modal>

      <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5 shadow-lg">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center space-x-2">
          <Database size={16} />
          <span>Detalhes Técnicos</span>
        </h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Clientes</span>
            <span className="text-white font-mono">{customers.length}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Servidores</span>
            <span className="text-white font-mono">{servers.length}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Planos</span>
            <span className="text-white font-mono">{plans.length}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Renovações</span>
            <span className="text-white font-mono">{renewals.length}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Adições Manuais</span>
            <span className="text-white font-mono">{manualAdditions.length}</span>
          </div>
          <div class="pt-4 border-t border-white/5 text-[10px] text-gray-600 leading-relaxed">
            Seus dados estão sendo sincronizados com a nuvem (Supabase).
            Isso permite que você acesse suas informações de qualquer dispositivo.
            O botão "Sincronizar com a Nuvem" acima garante que seus dados locais atuais sejam carregados para o servidor.
          </div>
        </div>
      </div>
    </div>
  );
}
