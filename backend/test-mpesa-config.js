require('dotenv').config();

console.log('🔧 M-Pesa Configuration Diagnostic Test');
console.log('=====================================');

// Check all M-Pesa environment variables
const envVars = {
  'MPESA_CONSUMER_KEY': process.env.MPESA_CONSUMER_KEY,
  'MPESA_CONSUMER_SECRET': process.env.MPESA_CONSUMER_SECRET,
  'MPESA_SHORT_CODE': process.env.MPESA_SHORT_CODE,
  'MPESA_PASSKEY': process.env.MPESA_PASSKEY,
  'BACKEND_URL': process.env.BACKEND_URL,
  'MPESA_CALLBACK_URL': process.env.MPESA_CALLBACK_URL,
  'MPESA_ENVIRONMENT': process.env.MPESA_ENVIRONMENT
};

console.log('\n📋 Environment Variables Status:');
Object.entries(envVars).forEach(([key, value]) => {
  if (value) {
    console.log(`✅ ${key}: ${key.includes('SECRET') || key.includes('PASSKEY') ? '***' : value}`);
  } else {
    console.log(`❌ ${key}: NOT SET`);
  }
});

console.log('\n🔍 Checking .env file location...');
console.log('Current directory:', process.cwd());
console.log('Looking for .env file in:', require('path').resolve(process.cwd(), '.env'));

// Test if we can access the .env file
const fs = require('fs');
const path = require('path');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
  console.log('✅ .env file exists at:', envPath);
  
  // Read and display the .env content (without sensitive data)
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('\n📄 .env file content (first few lines):');
  const lines = envContent.split('\n').slice(0, 10); // Show first 10 lines
  lines.forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key] = line.split('=');
      if (key && envVars[key]) {
        console.log(`   ${line.split('=')[0]}=***`);
      } else {
        console.log(`   ${line}`);
      }
    }
  });
} else {
  console.log('❌ .env file NOT FOUND at:', envPath);
}

console.log('\n🚀 Recommended fix:');
console.log('1. Make sure your .env file is in the backend folder');
console.log('2. Check for typos in variable names');
console.log('3. Restart your server after making changes');