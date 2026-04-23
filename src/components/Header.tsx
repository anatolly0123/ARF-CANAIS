import React, { useState, useRef, useEffect } from 'react';
import { Bell, LogOut, Shield, User as UserIcon, Settings, ChevronDown, BellRing, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Tab, UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderProps {
  activeTab?: Tab;
  setActiveTab?: (tab: Tab) => void;
  userRole?: UserRole;
  userEmail?: string | null;
  userAvatar?: string | null;
}

export function Header({ activeTab, setActiveTab, userRole, userEmail, userAvatar }: HeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitial = () => {
    if (!userEmail) return 'U';
    return userEmail.charAt(0).toUpperCase();
  };

  const displayName = userEmail ? userEmail.split('@')[0] : 'Usuário';

  return (
    <header className="sticky top-0 z-50 bg-[#0f0f0f]/90 backdrop-blur-md border-b border-[#c8a646]/20 py-4 px-6">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <div className="flex flex-col group cursor-default">
          <h1 className="text-2xl font-black italic tracking-tighter leading-none flex items-center">
            <span className="text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">ARF</span>
            <span className="ml-1.5 text-transparent bg-clip-text bg-gradient-to-r from-[#c8a646] via-[#e8c666] to-[#c8a646] font-extrabold tracking-tight">
              CANAIS
            </span>
          </h1>
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#c8a646]/40 to-transparent mt-1.5 rounded-full" />
        </div>

        <div className="flex items-center space-x-3">
          
          {/* Notification Dropdown */}
          <div className="relative" ref={notifRef}>
            <button 
               onClick={() => setIsNotifOpen(!isNotifOpen)}
               className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors relative hover:bg-white/10 active:scale-95"
            >
              <Bell size={20} />
              {/* Optional: red dot for new notifications */}
              {/* <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0f0f0f]"></span> */}
            </button>

            <AnimatePresence>
              {isNotifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-72 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 z-50"
                >
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <p className="text-sm font-bold text-white">Notificações</p>
                    <button className="text-[10px] text-[#c8a646] hover:underline font-bold uppercase tracking-wider">
                      Marcar Lidas
                    </button>
                  </div>
                  
                  <div className="p-4 flex flex-col items-center justify-center text-center space-y-3 opacity-60 h-32">
                    <div className="p-3 bg-white/5 rounded-full">
                       <BellRing size={24} className="text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">Você não tem novas notificações.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 p-1 pl-2 pr-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all active:scale-95"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c8a646] to-[#9a7b2c] flex items-center justify-center text-[#0f0f0f] font-bold overflow-hidden border-2 border-[#0f0f0f]">
                {userAvatar ? (
                  <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span>{getInitial()}</span>
                )}
              </div>
              <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-56 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 z-50"
                >
                  <div className="px-4 py-3 border-b border-white/5 mb-2">
                    <p className="text-sm font-bold text-white truncate">{displayName}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mt-0.5">
                      {userRole === 'owner' ? 'Dono' : userRole === 'admin' ? 'Administrador' : 'Observador'}
                    </p>
                  </div>

                  <div className="px-2 space-y-1">
                    {setActiveTab && (
                      <button 
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setActiveTab('profile');
                        }}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                          activeTab === 'profile' 
                            ? 'bg-[#c8a646]/20 text-[#c8a646]' 
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <UserIcon size={16} />
                        <span>Meu Perfil</span>
                      </button>
                    )}

                    {setActiveTab && (
                      <button 
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setActiveTab('plans');
                        }}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                          activeTab === 'plans' 
                            ? 'bg-[#c8a646]/20 text-[#c8a646]' 
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Settings size={16} />
                        <span>Planos (Valores)</span>
                      </button>
                    )}

                    {(userRole === 'owner' || userRole === 'admin') && setActiveTab && (
                      <button 
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setActiveTab('storage');
                        }}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                          activeTab === 'storage' 
                            ? 'bg-[#c8a646]/20 text-[#c8a646]' 
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Database size={16} />
                        <span>Dados e Backup</span>
                      </button>
                    )}

                    {(userRole === 'owner' || userRole === 'admin') && setActiveTab && (
                      <button 
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setActiveTab('admin');
                        }}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                          activeTab === 'admin' 
                            ? 'bg-[#c8a646]/20 text-[#c8a646]' 
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Shield size={16} />
                        <span>Painel Admin</span>
                      </button>
                    )}
                  </div>

                  <div className="px-2 mt-2 pt-2 border-t border-white/5">
                    <button 
                      onClick={() => supabase.auth.signOut()}
                      className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
                    >
                      <LogOut size={16} />
                      <span>Sair da Conta</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
        </div>
      </div>

    </header>
  );
}
