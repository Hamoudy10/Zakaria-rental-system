// src/components/NotificationManagement.jsx
import React, { useState } from 'react';
import { useProperty } from '../context/PropertyContext';
import { notificationAPI } from '../services/api';
import { Send, MessageSquare, AlertTriangle, Info } from 'lucide-react';

const NotificationManagement = () => {
  const { properties, loading: propsLoading } = useProperty();
  const [selectedProperty, setSelectedProperty] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('announcement');
  const [sending, setSending] = useState(false);

  const sendNotification = async () => {
    if (!selectedProperty || !message.trim()) return;

    try {
      setSending(true);
      const response = await notificationAPI.sendBulkSMS({
        propertyId: selectedProperty,
        message: message.trim(),
        messageType: messageType
      });
      if (response.data.success) {
        alert('Bulk SMS queued successfully!');
        setMessage('');
      }
    } catch (err) {
      alert('Error: ' + (err.response?.data?.message || 'Failed to send'));
    } finally {
      setSending(false);
    }
  };

  const templates = [
    { title: 'Rent Reminder', type: 'payment', msg: 'Dear tenant, a friendly reminder that rent is due. Please settle via Paybill to avoid penalties.' },
    { title: 'Water Interruption', type: 'maintenance', msg: 'Notice: Scheduled maintenance will result in water interruption tomorrow from 10am to 2pm.' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="text-blue-600" /> Property Bulk Messaging
        </h1>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Target Property</label>
              <select 
                value={selectedProperty} 
                onChange={e => setSelectedProperty(e.target.value)}
                className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.total_units} units)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {['announcement', 'payment', 'maintenance', 'emergency'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setMessageType(t)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all border ${messageType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">SMS Content</label>
              <textarea 
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={160}
                rows={5}
                placeholder="Write your message here..."
                className="w-full p-4 border rounded-xl bg-gray-50 resize-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-between mt-1 text-[10px] font-bold text-gray-400">
                <span>MAX 160 CHARACTERS</span>
                <span>{message.length} / 160</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t flex justify-end">
          <button 
            disabled={sending || !selectedProperty || !message}
            onClick={sendNotification}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 disabled:bg-gray-300 transition-all shadow-lg shadow-blue-200"
          >
            {sending ? 'Processing...' : <><Send size={18} /> Send Bulk SMS</>}
          </button>
        </div>
      </div>

      {/* Templates */}
      <div className="grid md:grid-cols-2 gap-4">
        {templates.map((tpl, i) => (
          <div key={i} onClick={() => { setMessage(tpl.msg); setMessageType(tpl.type); }} className="bg-white p-4 rounded-xl border border-dashed border-gray-300 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all">
            <h4 className="font-bold text-blue-600 text-sm mb-1">{tpl.title}</h4>
            <p className="text-xs text-gray-500 line-clamp-1">{tpl.msg}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationManagement;