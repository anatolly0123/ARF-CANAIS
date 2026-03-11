import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Camera, Save, Loader2, AlertCircle, CheckCircle, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Crop State
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // Security Form State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setMessage(null);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      
      // Basic check
      if (!file.type.startsWith('image/')) {
        throw new Error('O arquivo selecionado não é uma imagem válida.');
      }

      // Read file to data URL for cropping
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setTempImageSrc(reader.result?.toString() || null);
      };
      
      // clear the input so the same file could be selected again if canceled
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erro ao ler arquivo da imagem.' });
    }
  };

  const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleConfirmCrop = async () => {
    if (!tempImageSrc || !croppedAreaPixels) return;

    try {
      setUploadingAvatar(true);
      setMessage(null);

      // Get Cropped Blob
      const croppedImageBlob = await getCroppedImg(
        tempImageSrc,
        croppedAreaPixels
      );

      if (!croppedImageBlob) {
         throw new Error('Falha ao processar o recorte da imagem.');
      }

      const fileExt = tempImageSrc.substring("data:image/".length, tempImageSrc.indexOf(";base64")) || 'jpeg';
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const file = new File([croppedImageBlob], fileName, { type: `image/${fileExt}` });

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Usuário não autenticado.');

      // 1. Upload the image
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // 2. Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update profile record
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      onAvatarUpdate(data.publicUrl);
      setMessage({ type: 'success', text: 'Foto de perfil atualizada!' });
      setTempImageSrc(null); // Close crop modal
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erro ao atualizar foto.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

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
              {uploadingAvatar ? (
                <Loader2 className="animate-spin text-white/50" size={32} />
              ) : userAvatar ? (
                <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{getInitial()}</span>
              )}
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-1 right-1 p-2 bg-[#c8a646] text-[#0f0f0f] rounded-full shadow-lg border-2 border-[#1a1a1a] hover:bg-[#e8c666] transition-colors disabled:opacity-50"
            >
              <Camera size={14} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleAvatarUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
        </div>

        {/* Space for Avatar */}
        <div className="text-center mt-12 mb-8">
          <h3 className="text-lg font-bold text-white">Foto de Perfil</h3>
          <p className="text-sm text-gray-400">Clique na câmera para alterar</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-start space-x-3 text-sm font-medium ${
            message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
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

      {/* Image Crop Modal Overlay */}
      {tempImageSrc && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
           {/* Header */}
           <div className="w-full max-w-md flex items-center justify-between mb-4 z-10">
              <h3 className="text-white font-bold text-lg">Ajustar Foto</h3>
              <button 
                onClick={() => setTempImageSrc(null)} 
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                disabled={uploadingAvatar}
              >
                <X size={20} />
              </button>
           </div>
           
           {/* Cropper Container */}
           <div className="relative w-full max-w-md h-[400px] sm:h-[500px] bg-[#1a1a1a] rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl z-10">
              {uploadingAvatar ? (
                 <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
                   <Loader2 className="animate-spin text-[#c8a646] mb-4" size={40} />
                   <p className="text-white font-bold uppercase tracking-wider text-sm">Salvando...</p>
                 </div>
              ) : null}

              <Cropper
                image={tempImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                objectFit="contain"
                cropShape="round"
                showGrid={false}
                style={{
                  containerStyle: { background: '#000' },
                  cropAreaStyle: { border: '2px solid rgba(200, 166, 70, 0.8)' }
                }}
              />
           </div>

           {/* Controls Container */}
           <div className="w-full max-w-md mt-6 space-y-4 z-10 bg-[#1a1a1a] p-4 rounded-2xl border border-white/10">
             <div>
               <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2 block text-center">Zoom da Imagem</label>
               <input
                 type="range"
                 value={zoom}
                 min={1}
                 max={3}
                 step={0.1}
                 aria-labelledby="Zoom"
                 onChange={(e) => setZoom(Number(e.target.value))}
                 className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#c8a646]"
                 disabled={uploadingAvatar}
               />
             </div>
             
             <button
                onClick={handleConfirmCrop}
                disabled={uploadingAvatar}
                className="w-full py-3.5 bg-gradient-to-r from-[#c8a646] to-[#e8c666] hover:from-[#e8c666] hover:to-[#f9d777] text-[#0f0f0f] font-black rounded-xl transition-all active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgba(204,168,75,0.39)] hover:shadow-[0_6px_20px_rgba(204,168,75,0.23)]"
             >
                <Check size={20} strokeWidth={3} />
                <span>CONFIRMAR CORTE</span>
             </button>
           </div>
        </div>
      )}
    </div>
  );
}
