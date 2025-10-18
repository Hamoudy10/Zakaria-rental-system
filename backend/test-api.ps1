# test-api.ps1 - Clean API Testing Script for PowerShell
$API_BASE = "http://localhost:3001/api"
$token = ""

Write-Host "Testing Rental System API Endpoints (Port 3001)..." -ForegroundColor Green
Write-Host ""

try {
    # Test 1: Health Check
    Write-Host "1. Testing health check..." -ForegroundColor Yellow
    $health = Invoke-RestMethod -Uri "$API_BASE/test" -Method Get
    Write-Host "SUCCESS: $($health.message)" -ForegroundColor Green

    # Test 2: Register a test user
    Write-Host "2. Testing user registration..." -ForegroundColor Yellow
    
    # Use a unique email to avoid duplicate errors
    $random = Get-Random -Minimum 1000 -Maximum 9999
    $registerBody = @{
        national_id = "87654321$random"
        first_name = "John"
        last_name = "Doe"
        email = "john.doe$random@example.com"
        phone_number = "25472233$random"
        password = "password123"
        role = "tenant"
    } | ConvertTo-Json

    try {
        $registerResponse = Invoke-RestMethod -Uri "$API_BASE/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
        Write-Host "SUCCESS: User registered: $($registerResponse.message)" -ForegroundColor Green
        Write-Host "User ID: $($registerResponse.user.id)" -ForegroundColor Gray
    } catch {
        Write-Host "INFO: Registration note: $($_.Exception.Message)" -ForegroundColor Blue
        # Try to get the response body for more details
        if ($_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            Write-Host "Error details: $errorBody" -ForegroundColor Red
        }
    }

    # Test 3: Login with the seeded admin user
    Write-Host "3. Testing login..." -ForegroundColor Yellow
    $loginBody = @{
        email = "admin@rental.com"
        password = "admin123"
    } | ConvertTo-Json

    try {
        $loginResponse = Invoke-RestMethod -Uri "$API_BASE/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
        $token = $loginResponse.token
        Write-Host "SUCCESS: Login successful: $($loginResponse.message)" -ForegroundColor Green
        Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    } catch {
        Write-Host "ERROR: Login failed: $($_.Exception.Message)" -ForegroundColor Red
        return
    }

    # Test 4: Test protected routes
    Write-Host "4. Testing protected routes..." -ForegroundColor Yellow
    $headers = @{
        "Authorization" = "Bearer $token"
    }

    # Test different endpoints
    $endpoints = @(
        "/users",
        "/properties", 
        "/payments",
        "/complaints",
        "/reports"
    )

    foreach ($endpoint in $endpoints) {
        try {
            $response = Invoke-RestMethod -Uri "$API_BASE$endpoint" -Method Get -Headers $headers
            Write-Host "SUCCESS: $endpoint route working" -ForegroundColor Green
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Host "WARNING: $endpoint returned: $statusCode - $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    Write-Host "All tests completed!" -ForegroundColor Green
    Write-Host "Token for manual testing: $token" -ForegroundColor Cyan

} catch {
    Write-Host "ERROR: Test failed: $($_.Exception.Message)" -ForegroundColor Red
}