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
      ragazzi: {
        Row: {
          attivo: boolean | null
          cognome: string
          foglio_privacy_firmato: boolean | null
          partecipazione_ci: boolean | null
          scheda_medica_ci: boolean | null
          partecipazione_ce: boolean | null
          scheda_medica_ce: boolean | null
          quota_censimento: boolean | null
          ricevuta_censimento: boolean | null
          id: string
          nome: string
          pattuglia: string | null
          sesso: string | null
          importo_censimento: number | null
        }
        Insert: {
          attivo?: boolean | null
          cognome: string
          foglio_privacy_firmato?: boolean | null
          partecipazione_ci?: boolean | null
          scheda_medica_ci?: boolean | null
          partecipazione_ce?: boolean | null
          scheda_medica_ce?: boolean | null
          quota_censimento?: boolean | null
          ricevuta_censimento?: boolean | null
          id?: string
          nome: string
          pattuglia?: string | null
          sesso?: string | null
          importo_censimento?: number | null
        }
        Update: {
          attivo?: boolean | null
          cognome?: string
          foglio_privacy_firmato?: boolean | null
          partecipazione_ci?: boolean | null
          scheda_medica_ci?: boolean | null
          partecipazione_ce?: boolean | null
          scheda_medica_ce?: boolean | null
          quota_censimento?: boolean | null
          ricevuta_censimento?: boolean | null
          id?: string
          nome?: string
          pattuglia?: string | null
          sesso?: string | null
          importo_censimento?: number | null
        }
        Relationships: []
      }
      registro_spese: {
        Row: {
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
          quota_mensile_id: string | null
          partecipazione_evento_id: string | null
        }
        Insert: {
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
          quota_mensile_id?: string | null
          partecipazione_evento_id?: string | null
        }
        Update: {
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
      [_ in never]: never
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
