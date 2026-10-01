import { validateCSV, parseCSVText } from '../services/upload/csvParser';
import { ingestValidatedCSV } from '../services/upload/ingestionService';
import { processInvoiceImage, ingestInvoiceToDatabase } from '../services/upload/invoiceOcr';
import { TestResult } from './businessData.test';
import { db } from '../db/repository';
import { BUSINESS_ID } from '../db/seedData';

export async function runUploadUnitTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];

  function assert(
    suite: string,
    name: string,
    actual: any,
    expected: any,
    comparator?: (a: any, b: any) => boolean
  ) {
    const passed = comparator
      ? comparator(actual, expected)
      : JSON.stringify(actual) === JSON.stringify(expected);

    results.push({
      suite,
      name,
      passed,
      expected,
      actual,
      error: passed ? undefined : `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    });
  }

  // --- SUITE 1: VALID CSV PARSING & INGESTION ---
  const validSalesCSV = `id,date,productId,productName,category,quantity,unitPrice,totalRevenue,period
sale-t1,2026-09-01,SKU-RICE-PONNI-25,Ponni Boiled Rice (25kg),Grains & Staples,10,1200,12000,current
sale-t2,2026-09-02,SKU-OIL-SUN-5L,Sunflower Oil 5L,Edible Oils,5,650,3250,current`;

  const validRes = validateCSV(validSalesCSV, 'sales', 'sales_valid.csv');
  assert('Valid CSV', 'Valid CSV passes with success=true and 0 errors', validRes.success, true);
  assert('Valid CSV', 'Parsed exactly 2 valid sales rows', validRes.validRows.length, 2);
  assert('Valid CSV', 'First row revenue equals 12000', validRes.validRows[0]?.totalRevenue, 12000);

  const ingestRes = ingestValidatedCSV(validRes, 'append');
  assert('Valid CSV', 'Ingestion succeeds with rowsIngested=2', ingestRes.success && ingestRes.rowsIngested === 2, true);

  // --- SUITE 2: INVALID CSV / SYNTAX ERROR ---
  const malformedCSV = `id,date,productId"broken quotes without closing,1200`;
  const invalidRes = validateCSV(malformedCSV, 'sales');
  // It should flag missing columns or syntax
  assert('Invalid CSV', 'Malformed CSV fails validation with errors', invalidRes.success, false);

  // --- SUITE 3: MISSING COLUMN DETECTION ---
  const missingColCSV = `id,date,productName,quantity,unitPrice
s1,2026-09-01,Rice,10,1000`; // Missing productId, category, totalRevenue, period
  const missingRes = validateCSV(missingColCSV, 'sales');
  assert('Missing Column', 'Fails when mandatory columns are missing', missingRes.success, false);
  assert(
    'Missing Column',
    'Detects missing productId column',
    missingRes.missingColumns.includes('productId'),
    true
  );
  assert(
    'Missing Column',
    'Detects missing totalRevenue column',
    missingRes.missingColumns.includes('totalRevenue'),
    true
  );

  // --- SUITE 4: EMPTY FILE HANDLING ---
  const emptyRes = validateCSV('', 'sales');
  assert('Empty File', 'Empty string fails validation', emptyRes.success, false);
  assert('Empty File', 'Emits empty_file error type', emptyRes.errors[0]?.type, 'empty_file');

  const whitespaceRes = validateCSV('   \n\r   ', 'expenses');
  assert('Empty File', 'Whitespace-only file fails validation', whitespaceRes.success, false);

  // --- SUITE 5: WRONG DATA TYPE DETECTION ---
  const wrongTypeCSV = `id,date,productId,productName,category,quantity,unitPrice,totalRevenue,period
s1,2026-09-01,SKU-1,Rice,Grains,TEN_BAGS,1000,10000,current`; // "TEN_BAGS" instead of numeric 10
  const wrongTypeRes = validateCSV(wrongTypeCSV, 'sales');
  assert('Wrong Data Type', 'Fails when non-numeric text is given for quantity', wrongTypeRes.success, false);
  assert(
    'Wrong Data Type',
    'Flags wrong_type error on column quantity',
    wrongTypeRes.errors.some((e) => e.column === 'quantity' && e.type === 'wrong_type'),
    true
  );

  // Negative amount in expenses
  const negativeExpenseCSV = `id,date,category,amount,period
exp-bad,2026-09-01,Purchase Cost,-5000,current`;
  const negExpRes = validateCSV(negativeExpenseCSV, 'expenses');
  assert(
    'Wrong Data Type',
    'Rejects negative expense amount',
    negExpRes.errors.some((e) => e.column === 'amount' && e.type === 'wrong_type'),
    true
  );

  // --- SUITE 6: DUPLICATE RECORDS DETECTION ---
  const duplicateCSV = `id,date,category,amount,period
exp-dup-01,2026-09-01,Purchase Cost,5000,current
exp-dup-01,2026-09-02,Wastage,1000,current`; // Duplicate ID "exp-dup-01"
  const dupRes = validateCSV(duplicateCSV, 'expenses');
  assert('Duplicate Records', 'Fails when duplicate ID is encountered', dupRes.success, false);
  assert('Duplicate Records', 'Counts exactly 1 duplicate record', dupRes.duplicateCount, 1);
  assert(
    'Duplicate Records',
    'Emits duplicate_record error with row number 3',
    dupRes.errors.some((e) => e.type === 'duplicate_record' && e.row === 3),
    true
  );

  // --- SUITE 7: MISSING VALUES DETECTION ---
  const missingValCSV = `id,date,productId,productName,category,quantity,unitPrice,totalRevenue,period
s1,2026-09-01,,Ponni Rice,Grains,10,1000,10000,current`; // Missing productId
  const missingValRes = validateCSV(missingValCSV, 'sales');
  assert('Missing Values', 'Fails when required cell value is blank', missingValRes.success, false);
  assert(
    'Missing Values',
    'Emits missing_value error on productId',
    missingValRes.errors.some((e) => e.column === 'productId' && e.type === 'missing_value'),
    true
  );

  // Missing record ID
  const missingIdCSV = `id,date,category,amount,period
,2026-09-01,Purchase Cost,5000,current`;
  const missingIdRes = validateCSV(missingIdCSV, 'expenses');
  assert(
    'Missing Values',
    'Emits missing_value error on ID column',
    missingIdRes.errors.some((e) => e.column === 'id' && e.type === 'missing_value'),
    true
  );

  // --- SUITE 8: INVOICE OCR & EXTRACTION ---
  const mockInvoiceImage = 'data:image/jpeg;base64,mockGrainInvoiceScan';
  const ocrRes = await processInvoiceImage(mockInvoiceImage);
  assert('Invoice OCR', 'Extracts structured invoice number', Boolean(ocrRes.invoiceNumber), true);
  assert(
    'Invoice OCR',
    'Identifies supplier Kaveri Wholesale Grain Traders',
    ocrRes.supplierName,
    'Kaveri Wholesale Grain Traders'
  );
  assert('Invoice OCR', 'Line items total matches ₹59,200', ocrRes.totalAmount, 59200);

  const initialExpenseCount = db.getExpenses(BUSINESS_ID).length;
  const ocrIngest = ingestInvoiceToDatabase(ocrRes);
  const newExpenseCount = db.getExpenses(BUSINESS_ID).length;
  assert('Invoice OCR', 'Ingests extracted invoice directly into Table: expenses', newExpenseCount, initialExpenseCount + 1);

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results,
  };
}
