import { useEffect, useMemo, useRef, useState } from 'react';

interface SpeechControlsProps {
  text: string;
  label: string;
  compact?: boolean;
}

export default function SpeechControls({ text, label, compact = false }: SpeechControlsProps) {
  const supported = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && 'SpeechSynthesisUtterance' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState(localStorage.getItem('multimind.voiceName') ?? '');
  const [rate, setRate] = useState(() => Number(localStorage.getItem('multimind.voiceRate') ?? '1'));
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!supported) return;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [supported]);

  useEffect(() => {
    return () => {
      if (utteranceRef.current) window.speechSynthesis.cancel();
    };
  }, []);

  const selectedVoice = useMemo(
    () => voices.find(voice => voice.name === voiceName) ?? voices[0],
    [voiceName, voices]
  );

  const stop = () => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
    setPaused(false);
  };

  const play = () => {
    if (!supported || !text.trim()) return;
    stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.voice = selectedVoice ?? null;
    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setPaused(false);
      utteranceRef.current = null;
    };
    utteranceRef.current = utterance;
    setSpeaking(true);
    setPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  const pause = () => {
    if (!supported || !speaking || paused) return;
    window.speechSynthesis.pause();
    setPaused(true);
  };

  const resume = () => {
    if (!supported || !speaking || !paused) return;
    window.speechSynthesis.resume();
    setPaused(false);
  };

  const updateRate = (nextRate: number) => {
    setRate(nextRate);
    localStorage.setItem('multimind.voiceRate', String(nextRate));
  };

  const updateVoice = (nextVoice: string) => {
    setVoiceName(nextVoice);
    localStorage.setItem('multimind.voiceName', nextVoice);
  };

  if (!supported) {
    return (
      <div className={`speech-controls${compact ? ' speech-controls--compact' : ''}`}>
        <span className="speech-controls__unsupported">Voice unavailable in this browser</span>
      </div>
    );
  }

  return (
    <div className={`speech-controls${compact ? ' speech-controls--compact' : ''}`} aria-label={`Voice controls for ${label}`}>
      <div className="speech-controls__buttons">
        <button type="button" onClick={play} className="speech-btn" title={`Play ${label}`}>▶</button>
        <button type="button" onClick={pause} className="speech-btn" disabled={!speaking || paused} title="Pause">⏸</button>
        <button type="button" onClick={resume} className="speech-btn" disabled={!speaking || !paused} title="Resume">⏵</button>
        <button type="button" onClick={stop} className="speech-btn" disabled={!speaking} title="Stop">■</button>
      </div>
      <details className="speech-controls__settings">
        <summary>Voice settings</summary>
        <label>
          Speed
          <input
            type="range"
            min="0.7"
            max="1.35"
            step="0.05"
            value={rate}
            onChange={event => updateRate(Number(event.target.value))}
          />
          <span>{rate.toFixed(2)}x</span>
        </label>
        <label>
          Voice
          <select value={voiceName} onChange={event => updateVoice(event.target.value)}>
            {voices.map(voice => (
              <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </label>
      </details>
    </div>
  );
}
