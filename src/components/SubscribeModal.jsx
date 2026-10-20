import { useEffect, useState } from 'react';
import { siteUrl } from '../supabase';

// The deploy workflow publishes calendar.ics next to the site and refreshes it every few hours.
export default function SubscribeModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const feedUrl = new URL('calendar.ics', siteUrl()).href;
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', feedUrl);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="subscribe-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="subscribe-title">Subscribe to this calendar</h2>
        <p className="muted">
          Add every Phantasia event to your phone or computer calendar. New and changed events show
          up on their own. Calendar apps check for updates every few hours.
        </p>

        <div className="subscribe-options">
          <a className="btn btn-primary" href={webcalUrl}>
            Apple Calendar / iPhone
          </a>
          <a className="btn btn-primary" href={googleUrl} target="_blank" rel="noopener noreferrer">
            Google Calendar
          </a>
        </div>

        <label className="subscribe-copy">
          <span>Outlook or another app? Copy this link and choose “Subscribe from web” / “From URL”:</span>
          <span className="copy-row">
            <input readOnly value={feedUrl} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-ghost" onClick={copy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </span>
        </label>
      </div>
    </div>
  );
}
