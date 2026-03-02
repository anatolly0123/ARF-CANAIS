/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useStore } from './store';
import { Tab } from './types';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { Dashboard } from './views/Dashboard';
import { Customers } from './views/Customers';
import { Servers } from './views/Servers';
import { Plans } from './views/Plans';
import { Storage } from './views/Storage';
import { Auth } from './components/Auth';
import { supabase } from './lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '@supabase/supabase-js';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const store = useStore();

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle Dynamic App Icon

  // Handle Dynamic App Icon
  useEffect(() => {
    if (store.appIcon) {
      const appleIcon = document.getElementById('ios-icon') as HTMLLinkElement;
      const favicon = document.getElementById('favicon') as HTMLLinkElement;

      if (appleIcon) appleIcon.href = store.appIcon;
      if (favicon) favicon.href = store.appIcon;
    }
  }, [store.appIcon]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            customers={store.customers}
            servers={store.servers}
            plans={store.plans}
            whatsappMessage={store.whatsappMessage}
            updateCustomer={store.updateCustomer}
            renewals={store.renewals}
            addRenewal={store.addRenewal}
            manualAdditions={store.manualAdditions}
            renewalMessage={store.renewalMessage}
          />
        );
      case 'customers':
        return (
          <Customers
            customers={store.customers}
            servers={store.servers}
            plans={store.plans}
            whatsappMessage={store.whatsappMessage}
            addCustomer={store.addCustomer}
            updateCustomer={store.updateCustomer}
            deleteCustomer={store.deleteCustomer}
            bulkUpdateCustomers={store.bulkUpdateCustomers}
            addRenewal={store.addRenewal}
            renewalMessage={store.renewalMessage}
          />
        );
      case 'servers':
        return (
          <Servers
            servers={store.servers}
            customers={store.customers}
            plans={store.plans}
            addServer={store.addServer}
            updateServer={store.updateServer}
            deleteServer={store.deleteServer}
          />
        );
      case 'plans':
        return (
          <Plans
            plans={store.plans}
            updatePlan={store.updatePlan}
            whatsappMessage={store.whatsappMessage}
            setWhatsappMessage={store.setWhatsappMessage}
            renewalMessage={store.renewalMessage}
            setRenewalMessage={store.setRenewalMessage}
            addManualAddition={store.addManualAddition}
            manualAdditions={store.manualAdditions}
          />
        );
      case 'storage':
        return (
          <Storage
            customers={store.customers}
            servers={store.servers}
            plans={store.plans}
            renewals={store.renewals}
            manualAdditions={store.manualAdditions}
            bulkUpdateCustomers={store.bulkUpdateCustomers}
            setServers={store.bulkUpdateServers}
            setPlans={store.bulkUpdatePlans}
            setRenewals={store.bulkUpdateRenewals}
            setManualAdditions={store.bulkUpdateManualAdditions}
            appIcon={store.appIcon}
            setAppIcon={store.setAppIcon}
          />
        );
      default:
        return null;
    }
  };

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans selection:bg-[#c8a646]/30">
      <Header />
      <main className="max-w-md mx-auto p-4 sm:p-6 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}




