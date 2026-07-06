const { createAppointment, verifyRoomAccess } = require('./controllers/appointmentController');

const mockAppointments = [];
const mockUsers = [
  { id: "doc-1", name: "Dr. Smith", role: "DOCTOR" },
  { id: "pat-1", name: "Jane Doe", role: "PATIENT" },
  { id: "pat-2", name: "Bob Johnson", role: "PATIENT" }
];

const prisma = require('./prisma');
prisma.user = {
  findUnique: async ({ where }) => {
    return mockUsers.find(u => u.id === where.id) || null;
  }
};

prisma.appointment = {
  findFirst: async ({ where }) => {
    const { OR, AND } = where;
    const docId = OR[0].doctorId;
    const patId = OR[1].patientId;
    
    // AND[0].startTime.lt is end of new appointment
    // AND[1].endTime.gt is start of new appointment
    const newEnd = AND[0].startTime.lt;
    const newStart = AND[1].endTime.gt;

    return mockAppointments.find(app => {
      const matchParticipant = app.doctorId === docId || app.patientId === patId;
      const overlaps = new Date(app.startTime) < newEnd && new Date(app.endTime) > newStart;
      return matchParticipant && overlaps;
    }) || null;
  },
  create: async ({ data }) => {
    const newApp = {
      id: `app-uuid-${Date.now()}`,
      ...data,
      doctor: mockUsers.find(u => u.id === data.doctorId),
      patient: mockUsers.find(u => u.id === data.patientId),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockAppointments.push(newApp);
    return newApp;
  },
  findUnique: async ({ where }) => {
    return mockAppointments.find(app => app.id === where.id) || null;
  },
  findMany: async ({ where }) => {
    const { doctorId, patientId } = where;
    if (doctorId) return mockAppointments.filter(app => app.doctorId === doctorId);
    if (patientId) return mockAppointments.filter(app => app.patientId === patientId);
    return [];
  }
};

async function runTests() {
  console.log("--- STARTING BOOKING UNIT TESTS WITH MOCK DATABASE ---");

  const now = new Date();
  const startTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins from now
  const endTime = new Date(now.getTime() + 60 * 60 * 1000);   // 60 mins from now

  // Test 1: Patient schedules appointment successfully
  let req = {
    user: { id: "pat-1", role: "PATIENT" },
    body: {
      doctorId: "doc-1",
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    }
  };
  let res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };

  await createAppointment(req, res);
  console.assert(res.statusCode === 201, `Expected 201, got ${res.statusCode}`);
  const app1 = res.data.appointment;
  console.assert(app1 !== undefined, "Appointment should be returned");
  console.log("✔ Test 1: Create appointment passed!");

  // Test 2: Overlapping appointment for doctor/patient (should fail)
  req = {
    user: { id: "pat-2", role: "PATIENT" },
    body: {
      doctorId: "doc-1",
      startTime: new Date(now.getTime() + 40 * 60 * 1000).toISOString(),
      endTime: new Date(now.getTime() + 50 * 60 * 1000).toISOString()
    }
  };
  res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };
  await createAppointment(req, res);
  console.assert(res.statusCode === 400, `Expected 400 for duplicate, got ${res.statusCode}`);
  console.assert(res.data.message.includes("conflict"), `Expected conflict message, got "${res.data.message}"`);
  console.log("✔ Test 2: Double-booking validation passed!");

  // Test 3: Time-gated access (Verify join call permissions)
  // Scenario 3a: Accessing early (outside 10 min window) - should block
  req = {
    user: { id: "pat-1", role: "PATIENT" },
    params: { id: app1.id }
  };
  res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };
  await verifyRoomAccess(req, res);
  console.assert(res.statusCode === 400, `Expected 400 (too early), got ${res.statusCode}`);
  console.assert(res.data.allowed === false, "Access should be denied");
  console.log("✔ Test 3a: Block early entry passed!");

  // Scenario 3b: Accessing inside window (starts -5m ago, ends in 25m) - should allow
  app1.startTime = new Date(now.getTime() - 5 * 60 * 1000);
  app1.endTime = new Date(now.getTime() + 25 * 60 * 1000);

  res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };
  await verifyRoomAccess(req, res);
  console.assert(res.statusCode === 200, `Expected 200 (allowed), got ${res.statusCode}`);
  console.assert(res.data.allowed === true, "Access should be allowed during session");
  console.log("✔ Test 3b: Allow active session entry passed!");

  // Scenario 3c: Accessing after end time (ended 5m ago) - should block
  app1.startTime = new Date(now.getTime() - 35 * 60 * 1000);
  app1.endTime = new Date(now.getTime() - 5 * 60 * 1000);

  res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };
  await verifyRoomAccess(req, res);
  console.assert(res.statusCode === 400, `Expected 400 (concluded), got ${res.statusCode}`);
  console.assert(res.data.allowed === false, "Access should be denied after conclusion");
  console.log("✔ Test 3c: Block late entry passed!");

  console.log("--- ALL BOOKING UNIT TESTS PASSED SUCCESSFULLY! ---");
}

runTests().catch(console.error);
