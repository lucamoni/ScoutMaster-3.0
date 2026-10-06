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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      modelli_documenti: {
        Row: {
          id: string
          nome_modello: string
          file_url: string
          tipo_file: string | null
          data_caricamento: string | null
        }
        Insert: {
          id?: string
          nome_modello: string
          file_url: string
          tipo_file?: string | null
          data_caricamento?: string | null
        }
        Update: {
          id?: string
          nome_modello?: string
          file_url?: string
          tipo_file?: string | null
          data_caricamento?: string | null
        }
        Relationships: []
      }
      categorie_spesa: {
        Row: {
          id: string
          nome: string
          tipo_movimento: string | null
        }
        Insert: {
          id?: string
          nome: string
          tipo_movimento?: string | null
        }
        Update: {
          id?: string
          nome?: string
          tipo_movimento?: string | null
        }
        Relationships: []
      }
      eventi: {
        Row: {
          data_inizio: string | null
          id: string
          metodo_pagamento: string | null
          nome_evento: string
          quota_standard: number | null
          tipo_evento: string | null
        }
        Insert: {
          data_inizio?: string | null
          id?: string
          metodo_pagamento?: string | null
          nome_evento: string
          quota_standard?: number | null
          tipo_evento?: string | null
        }
        Update: {
          data_inizio?: string | null
          id?: string
          metodo_pagamento?: string | null
          nome_evento?: string
          quota_standard?: number | null
          tipo_evento?: string | null
        }
        Relationships: []
      }
      impostazioni: {
        Row: {
          chiave: string
          valore: string
        }
        Insert: {
          chiave: string
          valore: string
        }
        Update: {
          chiave?: string
          valore?: string
        }
        Relationships: []
      }
      partecipazioni_eventi: {
        Row: {
          evento_id: string | null
          id: string
          metodo_pagamento: string | null
          quota_dovuta: number | null
          ragazzo_id: string | null
          riscosso: boolean | null
          scheda_medica_consegnata: boolean | null
          stato_presenza: string | null
        }
        Insert: {
          evento_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          quota_dovuta?: number | null
          ragazzo_id?: string | null
          riscosso?: boolean | null
          scheda_medica_consegnata?: boolean | null
          stato_presenza?: string | null
        }
        Update: {
          evento_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          quota_dovuta?: number | null
          ragazzo_id?: string | null
          riscosso?: boolean | null
          scheda_medica_consegnata?: boolean | null
          stato_presenza?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partecipazioni_eventi_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partecipazioni_eventi_ragazzo_id_fkey"
            columns: ["ragazzo_id"]
            isOneToOne: false
            referencedRelation: "ragazzi"
            referencedColumns: ["id"]
          },
        ]
      }
      pattuglie: {
        Row: {
          id: string
          nome: string
        }
        Insert: {
          id?: string
          nome: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      quote_mensili: {
        Row: {
          anno_scout: string
          importo_mensile: number | null
          data_contabile: string | null
          aprile: boolean | null
          dicembre: boolean | null
          febbraio: boolean | null
          gennaio: boolean | null
          giugno: boolean | null
          id: string
          maggio: boolean | null
          marzo: boolean | null
          novembre: boolean | null
          ragazzo_id: string | null
        }
        Insert: {
          anno_scout: string
          importo_mensile?: number | null
          data_contabile?: string | null
          aprile?: boolean | null
          dicembre?: boolean | null
          febbraio?: boolean | null
          gennaio?: boolean | null
          giugno?: boolean | null
          id?: string
          maggio?: boolean | null
          marzo?: boolean | null
          novembre?: boolean | null
          ragazzo_id?: string | null
        }
        Update: {
          anno_scout?: string
          importo_mensile?: number | null
          data_contabile?: string | null
          aprile?: boolean | null
          dicembre?: boolean | null
          febbraio?: boolean | null
          gennaio?: boolean | null
          giugno?: boolean | null
          id?: string
          maggio?: boolean | null
          marzo?: boolean | null
          novembre?: boolean | null
          ragazzo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_mensili_ragazzo_id_fkey"
            columns: ["ragazzo_id"]
            isOneToOne: false
            referencedRelation: "ragazzi"
            referencedColumns: ["id"]
          },
        ]
      }
      documenti_annuali: {
        Row: { anno_scout: string; kind: string; id: string; dati: Json; file_url: string | null; created_at: string; updated_at: string }
        Insert: { anno_scout: string; kind: string; id: string; dati: Json; file_url?: string | null; created_at?: string; updated_at?: string }
        Update: { anno_scout?: string; kind?: string; id?: string; dati?: Json; file_url?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      roster_anni: {
        Row: { anno_scout: string; copied_from: string | null; created_at: string }
        Insert: { anno_scout: string; copied_from?: string | null; created_at?: string }
        Update: { anno_scout?: string; copied_from?: string | null; created_at?: string }
        Relationships: []
      }
      ragazzi_anni: {
        Row: { ragazzo_id: string; anno_scout: string; snapshot: Json; attivo: boolean; copied_from: string | null; created_at: string; updated_at: string }
        Insert: { ragazzo_id: string; anno_scout: string; snapshot: Json; attivo?: boolean; copied_from?: string | null; created_at?: string; updated_at?: string }
        Update: { ragazzo_id?: string; anno_scout?: string; snapshot?: Json; attivo?: boolean; copied_from?: string | null; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "ragazzi_anni_ragazzo_id_fkey"; columns: ["ragazzo_id"]; isOneToOne: false; referencedRelation: "ragazzi"; referencedColumns: ["id"] }]
      }
      ragazzi: {
        Row: {
          stati_documenti: Json | null
          attivo: boolean | null
          codice_censimento: string | null
          codice_fiscale: string | null
          cognome: string
          data_nascita: string | null
          foglio_privacy_firmato: boolean | null
          partecipazione_ci: boolean | null
          scheda_medica_ci: boolean | null
          partecipazione_ce: boolean | null
          scheda_medica_ce: boolean | null
          quota_censimento: boolean | null
          ricevuta_censimento: boolean | null
          id: string
          genitore_1_nome: string | null
          genitore_1_telefono: string | null
          genitore_1_email: string | null
          genitore_1_codice_fiscale: string | null
          genitore_2_nome: string | null
          genitore_2_telefono: string | null
          genitore_2_email: string | null
          genitore_2_codice_fiscale: string | null
          nome: string
          note_sanitarie: string | null
          pattuglia: string | null
          residenza: string | null
          sesso: string | null
          telefono_ragazzo: string | null
          importo_censimento: number | null
        }
        Insert: {
          stati_documenti?: Json | null
          attivo?: boolean | null
          codice_censimento?: string | null
          codice_fiscale?: string | null
          cognome: string
          data_nascita?: string | null
          foglio_privacy_firmato?: boolean | null
          partecipazione_ci?: boolean | null
          scheda_medica_ci?: boolean | null
          partecipazione_ce?: boolean | null
          scheda_medica_ce?: boolean | null
          quota_censimento?: boolean | null
          ricevuta_censimento?: boolean | null
          id?: string
          genitore_1_nome?: string | null
          genitore_1_telefono?: string | null
          genitore_1_email?: string | null
          genitore_1_codice_fiscale?: string | null
          genitore_2_nome?: string | null
          genitore_2_telefono?: string | null
          genitore_2_email?: string | null
          genitore_2_codice_fiscale?: string | null
          nome: string
          note_sanitarie?: string | null
          pattuglia?: string | null
          residenza?: string | null
          sesso?: string | null
          telefono_ragazzo?: string | null
          importo_censimento?: number | null
        }
        Update: {
          stati_documenti?: Json | null
          attivo?: boolean | null
          codice_censimento?: string | null
          codice_fiscale?: string | null
          cognome?: string
          data_nascita?: string | null
          foglio_privacy_firmato?: boolean | null
          partecipazione_ci?: boolean | null
          scheda_medica_ci?: boolean | null
          partecipazione_ce?: boolean | null
          scheda_medica_ce?: boolean | null
          quota_censimento?: boolean | null
          ricevuta_censimento?: boolean | null
          id?: string
          genitore_1_nome?: string | null
          genitore_1_telefono?: string | null
          genitore_1_email?: string | null
          genitore_1_codice_fiscale?: string | null
          genitore_2_nome?: string | null
          genitore_2_telefono?: string | null
          genitore_2_email?: string | null
          genitore_2_codice_fiscale?: string | null
          nome?: string
          note_sanitarie?: string | null
          pattuglia?: string | null
          residenza?: string | null
          sesso?: string | null
          telefono_ragazzo?: string | null
          importo_censimento?: number | null
        }
        Relationships: []
      }
      prove_bonifico: {
        Row: {
          movimento_id: string
          ragazzo_id: string
          movement_amount: number
          movement_date: string
          path: string
          filename: string
          parent: number
          payer: string
          amount: number
          date: string | null
          confirmed: boolean
          created_at: string
        }
        Insert: {
          movimento_id?: string
          ragazzo_id?: string
          movement_amount?: number
          movement_date?: string
          path?: string
          filename?: string
          parent?: number
          payer?: string
          amount?: number
          date?: string | null
          confirmed?: boolean
          created_at?: string
        }
        Update: {
          movimento_id?: string
          ragazzo_id?: string
          movement_amount?: number
          movement_date?: string
          path?: string
          filename?: string
          parent?: number
          payer?: string
          amount?: number
          date?: string | null
          confirmed?: boolean
          created_at?: string
        }
        Relationships: []
      }
      ricevute_emesse: {
        Row: {
          id: string
          numero: number
          anno: string
          snapshot: Json
          created_at: string
          created_by: string
          pdf_path: string | null
        }
        Insert: {
          id?: string
          numero?: number
          anno?: string
          snapshot?: Json
          created_at?: string
          created_by?: string
          pdf_path?: string | null
        }
        Update: {
          id?: string
          numero?: number
          anno?: string
          snapshot?: Json
          created_at?: string
          created_by?: string
          pdf_path?: string | null
        }
        Relationships: []
      }
      ricevute_movimenti: {
        Row: {
          movimento_id: string
          ricevuta_id: string
        }
        Insert: {
          movimento_id?: string
          ricevuta_id?: string
        }
        Update: {
          movimento_id?: string
          ricevuta_id?: string
        }
        Relationships: []
      }
      ricevute_config: {
        Row: {
          id: string
          valore: Json
        }
        Insert: {
          id?: string
          valore?: Json
        }
        Update: {
          id?: string
          valore?: Json
        }
        Relationships: []
      }
      ricevute_invio: {
        Row: {
          ricevuta_id: string
          stato: string
          email: string
          message_id: string | null
          updated_at: string
        }
        Insert: {
          ricevuta_id?: string
          stato?: string
          email?: string
          message_id?: string | null
          updated_at?: string
        }
        Update: {
          ricevuta_id?: string
          stato?: string
          email?: string
          message_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gmail_connection: {
        Row: {
          id: string
          token: string
          email: string
        }
        Insert: {
          id?: string
          token?: string
          email?: string
        }
        Update: {
          id?: string
          token?: string
          email?: string
        }
        Relationships: []
      }
      anticipi_capi: { Row: import('@/lib/staffAdvances/model').StaffExpense; Insert: import('@/lib/staffAdvances/model').StaffExpense; Update: Partial<import('@/lib/staffAdvances/model').StaffExpense>; Relationships: [] }
      quote_anticipi_capi: { Row: import('@/lib/staffAdvances/model').StaffQuota; Insert: import('@/lib/staffAdvances/model').StaffQuota; Update: Partial<import('@/lib/staffAdvances/model').StaffQuota>; Relationships: [] }
      restituzioni_capi: { Row: import('@/lib/staffAdvances/model').StaffReturn; Insert: import('@/lib/staffAdvances/model').StaffReturn; Update: Partial<import('@/lib/staffAdvances/model').StaffReturn>; Relationships: [] }
      rimborsi: {
        Row: import('@/lib/reimbursements/model').Reimbursement & {file_path:string|null;fingerprint:string;validated_by:string|null;cancelled_by:string|null;cancelled_at:string|null}
        Insert: {id:string;created_by:string;created_by_name:string;beneficiary_id:string;beneficiary_name:string;anno_scout:string;data_spesa:string;importo:number;categoria:string;momento_anno:string;note?:string;file_path?:string|null;file_name?:string|null;fingerprint:string}
        Update: {stato?:string;cancelled_by?:string;cancelled_at?:string}
        Relationships: []
      }
      registro_spese: {
        Row: {
          anticipo_capi_id: string | null
          rimborso_id: string | null
          data: string | null
          foto_scontrino_url: string | null
          id: string
          importo: number
          metodo: string | null
          momento_anno: string | null
          note: string | null
          numero_operazione: number
          ricevuta_presente: boolean | null
          voce_spesa: string | null
          tipo_movimento: string | null
          ragazzo_id: string | null
          riferimento_quota: string | null
          riferimento_censimento_anno: string | null
          quota_mensile_id: string | null
          partecipazione_evento_id: string | null
        }
        Insert: {
          anticipo_capi_id?: string | null
          rimborso_id?: string | null
          data?: string | null
          foto_scontrino_url?: string | null
          id?: string
          importo: number
          metodo?: string | null
          momento_anno?: string | null
          note?: string | null
          numero_operazione?: number
          ricevuta_presente?: boolean | null
          voce_spesa?: string | null
          tipo_movimento?: string | null
          ragazzo_id?: string | null
          riferimento_quota?: string | null
          riferimento_censimento_anno?: string | null
          quota_mensile_id?: string | null
          partecipazione_evento_id?: string | null
        }
        Update: {
          anticipo_capi_id?: string | null
          rimborso_id?: string | null
          data?: string | null
          foto_scontrino_url?: string | null
          id?: string
          importo?: number
          metodo?: string | null
          momento_anno?: string | null
          note?: string | null
          numero_operazione?: number
          ricevuta_presente?: boolean | null
          voce_spesa?: string | null
          tipo_movimento?: string | null
          ragazzo_id?: string | null
          riferimento_quota?: string | null
          riferimento_censimento_anno?: string | null
          quota_mensile_id?: string | null
          partecipazione_evento_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_staff_advance: {Args:{p_actor:string;p_actor_name:string;p_expense:Json;p_shares:Json};Returns:string}
      record_staff_return: {Args:{p_id:string;p_quota:string;p_actor:string;p_actor_name:string;p_amount:number;p_date:string;p_method:string};Returns:string}
      confirm_reimbursement: {Args:{p_id:string;p_actor:string;p_actor_name:string;p_date:string;p_method:string};Returns:string}

      reset_year_data: { Args: { p_year: string; p_target: string }; Returns: Json }
      ensure_roster_year: { Args: { p_year: string }; Returns: number }
      write_annual_boy: { Args: { p_year: string; p_id: string | null; p_changes: Json; p_census_method?: string; p_census_date?: string }; Returns: Json }
      import_roster_year: { Args: { p_year: string; p_rows: Json; p_mode: string }; Returns: number }
      issue_payment_receipt: { Args: { p_snapshot: Json; p_ids: string[]; p_actor: string }; Returns: Json }
      attach_payment_proof: { Args: { p_ids: string[]; p_proof: Json }; Returns: number }
      import_roster: { Args: { p_rows: Json; p_mode: string }; Returns: number }

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
