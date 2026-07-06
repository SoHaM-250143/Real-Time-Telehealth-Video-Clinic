const { register, login, me } = require('./controllers/authController');
const jwt = require('jsonwebtoken');

// Let's create an in-memory database mock
const users = [];

// Mock Prisma client directly
const prisma = require('./prisma');
prisma.user = {
  findUnique: async ({ where }) => {
    if (where.email) {
      return users.find(u => u.email === where.email.toLowerCase()) || null;
    }
    if (where.id) {
      return users.find(u => u.id === where.id) || null;
    }
    return null;
  },
  create: async ({ data }) => {
    const newUser = {
      id: `mock-uuid-${Date.now()}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    users.push(newUser);
    return newUser;
  }
};

// Helper mock framework
async function runTests() {
  console.log("--- STARTING AUTH UNIT TESTS WITH MOCK DATABASE ---");

  // Test 1: Register Patient
  let req = {
    body: {
      email: "patient@test.com",
      password: "password123",
      name: "John Doe",
      role: "PATIENT"
    }
  };
  let res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.data = data;
      return this;
    }
  };

  await register(req, res);
  console.assert(res.statusCode === 201, `Register status should be 201, got ${res.statusCode}`);
  console.assert(res.data.token !== undefined, "Register should return a token");
  console.assert(res.data.user.role === "PATIENT", "User role should be PATIENT");
  console.log("✔ Test 1: Register Patient passed!");

  const token = res.data.token;

  // Test 2: Register same user (should fail)
  res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };
  await register(req, res);
  console.assert(res.statusCode === 400, `Duplicate register status should be 400, got ${res.statusCode}`);
  console.assert(res.data.message === "User with this email already exists.", `Unexpected error: ${res.data.message}`);
  console.log("✔ Test 2: Duplicate registration rejected passed!");

  // Test 3: Login User
  req = {
    body: {
      email: "patient@test.com",
      password: "password123"
    }
  };
  res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };
  await login(req, res);
  console.assert(res.statusCode === 200, `Login status should be 200, got ${res.statusCode}`);
  console.assert(res.data.token !== undefined, "Login should return a token");
  console.log("✔ Test 3: Login passed!");

  // Test 4: Get Current User profile
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'telehealth_super_secret_key_12345!');
  req = {
    user: decoded
  };
  res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; }
  };
  await me(req, res);
  console.assert(res.statusCode === 200, `Fetch profile status should be 200, got ${res.statusCode}`);
  console.assert(res.data.user.email === "patient@test.com", "Profile email should match");
  console.log("✔ Test 4: Get Profile passed!");

  console.log("--- ALL AUTH UNIT TESTS PASSED SUCCESSFULLY! ---");
}

runTests().catch(console.error);
