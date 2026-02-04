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

  // Load agent's assigned properties
  useEffect(() => {
    fetchAgentProperties();
    // Set default month to current month
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    setMonth(`${year}-${month}`);
  }, []);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === "failed") {
      fetchFailedSMS();
    } else if (activeTab === "history") {
      fetchSMSHistory();
    }
  }, [activeTab]);

  const fetchAgentProperties = async () => {
    try {
      const response = await API.properties.getAgentProperties();
      if (response.data.success) {
        setProperties(response.data.data);
      }
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
      const payload = { month };
      if (propertyId) {
        payload.property_id = propertyId;
      }

      const response = await API.billing.triggerAgentBilling(payload);

      if (response.data.success) {
        if (response.data.requires_confirmation) {
          // Show confirmation modal for missing water bills
          setMissingBillsConfirmation(response.data);
        } else {
          setTriggerResult({
            type: "success",
            message: response.data.message,
            data: response.data.data,
          });
          // Reset confirmation state
          setMissingBillsConfirmation(null);
        }
      } else {
        setTriggerResult({
          type: "error",
          message: response.data.message,
        });
      }
    } catch (error) {
      console.error("Error triggering billing:", error);
      setTriggerResult({
        type: "error",
        message: "Failed to trigger billing. Please try again.",
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
        include_missing_water_bills: true,
      };
      if (propertyId) {
        payload.property_id = propertyId;
      }

      const response = await API.billing.triggerAgentBilling(payload);

      if (response.data.success) {
        setTriggerResult({
          type: "success",
          message: response.data.message,
          data: response.data.data,
        });
        setMissingBillsConfirmation(null);
      } else {
        setTriggerResult({
          type: "error",
          message: response.data.message,
        });
      }
    } catch (error) {
      console.error("Error proceeding with missing bills:", error);
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
      if (response.data.success) {
        setFailedSMS(response.data.data);
      }
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
        // Refresh the list
        fetchFailedSMS();
      }
    } catch (error) {
      console.error("Error retrying SMS:", error);
      alert("Failed to retry SMS");
    }
  };

  const handleBulkRetry = async () => {
    if (selectedFailedSMS.length === 0) {
      alert("Please select SMS to retry");
      return;
    }

    try {
      const response = await API.billing.retryAgentFailedSMS({
        sms_ids: selectedFailedSMS,
      });

      if (response.data.success) {
        alert(`${response.data.message}`);
        // Refresh and clear selection
        fetchFailedSMS();
        setSelectedFailedSMS([]);
      }
    } catch (error) {
      console.error("Error bulk retrying SMS:", error);
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

      // LOGIC UPDATE: Use agentSMS API (which maps to cronController) for history
      // This ensures we hit the robust controller logic we fixed
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
    if (selectedFailedSMS.includes(smsId)) {
      setSelectedFailedSMS(selectedFailedSMS.filter((id) => id !== smsId));
    } else {
      setSelectedFailedSMS([...selectedFailedSMS, smsId]);
    }
  };

  const handleSelectAllFailedSMS = () => {
    if (selectedFailedSMS.length === failedSMS.length) {
      setSelectedFailedSMS([]);
    } else {
      setSelectedFailedSMS(failedSMS.map((sms) => sms.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">SMS Management</h2>
            <p className="text-gray-600 mt-1">
              Manage billing SMS, retry failed messages, and view history
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === "trigger"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("trigger")}
            >
              <Send className="inline-block w-4 h-4 mr-2" />
              Trigger Billing SMS
            </button>
            <button
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === "failed"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("failed")}
            >
              <AlertCircle className="inline-block w-4 h-4 mr-2" />
              Failed SMS ({failedSMS.length})
            </button>
            <button
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === "history"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("history")}
            >
              <Clock className="inline-block w-4 h-4 mr-2" />
              SMS History
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Tab 1: Trigger Billing SMS */}
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">All Assigned Properties</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} ({property.property_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 mr-3" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">
                      Important Notes
                    </h4>
                    <ul className="mt-2 text-sm text-blue-700 space-y-1">
                      <li>
                        • System will check for water bills before sending SMS
                      </li>
                      <li>
                        • Tenants without water bills will show in confirmation
                      </li>
                      <li>
                        • You can proceed with water amount set to 0 for missing
                        bills
                      </li>
                      <li>• SMS are queued and sent automatically</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleTriggerBilling}
                  disabled={loading || !month}
                  className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Billing SMS
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setMonth("");
                    setPropertyId("");
                    setTriggerResult(null);
                    setMissingBillsConfirmation(null);
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Reset
                </button>
              </div>

              {/* Result Display */}
              {triggerResult && (
                <div
                  className={`rounded-md p-4 ${triggerResult.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
                >
                  <div className="flex">
                    {triggerResult.type === "success" ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 mr-3" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3" />
                    )}
                    <div>
                      <h4
                        className={`text-sm font-medium ${triggerResult.type === "success" ? "text-green-800" : "text-red-800"}`}
                      >
                        {triggerResult.type === "success"
                          ? "Success!"
                          : "Error"}
                      </h4>
                      <p
                        className={`mt-1 text-sm ${triggerResult.type === "success" ? "text-green-700" : "text-red-700"}`}
                      >
                        {triggerResult.message}
                      </p>
                      {triggerResult.data && (
                        <div className="mt-3 text-sm">
                          <p>
                            <strong>Queued:</strong> {triggerResult.data.queued}{" "}
                            SMS
                          </p>
                          <p>
                            <strong>Properties:</strong>{" "}
                            {triggerResult.data.property_count}
                          </p>
                          <p>
                            <strong>Month:</strong> {triggerResult.data.month}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Missing Bills Confirmation Modal */}
              {missingBillsConfirmation && (
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                    <div className="p-6">
                      <div className="flex items-center mb-4">
                        <AlertCircle className="w-6 h-6 text-yellow-500 mr-3" />
                        <h3 className="text-lg font-medium text-gray-900">
                          Missing Water Bills
                        </h3>
                      </div>

                      <p className="text-gray-600 mb-4">
                        {missingBillsConfirmation.message}
                      </p>

                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
                        <h4 className="text-sm font-medium text-yellow-800 mb-2">
                          Tenants without water bills:
                        </h4>
                        <ul className="text-sm text-yellow-700 space-y-1 max-h-60 overflow-y-auto">
                          {missingBillsConfirmation.data.missing_tenants.map(
                            (tenant, index) => (
                              <li
                                key={index}
                                className="flex items-center justify-between py-1"
                              >
                                <span>{tenant.name}</span>
                                <span className="text-yellow-600">
                                  {tenant.unit}
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>

                      <div className="flex justify-end space-x-3">
                        <button
                          onClick={() => setMissingBillsConfirmation(null)}
                          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleProceedWithMissingBills}
                          disabled={loading}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50"
                        >
                          {loading ? "Processing..." : "Proceed Anyway"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Failed SMS Management */}
          {activeTab === "failed" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Failed SMS Messages
                </h3>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600">
                    {selectedFailedSMS.length} of {failedSMS.length} selected
                  </span>
                  <button
                    onClick={handleBulkRetry}
                    disabled={selectedFailedSMS.length === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Selected
                  </button>
                </div>
              </div>

              {loadingFailed ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                  <p className="mt-2 text-gray-600">Loading failed SMS...</p>
                </div>
              ) : failedSMS.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-md">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
                  <p className="mt-2 text-gray-600">No failed SMS found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={
                              selectedFailedSMS.length === failedSMS.length &&
                              failedSMS.length > 0
                            }
                            onChange={handleSelectAllFailedSMS}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tenant
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Property/Unit
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Error
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {failedSMS.map((sms) => (
                        <tr key={sms.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedFailedSMS.includes(sms.id)}
                              onChange={() => handleSelectFailedSMS(sms.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-900">
                              {sms.first_name} {sms.last_name}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900">
                              {sms.property_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {sms.unit_code}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {sms.recipient_phone}
                          </td>
                          <td className="px-4 py-4">
                            <div
                              className="max-w-xs truncate"
                              title={sms.error_message}
                            >
                              <span className="text-sm text-red-600">
                                {sms.error_message}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handleRetrySMS(sms.id)}
                              className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            >
                              Retry
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: SMS History */}
          {activeTab === "history" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={historyFilters.status}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        status: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">All Status</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={historyFilters.startDate}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        startDate: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={historyFilters.endDate}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        endDate: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Property
                  </label>
                  <select
                    value={historyFilters.propertyId}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        propertyId: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">All Properties</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={fetchSMSHistory}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Apply Filters
                </button>
                <button
                  onClick={() => {
                    setHistoryFilters({
                      status: "",
                      startDate: "",
                      endDate: "",
                      propertyId: "",
                    });
                    fetchSMSHistory();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Clear Filters
                </button>
              </div>

              {loadingHistory ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                  <p className="mt-2 text-gray-600">Loading SMS history...</p>
                </div>
              ) : smsHistory.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-md">
                  <p className="text-gray-600">No SMS history found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Recipient
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Message Preview
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {smsHistory.map((sms) => (
                        <tr key={sms.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(sms.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900">
                              {sms.recipient_phone}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {sms.message_type}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                sms.status === "sent"
                                  ? "bg-green-100 text-green-800"
                                  : sms.status === "failed"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {sms.status}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-600 max-w-xs truncate">
                              {sms.message}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            {sms.status === "sent" && (
                              <button
                                onClick={() => handleCheckDelivery(sms.id)}
                                className="text-blue-600 hover:text-blue-900 flex items-center"
                              >
                                <Eye className="w-4 h-4 mr-1" /> Status
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delivery Status Modal */}
      {showDeliveryModal && deliveryDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Delivery Status
              </h3>
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {deliveryDetails.status}
                </p>
              </div>

              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600">Delivered At</p>
                <p className="font-semibold text-gray-900">
                  {deliveryDetails.deliveredAt
                    ? new Date(deliveryDetails.deliveredAt).toLocaleString()
                    : "N/A"}
                </p>
              </div>

              {deliveryDetails.reason && (
                <div className="bg-red-50 p-3 rounded-md border border-red-100">
                  <p className="text-sm text-red-600">Reason/Error</p>
                  <p className="font-semibold text-red-800">
                    {deliveryDetails.reason}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium"
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
