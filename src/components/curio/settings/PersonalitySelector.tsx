import React from 'react';
import { PERSONALITY_PRESETS, usePersonalityId, useCustomPersonalityPrompt, setPersonalityId, setCustomPersonalityPrompt } from '../../../utils/settingsStorage';
import type { PersonalityId } from '../../../utils/settingsStorage';
import { Bot, Baby, School, Laugh, Briefcase, Smile, Wind, Zap, Pencil } from 'lucide-react';

const PERSONALITY_ICONS: Record<string, React.ReactNode> = {
    default: <Bot size={20} className="text-sky-500" />,
    'kids-young': <Baby size={20} className="text-pink-500" />,
    'kids-older': <School size={20} className="text-amber-500" />,
    fun: <Laugh size={20} className="text-orange-500" />,
    professional: <Briefcase size={20} className="text-slate-600" />,
    sarcastic: <Smile size={20} className="text-indigo-500" />,
    zen: <Wind size={20} className="text-emerald-500" />,
    bender: <Zap size={20} className="text-orange-600" />,
    custom: <Pencil size={20} className="text-violet-500" />,
};

const PersonalitySelector: React.FC = () => {
    const personalityId = usePersonalityId();
    const customPrompt = useCustomPersonalityPrompt();

    return (
        <div className="space-y-2">
            <p className="text-[11px] text-slate-400">Choose how Curio talks and behaves.</p>
            <div className="grid grid-cols-2 gap-2">
                {PERSONALITY_PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        onClick={() => setPersonalityId(preset.id as PersonalityId)}
                        className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all active:scale-[0.98] h-[84px] ${personalityId === preset.id
                                ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-100'
                                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                            }`}
                    >
                        <div className="mt-0.5 shrink-0">
                            {PERSONALITY_ICONS[preset.id] || <Bot size={20} />}
                        </div>
                        <div className="min-w-0">
                            <p className={`text-xs font-bold ${personalityId === preset.id ? 'text-sky-700' : 'text-slate-700'}`}>{preset.label}</p>
                            <p className="text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-2">{preset.description}</p>
                        </div>
                    </button>
                ))}
            </div>
            {personalityId === 'custom' && (
                <div className="mt-2 space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Custom Personality</label>
                    <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPersonalityPrompt(e.target.value)}
                        placeholder="Describe how Curio should behave... e.g. 'Be a pirate who loves science'"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none resize-none h-24 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    />
                </div>
            )}
        </div>
    );
};

export default PersonalitySelector;
