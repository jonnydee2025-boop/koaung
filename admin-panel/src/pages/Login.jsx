import { useState } from 'react';
import { setAdminApiKey } from '../data/adminAuth';
import { verifyAdminApiKey } from '../data/api';
import { warmAppCache } from '../hooks/useSheetData';

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
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/logo.jpg" alt="Dhamma Channel logo" className="logo-image" style={{ margin: '0 auto 16px' }} />
        <h1 className="login-title">မုဒြာ Dhamma Channel</h1>
        <p className="login-subtitle">
          Sign in with your <code>ADMIN_API_KEY</code> from the server <code>.env</code>.
        </p>
        <label className="login-label" htmlFor="admin-api-key">
          Admin API key
        </label>
        <input
          id="admin-api-key"
          className="login-input"
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your secret key"
          disabled={loading}
        />
        {error && <p className="login-error">{error}</p>}
        <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
          {loading ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
