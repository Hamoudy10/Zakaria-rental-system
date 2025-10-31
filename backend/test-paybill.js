const axios = require('axios');

const testPaybillPayment = async () => {
  const testPayment = {
    unit_code: 'PROP001-UNIT01', // Use an actual unit code from your database
    amount: 5000,
    mpesa_receipt_number: 'TEST' + Date.now(),
    phone_number: '254712345678',
    payment_month: new Date().toISOString().slice(0, 7)
  };

  try {
    console.log('🧪 Testing paybill payment:', testPayment);
    
    const response = await axios.post('http://localhost:3001/api/payments/paybill', testPayment, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Paybill test successful:', response.data);
  } catch (error) {
    console.error('❌ Paybill test failed:', error.response?.data || error.message);
  }
};

// Test SMS service
const testSMSService = async () => {
  try {
    const response = await axios.post('http://localhost:3001/api/payments/test-sms', {
      phone: '254712345678',
      message: 'Test SMS from Rental System - Paybill integration working!'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ SMS test successful:', response.data);
  } catch (error) {
    console.error('❌ SMS test failed:', error.response?.data || error.message);
  }
};

// Run tests
testPaybillPayment();
testSMSService();const axios = require('axios');

const testPaybillPayment = async () => {
  const testPayment = {
    unit_code: 'PROP001-UNIT01', // Use an actual unit code from your database
    amount: 5000,
    mpesa_receipt_number: 'TEST' + Date.now(),
    phone_number: '254712345678',
    payment_month: new Date().toISOString().slice(0, 7)
  };

  try {
    console.log('🧪 Testing paybill payment:', testPayment);
    
    const response = await axios.post('http://localhost:3001/api/payments/paybill', testPayment, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Paybill test successful:', response.data);
  } catch (error) {
    console.error('❌ Paybill test failed:', error.response?.data || error.message);
  }
};

// Test SMS service
const testSMSService = async () => {
  try {
    const response = await axios.post('http://localhost:3001/api/payments/test-sms', {
      phone: '254712345678',
      message: 'Test SMS from Rental System - Paybill integration working!'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ SMS test successful:', response.data);
  } catch (error) {
    console.error('❌ SMS test failed:', error.response?.data || error.message);
  }
};

// Run tests
testPaybillPayment();
testSMSService();