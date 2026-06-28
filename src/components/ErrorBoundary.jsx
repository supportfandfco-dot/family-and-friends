import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Log to help diagnose
    console.error('[FF] Render crash:', error?.message, info?.componentStack?.split('\n').slice(0,5).join('\n'));
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: '#1a1a1a', color: '#fff', height: '100%', overflow: 'auto' }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: 12 }}>⚠️ Chat crashed</h2>
          <p style={{ color: '#aaa', marginBottom: 8 }}>Error: {this.state.error?.message}</p>
          <pre style={{ color: '#888', fontSize: 11, whiteSpace: 'pre-wrap' }}>
            {this.state.error?.stack?.split('\n').slice(0,8).join('\n')}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}
          >
            Go back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
