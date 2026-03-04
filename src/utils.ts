import { format, parseISO, isAfter, differenceInDays } from 'date-fns';

export const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export const parseSafeNumber = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;

  let str = val.toString().trim();

  // Handle Brazilian/European formats (1.200,50 or 1.200)
  // If it has a comma, it's definitely using comma-as-decimal
  if (str.includes(',')) {
    // Remove all dots (thousands) and replace comma with dot
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    // No comma. If it has a dot, it could be thousands (1.200) or decimal (1.2)
    // Most financial apps in Brazil would use . as thousands if there's no comma
    // But this is ambiguous. A safer bet is to see if it's "1.234" (thousands) vs "1.2" (decimal)
    // For this specific admin app, users entry like "1.500" almost always means 1500.
    if (str.includes('.') && str.split('.').pop()?.length !== 2) {
      // If it has a dot but not exactly 2 decimal places? (Fragile heuristic)
      // Let's be more robust: assume dot is thousands IF there are more than 3 digits total
      // Actually, let's just assume if there's a dot, we check the length after it.
      // If user typed 1.500, length is 3. If they typed 10.50, length is 2.
      const parts = str.split('.');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        str = str.replace(/\./g, ''); // 1.500 -> 1500
      }
    }
  }

  // Final cleanup: remove anything not numeric or decimal point
  str = str.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};

export const parseRobustLocalTime = (dateStr: string) => {
  if (!dateStr) return new Date(NaN);
  const str = dateStr.toString();
  // Handle YYYY-MM-DD format (10 chars, has hyphens, no 'T')
  if (str.length === 10 && str.includes('-') && !str.includes('T')) {
    // Replace - with / to force local date interpretation and avoid midnight-UTC-shift-backwards
    return new Date(str.replace(/-/g, '/'));
  }
  return new Date(str);
};

export const isCustomerActive = (dueDateStr: string) => {
  try {
    if (!dueDateStr) return false;
    const dueDate = parseRobustLocalTime(dueDateStr);
    if (isNaN(dueDate.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(dueDate);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate >= today;
  } catch {
    return false;
  }
};

export const formatWhatsappMessage = (
  template: string,
  data: {
    name: string;
    amount: number;
    dueDate: string;
  }
) => {
  const today = new Date();
  const dueDate = parseISO(data.dueDate);
  const days = differenceInDays(dueDate, today);

  let formattedDate = 'Data Inválida';
  try {
    if (!isNaN(dueDate.getTime())) {
      formattedDate = format(dueDate, 'dd/MM/yyyy');
    }
  } catch { }

  return template
    .replace('{nome}', data.name)
    .replace('{valor}', formatCurrency(data.amount))
    .replace('{dias}', days === 0 ? 'hoje' : days === 1 ? 'amanhã' : days < 0 ? `vencido há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}` : `${days} dias`)
    .replace('{vencimento}', formattedDate);
};
export const parseCurrency = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;

  const cleanVal = val.toString()
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace('.', '') // Remove thousands separator
    .replace(',', '.'); // Replace decimal separator

  const parsed = parseFloat(cleanVal);
  return isNaN(parsed) ? 0 : parsed;
};

export const parseExcelDate = (val: any): string => {
  if (!val) return new Date().toISOString();

  // If it's already a Date object (common with cellDates: true)
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString();
    return new Date().toISOString();
  }

  // If it's a number (Excel serial date)
  if (typeof val === 'number') {
    // Excel dates are number of days since 1899-12-30
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString();
  }

  const str = val.toString().trim().replace(/-/g, '/');

  // Handle DD/MM/YYYY or DD/MM/YY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let day = parseInt(parts[0]);
      let month = parseInt(parts[1]);
      let year = parseInt(parts[2]);

      // Handle YY
      if (parts[2].length === 2) {
        year += year > 50 ? 1900 : 2000;
      }

      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Handle YYYY/MM/DD
    const partsISO = str.split('/');
    if (partsISO.length === 3 && partsISO[0].length === 4) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  // Fallback to native parsing
  const d = new Date(str);
  return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
};
