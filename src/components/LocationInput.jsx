import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../supabase';

// Address suggestions for the event Location field.
// The browser asks our database (place_suggestions in supabase/migrations/003_places_search.sql),
// which calls Google Places with a key kept in Supabase Vault and enforces a hard limit of
// 9,000 searches a month and 1,000 a day — so Google's free 10,000/month is never exceeded.
// If the database function isn't set up, this is a plain text box.

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/** "BJ's Lounge" + "4301 Burgundy Street, New Orleans, LA, USA" → "BJ's Lounge, 4301 Burgundy Street, New Orleans, LA" */
export function formatPrediction(main, secondary) {
  const rest = (secondary || '').replace(/,\s*USA$/, '');
  if (!rest) return main.replace(/,\s*USA$/, '');
  // an address search: main text is already the street, so don't repeat it
  return rest.startsWith(main) ? rest : `${main}, ${rest}`;
}

const PAUSED = {
  day: 'Address suggestions are paused until tomorrow (daily limit reached). Type the location instead.',
  month: 'Address suggestions are paused until next month (monthly limit reached). Type the location instead.',
  error: "Address suggestions aren't working right now. Type the location instead.",
};

export default function LocationInput({ value, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('ready'); // ready | off | day | month | error
  const timerRef = useRef(null);
  const lastQuery = useRef('');
  const listId = useId();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function search(text) {
    lastQuery.current = text;
    const { data, error } = await supabase.rpc('place_suggestions', { q: text });
    if (lastQuery.current !== text) return; // a newer search is on its way

    if (error) {
      // function not installed yet → quietly behave like a normal text box
      const missing = error.code === 'PGRST202' || /place_suggestions/.test(error.message || '');
      if (!missing) console.warn('Address suggestions:', error);
      setStatus(missing ? 'off' : 'error');
      setOpen(false);
      return;
    }
    if (data?.limited) {
      setStatus(data.limited);
      setOpen(false);
      return;
    }
    if (data?.error) {
      console.warn('Address suggestions:', data); // e.g. Google rejected the key
      setStatus(data.error === 'no_key' ? 'off' : 'error');
      setOpen(false);
      return;
    }
    const items = data?.suggestions || [];
    setSuggestions(items);
    setOpen(items.length > 0);
    setActive(-1);
  }

  function handleChange(e) {
    const text = e.target.value;
    onChange(text);
    clearTimeout(timerRef.current);
    if (status !== 'ready' || text.trim().length < MIN_CHARS) {
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => search(text.trim()), DEBOUNCE_MS);
  }

  function choose(item) {
    onChange(formatPrediction(item.main, item.secondary));
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault(); // pick the suggestion instead of submitting the form
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // close the list, not the whole dialog
      setOpen(false);
    }
  }

  return (
    <div className="location-input">
      <input
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length && value.trim().length >= MIN_CHARS && setOpen(true)}
        placeholder={status === 'ready' ? 'Start typing a place or address' : ''}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />
      {PAUSED[status] && <span className="location-note">{PAUSED[status]}</span>}
      {open && (
        <ul className="location-suggestions" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id || i}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus so blur doesn't close first
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="main">{s.main}</span>
              {s.secondary && <span className="secondary">{s.secondary.replace(/,\s*USA$/, '')}</span>}
            </li>
          ))}
          <li className="powered-by" aria-hidden="true">
            Powered by Google
          </li>
        </ul>
      )}
    </div>
  );
}

/** Free Google Maps link for directions (no API key needed). */
export function mapsUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
