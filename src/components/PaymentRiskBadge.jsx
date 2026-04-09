/**
 * PaymentRiskBadge - AI-powered payment risk indicator
 * Shows tenant's payment reliability score with color-coded badge
 */

import React, { useState, useEffect } from "react";
import { API } from "../services/api";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";

const PaymentRiskBadge = ({ tenantId, unitId, compact = false }) => {
  const [scoreData, setScoreData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchScore = async () => {
      if (!tenantId) return;
      
      try {
        setLoading(true);
        const response = await API.payments.getTenantPaymentScore(tenantId, unitId);
        
        if (response.data.success) {
          setScoreData(response.data.data);
        } else {
          setError("Failed to calculate score");
        }
      } catch (err) {
        console.error("Error fetching payment score:", err);
        setError("Unable to load");
      } finally {
        setLoading(false);
      }
    };

    fetchScore();
  }, [tenantId, unitId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Calculating...</span>
      </div>
    );
  }

  if (error || !scoreData) {
    return (
      <div className="text-xs text-gray-400">
        No data
      </div>
    );
  }

  const colorMap = {
    green: {
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-300",
      icon: CheckCircle,
    },
    yellow: {
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      border: "border-yellow-300",
      icon: Clock,
    },
    orange: {
      bg: "bg-orange-100",
      text: "text-orange-800",
      border: "border-orange-300",
      icon: AlertTriangle,
    },
    red: {
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-300",
      icon: AlertCircle,
    },
  };

  const colors = colorMap[scoreData.color] || colorMap.yellow;
  const Icon = colors.icon;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
        title={`${scoreData.prediction}`}
      >
        <Icon className="w-3 h-3" />
        <span>{scoreData.score}/100</span>
      </div>
    );
  }

  const trendIcon = scoreData.metrics.trend === "improving" ? (
    <TrendingUp className="w-3 h-3 text-green-600" />
  ) : scoreData.metrics.trend === "declining" ? (
    <TrendingDown className="w-3 h-3 text-red-600" />
  ) : (
    <Minus className="w-3 h-3 text-gray-400" />
  );

  return (
    <div
      className={`p-3 rounded-lg border-2 ${colors.border} ${colors.bg}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${colors.text}`} />
          <span className={`font-bold text-lg ${colors.text}`}>
            {scoreData.score}/100
          </span>
        </div>
        <div className="flex items-center gap-1">
          {trendIcon}
          <span className="text-xs text-gray-600 capitalize">
            {scoreData.metrics.trend.replace("_", " ")}
          </span>
        </div>
      </div>
      
      <div className="text-xs text-gray-700 space-y-1">
        <p className="font-medium capitalize">
          Risk Level: {scoreData.risk_level.replace("_", " ")}
        </p>
        {scoreData.metrics.total_payments > 0 && (
          <>
            <p>On-time rate: {Math.round(scoreData.metrics.on_time_rate * 100)}% ({scoreData.metrics.on_time_payments}/{scoreData.metrics.total_payments})</p>
            <p>Avg days late: {scoreData.metrics.avg_days_late}</p>
            {scoreData.metrics.current_streak > 0 && (
              <p>Current streak: {scoreData.metrics.current_streak} on-time payments</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentRiskBadge;
