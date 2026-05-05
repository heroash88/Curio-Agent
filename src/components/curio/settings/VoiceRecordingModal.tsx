import React, { useState, useRef, useEffect } from 'react';
import { Mic, X, Square, RotateCcw, Check, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { requestElectronMediaAccess } from '../../../utils/electronMediaAccess';

interface VoiceRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (blob: Blob, name: string) => Promise<void>;
}

const SENTENCES = [
  "The quick brown fox jumps over the lazy dog.",
  "Curio robot is my favorite open source assistant.",
  "To record a clear voice, I need to speak naturally and enunciate my words at a steady pace."
];

export const VoiceRecordingModal: React.FC<VoiceRecordingModalProps> = ({ isOpen, onClose, onSave }) => {
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'review' | 'saving'>('idle');
  const [profileName, setProfileName] = useState('');
  const [timeLeft, setTimeLeft] = useState(15);
  const [error, setError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear everything when modal closes or unmounts
  const cleanupAudio = () => {
    if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  useEffect(() => {
    if (!isOpen) {
        setRecordingState('idle');
        setProfileName('');
        setError(null);
        setTimeLeft(15);
        recordedBlobRef.current = null;
        cleanupAudio();
    }
    return cleanupAudio;
  }, [isOpen]);

  const startRecording = async () => {
    try {
        cleanupAudio();
        setError(null);
        setTimeLeft(15);
        audioChunksRef.current = [];

        const nativeAccess = await requestElectronMediaAccess('microphone');
        if (!nativeAccess) {
            throw new Error('Microphone access was not granted.');
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            }
        });
        
        streamRef.current = stream;
        
        // Config recording
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunksRef.current.push(e.data);
            }
        };
        mediaRecorder.onstop = () => {
            if (timeLeft > 0) {
                setError("Recording was too short. Please record for at least 15 seconds.");
                setRecordingState('idle');
                return;
            }
            const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
            recordedBlobRef.current = blob;
            setRecordingState('review');
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorderRef.current = mediaRecorder;
        
        // Config AudioContext for Visuals
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        analyserRef.current = analyser;
        
        mediaRecorder.start();
        setRecordingState('recording');
        drawWaveform();

        // Start 15s timer
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

    } catch (err) {
        console.error("Failed to start recording:", err);
        setError("Microphone access denied or completely unavailable.");
    }
  };

  const stopRecording = () => {
    if (timeLeft > 0) return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    
    if (!canvas || !analyser || mediaRecorderRef.current?.state !== 'recording') {
        return;
    }

    const { width, height } = canvas;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.05)'; 
    canvasCtx.fillRect(0, 0, width, height);
    canvasCtx.lineWidth = 3;
    canvasCtx.lineCap = 'round';
    canvasCtx.strokeStyle = '#d946ef'; // fuchsia-500
    
    // Clear fully for fresh sharp lines
    canvasCtx.clearRect(0, 0, width, height);

    canvasCtx.beginPath();

    const sliceWidth = width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * (height / 2);

        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
    
    // Create soft pulse if idle/silent
    const maxVal = Math.max(...Array.from(dataArray));
    const minVal = Math.min(...Array.from(dataArray));
    const activity = maxVal - minVal;

    // Draw center guideline
    if (activity < 15) {
        canvasCtx.fillStyle = 'rgba(217, 70, 239, 0.1)';
        canvasCtx.fillRect(0, height / 2 - 1, width, 2);
    }

    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  const handleSave = async () => {
    if (!recordedBlobRef.current) return;
    
    const finalName = profileName.trim() || 'My Cloned Voice';
    setRecordingState('saving');
    setError(null);
    
    try {
        await onSave(recordedBlobRef.current, finalName);
        onClose();
    } catch (e) {
        console.error(e);
        setError("Failed to save audio profile. Please try again.");
        setRecordingState('review');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600">
                        <Mic size={20} className={recordingState === 'recording' ? "animate-pulse" : ""} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Voice Cloning</h2>
                        <p className="text-xs text-slate-500">Record a high-quality voice sample</p>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    disabled={recordingState === 'saving'} 
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="px-6 py-6 border-b border-slate-100">
                {error && (
                    <div className="mb-4 rounded-xl bg-red-50 p-4 text-xs font-bold text-red-600 border border-red-100 animate-in slide-in-from-top-2">
                        {error}
                    </div>
                )}

                {(recordingState === 'idle' || recordingState === 'recording') && (
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-slate-600">
                            Please speak naturally and read the following sentences clearly:
                        </p>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-inner">
                            <ul className="space-y-3 text-[15px] font-medium leading-relaxed text-slate-700">
                                {SENTENCES.map((s, i) => (
                                    <li key={i} className="flex gap-3">
                                        <span className="text-fuchsia-400 select-none">•</span> 
                                        <span>{s}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="relative mx-auto mt-6 h-24 w-full max-w-sm rounded-2xl bg-slate-900 overflow-hidden shadow-inner flex items-center justify-center border-4 border-slate-800">
                            <canvas 
                                ref={canvasRef} 
                                width={384} 
                                height={96} 
                                className={`w-full h-full ${recordingState === 'recording' ? 'block' : 'hidden'}`} 
                            />
                            {recordingState !== 'recording' && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
                                   <Mic size={16} /> Press Record to test mic levels
                                </div>
                            )}
                        </div>

                        {recordingState === 'recording' && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    <span>Quality Progress</span>
                                    <span>{timeLeft > 0 ? `${timeLeft}s remaining` : 'Ready to stop'}</span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                    <div 
                                        className="h-full bg-fuchsia-500 transition-all duration-1000 ease-linear"
                                        style={{ width: `${((15 - timeLeft) / 15) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {(recordingState === 'review' || recordingState === 'saving') && (
                    <div className="space-y-6 text-center py-4">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
                            <Check size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Recording Saved!</h3>
                        <p className="text-sm text-slate-500">
                            Your voice profile is ready. Give it a name to save it to your local library.
                        </p>
                        
                        <div className="max-w-xs mx-auto space-y-2 text-left">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Profile Name</label>
                            <input 
                                type="text" 
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                placeholder="e.g. My Custom Voice"
                                disabled={recordingState === 'saving'}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-fuchsia-500 focus:bg-white focus:ring-4 focus:ring-fuchsia-500/10 transition-all"
                                autoFocus
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-6 py-4">
                {recordingState === 'idle' && (
                    <>
                        <p className="text-xs text-slate-500 px-1">Ensure a quiet room.</p>
                        <button 
                            onClick={startRecording}
                            className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-6 py-3 font-bold text-white shadow-lg shadow-fuchsia-600/30 transition-all hover:bg-fuchsia-700 active:scale-95"
                        >
                            <Mic size={18} /> Start Recording
                        </button>
                    </>
                )}

                {recordingState === 'recording' && (
                    <>
                        <div className="flex items-center gap-2 px-1">
                            <div className={`h-2.5 w-2.5 rounded-full ${timeLeft > 0 ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`}></div>
                            <span className="text-xs font-bold text-slate-700">
                                {timeLeft > 0 ? 'Keep talking...' : 'Recording...'}
                            </span>
                        </div>
                        <button 
                            onClick={stopRecording}
                            disabled={timeLeft > 0}
                            className="flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-slate-900 active:scale-95 disabled:opacity-50 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            <Square size={16} className="fill-current" /> 
                            {timeLeft > 0 ? `Wait (${timeLeft}s)` : 'Stop & Review'}
                        </button>
                    </>
                )}

                {(recordingState === 'review' || recordingState === 'saving') && (
                    <div className="w-full flex items-center justify-between gap-4">
                        <button 
                            onClick={() => { setRecordingState('idle'); startRecording(); }}
                            disabled={recordingState === 'saving'}
                            className="flex flex-1 justify-center items-center gap-2 rounded-xl bg-white border border-slate-200 px-5 py-3 font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                        >
                            <RotateCcw size={16} /> Retake
                        </button>
                        <button 
                            onClick={() => void handleSave()}
                            disabled={recordingState === 'saving' || !profileName.trim()}
                            className="flex flex-1 justify-center items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                        >
                            {recordingState === 'saving' ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                            {recordingState === 'saving' ? 'Processing...' : 'Save Voice'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    </div>,
    document.body
  );
};
