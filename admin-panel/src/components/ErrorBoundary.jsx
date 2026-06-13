import { Component } from 'react';
import ErrorBanner from './ErrorBanner';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="page-content">
          <ErrorBanner message={`Something went wrong. ${error.message}`} />
          <button
            type="button"
            className="btn btn-ghost btn-sm error-boundary-back"
            onClick={() => window.location.assign('/')}
          >
            Back to Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
