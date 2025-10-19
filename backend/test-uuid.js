const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Test UUID in JWT
const testUUID = uuidv4();
console.log('Test UUID:', testUUID);

const token = jwt.sign(
  { 
    userId: testUUID,
    email: 'test@example.com',
    role: 'admin' 
  },
  'test-secret'
);

console.log('JWT Token with UUID:', token);

// Verify the token
const decoded = jwt.verify(token, 'test-secret');
console.log('Decoded JWT:', decoded);
console.log('UUID preserved:', decoded.userId === testUUID);