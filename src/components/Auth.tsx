import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, User, Lock, AlertCircle, Loader2 } from 'lucide-react';

export function Auth() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const loginEmail = email.includes('@') ? email : `${email}@arfcanais.com`;
            const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro inesperado');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0f0f0f]">
            {/* Background Decorations */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#c8a646]/5 blur-[100px] rounded-full animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#c8a646]/5 blur-[100px] rounded-full animate-pulse delay-700" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-sm relative z-10"
            >
                <div className="bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden">
                    <div className="text-center mb-10">
                        <div className="inline-flex p-4 rounded-3xl bg-gradient-to-br from-[#c8a646] to-[#e8c666] mb-6 shadow-xl shadow-[#c8a646]/20">
                            <LogIn className="text-[#0f0f0f]" size={32} />
                        </div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">
                            ARF Canais
                        </h1>
                        <p className="text-gray-400 text-sm font-medium uppercase tracking-[0.2em]">
                            Bem-vindo de volta
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                                Usuário ou E-mail
                            </label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={18} />
                                <input
                                    type="text"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
                                    className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-4 focus:ring-[#c8a646]/10 transition-all text-sm"
                                    placeholder="seu.usuario"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                                Senha
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#c8a646] transition-colors" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-[#0f0f0f]/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-[#c8a646] focus:ring-4 focus:ring-[#c8a646]/10 transition-all text-sm"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3"
                                >
                                    <AlertCircle className="text-red-400 shrink-0" size={18} />
                                    <p className="text-red-400 text-xs font-medium leading-relaxed">{error}</p>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full relative py-4 bg-[#c8a646] hover:bg-[#e8c666] disabled:opacity-50 text-[#0f0f0f] font-black rounded-2xl transition-all shadow-xl shadow-[#c8a646]/20 active:scale-[0.98] overflow-hidden group"
                        >
                            <span className={`inline-flex items-center justify-center space-x-2 transition-all ${loading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                                <span>ENTRAR</span>
                                <LogIn size={20} />
                            </span>
                            {loading && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="animate-spin" size={24} />
                                </div>
                            )}
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
