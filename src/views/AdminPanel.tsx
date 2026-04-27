import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, User, Lock, Shield, Loader2, AlertCircle, CheckCircle, Trash2, Edit2, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types';

interface AdminPanelProps {
  userRole: UserRole;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export function AdminPanel({ userRole }: AdminPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('observer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<string>('');

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'list_users' },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setUsers(data.users || []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (userRole === 'admin' || userRole === 'owner') {
      fetchUsers();
    }
  }, [userRole]);

  if (userRole !== 'owner' && userRole !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-[#1a1a1a] rounded-2xl border border-white/5">
        <Shield className="text-[#c8a646] mb-4 opacity-50" size={48} />
        <h2 className="text-xl font-bold text-white mb-2">Acesso Negado</h2>
        <p className="text-gray-400 text-sm">Você não tem permissão para acessar o painel administrativo.</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (userRole === 'admin' && role === 'owner') {
         throw new Error('Apenas o dono da conta (Dono) pode criar novos Painéis do Zero.');
      }

      const finalEmail = email.includes('@') ? email : `${email}@arfcanais.com`;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error('Falha ao autenticar sessão local.');

      const { data, error: funcError } = await supabase.functions.invoke('manage-users', {
        body: { action: 'create_user', email: finalEmail, password, role },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error);

      setSuccess(`Usuário ${email} criado com sucesso como ${role === 'owner' ? 'Painel do Zero' : roleLabels[role]}!`);
      setEmail('');
      setPassword('');
      setRole('observer');
      fetchUsers(); // Refresh list
    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.message || 'Ocorreu um erro ao criar o usuário.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, userEmail: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir '${userEmail}' definitivamente?`)) return;

    try {
      setError(null);
      setSuccess(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      const { data, error } = await supabase.functions.invoke('manage-users', {
         body: { action: 'delete_user', target_user_id: id },
         headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccess(`Usuário ${userEmail} excluído com sucesso.`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir usuário');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;

    try {
      setError(null);
      setSuccess(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      const { data, error } = await supabase.functions.invoke('manage-users', {
         body: { 
           action: 'update_user', 
           target_user_id: editingUserId,
           email: editEmail || undefined,
           password: editPassword || undefined,
           role: editRole || undefined
         },
         headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccess(`Usuário atualizado com sucesso.`);
      setEditingUserId(null);
      fetchUsers();
    } catch (err: any) {
       setError(err.message || 'Erro ao atualizar usuário');
    }
  };

  const openEdit = (user: AdminUser) => {
    setEditingUserId(user.id);
    setEditEmail(user.email || '');
    setEditPassword('');
    setEditRole(user.role);
  };

  const roleLabels: Record<string, string> = {
    'owner': 'Painel Líder',
    'admin': 'Administrador',
    'observer': 'Observador'
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Painel Administrativo</h1>
          <p className="text-gray-500 text-xs font-medium uppercase tracking-widest mt-1">Gerencie acessos</p>
        </div>
        <div className="p-3 bg-[#c8a646]/10 rounded-2xl border border-[#c8a646]/20">
          <Shield className="text-[#c8a646]" size={24} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-start gap-3">
            <CheckCircle className="text-green-400 shrink-0 mt-0.5" size={16} />
            <p className="text-green-400 text-xs leading-relaxed">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-8">
        {/* Create User Form Section */}
        <div className="bg-[#1a1a1a] rounded-3xl p-6 border border-white/5 shadow-xl relative overflow-hidden h-fit">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#c8a646]/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          
          <h2 className="text-lg font-bold text-white mb-6 flex items-center">
            <UserPlus size={20} className="mr-2 text-[#c8a646]" />
            Criar Novo Usuário
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Usuário ou E-mail</label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={18} />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
                  required
                  placeholder="nome.usuario"
                  className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-2 focus:ring-[#c8a646]/20 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Senha (Temporária)</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={18} />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="No mínimo 6 caracteres"
                  className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-2 focus:ring-[#c8a646]/20 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Tipo de Conta</label>
              <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                <label className={`relative flex flex-col p-4 cursor-pointer rounded-2xl border transition-all ${role === 'observer' ? 'bg-[#c8a646]/10 border-[#c8a646]' : 'bg-[#0f0f0f]/50 border-white/10 hover:border-white/30'}`}>
                  <input type="radio" name="role" value="observer" checked={role === 'observer'} onChange={() => setRole('observer')} className="sr-only" />
                  <span className="font-bold text-white text-sm mb-1">Observador</span>
                  <span className="text-xs text-gray-400">Pode apenas ver clientes e métricas. Não pode editar nem adicionar.</span>
                </label>

                <label className={`relative flex flex-col p-4 cursor-pointer rounded-2xl border transition-all ${role === 'admin' ? 'bg-[#c8a646]/10 border-[#c8a646]' : 'bg-[#0f0f0f]/50 border-white/10 hover:border-white/30'}`}>
                  <input type="radio" name="role" value="admin" checked={role === 'admin'} onChange={() => setRole('admin')} className="sr-only" />
                  <span className="font-bold text-white text-sm mb-1">Administrador</span>
                  <span className="text-xs text-gray-400">Pode editar, renovar e adicionar clientes na sua conta.</span>
                </label>

                {userRole === 'owner' && (
                  <label className={`relative flex flex-col p-4 cursor-pointer rounded-2xl border transition-all ${role === 'owner' ? 'bg-[#c8a646]/10 border-[#c8a646]' : 'bg-[#0f0f0f]/50 border-white/10 hover:border-white/30'}`}>
                    <input type="radio" name="role" value="owner" checked={role === 'owner'} onChange={() => setRole('owner')} className="sr-only" />
                    <span className="font-bold text-white text-sm mb-1">Novo Painel do Zero</span>
                    <span className="text-xs text-gray-400">Cria uma conta totalmente nova e vazia, sem compartilhar seus clientes.</span>
                  </label>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full relative py-4 bg-[#c8a646] hover:bg-[#e8c666] disabled:opacity-50 text-[#0f0f0f] font-black rounded-2xl transition-all shadow-xl shadow-[#c8a646]/20 active:scale-[0.98] overflow-hidden group flex items-center justify-center space-x-2 mt-4"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (
                <>
                  <span>CRIAR USUÁRIO</span>
                  <UserPlus size={20} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* User List Section */}
        <div className="bg-[#1a1a1a] rounded-3xl p-6 border border-white/5 shadow-xl relative overflow-hidden flex flex-col h-[500px]">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center shrink-0">
            <User size={20} className="mr-2 text-[#c8a646]" />
            Gerenciar Usuários
          </h2>
          
          {loadingUsers ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin text-[#c8a646]" size={32} />
            </div>
          ) : (
             <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
               {users.map((user) => (
                 <div key={user.id} className="p-4 rounded-2xl bg-[#0f0f0f]/50 border border-white/5 hover:bg-[#0f0f0f] transition-all flex flex-col gap-3 group">
                   
                   {editingUserId === user.id ? (
                     // EDIT MODE
                     <form onSubmit={handleUpdateUser} className="space-y-3">
                       <div className="flex items-center justify-between mb-2">
                         <span className="text-sm font-bold text-[#c8a646]">Editando Usuário</span>
                         <button type="button" onClick={() => setEditingUserId(null)} className="text-gray-400 hover:text-white p-1 rounded-md transition-colors">
                           <X size={16} />
                         </button>
                       </div>
                       
                       <input 
                         type="text" 
                         value={editEmail} 
                         onChange={(e) => setEditEmail(e.target.value)} 
                         placeholder="Novo E-mail ou Usuário"
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#c8a646] text-sm"
                       />
                       <input 
                         type="password" 
                         value={editPassword} 
                         onChange={(e) => setEditPassword(e.target.value)} 
                         placeholder="Nova Senha (Opcional)"
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#c8a646] text-sm"
                       />

                       <select
                         value={editRole}
                         onChange={(e) => setEditRole(e.target.value)}
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#c8a646] text-sm"
                         disabled={user.role === 'owner' && userRole !== 'owner'}
                       >
                         <option value="observer">Observador</option>
                         <option value="admin">Administrador</option>
                         {userRole === 'owner' && <option value="owner">Painel Líder</option>}
                       </select>

                       <button type="submit" className="w-full py-2 bg-[#c8a646] hover:bg-[#e8c666] text-[#1a1a1a] font-bold rounded-xl flex items-center justify-center space-x-2 text-sm transition-colors mt-2">
                         <Save size={16} />
                         <span>Salvar Alterações</span>
                       </button>
                     </form>
                   ) : (
                     // VIEW MODE
                     <>
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#c8a646] to-[#9a7b2c] shrink-0 border-2 border-[#1a1a1a] flex items-center justify-center overflow-hidden">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white text-lg font-bold">
                              {user.email?.[0]?.toUpperCase() || 'U'}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm truncate">{user.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              user.role === 'owner' ? 'bg-[#c8a646]/20 text-[#c8a646] border border-[#c8a646]/30' : 
                              user.role === 'admin' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
                              'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                            }`}>
                              {roleLabels[user.role] || user.role}
                            </span>
                          </div>
                        </div>
                     </div>
                     <div className="flex items-center gap-2 pt-3 border-t border-white/5 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button 
                           onClick={() => openEdit(user)}
                           className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-gray-300 transition-colors text-xs font-bold"
                        >
                          <Edit2 size={14} />
                          <span>Editar</span>
                        </button>
                        <button 
                           onClick={() => handleDeleteUser(user.id, user.email)}
                           className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-xl border border-red-500/20 hover:bg-red-500/10 text-red-400 transition-colors text-xs font-bold"
                        >
                          <Trash2 size={14} />
                          <span>Excluir</span>
                        </button>
                     </div>
                     </>
                   )}
                 </div>
               ))}
               {users.length === 0 && (
                 <div className="text-center py-8 text-gray-500 text-sm">
                   Nenhum usuário secundário encontrado.
                 </div>
               )}
             </div>
          )}
        </div>
      </div>
      
      {/* Explicit Spacer for Bottom Nav */}
      <div className="h-32 w-full block shrink-0" aria-hidden="true" />
    </div>
  );
}
