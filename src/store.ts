import { useState, useEffect } from 'react';
import { Server, Plan, Customer, Renewal, ManualAddition } from './types';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';

const DEFAULT_PLANS: Plan[] = [
  { id: '702330a6-168a-4933-9114-1ce5d2f63f53', name: 'Gratuito', defaultPrice: 0, months: 1 },
  { id: '9609a562-b13c-41c3-8820-2f9540b61545', name: 'Mensal', defaultPrice: 35, months: 1 },
  { id: '47d7c672-9657-4f40-84a1-0bd7299a4e32', name: 'Trimestral', defaultPrice: 90, months: 3 },
  { id: '628b031b-7538-4f6c-843c-6cb76e22c9e3', name: 'Semestral', defaultPrice: 160, months: 6 },
  { id: '2c5a2bc9-f538-43d9-95e5-f55a15998f82', name: 'Anual', defaultPrice: 300, months: 12 },
];

const PLAN_ID_MAP: Record<string, string> = {
  '0': '702330a6-168a-4933-9114-1ce5d2f63f53',
  '1': '9609a562-b13c-41c3-8820-2f9540b61545',
  '2': '47d7c672-9657-4f40-84a1-0bd7299a4e32',
  '3': '628b031b-7538-4f6c-843c-6cb76e22c9e3',
  '4': '2c5a2bc9-f538-43d9-95e5-f55a15998f82',
};

export function useStore(user: User | null) {
  const [loading, setLoading] = useState(true);

  const [servers, setServers] = useState<Server[]>(() => {
    const saved = localStorage.getItem('arf_servers');
    return saved ? JSON.parse(saved) : [];
  });

  const [plans, setPlans] = useState<Plan[]>(() => {
    const saved = localStorage.getItem('arf_plans');
    let parsed = saved ? JSON.parse(saved) : DEFAULT_PLANS;
    // Migrate old numeric IDs to UUIDs
    parsed = parsed.map((p: Plan) => ({
      ...p,
      id: PLAN_ID_MAP[p.id] || p.id
    }));
    if (!parsed.find((p: Plan) => p.name === 'Gratuito')) {
      parsed = [{ id: '702330a6-168a-4933-9114-1ce5d2f63f53', name: 'Gratuito', defaultPrice: 0, months: 1 }, ...parsed];
    }
    return parsed;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('arf_customers');
    const parsed = saved ? JSON.parse(saved) : [];
    // Migrate old numeric plan IDs in customers
    return parsed.map((c: Customer) => ({
      ...c,
      planId: PLAN_ID_MAP[c.planId] || c.planId
    }));
  });

  const [renewals, setRenewals] = useState<Renewal[]>(() => {
    const saved = localStorage.getItem('arf_renewals');
    const parsed = saved ? JSON.parse(saved) : [];
    // Migrate old numeric plan IDs in renewals
    return parsed.map((r: Renewal) => ({
      ...r,
      planId: PLAN_ID_MAP[r.planId] || r.planId
    }));
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

  // Initial load from Supabase
  useEffect(() => {
    async function loadData() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const [
          { data: serversData },
          { data: plansData },
          { data: customersData },
          { data: renewalsData },
          { data: additionsData },
          { data: settingsData }
        ] = await Promise.all([
          supabase.from('servers').select('*').order('name'),
          supabase.from('plans').select('*').order('months'),
          supabase.from('customers').select('*').order('name'),
          supabase.from('renewals').select('*').order('date', { ascending: false }),
          supabase.from('manual_additions').select('*').order('date', { ascending: false }),
          supabase.from('settings').select('*').single()
        ]);

        if (serversData && serversData.length > 0) setServers(serversData.map((s: any) => ({ ...s, costPerActive: Number(s.cost_per_active) })));
        if (plansData && plansData.length > 0) setPlans(plansData.map((p: any) => ({ ...p, defaultPrice: Number(p.default_price) })));
        if (customersData && customersData.length > 0) setCustomers(customersData.map((c: any) => ({ ...c, serverId: c.server_id, planId: c.plan_id, amountPaid: Number(c.amount_paid), dueDate: c.due_date, lastNotifiedDate: c.last_notified_date })));
        if (renewalsData && renewalsData.length > 0) setRenewals(renewalsData.map((r: any) => ({ ...r, customerId: r.customer_id, serverId: r.server_id, planId: r.plan_id, amount: Number(r.amount), cost: Number(r.cost) })));
        if (additionsData && additionsData.length > 0) setManualAdditions(additionsData.map((a: any) => ({ ...a, amount: Number(a.amount) })));

        if (settingsData) {
          if (settingsData.whatsapp_message) setWhatsappMessage(settingsData.whatsapp_message);
          if (settingsData.renewal_message) setRenewalMessage(settingsData.renewal_message);
          if (settingsData.app_icon) setAppIcon(settingsData.app_icon);
        }
      } catch (error) {
        console.error('Error loading data from Supabase:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  // Server Actions
  const addServer = async (server: Omit<Server, 'id'>) => {
    const newServer = { ...server, id: uuidv4() };
    setServers(prev => [...prev, newServer]);
    if (user) {
      await supabase.from('servers').insert({
        id: newServer.id,
        name: newServer.name,
        cost_per_active: newServer.costPerActive,
        user_id: user.id
      });
    }
  };

  const updateServer = async (id: string, data: Partial<Server>) => {
    setServers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    if (user) {
      const updateData: any = {};
      if (data.name) updateData.name = data.name;
      if (data.costPerActive !== undefined) updateData.cost_per_active = data.costPerActive;
      await supabase.from('servers').update(updateData).eq('id', id);
    }
  };

  const deleteServer = async (id: string) => {
    setServers(prev => prev.filter(s => s.id !== id));
    if (user) {
      await supabase.from('servers').delete().eq('id', id);
    }
  };

  // Plan Actions
  const updatePlan = async (id: string, defaultPrice: number) => {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, defaultPrice } : p));
    if (user) {
      await supabase.from('plans').update({ default_price: defaultPrice }).eq('id', id);
    }
  };

  // Customer Actions
  const addCustomer = async (customer: Customer) => {
    setCustomers(prev => [...prev, customer]);
    if (user) {
      await supabase.from('customers').insert({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        server_id: customer.serverId,
        plan_id: customer.planId,
        amount_paid: customer.amountPaid,
        due_date: customer.dueDate,
        user_id: user.id
      });
    }
  };

  const updateCustomer = async (id: string, data: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    if (user) {
      const updateData: any = {};
      if (data.name) updateData.name = data.name;
      if (data.phone) updateData.phone = data.phone;
      if (data.serverId) updateData.server_id = data.serverId;
      if (data.planId) updateData.plan_id = data.planId;
      if (data.amountPaid !== undefined) updateData.amount_paid = data.amountPaid;
      if (data.dueDate) updateData.due_date = data.dueDate;
      if (data.lastNotifiedDate) updateData.last_notified_date = data.lastNotifiedDate;
      await supabase.from('customers').update(updateData).eq('id', id);
    }
  };

  const deleteCustomer = async (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    if (user) {
      await supabase.from('customers').delete().eq('id', id);
    }
  };

  const bulkUpdateCustomers = async (updater: (prev: Customer[]) => Customer[]) => {
    setCustomers(prev => {
      const next = updater(prev);
      // Bulk update in background if needed, but usually used for imports
      return next;
    });
  };

  const addRenewal = async (renewal: Omit<Renewal, 'id'>) => {
    const newRenewal = { ...renewal, id: uuidv4() };
    setRenewals(prev => [...prev, newRenewal]);
    if (user) {
      await supabase.from('renewals').insert({
        id: newRenewal.id,
        customer_id: newRenewal.customerId,
        server_id: newRenewal.serverId,
        plan_id: newRenewal.planId,
        amount: newRenewal.amount,
        cost: newRenewal.cost,
        date: newRenewal.date,
        user_id: user.id
      });
    }
  };

  const addManualAddition = async (addition: Omit<ManualAddition, 'id'>) => {
    const newAddition = { ...addition, id: uuidv4() };
    setManualAdditions(prev => [...prev, newAddition]);
    if (user) {
      await supabase.from('manual_additions').insert({
        id: newAddition.id,
        amount: newAddition.amount,
        date: newAddition.date,
        description: newAddition.description,
        user_id: user.id
      });
    }
  };

  // Settings sync
  useEffect(() => {
    if (!user || loading) return;
    const syncSettings = async () => {
      await supabase.from('settings').upsert({
        user_id: user.id,
        whatsapp_message: whatsappMessage,
        renewal_message: renewalMessage,
        app_icon: appIcon
      }, { onConflict: 'user_id' });
    };
    const timer = setTimeout(syncSettings, 1000);
    return () => clearTimeout(timer);
  }, [whatsappMessage, renewalMessage, appIcon, user, loading]);

  // Local Storage Cache sync
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

  const bulkUpdateServers = (newServers: Server[]) => setServers(newServers);
  const bulkUpdatePlans = (newPlans: Plan[]) => setPlans(newPlans);
  const bulkUpdateRenewals = (newRenewals: Renewal[]) => setRenewals(newRenewals);
  const bulkUpdateManualAdditions = (newAdditions: ManualAddition[]) => setManualAdditions(newAdditions);

  const syncToCloud = async (overrideData?: {
    servers?: Server[];
    plans?: Plan[];
    customers?: Customer[];
    renewals?: Renewal[];
    manualAdditions?: ManualAddition[];
    settings?: {
      whatsappMessage?: string;
      renewalMessage?: string;
      appIcon?: string | null;
    };
  }, clearFirst: boolean = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const dataToSync = {
        servers: overrideData?.servers || servers,
        plans: overrideData?.plans || plans,
        customers: overrideData?.customers || customers,
        renewals: overrideData?.renewals || renewals,
        manualAdditions: overrideData?.manualAdditions || manualAdditions,
        settings: {
          whatsappMessage: overrideData?.settings?.whatsappMessage ?? whatsappMessage,
          renewalMessage: overrideData?.settings?.renewalMessage ?? renewalMessage,
          appIcon: overrideData?.settings?.appIcon ?? appIcon,
        }
      };

      if (clearFirst) {
        console.log('Cleaning cloud data before sync...');
        await Promise.all([
          supabase.from('servers').delete().eq('user_id', user.id),
          supabase.from('plans').delete().eq('user_id', user.id),
          supabase.from('customers').delete().eq('user_id', user.id),
          supabase.from('renewals').delete().eq('user_id', user.id),
          supabase.from('manual_additions').delete().eq('user_id', user.id),
        ]);
      }

      // 1. Sync Settings
      console.log('Syncing settings...');
      await supabase.from('settings').upsert({
        user_id: user.id,
        whatsapp_message: dataToSync.settings.whatsappMessage,
        renewal_message: dataToSync.settings.renewalMessage,
        app_icon: dataToSync.settings.appIcon
      }, { onConflict: 'user_id' });

      // 2. Sync Servers
      if (dataToSync.servers.length > 0) {
        console.log('Syncing servers...');
        const { error } = await supabase.from('servers').upsert(dataToSync.servers.map(s => ({
          id: s.id,
          name: s.name,
          cost_per_active: s.costPerActive,
          user_id: user.id
        })));
        if (error) throw error;
      }

      // 3. Sync Plans
      if (dataToSync.plans.length > 0) {
        console.log('Syncing plans...');
        const { error } = await supabase.from('plans').upsert(dataToSync.plans.map(p => ({
          id: p.id,
          name: p.name,
          default_price: p.defaultPrice,
          months: p.months,
          user_id: user.id
        })));
        if (error) throw error;
      }

      // 4. Sync Customers
      if (dataToSync.customers.length > 0) {
        console.log('Syncing customers...');
        const { error } = await supabase.from('customers').upsert(dataToSync.customers.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          server_id: c.serverId,
          plan_id: c.planId,
          amount_paid: c.amountPaid,
          due_date: c.dueDate,
          last_notified_date: c.lastNotifiedDate,
          user_id: user.id
        })));
        if (error) throw error;
      }

      // 5. Sync Renewals
      if (dataToSync.renewals.length > 0) {
        console.log('Syncing renewals...');
        const { error } = await supabase.from('renewals').upsert(dataToSync.renewals.map(r => ({
          id: r.id,
          customer_id: r.customerId,
          server_id: r.serverId,
          plan_id: r.planId,
          amount: r.amount,
          cost: r.cost,
          date: r.date,
          user_id: user.id
        })));
        if (error) throw error;
      }

      // 6. Sync Manual Additions
      if (dataToSync.manualAdditions.length > 0) {
        console.log('Syncing additions...');
        const { error } = await supabase.from('manual_additions').upsert(dataToSync.manualAdditions.map(a => ({
          id: a.id,
          amount: a.amount,
          date: a.date,
          description: a.description,
          user_id: user.id
        })));
        if (error) throw error;
      }

      alert('Sincronização concluída com sucesso!');
    } catch (error: any) {
      console.error('Error syncing to cloud:', error);
      alert('Erro ao sincronizar: ' + (error.message || 'Ocorreu um erro inesperado.'));
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    servers, addServer, updateServer, deleteServer, bulkUpdateServers,
    plans, updatePlan, bulkUpdatePlans,
    customers, addCustomer, updateCustomer, deleteCustomer, bulkUpdateCustomers,
    renewals, addRenewal, bulkUpdateRenewals,
    manualAdditions, addManualAddition, bulkUpdateManualAdditions,
    whatsappMessage, setWhatsappMessage,
    renewalMessage, setRenewalMessage,
    appIcon, setAppIcon,
    syncToCloud: syncToCloud as (overrideData?: any, clearFirst?: boolean) => Promise<void>
  };
}


