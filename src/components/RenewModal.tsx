import { useState, useEffect } from 'react';
import { Customer, Server, Plan } from '../types';
import { Modal } from './Modal';
import { format, addMonths, addHours, isAfter } from 'date-fns';
import { parseRobustLocalTime, formatForDateTimeInput, formatForDateInput } from '../utils';

interface RenewModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
    servers: Server[];
    plans: Plan[];
    onConfirm: (data: { serverId: string; planId: string; amountPaid: string; dueDate: string }) => void;
}

export function RenewModal({ isOpen, onClose, customer, servers, plans, onConfirm }: RenewModalProps) {
    const [formData, setFormData] = useState({
        serverId: '',
        planId: '',
        amountPaid: '',
        dueDate: ''
    });

    const calculateNewDueDate = (currentDueDateStr: string, plan: Plan) => {
        const today = new Date();
        const currentDueDate = parseRobustLocalTime(currentDueDateStr);

        const isActive = isAfter(currentDueDate, today) || Math.round((currentDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) === 0;
        const baseDate = isActive ? currentDueDate : today;

        if (plan.name?.toLowerCase().includes('teste')) {
            return addHours(baseDate, 4).toISOString();
        }
        return format(addMonths(baseDate, plan.months), 'yyyy-MM-dd');
    };

    useEffect(() => {
        if (customer) {
            const plan = plans.find(p => p.id === customer.planId);
            const rawDueDate = plan 
                ? calculateNewDueDate(customer.dueDate, plan) 
                : customer.dueDate;

            const isTest = plan?.name?.toLowerCase().includes('teste');
            const initialDueDate = isTest || rawDueDate.includes('Z') || rawDueDate.includes('T')
                ? formatForDateTimeInput(rawDueDate)
                : formatForDateInput(rawDueDate);

            setFormData({
                serverId: customer.serverId,
                planId: customer.planId,
                amountPaid: customer.amountPaid.toString(),
                dueDate: initialDueDate
            });
        }
    }, [customer, plans]);

    const handlePlanChange = (planId: string) => {
        const plan = plans.find(p => p.id === planId);
        if (plan && customer) {
            const rawDueDate = calculateNewDueDate(customer.dueDate, plan);
            const isTest = plan.name?.toLowerCase().includes('teste');
            const newDueDate = isTest || rawDueDate.includes('Z') || rawDueDate.includes('T')
                ? formatForDateTimeInput(rawDueDate)
                : formatForDateInput(rawDueDate);

            setFormData({
                ...formData,
                planId,
                amountPaid: plan.defaultPrice.toString(),
                dueDate: newDueDate
            });
        }
    };

    const handleConfirm = () => {
        onConfirm(formData);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Renovar Plano">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Servidor</label>
                    <select
                        value={formData.serverId}
                        onChange={e => setFormData({ ...formData, serverId: e.target.value })}
                        className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] appearance-none"
                    >
                        {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Plano</label>
                    <select
                        value={formData.planId}
                        onChange={e => handlePlanChange(e.target.value)}
                        className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646] appearance-none"
                    >
                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Valor (R$)</label>
                        <input
                            type="text"
                            value={formData.amountPaid}
                            onChange={e => setFormData({ ...formData, amountPaid: e.target.value })}
                            className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646]"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Vencimento</label>
                        <input
                            type={formData.planId && plans.find(p => p.id === formData.planId)?.name?.toLowerCase().includes('teste') ? "datetime-local" : "date"}
                            value={formData.dueDate}
                            onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                            className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#c8a646]"
                        />
                    </div>
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
                        className="flex-1 py-3 rounded-xl bg-[#c8a646] text-[#0f0f0f] font-bold hover:bg-[#e8c666] transition-colors shadow-lg shadow-[#c8a646]/20"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </Modal>
    );
}
