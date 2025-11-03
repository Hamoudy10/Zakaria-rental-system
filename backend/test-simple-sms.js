# Test SMS Service Directly
Write-Host "`n📱 Testing SMS Service" -ForegroundColor Yellow

$SMSBody = @{
    phone = "254742773562"  # Replace with your test number
    message = "Test SMS from Rental System - If you receive this, SMS service is working!"
} | ConvertTo-Json

try {
    $SMSResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/payments/test-sms" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $Token"
        } `
        -Body $SMSBody

    Write-Host "✅ SMS Test Result:" -ForegroundColor Green
    $SMSResponse | Format-List
} catch {
    Write-Host "❌ SMS Test Failed: $($_.Exception.Message)" -ForegroundColor Red
}