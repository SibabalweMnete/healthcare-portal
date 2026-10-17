import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

const getLocalDateTime = (date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg
      aria-hidden="true"
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function DoctorCard({ doctor, onBook }) {
  const languages = Array.isArray(doctor.languages) ? doctor.languages : [];
  const fee = Number(doctor.fee);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-lg font-semibold text-teal-800"
        >
          {(doctor.fullName || 'D').trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-900">
            {doctor.fullName || 'Doctor'}
          </h2>
          <p className="text-sm font-medium text-teal-700">{doctor.specialization}</p>
        </div>
      </div>

      {doctor.bio && <p className="mt-4 text-sm leading-6 text-slate-600">{doctor.bio}</p>}

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Location</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{doctor.location}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Consultation fee</dt>
          <dd className="mt-0.5 font-medium text-slate-800">
            {Number.isFinite(fee) ? fee.toFixed(2) : 'Not listed'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Experience</dt>
          <dd className="mt-0.5 font-medium text-slate-800">
            {doctor.experienceYears} {Number(doctor.experienceYears) === 1 ? 'year' : 'years'}
          </dd>
        </div>
        {languages.length > 0 && (
          <div>
            <dt className="text-slate-500">Languages</dt>
            <dd className="mt-0.5 font-medium text-slate-800">{languages.join(', ')}</dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        onClick={() => onBook(doctor)}
        className="mt-6 w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
      >
        Book slot
      </button>
    </article>
  );
}

function BookingModal({ doctor, token, onClose, onBooked }) {
  const dialogRef = useRef(null);
  const [slotTime, setSlotTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const minDateTime = getLocalDateTime(new Date());
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => dialog?.querySelectorAll(
      'button:not([disabled]), input:not([disabled])'
    );
    const first = focusable()?.[0];
    first?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submittingRef.current) {
        onClose();
      }
      if (event.key !== 'Tab') return;

      const elements = focusable();
      if (!elements?.length) return;
      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const submitBooking = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Sign in as a patient to book an appointment.');
      return;
    }

    const selectedTime = new Date(slotTime);
    if (!slotTime || Number.isNaN(selectedTime.getTime()) || selectedTime <= new Date()) {
      setError('Choose a valid appointment time in the future.');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/api/appointments`,
        { doctorId: doctor.id, slotTime: selectedTime.toISOString() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Appointment booked successfully.');
      try {
        await onBooked?.();
      } catch (callbackError) {
        console.error('Post-booking callback failed:', callbackError);
      }
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 409) {
        setError('That time was just booked. Please choose another slot.');
      } else if (status === 401 || status === 403) {
        setError('Only a signed-in patient can book an appointment. Please sign in again.');
      } else {
        setError(requestError.response?.data?.error || 'Unable to book this appointment. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        ref={dialogRef}
        className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="booking-title" className="text-xl font-semibold text-slate-900">Book an appointment</h2>
            <p className="mt-1 text-sm text-slate-600">
              {doctor.fullName} · {doctor.specialization}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close booking dialog"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          >
            &times;
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submitBooking}>
          <div>
            <label htmlFor="appointment-time" className="mb-1.5 block text-sm font-medium text-slate-700">
              Appointment date and time
            </label>
            <input
              id="appointment-time"
              type="datetime-local"
              required
              min={minDateTime}
              value={slotTime}
              onChange={(event) => setSlotTime(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {!token && <p className="text-sm text-amber-800">Sign in as a patient before booking.</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {success ? 'Done' : 'Cancel'}
            </button>
            {!success && (
              <button
                type="submit"
                disabled={submitting || !token}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Spinner className="h-4 w-4" />}
                {submitting ? 'Booking...' : 'Confirm booking'}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

export default function DoctorSearch({ token, onBooked }) {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [maxFee, setMaxFee] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const closeBooking = useCallback(() => setSelectedDoctor(null), []);

  const loadDoctors = useCallback(async (signal) => {
    setLoading(true);
    setError('');

    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (location.trim()) params.location = location.trim();
      if (maxFee !== '') params.maxFee = maxFee;

      const response = await axios.get(`${API_URL}/api/doctors`, { params, signal });
      setDoctors(Array.isArray(response.data?.doctors) ? response.data.doctors : []);
    } catch (requestError) {
      if (requestError.code === 'ERR_CANCELED') return;
      setError(requestError.response?.data?.error || 'Unable to load doctors. Please try again.');
      setDoctors([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [search, location, maxFee]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => loadDoctors(controller.signal), 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadDoctors, retry]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Care that fits your needs</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Find a doctor</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Search trusted healthcare professionals and book an appointment that works for you.
        </p>
      </header>

      <section aria-label="Doctor filters" className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label htmlFor="doctor-search" className="mb-1.5 block text-sm font-medium text-slate-700">
              Doctor or specialization
            </label>
            <input
              id="doctor-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. Dr. Lee or cardiology"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label htmlFor="doctor-location" className="mb-1.5 block text-sm font-medium text-slate-700">
              Location
            </label>
            <input
              id="doctor-location"
              type="search"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="City or area"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label htmlFor="doctor-max-fee" className="mb-1.5 block text-sm font-medium text-slate-700">
              Maximum fee
            </label>
            <input
              id="doctor-max-fee"
              type="number"
              min="0"
              step="0.01"
              value={maxFee}
              onChange={(event) => setMaxFee(event.target.value)}
              placeholder="Any fee"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>
        </div>
      </section>

      <div className="mb-4 flex min-h-6 items-center justify-between gap-4">
        <p className="text-sm text-slate-600" aria-live="polite">
          {!loading && !error && `${doctors.length} ${doctors.length === 1 ? 'doctor' : 'doctors'} found`}
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-56 items-center justify-center" role="status" aria-label="Loading doctors">
          <Spinner className="h-9 w-9 text-teal-700" />
        </div>
      ) : !error && doctors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No doctors found</h2>
          <p className="mt-2 text-sm text-slate-600">Try changing your search or filters.</p>
        </div>
      ) : !error ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doctor) => (
            <DoctorCard key={doctor.id} doctor={doctor} onBook={setSelectedDoctor} />
          ))}
        </div>
      ) : null}

      {selectedDoctor && (
        <BookingModal
          doctor={selectedDoctor}
          token={token}
          onClose={closeBooking}
          onBooked={onBooked}
        />
      )}
    </main>
  );
}
