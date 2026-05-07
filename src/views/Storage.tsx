import { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Database, Download, Upload, Trash2, HardDrive, Calendar as CalendarIcon, TrendingUp, TrendingDown, DollarSign, Image as ImageIcon, History, FileSpreadsheet } from 'lucide-react';
import { Customer, Server, Plan, Renewal, ManualAddition, UserRole } from '../types';
import { DataDiagnostics } from '../store';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency, parseCurrency, parseExcelDate, parseSafeNumber, parseRobustLocalTime, isCustomerActive } from '../utils';
import { Modal } from '../components/Modal';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';

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
  appCover: string | null;
  setAppCover: (cover: string | null) => void;
  syncToCloud: (data?: any, clearFirst?: boolean) => Promise<void>;
  userRole: UserRole;
  diagnostics: DataDiagnostics;
}

const compressImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
};

export function Storage({ customers, servers, plans, renewals, manualAdditions, bulkUpdateCustomers, setServers, setPlans, setRenewals, setManualAdditions, appIcon, setAppIcon, appCover, setAppCover, syncToCloud, userRole, diagnostics }: StorageProps) {
  const [storageSize, setStorageSize] = useState<string>('0 KB');
  const [isFullHistoryOpen, setIsFullHistoryOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<Customer[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      appCover,
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
        if (json.appCover) {
          setAppCover(json.appCover);
        }

        if (confirm('Backup restaurado localmente com sucesso! Deseja enviar esses dados para a nuvem agora? Isso substituirá os dados que já estão lá.')) {
          syncToCloud({
            customers: json.customers,
            servers: json.servers,
            plans: json.plans,
            renewals: json.renewals,
            manualAdditions: json.manualAdditions,
            settings: {
              appIcon: json.appIcon,
              appCover: json.appCover
            }
          }, true); // Clear cloud first for a clean restore
        }
        else {
          alert('Backup restaurado localmente.');
        }
      } catch (err) {
        alert('Erro ao importar backup. Verifique o arquivo.');
      }
    };
    reader.readAsText(file);
  };
  
  const handleExportTransactions = () => {
    const data = monthlyStats.transactions.map(tx => ({
      'Data': format(parseISO(tx.date), "dd/MM/yyyy HH:mm"),
      'Descrição': tx.description,
      'Entrada (R$)': tx.type === 'profit' ? tx.amount : 0,
      'Saída (R$)': tx.type === 'expense' ? tx.amount : 0,
      'Tipo': tx.type === 'profit' ? 'Receita' : 'Custo'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transações");
    
    const fileName = `relatorio_transacoes_${format(selectedMonth, 'MM_yyyy')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };
  
  const handleExportCustomerListExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Lista de Clientes');

    // Headers
    worksheet.columns = [
      { header: 'NOME', key: 'name', width: 30 },
      { header: 'SERVIDOR', key: 'serverName', width: 20 },
      { header: 'VENCIMENTO', key: 'dueDate', width: 15 },
      { header: 'ENTRADA', key: 'entrada', width: 15 },
      { header: 'CUSTO SRV', key: 'custo', width: 15 },
      { header: 'SAÍDA', key: 'saida', width: 15 },
      { header: 'PAGAMENTO', key: 'pagamento', width: 15 },
    ];

    // Style Headers
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1A1A' } // Dark background for header
      };
      cell.alignment = { horizontal: 'center' };
    });

    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());

    const activeCustomers = customers.filter(c => {
      const plan = plans.find(p => p.id === c.planId);
      const isTest = plan?.name?.toLowerCase().includes('teste');
      const isActive = isCustomerActive(c.dueDate, isTest);
      return isActive && !isTest;
    });

    activeCustomers.forEach(c => {
      const server = servers.find(s => s.id === c.serverId);
      
      const hasPaidThisMonth = renewals.some(r => {
        const rCustomerId = r.customerId || (r as any).customer_id;
        if (rCustomerId?.toString() !== c.id.toString()) return false;
        
        try {
          const rDate = parseRobustLocalTime(r.date || (r as any).date || (r as any).created_at);
          return isWithinInterval(rDate, { start, end });
        } catch {
          return false;
        }
      });

      const row = worksheet.addRow({
        name: c.name,
        serverName: server?.name || 'N/A',
        dueDate: format(parseRobustLocalTime(c.dueDate), 'dd/MM/yyyy'),
        entrada: c.amountPaid,
        custo: server?.costPerActive || 0,
        saida: 0,
        pagamento: hasPaidThisMonth ? 'PAGO' : 'NÃO PAGO'
      });

      // Apply Colors as requested
      // Column D: ENTRADA (Green)
      row.getCell(4).font = { color: { argb: 'FF228B22' }, bold: true }; // Forest Green
      
      // Column E: CUSTO SRV (Blue)
      row.getCell(5).font = { color: { argb: 'FF0000FF' }, bold: true }; // Blue
      
      // Column F: SAÍDA (Red)
      row.getCell(6).font = { color: { argb: 'FFFF0000' }, bold: true }; // Red
      
      // Column G: PAGAMENTO (Conditional)
      const payCell = row.getCell(7);
      if (hasPaidThisMonth) {
          payCell.font = { color: { argb: 'FF228B22' }, bold: true };
      } else {
          payCell.font = { color: { argb: 'FFFF0000' }, bold: true };
      }
      
      // Formatting cells as currency-like numbers
      row.getCell(4).numFmt = '"R$ "#,##0.00';
      row.getCell(5).numFmt = '"R$ "#,##0.00';
      row.getCell(6).numFmt = '"R$ "#,##0.00';
      
      row.getCell(7).alignment = { horizontal: 'center' };
    });

    const range = activeCustomers.length + 1; // Last data row
    
    // Summary Row
    worksheet.addRow([]); // Spacer
    const totalRow = worksheet.addRow([
      'TOTAL LÍQUIDO:',
      '',
      '',
      { formula: `SUMIF(G2:G${range}, "PAGO", D2:D${range}) - SUM(E2:E${range}) - SUM(F2:F${range})` }
    ]);
    
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(4).font = { bold: true, color: { argb: 'FF000000' } };
    totalRow.getCell(4).numFmt = '"R$ "#,##0.00';

    // Generate and Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista_clientes_ativos_${format(new Date(), 'dd_MM_yyyy')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    if (confirm('TEM CERTEZA? Isso apagará TODOS os seus dados (Clientes, Servidores e Planos). Esta ação não pode ser desfeita.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleIconUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 256, 256);
        setAppIcon(compressed);
      } catch (err) {
        console.error('Error compressing icon:', err);
      }
    }
  };

  const handleCoverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 1200, 630);
        setAppCover(compressed);
      } catch (err) {
        console.error('Error compressing cover:', err);
      }
    }
  };

  const [showRawData, setShowRawData] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const monthlyStats = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);

    const monthRenewals = renewals.filter(r => {
      const dateStr = r.date || (r as any).date || (r as any).created_at;
      if (!dateStr) return false;
      try {
        const rDate = parseRobustLocalTime(dateStr);
        if (isNaN(rDate.getTime())) return false;
        return isWithinInterval(rDate, { start, end });
      } catch {
        return false;
      }
    });

    const monthAdditions = manualAdditions.filter(a => {
      const dateStr = a.date || (a as any).date || (a as any).created_at;
      if (!dateStr) return false;
      try {
        const aDate = parseRobustLocalTime(dateStr);
        if (isNaN(aDate.getTime())) return false;
        return isWithinInterval(aDate, { start, end });
      } catch {
        return false;
      }
    });

    const gross = monthRenewals.reduce((acc, r) => {
      const plan = plans.find(p => p.id === (r.planId || (r as any).plan_id));
      const months = plan ? plan.months : 1;
      return acc + (parseSafeNumber(r.amount || (r as any).amount) / months);
    }, 0) +
      monthAdditions.filter(a => parseSafeNumber(a.amount || (a as any).amount) > 0).reduce((acc, a) => acc + parseSafeNumber(a.amount || (a as any).amount), 0);

    const cost = monthRenewals.reduce((acc, r) => {
      const plan = plans.find(p => p.id === (r.planId || (r as any).plan_id));
      const months = plan ? plan.months : 1;
      return acc + (parseSafeNumber(r.cost || (r as any).cost) / months);
    }, 0) +
      Math.abs(monthAdditions.filter(a => parseSafeNumber(a.amount || (a as any).amount) < 0).reduce((acc, a) => acc + parseSafeNumber(a.amount || (a as any).amount), 0));

    const transactions: { id: string; date: string; description: string; amount: number; type: 'profit' | 'expense' }[] = [];

    monthRenewals.forEach(r => {
      const rCustomerId = r.customerId || (r as any).customer_id;
      const customer = customers.find(c => c.id.toString() === rCustomerId?.toString());
      const customerName = customer ? customer.name : 'Cliente Excluído';

      const plan = plans.find(p => p.id === (r.planId || (r as any).plan_id));
      const months = plan ? plan.months : 1;

      const amount = parseSafeNumber(r.amount || (r as any).amount) / months;
      const cost = parseSafeNumber(r.cost || (r as any).cost) / months;
      const rDate = r.date || (r as any).date || (r as any).created_at || new Date().toISOString();

      if (amount > 0) {
        transactions.push({
          id: `ren - gross - ${r.id || Math.random()} `,
          date: rDate,
          description: `Renovação: ${customerName} `,
          amount: amount,
          type: 'profit'
        });
      }
      if (cost > 0) {
        transactions.push({
          id: `ren - cost - ${r.id || Math.random()} `,
          date: rDate,
          description: `Custo Servidor: ${customerName} `,
          amount: cost,
          type: 'expense'
        });
      }
    });

    monthAdditions.forEach(a => {
      const amount = parseSafeNumber(a.amount || (a as any).amount);
      const aDate = a.date || (a as any).date || (a as any).created_at || new Date().toISOString();

      if (amount > 0) {
        transactions.push({
          id: `add - ${a.id || Math.random()} `,
          date: aDate,
          description: a.description || 'Adição manual',
          amount: amount,
          type: 'profit'
        });
      } else if (amount < 0) {
        transactions.push({
          id: `add - ${a.id || Math.random()} `,
          date: aDate,
          description: a.description || 'Remoção manual',
          amount: Math.abs(amount),
          type: 'expense'
        });
      }
    });

    transactions.sort((a, b) => {
      try {
        const dateA = parseRobustLocalTime(a.date).getTime();
        const dateB = parseRobustLocalTime(b.date).getTime();

        const diff = (dateB || 0) - (dateA || 0);
        if (diff === 0) {
          // If timestamps are exactly equal (like midnight), break tie by ID 
          // to ensure deterministic rendering and prevent UI freezing old items on top.
          return b.id.localeCompare(a.id);
        }
        return diff;
      } catch {
        return 0;
      }
    });

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
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleExportTransactions}
                  className="flex items-center space-x-1 text-[10px] text-green-500 font-bold uppercase tracking-widest hover:underline"
                >
                  <Download size={12} />
                  <span>Exportar Excel</span>
                </button>
                <button
                  onClick={() => setIsFullHistoryOpen(true)}
                  className="text-[10px] text-[#c8a646] font-bold uppercase tracking-widest hover:underline"
                >
                  Ver Todos
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {monthlyStats.transactions.slice(0, 5).map(tx => (
                <div key={tx.id} className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5 flex justify-between items-center">
                  <div>
                    <div className="text-sm text-white font-medium">{tx.description}</div>
                    <div className="text-[10px] text-gray-500">{format(parseISO(tx.date), "dd/MM/yyyy 'às' HH:mm")}</div>
                  </div>
                  <div className={`text - sm font - bold ${tx.type === 'profit' ? 'text-green-400' : 'text-red-400'} `}>
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

        <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 flex items-center justify-between mb-4">
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

        <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
              {appCover ? (
                <img src={appCover} alt="App Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="text-3xl font-black text-white/20">C</div>
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-white">Capa do App</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Splash Screen / Share</div>
            </div>
          </div>
          <div className="flex space-x-2">
            {appCover && (
              <button
                onClick={() => setAppCover(null)}
                className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors"
                title="Resetar para o padrão"
              >
                <Trash2 size={20} />
              </button>
            )}
            <label className="p-3 bg-[#c8a646] text-[#0f0f0f] rounded-xl hover:bg-[#e8c666] transition-colors cursor-pointer shadow-lg shadow-[#c8a646]/20">
              <Upload size={20} />
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
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
            onClick={() => {
              const overwrite = confirm('Deseja substituir COMPLETAMENTE os dados da nuvem pelos seus dados locais atuais? (Se escolher "Cancelar", o sistema tentará apenas atualizar os registros sem apagar nada da nuvem).');
              syncToCloud(undefined, overwrite);
            }}
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

          <button
            onClick={handleExportCustomerListExcel}
            className="w-full flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-2xl hover:bg-green-500/20 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <FileSpreadsheet size={20} className="text-green-500" />
              <div className="text-left">
                <div className="text-sm font-bold text-green-500">Exportar Lista (Excel)</div>
                <div className="text-[10px] text-green-500/70 uppercase tracking-wider">Lista de clientes com fórmulas financeiras</div>
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
            onClick={() => {
              if (confirm('Deseja resetar os tempos de aviso de TODOS os clientes? Isso liberará todos os botões de notificação imediatamente.')) {
                const updatedCustomers = customers.map(c => ({
                  ...c,
                  lastNotifiedDate: undefined,
                  lastOverdueNotifiedDate: undefined
                }));
                
                bulkUpdateCustomers(() => updatedCustomers);
                alert('Tempos de aviso resetados com sucesso! Sincronizando com a nuvem...');
                syncToCloud({ customers: updatedCustomers });
              }
            }}
            className="w-full flex items-center justify-between p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl hover:bg-yellow-500/20 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <History size={20} className="text-yellow-500" />
              <div className="text-left">
                <div className="text-sm font-bold text-yellow-500">Resetar Tempos de Aviso</div>
                <div className="text-[10px] text-yellow-500/70 uppercase tracking-wider">Libera os botões de notificação de todos</div>
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
              <div className={`text - base font - black ${tx.type === 'profit' ? 'text-green-400' : 'text-red-400'} `}>
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
          <span>Detalhes Técnicos & Diagnóstico</span>
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5">
              <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Carga Básica (Fase 1)</div>
              <div className={`text-sm font-bold ${diagnostics.phase1Time && diagnostics.phase1Time > 2000 ? 'text-red-400' : 'text-green-400'}`}>
                {diagnostics.phase1Time ? `${diagnostics.phase1Time}ms` : '---'}
              </div>
            </div>
            <div className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5">
              <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Carga Dados (Fase 2)</div>
              <div className={`text-sm font-bold ${diagnostics.phase2Time && diagnostics.phase2Time > 5000 ? 'text-red-400' : 'text-green-400'}`}>
                {diagnostics.phase2Time ? `${diagnostics.phase2Time}ms` : '---'}
              </div>
            </div>
          </div>

          <div className="bg-[#0f0f0f] p-3 rounded-xl border border-white/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] uppercase tracking-wider text-gray-500">Peso das Configurações</span>
              {diagnostics.settingsSize && diagnostics.settingsSize > 500000 && (
                <span className="text-[9px] bg-red-500/20 text-red-500 px-1 rounded font-bold">PESADO</span>
              )}
            </div>
            <div className="text-sm font-bold text-white">
              {diagnostics.settingsSize ? `${(diagnostics.settingsSize / 1024).toFixed(2)} KB` : '---'}
            </div>
            <div className="text-[9px] text-gray-600 mt-1 italic">
              *Ícones e capas grandes aumentam muito este valor.
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">Registros Totais</span>
              <span className="text-white font-mono">{customers.length + servers.length + plans.length + renewals.length + manualAdditions.length}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">Última Sincronização</span>
              <span className="text-white font-mono text-[10px]">
                {diagnostics.lastSync ? format(parseISO(diagnostics.lastSync), "HH:mm:ss") : 'Nunca'}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 text-[10px] text-gray-600 leading-relaxed bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
            <p className="font-bold text-blue-400 mb-1">DICA DE PERFORMANCE:</p>
            Se o "Peso das Configurações" estiver alto (mais de 500KB), tente carregar novamente o ícone ou a capa do app. 
            Eu adicionei um compressor automático que deixará as imagens muito mais leves ao serem salvas novamente.
          </div>
        </div>
      </div>
    </div>
  );
}
