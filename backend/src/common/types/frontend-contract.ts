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
  propertyCode?: string | null;
  name: string;
  nameKana?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  prefecture?: string | null;
  city?: string | null;
  ward?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  buildingType?: string | null;
  usageType?: string | null;
  managementStatus?: string | null;
  remark?: string | null;
}

export interface FrontendRoom {
  id: string;
  projectId?: string | null;
  buildingId: string;
  roomCode?: string | null;
  currentContractId?: string | null;
  houseNumber?: string | null;
  number: string | null;
  displayName?: string | null;
  unitType?: string | null;
  area?: string | null;
  floor?: number | null;
  floorLabel?: string | null;
  usageType?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  effectiveLatitude?: string | null;
  effectiveLongitude?: string | null;
  coordinateSource: 'building' | 'room' | 'none';
  status: string;
  note?: string | null;
  remark?: string | null;
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
  sequenceNo?: number | null;
  fileType?: string | null;
  counterparty?: string | null;
  counterpartyRaw?: string | null;
  contentSummary?: string | null;
  fileAmount?: string | null;
  transferFeeAmount?: string | null;
  statisticalAmount?: string | null;
  evidenceDateType?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  processingStatus: string;
  confirmationStatus: string;
  totalAmount?: string | null;
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
