export type AppRole = 'admin' | 'data_manager' | 'sbc';

export interface Branch {
  id: number;
  district_code: string;
  name: string;
}

export interface Person {
  id: string;
  pers_id: string;
  sales_id: string;
  sales_name: string;
  branch_id: number | null;
  branch_name: string | null;
  exit_date: string | null;
  sales_channel_start: string | null;
  contract_type: 'Fixed Term' | 'On Call';
  created_at: string;
  source: 'manual' | 'equipment_historical_import';
  updated_at: string;
}

// Minimum fields returned by the SBC-scoped search RPC.
// SBC users never load the full Person record client-side.
export type PersonLookup = Pick<Person, 'id' | 'pers_id' | 'sales_id' | 'sales_name' | 'exit_date' | 'branch_name'>;

export interface PhoneDetails {
  verisure_number: string;
  brand: string;
  imei: string;
  sim_pin: string;
  charger: boolean;
  damage: string;
}

export interface TabletDetails {
  brand: string;
  laptop_number: string;
  charger: boolean;
  damage: string;
}

export interface DemoboxDetails {
  installation_number: string;
  items: string[];
}

export interface ClothingDetails {
  items: string[];
}

export interface ToolkitDetails {
  complete: boolean;
  missing_parts: string[];
}

export interface IzettleDetails {
  damage: string;
}

export interface EquipmentTransaction {
  id: string;
  person_id: string;
  transaction_type: 'Uitgifte' | 'Ingeleverd';
  transaction_date: string;
  sbc_user_id: string | null;
  sbc_name: string | null;
  sbc_signature: string | null;
  employee_signature: string | null;
  phone: boolean;
  phone_details: PhoneDetails | null;
  tablet: boolean;
  tablet_details: TabletDetails | null;
  demobox: boolean;
  demobox_details: DemoboxDetails | null;
  clothing: boolean;
  clothing_details: ClothingDetails | null;
  toolkit: boolean;
  toolkit_details: ToolkitDetails | null;
  izettle: boolean;
  izettle_details: IzettleDetails | null;
  sales_binder: boolean;
  id_card: boolean;
  access_pass: boolean;
  created_at: string;
  source_system: string | null;
  source_row_hash: string | null;
  import_batch_id: string | null;
  imported_at: string | null;
  people?: Person;
}

export interface EquipmentPrice {
  id: string;
  category: string;
  item_name: string;
  price: number;
  active: boolean;
}

export interface PhoneModel {
  id: string;
  name: string;
  price: number;
  active: boolean;
  price_confirmed: boolean;
}

export interface TabletModel {
  id: string;
  name: string;
  price: number;
  active: boolean;
  price_confirmed: boolean;
}

export interface PhoneAnomaly {
  imei: string;
  type: 'invalid_imei' | 'missing_price' | 'model_mismatch' | 'orphan_return' | 'duplicate_return';
  detail?: string;
}

export type DataQualityIssueType =
  | 'cap_applied'        // raw category total exceeded the cap
  | 'missing_price'      // an item was billed but no DB price exists
  | 'invalid_complete'   // toolkit `complete` was not a strict boolean
  | 'unknown_tx_type'    // transaction_type outside the enum
  | 'null_details'       // category flagged true but details JSON was null
  | 'negative_balance';  // more returned than given (capped at 0, but flagged)

export interface DataQualityIssue {
  category: 'phone' | 'tablet' | 'demobox' | 'toolkit' | 'clothing' | 'izettle' | 'other';
  type: DataQualityIssueType;
  detail?: string;
  raw?: number;
  capped?: number;
  item?: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  branch_id: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}
