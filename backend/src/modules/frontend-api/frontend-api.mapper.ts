import {
  FrontendFeeCategory,
  FrontendFeeValueType,
  FrontendTransactionType,
} from '../../common/types/frontend-contract';

export function decimalToString(value: { toString(): string } | null | undefined): string | null {
  return value == null ? null : value.toString();
}

export function dateToIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toFrontendCategory(value: string): FrontendFeeCategory {
  return value.toLowerCase() as FrontendFeeCategory;
}

export function toFrontendValueType(value: string): FrontendFeeValueType {
  const normalized = value.toLowerCase();
  if (normalized === 'money') return 'Money';
  if (normalized === 'number') return 'Number';
  if (normalized === 'date') return 'Date';
  return 'Text';
}

export function toFrontendTransactionType(value: string): FrontendTransactionType {
  return value.toLowerCase() as FrontendTransactionType;
}

export function toPrismaCategory(value: string) {
  return value.toUpperCase() as 'INCOME' | 'EXPENSE' | 'BOTH';
}

export function toPrismaValueType(value: string) {
  return value.toUpperCase() as 'MONEY' | 'NUMBER' | 'TEXT' | 'DATE';
}

export function toPrismaTransactionType(value: string) {
  return value.toUpperCase() as 'INCOME' | 'EXPENSE';
}
