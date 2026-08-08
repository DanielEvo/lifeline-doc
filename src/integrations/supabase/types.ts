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
      appointments: {
        Row: {
          all_day: boolean
          categoria_id: string | null
          cor: string | null
          created_at: string
          date_time: string
          descricao: string | null
          doctor_id: string
          duration_min: number | null
          id: string
          kind: string
          label: string | null
          lembretes_min: number[]
          local: string | null
          note: string | null
          patient_id: string | null
          recurrence_id: string | null
          request_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          categoria_id?: string | null
          cor?: string | null
          created_at?: string
          date_time: string
          descricao?: string | null
          doctor_id: string
          duration_min?: number | null
          id: string
          kind?: string
          label?: string | null
          lembretes_min?: number[]
          local?: string | null
          note?: string | null
          patient_id?: string | null
          recurrence_id?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          categoria_id?: string | null
          cor?: string | null
          created_at?: string
          date_time?: string
          descricao?: string | null
          doctor_id?: string
          duration_min?: number | null
          id?: string
          kind?: string
          label?: string | null
          lembretes_min?: number[]
          local?: string | null
          note?: string | null
          patient_id?: string | null
          recurrence_id?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      criterios: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          kind: string
          label: string
          raw_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          kind: string
          label: string
          raw_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          kind?: string
          label?: string
          raw_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      docs: {
        Row: {
          created_at: string
          doctor_id: string
          format: string | null
          id: string
          name: string
          origin: string
          size_bytes: number | null
          source_publication_id: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          doctor_id: string
          format?: string | null
          id?: string
          name: string
          origin: string
          size_bytes?: number | null
          source_publication_id?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          doctor_id?: string
          format?: string | null
          id?: string
          name?: string
          origin?: string
          size_bytes?: number | null
          source_publication_id?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docs_source_publication_id_fkey"
            columns: ["source_publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string
          especialidade: string
          id: string
          nome: string
          whatsapp: string
        }
        Insert: {
          created_at?: string
          email: string
          especialidade?: string
          id?: string
          nome: string
          whatsapp?: string
        }
        Update: {
          created_at?: string
          email?: string
          especialidade?: string
          id?: string
          nome?: string
          whatsapp?: string
        }
        Relationships: []
      }
      loinc_pt_br: {
        Row: {
          class: string
          component_pt: string
          loinc_code: string
          scale_typ: string | null
          short_name: string | null
          system: string | null
        }
        Insert: {
          class: string
          component_pt: string
          loinc_code: string
          scale_typ?: string | null
          short_name?: string | null
          system?: string | null
        }
        Update: {
          class?: string
          component_pt?: string
          loinc_code?: string
          scale_typ?: string | null
          short_name?: string | null
          system?: string | null
        }
        Relationships: []
      }
      measurements: {
        Row: {
          created_at: string
          date: string
          doctor_id: string
          id: string
          label: string
          loinc_code: string | null
          loinc_confidence: string
          motivo: string | null
          name: string
          patient_id: string
          ref_max: number
          ref_min: number
          unit: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          doctor_id: string
          id?: string
          label: string
          loinc_code?: string | null
          loinc_confidence?: string
          motivo?: string | null
          name: string
          patient_id: string
          ref_max: number
          ref_min: number
          unit: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          doctor_id?: string
          id?: string
          label?: string
          loinc_code?: string | null
          loinc_confidence?: string
          motivo?: string | null
          name?: string
          patient_id?: string
          ref_max?: number
          ref_min?: number
          unit?: string
          value?: number
        }
        Relationships: []
      }
      patient_pending_measurements: {
        Row: {
          collection_date: string | null
          confirmed_by_doctor: boolean
          created_at: string
          global_id: string
          id: string
          loinc_code: string | null
          loinc_confidence: string
          matched_name: string | null
          raw_name: string
          ref_max: number | null
          ref_min: number | null
          unit: string
          value: number
        }
        Insert: {
          collection_date?: string | null
          confirmed_by_doctor?: boolean
          created_at?: string
          global_id: string
          id?: string
          loinc_code?: string | null
          loinc_confidence?: string
          matched_name?: string | null
          raw_name: string
          ref_max?: number | null
          ref_min?: number | null
          unit: string
          value: number
        }
        Update: {
          collection_date?: string | null
          confirmed_by_doctor?: boolean
          created_at?: string
          global_id?: string
          id?: string
          loinc_code?: string | null
          loinc_confidence?: string
          matched_name?: string | null
          raw_name?: string
          ref_max?: number | null
          ref_min?: number | null
          unit?: string
          value?: number
        }
        Relationships: []
      }
      publications: {
        Row: {
          abstract: string | null
          created_at: string
          doctor_id: string
          doi: string | null
          id: string
          journal: string
          linked_doc_id: string | null
          matched_topics: string[]
          published_at: string | null
          source: string
          status: string
          status_changed_at: string | null
          title: string
          url: string
        }
        Insert: {
          abstract?: string | null
          created_at?: string
          doctor_id: string
          doi?: string | null
          id?: string
          journal: string
          linked_doc_id?: string | null
          matched_topics?: string[]
          published_at?: string | null
          source: string
          status?: string
          status_changed_at?: string | null
          title: string
          url: string
        }
        Update: {
          abstract?: string | null
          created_at?: string
          doctor_id?: string
          doi?: string | null
          id?: string
          journal?: string
          linked_doc_id?: string | null
          matched_topics?: string[]
          published_at?: string | null
          source?: string
          status?: string
          status_changed_at?: string | null
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_linked_doc_id_fkey"
            columns: ["linked_doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
