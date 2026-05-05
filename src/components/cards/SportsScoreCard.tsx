import React, { useState } from 'react';
import type { CardComponentProps, SportsScoreCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const DESIGN_TOKEN = 'card-glass';

const TeamLogo: React.FC<{ url?: string; name: string; panel: string; muted: string }> = ({ url, name, panel, muted }) => {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className={`w-10 h-10 rounded-full ${panel} flex items-center justify-center text-lg font-bold ${muted} shrink-0`}>
        {name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className={`w-10 h-10 rounded-full object-cover ${panel} shrink-0`}
      onError={() => setFailed(true)}
    />
  );
};

const SportsScoreCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as SportsScoreCardData;

  return (
    <div className={DESIGN_TOKEN}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">⚽</span>
        <span className={`${t.text} font-bold font-headline`}>Score</span>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <TeamLogo url={data.homeLogoUrl} name={data.homeTeam} panel={t.panel} muted={t.muted} />
          <p className={`${t.text} font-semibold text-xs text-center leading-tight`}>{data.homeTeam}</p>
        </div>
        <div className="flex items-center gap-3 px-4">
          <span className={`text-3xl font-bold font-headline ${t.text}`}>{data.homeScore}</span>
          <span className={t.faint}>-</span>
          <span className={`text-3xl font-bold font-headline ${t.text}`}>{data.awayScore}</span>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <TeamLogo url={data.awayLogoUrl} name={data.awayTeam} panel={t.panel} muted={t.muted} />
          <p className={`${t.text} font-semibold text-xs text-center leading-tight`}>{data.awayTeam}</p>
        </div>
      </div>
      <div className="flex justify-center mt-3">
        <span className={`px-2 py-0.5 rounded-full ${t.btn} text-xs ${t.text}`}>
          {data.status}
        </span>
      </div>
    </div>
  );
};

export default React.memo(SportsScoreCard);
