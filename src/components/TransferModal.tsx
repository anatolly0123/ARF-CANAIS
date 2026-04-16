import { useState, useEffect } from 'react';
import { Customer, Server } from '../types';
import { Modal } from './Modal';
import { ArrowRightLeft } from 'lucide-react';

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
    servers: Server[];
    onConfirm: (newServerId: string) => void;
}

export function TransferModal({ isOpen, onClose, customer, servers, onConfirm }: TransferModalProps) {
    const [selectedServerId, setSelectedServerId] = useState('');

    useEffect(() => {
        if (customer) {
            setSelectedServerId(customer.serverId);
        }
    }, [customer]);

    const handleConfirm = () => {
        if (selectedServerId) {
            onConfirm(selectedServerId);
            onClose();
        }
    };

    const currentServer = servers.find(s => s.id === customer?.serverId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Mudar Servidor">
            <div className="space-y-6">
                <div className="bg-[#0f0f0f] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                    <div className="text-center flex-1">
                        <div className="text-[10px] uppercase font-bold text-gray-500 mb-1">Atual</div>
                        <div className="text-white font-bold">{currentServer?.name || '---'}</div>
                    </div>
                    <div className="px-4 text-[#c8a646]">
                        <ArrowRightLeft size={20} />
                    </div>
                    <div className="text-center flex-1">
                        <div className="text-[10px] uppercase font-bold text-[#c8a646] mb-1">Novo</div>
                        <div className="text-white font-bold">
                            {servers.find(s => s.id === selectedServerId)?.name || '---'}
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Selecione o Novo Servidor</label>
                    <select
                        value={selectedServerId}
                        onChange={e => setSelectedServerId(e.target.value)}
                        className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] appearance-none"
                    >
                        {servers.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name} {s.id === customer?.serverId ? '(Atual)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl">
                    <p className="text-[10px] text-yellow-500 font-medium leading-tight">
                        A transferência atualizará o servidor do cliente e também o seu último registro de renovação para fins de contabilidade no Dashboard.
                    </p>
                </div>

                <div className="flex space-x-3 mt-8 pt-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedServerId === customer?.serverId}
                        className={`flex-1 py-3 rounded-xl font-bold transition-colors shadow-lg ${selectedServerId === customer?.serverId
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-[#c8a646] text-[#0f0f0f] hover:bg-[#e8c666] shadow-[#c8a646]/20'
                            }`}
                    >
                        Transferir
                    </button>
                </div>
            </div>
        </Modal>
    );
}
