/**
 * Timer and alarm handlers. Alarms are persisted through settingsStorage and
 * emit an `alarm` card after every mutation so the AI and the UI stay in sync.
 */

import { getPersistedAlarms, setPersistedAlarms } from '../../../utils/settingsStorage';
import { randomId } from '../../../utils/randomId';
import { register } from '../router';

register('setTimer', async (args, ctx) => {
    const durationMs = (args?.durationSeconds || 60) * 1000;
    const label = args?.label || `${Math.round(durationMs / 1000)}s Timer`;
    const isAlarm = args?.isAlarm === true;
    const targetTime = Date.now() + durationMs;
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'timer', data: { label, isAlarm, targetTime, duration: durationMs, completionState: 'running' }, persistent: true });
        } catch {}
    }
    return { result: { success: true, timerSet: true, label, durationSeconds: args?.durationSeconds, isAlarm }, emittedCard: true };
});

register('cancelTimer', async (_args, ctx) => {
    if (ctx.onCardEvent) {
        try { ctx.onCardEvent({ type: 'list', data: { title: '⏱️ Timer Cancelled', items: ['All active timers have been cancelled.'] }, autoDismissMs: 3000 }); } catch {}
    }
    const { clearPersistedTimers } = await import('../../timerPersistence');
    clearPersistedTimers();
    return { result: { success: true, timersCancelled: true }, emittedCard: true };
});

register('set_alarm', async (args, ctx) => {
    const alarms = getPersistedAlarms();
    const newAlarm = { id: randomId(), label: args?.label || `Alarm ${args?.time}`, time: args?.time || '07:00', enabled: true, days: args?.days || [] };
    alarms.push(newAlarm);
    setPersistedAlarms(alarms);
    if (ctx.onCardEvent) { try { ctx.onCardEvent({ type: 'alarm', data: { alarms, mode: 'list' } }); } catch {} }
    return { result: { success: true, alarmSet: true, alarm: newAlarm }, emittedCard: true };
});

register('get_alarms', async (_args, ctx) => {
    const alarms = getPersistedAlarms();
    if (ctx.onCardEvent) { try { ctx.onCardEvent({ type: 'alarm', data: { alarms, mode: 'list' }, persistent: true }); } catch {} }
    return { result: { success: true, alarms }, emittedCard: true };
});

register('delete_alarm', async (args, ctx) => {
    let alarms = getPersistedAlarms();
    const before = alarms.length;
    if (args?.alarmId) alarms = alarms.filter(a => a.id !== args.alarmId);
    else if (args?.time) alarms = alarms.filter(a => a.time !== args.time);
    else if (args?.label) { const label = (args.label as string).toLowerCase(); alarms = alarms.filter(a => !a.label.toLowerCase().includes(label)); }
    const deleted = before - alarms.length;
    if (deleted <= 0) {
        return {
            result: {
                success: false,
                deleted: 0,
                remaining: before,
                error: 'No matching alarm was found.',
            },
            emittedCard: false,
        };
    }
    setPersistedAlarms(alarms);
    if (ctx.onCardEvent) {
        try { ctx.onCardEvent({ type: 'alarm', data: { alarms, mode: 'list' }, persistent: alarms.length > 0 }); } catch {}
    }
    return { result: { success: true, deleted, remaining: alarms.length }, emittedCard: true };
});
