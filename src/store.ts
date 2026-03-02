import { useState, useEffect } from 'react';
import { Server, Plan, Customer, Renewal, ManualAddition } from './types';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PLANS: Plan[] = [
  { id: '0', name: 'Gratuito', defaultPrice: 0, months: 1 },
  { id: '1', name: 'Mensal', defaultPrice: 35, months: 1 },
  { id: '2', name: 'Trimestral', defaultPrice: 90, months: 3 },
  { id: '3', name: 'Semestral', defaultPrice: 160, months: 6 },
  { id: '4', name: 'Anual', defaultPrice: 300, months: 12 },
];

export function useStore() {
  const [servers, setServers] = useState<Server[]>(() => {
    const saved = localStorage.getItem('arf_servers');
    return saved ? JSON.parse(saved) : [];
  });

  const [plans, setPlans] = useState<Plan[]>(() => {
    const saved = localStorage.getItem('arf_plans');
    let parsed = saved ? JSON.parse(saved) : DEFAULT_PLANS;
    if (!parsed.find((p: Plan) => p.name === 'Gratuito')) {
      parsed = [{ id: '0', name: 'Gratuito', defaultPrice: 0, months: 1 }, ...parsed];
    }
    return parsed;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('arf_customers');
    return saved ? JSON.parse(saved) : [];
  });

  const [renewals, setRenewals] = useState<Renewal[]>(() => {
    const saved = localStorage.getItem('arf_renewals');
    return saved ? JSON.parse(saved) : [];
  });

  const [manualAdditions, setManualAdditions] = useState<ManualAddition[]>(() => {
    const saved = localStorage.getItem('arf_manual_additions');
    return saved ? JSON.parse(saved) : [];
  });

  const [whatsappMessage, setWhatsappMessage] = useState<string>(() => {
    const saved = localStorage.getItem('arf_message_v2');
    const defaultMsg = 'Olá *{nome}*! 👋\n\nPassando para lembrar que seu acesso vence em *{dias}* (dia *{vencimento}*).\n\nO valor para renovação é de *{valor}*.\n\nPodemos confirmar sua renovação para garantir que você não fique sem sinal? 😊';
    return saved || defaultMsg;
  });

  const [renewalMessage, setRenewalMessage] = useState<string>(() => {
    const saved = localStorage.getItem('arf_renewal_message');
    const defaultMsg = 'Olá *{nome}*! 👋\n\nSua renovação foi confirmada com sucesso! ✅\n\nSeu novo vencimento é: *{vencimento}*.\n\nObrigado pela confiança! 😊';
    return saved || defaultMsg;
  });

  const [appIcon, setAppIcon] = useState<string | null>(() => {
    return localStorage.getItem('arf_app_icon');
  });

  useEffect(() => {
    localStorage.setItem('arf_servers', JSON.stringify(servers));
  }, [servers]);

  useEffect(() => {
    localStorage.setItem('arf_plans', JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    localStorage.setItem('arf_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('arf_renewals', JSON.stringify(renewals));
  }, [renewals]);

  useEffect(() => {
    localStorage.setItem('arf_manual_additions', JSON.stringify(manualAdditions));
  }, [manualAdditions]);

  useEffect(() => {
    localStorage.setItem('arf_renewal_message', renewalMessage);
  }, [renewalMessage]);

  useEffect(() => {
    localStorage.setItem('arf_message_v2', whatsappMessage);
  }, [whatsappMessage]);

  useEffect(() => {
    if (appIcon) {
      localStorage.setItem('arf_app_icon', appIcon);
    } else {
      localStorage.removeItem('arf_app_icon');
    }
  }, [appIcon]);

  // Server Actions
  const addServer = (server: Omit<Server, 'id'>) => {
    setServers(prev => [...prev, { ...server, id: uuidv4() }]);
  };
  const updateServer = (id: string, data: Partial<Server>) => {
    setServers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };
  const deleteServer = (id: string) => {
    setServers(prev => prev.filter(s => s.id !== id));
  };

  // Plan Actions
  const updatePlan = (id: string, defaultPrice: number) => {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, defaultPrice } : p));
  };

  // Customer Actions
  const addCustomer = (customer: Customer) => {
    setCustomers(prev => [...prev, customer]);
  };
  const updateCustomer = (id: string, data: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  };
  const deleteCustomer = (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  const bulkUpdateCustomers = (updater: (prev: Customer[]) => Customer[]) => {
    setCustomers(prev => updater(prev));
  };

  const bulkUpdateServers = (newServers: Server[]) => {
    setServers(newServers);
  };

  const bulkUpdatePlans = (newPlans: Plan[]) => {
    setPlans(newPlans);
  };

  const addRenewal = (renewal: Omit<Renewal, 'id'>) => {
    setRenewals(prev => [...prev, { ...renewal, id: uuidv4() }]);
  };

  const bulkUpdateRenewals = (newRenewals: Renewal[]) => {
    setRenewals(newRenewals);
  };

  const addManualAddition = (addition: Omit<ManualAddition, 'id'>) => {
    setManualAdditions(prev => [...prev, { ...addition, id: uuidv4() }]);
  };

  const bulkUpdateManualAdditions = (newAdditions: ManualAddition[]) => {
    setManualAdditions(newAdditions);
  };

  return {
    servers, addServer, updateServer, deleteServer, bulkUpdateServers,
    plans, updatePlan, bulkUpdatePlans,
    customers, addCustomer, updateCustomer, deleteCustomer, bulkUpdateCustomers,
    renewals, addRenewal, bulkUpdateRenewals,
    manualAdditions, addManualAddition, bulkUpdateManualAdditions,
    whatsappMessage, setWhatsappMessage,
    renewalMessage, setRenewalMessage,
    appIcon, setAppIcon
  };
}


