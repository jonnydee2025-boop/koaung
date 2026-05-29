import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { jobAudioStreamUrl } from '../data/api';

function formatAudioDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function sheetDurationLabel(duration) {
  const value = (duration || '').trim();
  return value && value !== '-' ? value : '';
}

export default function Mp3PlayerModal({ job, open, onClose }) {
  const audioRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioSrc, setAudioSrc] = useState('');
  const [displayDuration, setDisplayDuration] = useState('');

  useEffect(() => {
    if (!open || !job) {
      return undefined;
    }

    const sheetDuration = sheetDurationLabel(job.duration);
    setDisplayDuration(sheetDuration);
    setError('');
    setLoading(true);
    setAudioSrc(jobAudioStreamUrl(job.row));

    return undefined;
  }, [open, job]);

  useEffect(() => {
    if (!open) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setAudioSrc('');
      setError('');
      setLoading(false);
      setDisplayDuration('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleLoadedMetadata = () => {
    setLoading(false);
    if (sheetDurationLabel(job?.duration)) {
      return;
    }
    const seconds = audioRef.current?.duration;
    setDisplayDuration(formatAudioDuration(seconds));
  };

  const handleCanPlay = () => {
    setLoading(false);
  };

  const handleAudioError = () => {
    setLoading(false);
    setError('Failed to load audio. Check your connection or sign in again.');
  };

  if (!open || !job) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card mp3-player-modal"
        role="dialog"
        aria-labelledby="mp3-player-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="mp3-player-modal-title" className="modal-title">
              {job.title || '(no title)'}
            </h2>
            <p className="modal-subtitle">
              {job.monk || 'Unknown monk'} · Row #{job.row}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mp3-player-meta">
          <span className="mp3-player-meta-label">Duration</span>
          <span className="mp3-player-meta-value">
            {displayDuration || (loading ? 'Loading…' : '—')}
          </span>
        </div>

        {error && <p className="login-error mp3-player-error">{error}</p>}

        {loading && !error && (
          <p className="text-muted mp3-player-loading">Buffering audio…</p>
        )}

        {audioSrc && !error && (
          <audio
            ref={audioRef}
            className="mp3-player-audio"
            controls
            autoPlay
            preload="auto"
            src={audioSrc}
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onError={handleAudioError}
          />
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
