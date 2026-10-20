import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { rowToCalendarEvent, addDays } from '../dates';
import EventModal from '../components/EventModal';
import SubscribeModal from '../components/SubscribeModal';

export default function CalendarPage() {
  const { canEdit } = useAuth();
  const calRef = useRef(null);
  const [modal, setModal] = useState(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { id: linkedId } = useParams(); // set on /#/event/<id>
  const modalRef = useRef(modal);
  modalRef.current = modal;

  // Opening a shared event link: load the event, jump the calendar to its date, show it.
  useEffect(() => {
    if (!linkedId) {
      if (modalRef.current?.mode === 'view') setModal(null);
      return;
    }
    if (modalRef.current?.row?.id === linkedId) return; // already open (clicked on the calendar)
    let cancelled = false;
    supabase
      .from('events')
      .select('*')
      .eq('id', linkedId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError("That event couldn't be found. It may have been deleted.");
          navigate('/', { replace: true });
          return;
        }
        calRef.current?.getApi().gotoDate(data.starts_at);
        setModal({ mode: 'view', row: data });
      });
    return () => {
      cancelled = true;
    };
  }, [linkedId, navigate]);

  const closeModal = () => {
    setModal(null);
    if (linkedId) navigate('/');
  };

  // FullCalendar asks for events whenever the visible range changes.
  const fetchEvents = useCallback(async (info) => {
    const start = info.start.toISOString();
    const end = info.end.toISOString();
    const { data, error: err } = await supabase
      .from('events')
      .select('*')
      .lt('starts_at', end)
      .or(`ends_at.gte.${start},and(ends_at.is.null,starts_at.gte.${start})`)
      .order('starts_at');
    if (err) {
      setError(friendlyError(err));
      throw err;
    }
    setError('');
    return data.map(rowToCalendarEvent);
  }, []);

  const refetch = () => calRef.current?.getApi().refetchEvents();

  // Drag-and-drop / resize: save the new times straight away.
  async function persistMove(info) {
    const { event, revert } = info;
    const row = event.extendedProps.row;
    let starts_at, ends_at;
    if (event.allDay) {
      starts_at = event.start.toISOString();
      const lastDay = event.end ? addDays(event.end, -1) : event.start;
      ends_at = lastDay.toISOString();
    } else {
      starts_at = event.start.toISOString();
      ends_at = event.end ? event.end.toISOString() : row.all_day ? new Date(event.start.getTime() + 3600000).toISOString() : null;
    }
    const { error: err } = await supabase
      .from('events')
      .update({ starts_at, ends_at, all_day: event.allDay })
      .eq('id', row.id);
    if (err) {
      revert();
      setError(friendlyError(err));
    } else {
      refetch();
    }
  }

  return (
    <div className="calendar-page">
      <div className="toolbar-row">
        <p className="muted">
          {canEdit ? 'Click a day to add an event, or drag events to move them.' : 'Click an event for details.'}
        </p>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={() => setShowSubscribe(true)}>
            Subscribe
          </button>
          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => setModal({ mode: 'create', initial: { start: roundedNow(), allDay: false } })}
            >
              + Add event
            </button>
          )}
        </div>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}

      <div className="calendar-shell">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={window.innerWidth < 640 ? 'listMonth' : 'dayGridMonth'}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listMonth',
          }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', list: 'List' }}
          height="auto"
          dayMaxEvents={3}
          nowIndicator
          events={fetchEvents}
          editable={canEdit}
          selectable={canEdit}
          selectMirror
          select={(info) => {
            setModal({ mode: 'create', initial: { start: info.start, end: info.end, allDay: info.allDay } });
            info.view.calendar.unselect();
          }}
          eventClick={(info) => {
            info.jsEvent.preventDefault();
            const row = info.event.extendedProps.row;
            setModal({ mode: 'view', row });
            navigate(`/event/${row.id}`); // address bar now holds a shareable link
          }}
          eventDrop={persistMove}
          eventResize={persistMove}
        />
      </div>

      {modal && (
        <EventModal
          key={modal.row?.id || 'new'}
          {...modal}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            refetch();
          }}
        />
      )}

      {showSubscribe && <SubscribeModal onClose={() => setShowSubscribe(false)} />}
    </div>
  );
}

// An HTML page instead of JSON means VITE_SUPABASE_URL points somewhere other than Supabase.
function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (msg.trim().startsWith('<') || /404|not found/i.test(msg)) {
    return (
      "Couldn't reach the events database. Check that the VITE_SUPABASE_URL secret is your " +
      'Supabase project URL (like https://abcd1234.supabase.co), then re-run the deploy.'
    );
  }
  return msg;
}

function roundedNow() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}
