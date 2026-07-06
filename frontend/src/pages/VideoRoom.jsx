import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import io from 'socket.io-client';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, Send, MessageSquare, 
  Users, AlertCircle, Loader, ShieldAlert, CheckCircle2 
} from 'lucide-react';

const VideoRoom = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  // State Management
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [appointment, setAppointment] = useState(null);
  
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCamEnabled, setIsCamEnabled] = useState(true);
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [peerStatus, setPeerStatus] = useState('Waiting for peer to join...');
  const [isChatOpen, setIsChatOpen] = useState(true);

  // Refs for WebRTC & Elements
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const chatBottomRef = useRef(null);
  
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  
  const STUN_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // 1. Check Access on mount
  useEffect(() => {
    const initRoomAccess = async () => {
      try {
        const access = await apiRequest(`/appointments/${appointmentId}/verify-access`);
        if (access.allowed) {
          setAppointment(access.appointment);
          initMediaAndSocket();
        } else {
          setAccessError(access.message || 'Verification failed.');
          setLoading(false);
        }
      } catch (err) {
        setAccessError(err.message || 'Failed to authenticate appointment session.');
        setLoading(false);
      }
    };

    initRoomAccess();

    return () => {
      cleanupCall();
    };
  }, [appointmentId]);

  // 2. Initialize Media Stream and Socket Connection
  const initMediaAndSocket = async () => {
    try {
      // Fetch Local Audio/Video streams
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Connect to signaling socket
      socketRef.current = io('http://localhost:5000', {
        auth: { token },
        transports: ['websocket']
      });

      setupSocketListeners();
      setLoading(false);
    } catch (err) {
      console.error('Media or Socket initialization failed:', err);
      setAccessError('Permission denied. Please allow access to your camera and microphone.');
      setLoading(false);
    }
  };

  // 3. Configure Socket.io Listeners for WebRTC Signaling
  const setupSocketListeners = () => {
    const socket = socketRef.current;

    // Join room
    socket.emit('join-room', { roomId: appointmentId });

    socket.on('room-joined', () => {
      console.log('Successfully registered in signaling room.');
    });

    socket.on('error-msg', (data) => {
      setAccessError(data.message || 'Signaling error occurred.');
    });

    // Receive chat message
    socket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });

    // A peer joined: We initiate WebRTC connection (the peer already in room initiates)
    socket.on('peer-joined', async (data) => {
      console.log('Peer connected to room:', data.user.name);
      setPeerStatus(`${data.user.name} (${data.user.role}) is in the call`);
      
      // Initialize peer connection as caller
      await makeOffer();
    });

    // Receive Offer
    socket.on('offer', async (data) => {
      console.log('Received WebRTC Offer from peer.');
      setPeerStatus(`${data.senderUser.name} is connected`);
      await handleOffer(data.offer);
    });

    // Receive Answer
    socket.on('answer', async (data) => {
      console.log('Received WebRTC Answer.');
      await handleAnswer(data.answer);
    });

    // Receive ICE Candidate
    socket.on('ice-candidate', async (data) => {
      console.log('Received WebRTC ICE Candidate.');
      await handleCandidate(data.candidate);
    });

    // Peer disconnected
    socket.on('peer-left', (data) => {
      console.log('Peer disconnected from room.');
      setPeerStatus('Peer left the call.');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      closePeerConnection();
    });
  };

  // 4. Create RTCPeerConnection and bind events
  const createPeerConnection = () => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    console.log('Initializing RTCPeerConnection...');
    const pc = new RTCPeerConnection(STUN_SERVERS);

    // Bind local stream tracks to connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          roomId: appointmentId,
          candidate: event.candidate
        });
      }
    };

    // Bind incoming remote stream tracks to HTML video element
    pc.ontrack = (event) => {
      console.log('Received remote media stream track.');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // WebRTC Exchange functions
  const makeOffer = async () => {
    const pc = createPeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socketRef.current.emit('offer', {
        roomId: appointmentId,
        offer
      });
    } catch (err) {
      console.error('Failed to create offer:', err);
    }
  };

  const handleOffer = async (offer) => {
    const pc = createPeerConnection();
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current.emit('answer', {
        roomId: appointmentId,
        answer
      });
    } catch (err) {
      console.error('Failed to set offer/create answer:', err);
    }
  };

  const handleAnswer = async (answer) => {
    const pc = peerConnectionRef.current;
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Failed to set remote answer:', err);
      }
    }
  };

  const handleCandidate = async (candidate) => {
    const pc = peerConnectionRef.current;
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    }
  };

  // 5. User Control Handlers (Mute, Video Toggle, End Call)
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamEnabled(videoTrack.enabled);
      }
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText || inputText.trim() === '') return;

    if (socketRef.current) {
      socketRef.current.emit('chat-message', {
        roomId: appointmentId,
        text: inputText
      });
      setInputText('');
    }
  };

  const closePeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const cleanupCall = () => {
    closePeerConnection();
    
    // Stop local camera/mic streams
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Disconnect socket connection
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const handleEndCall = () => {
    cleanupCall();
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader className="w-8 h-8 text-sky-500 animate-spin" />
          <p className="text-slate-400 font-semibold">Tunnelling WebRTC connection stream...</p>
        </div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-red-950 text-red-500 flex items-center justify-center border border-red-900 shadow-sm">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Access Denied</h2>
          <p className="text-slate-400 text-sm">{accessError}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const partnerUser = user.role === 'DOCTOR' ? appointment?.patient : appointment?.doctor;

  return (
    <div className="min-h-[calc(100vh-73px)] bg-slate-950 flex flex-col lg:flex-row relative">
      
      {/* Video Stream Main Display Grid */}
      <div className="flex-1 flex flex-col relative bg-black/40 p-4">
        
        {/* Connection status header */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 text-xs font-semibold text-slate-300">
          <div className={`w-2.5 h-2.5 rounded-full ${
            peerStatus.includes('is connected') || peerStatus.includes('in the call')
              ? 'bg-emerald-500 animate-pulse'
              : 'bg-amber-500'
          }`} />
          <span>{peerStatus}</span>
        </div>

        {/* Remote Video Stream Container */}
        <div className="flex-1 relative rounded-3xl overflow-hidden border border-slate-900 bg-slate-900/20 flex items-center justify-center">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {(!remoteVideoRef.current?.srcObject) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-slate-950/80 text-center p-6">
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 text-slate-400">
                <Users className="w-8 h-8 animate-pulse" />
              </div>
              <h3 className="text-slate-200 font-bold text-lg">Waiting for {partnerUser?.name}</h3>
              <p className="text-slate-500 text-xs max-w-xs">
                Call starts as soon as your partner enters the Waiting Lobby and clicks Join Call.
              </p>
            </div>
          )}
        </div>

        {/* Local Stream (PIP) Container */}
        <div className="absolute bottom-24 right-8 z-15 w-40 h-52 md:w-48 md:h-64 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]" // mirror local feed
          />
          {!isCamEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-500">
              <VideoOff className="w-6 h-6" />
            </div>
          )}
          <span className="absolute bottom-3 left-3 bg-black/50 text-[10px] text-white font-semibold px-2 py-0.5 rounded-md">
            You
          </span>
        </div>

        {/* Local Control Toolbar */}
        <div className="h-20 flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`p-4 rounded-full border transition duration-200 ${
              isMicEnabled 
                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' 
                : 'bg-red-500/20 border-red-500/40 text-red-500 hover:bg-red-500/30'
            }`}
          >
            {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full border transition duration-200 ${
              isCamEnabled 
                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' 
                : 'bg-red-500/20 border-red-500/40 text-red-500 hover:bg-red-500/30'
            }`}
          >
            {isCamEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          <button
            onClick={handleEndCall}
            className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-full transition duration-200 shadow-lg shadow-red-650/20"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slide-out Sidebar Chat Container */}
      {isChatOpen && (
        <div className="w-full lg:w-96 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-[400px] lg:h-auto">
          {/* Chat header */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-200">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-sm">Consultation Chat</span>
            </div>
            <span className="bg-slate-800 text-slate-400 font-semibold px-2 py-0.5 text-[10px] rounded-full uppercase tracking-wider">
              Secure
            </span>
          </div>

          {/* Chat feed */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-slate-500 p-4">
                <p className="text-xs">Chat is empty. Send a message to start conversing.</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isSelf = msg.sender.id === user.id;
                return (
                  <div key={index} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] text-slate-500 mb-1 font-semibold">
                      {isSelf ? 'You' : msg.sender.name}
                    </span>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs ${
                      isSelf 
                        ? 'bg-sky-500 text-white rounded-tr-none' 
                        : 'bg-slate-800 text-slate-200 rounded-tl-none'
                    }`}>
                      <p className="leading-relaxed break-words">{msg.text}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Message input footer */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 flex items-center gap-2 bg-slate-950/40">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700/60 rounded-xl focus:outline-none focus:border-sky-500 text-xs text-slate-200 placeholder-slate-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center shadow-md shadow-sky-500/10"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default VideoRoom;
