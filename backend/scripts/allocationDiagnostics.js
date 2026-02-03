#!/usr/bin/env node
/**
 * Allocation diagnostics helper.
 * Usage: node backend/scripts/allocationDiagnostics.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const AllocationIntegrityService = require('../services/allocationIntegrityService');

(async () => {
  try {
    console.log('🔍 Running allocation diagnostics...\n');
    const diagnostics = await AllocationIntegrityService.getDiagnostics();
    console.log('Summary:', diagnostics.summary);
    console.log('\nSamples:');
    Object.entries(diagnostics.samples).forEach(([key, rows]) => {
      console.log(`\n• ${key}`);
      if (!rows.length) {
        console.log('  (none)');
      } else {
        console.table(rows);
      }
    });
    console.log('\n✅ Diagnostics completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Diagnostics failed:', error.message);
    process.exit(1);
  }
})();
