# Africa's Talking Specific Test
Write-Host "`n🎯 AFRICA'S TALKING SANDBOX SPECIFIC TEST" -ForegroundColor Green

$ATTestNumbers = @(
    "+254742773562"  # Official test number
)

foreach ($Number in $ATTestNumbers) {
    Write-Host "`nTesting Africa's Talking Sandbox: $Number" -ForegroundColor Yellow
    
    $TestBody = @{
        unit_code = "UNGAAPT005"
        amount = 1000
        mpesa_receipt_number = "AT_TEST_$(Get-Date -Format 'yyyyMMddHHmmss')"
        phone_number = $Number
        transaction_date = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        payment_month = (Get-Date).ToString("yyyy-MM")
    } | ConvertTo-Json

    try {
        $Response = Invoke-RestMethod -Uri "http://localhost:3001/api/payments/paybill" `
            -Method POST `
            -Headers @{
                "Content-Type" = "application/json"
                "Authorization" = "Bearer $Token"
            } `
            -Body $TestBody

        Write-Host "✅ Payment + SMS Sent to $Number" -ForegroundColor Green
        Write-Host "   Payment ID: $($Response.payment.id)" -ForegroundColor White
        Write-Host "   Check Africa's Talking dashboard for SMS status" -ForegroundColor Yellow
        
        # Wait between tests
        Start-Sleep -Seconds 2
        
    } catch {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}