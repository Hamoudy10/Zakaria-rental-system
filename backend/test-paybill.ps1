# Complete Paybill System Test
Write-Host "🚀 ZAKARIA RENTAL SYSTEM - PAYBILL TEST" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# Configuration - UPDATE THESE VALUES!
$TestPhoneNumber = "+254742773562"  # Your actual phone number
$TestUnitCode = "GAAPTUN"           # Actual unit code from your system

Write-Host "Test Phone: $TestPhoneNumber" -ForegroundColor Yellow
Write-Host "Test Unit Code: $TestUnitCode" -ForegroundColor Yellow
Write-Host ""

# 1. Test SMS Service
Write-Host "1. Testing SMS Service..." -ForegroundColor White
$SmsTest = @{
    Uri = "http://localhost:3001/api/payments/test-sms"
    Method = "POST"
    Headers = @{ "Content-Type" = "application/json" }
    Body = @{ phone = $TestPhoneNumber; message = "Test SMS from Zakaria System" } | ConvertTo-Json
}
try { 
    $Response = Invoke-RestMethod @SmsTest
    Write-Host "   ✅ SMS Test: $($Response.message)" -ForegroundColor Green
} catch { 
    Write-Host "   ❌ SMS Test Failed: $($_.Exception.Message)" -ForegroundColor Red 
}

# 2. Test Paybill Payment
Write-Host "2. Testing Paybill Payment..." -ForegroundColor White
$PaybillTest = @{
    Uri = "http://localhost:3001/api/payments/process-paybill"
    Method = "POST"
    Headers = @{ "Content-Type" = "application/json" }
    Body = @{
        unit_code = $TestUnitCode
        amount = 5000
        mpesa_receipt_number = "TEST" + (Get-Date -Format "yyyyMMddHHmmss")
        phone_number = $TestPhoneNumber
        transaction_date = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        payment_month = (Get-Date).ToString("yyyy-MM")
    } | ConvertTo-Json
}
try {
    $Response = Invoke-RestMethod @PaybillTest
    Write-Host "   ✅ Paybill Test: $($Response.message)" -ForegroundColor Green
    if ($Response.tracking) {
        Write-Host "   📊 Payment Tracking:" -ForegroundColor Yellow
        Write-Host "      - Allocated: KSh $($Response.tracking.allocatedAmount)" -ForegroundColor Gray
        Write-Host "      - Carry Forward: KSh $($Response.tracking.carryForwardAmount)" -ForegroundColor Gray
        Write-Host "      - Month Complete: $($Response.tracking.isMonthComplete)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Paybill Test Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Verify Payment Recorded
Write-Host "3. Verifying Payment Recording..." -ForegroundColor White
try {
    $Response = Invoke-RestMethod "http://localhost:3001/api/payments/unit/$TestUnitCode/status" -Method GET
    Write-Host "   ✅ Status Check: $($Response.data.tenant_name) - Balance: KSh $($Response.data.balance)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Status Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎯 TEST COMPLETED" -ForegroundColor Cyan
Write-Host "Check your phone for SMS notifications!" -ForegroundColor Yellow