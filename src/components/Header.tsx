import { Bell, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-[#0f0f0f]/90 backdrop-blur-md border-b border-[#c8a646]/20 py-4 px-6">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#c8a646] to-[#e8c666] uppercase tracking-widest leading-none">
            ARF Canais
          </h1>
        </div>

        <div className="flex items-center space-x-2">
          <button className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors">
            <Bell size={20} />
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2 bg-red-500/10 rounded-xl text-red-500 hover:bg-red-500/20 transition-colors"
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
