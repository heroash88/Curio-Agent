import { AppMode as GlobalAppMode } from '../hooks/useAppMode';

export type LiveModuleMode = 'global';

export const SUBJECT_CONFIG: Record<GlobalAppMode, { name: string; modeStr: LiveModuleMode; context: string }> = {
    [GlobalAppMode.HOME]: { name: 'Home', modeStr: 'global', context: 'The user is on the Home screen.' },
    [GlobalAppMode.CURIO_MODE]: { name: 'Curio Agent', modeStr: 'global', context: 'The user is talking directly to you, Curio, their friendly AI companion.' },
};
