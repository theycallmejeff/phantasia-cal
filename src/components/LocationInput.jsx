import { useEffect, useId, useRef, useState } from 'react';

// Google Places (New) autocomplete for the event Location field.
// Uses only autocomplete predictions (no Place Details call), so each search is one
// "Autocomplete Request" — Google gives 10,000 free per month.
// Without VITE_GOOGLE_MAPS_API_KEY this is a plain text box.

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
// Greater New Orleans (Metairie to Chalmette, Northshore edge); results nearby rank first
const NEW_ORLEANS = { north: 30.4, south: 29.7, east: -89.7, west: -90.45 };
const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

let placesPromise = null;

/** Load the Maps JavaScript API once and return the Places library. */
function loadPlaces() {
  if (!API_KEY) return Promise.reject(new Error('No Google Maps key'));
  if (placesPromise) return placesPromise;
  placesPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve();
      return;
    }
    window.__phantasiaMapsReady = () => resolve();
    const s = document.createElement('script');
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}` +
      '&v=weekly&loading=async&callback=__phantasiaMapsReady';
    s.async = true;
    s.onerror = () => reject(new Error('Could not load Google Maps'));
    document.head.appendChild(s);
  })
    .then(() => window.google.maps.importLibrary('places'))
    .catch((e) => {
      placesPromise = null; // allow a retry next time the field is used
      throw e;
    });
  return placesPromise;
}

/** "BJ's Lounge" + "4301 Burgundy Street, New Orleans, LA, USA" → "BJ's Lounge, 4301 Burgundy Street, New Orleans, LA" */
export function formatPrediction(main, secondary) {
  const rest = (secondary || '').replace(/,\s*USA$/, '');
  if (!rest) return main;
  // an address search: main text is already the street, so don't repeat it
  return rest.startsWith(main) ? rest : `${main}, ${rest}`;
}

export default function LocationInput({ value, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [unavailable, setUnavailable] = useState(!API_KEY);
  const libRef = useRef(null);
  const tokenRef = useRef(null);
  const timerRef = useRef(null);
  const lastQuery = useRef('');
  const listId = useId();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function search(text) {
    try {
      const places = libRef.current || (libRef.current = await loadPlaces());
      if (!tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken();
      lastQuery.current = text;
      const { suggestions: found } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: text,
        sessionToken: tokenRef.current,
        locationBias: NEW_ORLEANS,
        includedRegionCodes: ['us'],
        region: 'us',
      });
      if (lastQuery.current !== text) return; // a newer search is on its way
      const items = (found || [])
        .map((s) => s.placePrediction)
        .filter(Boolean)
        .slice(0, 5)
        .map((p) => ({
          id: p.placeId,
          main: p.mainText?.text || p.text?.text || '',
          secondary: p.secondaryText?.text || '',
        }));
      setSuggestions(items);
      setOpen(items.length > 0);
      setActive(-1);
    } catch (e) {
      console.warn('Location suggestions unavailable:', e);
      setUnavailable(true);
      setOpen(false);
    }
  }

  function handleChange(e) {
    const text = e.target.value;
    onChange(text);
    clearTimeout(timerRef.current);
    if (unavailable || text.trim().length < MIN_CHARS) {
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => search(text.trim()), DEBOUNCE_MS);
  }

  function choose(item) {
    onChange(formatPrediction(item.main, item.secondary));
    setOpen(false);
    setSuggestions([]);
    tokenRef.current = null; // next search starts a new session
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
        placeholder={unavailable ? '' : 'Start typing a place or address'}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />
      {open && (
        <ul className="location-suggestions" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
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
