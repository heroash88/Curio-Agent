import { useAppBackgroundColor, useAppBackgroundStyle, useAnimationsEnabled, useBenderSoundsEnabled, useClockShowSeconds, useClockUse24Hour, useClockWidgetPosition, useClockWidgetScale, useConnectButtonPosition, useConnectButtonScale, useFaceDefaultProfileId, useFacePassiveTrackingEnabled, useFaceRecognitionEnabled, useFaceStyleId, useFaceTrackingEnabled, useIdlePromptPosition, useIdlePromptScale, useIdleSleepTimeout, useLowPowerMode, useRobotColorThemeId, useRobotFaceScale, useScreensaverEnabled, useScreensaverSource, useScreensaverTimeout, useShowClockWidget, useShowIdlePrompt, useShowVoiceWaveform, useShowWeatherWidget, useThemeMode, useWeatherWidgetPosition, useWeatherWidgetScale, setAnimationsEnabled, setAppBackgroundColor, setAppBackgroundStyle, setBenderSoundsEnabled, setClockShowSeconds, setClockUse24Hour, setClockWidgetPosition, setClockWidgetScale, setConnectButtonPosition, setConnectButtonScale, setCustomRobotColor, setFaceDefaultProfileId, setFacePassiveTrackingEnabled, setFaceRecognitionEnabled, setFaceStyleId, setFaceTrackingEnabled, setIdlePromptPosition, setIdlePromptScale, setIdleSleepTimeout, setLowPowerMode, setPerformanceMode, setRobotColorThemeId, setRobotFaceScale, setScreensaverEnabled, setScreensaverSource, setScreensaverTimeout, setShowClockWidget, setShowIdlePrompt, setShowVoiceWaveform, setShowWeatherWidget, setThemeMode, setWeatherWidgetPosition, setWeatherWidgetScale } from './displaySettings';
import { useCustomLocations, useCustomLocation, useCustomLocationLabel, useGeminiApiKey, useHomeLocation, useLiveApiVoiceId, useSelectedWakeWordId, useTempUnit, useUserName, useWakeWordEnabled, useWeatherCity, useWorkLocation, setApiKey, setCustomLocations, setCustomLocation, setCustomLocationLabel, setHomeLocation, setLiveApiVoiceId, setSelectedWakeWordId, setTempUnit, setUserName, setWakeWordEnabled, setWeatherCity, setWorkLocation } from './basicSettings';
import { useGoogleAccessToken, useGoogleApiKey, useGoogleCalendarAccessToken, useGoogleSelectedAlbumId, useGoogleTasksAccessToken, useGmailAccessToken, useGmailReplyEnabled, useHaApiMode, useHaMcpAuthMode, useHaMcpEnabled, useHaMcpOauthState, useHaMcpToken, useHaMcpUrl, useOutlookCalendarAccessToken, useOutlookMailAccessToken, useOutlookReplyEnabled, useSlackAccessToken, useYouTubeApiKey, setGmailAccessToken, setGmailReplyEnabled, setGoogleAccessToken, setGoogleApiKey, setGoogleCalendarAccessToken, setGoogleSelectedAlbumId, setGoogleTasksAccessToken, setHaApiMode, setHaMcpAuthMode, setHaMcpEnabled, setHaMcpOauthState, setHaMcpToken, setHaMcpUrl, setOutlookCalendarAccessToken, setOutlookMailAccessToken, setOutlookReplyEnabled, setPickerPhotoUrls, setSlackAccessToken, setYouTubeApiKey } from './integrationSettings';
import { useResponseCardsEnabled, useTranscriptCardsEnabled, setCardEnabled, setResponseCardsEnabled, setTranscriptCardsEnabled } from './personalitySettings';
import { useClearVoiceEnabled, useCustomLLMBaseUrl, useCustomLLMModel, useCustomLLMProviderType, useCustomTTSVoiceId, useCustomTTSVoiceProfileId, useCustomTTSEngine, useHaVoicePipelineId, useMuteMicWhileAiSpeaking, useOfflineModeEnabled, useOpenAICompatibleProviderPresetId, useSpeakerMuted, useVoiceBackend, useVoiceGateThreshold, setClearVoiceEnabled, setCustomLLMApiKey, setCustomLLMBaseUrl, setCustomLLMModel, setCustomLLMProviderType, setCustomTTSVoiceId, setCustomTTSVoiceProfileId, setCustomTTSEngine, setHaVoicePipelineId, setMuteMicWhileAiSpeaking, setOfflineModeEnabled, setOllamaBaseUrl, setOllamaModel, setOpenAIBaseUrl, setOpenAICompatibleProviderPresetId, setOpenAIApiKey, setOpenAIModel, setSpeakerMuted, setVoiceBackend, setVoiceGateThreshold } from './voiceSettings';

/**
 * useSettingsStore

 * A simplified reactive store for CurioAgentMode settings.
 */
export const useSettingsStore = () => {
    const apiKey = useGeminiApiKey();
    const wakeWordEnabled = useWakeWordEnabled();
    const selectedWakeWordId = useSelectedWakeWordId();
    const liveApiVoiceId = useLiveApiVoiceId();
    const userName = useUserName();
    const weatherCity = useWeatherCity();
    const tempUnit = useTempUnit();
    const haMcpUrl = useHaMcpUrl();
    const haMcpToken = useHaMcpToken();
    const haMcpEnabled = useHaMcpEnabled();
    const haMcpAuthMode = useHaMcpAuthMode();
    const haApiMode = useHaApiMode();
    const haMcpOauthState = useHaMcpOauthState();
    const lowPowerMode = useLowPowerMode();
    const muteMicWhileAiSpeaking = useMuteMicWhileAiSpeaking();
    const clearVoiceEnabled = useClearVoiceEnabled();
    const voiceGateThreshold = useVoiceGateThreshold();
    const responseCardsEnabled = useResponseCardsEnabled();
    const transcriptCardsEnabled = useTranscriptCardsEnabled();
    const youTubeApiKey = useYouTubeApiKey();
    const googleApiKey = useGoogleApiKey();
    const screensaverEnabled = useScreensaverEnabled();
    const screensaverTimeout = useScreensaverTimeout();
    const screensaverSource = useScreensaverSource();
    const googleAccessToken = useGoogleAccessToken();
    const googleTasksAccessToken = useGoogleTasksAccessToken();
    const googleCalendarAccessToken = useGoogleCalendarAccessToken();
    const googleSelectedAlbumId = useGoogleSelectedAlbumId();
    const faceTrackingEnabled = useFaceTrackingEnabled();
    const faceRecognitionEnabled = useFaceRecognitionEnabled();
    const facePassiveTrackingEnabled = useFacePassiveTrackingEnabled();
    const faceDefaultProfileId = useFaceDefaultProfileId();
    const animationsEnabled = useAnimationsEnabled();
    const themeMode = useThemeMode();
    const idleSleepTimeout = useIdleSleepTimeout();
    const clockWidgetScale = useClockWidgetScale();
    const weatherWidgetScale = useWeatherWidgetScale();
    const idlePromptScale = useIdlePromptScale();
    const robotFaceScale = useRobotFaceScale();
    const clockWidgetPosition = useClockWidgetPosition();
    const weatherWidgetPosition = useWeatherWidgetPosition();
    const showIdlePrompt = useShowIdlePrompt();
    const idlePromptPosition = useIdlePromptPosition();
    const showClockWidget = useShowClockWidget();
    const showWeatherWidget = useShowWeatherWidget();
    const showVoiceWaveform = useShowVoiceWaveform();
    const connectButtonScale = useConnectButtonScale();
    const connectButtonPosition = useConnectButtonPosition();
    const robotColorThemeId = useRobotColorThemeId();
    const faceStyleId = useFaceStyleId();
    const homeLocation = useHomeLocation();
    const workLocation = useWorkLocation();
    const customLocation = useCustomLocation();
    const customLocationLabel = useCustomLocationLabel();
    const customLocations = useCustomLocations();
    const appBackgroundStyle = useAppBackgroundStyle();
    const appBackgroundColor = useAppBackgroundColor();
    const offlineModeEnabled = useOfflineModeEnabled();
    const voiceBackend = useVoiceBackend();
    const haVoicePipelineId = useHaVoicePipelineId();
    const customLLMProviderType = useCustomLLMProviderType();
    const openAICompatibleProviderPresetId = useOpenAICompatibleProviderPresetId();
    const customLLMBaseUrl = useCustomLLMBaseUrl();
    const customLLMModel = useCustomLLMModel();
    const customTTSEngine = useCustomTTSEngine();
    const customTTSVoiceId = useCustomTTSVoiceId();
    const customTTSVoiceProfileId = useCustomTTSVoiceProfileId();
    const speakerMuted = useSpeakerMuted();
    const clockShowSeconds = useClockShowSeconds();
    const clockUse24Hour = useClockUse24Hour();
    const benderSoundsEnabled = useBenderSoundsEnabled();
    const gmailAccessToken = useGmailAccessToken();
    const gmailReplyEnabled = useGmailReplyEnabled();
    const outlookCalendarAccessToken = useOutlookCalendarAccessToken();
    const outlookMailAccessToken = useOutlookMailAccessToken();
    const outlookReplyEnabled = useOutlookReplyEnabled();
    const slackAccessToken = useSlackAccessToken();

    return {
        apiKey,
        userName,
        weatherCity,
        tempUnit,
        haMcpUrl,
        haMcpToken,
        haMcpEnabled,
        haMcpAuthMode,
        haApiMode,
        haMcpOauthState,
        lowPowerMode,
        performanceMode: lowPowerMode,
        muteMicWhileAiSpeaking,
        clearVoiceEnabled,
        voiceGateThreshold,
        responseCardsEnabled,
        transcriptCardsEnabled,
        youTubeApiKey,
        googleApiKey,
        screensaverEnabled,
        screensaverTimeout,
        screensaverSource,
        googleAccessToken,
        googleTasksAccessToken,
        googleCalendarAccessToken,
        googleSelectedAlbumId,
        faceTrackingEnabled,
        faceRecognitionEnabled,
        facePassiveTrackingEnabled,
        faceDefaultProfileId,
        animationsEnabled,
        wakeWordEnabled,
        selectedWakeWordId,
        liveApiVoiceId,
        themeMode,
        idleSleepTimeout,
        customLLMProviderType,
        openAICompatibleProviderPresetId,
        customLLMBaseUrl,
        customLLMModel,
        customTTSEngine,
        customTTSVoiceId,
        customTTSVoiceProfileId,

        // Use standard stable setters
        setApiKey,
        setWakeWordEnabled,
        setSelectedWakeWordId,
        setLiveApiVoiceId,
        setUserName,
        setWeatherCity,
        setTempUnit,
        setHaMcpUrl,
        setHaMcpToken,
        setHaMcpEnabled,
        setHaMcpAuthMode,
        setHaApiMode,
        setHaMcpOauthState,
        setLowPowerMode,
        setPerformanceMode,
        setMuteMicWhileAiSpeaking,
        setClearVoiceEnabled,
        setVoiceGateThreshold,
        setResponseCardsEnabled,
        setTranscriptCardsEnabled,
        setYouTubeApiKey,
        setGoogleApiKey,
        setScreensaverEnabled,
        setScreensaverTimeout,
        setScreensaverSource,
        setGoogleAccessToken,
        setGoogleTasksAccessToken,
        setGoogleCalendarAccessToken,
        setGoogleSelectedAlbumId,
        setPickerPhotoUrls,
        setFaceTrackingEnabled,
        setFaceRecognitionEnabled,
        setFacePassiveTrackingEnabled,
        setFaceDefaultProfileId,
        setAnimationsEnabled,
        setIdleSleepTimeout,
        setThemeMode,
        setCardEnabled,
        clockWidgetScale,
        weatherWidgetScale,
        idlePromptScale,
        robotFaceScale,
        clockWidgetPosition,
        weatherWidgetPosition,
        showIdlePrompt,
        setClockWidgetScale,
        setWeatherWidgetScale,
        setIdlePromptScale,
        setRobotFaceScale,
        setClockWidgetPosition,
        setWeatherWidgetPosition,
        setShowIdlePrompt,
        idlePromptPosition,
        setIdlePromptPosition,
        showClockWidget,
        setShowClockWidget,
        showWeatherWidget,
        setShowWeatherWidget,
        showVoiceWaveform,
        setShowVoiceWaveform,
        connectButtonScale,
        setConnectButtonScale,
        connectButtonPosition,
        setConnectButtonPosition,
        robotColorThemeId,
        setRobotColorThemeId,
        setCustomRobotColor,
        faceStyleId,
        setFaceStyleId,
        homeLocation,
        setHomeLocation,
        workLocation,
        setWorkLocation,
        customLocation,
        setCustomLocation,
        customLocationLabel,
        setCustomLocationLabel,
        customLocations,
        setCustomLocations,
        appBackgroundStyle,
        setAppBackgroundStyle,
        appBackgroundColor,
        setAppBackgroundColor,
        offlineModeEnabled,
        setOfflineModeEnabled,
        voiceBackend,
        setVoiceBackend,
        haVoicePipelineId,
        setHaVoicePipelineId,
        setCustomLLMProviderType,
        setOpenAICompatibleProviderPresetId,
        setCustomLLMBaseUrl,
        setCustomLLMModel,
        setCustomLLMApiKey,
        setOllamaBaseUrl,
        setOpenAIBaseUrl,
        setOllamaModel,
        setOpenAIModel,
        setOpenAIApiKey,
        setCustomTTSEngine,
        setCustomTTSVoiceId,
        setCustomTTSVoiceProfileId,
        speakerMuted,
        setSpeakerMuted,
        clockShowSeconds,
        setClockShowSeconds,
        clockUse24Hour,
        setClockUse24Hour,
        benderSoundsEnabled,
        setBenderSoundsEnabled,
        gmailAccessToken,
        setGmailAccessToken,
        gmailReplyEnabled,
        setGmailReplyEnabled,
        outlookCalendarAccessToken,
        setOutlookCalendarAccessToken,
        outlookMailAccessToken,
        setOutlookMailAccessToken,
        outlookReplyEnabled,
        setOutlookReplyEnabled,
        slackAccessToken,
        setSlackAccessToken,
    };
};

