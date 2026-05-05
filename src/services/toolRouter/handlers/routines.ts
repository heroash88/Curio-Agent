/**
 * Routine and notification handlers.
 *
 * run_routine delegates step execution to routineEngine and uses
 * getToolHandler() to invoke nested tool calls through the shared
 * registry. The nested handler must receive the same ToolCallContext so
 * emitted cards reach the UI.
 */

import { requestAmbientSpeech } from '../../ambientOutput';
import { getRoutines, markRoutineRunAt } from '../../../utils/settingsStorage';
import { getToolHandler, register } from '../router';

register('run_routine', async (args, ctx) => {
    const routineId = String(args?.routineId || '').trim();
    const routineName = String(args?.routineName || '').trim();
    if (!routineId && !routineName) {
        return { result: { success: false, error: 'routineId is required.' }, emittedCard: false };
    }

    try {
        const { executeRoutine } = await import('../../routineEngine');
        const routines = getRoutines();
        const routine = routineId
            ? routines.find((item) => item.id === routineId)
            : routines.find((item) => item.name.toLowerCase() === routineName.toLowerCase());

        if (!routine) {
            return {
                result: { success: false, error: `Routine "${routineId || routineName}" not found.` },
                emittedCard: false,
            };
        }

        if (ctx.onCardEvent) {
            const stepSummaries = routine.steps
                .filter((step) => step.enabled)
                .map((step) => {
                    if (step.type === 'speak') {
                        return `Speak: ${String((step.config as { text?: string }).text || '').trim() || '...'} `;
                    }
                    if (step.type === 'tool_call') {
                        return `Tool: ${String((step.config as { toolName?: string }).toolName || 'Unknown tool')}`;
                    }
                    if (step.type === 'ha_service') {
                        return `Home Assistant: ${String((step.config as { service?: string }).service || 'service')}`;
                    }
                    if (step.type === 'show_card') {
                        return `Show card: ${String((step.config as { type?: string }).type || 'card')}`;
                    }
                    if (step.type === 'wait') {
                        return `Wait ${Math.round(Number((step.config as { durationMs?: number }).durationMs || 0) / 1000)}s`;
                    }
                    return step.type;
                });

            try {
                ctx.onCardEvent({
                    type: 'list',
                    data: {
                        title: `${routine.icon} Running ${routine.name}`,
                        items: stepSummaries.length > 0 ? stepSummaries : ['No enabled steps'],
                    },
                    autoDismissMs: 6_000,
                });
            } catch {}
        }

        const executeInBackground = async () => {
            const result = await executeRoutine({ ...routine, enabled: true }, {
                emitCardEvent: (event) => ctx.onCardEvent?.(event),
                speak: (text) => {
                    const speak = ctx.requestAmbientSpeech || ((value: string) => requestAmbientSpeech({ text: value, reason: 'routine' }));
                    speak(text);
                },
                callTool: async (toolName, toolArgs) => {
                    const nestedHandler = getToolHandler(toolName);
                    if (!nestedHandler) {
                        return { success: false, error: `Unknown tool: ${toolName}` };
                    }

                    const nestedResult = await nestedHandler(toolArgs || {}, ctx);
                    return nestedResult.result;
                },
            });

            markRoutineRunAt(routine.id);

            if (ctx.onCardEvent) {
                try {
                    ctx.onCardEvent({
                        type: 'list',
                        data: {
                            title: `${routine.icon} ${routine.name}`,
                            items: [
                                result.completed
                                    ? `Completed ${result.stepsRun} of ${result.totalSteps} steps`
                                    : `Finished with issues after ${result.stepsRun} of ${result.totalSteps} steps`,
                                ...(result.error ? [result.error] : []),
                            ],
                        },
                        autoDismissMs: 8_000,
                    });
                } catch {}
            }
        };

        void executeInBackground();

        return {
            result: { success: true, status: `Started routine: ${routine.name}`, routineId: routine.id },
            emittedCard: true,
        };
    } catch (e) {
        return {
            result: { success: false, error: (e as Error).message },
            emittedCard: false,
        };
    }
});

register('list_routines', async (_args, ctx) => {
    const routines = getRoutines();
    const summary = routines.map(r => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        enabled: r.enabled,
        trigger: r.trigger.type === 'voice' ? `Voice: "${r.trigger.phrase || 'no phrase'}"` :
                 r.trigger.type === 'schedule' ? `Schedule: ${r.trigger.cron || '?'}${r.trigger.days?.length ? ' on ' + r.trigger.days.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(',') : ''}` :
                 `Event: ${r.trigger.event || '?'}`,
        steps: r.steps.filter(s => s.enabled).length,
        lastRun: r.lastRunAt ? new Date(r.lastRunAt).toLocaleString() : 'Never',
    }));
    if (ctx.onCardEvent && routines.length > 0) {
        try {
            ctx.onCardEvent({
                type: 'list',
                data: {
                    title: 'My Routines',
                    items: summary.map(r => `${r.icon} ${r.name} (${r.enabled ? 'on' : 'off'}) -- ${r.trigger}`),
                },
                autoDismissMs: 15000,
            });
        } catch {}
    }
    return { result: { success: true, routines: summary, count: routines.length }, emittedCard: routines.length > 0 };
});

register('list_notifications', async (_args, ctx) => {
    const {
        getNotificationRuleEffectiveEnabled,
        getNotificationSystemStatus,
        getProactiveConfig,
    } = await import('../../../utils/settingsStorage');
    const { getNotificationPriorityDetails } = await import('../../notificationPriority');
    const config = getProactiveConfig();
    const status = getNotificationSystemStatus(config);
    const summary = {
        enabled: status.enabled,
        activeRuleCount: status.activeRuleCount,
        availableRuleCount: status.availableRuleCount,
        rules: config.rules.map(r => {
            const priorityDetails = getNotificationPriorityDetails(r.priority);
            return {
                id: r.id,
                kind: r.kind,
                label: r.label,
                enabled: getNotificationRuleEffectiveEnabled(r.id, config),
                configured: r.enabled,
                priority: r.priority,
                priorityLabel: priorityDetails.label,
                priorityMeaning: priorityDetails.description,
                prioritySound: priorityDetails.soundDescription,
                speak: r.speak,
                sound: r.sound,
                showCard: r.showCard,
                ...(r.kind === 'calendar' ? { leadMinutes: r.leadMinutes } : {}),
                ...(r.kind === 'reminder' ? { dueWindowMinutes: r.dueWindowMinutes } : {}),
                ...(r.kind === 'weather' ? { conditions: r.conditions } : {}),
                ...(r.kind === 'schedule' ? { title: r.title, message: r.message, time: r.time, days: r.days } : {}),
            };
        }),
    };
    if (ctx.onCardEvent && config.rules.length > 0) {
        try {
            ctx.onCardEvent({
                type: 'list',
                data: {
                    title: status.enabled ? 'Notification Rules' : 'Notifications Paused',
                    items: summary.rules.map(r => {
                        const ruleStatus = r.enabled ? 'on' : status.enabled ? 'off' : 'paused';
                        if (r.kind === 'schedule') return `${r.label} (${ruleStatus}) -- ${(r as any).time} ${(r as any).days?.map((d: number) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(',') || 'daily'}`;
                        return `${r.label} (${ruleStatus}) -- ${r.priorityLabel} priority, ${r.priorityMeaning.toLowerCase()}`;
                    }),
                },
                autoDismissMs: 15000,
            });
        } catch {}
    }
    return { result: { success: true, ...summary }, emittedCard: config.rules.length > 0 };
});
