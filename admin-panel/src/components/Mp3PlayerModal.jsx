import { useEffect, useRef, useState } from 'react';
import { Star, X } from 'lucide-react';
import { jobAudioStreamUrl } from '../data/api';
import { getJobPlayerPref } from '../data/jobPlayerPrefs';
import { useJobPlayerPref } from '../hooks/useJobPlayerPrefs';

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
  const [remarkDraft, setRemarkDraft] = useState('');
  const remarkSaveTimer = useRef(null);

  const { favorite, toggleFavorite, updateRemark, ready } = useJobPlayerPref(job?.row);

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
    if (open && job && ready) {
      setRemarkDraft(getJobPlayerPref(job.row).remark);
    }
  }, [open, job, ready]);

  useEffect(() => {
    return () => {
      if (remarkSaveTimer.current) {
        clearTimeout(remarkSaveTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setAudioSrc('');
      setError('');
      setLoading(false);
      setDisplayDuration('');
      setRemarkDraft('');
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

  const handleRemarkChange = (event) => {
    const value = event.target.value;
    setRemarkDraft(value);
    if (remarkSaveTimer.current) {
      clearTimeout(remarkSaveTimer.current);
    }
    remarkSaveTimer.current = window.setTimeout(() => {
      updateRemark(value).catch(() => {});
    }, 400);
  };

  const handleRemarkBlur = () => {
    if (remarkSaveTimer.current) {
      clearTimeout(remarkSaveTimer.current);
    }
    updateRemark(remarkDraft).catch(() => {});
  };

  const handleToggleFavorite = () => {
    toggleFavorite().catch(() => {});
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
          <div className="mp3-player-header-actions">
            <button
              type="button"
              className={`btn-icon mp3-player-favorite${favorite ? ' is-active' : ''}`}
              onClick={handleToggleFavorite}
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={favorite}
              title={favorite ? 'Remove favorite' : 'Add favorite'}
            >
              <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="mp3-player-meta">
          <span className="mp3-player-meta-label">Duration</span>
          <span className="mp3-player-meta-value">
            {displayDuration || (loading ? 'Loading…' : '—')}
          </span>
        </div>

        <div className="mp3-player-remark">
          <label className="mp3-player-remark-label" htmlFor="mp3-player-remark">
            Remark
          </label>
          <textarea
            id="mp3-player-remark"
            className="form-input mp3-player-remark-input"
            rows={3}
            placeholder="Private note for this track…"
            value={remarkDraft}
            onChange={handleRemarkChange}
            onBlur={handleRemarkBlur}
          />
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
