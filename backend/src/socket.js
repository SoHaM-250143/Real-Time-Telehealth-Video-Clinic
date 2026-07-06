const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins for testing/development
      methods: ['GET', 'POST']
    }
  });

  // Socket Connection Auth Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'telehealth_super_secret_key_12345!');
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected to socket: ${socket.user.name} (${socket.user.role}) - ID: ${socket.id}`);

    // Join room event
    socket.on('join-room', async ({ roomId }) => {
      try {
        // Validate appointment exists and user is a participant
        const appointment = await prisma.appointment.findUnique({
          where: { id: roomId }
        });

        if (!appointment) {
          socket.emit('error-msg', { message: 'Appointment room not found.' });
          return;
        }

        if (appointment.doctorId !== socket.user.id && appointment.patientId !== socket.user.id) {
          socket.emit('error-msg', { message: 'Unauthorized room access.' });
          return;
        }

        // Leave other rooms (except self room) before joining
        socket.rooms.forEach((room) => {
          if (room !== socket.id && room !== roomId) {
            socket.leave(room);
          }
        });

        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId}`);

        // Broadcast to other client in room that peer joined
        socket.to(roomId).emit('peer-joined', {
          socketId: socket.id,
          user: {
            id: socket.user.id,
            name: socket.user.name,
            role: socket.user.role
          }
        });

        // Inform sender they successfully joined
        socket.emit('room-joined', { roomId });
      } catch (error) {
        console.error('Socket room join error:', error);
        socket.emit('error-msg', { message: 'Failed to join video room.' });
      }
    });

    // WebRTC: Relay Offer
    socket.on('offer', ({ roomId, offer }) => {
      console.log(`Socket ${socket.id} sending offer to room ${roomId}`);
      socket.to(roomId).emit('offer', {
        offer,
        senderId: socket.id,
        senderUser: {
          id: socket.user.id,
          name: socket.user.name,
          role: socket.user.role
        }
      });
    });

    // WebRTC: Relay Answer
    socket.on('answer', ({ roomId, answer }) => {
      console.log(`Socket ${socket.id} sending answer to room ${roomId}`);
      socket.to(roomId).emit('answer', {
        answer,
        senderId: socket.id
      });
    });

    // WebRTC: Relay ICE Candidate
    socket.on('ice-candidate', ({ roomId, candidate }) => {
      console.log(`Socket ${socket.id} sending ice-candidate to room ${roomId}`);
      socket.to(roomId).emit('ice-candidate', {
        candidate,
        senderId: socket.id
      });
    });

    // Text Chat: Relay message to everyone in the room (including sender)
    socket.on('chat-message', ({ roomId, text }) => {
      if (!text || text.trim() === '') return;

      console.log(`Chat message in room ${roomId} from ${socket.user.name}: ${text}`);
      io.to(roomId).emit('chat-message', {
        text,
        sender: {
          id: socket.user.id,
          name: socket.user.name,
          role: socket.user.role
        },
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnecting
    socket.on('disconnecting', () => {
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.to(room).emit('peer-left', {
            socketId: socket.id,
            userId: socket.user.id
          });
        }
      });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

module.exports = initSocket;
