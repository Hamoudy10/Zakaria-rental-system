const crypto = require('crypto');

// Generate a random secret key
const generateSecret = () => {
  return crypto.randomBytes(64).toString('hex');
};

// Generate multiple options
console.log('🔐 Here are your JWT secret keys:');
console.log('=================================');
for (let i = 1; i <= 3; i++) {
  const secret = generateSecret();
  console.log(`Option ${i}: ${secret}`);
}

console.log('\n📋 Instructions:');
console.log('1. Copy one of the keys above');
console.log('2. Paste it in your .env file as JWT_SECRET');
console.log('3. Keep this key safe and never share it!');