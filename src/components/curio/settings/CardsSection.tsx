import React, { lazy, Suspense } from 'react';
import { CreditCard } from 'lucide-react';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';

const CardTogglesSection = lazy(() => import('../CardTogglesSection'));

interface CardsSectionProps {
    responseCardsEnabled: boolean;
    setResponseCardsEnabled: (v: boolean) => void;
    transcriptCardsEnabled: boolean;
    setTranscriptCardsEnabled: (v: boolean) => void;
}

const CardsSection: React.FC<CardsSectionProps> = ({
    responseCardsEnabled, setResponseCardsEnabled,
    transcriptCardsEnabled, setTranscriptCardsEnabled,
}) => (
    <SettingsSection title="Cards" icon={<CreditCard size={18} className="text-violet-500" />}>
        <p className="text-[11px] text-slate-400 mb-3">Cards are visual pop-ups that appear during conversations -- weather, timers, music, smart home controls, and more.</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
            <SettingsToggle label="Response Cards" description="Show visual card pop-ups" enabled={responseCardsEnabled} onToggle={() => setResponseCardsEnabled(!responseCardsEnabled)} color="bg-violet-500" />
            <SettingsToggle label="Extra Card Detection" description="Detect cards from AI speech text (may show unexpected cards)" enabled={transcriptCardsEnabled} onToggle={() => setTranscriptCardsEnabled(!transcriptCardsEnabled)} color="bg-teal-500" />
        </div>
        <p className="text-[11px] text-slate-400 mb-2">Choose which card types Curio can show. Disabled cards won't appear even when triggered.</p>
        <Suspense fallback={<p className="text-xs text-slate-400">Loading...</p>}>
            <CardTogglesSection />
        </Suspense>
    </SettingsSection>
);

export default React.memo(CardsSection);
