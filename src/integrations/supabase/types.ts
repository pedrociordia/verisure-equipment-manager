export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          district_code: string
          id: number
          name: string
        }
        Insert: {
          district_code: string
          id: number
          name: string
        }
        Update: {
          district_code?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      debt_cases: {
        Row: {
          created_at: string
          created_by: string | null
          exit_date: string | null
          frozen_engine_debt: number | null
          id: string
          initial_debt: number
          initial_debt_breakdown: Json | null
          manually_settled: boolean
          payroll_date_origin: string
          person_id: string
          settled_at: string | null
          settled_by: string | null
          settled_reason: string | null
          source: Database["public"]["Enums"]["debt_source"]
          source_file: string | null
          source_row_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exit_date?: string | null
          frozen_engine_debt?: number | null
          id?: string
          initial_debt: number
          initial_debt_breakdown?: Json | null
          manually_settled?: boolean
          payroll_date_origin: string
          person_id: string
          settled_at?: string | null
          settled_by?: string | null
          settled_reason?: string | null
          source?: Database["public"]["Enums"]["debt_source"]
          source_file?: string | null
          source_row_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exit_date?: string | null
          frozen_engine_debt?: number | null
          id?: string
          initial_debt?: number
          initial_debt_breakdown?: Json | null
          manually_settled?: boolean
          payroll_date_origin?: string
          person_id?: string
          settled_at?: string | null
          settled_by?: string | null
          settled_reason?: string | null
          source?: Database["public"]["Enums"]["debt_source"]
          source_file?: string | null
          source_row_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_cases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          debt_case_id: string
          id: string
          movement_type: Database["public"]["Enums"]["debt_movement_type"]
          note: string | null
          occurred_on: string
          reason: string | null
          source: Database["public"]["Enums"]["debt_source"]
          source_row_hash: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          debt_case_id: string
          id?: string
          movement_type: Database["public"]["Enums"]["debt_movement_type"]
          note?: string | null
          occurred_on: string
          reason?: string | null
          source?: Database["public"]["Enums"]["debt_source"]
          source_row_hash?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          debt_case_id?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["debt_movement_type"]
          note?: string | null
          occurred_on?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["debt_source"]
          source_row_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debt_movements_debt_case_id_fkey"
            columns: ["debt_case_id"]
            isOneToOne: false
            referencedRelation: "debt_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_prices: {
        Row: {
          active: boolean
          category: string
          id: string
          item_name: string
          price: number
        }
        Insert: {
          active?: boolean
          category: string
          id?: string
          item_name: string
          price: number
        }
        Update: {
          active?: boolean
          category?: string
          id?: string
          item_name?: string
          price?: number
        }
        Relationships: []
      }
      equipment_transactions: {
        Row: {
          access_pass: boolean
          clothing: boolean
          clothing_details: Json | null
          created_at: string
          demobox: boolean
          demobox_details: Json | null
          employee_signature: string | null
          id: string
          id_card: boolean
          import_batch_id: string | null
          imported_at: string | null
          izettle: boolean
          izettle_details: Json | null
          person_id: string
          phone: boolean
          phone_details: Json | null
          sales_binder: boolean
          sbc_name: string | null
          sbc_signature: string | null
          sbc_user_id: string | null
          source_row_hash: string | null
          source_system: string | null
          tablet: boolean
          tablet_details: Json | null
          toolkit: boolean
          toolkit_details: Json | null
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          access_pass?: boolean
          clothing?: boolean
          clothing_details?: Json | null
          created_at?: string
          demobox?: boolean
          demobox_details?: Json | null
          employee_signature?: string | null
          id?: string
          id_card?: boolean
          import_batch_id?: string | null
          imported_at?: string | null
          izettle?: boolean
          izettle_details?: Json | null
          person_id: string
          phone?: boolean
          phone_details?: Json | null
          sales_binder?: boolean
          sbc_name?: string | null
          sbc_signature?: string | null
          sbc_user_id?: string | null
          source_row_hash?: string | null
          source_system?: string | null
          tablet?: boolean
          tablet_details?: Json | null
          toolkit?: boolean
          toolkit_details?: Json | null
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          access_pass?: boolean
          clothing?: boolean
          clothing_details?: Json | null
          created_at?: string
          demobox?: boolean
          demobox_details?: Json | null
          employee_signature?: string | null
          id?: string
          id_card?: boolean
          import_batch_id?: string | null
          imported_at?: string | null
          izettle?: boolean
          izettle_details?: Json | null
          person_id?: string
          phone?: boolean
          phone_details?: Json | null
          sales_binder?: boolean
          sbc_name?: string | null
          sbc_signature?: string | null
          sbc_user_id?: string | null
          source_row_hash?: string | null
          source_system?: string | null
          tablet?: boolean
          tablet_details?: Json | null
          toolkit?: boolean
          toolkit_details?: Json | null
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_transactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          branch_id: number | null
          branch_name: string | null
          contract_type: string
          created_at: string
          exit_date: string | null
          id: string
          pers_id: string
          sales_channel_start: string | null
          sales_id: string
          sales_name: string
          source: string
          updated_at: string
        }
        Insert: {
          branch_id?: number | null
          branch_name?: string | null
          contract_type: string
          created_at?: string
          exit_date?: string | null
          id?: string
          pers_id: string
          sales_channel_start?: string | null
          sales_id: string
          sales_name: string
          source?: string
          updated_at?: string
        }
        Update: {
          branch_id?: number | null
          branch_name?: string | null
          contract_type?: string
          created_at?: string
          exit_date?: string | null
          id?: string
          pers_id?: string
          sales_channel_start?: string | null
          sales_id?: string
          sales_name?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_models: {
        Row: {
          active: boolean
          id: string
          name: string
          price: number
          price_confirmed: boolean
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          price?: number
          price_confirmed?: boolean
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          price?: number
          price_confirmed?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          branch_id: number | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch_id?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch_id?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      tablet_models: {
        Row: {
          active: boolean
          id: string
          name: string
          price: number
          price_confirmed: boolean
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          price?: number
          price_confirmed?: boolean
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          price?: number
          price_confirmed?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      equipment_transactions_safe: {
        Row: {
          access_pass: boolean | null
          clothing: boolean | null
          created_at: string | null
          demobox: boolean | null
          id: string | null
          id_card: boolean | null
          izettle: boolean | null
          person_id: string | null
          phone: boolean | null
          sales_binder: boolean | null
          sbc_name: string | null
          sbc_user_id: string | null
          tablet: boolean | null
          toolkit: boolean | null
          transaction_date: string | null
          transaction_type: string | null
        }
        Insert: {
          access_pass?: boolean | null
          clothing?: boolean | null
          created_at?: string | null
          demobox?: boolean | null
          id?: string | null
          id_card?: boolean | null
          izettle?: boolean | null
          person_id?: string | null
          phone?: boolean | null
          sales_binder?: boolean | null
          sbc_name?: string | null
          sbc_user_id?: string | null
          tablet?: boolean | null
          toolkit?: boolean | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Update: {
          access_pass?: boolean | null
          clothing?: boolean | null
          created_at?: string | null
          demobox?: boolean | null
          id?: string | null
          id_card?: boolean | null
          izettle?: boolean | null
          person_id?: string | null
          phone?: boolean | null
          sales_binder?: boolean | null
          sbc_name?: string | null
          sbc_user_id?: string | null
          tablet?: boolean | null
          toolkit?: boolean | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_transactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "data_manager" | "sbc"
      debt_movement_type: "payroll_deduction" | "refund" | "adjustment"
      debt_source: "app" | "historical_import"
      payroll_cycle_status: "open" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "data_manager", "sbc"],
      debt_movement_type: ["payroll_deduction", "refund", "adjustment"],
      debt_source: ["app", "historical_import"],
      payroll_cycle_status: ["open", "closed"],
    },
  },
} as const
