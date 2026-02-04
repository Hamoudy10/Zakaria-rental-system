// src/components/AgentSMSManagement.jsx
import React, { useState, useEffect } from "react";
import { API } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Send,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";

const AgentSMSManagement = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("trigger");

  // State for Trigger Billing Tab
  const [month, setMonth] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [missingBillsConfirmation, setMissingBillsConfirmation] =
    useState(null);

  // State for Failed SMS Tab
  const [failedSMS, setFailedSMS] = useState([]);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [selectedFailedSMS, setSelectedFailedSMS] = useState([]);

  // State for SMS History Tab
  const [smsHistory, setSmsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    status: "",
    startDate: "",
    endDate: "",
    propertyId: "",
  });

  // State for Delivery Details Modal
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryDetails, setDeliveryDetails] = useState(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);

  useEffect(() => {
    fetchAgentProperties();
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    setMonth(`${year}-${month}`);
  }, []);

  useEffect(() => {
    if (activeTab === "failed") fetchFailedSMS();
    else if (activeTab === "history") fetchSMSHistory();
  }, [activeTab]);

  const fetchAgentProperties = async () => {
    try {
      const response = await API.properties.getAgentProperties();
      if (response.data.success) setProperties(response.data.data);
    } catch (error) {
      console.error("Error fetching properties:", error);
    }
  };

  const handleTriggerBilling = async () => {
    if (!month) {
      alert("Please select a month");
      return;
    }
    setLoading(true);
    setTriggerResult(null);
    try {
      const payload = { month, property_id: propertyId || undefined };
      const response = await API.billing.triggerAgentBilling(payload);

      if (response.data.success) {
        if (response.data.requires_confirmation) {
          setMissingBillsConfirmation(response.data);
        } else {
          setTriggerResult({
            type: "success",
            message: response.data.message,
            data: response.data.data,
          });
          setMissingBillsConfirmation(null);
        }
      } else {
        setTriggerResult({ type: "error", message: response.data.message });
      }
    } catch (error) {
      console.error("Error triggering billing:", error);
      setTriggerResult({
        type: "error",
        message: "Failed to trigger billing.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProceedWithMissingBills = async () => {
    setLoading(true);
    try {
      const payload = {
        month,
        property_id: propertyId || undefined,
        include_missing_water_bills: true,
      };
      const response = await API.billing.triggerAgentBilling(payload);
      if (response.data.success) {
        setTriggerResult({
          type: "success",
          message: response.data.message,
          data: response.data.data,
        });
        setMissingBillsConfirmation(null);
      } else {
        setTriggerResult({ type: "error", message: response.data.message });
      }
    } catch (error) {
      setTriggerResult({
        type: "error",
        message: "Failed to proceed with billing.",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFailedSMS = async () => {
    setLoadingFailed(true);
    try {
      const response = await API.billing.getAgentFailedSMS();
      if (response.data.success) setFailedSMS(response.data.data);
    } catch (error) {
      console.error("Error fetching failed SMS:", error);
    } finally {
      setLoadingFailed(false);
    }
  };

  const handleRetrySMS = async (smsId) => {
    try {
      const response = await API.billing.retryAgentFailedSMS({
        sms_ids: [smsId],
      });
      if (response.data.success) {
        alert("SMS queued for retry");
        fetchFailedSMS();
      }
    } catch (error) {
      alert("Failed to retry SMS");
    }
  };

  const handleBulkRetry = async () => {
    if (selectedFailedSMS.length === 0) return;
    try {
      const response = await API.billing.retryAgentFailedSMS({
        sms_ids: selectedFailedSMS,
      });
      if (response.data.success) {
        alert(`${response.data.message}`);
        fetchFailedSMS();
        setSelectedFailedSMS([]);
      }
    } catch (error) {
      alert("Failed to retry SMS");
    }
  };

  const fetchSMSHistory = async () => {
    setLoadingHistory(true);
    try {
      const params = {};
      if (historyFilters.status) params.status = historyFilters.status;
      if (historyFilters.startDate)
        params.start_date = historyFilters.startDate;
      if (historyFilters.endDate) params.end_date = historyFilters.endDate;
      if (historyFilters.propertyId)
        params.property_id = historyFilters.propertyId;

      // Use API.agentSMS.getAgentSMSHistory (maps to /cron/agent/history)
      // This matches the robust controller we just fixed
      const response = await API.agentSMS.getAgentSMSHistory(params);

      if (response.data.success) {
        setSmsHistory(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching SMS history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCheckDelivery = async (messageId) => {
    if (!messageId) return;
    setCheckingDelivery(true);
    try {
      const response = await API.notifications.checkDeliveryStatus(messageId);
      if (response.data.success) {
        setDeliveryDetails(response.data.data);
        setShowDeliveryModal(true);
      } else {
        alert("Could not fetch delivery details.");
      }
    } catch (error) {
      console.error("Check delivery error:", error);
      alert("Failed to check delivery status.");
    } finally {
      setCheckingDelivery(false);
    }
  };

  const handleSelectFailedSMS = (smsId) => {
    if (selectedFailedSMS.includes(smsId))
      setSelectedFailedSMS(selectedFailedSMS.filter((id) => id !== smsId));
    else setSelectedFailedSMS([...selectedFailedSMS, smsId]);
  };

  const handleSelectAllFailedSMS = () => {
    if (selectedFailedSMS.length === failedSMS.length) setSelectedFailedSMS([]);
    else setSelectedFailedSMS(failedSMS.map((sms) => sms.id));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold text-gray-900">SMS Management</h2>
        <p className="text-gray-600 mt-1">
          Manage billing SMS, retry failed messages, and view history
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {["trigger", "failed", "history"].map((tab) => (
              <button
                key={tab}
                className={`py-4 px-6 text-sm font-medium border-b-2 capitalize ${activeTab === tab ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "trigger" && <Send className="inline w-4 h-4 mr-2" />}
                {tab === "failed" && (
                  <AlertCircle className="inline w-4 h-4 mr-2" />
                )}
                {tab === "history" && <Clock className="inline w-4 h-4 mr-2" />}
                {tab === "trigger"
                  ? "Trigger Billing SMS"
                  : tab === "failed"
                    ? `Failed SMS (${failedSMS.length})`
                    : "SMS History"}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "trigger" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Month *
                  </label>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full border rounded-md px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Property (Optional)
                  </label>
                  <select
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className="w-full border rounded-md px-3 py-2"
                  >
                    <option value="">All Assigned Properties</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleTriggerBilling}
                  disabled={loading || !month}
                  className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {loading ? "Processing..." : "Send Billing SMS"}
                </button>
              </div>

              {triggerResult && (
                <div
                  className={`p-4 rounded-md ${triggerResult.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
                >
                  {triggerResult.message}
                </div>
              )}
            </div>
          )}

          {activeTab === "failed" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Failed SMS</h3>
                <button
                  onClick={handleBulkRetry}
                  disabled={selectedFailedSMS.length === 0}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  Retry Selected
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          onChange={handleSelectAllFailedSMS}
                          checked={
                            selectedFailedSMS.length === failedSMS.length &&
                            failedSMS.length > 0
                          }
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Tenant
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Error
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {failedSMS.map((sms) => (
                      <tr key={sms.id}>
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedFailedSMS.includes(sms.id)}
                            onChange={() => handleSelectFailedSMS(sms.id)}
                          />
                        </td>
                        <td className="px-4 py-4">
                          {sms.first_name} {sms.last_name}
                        </td>
                        <td className="px-4 py-4 text-red-600">
                          {sms.error_message}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => handleRetrySMS(sms.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Retry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-6">
              <div className="flex justify-between">
                <button
                  onClick={fetchSMSHistory}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Recipient
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {smsHistory.map((sms) => (
                      <tr key={sms.id}>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {new Date(sms.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {sms.recipient_phone}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`px-2 text-xs font-semibold rounded-full ${sms.status === "sent" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                          >
                            {sms.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {sms.status === "sent" && (
                            <button
                              onClick={() => handleCheckDelivery(sms.id)}
                              className="text-blue-600 hover:text-blue-900 text-sm flex items-center"
                            >
                              <Eye className="w-3 h-3 mr-1" /> Check Delivery
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delivery Status Modal */}
      {showDeliveryModal && deliveryDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Delivery Status</h3>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Status:</strong> {deliveryDetails.status}
              </p>
              <p>
                <strong>Time:</strong> {deliveryDetails.deliveredAt || "N/A"}
              </p>
              <p>
                <strong>Reason:</strong> {deliveryDetails.reason || "None"}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="px-4 py-2 bg-gray-100 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSMSManagement;
