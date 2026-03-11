import { LayoutDashboard, Users, Server, Settings, Database, Shield } from 'lucide-react';
import { Tab, UserRole } from '../types';

interface BottomNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  userRole: UserRole;
}

export function BottomNav({ activeTab, setActiveTab, userRole }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard' as Tab, label: 'Início', icon: LayoutDashboard },
    { id: 'customers' as Tab, label: 'Clientes', icon: Users },
    { id: 'servers' as Tab, label: 'Servidores', icon: Server },
    { id: 'plans' as Tab, label: 'Planos', icon: Settings },
  ];

  if (userRole === 'owner' || userRole === 'admin') {
    navItems.push({ id: 'storage' as Tab, label: 'Dados', icon: Database });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#141414] border-t border-[#c8a646]/20 pb-safe z-50">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                isActive ? 'text-[#c8a646]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
