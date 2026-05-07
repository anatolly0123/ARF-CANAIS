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

export const parseRobustLocalTime = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  let str = dateStr.toString().trim();

  // 1. Handle Brazilian DD/MM/YYYY format
  if (str.includes('/')) {
    const parts = str.split(' ')[0].split('/');
    if (parts.length === 3) {
      const day = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const year = Number(parts[2]);
      
      if (str.includes(':')) {
        const timePart = str.split(' ')[1] || '';
        const timeParts = timePart.split(':');
        return new Date(year, month, day, Number(timeParts[0] || 0), Number(timeParts[1] || 0));
      }
      return new Date(year, month, day);
    }
  }

  // 2. Handle ISO strings (Supabase/DB)
  if (str.includes('-')) {
    // If it's a full ISO with UTC indicator (Z)
    if (str.includes('Z')) {
      // If it's exactly midnight UTC (date-only plan), strip 'Z' to force local midnight
      // This prevents the "one day back" bug.
      if (str.includes('T00:00:00')) {
        return new Date(str.replace('Z', ''));
      }
      // For test plans (specific hours), let the browser convert UTC to Local correctly
      return new Date(str);
    }
    
    // For non-Z ISO strings, parse as local
    const parts = str.split('T');
    const dateParts = parts[0].split('-');
    if (dateParts.length === 3) {
      const year = Number(dateParts[0]);
      const month = Number(dateParts[1]) - 1;
      const day = Number(dateParts[2]);
      
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        return new Date(year, month, day, Number(timeParts[0] || 0), Number(timeParts[1] || 0));
      }
      return new Date(year, month, day);
    }
  }

  return new Date(str);
};

export const ensureISO = (dateStr: string) => {
  if (!dateStr) return new Date().toISOString();
  
  // If it already has a timezone indicator (Z or +/-00:00), it's already ISO-compliant
  if (dateStr.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(dateStr)) return dateStr;
  
  // Otherwise, parse as local and generate a LOCAL ISO string (with offset)
  const date = parseRobustLocalTime(dateStr);
  if (isNaN(date.getTime())) return new Date().toISOString();

  // Manually build ISO string with local offset to prevent UTC shifting
  const pad = (n: number) => n.toString().padStart(2, '0');
  const tzo = -date.getTimezoneOffset();
  const dif = tzo >= 0 ? '+' : '-';
  
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${dif}${pad(Math.floor(Math.abs(tzo) / 60))}:${pad(Math.abs(tzo) % 60)}`;
};

export const formatForDateTimeInput = (dateStr: string) => {
  if (!dateStr) return '';
  const date = parseRobustLocalTime(dateStr);
  if (isNaN(date.getTime())) return '';
  return format(date, "yyyy-MM-dd'T'HH:mm");
};

export const formatForDateInput = (dateStr: string) => {
  if (!dateStr) return '';
  const date = parseRobustLocalTime(dateStr);
  if (isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
};

export const isCustomerActive = (dueDateStr: string, isTest: boolean = false) => {
  if (!dueDateStr) return false;

  try {
    const dueDate = parseRobustLocalTime(dueDateStr);
    if (isNaN(dueDate.getTime())) return false;

    const now = new Date();
    
    // For regular plans (not tests), they are ALWAYS active until the end of the day
    if (!isTest) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const dueDateStart = new Date(dueDate);
      dueDateStart.setHours(0, 0, 0, 0);
      
      return dueDateStart.getTime() >= todayStart.getTime();
    }

    // For test plans, we use exact hour/minute precision
    // We add a 1-minute buffer for better UX
    return dueDate.getTime() > (now.getTime() - 60000);
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
  const now = new Date();
  const dueDate = parseRobustLocalTime(data.dueDate);
  const hasTime = data.dueDate.includes(':') || (data.dueDate.includes('T') && data.dueDate.length > 10);

  let formattedDate = 'Data Inválida';
  let daysStr = '';

  if (!isNaN(dueDate.getTime())) {
    if (hasTime) {
      formattedDate = format(dueDate, 'dd/MM/yyyy HH:mm');
      const diffMs = dueDate.getTime() - now.getTime();
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      
      if (diffHours === 0) daysStr = 'agora';
      else if (diffHours > 0) daysStr = `em ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
      else daysStr = `vencido há ${Math.abs(diffHours)} ${Math.abs(diffHours) === 1 ? 'hora' : 'horas'}`;
    } else {
      formattedDate = format(dueDate, 'dd/MM/yyyy');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDateMidnight = new Date(dueDate);
      dueDateMidnight.setHours(0, 0, 0, 0);
      const days = Math.round((dueDateMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      daysStr = days === 1 ? 'hoje' : days === 2 ? 'amanhã' : days < 1 ? `vencido há ${Math.abs(days - 1)} ${Math.abs(days - 1) === 1 ? 'dia' : 'dias'}` : `${days} dias`;
    }
  }

  return template
    .replace('{nome}', data.name)
    .replace('{valor}', formatCurrency(data.amount))
    .replace('{dias}', daysStr)
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
