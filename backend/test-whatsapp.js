// backend/test-whatsapp.js
// Run with: node backend/test-whatsapp.js

require("dotenv").config();
const WhatsAppService = require("./services/whatsappServices");

async function testWhatsApp() {
  console.log("\n========== WHATSAPP SERVICE TEST ==========\n");

  // Step 1: Check configuration
  console.log("1️⃣ Checking configuration...");
  const status = await WhatsAppService.checkServiceStatus();
  console.log("Service Status:", JSON.stringify(status, null, 2));

  if (!status.configured) {
    console.error(
      "\n❌ WhatsApp is NOT configured. Check your .env variables:",
    );
    console.error("   - WHATSAPP_PHONE_NUMBER_ID");
    console.error("   - WHATSAPP_BUSINESS_ACCOUNT_ID");
    console.error("   - WHATSAPP_ACCESS_TOKEN");
    console.error("   - WHATSAPP_API_VERSION");
    process.exit(1);
  }

  if (!status.apiConnected) {
    console.error("\n❌ API connection failed:", status.error);
    console.error("   Check your access token is valid and not expired.");
    process.exit(1);
  }

  console.log("\n✅ Configuration OK!");
  console.log("   Phone:", status.phoneInfo?.displayPhoneNumber);
  console.log("   Name:", status.phoneInfo?.verifiedName);
  console.log("   Quality:", status.phoneInfo?.qualityRating);

  // Step 2: Send a test template message
  // ⚠️ REPLACE with your own phone number for testing
  const TEST_PHONE = "0712345678"; // <-- PUT YOUR PHONE NUMBER HERE

  console.log(`\n2️⃣ Sending test welcome message to ${TEST_PHONE}...`);

  const result = await WhatsAppService.sendWelcomeMessage(
    TEST_PHONE,
    "Test User",
    "MJ-01",
    "15000",
    "1st",
    "Zakaria Housing",
  );

  console.log("\nResult:", JSON.stringify(result, null, 2));

  if (result.success) {
    console.log("\n✅ WhatsApp message sent successfully!");
    console.log("   Message ID:", result.messageId);
  } else if (result.notOnWhatsApp) {
    console.log("\n⚠️ Recipient is not on WhatsApp. SMS will be the fallback.");
  } else {
    console.error("\n❌ Failed to send:", result.error);
    console.error("   Error code:", result.code);
  }

  console.log("\n========== TEST COMPLETE ==========\n");
  process.exit(0);
}

testWhatsApp().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
