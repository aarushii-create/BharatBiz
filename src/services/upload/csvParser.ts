import {
  DatasetType,
  CSVValidationResult,
  ValidationErrorDetail,
} from '../../types/upload';
import { SaleRecord, InventoryItem, ExpenseRecord } from '../../types';

export const REQUIRED_COLUMNS: Record<DatasetType, string[]> = {
  sales: ['id', 'date', 'productId', 'productName', 'category', 'quantity', 'unitPrice', 'totalRevenue', 'period'],
  inventory: ['id', 'productId', 'productName', 'category', 'currentStock', 'reorderLevel', 'purchasePrice', 'sellingPrice', 'salesVelocityUnitsPerWeek'],
  expenses: ['id', 'date', 'category', 'amount', 'period'],
  purchases: ['id', 'date', 'supplierName', 'productId', 'productName', 'quantity', 'unitPrice', 'totalCost'],
  invoice: [],
};

export const ALLOWED_EXPENSE_CATEGORIES = [
  'Purchase Cost',
  'Wastage',
  'Delivery Expense',
  'Rent',
  'Electricity',
  'Packaging',
  'Other',
];

/**
 * RFC 4180 Compliant CSV Text Parser
 * Correctly handles quotes, commas inside fields, and CRLF / LF line endings.
 */
export function parseCSVText(csvText: string): {
  headers: string[];
  rawRows: string[][];
  errors: string[];
} {
  if (!csvText || !csvText.trim()) {
    return { headers: [], rawRows: [], errors: ['EMPTY_FILE: The CSV file has no content.'] };
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < csvText.length) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote ("")
        currentField += '"';
        i += 2;
        continue;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
        continue;
      }
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \r of CRLF
      }
      currentRow.push(currentField.trim());
      currentField = '';
      // Only push non-empty rows
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  // Push lingering field / row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rawRows: [], errors: ['EMPTY_FILE: No valid rows found in file.'] };
  }

  const headers = rows[0].map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rawRows = rows.slice(1);

  return { headers, rawRows, errors: [] };
}

/**
 * Validates a CSV string against a specific business dataset schema
 */
export function validateCSV(
  csvText: string,
  datasetType: DatasetType,
  fileName = 'dataset.csv'
): CSVValidationResult {
  const errors: ValidationErrorDetail[] = [];
  const warnings: string[] = [];
  const validRows: any[] = [];
  const seenIds = new Set<string>();
  let duplicateCount = 0;

  // 1. Guard against empty file
  if (!csvText || !csvText.trim()) {
    errors.push({
      row: 0,
      column: 'file',
      value: '',
      message: 'The submitted CSV file is completely empty.',
      type: 'empty_file',
    });
    return {
      success: false,
      datasetType,
      fileName,
      totalRows: 0,
      validRows: [],
      errors,
      warnings,
      missingColumns: REQUIRED_COLUMNS[datasetType] || [],
      duplicateCount: 0,
      detectedHeaders: [],
    };
  }

  // 2. Parse text
  const { headers, rawRows, errors: parseErrors } = parseCSVText(csvText);

  if (parseErrors.length > 0) {
    errors.push({
      row: 0,
      column: 'file',
      value: '',
      message: parseErrors[0],
      type: 'syntax_error',
    });
    return {
      success: false,
      datasetType,
      fileName,
      totalRows: 0,
      validRows: [],
      errors,
      warnings,
      missingColumns: REQUIRED_COLUMNS[datasetType] || [],
      duplicateCount: 0,
      detectedHeaders: headers,
    };
  }

  // 3. Schema & Missing Column validation
  const required = REQUIRED_COLUMNS[datasetType] || [];
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  const headerMap: Record<string, number> = {};

  headers.forEach((h, idx) => {
    headerMap[h.toLowerCase()] = idx;
  });

  const missingColumns = required.filter(
    (col) => !lowerHeaders.includes(col.toLowerCase())
  );

  if (missingColumns.length > 0) {
    errors.push({
      row: 1,
      column: 'headers',
      value: headers.join(', '),
      message: `Missing mandatory column(s): ${missingColumns.join(', ')}`,
      type: 'missing_column',
    });
  }

  // If critical columns are missing, halt row-level processing
  if (missingColumns.length > 0) {
    return {
      success: false,
      datasetType,
      fileName,
      totalRows: rawRows.length,
      validRows: [],
      errors,
      warnings,
      missingColumns,
      duplicateCount: 0,
      detectedHeaders: headers,
    };
  }

  // 4. Row-level Type & Value Validation
  rawRows.forEach((rowValues, rowIndex) => {
    const rowNum = rowIndex + 2; // Data row starts at 2
    let rowHasError = false;

    // Helper to get field by case-insensitive column name
    const getField = (colName: string): string => {
      const idx = headerMap[colName.toLowerCase()];
      return idx !== undefined && idx < rowValues.length ? rowValues[idx] : '';
    };

    const id = getField('id');

    // Missing value check on ID
    if (!id) {
      errors.push({
        row: rowNum,
        column: 'id',
        value: '',
        message: 'Record ID cannot be empty.',
        type: 'missing_value',
      });
      rowHasError = true;
    } else {
      // Duplicate record check
      if (seenIds.has(id)) {
        duplicateCount++;
        errors.push({
          row: rowNum,
          column: 'id',
          value: id,
          message: `Duplicate record ID "${id}" detected. IDs must be unique.`,
          type: 'duplicate_record',
        });
        rowHasError = true;
      } else {
        seenIds.add(id);
      }
    }

    // Dataset specific validations
    if (datasetType === 'sales') {
      const date = getField('date');
      const productId = getField('productId');
      const productName = getField('productName');
      const category = getField('category');
      const qtyStr = getField('quantity');
      const priceStr = getField('unitPrice');
      const revStr = getField('totalRevenue');
      const period = getField('period');

      // Check missing values
      if (!productId) {
        errors.push({ row: rowNum, column: 'productId', value: '', message: 'productId is required', type: 'missing_value' });
        rowHasError = true;
      }
      if (!productName) {
        errors.push({ row: rowNum, column: 'productName', value: '', message: 'productName is required', type: 'missing_value' });
        rowHasError = true;
      }

      // Check numeric types
      const quantity = Number(qtyStr);
      if (isNaN(quantity) || qtyStr.trim() === '') {
        errors.push({ row: rowNum, column: 'quantity', value: qtyStr, message: `Invalid numeric quantity "${qtyStr}"`, type: 'wrong_type' });
        rowHasError = true;
      } else if (quantity <= 0) {
        errors.push({ row: rowNum, column: 'quantity', value: qtyStr, message: `Quantity must be greater than 0`, type: 'wrong_type' });
        rowHasError = true;
      }

      const unitPrice = Number(priceStr);
      if (isNaN(unitPrice) || priceStr.trim() === '') {
        errors.push({ row: rowNum, column: 'unitPrice', value: priceStr, message: `Invalid numeric unitPrice "${priceStr}"`, type: 'wrong_type' });
        rowHasError = true;
      } else if (unitPrice < 0) {
        errors.push({ row: rowNum, column: 'unitPrice', value: priceStr, message: `unitPrice cannot be negative`, type: 'wrong_type' });
        rowHasError = true;
      }

      const totalRevenue = Number(revStr);
      if (isNaN(totalRevenue) || revStr.trim() === '') {
        errors.push({ row: rowNum, column: 'totalRevenue', value: revStr, message: `Invalid numeric totalRevenue "${revStr}"`, type: 'wrong_type' });
        rowHasError = true;
      }

      // Cross-field arithmetic verification
      if (!isNaN(quantity) && !isNaN(unitPrice) && !isNaN(totalRevenue)) {
        const expected = Math.round(quantity * unitPrice * 100) / 100;
        if (Math.abs(expected - totalRevenue) > 1.0) {
          errors.push({
            row: rowNum,
            column: 'totalRevenue',
            value: totalRevenue,
            message: `Arithmetic mismatch: totalRevenue (₹${totalRevenue}) != quantity (${quantity}) * unitPrice (₹${unitPrice}) = ₹${expected}`,
            type: 'arithmetic_mismatch',
          });
          rowHasError = true;
        }
      }

      if (!rowHasError) {
        validRows.push({
          id,
          date,
          productId,
          productName,
          category,
          quantity,
          unitPrice,
          totalRevenue,
          period: (period.toLowerCase() === 'previous' ? 'previous' : 'current') as 'current' | 'previous',
        });
      }
    } else if (datasetType === 'inventory') {
      const productId = getField('productId');
      const productName = getField('productName');
      const category = getField('category');
      const stockStr = getField('currentStock');
      const reorderStr = getField('reorderLevel');
      const costStr = getField('purchasePrice');
      const priceStr = getField('sellingPrice');
      const velStr = getField('salesVelocityUnitsPerWeek');

      const currentStock = Number(stockStr);
      if (isNaN(currentStock) || currentStock < 0) {
        errors.push({ row: rowNum, column: 'currentStock', value: stockStr, message: 'currentStock must be a non-negative number', type: 'wrong_type' });
        rowHasError = true;
      }

      const reorderLevel = Number(reorderStr);
      if (isNaN(reorderLevel) || reorderLevel < 0) {
        errors.push({ row: rowNum, column: 'reorderLevel', value: reorderStr, message: 'reorderLevel must be a non-negative number', type: 'wrong_type' });
        rowHasError = true;
      }

      const purchasePrice = Number(costStr);
      if (isNaN(purchasePrice) || purchasePrice <= 0) {
        errors.push({ row: rowNum, column: 'purchasePrice', value: costStr, message: 'purchasePrice must be greater than 0', type: 'wrong_type' });
        rowHasError = true;
      }

      const sellingPrice = Number(priceStr);
      if (isNaN(sellingPrice) || sellingPrice <= 0) {
        errors.push({ row: rowNum, column: 'sellingPrice', value: priceStr, message: 'sellingPrice must be greater than 0', type: 'wrong_type' });
        rowHasError = true;
      }

      if (!isNaN(purchasePrice) && !isNaN(sellingPrice) && sellingPrice < purchasePrice) {
        warnings.push(`Row ${rowNum}: sellingPrice (₹${sellingPrice}) is lower than purchasePrice (₹${purchasePrice}). Margin is negative.`);
      }

      const salesVelocityUnitsPerWeek = Number(velStr || '0');

      if (!rowHasError) {
        validRows.push({
          id,
          productId,
          productName,
          category,
          currentStock,
          reorderLevel,
          purchasePrice,
          sellingPrice,
          salesVelocityUnitsPerWeek,
          stockStatus: currentStock <= reorderLevel ? 'low_stock' : currentStock > reorderLevel * 1.5 ? 'overstocked' : 'optimal',
        });
      }
    } else if (datasetType === 'expenses') {
      const date = getField('date');
      const category = getField('category');
      const amtStr = getField('amount');
      const period = getField('period');

      if (!ALLOWED_EXPENSE_CATEGORIES.includes(category)) {
        errors.push({
          row: rowNum,
          column: 'category',
          value: category,
          message: `Unauthorized category "${category}". Allowed: ${ALLOWED_EXPENSE_CATEGORIES.join(', ')}`,
          type: 'wrong_type',
        });
        rowHasError = true;
      }

      const amount = Number(amtStr);
      if (isNaN(amount) || amount <= 0) {
        errors.push({
          row: rowNum,
          column: 'amount',
          value: amtStr,
          message: `amount must be a positive number`,
          type: 'wrong_type',
        });
        rowHasError = true;
      }

      if (!rowHasError) {
        validRows.push({
          id,
          date,
          category,
          amount,
          period: (period.toLowerCase() === 'previous' ? 'previous' : 'current') as 'current' | 'previous',
          notes: getField('notes') || undefined,
        });
      }
    } else if (datasetType === 'purchases') {
      const date = getField('date');
      const supplierName = getField('supplierName');
      const productId = getField('productId');
      const productName = getField('productName');
      const quantity = Number(getField('quantity'));
      const unitPrice = Number(getField('unitPrice'));
      const totalCost = Number(getField('totalCost'));

      if (!supplierName || !productId || !productName) {
        errors.push({ row: rowNum, column: 'purchase', value: '', message: 'supplierName, productId, and productName are required', type: 'missing_value' });
        rowHasError = true;
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(totalCost) || totalCost <= 0) {
        errors.push({ row: rowNum, column: 'amounts', value: '', message: 'quantity, unitPrice, and totalCost must be positive numbers', type: 'wrong_type' });
        rowHasError = true;
      }
      if (Number.isFinite(quantity) && Number.isFinite(unitPrice) && Number.isFinite(totalCost) && Math.abs(quantity * unitPrice - totalCost) > 1) {
        errors.push({ row: rowNum, column: 'totalCost', value: totalCost, message: 'totalCost must equal quantity multiplied by unitPrice', type: 'arithmetic_mismatch' });
        rowHasError = true;
      }
      if (!rowHasError) validRows.push({ id, date, supplierName, productId, productName, quantity, unitPrice, totalCost });
    }
  });

  return {
    success: errors.length === 0,
    datasetType,
    fileName,
    totalRows: rawRows.length,
    validRows,
    errors,
    warnings,
    missingColumns,
    duplicateCount,
    detectedHeaders: headers,
  };
}
