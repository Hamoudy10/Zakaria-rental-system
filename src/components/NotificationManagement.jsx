// src/components/NotificationManagement.jsx
import React, { useState, useEffect } from 'react';
import agentService from '../services/AgentService';

const NotificationManagement = () => {
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('announcement');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchAssignedProperties();
  }, []);

  const fetchAssignedProperties = async () => {
    try {
      setLoading(true);
      const response = await agentService.getAssignedProperties();
      const propertiesData = response.data?.data || response.data || [];
      setProperties(Array.isArray(propertiesData) ? propertiesData : []);
    } catch (err) {
      console.error('Error fetching properties:', err);
      alert('Failed to load assigned properties.');
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    if (!selectedProperty) {
      alert('Please select a property');
      return;
    }
    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    try {
      setSending(true);
      await agentService.sendBulkSMS({
        propertyId: selectedProperty,
        message: message.trim(),
        messageType: messageType
      });
      alert('Notification sent successfully!');
      setMessage('');
      setSelectedProperty('');
    } catch (err) {
      console.error('Error sending notification:', err);
      alert('Failed to send notification. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const getTenantCount = (propertyId) => {
    const property = properties.find(p => p.id === propertyId);
    return property ? (property.occupied_units || 0) : 0;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Send Notifications</h1>
        <p className="text-gray-600 text-sm mt-1">Send SMS announcements and notices to tenants in your assigned properties</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="space-y-4">
          {/* Property Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Property
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Choose a property...</option>
              {properties.map(property => (
                <option key={property.id} value={property.id}>
                  {property.name} ({property.occupied_units || 0} tenants)
                </option>
              ))}
            </select>
          </div>

          {/* Message Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Type
            </label>
            <select
              value={messageType}
              onChange={(e) => setMessageType(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="announcement">General Announcement</option>
              <option value="maintenance">Maintenance Notice</option>
              <option value="payment">Payment Reminder</option>
              <option value="emergency">Emergency Alert</option>
            </select>
          </div>

          {/* Message Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Content
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows="6"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-vertical"
              placeholder="Type your message here... (Maximum 160 characters for SMS)"
              maxLength={160}
            />
            <div className="text-right text-sm text-gray-500 mt-1">
              {message.length}/160 characters
            </div>
          </div>

          {/* Preview */}
          {message && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Preview:</h4>
              <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                {message}
              </div>
              {selectedProperty && (
                <p className="text-xs text-gray-500 mt-2">
                  This message will be sent to {getTenantCount(selectedProperty)} tenants at the selected property.
                </p>
              )}
            </div>
          )}

          {/* Send Button */}
          <div className="flex justify-end">
            <button
              onClick={sendNotification}
              disabled={sending || !selectedProperty || !message.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Notifications (if available) */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-gray-50"
            onClick={() => {
              setMessageType('payment');
              setMessage('Dear tenant, this is a friendly reminder that your rent payment is due. Please clear your balance to avoid late fees.');
            }}
          >
            <h4 className="font-medium text-gray-900">Payment Reminder</h4>
            <p className="text-sm text-gray-600 mt-1">Standard rent payment reminder</p>
          </div>
          <div 
            className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-gray-50"
            onClick={() => {
              setMessageType('maintenance');
              setMessage('Important maintenance notice: There will be scheduled water interruption tomorrow from 9 AM to 3 PM for system upgrades.');
            }}
          >
            <h4 className="font-medium text-gray-900">Maintenance Notice</h4>
            <p className="text-sm text-gray-600 mt-1">For planned maintenance alerts</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationManagement;