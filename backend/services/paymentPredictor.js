/**
 * AI Payment Prediction Service
 * Analyzes tenant payment behavior to predict likelihood of on-time payment
 * No external AI services needed - pure algorithmic scoring
 */

const pool = require('../config/database');

class PaymentPredictor {
  /**
   * Calculate payment risk score for a tenant (0-100)
   * Higher score = more reliable payer
   */
  async calculateTenantScore(tenantId, unitId = null) {
    try {
      // Get tenant payment history (last 12 months)
      const paymentHistory = await this.getPaymentHistory(tenantId, unitId);
      
      // Get tenant allocation details
      const allocation = await this.getTenantAllocation(tenantId, unitId);
      
      if (!allocation) {
        return this.getBaseScore();
      }

      // Calculate metrics
      const metrics = this.calculateMetrics(paymentHistory, allocation);
      
      // Calculate score
      const score = this.calculateScore(metrics, allocation);
      
      // Generate prediction and recommendations
      const prediction = this.generatePrediction(metrics, score, allocation);
      
      return {
        success: true,
        data: {
          tenant_id: tenantId,
          unit_id: unitId || allocation.unit_id,
          score: Math.round(score),
          risk_level: this.getRiskLevel(score),
          color: this.getRiskColor(score),
          metrics,
          prediction,
          recommendations: this.getRecommendations(metrics, score),
          calculated_at: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('❌ Error calculating payment score:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payment history for tenant (last 12 months)
   */
  async getPaymentHistory(tenantId, unitId) {
    const query = `
      SELECT
        rp.id,
        rp.amount,
        rp.payment_date,
        rp.payment_month,
        rp.status,
        rp.allocated_to_rent,
        rp.allocated_to_water,
        rp.allocated_to_arrears,
        ta.monthly_rent,
        ta.rent_due_day,
        MAKE_DATE(
          EXTRACT(YEAR FROM rp.payment_month)::int,
          EXTRACT(MONTH FROM rp.payment_month)::int,
          LEAST(GREATEST(COALESCE(ta.rent_due_day, 1), 1), 28)
        ) as due_date
      FROM rent_payments rp
      INNER JOIN tenant_allocations ta ON ta.tenant_id = rp.tenant_id 
        AND ta.unit_id = rp.unit_id 
        AND ta.is_active = true
      WHERE rp.tenant_id = $1
        AND rp.status = 'completed'
        AND rp.payment_month >= NOW() - INTERVAL '12 months'
        ${unitId ? 'AND rp.unit_id = $2' : ''}
      ORDER BY rp.payment_month DESC
    `;
    
    const result = await pool.query(query, unitId ? [tenantId, unitId] : [tenantId]);
    return result.rows;
  }

  /**
   * Get current tenant allocation
   */
  async getTenantAllocation(tenantId, unitId) {
    const query = `
      SELECT
        ta.id,
        ta.tenant_id,
        ta.unit_id,
        ta.monthly_rent,
        ta.arrears_balance,
        ta.allocation_date,
        ta.rent_due_day,
        pu.unit_code,
        p.name as property_name
      FROM tenant_allocations ta
      INNER JOIN property_units pu ON pu.id = ta.unit_id
      INNER JOIN properties p ON p.id = pu.property_id
      WHERE ta.tenant_id = $1
        AND ta.is_active = true
        ${unitId ? 'AND ta.unit_id = $2' : ''}
      LIMIT 1
    `;
    
    const result = await pool.query(query, unitId ? [tenantId, unitId] : [tenantId]);
    return result.rows[0];
  }

  /**
   * Calculate payment behavior metrics
   */
  calculateMetrics(paymentHistory, allocation) {
    if (paymentHistory.length === 0) {
      return {
        total_payments: 0,
        on_time_payments: 0,
        on_time_rate: 0,
        avg_days_late: 0,
        total_paid: 0,
        total_expected: 0,
        payment_rate: 0,
        longest_on_time_streak: 0,
        current_streak: 0,
        avg_payment_day: 0,
        last_payment_date: null,
        days_since_last_payment: null,
        trend: 'insufficient_data'
      };
    }

    // Calculate on-time payments
    const onTimePayments = paymentHistory.filter(p => {
      const paymentDate = new Date(p.payment_date);
      const dueDate = new Date(p.due_date);
      return paymentDate <= dueDate;
    });

    // Calculate days late for each payment
    const daysLateList = paymentHistory.map(p => {
      const paymentDate = new Date(p.payment_date);
      const dueDate = new Date(p.due_date);
      const daysLate = Math.max(0, Math.ceil((paymentDate - dueDate) / (1000 * 60 * 60 * 24)));
      return daysLate;
    });

    const avgDaysLate = daysLateList.reduce((sum, days) => sum + days, 0) / daysLateList.length;

    // Calculate payment streaks
    let longestOnTimeStreak = 0;
    let currentStreak = 0;
    let tempStreak = 0;

    // Sort by month ascending for streak calculation
    const sortedPayments = [...paymentHistory].sort((a, b) => 
      new Date(a.payment_month) - new Date(b.payment_month)
    );

    for (let i = 0; i < sortedPayments.length; i++) {
      const paymentDate = new Date(sortedPayments[i].payment_date);
      const dueDate = new Date(sortedPayments[i].due_date);
      const isOnTime = paymentDate <= dueDate;

      if (isOnTime) {
        tempStreak++;
        longestOnTimeStreak = Math.max(longestOnTimeStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    // Current streak (from most recent payment backwards)
    for (let i = sortedPayments.length - 1; i >= 0; i--) {
      const paymentDate = new Date(sortedPayments[i].payment_date);
      const dueDate = new Date(sortedPayments[i].due_date);
      if (paymentDate <= dueDate) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Calculate trend (comparing last 3 months to previous 3 months)
    const recent3Months = sortedPayments.slice(-3);
    const previous3Months = sortedPayments.slice(-6, -3);

    const recentOnTimeRate = recent3Months.length > 0 
      ? recent3Months.filter(p => new Date(p.payment_date) <= new Date(p.due_date)).length / recent3Months.length 
      : 0;
    
    const previousOnTimeRate = previous3Months.length > 0 
      ? previous3Months.filter(p => new Date(p.payment_date) <= new Date(p.due_date)).length / previous3Months.length 
      : 0;

    let trend = 'stable';
    if (recentOnTimeRate > previousOnTimeRate + 0.2) trend = 'improving';
    else if (recentOnTimeRate < previousOnTimeRate - 0.2) trend = 'declining';

    // Days since last payment
    const lastPayment = sortedPayments[sortedPayments.length - 1];
    const daysSinceLastPayment = lastPayment 
      ? Math.ceil((Date.now() - new Date(lastPayment.payment_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      total_payments: paymentHistory.length,
      on_time_payments: onTimePayments.length,
      on_time_rate: onTimePayments.length / paymentHistory.length,
      avg_days_late: Math.round(avgDaysLate * 10) / 10,
      total_paid: paymentHistory.reduce((sum, p) => sum + Number(p.amount), 0),
      total_expected: paymentHistory.reduce((sum, p) => sum + Number(p.monthly_rent), 0),
      payment_rate: paymentHistory.reduce((sum, p) => sum + Number(p.amount), 0) / 
                    paymentHistory.reduce((sum, p) => sum + Number(p.monthly_rent), 0),
      longest_on_time_streak: longestOnTimeStreak,
      current_streak: currentStreak,
      avg_payment_day: Math.round(daysLateList.reduce((sum, days) => sum + days, 0) / daysLateList.length),
      last_payment_date: lastPayment ? lastPayment.payment_date : null,
      days_since_last_payment: daysSinceLastPayment,
      trend
    };
  }

  /**
   * Calculate risk score (0-100)
   */
  calculateScore(metrics, allocation) {
    let score = 50; // Base score

    // Factor 1: On-time payment rate (up to +30 or -20)
    score += metrics.on_time_rate * 30;
    if (metrics.on_time_rate < 0.3) score -= 20;

    // Factor 2: Average days late (up to -20)
    score -= Math.min(metrics.avg_days_late * 2, 20);

    // Factor 3: Current arrears (up to -20)
    if (allocation.arrears_balance > 0) {
      const arrearsRatio = Number(allocation.arrears_balance) / Number(allocation.monthly_rent);
      score -= Math.min(arrearsRatio * 10, 20);
    }

    // Factor 4: Payment streak (up to +15)
    if (metrics.current_streak >= 6) score += 15;
    else if (metrics.current_streak >= 3) score += 10;
    else if (metrics.current_streak >= 1) score += 5;

    // Factor 5: Recent trend (up to ±10)
    if (metrics.trend === 'improving') score += 10;
    else if (metrics.trend === 'declining') score -= 10;

    // Factor 6: Payment frequency (up to -10)
    if (metrics.total_payments === 0) score -= 10; // New tenant, unknown history

    // Factor 7: Days since last payment (up to -10)
    if (metrics.days_since_last_payment > 60) score -= 10;
    else if (metrics.days_since_last_payment > 30) score -= 5;

    // Clamp score to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get risk level label
   */
  getRiskLevel(score) {
    if (score >= 80) return 'reliable';
    if (score >= 60) return 'moderate';
    if (score >= 40) return 'at_risk';
    return 'high_risk';
  }

  /**
   * Get risk color
   */
  getRiskColor(score) {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    if (score >= 40) return 'orange';
    return 'red';
  }

  /**
   * Get base score for new tenants
   */
  getBaseScore() {
    return {
      success: true,
      data: {
        score: 50,
        risk_level: 'moderate',
        color: 'yellow',
        metrics: { total_payments: 0 },
        prediction: 'New tenant - insufficient payment history. Monitor closely for first 3 months.',
        recommendations: [
          'Set up automatic payment reminders',
          'Monitor first 3 payments carefully',
          'Consider requesting advance deposit'
        ],
        calculated_at: new Date().toISOString()
      }
    };
  }

  /**
   * Generate AI prediction text
   */
  generatePrediction(metrics, score, allocation) {
    if (metrics.total_payments === 0) {
      return 'New tenant - insufficient payment history. Monitor closely for first 3 months.';
    }

    const onTimePercent = Math.round(metrics.on_time_rate * 100);
    const avgDaysLate = metrics.avg_days_late;

    if (score >= 80) {
      return `This tenant has paid on time ${onTimePercent}% of the time. They typically pay ${avgDaysLate === 0 ? 'on or before the due date' : `${avgDaysLate} day(s) after the due date`}. A gentle reminder 2 days before due date is usually sufficient.`;
    } else if (score >= 60) {
      return `This tenant pays on time ${onTimePercent}% of the time. They average ${avgDaysLate} day(s) late. Send a reminder on the due date and follow up if not paid within 3 days.`;
    } else if (score >= 40) {
      return `This tenant has inconsistent payment history (${onTimePercent}% on-time). They average ${avgDaysLate} day(s) late. Send reminders 3 days before due date and follow up immediately if late.`;
    } else {
      return `High-risk tenant with only ${onTimePercent}% on-time payment rate. They average ${avgDaysLate} day(s) late. Requires proactive management: send reminders 5 days before due date, escalate to admin if 7+ days late.`;
    }
  }

  /**
   * Get actionable recommendations
   */
  getRecommendations(metrics, score) {
    const recommendations = [];

    if (metrics.total_payments === 0) {
      recommendations.push('New tenant - monitor first 3 payments closely');
      recommendations.push('Set up automatic payment reminders');
    }

    if (metrics.on_time_rate < 0.5) {
      recommendations.push('Send reminders 3-5 days before due date');
    }

    if (metrics.avg_days_late > 7) {
      recommendations.push('Escalate to admin if 7+ days late');
    }

    if (metrics.trend === 'declining') {
      recommendations.push('Payment behavior declining - proactive outreach recommended');
    }

    if (metrics.trend === 'improving') {
      recommendations.push('Payment behavior improving - acknowledge positive trend');
    }

    if (metrics.current_streak >= 6) {
      recommendations.push('Excellent payment streak - consider loyalty acknowledgment');
    }

    if (score >= 80) {
      recommendations.push('Reliable payer - gentle reminders sufficient');
    } else if (score < 40) {
      recommendations.push('High risk - consider payment plan or deposit increase');
    }

    return recommendations.length > 0 ? recommendations : ['Continue standard payment monitoring'];
  }

  /**
   * Batch calculate scores for multiple tenants
   */
  async calculateBatchScores(tenantUnitPairs) {
    const scores = [];
    
    for (const { tenantId, unitId } of tenantUnitPairs) {
      const result = await this.calculateTenantScore(tenantId, unitId);
      if (result.success) {
        scores.push(result.data);
      }
    }
    
    return scores;
  }
}

module.exports = new PaymentPredictor();
