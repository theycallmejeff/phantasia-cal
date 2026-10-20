import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/** "Address searches: 123 of 9,000 this month · 4 of 1,000 today" for admins. */
export default function PlacesUsage() {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    supabase.rpc('places_usage').then(({ data, error }) => {
      if (!error && data) setUsage(data); // not installed yet → show nothing
    });
  }, []);

  if (!usage) return null;
  const n = (x) => x.toLocaleString();
  const pct = Math.min(100, Math.round((usage.month / usage.per_month) * 100));
  return (
    <div className="usage-card" title="Google address suggestions stop at these limits, so they stay inside Google's free 10,000 a month.">
      <strong>Address searches</strong>
      <span>
        {n(usage.month)} of {n(usage.per_month)} this month
      </span>
      <span className="usage-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="muted">
        {n(usage.day)} of {n(usage.per_day)} today
      </span>
    </div>
  );
}
