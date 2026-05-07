import { useState, useEffect } from 'react';
import { Server, Plan, Customer, Renewal, ManualAddition, UserRole } from './types';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { formatCurrency, isCustomerActive, parseSafeNumber, ensureISO } from './utils';

const DEFAULT_PLANS: Plan[] = [
  { id: '702330a6-168a-4933-9114-1ce5d2f63f53', name: 'Gratuito', defaultPrice: 0, months: 1 },
  { id: '9609a562-b13c-41c3-8820-2f9540b61545', name: 'Mensal', defaultPrice: 35, months: 1 },
  { id: '47d7c672-9657-4f40-84a1-0bd7299a4e32', name: 'Trimestral', defaultPrice: 90, months: 3 },
  { id: '628b031b-7538-4f6c-843c-6cb76e22c9e3', name: 'Semestral', defaultPrice: 160, months: 6 },
  { id: '2c5a2bc9-f538-43d9-95e5-f55a15998f82', name: 'Anual', defaultPrice: 300, months: 12 },
  { id: 'd0e3e2b2-f538-43d9-95e5-f55a15998f82', name: 'Teste', defaultPrice: 0, months: 0 },
];

const PLAN_ID_MAP: Record<string, string> = {
  '0': '702330a6-168a-4933-9114-1ce5d2f63f53',
  '1': '9609a562-b13c-41c3-8820-2f9540b61545',
  '2': '47d7c672-9657-4f40-84a1-0bd7299a4e32',
  '3': '628b031b-7538-4f6c-843c-6cb76e22c9e3',
  '4': '2c5a2bc9-f538-43d9-95e5-f55a15998f82',
};

const toUUID = (id: string | undefined | null) => (id && id.trim() !== '' ? id : null);

export interface DataDiagnostics {
  phase1Time?: number;
  phase2Time?: number;
  settingsSize?: number;
  customerCount?: number;
  renewalCount?: number;
  lastSync?: string;
}

export function useStore(user: User | null) {
  // Enhanced Loading State
  const [loading, setLoading] = useState(() => {
    // If we have synced before, skip the blocking loader
    return !localStorage.getItem('arf_synced');
  });

  const [diagnostics, setDiagnostics] = useState<DataDiagnostics>({});

  const [userRole, setUserRole] = useState<UserRole>('owner');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(() => {
    return localStorage.getItem('arf_user_avatar');
  });

  const [servers, setServers] = useState<Server[]>(() => {
    const saved = localStorage.getItem('arf_servers');
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [plans, setPlans] = useState<Plan[]>(() => {
    try { 
      const saved = localStorage.getItem('arf_plans');
      let parsed = saved ? JSON.parse(saved) : [...DEFAULT_PLANS];
      if (!Array.isArray(parsed)) parsed = [...DEFAULT_PLANS];

      if (!parsed.some((p: any) => p.name?.toLowerCase() === 'teste')) {
        const testPlan = DEFAULT_PLANS.find(p => p.name === 'Teste');
        if (testPlan) parsed.push(testPlan);
      }
      return parsed;
    } catch { 
      return [...DEFAULT_PLANS]; 
    }
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('arf_customers');
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [renewals, setRenewals] = useState<Renewal[]>(() => {
    const saved = localStorage.getItem('arf_renewals');
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [manualAdditions, setManualAdditions] = useState<ManualAddition[]>(() => {
    const saved = localStorage.getItem('arf_manual_additions');
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
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

  const [overdueMessage, setOverdueMessage] = useState<string>(() => {
    const saved = localStorage.getItem('arf_overdue_message');
    const defaultMsg = 'Olá *{nome}*! 👋\n\nPassando para avisar que seu acesso IPTV está {dias}. ⚠️\n\nGostaria de renovar seu acesso com a gente agora? 😊';
    return saved || defaultMsg;
  });

  const [testMessage, setTestMessage] = useState<string>(() => {
    const saved = localStorage.getItem('arf_test_message');
    const defaultMsg = 'Olá *{nome}*! 👋\n\nSeu período de teste de 4 horas expirou. ⌛\n\nO que achou dos canais? Gostaria de fechar um plano com a gente agora e garantir seu acesso? 😊';
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
        setUserEmail(null);
        return;
      }

      if (userEmail !== user.email) {
        setUserEmail(user.email || null);
      }

      const isSynced = !!localStorage.getItem('arf_synced');
      if (!isSynced) {
        setLoading(true);
      }

      try {
        // Start both phases concurrently
        const startTime = performance.now();
        console.time('Phase 1 Load');
        const phase1Promise = Promise.all([
          supabase.from('servers').select('*').order('name').then(r => { console.log('Servers loaded'); return r; }),
          supabase.from('plans').select('*').order('months').then(r => { console.log('Plans loaded'); return r; }),
          supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle().then(r => { console.log('Settings loaded'); return r; }),
          supabase.from('profiles').select('role, parent_id, avatar_url').eq('id', user.id).maybeSingle().then(r => { console.log('Profile loaded'); return r; })
        ]);

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const threeMonthsAgoISO = threeMonthsAgo.toISOString();

        console.time('Phase 2 Load');
        const phase2Promise = Promise.all([
          supabase.from('customers').select('*').order('name').then(r => { console.log('Customers loaded'); return r; }),
          supabase.from('renewals').select('*').gte('date', threeMonthsAgoISO).order('date', { ascending: false }).then(r => { console.log('Renewals loaded'); return r; }),
          supabase.from('manual_additions').select('*').gte('date', threeMonthsAgoISO).order('date', { ascending: false }).then(r => { console.log('Additions loaded'); return r; })
        ]);

        // Process Phase 1
        const results1 = await phase1Promise;
        const [
          { data: serversData },
          { data: plansData },
          { data: settingsData },
          { data: profileData }
        ] = results1;

        const phase1EndTime = performance.now();
        const settingsPayloadSize = settingsData ? JSON.stringify(settingsData).length : 0;

        setDiagnostics(prev => ({
          ...prev,
          phase1Time: Math.round(phase1EndTime - startTime),
          settingsSize: settingsPayloadSize,
          lastSync: new Date().toISOString()
        }));

        if (profileData) {
          if (profileData.role) {
            setUserRole(profileData.role as UserRole);
          } else {
            setUserRole('owner');
          }

          if (profileData.avatar_url) {
            setUserAvatar(profileData.avatar_url);
          }
        } else {
          setUserRole('owner');
        }

        if (serversData) {
          const mappedServers = serversData.map((s: any) => ({
            id: s.id?.toString() || '',
            name: s.name || 'Sem Nome',
            costPerActive: parseSafeNumber(s.cost_per_active ?? s.costPerActive)
          }));
          setServers(mappedServers);
          localStorage.setItem('arf_servers', JSON.stringify(mappedServers));
        }
        if (plansData) {
          const mappedPlans = plansData.map((p: any) => ({
            id: p.id?.toString() || '',
            name: p.name || 'Plano',
            defaultPrice: parseSafeNumber(p.default_price ?? p.defaultPrice),
            months: Number(p.months ?? 1)
          }));
          
          if (!mappedPlans.some((p: any) => p.name?.toLowerCase() === 'teste')) {
            const testPlan = DEFAULT_PLANS.find(p => p.name === 'Teste');
            if (testPlan) mappedPlans.push(testPlan);
          }

          setPlans(mappedPlans);
          localStorage.setItem('arf_plans', JSON.stringify(mappedPlans));
        }
        if (settingsData) {
          if (settingsData.whatsapp_message || (settingsData as any).whatsappMessage) setWhatsappMessage(settingsData.whatsapp_message || (settingsData as any).whatsappMessage);
          if (settingsData.renewal_message || (settingsData as any).renewalMessage) setRenewalMessage(settingsData.renewal_message || (settingsData as any).renewalMessage);
          if (settingsData.overdue_message || (settingsData as any).overdueMessage) setOverdueMessage(settingsData.overdue_message || (settingsData as any).overdueMessage);
          if (settingsData.app_icon || (settingsData as any).appIcon) setAppIcon(settingsData.app_icon || (settingsData as any).appIcon);
          if (settingsData.app_cover || (settingsData as any).appCover) setAppCover(settingsData.app_cover || (settingsData as any).appCover);
        }

        // Mark as synced and unblock UI early
        localStorage.setItem('arf_synced', 'true');
        console.timeEnd('Phase 1 Load');
        setLoading(false);

        // Ensure Teste plan exists in database if user is owner/admin
        if (user && profileData?.role !== 'observer') {
          const testPlan = DEFAULT_PLANS.find(p => p.name === 'Teste');
          if (testPlan && !plansData?.some((p: any) => p.name?.toLowerCase() === 'teste')) {
            console.log('Inserting Teste plan into database...');
            supabase.from('plans').upsert({
              id: testPlan.id,
              name: testPlan.name,
              default_price: testPlan.defaultPrice,
              months: testPlan.months,
              user_id: user.id
            }, { onConflict: 'id' }).then(({ error }) => {
              if (error) console.error('Error inserting Teste plan:', error);
            });
          }
        }

        // Process Phase 2 (Background)
        const [
          { data: customersData },
          { data: renewalsData },
          { data: additionsData }
        ] = await phase2Promise;

        if (customersData) {
          const mappedCustomers = customersData.map((c: any) => ({
            id: c.id?.toString() || '',
            name: c.name || 'Sem Nome',
            phone: c.phone || '',
            serverId: (c.server_id || c.serverId || '').toString(),
            planId: (PLAN_ID_MAP[c.plan_id] || PLAN_ID_MAP[c.planId] || c.plan_id || c.planId || '').toString(),
            amountPaid: parseSafeNumber(c.amount_paid ?? c.amountPaid),
            dueDate: c.due_date || c.dueDate || new Date().toISOString(),
            lastNotifiedDate: c.last_notified_date !== undefined ? c.last_notified_date : (c.last_not_date !== undefined ? c.last_not_date : c.lastNotifiedDate),
            lastOverdueNotifiedDate: c.last_overdue_notified_date !== undefined ? c.last_overdue_notified_date : c.lastOverdueNotifiedDate,
            hasResetCounters: Boolean(c.has_reset_counters !== undefined ? c.has_reset_counters : c.hasResetCounters)
          }));
          setCustomers(mappedCustomers);
          localStorage.setItem('arf_customers', JSON.stringify(mappedCustomers));
        }
        if (renewalsData) {
          const mappedRenewals = renewalsData.map((r: any) => ({
            id: r.id?.toString() || '',
            customerId: (r.customer_id || r.customerId || '').toString(),
            serverId: (r.server_id || r.serverId || '').toString(),
            planId: (PLAN_ID_MAP[r.plan_id] || PLAN_ID_MAP[r.planId] || r.plan_id || r.planId || '').toString(),
            amount: parseSafeNumber(r.amount ?? (r as any).amount),
            cost: parseSafeNumber(r.cost ?? (r as any).cost),
            date: r.date || r.created_at || new Date().toISOString()
          }));
          setRenewals(mappedRenewals);
          localStorage.setItem('arf_renewals', JSON.stringify(mappedRenewals));
        }
        if (additionsData) {
          const mappedAdditions = additionsData.map((a: any) => ({
            id: a.id?.toString() || '',
            amount: parseSafeNumber(a.amount ?? (a as any).amount),
            date: a.date || a.created_at || new Date().toISOString(),
            description: a.description || ''
          }));
          setManualAdditions(mappedAdditions);
          localStorage.setItem('arf_manual_additions', JSON.stringify(mappedAdditions));
        }

        const phase2EndTime = performance.now();
        setDiagnostics(prev => ({
          ...prev,
          phase2Time: Math.round(phase2EndTime - phase1EndTime),
          customerCount: customersData?.length || 0,
          renewalCount: renewalsData?.length || 0
        }));

        console.timeEnd('Phase 2 Load');
      } catch (error) {
        console.error('Error loading data from Supabase:', error);
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
    // Check if there are customers linked to this server
    const linkedCustomers = customers.filter(c => c.serverId === id);
    if (linkedCustomers.length > 0) {
      alert(`Não é possível excluir este servidor pois há ${linkedCustomers.length} cliente(s) vinculado(s) a ele. Transfira ou exclua os clientes antes de excluir o servidor.`);
      return;
    }

    if (user) {
      // First delete renewals linked to this server to avoid foreign key constraint
      await supabase.from('renewals').delete().eq('server_id', id);

      const { error } = await supabase.from('servers').delete().eq('id', id);
      if (error) {
        console.error('Error deleting server:', error);
        alert('Erro ao excluir servidor: ' + (error.message || 'Ocorreu um erro inesperado.'));
        return;
      }
    }
    setRenewals(prev => prev.filter(r => r.serverId !== id));
    setServers(prev => prev.filter(s => s.id !== id));
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
        server_id: toUUID(customer.serverId),
        plan_id: toUUID(customer.planId),
        amount_paid: customer.amountPaid,
        due_date: ensureISO(customer.dueDate),
        last_notified_date: customer.lastNotifiedDate ? ensureISO(customer.lastNotifiedDate) : null,
        last_overdue_notified_date: customer.lastOverdueNotifiedDate ? ensureISO(customer.lastOverdueNotifiedDate) : null,
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
      if (data.serverId !== undefined) updateData.server_id = toUUID(data.serverId);
      if (data.planId !== undefined) updateData.plan_id = toUUID(data.planId);
      if (data.amountPaid !== undefined) updateData.amount_paid = data.amountPaid;
      if (data.dueDate !== undefined) updateData.due_date = ensureISO(data.dueDate);
      if (data.lastNotifiedDate !== undefined) updateData.last_notified_date = data.lastNotifiedDate ? ensureISO(data.lastNotifiedDate) : null;
      if (data.lastOverdueNotifiedDate !== undefined) updateData.last_overdue_notified_date = data.lastOverdueNotifiedDate ? ensureISO(data.lastOverdueNotifiedDate) : null;
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

  const resetServerCounters = async (serverId: string) => {
    // We update all customers in this server to have amountPaid = 0 and hasResetCounters = true
    setCustomers(prev => prev.map(c => {
      if (c.serverId === serverId) {
        return { ...c, amountPaid: 0, hasResetCounters: true };
      }
      return c;
    }));

    if (user) {
      const { error } = await supabase.from('customers')
        .update({ amount_paid: 0, has_reset_counters: true })
        .eq('server_id', toUUID(serverId));

      if (error) {
        console.error('Error resetting server stats in cloud:', error);
      }
    }
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
      await supabase.from('customers').update({ server_id: toUUID(newServerId) }).eq('id', customerId);
    }
  };

  const bulkUpdateCustomers = async (updater: (prev: Customer[]) => Customer[]) => {
    setCustomers(prev => {
      const next = updater(prev);
      return next;
    });
  };

  const addRenewal = async (renewal: Omit<Renewal, 'id'>) => {
    const newRenewal = { ...renewal, id: uuidv4() };
    setRenewals(prev => [...prev, newRenewal]);
    if (user) {
      const { error } = await supabase.from('renewals').insert({
        id: newRenewal.id,
        customer_id: toUUID(newRenewal.customerId),
        server_id: toUUID(newRenewal.serverId),
        plan_id: toUUID(newRenewal.planId),
        amount: newRenewal.amount,
        cost: newRenewal.cost,
        date: ensureISO(newRenewal.date),
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
        date: ensureISO(newAddition.date),
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
        overdue_message: overdueMessage,
        app_icon: appIcon,
        app_cover: appCover
      }, { onConflict: 'user_id' });
    };
    const timer = setTimeout(syncSettings, 1000);
    return () => clearTimeout(timer);
  }, [whatsappMessage, renewalMessage, overdueMessage, appIcon, appCover, user, loading]);



  useEffect(() => {
    localStorage.setItem('arf_renewal_message', renewalMessage);
  }, [renewalMessage]);

  useEffect(() => {
    localStorage.setItem('arf_overdue_message', overdueMessage);
  }, [overdueMessage]);

  useEffect(() => {
    localStorage.setItem('arf_message_v2', whatsappMessage);
  }, [whatsappMessage]);

  useEffect(() => {
    localStorage.setItem('arf_test_message', testMessage);
  }, [testMessage]);

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

  useEffect(() => {
    if (userAvatar) {
      localStorage.setItem('arf_user_avatar', userAvatar);
    } else {
      localStorage.removeItem('arf_user_avatar');
    }
  }, [userAvatar]);

  // Persistent Storage Synchronization
  useEffect(() => {
    localStorage.setItem('arf_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('arf_servers', JSON.stringify(servers));
  }, [servers]);

  useEffect(() => {
    localStorage.setItem('arf_plans', JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    localStorage.setItem('arf_renewals', JSON.stringify(renewals));
  }, [renewals]);

  useEffect(() => {
    localStorage.setItem('arf_manual_additions', JSON.stringify(manualAdditions));
  }, [manualAdditions]);

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
      overdueMessage?: string;
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
          overdueMessage: overrideData?.settings?.overdueMessage ?? overdueMessage,
          testMessage: overrideData?.settings?.testMessage ?? testMessage,
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
        overdue_message: dataToSync.settings.overdueMessage,
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
          server_id: toUUID(c.serverId),
          plan_id: toUUID(c.planId),
          amount_paid: c.amountPaid,
          due_date: ensureISO(c.dueDate),
          last_notified_date: c.lastNotifiedDate ? ensureISO(c.lastNotifiedDate) : null,
          last_overdue_notified_date: c.lastOverdueNotifiedDate ? ensureISO(c.lastOverdueNotifiedDate) : null,
          user_id: user.id
        })));
        if (error) throw error;
      }

      // 5. Sync Renewals
      if (dataToSync.renewals.length > 0) {
        console.log('Syncing renewals...');
        const { error } = await supabase.from('renewals').upsert(dataToSync.renewals.map(r => ({
          id: r.id,
          customer_id: toUUID(r.customerId),
          server_id: toUUID(r.serverId),
          plan_id: toUUID(r.planId),
          amount: r.amount,
          cost: r.cost,
          date: ensureISO(r.date),
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
    customers, addCustomer: addCustomer as (c: Customer) => Promise<boolean>, updateCustomer, deleteCustomer, bulkUpdateCustomers, transferCustomer, resetServerCounters,
    renewals, addRenewal, bulkUpdateRenewals,
    manualAdditions, addManualAddition, bulkUpdateManualAdditions,
    userRole,
    userEmail, setUserEmail,
    userAvatar, setUserAvatar,
    whatsappMessage, setWhatsappMessage,
    renewalMessage, setRenewalMessage,
    overdueMessage, setOverdueMessage,
    testMessage, setTestMessage,
    appIcon, setAppIcon,
    appCover, setAppCover,
    syncToCloud: syncToCloud as (overrideData?: any, clearFirst?: boolean) => Promise<void>,
    diagnostics
  };
}


