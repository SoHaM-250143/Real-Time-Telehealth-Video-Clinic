const jwt = require('jsonwebtoken');

// 1. Mock Prisma BEFORE importing app/server
const prisma = require('./prisma');
const mockAppointment = {
  id: "app-12345",
  doctorId: "doc-123",
  patientId: "pat-123"
};

prisma.appointment = {
  findUnique: async ({ where }) => {
    if (where.id === mockAppointment.id) {
      return mockAppointment;
    }
    return null;
  }
};

// 2. Start the actual server on a test port (5001)
process.env.PORT = 5001;
process.env.JWT_SECRET = 'test_secret_key_123';
const { server } = require('./index');

// 3. Import socket.io-client
const ioClient = require('socket.io-client');

// Generate test tokens
const docToken = jwt.sign({ id: "doc-123", name: "Dr. Gregory House", role: "DOCTOR" }, 'test_secret_key_123');
const patToken = jwt.sign({ id: "pat-123", name: "Jane Doe", role: "PATIENT" }, 'test_secret_key_123');

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:5001`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true
    });

    socket.on('connect', () => {
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      reject(err);
    });
  });
}

async function runTests() {
  console.log("--- STARTING WEBRTC SIGNALING & CHAT SOCKET TESTS ---");

  let doctorSocket, patientSocket;
  try {
    // Connect doctor & patient
    doctorSocket = await connectSocket(docToken);
    patientSocket = await connectSocket(patToken);
    console.log("✔ Connected both Doctor and Patient client sockets successfully!");

    const roomId = "app-12345";

    // Doctor joins room
    const doctorJoinedPromise = new Promise((resolve) => {
      doctorSocket.on('room-joined', (data) => {
        console.assert(data.roomId === roomId, "Doctor joined room mismatch");
        resolve();
      });
    });
    doctorSocket.emit('join-room', { roomId });
    await doctorJoinedPromise;
    console.log("✔ Doctor joined room successfully!");

    // Patient joins room, doctor should receive peer-joined
    const patientJoinedPromise = new Promise((resolve) => {
      patientSocket.on('room-joined', (data) => {
        resolve();
      });
    });
    const doctorPeerJoinedPromise = new Promise((resolve) => {
      doctorSocket.on('peer-joined', (data) => {
        console.assert(data.user.id === "pat-123", "Patient ID peer-joined mismatch");
        resolve();
      });
    });
    patientSocket.emit('join-room', { roomId });
    await Promise.all([patientJoinedPromise, doctorPeerJoinedPromise]);
    console.log("✔ Patient joined room, Doctor notified of peer!");

    // WebRTC Offer relay check (Patient -> Doctor)
    const offerData = { sdp: "v=0\no=- 123456 2 IN IP4 127.0.0.1..." };
    const doctorOfferPromise = new Promise((resolve) => {
      doctorSocket.on('offer', (data) => {
        console.assert(data.offer.sdp === offerData.sdp, "Offer content mismatch");
        console.assert(data.senderUser.id === "pat-123", "Offer sender mismatch");
        resolve();
      });
    });
    patientSocket.emit('offer', { roomId, offer: offerData });
    await doctorOfferPromise;
    console.log("✔ WebRTC Offer relayed from Patient to Doctor successfully!");

    // WebRTC Answer relay check (Doctor -> Patient)
    const answerData = { sdp: "v=0\no=- 654321 2 IN IP4 127.0.0.1..." };
    const patientAnswerPromise = new Promise((resolve) => {
      patientSocket.on('answer', (data) => {
        console.assert(data.answer.sdp === answerData.sdp, "Answer content mismatch");
        resolve();
      });
    });
    doctorSocket.emit('answer', { roomId, answer: answerData });
    await patientAnswerPromise;
    console.log("✔ WebRTC Answer relayed from Doctor to Patient successfully!");

    // In-Call Chat message check
    const chatMsgText = "Hello Dr. House, I have a throat ache.";
    const chatMessagePromise = new Promise((resolve) => {
      doctorSocket.on('chat-message', (data) => {
        console.assert(data.text === chatMsgText, "Chat message text mismatch");
        console.assert(data.sender.name === "Jane Doe", "Chat message sender mismatch");
        resolve();
      });
    });
    patientSocket.emit('chat-message', { roomId, text: chatMsgText });
    await chatMessagePromise;
    console.log("✔ In-Call Chat message received successfully by other room peers!");

    console.log("--- ALL SIGNING AND CHAT SOCKET TESTS PASSED SUCCESSFULLY! ---");
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  } finally {
    if (doctorSocket) doctorSocket.close();
    if (patientSocket) patientSocket.close();
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  }
}

// Small timeout to allow server to spin up
setTimeout(runTests, 500);
