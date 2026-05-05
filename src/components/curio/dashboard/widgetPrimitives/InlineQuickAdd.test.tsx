import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import InlineQuickAdd from './InlineQuickAdd';

interface DemoParsed {
  value: string;
}

const successParser = (input: string): DemoParsed | { parseError: string } => {
  if (input.startsWith('bad')) return { parseError: 'nope' };
  return { value: input };
};

describe('InlineQuickAdd', () => {
  it('renders the supplied placeholder', () => {
    render(
      <InlineQuickAdd<DemoParsed>
        placeholder="Quick-add a task"
        parser={successParser}
        onSubmit={() => {}}
      />,
    );
    expect(
      screen.getByPlaceholderText('Quick-add a task'),
    ).toBeInTheDocument();
  });

  it('calls onSubmit with the parsed result and clears the input on Enter', () => {
    const onSubmit = vi.fn();
    render(
      <InlineQuickAdd<DemoParsed>
        placeholder="Quick-add"
        parser={successParser}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>('Quick-add');
    fireEvent.change(input, { target: { value: 'hello world' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ value: 'hello world' });
    expect(input.value).toBe('');
  });

  it('displays the parse error and does not call onSubmit when invalid', () => {
    const onSubmit = vi.fn();
    render(
      <InlineQuickAdd<DemoParsed>
        placeholder="Quick-add"
        parser={successParser}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>('Quick-add');
    fireEvent.change(input, { target: { value: 'bad apples' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('nope')).toBeInTheDocument();
    // Input retains the rejected value so the user can edit and retry.
    expect(input.value).toBe('bad apples');
  });

  it('clears and calls onDismiss on Escape', () => {
    const onDismiss = vi.fn();
    render(
      <InlineQuickAdd<DemoParsed>
        placeholder="Quick-add"
        parser={successParser}
        onSubmit={() => {}}
        onDismiss={onDismiss}
      />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>('Quick-add');
    fireEvent.change(input, { target: { value: 'something' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('renders the shortcut hint when showShortcutHint is true', () => {
    render(
      <InlineQuickAdd<DemoParsed>
        placeholder="Quick-add"
        parser={successParser}
        onSubmit={() => {}}
        showShortcutHint
      />,
    );
    // Matches both "⌘N" and "Ctrl+N" variants.
    expect(screen.getByText(/⌘N|Ctrl\+N/)).toBeInTheDocument();
  });
});
