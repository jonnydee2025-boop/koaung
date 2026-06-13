import { useState } from 'react';
import { setAdminApiKey } from '../data/adminAuth';
import { verifyAdminApiKey } from '../data/api';
import { warmAppCache } from '../hooks/useSheetData';
import ErrorBanner from '../components/ErrorBanner';

export default function Login({ onSuccess }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!key.trim()) {
      setError('Enter your admin API key.');
      return;
    }
    setLoading(true);
    try {
      await verifyAdminApiKey(key.trim());
      setAdminApiKey(key);
      warmAppCache().catch(() => {});
      onSuccess();
    } catch (err) {
      setError(err.message || 'Invalid API key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card-shell">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-header">
            <img src="/logo.jpg" alt="Dhamma Channel logo" className="logo-image login-logo" />
            <h1 className="login-title">
              <span className="login-title-burmese">မုဒြာ</span>
              <span className="login-title-en">Dhamma Channel</span>
            </h1>
          </div>
          <input
            id="admin-api-key"
            className="login-input"
            type="password"
            autoComplete="current-password"
            aria-label="Admin API key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your secret key"
            disabled={loading}
          />
          {error && <ErrorBanner message={error} className="error-banner--inline" />}
          <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
