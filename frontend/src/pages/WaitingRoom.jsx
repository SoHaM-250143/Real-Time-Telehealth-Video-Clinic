import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Clock, Video, AlertCircle, ArrowLeft, Loader, ShieldCheck, Heart } from 'lucide-react';

const WaitingRoom = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State Management
  const [appointment, setAppointment] = useState(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdownText, setCountdownText] = useState('');
  const [isConcluded, setIsConcluded] = useState(false);

  const timerRef = useRef(null);

  // 1. Fetch general appointment details and verify access
  const checkAccess = async () => {
    try {
      const accessData = await apiRequest(`/appointments/${appointmentId}/verify-access`);
      setAllowed(accessData.allowed);
      setAppointment(accessData.appointment);
      setLoading(false);
      setErrorMsg('');
      setIsConcluded(false);
    } catch (err) {
      // If it fails, check why
      if (err.message.includes('concluded')) {
        setIsConcluded(true);
      } else if (err.message.includes('early') || err.message.includes('join')) {
        // It is early. Let's fetch the appointment details from the general list
        try {
          const list = await apiRequest('/appointments');
          const matched = list.find((app) => app.id === appointmentId);
          if (matched) {
            setAppointment(matched);
            setAllowed(false);
            setErrorMsg('');
            startLocalCountdown(matched.startTime);
            setLoading(false);
            return;
          }
        } catch (listErr) {
          console.error(listErr);
        }
      }
      
      setErrorMsg(err.message || 'Access denied to this clinic room.');
      setLoading(false);
    }
  };

  // 2. Start precise client-side countdown until early-entry window (10 minutes before start)
  const startLocalCountdown = (startTimeIso) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const startTime = new Date(startTimeIso);
    const earlyLimitTime = startTime.getTime() - 10 * 60 * 1000; // 10 minutes early

    const updateCountdown = () => {
      const now = new Date().getTime();
      const difference = earlyLimitTime - now;

      if (difference <= 0) {
        // Early window has started!
        clearInterval(timerRef.current);
        setCountdownText('');
        checkAccess(); // Re-verify with backend to unlock Join button
      } else {
        const mins = Math.floor(difference / 1000 / 60);
        const secs = Math.floor((difference / 1000) % 60);
        setCountdownText(
          `${mins} minute${mins !== 1 ? 's' : ''} and ${secs} second${secs !== 1 ? 's' : ''} remaining`
        );
      }
    };

    updateCountdown();
    timerRef.current = setInterval(updateCountdown, 1000);
  };

  useEffect(() => {
    checkAccess();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [appointmentId]);

  const handleJoinCall = () => {
    navigate(`/video-room/${appointmentId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader className="w-8 h-8 text-sky-500 animate-spin" />
          <p className="text-slate-500 font-medium">Entering clinic lobby...</p>
        </div>
      </div>
    );
  }

  const partner = appointment 
    ? (user.role === 'DOCTOR' ? appointment.patient : appointment.doctor)
    : null;

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-to-tr from-slate-50 via-sky-50/20 to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-150/40 p-8 space-y-6 relative overflow-hidden">
        
        {/* Glow styling */}
        <div className="absolute right-0 top-0 w-48 h-48 bg-sky-400/5 rounded-full blur-3xl pointer-events-none" />

        {/* Back Link */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit Waiting Lobby</span>
        </button>

        {errorMsg && !appointment && (
          <div className="space-y-4 text-center py-6">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center border border-red-100 shadow-sm">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Security Gate Block</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">{errorMsg}</p>
          </div>
        )}

        {appointment && (
          <div className="space-y-6">
            {/* Consultation Card details */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center border border-sky-100 shadow-sm mb-4">
                <Heart className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-850">
                Medical Consultation Lobby
              </h2>
              <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">
                Appointment ID: <span className="font-mono text-slate-600 select-all">{appointment.id}</span>
              </p>
            </div>

            {/* Call partners panel */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-semibold uppercase text-xs">Patient</span>
                <span className="text-slate-700 font-bold">
                  {user.role === 'PATIENT' ? user.name : partner?.name}
                </span>
              </div>
              <div className="border-t border-slate-100 my-1" />
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-semibold uppercase text-xs">Consultant</span>
                <span className="text-slate-700 font-bold">
                  {user.role === 'DOCTOR' ? user.name : partner?.name}
                </span>
              </div>
            </div>

            {/* Gate permissions logic */}
            {allowed ? (
              <div className="space-y-4 text-center bg-emerald-50/50 border border-emerald-100 rounded-3xl p-6">
                <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                  <span>Secure Video Tunnel Ready</span>
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Your time slot is active. Connect to the signaling server and open your camera to begin.
                </p>
                <button
                  onClick={handleJoinCall}
                  className="w-full py-4 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-bold shadow-md shadow-sky-500/10 hover:shadow-sky-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Video className="w-5 h-5" />
                  <span>Join Secure Video Call</span>
                </button>
              </div>
            ) : isConcluded ? (
              <div className="text-center p-6 bg-red-50/50 border border-red-150 rounded-3xl space-y-3">
                <div className="flex items-center justify-center gap-2 text-red-600 font-bold text-sm">
                  <AlertCircle className="w-5 h-5" />
                  <span>Appointment Expired</span>
                </div>
                <p className="text-xs text-slate-500">
                  This telehealth consultation session has concluded. If this is an error, please coordinate with your clinic manager.
                </p>
              </div>
            ) : (
              <div className="text-center p-6 bg-slate-50 border border-slate-200/60 rounded-3xl space-y-4">
                <div className="flex items-center justify-center gap-2 text-slate-600 font-bold text-sm">
                  <Clock className="w-5 h-5 text-sky-500 animate-pulse" />
                  <span>Waiting Lobby Locked</span>
                </div>
                
                {countdownText ? (
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-semibold block uppercase">Opening Gate In</span>
                    <span className="text-base font-bold text-slate-800 tracking-wide block bg-white border border-slate-100 rounded-xl py-2 px-4 shadow-sm w-fit mx-auto">
                      {countdownText}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Verifying gate entry constraints. Please wait...
                  </p>
                )}

                <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                  Access becomes active 10 minutes prior to scheduled start times.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WaitingRoom;
