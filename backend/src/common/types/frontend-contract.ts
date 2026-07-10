export type FrontendFeeCategory = 'income' | 'expense' | 'both';
export type FrontendFeeValueType = 'Money' | 'Number' | 'Text' | 'Date';
export type FrontendTransactionType = 'income' | 'expense';

export interface FrontendProject {
  id: string;
  name: string;
  address?: string | null;
  note?: string | null;
}

export interface FrontendBuilding {
  id: string;
  projectId?: string | null;
  name: string;
  latitude?: string | null;
  longitude?: string | null;
}

export interface FrontendRoom {
  id: string;
  projectId?: string | null;
  buildingId: string;
  houseNumber?: string | null;
  number: string;
  area?: string | null;
  floor?: number | null;
  latitude?: string | null;
  longitude?: string | null;
  effectiveLatitude?: string | null;
  effectiveLongitude?: string | null;
  coordinateSource: 'building' | 'room' | 'none';
  status: string;
  note?: string | null;
}

export interface FrontendTenant {
  id: string;
  customerCode?: string | null;
  name: string;
  kana?: string | null;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  occupation?: string | null;
  annualIncome?: string | null;
  address?: string | null;
  attachments?: string | null;
}

export interface FrontendOwner {
  id: string;
  customerCode?: string | null;
  ownerType: string;
  name: string;
  kana?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  attachments?: string | null;
}

export interface FrontendRoomTenant {
  id: string;
  roomId: string;
  tenantId: string;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
}

export interface FrontendRoomOwner {
  id: string;
  roomId: string;
  ownerId: string;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
}

export interface FrontendFeeItem {
  id: string;
  name: string;
  category: FrontendFeeCategory;
  valueType: FrontendFeeValueType;
  sortOrder: number;
  enabled: boolean;
}

export interface FrontendTransactionDetail {
  feeItemId: string;
  value: string;
}

export interface FrontendTransaction {
  id: string;
  type: FrontendTransactionType;
  roomId?: string | null;
  date: string;
  counterparty?: string | null;
  note?: string | null;
  details: FrontendTransactionDetail[];
}

export interface FrontendDocument {
  id: string;
  roomId?: string | null;
  documentType: string;
  fileName: string;
  extractedText?: string | null;
}

export interface FrontendKnowledgeDocument {
  id: string;
  roomId?: string | null;
  title: string;
  content?: string | null;
  sourceType?: string | null;
}

export interface FrontendBootstrap {
  projects: FrontendProject[];
  buildings: FrontendBuilding[];
  rooms: FrontendRoom[];
  tenants: FrontendTenant[];
  owners: FrontendOwner[];
  roomTenants: FrontendRoomTenant[];
  roomOwners: FrontendRoomOwner[];
  feeItems: FrontendFeeItem[];
  transactions: FrontendTransaction[];
  documents: FrontendDocument[];
  knowledgeDocuments: FrontendKnowledgeDocument[];
}
