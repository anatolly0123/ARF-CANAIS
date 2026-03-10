import { useState, useEffect } from 'react';
import { Server, Plan, Customer, Renewal, ManualAddition } from './types';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { formatCurrency, isCustomerActive, parseSafeNumber } from './utils';

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
    // Migrate old numeric plan IDs and ensure property names (serverId, planId)
    return parsed.map((c: any) => ({
      ...c,
      id: (c.id || '').toString(),
      name: c.name || 'Sem Nome',
      phone: (c.phone || '').toString(),
      serverId: (c.serverId || c.server_id || '').toString(),
      planId: (PLAN_ID_MAP[c.planId] || c.planId || c.plan_id || '').toString(),
      amountPaid: parseSafeNumber(c.amount_paid ?? c.amountPaid),
      dueDate: c.dueDate || c.due_date || new Date().toISOString(),
      lastNotifiedDate: c.lastNotifiedDate || c.last_notified_date,
      lastOverdueNotifiedDate: c.lastOverdueNotifiedDate || c.last_overdue_notified_date
    }));
  });

  const [renewals, setRenewals] = useState<Renewal[]>(() => {
    const saved = localStorage.getItem('arf_renewals');
    const parsed = saved ? JSON.parse(saved) : [];
    // Migrate old IDs, property names (customerId, serverId, planId) and ensure numeric amounts
    return parsed.map((r: any) => ({
      ...r,
      customerId: (r.customerId || r.customer_id || '').toString(),
      serverId: (r.serverId || r.server_id || '').toString(),
      planId: (PLAN_ID_MAP[r.planId] || r.planId || r.plan_id || '').toString(),
      amount: Number(r.amount || 0),
      cost: Number(r.cost || 0)
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
  const [appCover, setAppCover] = useState<string | null>(() => {
    return localStorage.getItem('arf_app_cover');
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

        if (serversData && serversData.length > 0) {
          setServers(serversData.map((s: any) => ({
            id: s.id?.toString() || '',
            name: s.name || 'Sem Nome',
            costPerActive: parseSafeNumber(s.cost_per_active ?? s.costPerActive)
          })));
        }
        if (plansData && plansData.length > 0) {
          setPlans(plansData.map((p: any) => ({
            id: p.id?.toString() || '',
            name: p.name || 'Plano',
            defaultPrice: parseSafeNumber(p.default_price ?? p.defaultPrice),
            months: Number(p.months ?? 1)
          })));
        }
        if (customersData && customersData.length > 0) {
          setCustomers(customersData.map((c: any) => ({
            id: c.id?.toString() || '',
            name: c.name || 'Sem Nome',
            phone: c.phone || '',
            serverId: (c.server_id || c.serverId || '').toString(),
            planId: (PLAN_ID_MAP[c.plan_id] || PLAN_ID_MAP[c.planId] || c.plan_id || c.planId || '').toString(),
            amountPaid: parseSafeNumber(c.amount_paid ?? c.amountPaid),
            dueDate: c.due_date || c.dueDate || new Date().toISOString(),
            lastNotifiedDate: c.last_not_date || c.last_notified_date || c.lastNotifiedDate,
            lastOverdueNotifiedDate: c.last_overdue_not_date || c.last_overdue_notified_date || c.lastOverdueNotifiedDate
          })));
        }
        if (renewalsData && renewalsData.length > 0) {
          setRenewals(renewalsData.map((r: any) => ({
            id: r.id?.toString() || '',
            customerId: (r.customer_id || r.customerId || '').toString(),
            serverId: (r.server_id || r.serverId || '').toString(),
            planId: (PLAN_ID_MAP[r.plan_id] || PLAN_ID_MAP[r.planId] || r.plan_id || r.planId || '').toString(),
            amount: parseSafeNumber(r.amount ?? (r as any).amount),
            cost: parseSafeNumber(r.cost ?? (r as any).cost),
            date: r.date || r.created_at || new Date().toISOString()
          })));
        }
        if (additionsData && additionsData.length > 0) {
          setManualAdditions(additionsData.map((a: any) => ({
            id: a.id?.toString() || '',
            amount: parseSafeNumber(a.amount ?? (a as any).amount),
            date: a.date || a.created_at || new Date().toISOString(),
            description: a.description || ''
          })));
        }

        if (settingsData) {
          if (settingsData.whatsapp_message || (settingsData as any).whatsappMessage) setWhatsappMessage(settingsData.whatsapp_message || (settingsData as any).whatsappMessage);
          if (settingsData.renewal_message || (settingsData as any).renewalMessage) setRenewalMessage(settingsData.renewal_message || (settingsData as any).renewalMessage);
          if (settingsData.app_icon || (settingsData as any).appIcon) setAppIcon(settingsData.app_icon || (settingsData as any).appIcon);
          if (settingsData.app_cover || (settingsData as any).appCover) setAppCover(settingsData.app_cover || (settingsData as any).appCover);
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
  const addCustomer = async (customer: Customer): Promise<boolean> => {
    setCustomers(prev => [...prev, customer]);
    if (user) {
      const { error } = await supabase.from('customers').insert({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        server_id: customer.serverId,
        plan_id: customer.planId,
        amount_paid: customer.amountPaid,
        due_date: customer.dueDate,
        last_notified_date: customer.lastNotifiedDate,
        last_overdue_notified_date: customer.lastOverdueNotifiedDate,
        user_id: user.id
      });
      if (error) {
        console.error('Error syncing customer to cloud:', error);
        return false;
      }
    }
    return true;
  };

  const updateCustomer = (id: string, data: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    if (user) {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.serverId !== undefined) updateData.server_id = data.serverId;
      if (data.planId !== undefined) updateData.plan_id = data.planId;
      if (data.amountPaid !== undefined) updateData.amount_paid = data.amountPaid;
      if (data.dueDate !== undefined) updateData.due_date = data.dueDate;
      if (data.lastNotifiedDate !== undefined) updateData.last_notified_date = data.lastNotifiedDate;
      if (data.lastOverdueNotifiedDate !== undefined) updateData.last_overdue_notified_date = data.lastOverdueNotifiedDate;
      supabase.from('customers').update(updateData).eq('id', id).then(({ error }) => {
        if (error) console.error('Error updating customer in cloud:', error);
      });
    }
  };

  const deleteCustomer = async (id: string) => {
    if (user) {
      // First delete associated renewals to prevent foreign key errors if cascade is not set
      await supabase.from('renewals').delete().eq('customer_id', id);

      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) {
        console.error('Error deleting customer from cloud:', error);
        alert('Erro ao excluir cliente do banco de dados (provavelmente por causa de históricos).');
        return;
      }
    }
    setRenewals(prev => prev.filter(r => r.customerId !== id));
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  const transferCustomer = async (customerId: string, newServerId: string) => {
    // 1. Update Customer
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, serverId: newServerId } : c));

    // 2. Find and Update Latest Renewal
    let latestRenewalId: string | null = null;
    const customerRenewals = renewals.filter(r => r.customerId === customerId);
    if (customerRenewals.length > 0) {
      const latest = customerRenewals.reduce((prev, current) => {
        return (new Date(prev.date).getTime() > new Date(current.date).getTime()) ? prev : current;
      });
      latestRenewalId = latest.id;

      const newServer = servers.find(s => s.id === newServerId);
      const plan = plans.find(p => p.id === latest.planId);
      const newCost = (newServer?.costPerActive || 0) * (plan?.months || 1);

      setRenewals(prev => prev.map(r => r.id === latest.id ? { ...r, serverId: newServerId, cost: newCost } : r));

      if (user) {
        await supabase.from('renewals').update({
          server_id: newServerId,
          cost: newCost
        }).eq('id', latest.id);
      }
    }

    if (user) {
      await supabase.from('customers').update({ server_id: newServerId }).eq('id', customerId);
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
      const { error } = await supabase.from('renewals').insert({
        id: newRenewal.id,
        customer_id: newRenewal.customerId,
        server_id: newRenewal.serverId,
        plan_id: newRenewal.planId,
        amount: newRenewal.amount,
        cost: newRenewal.cost,
        date: newRenewal.date,
        user_id: user.id
      });
      if (error) console.error('Error syncing renewal to cloud:', error);
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
        app_icon: appIcon,
        app_cover: appCover
      }, { onConflict: 'user_id' });
    };
    const timer = setTimeout(syncSettings, 1000);
    return () => clearTimeout(timer);
  }, [whatsappMessage, renewalMessage, appIcon, appCover, user, loading]);

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

  useEffect(() => {
    if (appCover) {
      localStorage.setItem('arf_app_cover', appCover);
    } else {
      localStorage.removeItem('arf_app_cover');
    }
  }, [appCover]);

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
      appCover?: string | null;
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
          appCover: overrideData?.settings?.appCover ?? appCover,
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
        app_icon: dataToSync.settings.appIcon,
        app_cover: dataToSync.settings.appCover
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
          last_overdue_notified_date: c.lastOverdueNotifiedDate,
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
    customers, addCustomer: addCustomer as (c: Customer) => Promise<boolean>, updateCustomer, deleteCustomer, bulkUpdateCustomers, transferCustomer,
    renewals, addRenewal, bulkUpdateRenewals,
    manualAdditions, addManualAddition, bulkUpdateManualAdditions,
    whatsappMessage, setWhatsappMessage,
    renewalMessage, setRenewalMessage,
    appIcon, setAppIcon,
    appCover, setAppCover,
    syncToCloud: syncToCloud as (overrideData?: any, clearFirst?: boolean) => Promise<void>
  };
}


