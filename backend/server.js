const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Zakaria Rental System API is running',
    timestamp: new Date().toISOString()
  });
});

// Mock login endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  console.log('Login attempt:', { email, password });

  // Mock user for testing
  const user = {
    id: '1',
    national_id: '00000000',
    first_name: 'System',
    last_name: 'Administrator', 
    email: 'admin@example.com',
    phone_number: '254700000000',
    role: 'admin',
    is_active: true
  };

  // Mock authentication
  if (email === 'admin@example.com' && password === 'test123') {
    console.log('Login successful for:', email);
    
    res.json({
      success: true,
      message: 'Login successful!',
      user: user,
      token: 'test-jwt-token-12345'
    });
  } else {
    console.log('Login failed for:', email);
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

// Simple register route
app.post('/api/auth/register', (req, res) => {
  const { email, password, first_name, last_name, phone_number } = req.body;
  
  if (email && password && first_name && last_name && phone_number) {
    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      data: {
        user: {
          id: '2',
          email: email,
          role: 'tenant',
          first_name: first_name,
          last_name: last_name,
          phone_number: phone_number
        },
        token: 'mock_jwt_token_for_development'
      }
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }
});

// Get all users
app.get('/api/users', (req, res) => {
  // TODO: Query database for users
  res.json({
    users: [
      {
        id: '1',
        national_id: '00000000',
        first_name: 'System',
        last_name: 'Administrator',
        email: 'admin@example.com',
        phone_number: '254700000000',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        national_id: '12345678',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone_number: '254712345678',
        role: 'tenant',
        is_active: true,
        created_at: new Date().toISOString()
      }
    ]
  });
});

// Create user
app.post('/api/users', (req, res) => {
  const userData = req.body;
  // TODO: Insert into database
  const newUser = {
    id: Math.random().toString(36).substr(2, 9),
    ...userData,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  res.json(newUser);
});

// Update user
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // TODO: Update in database
  res.json({ success: true, message: 'User updated' });
});

// Delete user (soft delete)
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  // TODO: Update user to inactive in database
  res.json({ success: true, message: 'User deactivated' });
});


// Test properties route
app.get('/api/properties', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      properties: [
        {
          id: '1',
          property_code: 'WL001',
          name: 'Westlands Apartments',
          address: '123 Westlands Road',
          county: 'Nairobi',
          town: 'Westlands',
          total_units: 24,
          available_units: 5
        }
      ]
    }
  });
});


// In your backend server.js, add these routes:

// Get all payments
app.get('/api/payments', (req, res) => {
  // TODO: Query database for payments
  res.json({
    payments: [
      {
        id: '1',
        tenant_id: 'tenant-123',
        unit_id: 'unit-456',
        mpesa_transaction_id: 'MPE123456789',
        mpesa_receipt_number: 'RC123456',
        phone_number: '254712345678',
        amount: 15000.00,
        payment_month: '2024-01-01',
        payment_date: new Date().toISOString(),
        status: 'completed',
        created_at: new Date().toISOString()
      }
    ]
  });
});

// Get payments for specific tenant
app.get('/api/payments/tenant/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  // TODO: Query database for tenant payments
  res.json({
    payments: [
      {
        id: '1',
        amount: 15000.00,
        payment_month: '2024-01-01',
        status: 'completed',
        property_name: 'Westlands Apartments',
        unit_number: 'A101'
      }
    ]
  });
});

// Create payment
app.post('/api/payments', (req, res) => {
  const paymentData = req.body;
  // TODO: Insert into database
  const newPayment = {
    id: Math.random().toString(36).substr(2, 9),
    ...paymentData,
    status: 'completed',
    payment_date: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  res.json(newPayment);
});

// Update payment
app.put('/api/payments/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // TODO: Update in database
  res.json({ success: true, message: 'Payment updated' });
});

// Confirm payment
app.post('/api/payments/:id/confirm', (req, res) => {
  const { id } = req.params;
  // TODO: Update payment status in database
  res.json({ 
    success: true, 
    message: 'Payment confirmed',
    payment: {
      id: id,
      status: 'completed',
      confirmed_at: new Date().toISOString()
    }
  });
});

// Delete payment
app.delete('/api/payments/:id', (req, res) => {
  const { id } = req.params;
  // TODO: Delete from database
  res.json({ success: true, message: 'Payment deleted' });
});

// Get all reports
app.get('/api/reports', (req, res) => {
  // TODO: Query database for reports
  res.json({
    reports: [
      {
        id: '1',
        report_type: 'financial',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        total_payments: 450000.00,
        generated_at: new Date().toISOString()
      }
    ]
  });
});

// Generate financial report
app.get('/api/reports/financial', (req, res) => {
  const { period, start_date, end_date } = req.query;
  // TODO: Generate financial report from database
  res.json({
    report: {
      id: Math.random().toString(36).substr(2, 9),
      type: 'financial',
      period: period || 'monthly',
      start_date: start_date || '2024-01-01',
      end_date: end_date || '2024-01-31',
      total_income: 450000.00,
      total_expenses: 120000.00,
      net_profit: 330000.00,
      generated_at: new Date().toISOString(),
      data: {
        rent_payments: 400000.00,
        other_income: 50000.00,
        maintenance_costs: 40000.00,
        staff_salaries: 60000.00,
        utilities: 20000.00
      }
    }
  });
});

// Generate occupancy report
app.get('/api/reports/occupancy', (req, res) => {
  const { period } = req.query;
  // TODO: Generate occupancy report from database
  res.json({
    report: {
      id: Math.random().toString(36).substr(2, 9),
      type: 'occupancy',
      period: period || 'monthly',
      total_units: 50,
      occupied_units: 35,
      vacant_units: 15,
      occupancy_rate: 70.0,
      generated_at: new Date().toISOString(),
      data: {
        by_property: [
          {
            property_name: 'Westlands Apartments',
            total_units: 24,
            occupied_units: 18,
            vacant_units: 6,
            occupancy_rate: 75.0
          }
        ]
      }
    }
  });
});

// Generate payment report
app.get('/api/reports/payment', (req, res) => {
  const { period } = req.query;
  // TODO: Generate payment report from database
  res.json({
    report: {
      id: Math.random().toString(36).substr(2, 9),
      type: 'payment',
      period: period || 'monthly',
      total_collected: 350000.00,
      total_pending: 50000.00,
      collection_rate: 87.5,
      generated_at: new Date().toISOString(),
      data: {
        on_time_payments: 28,
        late_payments: 7,
        pending_payments: 5
      }
    }
  });
});

// Generate custom report
app.post('/api/reports/generate', (req, res) => {
  const reportData = req.body;
  // TODO: Generate custom report based on parameters
  const newReport = {
    id: Math.random().toString(36).substr(2, 9),
    ...reportData,
    generated_at: new Date().toISOString(),
    report_data: {
      summary: 'Custom report generated successfully',
      details: reportData
    }
  };
  res.json(newReport);
});

// Get all allocations
app.get('/api/allocations', (req, res) => {
  // TODO: Query database for allocations
  res.json({
    allocations: [
      {
        id: '1',
        tenant_id: 'tenant-123',
        unit_id: 'unit-456',
        lease_start_date: '2024-01-01',
        lease_end_date: '2024-12-31',
        monthly_rent: 15000.00,
        security_deposit: 30000.00,
        rent_due_day: 5,
        grace_period_days: 7,
        is_active: true,
        allocation_date: new Date().toISOString(),
        tenant_name: 'John Doe',
        unit_number: 'A101',
        property_name: 'Westlands Apartments'
      }
    ]
  });
});

// Get allocations for specific tenant
app.get('/api/allocations/tenant/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  // TODO: Query database for tenant allocations
  res.json({
    allocations: [
      {
        id: '1',
        unit_id: 'unit-456',
        lease_start_date: '2024-01-01',
        lease_end_date: '2024-12-31',
        monthly_rent: 15000.00,
        is_active: true,
        unit_number: 'A101',
        property_name: 'Westlands Apartments'
      }
    ]
  });
});

// Get allocations for specific unit
app.get('/api/allocations/unit/:unitId', (req, res) => {
  const { unitId } = req.params;
  // TODO: Query database for unit allocations
  res.json({
    allocations: [
      {
        id: '1',
        tenant_id: 'tenant-123',
        lease_start_date: '2024-01-01',
        lease_end_date: '2024-12-31',
        monthly_rent: 15000.00,
        is_active: true,
        tenant_name: 'John Doe',
        tenant_phone: '254712345678'
      }
    ]
  });
});

// Create allocation
app.post('/api/allocations', (req, res) => {
  const allocationData = req.body;
  // TODO: Insert into database
  const newAllocation = {
    id: Math.random().toString(36).substr(2, 9),
    ...allocationData,
    is_active: true,
    allocation_date: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  res.json(newAllocation);
});

// Update allocation
app.put('/api/allocations/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // TODO: Update in database
  res.json({ success: true, message: 'Allocation updated' });
});

// Delete allocation
app.delete('/api/allocations/:id', (req, res) => {
  const { id } = req.params;
  // TODO: Delete from database
  res.json({ success: true, message: 'Allocation deleted' });
});

// End tenancy
app.post('/api/allocations/:id/end', (req, res) => {
  const { id } = req.params;
  // TODO: Update allocation to inactive in database
  res.json({ 
    success: true, 
    message: 'Tenancy ended successfully',
    allocation: {
      id: id,
      is_active: false,
      lease_end_date: new Date().toISOString()
    }
  });
});

// Get all notifications
app.get('/api/notifications', (req, res) => {
  // TODO: Query database for notifications
  res.json({
    notifications: [
      {
        id: '1',
        recipient_id: 'user-123',
        message_type: 'payment',
        message_content: 'Rent payment received for January 2024',
        is_sent: true,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
    ]
  });
});

// Get unread notifications
app.get('/api/notifications/unread', (req, res) => {
  // TODO: Query database for unread notifications
  res.json({
    notifications: [
      {
        id: '2',
        message_type: 'announcement',
        message_content: 'New maintenance schedule posted',
        created_at: new Date().toISOString()
      }
    ],
    unread_count: 1
  });
});

// Mark notification as read
app.put('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  // TODO: Update notification in database
  res.json({ 
    success: true, 
    message: 'Notification marked as read',
    notification: {
      id: id,
      is_read: true,
      read_at: new Date().toISOString()
    }
  });
});

// Mark all notifications as read
app.put('/api/notifications/read-all', (req, res) => {
  // TODO: Update all notifications for user in database
  res.json({ 
    success: true, 
    message: 'All notifications marked as read',
    updated_count: 5
  });
});

// Create notification
app.post('/api/notifications', (req, res) => {
  const notificationData = req.body;
  // TODO: Insert into database
  const newNotification = {
    id: Math.random().toString(36).substr(2, 9),
    ...notificationData,
    is_sent: true,
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  res.json(newNotification);
});

// Get announcements
app.get('/api/announcements', (req, res) => {
  // TODO: Query database for announcements
  res.json({
    announcements: [
      {
        id: '1',
        title: 'Maintenance Notice',
        content: 'There will be water shutdown on Saturday for maintenance.',
        author_id: 'admin-123',
        target_audience: ['tenant'],
        is_published: true,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        author_name: 'System Admin'
      }
    ]
  });
});

// Create announcement
app.post('/api/announcements', (req, res) => {
  const announcementData = req.body;
  // TODO: Insert into database
  const newAnnouncement = {
    id: Math.random().toString(36).substr(2, 9),
    ...announcementData,
    is_published: true,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  res.json(newAnnouncement);
});

// Get all complaints
app.get('/api/complaints', (req, res) => {
  // TODO: Query database for complaints
  res.json({
    complaints: [
      {
        id: '1',
        tenant_id: 'tenant-123',
        unit_id: 'unit-456',
        title: 'Leaking faucet in kitchen',
        description: 'The kitchen faucet has been leaking for 2 days',
        category: 'plumbing',
        priority: 'medium',
        status: 'open',
        raised_at: new Date().toISOString(),
        tenant_name: 'John Doe',
        unit_number: 'A101'
      }
    ]
  });
});

// Create complaint
app.post('/api/complaints', (req, res) => {
  const complaintData = req.body;
  // TODO: Insert into database
  const newComplaint = {
    id: Math.random().toString(36).substr(2, 9),
    ...complaintData,
    status: 'open',
    raised_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  res.json(newComplaint);
});

// Update complaint
app.put('/api/complaints/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // TODO: Update in database
  res.json({ success: true, message: 'Complaint updated' });
});

// Assign complaint to agent
app.post('/api/complaints/:id/assign', (req, res) => {
  const { id } = req.params;
  const { agentId } = req.body;
  // TODO: Update complaint assignment in database
  res.json({ 
    success: true, 
    message: 'Complaint assigned to agent',
    complaint: {
      id: id,
      assigned_agent: agentId,
      status: 'in_progress',
      acknowledged_at: new Date().toISOString()
    }
  });
});

// Get all properties
app.get('/api/properties', (req, res) => {
  // TODO: Query database for properties
  res.json({
    properties: [
      {
        id: '1',
        property_code: 'WL001',
        name: 'Westlands Apartments',
        address: '123 Westlands Road, Nairobi',
        county: 'Nairobi',
        town: 'Westlands',
        description: 'Luxury apartments in Westlands',
        total_units: 24,
        available_units: 8,
        created_at: new Date().toISOString()
      }
    ]
  });
});

// Create property
app.post('/api/properties', (req, res) => {
  const propertyData = req.body;
  // TODO: Insert into database
  const newProperty = {
    id: Math.random().toString(36).substr(2, 9),
    ...propertyData,
    available_units: propertyData.total_units,
    created_at: new Date().toISOString()
  };
  res.json(newProperty);
});

// Update property
app.put('/api/properties/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // TODO: Update in database
  res.json({ success: true, message: 'Property updated' });
});

// Delete property
app.delete('/api/properties/:id', (req, res) => {
  const { id } = req.params;
  // TODO: Delete from database
  res.json({ success: true, message: 'Property deleted' });
});

// 404 handler - FIXED for Express 4
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found: ' + req.originalUrl
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Test login: POST http://localhost:${PORT}/api/auth/login`);
});