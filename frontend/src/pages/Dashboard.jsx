import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Video, User, AlertCircle, Plus, Sparkles, Loader } from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State Management
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Booking Form State
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingDuration, setBookingDuration] = useState('30'); // Duration in minutes
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      // Load appointments
      const appData = await apiRequest('/appointments');
      setAppointments(appData);

      // Load doctors list if user is a PATIENT
      if (user.role === 'PATIENT') {
        const docData = await apiRequest('/appointments/doctors');
        setDoctors(docData);
        if (docData.length > 0) {
          setSelectedDoctorId(docData[0].id);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    setError('');
    setBookingSuccess('');

    if (!selectedDoctorId || !bookingDate || !bookingTime || !bookingDuration) {
      setError('Please fill in all booking fields.');
      return;
    }

    setBookingLoading(true);
    try {
      // Calculate start and end ISO strings
      const startDateTime = new Date(`${bookingDate}T${bookingTime}`);
      if (isNaN(startDateTime.getTime())) {
        throw new Error('Invalid date or time selected.');
      }
      if (startDateTime < new Date()) {
        throw new Error('Appointment must be booked for a future date and time.');
      }

      const endDateTime = new Date(startDateTime.getTime() + parseInt(bookingDuration) * 60 * 1000);

      const response = await apiRequest('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString()
        })
      });

      setBookingSuccess(response.message || 'Appointment booked successfully!');
      // Reset form fields
      setBookingDate('');
      setBookingTime('');
      // Refresh appointments list
      const appData = await apiRequest('/appointments');
      setAppointments(appData);
    } catch (err) {
      setError(err.message || 'Failed to book appointment.');
    } finally {
      setBookingLoading(false);
    }
  };

  const formatDateTime = (isoString) => {
    const date = new Date(isoString);
    const dateStr = date.toLocaleDateString(undefined, { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    const timeStr = date.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    return { dateStr, timeStr };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader className="w-8 h-8 text-sky-500 animate-spin" />
          <p className="text-slate-500 font-medium">Loading clinical workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-600 rounded-3xl p-8 text-white shadow-xl shadow-sky-500/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full text-xs font-semibold w-fit tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Telehealth Portal Active</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hello, {user.name}
          </h1>
          <p className="text-sky-100 max-w-xl text-sm">
            Access your secure virtual video room, manage slot availability, or book dynamic clinic consultations.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4 relative z-10">
          <span className="text-xs text-sky-100 uppercase tracking-wider block font-medium">Session Identity</span>
          <span className="text-lg font-bold tracking-wide uppercase block">{user.role}</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left/Middle: Appointments List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-500" />
              <span>Upcoming Consultations</span>
            </h2>
            <span className="bg-slate-100 text-slate-600 font-semibold px-3 py-1 text-xs rounded-full">
              {appointments.length} Total
            </span>
          </div>

          {error && !bookingSuccess && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {appointments.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-sm">
              <div className="p-4 bg-slate-50 text-slate-400 rounded-full">
                <Video className="w-8 h-8" />
              </div>
              <h3 className="font-semibold text-slate-700 text-lg">No appointments scheduled</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                {user.role === 'PATIENT' 
                  ? 'Book a slot using the booking panel on the right to start consultation calls with your doctor.'
                  : 'You have no booked appointments from patients currently.'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {appointments.map((appointment) => {
                const partner = user.role === 'DOCTOR' ? appointment.patient : appointment.doctor;
                const { dateStr, timeStr } = formatDateTime(appointment.startTime);

                return (
                  <div 
                    key={appointment.id} 
                    className="bg-white border border-slate-100 rounded-3xl p-5 hover:shadow-lg hover:shadow-slate-100/50 transition-all duration-300 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Card Header (Role Tag and Partner Details) */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-600">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm leading-tight">{partner.name}</h4>
                            <span className="text-[10px] text-slate-400 font-medium block">{partner.email}</span>
                          </div>
                        </div>
                        <span className="bg-sky-50 text-sky-600 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border border-sky-100">
                          {user.role === 'PATIENT' ? 'DOCTOR' : 'PATIENT'}
                        </span>
                      </div>

                      {/* Timings */}
                      <div className="bg-slate-50/50 rounded-2xl p-3.5 space-y-2 border border-slate-100">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-sky-500" />
                          <span>{dateStr}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <Clock className="w-3.5 h-3.5 text-sky-500" />
                          <span>{timeStr} ({Math.round((new Date(appointment.endTime) - new Date(appointment.startTime)) / 60000)} Mins)</span>
                        </div>
                      </div>
                    </div>

                    {/* Join Action button */}
                    <button
                      onClick={() => navigate(`/waiting-room/${appointment.id}`)}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition duration-200 shadow-sm"
                    >
                      Enter Call Room
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Booking Form (Patient Only) */}
        {user.role === 'PATIENT' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-5 h-5 text-sky-500" />
              <span>Book Appointment</span>
            </h2>

            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
              {bookingSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl text-sm font-medium">
                  {bookingSuccess}
                </div>
              )}

              {error && bookingSuccess && (
                <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleBookAppointment} className="space-y-4">
                {/* Doctor Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Choose Doctor
                  </label>
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-sky-500 focus:bg-white text-slate-700 font-medium transition-colors"
                  >
                    {doctors.length === 0 ? (
                      <option value="">No doctors available</option>
                    ) : (
                      doctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Date Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Select Date
                  </label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-sky-500 focus:bg-white text-slate-700 font-medium transition-colors"
                  />
                </div>

                {/* Time Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Select Time
                  </label>
                  <input
                    type="time"
                    required
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-sky-500 focus:bg-white text-slate-700 font-medium transition-colors"
                  />
                </div>

                {/* Duration Picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Duration
                  </label>
                  <select
                    value={bookingDuration}
                    onChange={(e) => setBookingDuration(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-sky-500 focus:bg-white text-slate-700 font-medium transition-colors"
                  >
                    <option value="15">15 Minutes</option>
                    <option value="30">30 Minutes</option>
                    <option value="45">45 Minutes</option>
                    <option value="60">60 Minutes</option>
                  </select>
                </div>

                {/* Book Trigger */}
                <button
                  type="submit"
                  disabled={bookingLoading || doctors.length === 0}
                  className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-bold transition duration-200 shadow-md shadow-sky-500/10 hover:shadow-sky-500/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {bookingLoading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    'Confirm Slot Booking'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
