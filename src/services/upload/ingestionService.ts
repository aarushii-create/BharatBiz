import { CSVValidationResult, DatasetType } from '../../types/upload';
import { db } from '../../db/repository';
import { BUSINESS_ID } from '../../db/seedData';
import { Sale, Inventory, Expense } from '../../types/dataModels';

export interface IngestionReport {
  success: boolean;
  datasetType: DatasetType;
  fileName: string;
  rowsIngested: number;
  timestamp: string;
  message: string;
}

export function ingestValidatedCSV(
  validation: CSVValidationResult,
  mode: 'replace' | 'append' = 'replace'
): IngestionReport {
  const timestamp = new Date().toISOString();

  if (!validation.success && validation.validRows.length === 0) {
    return {
      success: false,
      datasetType: validation.datasetType,
      fileName: validation.fileName,
      rowsIngested: 0,
      timestamp,
      message: `Ingestion aborted: Validation failed with ${validation.errors.length} errors.`,
    };
  }

  const rows = validation.validRows;

  switch (validation.datasetType) {
    case 'sales': {
      const salesToIngest: Sale[] = rows.map((r: any) => ({
        id: r.id,
        businessId: BUSINESS_ID,
        date: r.date,
        productId: r.productId,
        productName: r.productName,
        category: r.category,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        totalRevenue: r.totalRevenue,
        period: r.period,
      }));

      if (mode === 'replace') {
        db.setSales(salesToIngest);
      } else {
        const existing = db.getSales(BUSINESS_ID);
        const existingIds = new Set(existing.map((s) => s.id));
        const nonDuplicate = salesToIngest.filter((s) => !existingIds.has(s.id));
        db.setSales([...existing, ...nonDuplicate]);
      }
      break;
    }

    case 'inventory': {
      const invToIngest: Inventory[] = rows.map((r: any) => ({
        id: r.id,
        businessId: BUSINESS_ID,
        productId: r.productId,
        productName: r.productName,
        category: r.category,
        currentStock: r.currentStock,
        reorderLevel: r.reorderLevel,
        purchasePrice: r.purchasePrice,
        sellingPrice: r.sellingPrice,
        supplierId: 'sup-kaveri-01',
        supplierName: 'Kaveri Wholesale Grain Traders',
        salesVelocityUnitsPerWeek: r.salesVelocityUnitsPerWeek || 15,
        previousSalesVelocityUnitsPerWeek: r.salesVelocityUnitsPerWeek || 15,
        stockStatus: r.stockStatus || 'optimal',
        lastRestockedDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      }));

      if (mode === 'replace') {
        db.setInventory(invToIngest);
      } else {
        const existing = db.getInventory(BUSINESS_ID);
        const existingIds = new Set(existing.map((i) => i.id));
        const nonDuplicate = invToIngest.filter((i) => !existingIds.has(i.id));
        db.setInventory([...existing, ...nonDuplicate]);
      }
      break;
    }

    case 'expenses': {
      const expToIngest: Expense[] = rows.map((r: any) => ({
        id: r.id,
        businessId: BUSINESS_ID,
        date: r.date,
        category: r.category,
        amount: r.amount,
        period: r.period,
        notes: r.notes,
      }));

      if (mode === 'replace') {
        db.setExpenses(expToIngest);
      } else {
        const existing = db.getExpenses(BUSINESS_ID);
        const existingIds = new Set(existing.map((e) => e.id));
        const nonDuplicate = expToIngest.filter((e) => !existingIds.has(e.id));
        db.setExpenses([...existing, ...nonDuplicate]);
      }
      break;
    }

    default:
      return {
        success: false,
        datasetType: validation.datasetType,
        fileName: validation.fileName,
        rowsIngested: 0,
        timestamp,
        message: `Unknown dataset type: ${validation.datasetType}`,
      };
  }

  return {
    success: true,
    datasetType: validation.datasetType,
    fileName: validation.fileName,
    rowsIngested: rows.length,
    timestamp,
    message: `Successfully ingested ${rows.length} rows (${mode} mode) into ${validation.datasetType} table.`,
  };
}
