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

// ==================== SYSTEM SETTINGS ENDPOINTS ====================

// Get all system settings
app.get('/api/admin/settings', (req, res) => {
  // TODO: Query database for admin_settings
  res.json({
    success: true,
    settings: [
      {
        id: '1',
        setting_key: 'primary_color',
        setting_value: '#3B82F6',
        description: 'Primary brand color for the UI',
        updated_at: new Date().toISOString()
      },
      {
        id: '2',
        setting_key: 'secondary_color',
        setting_value: '#1E40AF',
        description: 'Secondary brand color for the UI',
        updated_at: new Date().toISOString()
      },
      {
        id: '3',
        setting_key: 'default_rent_due_day',
        setting_value: '5',
        description: 'Default day of month when rent is due',
        updated_at: new Date().toISOString()
      },
      {
        id: '4',
        setting_key: 'default_grace_period',
        setting_value: '7',
        description: 'Default grace period in days for rent payment',
        updated_at: new Date().toISOString()
      },
      {
        id: '5',
        setting_key: 'company_name',
        setting_value: 'Prime Rentals Kenya',
        description: 'Name of the rental agency',
        updated_at: new Date().toISOString()
      },
      {
        id: '6',
        setting_key: 'mpesa_paybill_number',
        setting_value: '123456',
        description: 'M-Pesa paybill number for rent payments',
        updated_at: new Date().toISOString()
      },
      {
        id: '7',
        setting_key: 'sms_enabled',
        setting_value: 'true',
        description: 'Whether to send SMS notifications',
        updated_at: new Date().toISOString()
      },
      {
        id: '8',
        setting_key: 'auto_confirm_payments',
        setting_value: 'true',
        description: 'Automatically confirm M-Pesa payments',
        updated_at: new Date().toISOString()
      },
      {
        id: '9',
        setting_key: 'maintenance_email',
        setting_value: 'maintenance@zakariarentals.com',
        description: 'Maintenance department email',
        updated_at: new Date().toISOString()
      },
      {
        id: '10',
        setting_key: 'support_phone',
        setting_value: '+254700000000',
        description: 'Customer support phone number',
        updated_at: new Date().toISOString()
      }
    ]
  });
});

// Update system setting
app.put('/api/admin/settings/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  
  // TODO: Update setting in database
  console.log(`Updating setting ${key} to ${value}`);
  
  res.json({
    success: true,
    message: 'Setting updated successfully',
    setting: {
      setting_key: key,
      setting_value: value,
      updated_at: new Date().toISOString()
    }
  });
});

// Update multiple settings
app.put('/api/admin/settings', (req, res) => {
  const settingsUpdates = req.body;
  
  // TODO: Update multiple settings in database
  console.log('Updating multiple settings:', settingsUpdates);
  
  res.json({
    success: true,
    message: 'Settings updated successfully',
    updated_count: Object.keys(settingsUpdates).length
  });
});

// Reset settings to defaults
app.post('/api/admin/settings/reset-defaults', (req, res) => {
  // TODO: Reset to default settings in database
  console.log('Resetting settings to defaults');
  
  res.json({
    success: true,
    message: 'Settings reset to defaults successfully'
  });
});

// ==================== ENHANCED REPORTS ENDPOINTS ====================

// Generate financial report with filters
app.get('/api/reports/financial', (req, res) => {
  const { startDate, endDate, propertyId } = req.query;
  
  // TODO: Query database for financial data using your schema
  const mockFinancialData = {
    summary: {
      totalRevenue: 450000,
      totalExpenses: 120000,
      netIncome: 330000,
      profitMargin: 73.3
    },
    transactions: [
      {
        payment_date: '2024-01-05',
        tenant_name: 'John Doe',
        property_name: 'Westlands Apartments',
        amount: 15000,
        status: 'completed'
      },
      {
        payment_date: '2024-01-06',
        tenant_name: 'Jane Smith',
        property_name: 'Kilimani Towers',
        amount: 18000,
        status: 'completed'
      }
    ],
    expenses: [
      {
        expense_type: 'maintenance',
        total_amount: 40000,
        count: 5
      },
      {
        expense_type: 'utilities',
        total_amount: 30000,
        count: 3
      },
      {
        expense_type: 'salaries',
        total_amount: 50000,
        count: 2
      }
    ]
  };

  res.json({
    success: true,
    data: mockFinancialData,
    filters: {
      startDate,
      endDate,
      propertyId
    }
  });
});

// Generate occupancy report
app.get('/api/reports/occupancy', (req, res) => {
  const { startDate, endDate, propertyId } = req.query;
  
  // TODO: Query database for occupancy data
  const mockOccupancyData = {
    occupancy: {
      overallRate: 75,
      occupiedUnits: 36,
      totalUnits: 48,
      availableUnits: 12,
      vacancyRate: 25
    },
    byProperty: [
      {
        propertyName: 'Westlands Apartments',
        totalUnits: 24,
        occupiedUnits: 18,
        availableUnits: 6,
        occupancyRate: 75
      },
      {
        propertyName: 'Kilimani Towers',
        totalUnits: 16,
        occupiedUnits: 12,
        availableUnits: 4,
        occupancyRate: 75
      },
      {
        propertyName: 'Kileleshwa Gardens',
        totalUnits: 8,
        occupiedUnits: 6,
        availableUnits: 2,
        occupancyRate: 75
      }
    ],
    trends: [
      {
        period: 'Jan 2024',
        rate: 75,
        change: 5
      },
      {
        period: 'Dec 2023',
        rate: 70,
        change: -2
      },
      {
        period: 'Nov 2023',
        rate: 72,
        change: 3
      },
      {
        period: 'Oct 2023',
        rate: 69,
        change: 0
      }
    ]
  };

  res.json({
    success: true,
    data: mockOccupancyData,
    filters: {
      startDate,
      endDate,
      propertyId
    }
  });
});

// Generate revenue report
app.get('/api/reports/revenue', (req, res) => {
  const { startDate, endDate, propertyId, groupBy } = req.query;
  
  // TODO: Query database for revenue data
  const mockRevenueData = {
    revenue: {
      totalRevenue: 450000,
      averageMonthly: 150000,
      growthRate: 12.5,
      projectedRevenue: 500000
    },
    breakdown: [
      {
        period: 'Jan 2024',
        rentRevenue: 140000,
        otherRevenue: 10000,
        totalRevenue: 150000,
        growth: 12.5
      },
      {
        period: 'Dec 2023',
        rentRevenue: 130000,
        otherRevenue: 8000,
        totalRevenue: 138000,
        growth: 8.5
      },
      {
        period: 'Nov 2023',
        rentRevenue: 125000,
        otherRevenue: 7000,
        totalRevenue: 132000,
        growth: 5.0
      }
    ],
    byProperty: [
      {
        propertyName: 'Westlands Apartments',
        revenue: 200000,
        occupancyRate: 75
      },
      {
        propertyName: 'Kilimani Towers',
        revenue: 150000,
        occupancyRate: 75
      },
      {
        propertyName: 'Kileleshwa Gardens',
        revenue: 100000,
        occupancyRate: 75
      }
    ]
  };

  res.json({
    success: true,
    data: mockRevenueData,
    filters: {
      startDate,
      endDate,
      propertyId,
      groupBy
    }
  });
});

// Export report
app.post('/api/reports/export', (req, res) => {
  const { format, reportType, filters } = req.body;
  
  // TODO: Generate export file based on format (excel, csv, pdf)
  console.log(`Exporting ${reportType} report as ${format}`, filters);
  
  res.json({
    success: true,
    message: `Report exported as ${format} successfully`,
    downloadUrl: `/api/reports/download/${Date.now()}.${format}`
  });
});

// ==================== EXISTING ENDPOINTS (UNCHANGED) ====================

// Mock login endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  console.log('Login attempt:', { email, password });

   // Define users object
  const users = {
    'admin@example.com': {
      id: '1',
      national_id: '00000000',
      first_name: 'System',
      last_name: 'Administrator', 
      email: 'admin@example.com',
      phone_number: '254700000000',
      role: 'admin',
      is_active: true
    },
    'agent@example.com': {
      id: '2',
      national_id: '11111111',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'agent@example.com',
      phone_number: '254712345678',
      role: 'agent',
      is_active: true
    },
    'tenant@example.com': {
      id: '3',
      national_id: '22222222',
      first_name: 'Mike',
      last_name: 'Johnson',
      email: 'tenant@example.com',
      phone_number: '254723456789',
      role: 'tenant',
      is_active: true
    }
  };

  // Mock authentication - FIXED: Use different variable name
  if (users[email] && password === 'test123') {
    const userData = users[email]; // ✅ FIX: Use different variable name
    console.log('Login successful for:', email, 'Role:', userData.role);
    
    res.json({
      success: true,
      message: 'Login successful!',
      user: userData,
      token: 'test-jwt-token-' + userData.id
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
      },
      {
        id: '3',
        national_id: '11111111',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'agent@example.com',
        phone_number: '254712345678',
        role: 'agent',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: '4',
        national_id: '22222222',
        first_name: 'Mike',
        last_name: 'Johnson',
        email: 'tenant@example.com',
        phone_number: '254723456789',
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
  console.log(`⚙️  System Settings: GET http://localhost:${PORT}/api/admin/settings`);
  console.log(`📈 Reports: GET http://localhost:${PORT}/api/reports/financial`);
});