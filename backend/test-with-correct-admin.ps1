# test-with-correct-admin.ps1
Write-Host "Testing with Correct Admin Credentials..." -ForegroundColor Cyan

# Use the actual admin email from your database
$loginBody = @{
    email = "admin@primerentals.co.ke"
    password = "admin123"
} | ConvertTo-Json

try {
    Write-Host "Attempting login with admin@primerentals.co.ke..." -ForegroundColor Yellow
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "Message: $($loginResponse.message)" -ForegroundColor White
    Write-Host "Token: $($loginResponse.token)" -ForegroundColor Cyan
    Write-Host "User: $($loginResponse.user | ConvertTo-Json -Depth 1)" -ForegroundColor Gray
    
    # Test protected routes with the token
    $token = $loginResponse.token
    $headers = @{Authorization = "Bearer $token"}
    
    Write-Host "`nTesting protected routes..." -ForegroundColor Yellow
    $endpoints = @(
        @{Name = "Users"; Path = "/users"},
        @{Name = "Properties"; Path = "/properties"},
        @{Name = "Complaints"; Path = "/complaints"}
    )
    
    foreach ($endpoint in $endpoints) {
        try {
            $result = Invoke-RestMethod -Uri "http://localhost:3001/api$($endpoint.Path)" -Method Get -Headers $headers
            Write-Host "  ✅ $($endpoint.Name) - $($result.message)" -ForegroundColor Green
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Host "  ❌ $($endpoint.Name) - HTTP $statusCode" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    
    # If that password doesn't work, let's register a new admin user
    Write-Host "`nTrying to register a new admin user..." -ForegroundColor Yellow
    
    $random = Get-Random -Minimum 1000 -Maximum 9999
    $registerBody = @{
        national_id = "admin$random"
        first_name = "System"
        last_name = "Admin"
        email = "admin$random@rental.com"
        phone_number = "254700000000"
        password = "admin123"
        role = "admin"
    } | ConvertTo-Json

    try {
        $registerResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
        Write-Host "✅ New admin user registered: $($registerResponse.user.email)" -ForegroundColor Green
        
        # Login with new admin
        $newLoginBody = @{
            email = "admin$random@rental.com"
            password = "admin123"
        } | ConvertTo-Json
        
        $newLoginResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $newLoginBody -ContentType "application/json"
        $token = $newLoginResponse.token
        Write-Host "✅ Login successful with new admin!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Registration also failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nTest complete!" -ForegroundColor Cyan
