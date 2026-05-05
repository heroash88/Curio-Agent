import type { CardEvent, CameraCardData } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

export function detectCamera(normalized: string, original: string): CardEvent | null {
    const cameraKeywords = [
        'show me the camera', 'show the camera', 'show camera',
        'open camera', 'open the camera', 'pull up camera',
        'pull up the camera', 'camera feed', 'camera view',
        'show me the', 'show the', 'check the camera',
        'view camera', 'view the camera', 'display camera',
        'camera on', 'live feed', 'live view',
        'show me', 'let me see', 'what does the',
        'doorbell camera', 'front door camera', 'back door camera',
        'baby monitor', 'security camera', 'surveillance',
        'driveway camera', 'backyard camera', 'porch camera',
    ];

    const hasCameraWord = /\bcamera\b|\bcam\b|\bdoorbell\b|\bmonitor\b|\bfeed\b|\bsurveillance\b/i.test(normalized);
    const hasShowVerb = /\b(?:show|open|pull up|check|view|display|see|watch|look at)\b/i.test(normalized);
    const hasCameraPhrase = cameraKeywords.some(kw => normalized.includes(kw));

    if (!hasCameraPhrase && !(hasShowVerb && hasCameraWord)) return null;
    if (isConversationalOffer(normalized)) return null;

    const namePatterns = [
        /(?:show|open|pull up|check|view|display|see|watch|look at)\s+(?:me\s+)?(?:the\s+)?(.+?)\s+camera/i,
        /(?:show|open|pull up|check|view|display|see|watch|look at)\s+(?:me\s+)?(?:the\s+)?(.+?)\s+cam\b/i,
        /camera[:\s]+(.+?)(?:\.|!|$)/i,
        /(?:show|open|pull up|check|view|display|see|watch|look at)\s+(?:me\s+)?(?:the\s+)?(doorbell|baby monitor|security camera|surveillance)/i,
        /(.+?)\s+(?:camera|cam)\b/i,
    ];

    let cameraName = '';
    for (const pattern of namePatterns) {
        const m = original.match(pattern);
        if (m) { cameraName = m[1].trim(); break; }
    }

    cameraName = cameraName
        .replace(/^(?:the|my|our|a)\s+/i, '')
        .replace(/\s+(?:please|now|feed|view|live)$/i, '')
        .trim();

    if (!cameraName) {
        if (normalized.includes('doorbell')) cameraName = 'Doorbell';
        else if (normalized.includes('front door')) cameraName = 'Front Door';
        else if (normalized.includes('back door') || normalized.includes('backdoor')) cameraName = 'Back Door';
        else if (normalized.includes('baby')) cameraName = 'Baby Monitor';
        else if (normalized.includes('garage')) cameraName = 'Garage';
        else if (normalized.includes('driveway')) cameraName = 'Driveway';
        else if (normalized.includes('backyard') || normalized.includes('back yard')) cameraName = 'Backyard';
        else if (normalized.includes('porch') || normalized.includes('front')) cameraName = 'Front Porch';
        else cameraName = 'Camera';
    }

    const displayName = cameraName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    const data: CameraCardData = { entityId: '', cameraName: displayName, isStreaming: false };
    return { type: 'camera', data: data as unknown as Record<string, unknown>, persistent: true };
}
