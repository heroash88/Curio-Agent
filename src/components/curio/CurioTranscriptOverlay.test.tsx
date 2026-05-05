import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CurioTranscriptOverlay } from './CurioTranscriptOverlay';

describe('CurioTranscriptOverlay', () => {
    it('renders markdown links as compact labels in subtitles', () => {
        render(
            <CurioTranscriptOverlay
                showTranscript
                showTextInput={false}
                effectiveUserTranscript={null}
                effectiveModelTranscript={'Aston Villa lead 2-1 ([standard.co.uk](https://www.standard.co.uk/sport/football/live-score.html?utm_source=nova.amazon.com)).'}
                latchedUserValue={null}
                latchedModelValue={null}
                effectiveIsSpeaking
            />,
        );

        expect(screen.getByText('standard.co.uk')).toBeInTheDocument();
        expect(screen.queryByText(/\]\(/)).not.toBeInTheDocument();
        expect(screen.queryByText(/https:\/\/www\.standard\.co\.uk/)).not.toBeInTheDocument();
    });
});
