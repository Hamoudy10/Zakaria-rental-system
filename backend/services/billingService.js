const pool = require('../config/database');

class BillingService {
  // Calculate total due for a tenant for a specific month
  async calculateTenantBill(tenantId, unitId, targetMonth) {
    try {
      console.log('🧮 Calculating bill for:', { tenantId, unitId, targetMonth });

      // 1. Get allocation details and monthly rent
      const allocationQuery = `
        SELECT 
          ta.*,
          pu.rent_amount,
          t.first_name,
          t.last_name,
          t.phone_number
        FROM tenant_allocations ta
        JOIN property_units pu ON ta.unit_id = pu.id
        JOIN tenants t ON ta.tenant_id = t.id
        WHERE ta.tenant_id = $1 AND ta.unit_id = $2 AND ta.is_active = true
      `;
      
      const allocationResult = await pool.query(allocationQuery, [tenantId, unitId]);
      
      if (allocationResult.rows.length === 0) {
        throw new Error('No active tenant allocation found');
      }

      const allocation = allocationResult.rows[0];
      const monthlyRent = parseFloat(allocation.monthly_rent);
      const arrearsBalance = parseFloat(allocation.arrears_balance) || 0;

      // 2. Get water bill for the month
      const waterBillQuery = `
        SELECT amount FROM water_bills 
        WHERE tenant_id = $1 AND unit_id = $2 
        AND DATE_TRUNC('month', bill_month) = DATE_TRUNC('month', $3::date)
        LIMIT 1
      `;
      
      const waterBillResult = await pool.query(waterBillQuery, [
        tenantId, 
        unitId, 
        `${targetMonth}-01`
      ]);
      
      const waterAmount = waterBillResult.rows[0] 
        ? parseFloat(waterBillResult.rows[0].amount) 
        : 0;

      // 3. Get payments already made for this month
      const paymentsQuery = `
        SELECT 
          COALESCE(SUM(allocated_to_rent), 0) as rent_paid,
          COALESCE(SUM(allocated_to_water), 0) as water_paid,
          COALESCE(SUM(allocated_to_arrears), 0) as arrears_paid,
          COALESCE(SUM(amount), 0) as total_paid
        FROM rent_payments 
        WHERE tenant_id = $1 AND unit_id = $2 
        AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', $3::date)
        AND status = 'completed'
      `;
      
      const paymentsResult = await pool.query(paymentsQuery, [
        tenantId, 
        unitId, 
        `${targetMonth}-01`
      ]);
      
      const rentPaid = parseFloat(paymentsResult.rows[0].rent_paid);
      const waterPaid = parseFloat(paymentsResult.rows[0].water_paid);
      const arrearsPaid = parseFloat(paymentsResult.rows[0].arrears_paid);

      // 4. Calculate remaining amounts
      const rentDue = Math.max(0, monthlyRent - rentPaid);
      const waterDue = Math.max(0, waterAmount - waterPaid);
      const arrearsDue = Math.max(0, arrearsBalance - arrearsPaid);
      
      const totalDue = rentDue + waterDue + arrearsDue;

      // 5. Check for advance payments that cover this month
      const advanceQuery = `
        SELECT COALESCE(SUM(amount), 0) as advance_amount
        FROM rent_payments 
        WHERE tenant_id = $1 AND unit_id = $2 
        AND is_advance_payment = true
        AND status = 'completed'
        AND DATE_TRUNC('month', payment_month) >= DATE_TRUNC('month', $3::date)
      `;
      
      const advanceResult = await pool.query(advanceQuery, [
        tenantId, 
        unitId, 
        `${targetMonth}-01`
      ]);
      
      const advanceAmount = parseFloat(advanceResult.rows[0].advance_amount);
      const coveredByAdvance = advanceAmount >= totalDue;

      return {
        tenantName: `${allocation.first_name} ${allocation.last_name}`,
        tenantPhone: allocation.phone_number,
        unitId: unitId,
        targetMonth: targetMonth,
        monthlyRent,
        rentPaid,
        rentDue,
        waterAmount,
        waterPaid,
        waterDue,
        arrearsBalance,
        arrearsPaid,
        arrearsDue,
        totalDue,
        advanceAmount,
        coveredByAdvance,
        breakdown: {
          rent: { amount: monthlyRent, paid: rentPaid, due: rentDue },
          water: { amount: waterAmount, paid: waterPaid, due: waterDue },
          arrears: { amount: arrearsBalance, paid: arrearsPaid, due: arrearsDue }
        }
      };

    } catch (error) {
      console.error('❌ Error calculating tenant bill:', error);
      throw error;
    }
  }

  // Generate bills for all tenants for a specific month
  async generateMonthlyBills(targetMonth) {
    try {
      console.log('📊 Generating monthly bills for:', targetMonth);

      // Get all active tenant allocations
      const allocationsQuery = `
        SELECT 
          ta.tenant_id,
          ta.unit_id,
          pu.unit_code,
          t.first_name,
          t.last_name,
          t.phone_number,
          p.name as property_name
        FROM tenant_allocations ta
        JOIN tenants t ON ta.tenant_id = t.id
        JOIN property_units pu ON ta.unit_id = pu.id
        JOIN properties p ON pu.property_id = p.id
        WHERE ta.is_active = true
        ORDER BY p.name, pu.unit_code
      `;
      
      const allocationsResult = await pool.query(allocationsQuery);
      const allocations = allocationsResult.rows;

      console.log(`📋 Found ${allocations.length} active tenant allocations`);

      const bills = [];
      const skipped = [];

      for (const allocation of allocations) {
        try {
          const bill = await this.calculateTenantBill(
            allocation.tenant_id,
            allocation.unit_id,
            targetMonth
          );

          // Add unit and property info
          bill.unitCode = allocation.unit_code;
          bill.propertyName = allocation.property_name;

          if (bill.coveredByAdvance) {
            skipped.push({
              tenantId: allocation.tenant_id,
              tenantName: bill.tenantName,
              unitCode: allocation.unit_code,
              reason: 'Covered by advance payment',
              advanceAmount: bill.advanceAmount
            });
          } else {
            bills.push(bill);
          }

        } catch (error) {
          console.error(`❌ Error generating bill for tenant ${allocation.tenant_id}:`, error);
        }
      }

      return {
        success: true,
        month: targetMonth,
        totalTenants: allocations.length,
        billsGenerated: bills.length,
        skipped: skipped.length,
        bills,
        skippedDetails: skipped
      };

    } catch (error) {
      console.error('❌ Error generating monthly bills:', error);
      throw error;
    }
  }

  // Update arrears balance after payment
  async updateArrearsBalance(tenantId, unitId, paymentMonth, paidAmount, totalDue) {
    try {
      const unpaidAmount = totalDue - paidAmount;
      
      if (unpaidAmount > 0) {
        // Add unpaid amount to arrears
        await pool.query(
          `UPDATE tenant_allocations 
           SET arrears_balance = arrears_balance + $1,
           WHERE tenant_id = $2 AND unit_id = $3 AND is_active = true`,
          [unpaidAmount, tenantId, unitId]
        );
        
        console.log(`📝 Updated arrears for tenant ${tenantId}: +KSh ${unpaidAmount}`);
        return unpaidAmount;
      }
      
      return 0;
    } catch (error) {
      console.error('❌ Error updating arrears balance:', error);
      throw error;
    }
  }

  // Allocate payment between rent, water, and arrears
  async allocatePayment(tenantId, unitId, amount, targetMonth) {
    try {
      console.log('💰 Allocating payment:', { tenantId, unitId, amount, targetMonth });

      // Calculate current bill
      const bill = await this.calculateTenantBill(tenantId, unitId, targetMonth);

      let remainingAmount = parseFloat(amount);
      const allocation = {
        toArrears: 0,
        toWater: 0,
        toRent: 0,
        toAdvance: 0
      };

      // 1. Allocate to arrears first
      if (bill.arrearsDue > 0 && remainingAmount > 0) {
        allocation.toArrears = Math.min(remainingAmount, bill.arrearsDue);
        remainingAmount -= allocation.toArrears;
      }

      // 2. Allocate to water bill
      if (bill.waterDue > 0 && remainingAmount > 0) {
        allocation.toWater = Math.min(remainingAmount, bill.waterDue);
        remainingAmount -= allocation.toWater;
      }

      // 3. Allocate to rent
      if (bill.rentDue > 0 && remainingAmount > 0) {
        allocation.toRent = Math.min(remainingAmount, bill.rentDue);
        remainingAmount -= allocation.toRent;
      }

      // 4. Any remaining is advance payment
      if (remainingAmount > 0) {
        allocation.toAdvance = remainingAmount;
      }

      console.log('✅ Payment allocated:', allocation);

      return {
        ...allocation,
        remainingArrears: bill.arrearsDue - allocation.toArrears,
        remainingWater: bill.waterDue - allocation.toWater,
        remainingRent: bill.rentDue - allocation.toRent,
        totalDue: bill.totalDue,
        paidAmount: parseFloat(amount)
      };

    } catch (error) {
      console.error('❌ Error allocating payment:', error);
      throw error;
    }
  }
}

module.exports = new BillingService();