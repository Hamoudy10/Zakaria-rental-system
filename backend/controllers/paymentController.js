const axios = require('axios');
const moment = require('moment');
const Payment = require('../models/Payment'); // Your payment model

// Real M-Pesa STK Push function
const initiateSTKPush = async (req, res) => {
  try {
    const { 
      phone_number, 
      amount, 
      tenant_id,
      unit_id,
      payment_month,
      account_reference = 'RENTAL',
      transaction_desc = 'Rent Payment'
    } = req.body;

    // Validate required fields
    if (!phone_number || !amount || !tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phone_number, amount, tenant_id'
      });
    }

    // Get access token from Daraja API
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    
    const tokenResponse = await axios.get(
      `${process.env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    const access_token = tokenResponse.data.access_token;

    // Prepare STK Push request
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const stkPushPayload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount), // M-Pesa requires whole numbers
      PartyA: phone_number,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone_number,
      CallBackURL: `${process.env.BACKEND_URL}/api/payments/mpesa-callback`,
      AccountReference: account_reference,
      TransactionDesc: transaction_desc,
    };

    console.log('Initiating STK Push:', { 
      phone_number, 
      amount, 
      shortcode: process.env.MPESA_SHORTCODE 
    });

    // Initiate STK Push
    const stkResponse = await axios.post(
      `${process.env.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      stkPushPayload,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Create pending payment record
    const paymentRecord = new Payment({
      tenant_id,
      unit_id,
      amount,
      payment_month,
      phone_number,
      mpesa_transaction_id: stkResponse.data.CheckoutRequestID,
      merchant_request_id: stkResponse.data.MerchantRequestID,
      status: 'pending',
      payment_method: 'mpesa'
    });

    await paymentRecord.save();

    res.json({
      success: true,
      message: 'M-Pesa payment initiated successfully',
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      merchantRequestID: stkResponse.data.MerchantRequestID,
      responseCode: stkResponse.data.ResponseCode,
      responseDescription: stkResponse.data.ResponseDescription,
      payment: paymentRecord
    });

  } catch (error) {
    console.error('M-Pesa STK Push Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate M-Pesa payment',
      details: error.response?.data || error.message,
    });
  }
};

// M-Pesa callback handler
const handleMpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body;
    
    console.log('M-Pesa Callback Received:', JSON.stringify(callbackData, null, 2));

    // Check if this is a valid STK callback
    if (!callbackData.Body || !callbackData.Body.stkCallback) {
      console.log('Invalid callback format');
      return res.status(400).json({ 
        ResultCode: 1, 
        ResultDesc: 'Invalid callback format' 
      });
    }

    const stkCallback = callbackData.Body.stkCallback;
    const checkoutRequestId = stkCallback.CheckoutRequestID;

    // Find the payment record
    const payment = await Payment.findOne({ 
      mpesa_transaction_id: checkoutRequestId 
    });

    if (!payment) {
      console.log('Payment not found for checkoutRequestId:', checkoutRequestId);
      return res.status(200).json({ 
        ResultCode: 1, 
        ResultDesc: 'Payment not found' 
      });
    }

    // Check if transaction was successful
    if (stkCallback.ResultCode === 0) {
      const callbackMetadata = stkCallback.CallbackMetadata?.Item;
      
      if (!callbackMetadata) {
        console.log('No callback metadata found');
        payment.status = 'failed';
        payment.failure_reason = 'No callback metadata received';
        await payment.save();
        return res.status(200).json({ 
          ResultCode: 1, 
          ResultDesc: 'No callback metadata' 
        });
      }

      // Extract payment details from callback
      const amount = callbackMetadata.find(item => item.Name === 'Amount')?.Value;
      const mpesaReceiptNumber = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const transactionDate = callbackMetadata.find(item => item.Name === 'TransactionDate')?.Value;
      const phoneNumber = callbackMetadata.find(item => item.Name === 'PhoneNumber')?.Value;

      // Update payment status to completed
      payment.status = 'completed';
      payment.mpesa_receipt_number = mpesaReceiptNumber;
      payment.payment_date = new Date();
      payment.transaction_date = transactionDate ? 
        moment(transactionDate, 'YYYYMMDDHHmmss').toDate() : new Date();
      
      await payment.save();

      console.log('Payment completed successfully:', {
        receipt: mpesaReceiptNumber,
        amount: amount,
        phone: phoneNumber
      });

      // TODO: Send notification to tenant and admin
      // TODO: Update tenant's payment status

    } else {
      // Transaction failed
      payment.status = 'failed';
      payment.failure_reason = stkCallback.ResultDesc || 'Payment cancelled by user';
      await payment.save();

      console.log('Payment failed:', stkCallback.ResultDesc);
    }

    // Always return success to M-Pesa
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });

  } catch (error) {
    console.error('Callback handling error:', error);
    // Still return success to M-Pesa to avoid repeated callbacks
    res.status(200).json({ 
      ResultCode: 0, 
      ResultDesc: 'Success' 
    });
  }
};

// Check payment status
const checkPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    const payment = await Payment.findOne({ 
      mpesa_transaction_id: checkoutRequestId 
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      payment: payment
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check payment status'
    });
  }
};

module.exports = {
  initiateSTKPush,
  handleMpesaCallback,
  checkPaymentStatus
};