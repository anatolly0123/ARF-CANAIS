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
import { AdminPanel } from './views/AdminPanel';
import { Profile } from './views/Profile';
import { Auth } from './components/Auth';
import { supabase } from './lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '@supabase/supabase-js';

export default function App() {
  console.log('App component rendering...');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const store = useStore(user);

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

  // Handle Dynamic App Icon & Cover
  useEffect(() => {
    if (store.appIcon) {
      const appleIcon = document.getElementById('ios-icon') as HTMLLinkElement;
      const favicon = document.getElementById('favicon') as HTMLLinkElement;
      if (appleIcon) appleIcon.href = store.appIcon;
      if (favicon) favicon.href = store.appIcon;
    }

    if (store.appCover) {
      const iosSplash = document.getElementById('ios-splash') as HTMLLinkElement;
      const ogImage = document.getElementById('og-image') as HTMLMetaElement;
      const twitterImage = document.getElementById('twitter-image') as HTMLMetaElement;

      if (iosSplash) iosSplash.href = store.appCover;
      if (ogImage) ogImage.content = store.appCover;
      if (twitterImage) twitterImage.content = store.appCover;
    }
  }, [store.appIcon, store.appCover]);

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
            overdueMessage={store.overdueMessage}
            testMessage={store.testMessage}
            userRole={store.userRole}
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
            overdueMessage={store.overdueMessage}
            transferCustomer={store.transferCustomer}
            userRole={store.userRole}
            testMessage={store.testMessage}
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
            resetServerCounters={store.resetServerCounters}
            userRole={store.userRole}
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
            overdueMessage={store.overdueMessage}
            setOverdueMessage={store.setOverdueMessage}
            testMessage={store.testMessage}
            setTestMessage={store.setTestMessage}
            addManualAddition={store.addManualAddition}
            manualAdditions={store.manualAdditions}
            userRole={store.userRole}
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
            appCover={store.appCover}
            setAppCover={store.setAppCover}
            syncToCloud={store.syncToCloud}
            userRole={store.userRole}
            diagnostics={store.diagnostics}
          />
        );
      case 'admin':
        return (
          <AdminPanel
            userRole={store.userRole}
          />
        );
      case 'profile':
        return (
          <Profile
            userEmail={store.userEmail || null}
            userAvatar={store.userAvatar || null}
            onAvatarUpdate={store.setUserAvatar}
            onEmailUpdate={store.setUserEmail}
          />
        );
      default:
        return null;
    }
  };

  if (!user) {
    return <Auth />;
  }

  if (store.loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-2 border-[#c8a646]/20 border-t-[#c8a646] rounded-full animate-spin" />
          <p className="text-[#c8a646]/60 font-bold uppercase tracking-[0.2em] text-[10px]">Sincronizando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans selection:bg-[#c8a646]/30">
      <Header 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        userRole={store.userRole}
        userEmail={store.userEmail}
        userAvatar={store.userAvatar}
        customers={store.customers}
        plans={store.plans}
        testMessage={store.testMessage}
      />
      <main className="max-w-md mx-auto p-4 sm:p-6 pb-32 overflow-x-hidden">
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
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} userRole={store.userRole} />
    </div>
  );
}




