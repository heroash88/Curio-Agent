import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  setCardEnabled,
  useCardEnabled,
  type CardToggleKey,
} from './settingsStorage';
import { subscribeToSettingsStorage } from './settings/core';

const CardToggleProbe = ({ cardType }: { cardType: CardToggleKey }) => {
  const enabled = useCardEnabled(cardType);
  return createElement('output', { 'aria-label': 'card-enabled' }, enabled ? 'enabled' : 'disabled');
};

describe('settings storage hooks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('refreshes dynamic setting readers when hook parameters change', () => {
    setCardEnabled('weather', false);
    setCardEnabled('timer', true);

    const { rerender } = render(createElement(CardToggleProbe, { cardType: 'weather' }));

    expect(screen.getByLabelText('card-enabled')).toHaveTextContent('disabled');

    rerender(createElement(CardToggleProbe, { cardType: 'timer' }));

    expect(screen.getByLabelText('card-enabled')).toHaveTextContent('enabled');
  });

  it('coalesces same-tick storage and settings change events', async () => {
    const onStoreChange = vi.fn();
    const unsubscribe = subscribeToSettingsStorage(onStoreChange);

    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));

    expect(onStoreChange).toHaveBeenCalledTimes(0);

    await Promise.resolve();

    expect(onStoreChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
