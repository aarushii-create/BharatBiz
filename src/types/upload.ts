export type DatasetType = 'sales' | 'inventory' | 'expenses' | 'purchases' | 'invoice';

export type ValidationIssueType =
  | 'missing_column'
  | 'wrong_type'
  | 'missing_value'
  | 'duplicate_record'
  | 'arithmetic_mismatch'
  | 'syntax_error'
  | 'empty_file';

export interface ValidationErrorDetail {
  row: number; // 1-indexed, header is row 1, data starts row 2
  column: string;
  value: any;
  message: string;
  type: ValidationIssueType;
}

export interface CSVValidationResult<T = any> {
  success: boolean;
  datasetType: DatasetType;
  fileName: string;
  totalRows: number;
  validRows: T[];
  errors: ValidationErrorDetail[];
  warnings: string[];
  missingColumns: string[];
  duplicateCount: number;
  detectedHeaders: string[];
}

export interface InvoiceExtractedItem {
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
}

export interface InvoiceExtractionResult {
  success: boolean;
  invoiceNumber: string;
  supplierName: string;
  supplierPhone?: string;
  date: string;
  items: InvoiceExtractedItem[];
  totalAmount: number;
  confidence: number;
  matchedSku?: string;
  rawText?: string;
  error?: string;
}
