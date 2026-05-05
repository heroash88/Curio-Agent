import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_FACE_SCALE,
  getDesktopFaceScale,
  getDesktopFloatingEnabled,
  getDesktopSubtitlesEnabled,
  getDesktopTextInputEnabled,
  setDesktopFaceScale,
  setDesktopFloatingEnabled,
  setDesktopSubtitlesEnabled,
  setDesktopTextInputEnabled,
} from '../utils/settingsStorage';

describe('desktop floating settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps floating mode opt-in', () => {
    expect(getDesktopFloatingEnabled()).toBe(false);

    setDesktopFloatingEnabled(true);
    expect(getDesktopFloatingEnabled()).toBe(true);

    setDesktopFloatingEnabled(false);
    expect(getDesktopFloatingEnabled()).toBe(false);
  });

  it('stores a clamped floating face scale', () => {
    expect(getDesktopFaceScale()).toBe(DEFAULT_DESKTOP_FACE_SCALE);

    setDesktopFaceScale(22);
    expect(getDesktopFaceScale()).toBe(60);

    setDesktopFaceScale(450);
    expect(getDesktopFaceScale()).toBe(450);

    setDesktopFaceScale(900);
    expect(getDesktopFaceScale()).toBe(600);

    setDesktopFaceScale(135);
    expect(getDesktopFaceScale()).toBe(135);
  });

  it('keeps floating text input and subtitles optional', () => {
    expect(getDesktopTextInputEnabled()).toBe(true);
    expect(getDesktopSubtitlesEnabled()).toBe(false);

    setDesktopTextInputEnabled(false);
    setDesktopSubtitlesEnabled(true);

    expect(getDesktopTextInputEnabled()).toBe(false);
    expect(getDesktopSubtitlesEnabled()).toBe(true);
  });
});
