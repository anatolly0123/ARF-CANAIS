import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ProfileProps {
  userEmail: string | null;
  userAvatar: string | null;
  onAvatarUpdate: (newUrl: string) => void;
  onEmailUpdate: (newEmail: string) => void;
}

export function Profile({
  userEmail,
  userAvatar,
  onAvatarUpdate,
  onEmailUpdate
}: ProfileProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Profile Form State
  const [newEmail, setNewEmail] = useState(userEmail || '');

  // Security Form State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');


  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmail === userEmail) return;

    try {
      setLoading(true);
      setMessage(null);

      const { error } = await supabase.auth.updateUser({ email: newEmail });

      if (error) {
        if (error.message.includes('already registered')) {
          throw new Error('Este usuário/e-mail já está em uso.');
        }
        throw error;
      }

      onEmailUpdate(newEmail);
      setMessage({ type: 'success', text: 'E-mail ou Usuário atualizado com sucesso!' });

    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erro ao atualizar.' });
      setNewEmail(userEmail || '');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'As novas senhas não coincidem.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'A senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Senha atualizada com sucesso!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erro ao atualizar senha.' });
    } finally {
      setLoading(false);
    }
  };

  const getInitial = () => {
    if (!userEmail) return 'U';
    return userEmail.charAt(0).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Meu Perfil</h2>
      </div>

      <div className="bg-[#1a1a1a] rounded-3xl border border-white/5 shadow-2xl p-6 md:p-8 max-w-sm mx-auto mt-12 relative">
        {/* Avatar Overlaying Top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative group">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#c8a646] to-[#9a7b2c] flex items-center justify-center text-[#0f0f0f] text-4xl font-bold overflow-hidden border-4 border-[#1a1a1a] shadow-xl">
              {userAvatar ? (
                <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{getInitial()}</span>
              )}
            </div>
          </div>
        </div>

        {/* Space for Avatar */}
        <div className="text-center mt-12 mb-8">
          <h3 className="text-lg font-bold text-white">Foto de Perfil</h3>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-start space-x-3 text-sm font-medium ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
            {message.type === 'success' ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={async (e) => {
          e.preventDefault();
          if (newEmail !== userEmail) {
            await handleUpdateProfile(e);
          }
          if (newPassword) {
            await handleUpdatePassword(e);
          }
        }} className="space-y-5">

          {/* Email/Username Field */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">
              Usuário / E-mail de Login
            </label>
            <div className="relative">
              <input
                type="text"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-[#2a2a2a] border border-white/5 rounded-xl p-3.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#c8a646] focus:border-[#c8a646] transition-all"
                placeholder="Ex: admin@arfcanais"
                required
              />
            </div>
          </div>

          {/* Password Section */}
          <div className="pt-2 border-t border-white/5 space-y-4">
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                Nova Senha
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[#2a2a2a] border border-white/5 rounded-xl p-3.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#c8a646] focus:border-[#c8a646] transition-all"
                placeholder="Mínimo 6 caracteres (Opcional)"
              />
            </div>
            {newPassword.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <label className="block text-sm font-bold text-white mb-2">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#2a2a2a] border border-white/5 rounded-xl p-3.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#c8a646] focus:border-[#c8a646] transition-all"
                  placeholder="Repita a nova senha"
                  required={newPassword.length > 0}
                />
              </motion.div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || (newEmail === userEmail && !newPassword)}
            className="w-full mt-4 bg-[#cca84b] hover:bg-[#e0bb5e] text-[#1a1a1a] font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgba(204,168,75,0.39)] hover:shadow-[0_6px_20px_rgba(204,168,75,0.23)]"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <Save size={20} />
                <span>Salvar Alterações</span>
              </>
            )}
          </button>
        </form>
      </div>

    </div>
  );
}
