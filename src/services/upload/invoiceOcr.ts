import { InvoiceExtractionResult, InvoiceExtractedItem } from '../../types/upload';
import { db } from '../../db/repository';
import { BUSINESS_ID } from '../../db/seedData';
import { Expense } from '../../types/dataModels';

/**
 * Phase 6 — Invoice Image OCR & Multimodal Processing Engine
 * Flow: Invoice Image -> OCR & Text Parsing -> Structured Fields -> Validation -> Database
 */
export async function processInvoiceImage(
  imageSource: File | Blob | string,
  fileName = 'invoice_scan.jpg'
): Promise<InvoiceExtractionResult> {
  // Guard: empty image
  if (!imageSource) {
    return {
      success: false,
      invoiceNumber: '',
      supplierName: '',
      date: '',
      items: [],
      totalAmount: 0,
      confidence: 0,
      error: 'EMPTY_IMAGE: No image file provided for OCR extraction.',
    };
  }

  // Simulated optical character recognition extraction grounded in grocery wholesaler receipts
  // If a real image is passed or test sample requested:
  const isOilWholesale = typeof imageSource === 'string' && imageSource.toLowerCase().includes('oil');
  const isSpiceWholesale = typeof imageSource === 'string' && imageSource.toLowerCase().includes('spice');

  let invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  let supplierName = 'Kaveri Wholesale Grain Traders';
  let supplierPhone = '+91 94431 82741';
  let date = '2026-09-24';
  let items: InvoiceExtractedItem[] = [];

  if (isOilWholesale) {
    supplierName = 'Madurai Oil Mills & Refineries';
    supplierPhone = '+91 98421 55672';
    invoiceNumber = 'MOM-2026-094';
    items = [
      {
        description: 'Sunflower Refined Oil (5 Litre Cans)',
        category: 'Edible Oils',
        quantity: 30,
        unitPrice: 560,
        totalCost: 16800,
      },
    ];
  } else if (isSpiceWholesale) {
    supplierName = 'Aachi Spices Wholesale Distribution';
    supplierPhone = '+91 94440 12890';
    invoiceNumber = 'ACH-88912';
    items = [
      {
        description: 'Sambar Masala Powder (500g)',
        category: 'Spices & Masalas',
        quantity: 50,
        unitPrice: 110,
        totalCost: 5500,
      },
    ];
  } else {
    // Default staple grain wholesale invoice
    invoiceNumber = 'KW-2026-8841';
    items = [
      {
        description: 'Ponni Boiled Rice (25kg Bags)',
        category: 'Grains & Staples',
        quantity: 40,
        unitPrice: 920,
        totalCost: 36800,
      },
      {
        description: 'Premium Toor Dal (10kg Bags)',
        category: 'Pulses',
        quantity: 20,
        unitPrice: 1120,
        totalCost: 22400,
      },
    ];
  }

  // Validation: Calculate total sum and verify line items
  const totalAmount = items.reduce((sum, item) => sum + item.totalCost, 0);

  // Validate arithmetic integrity
  for (const item of items) {
    const expected = item.quantity * item.unitPrice;
    if (Math.abs(expected - item.totalCost) > 1.0) {
      return {
        success: false,
        invoiceNumber,
        supplierName,
        date,
        items,
        totalAmount,
        confidence: 0.6,
        error: `OCR Line Arithmetic Mismatch: ${item.description} total ₹${item.totalCost} does not match ${item.quantity} * ₹${item.unitPrice}`,
      };
    }
  }

  return {
    success: true,
    invoiceNumber,
    supplierName,
    supplierPhone,
    date,
    items,
    totalAmount,
    confidence: 0.96,
    matchedSku: items[0]?.description,
  };
}

/**
 * Ingests validated OCR invoice into the business ledger (Expenses + Inventory)
 */
export function ingestInvoiceToDatabase(invoice: InvoiceExtractionResult): {
  success: boolean;
  expenseId: string;
  itemsUpdated: number;
} {
  if (!invoice.success || invoice.totalAmount <= 0) {
    throw new Error('Cannot ingest invalid or zero-value invoice');
  }

  // 1. Create Purchase Cost Expense Record
  const expenseId = `exp-inv-${Date.now()}`;
  const expenseRecord: Expense = {
    id: expenseId,
    businessId: BUSINESS_ID,
    date: invoice.date,
    category: 'Purchase Cost',
    amount: invoice.totalAmount,
    period: 'current',
    notes: `OCR Auto-Ingested from Invoice #${invoice.invoiceNumber} (${invoice.supplierName})`,
  };

  const currentExpenses = db.getExpenses(BUSINESS_ID);
  db.setExpenses([...currentExpenses, expenseRecord]);

  // 2. Increment Inventory Stock for matching items
  const currentInventory = db.getInventory(BUSINESS_ID);
  let updatedCount = 0;

  for (const item of invoice.items) {
    const match = currentInventory.find(
      (inv) =>
        inv.productName.toLowerCase().includes('rice') && item.description.toLowerCase().includes('rice') ||
        inv.productName.toLowerCase().includes('dal') && item.description.toLowerCase().includes('dal') ||
        inv.productName.toLowerCase().includes('oil') && item.description.toLowerCase().includes('oil')
    );

    if (match) {
      db.updateStock(match.id, match.currentStock + item.quantity);
      updatedCount++;
    }
  }

  return {
    success: true,
    expenseId,
    itemsUpdated: updatedCount,
  };
}
