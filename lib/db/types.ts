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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_runs: {
        Row: {
          actor_id: string | null
          created_at: string
          fallback: boolean
          id: number
          input_hash: string | null
          latency_ms: number | null
          model: string | null
          org_id: string
          output: Json | null
          reason: string | null
          task: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          fallback?: boolean
          id?: never
          input_hash?: string | null
          latency_ms?: number | null
          model?: string | null
          org_id: string
          output?: Json | null
          reason?: string | null
          task: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          fallback?: boolean
          id?: never
          input_hash?: string | null
          latency_ms?: number | null
          model?: string | null
          org_id?: string
          output?: Json | null
          reason?: string | null
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      askers: {
        Row: {
          background: string | null
          codes_revealed: number
          created_at: string
          language: string
          org_id: string
          pseudonym: string
          return_code_hash: string
          user_id: string
        }
        Insert: {
          background?: string | null
          codes_revealed?: number
          created_at?: string
          language?: string
          org_id: string
          pseudonym: string
          return_code_hash: string
          user_id: string
        }
        Update: {
          background?: string | null
          codes_revealed?: number
          created_at?: string
          language?: string
          org_id?: string
          pseudonym?: string
          return_code_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "askers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      availability: {
        Row: {
          booked: boolean
          daee_id: string
          id: string
          slot_at: string
        }
        Insert: {
          booked?: boolean
          daee_id: string
          id?: string
          slot_at: string
        }
        Update: {
          booked?: boolean
          daee_id?: string
          id?: string
          slot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_daee_id_fkey"
            columns: ["daee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      bookings: {
        Row: {
          asker_id: string
          created_at: string
          daee_id: string
          id: string
          slot_at: string
          status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          asker_id: string
          created_at?: string
          daee_id: string
          id?: string
          slot_at: string
          status?: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          asker_id?: string
          created_at?: string
          daee_id?: string
          id?: string
          slot_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bookings_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "askers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_daee_id_fkey"
            columns: ["daee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      card_access: {
        Row: {
          card_id: string
          until: string
          viewer_id: string
        }
        Insert: {
          card_id: string
          until: string
          viewer_id: string
        }
        Update: {
          card_id?: string
          until?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_access_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_access_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cards: {
        Row: {
          accept_substitute: boolean
          ai_draft: Json | null
          approved_at: string | null
          asker_id: string
          conversation_id: string | null
          covered: string | null
          created_at: string
          deleted_at: string | null
          edited_major: boolean
          expires_at: string | null
          field_sources: Json
          follow_up: string | null
          generated_by: Database["public"]["Enums"]["card_origin"]
          id: string
          next_step: string | null
          origin: string
          preferred_daee: string | null
          remaining: string | null
          scope: string
          source_card_ids: string[]
          source_message_ids: string[]
          status: Database["public"]["Enums"]["card_status"]
          version: number
          visibility: string
        }
        Insert: {
          accept_substitute?: boolean
          ai_draft?: Json | null
          approved_at?: string | null
          asker_id: string
          conversation_id?: string | null
          covered?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_major?: boolean
          expires_at?: string | null
          field_sources?: Json
          follow_up?: string | null
          generated_by: Database["public"]["Enums"]["card_origin"]
          id?: string
          next_step?: string | null
          origin?: string
          preferred_daee?: string | null
          remaining?: string | null
          scope?: string
          source_card_ids?: string[]
          source_message_ids?: string[]
          status?: Database["public"]["Enums"]["card_status"]
          version?: number
          visibility?: string
        }
        Update: {
          accept_substitute?: boolean
          ai_draft?: Json | null
          approved_at?: string | null
          asker_id?: string
          conversation_id?: string | null
          covered?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_major?: boolean
          expires_at?: string | null
          field_sources?: Json
          follow_up?: string | null
          generated_by?: Database["public"]["Enums"]["card_origin"]
          id?: string
          next_step?: string | null
          origin?: string
          preferred_daee?: string | null
          remaining?: string | null
          scope?: string
          source_card_ids?: string[]
          source_message_ids?: string[]
          status?: Database["public"]["Enums"]["card_status"]
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "askers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cards_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_preferred_daee_fkey"
            columns: ["preferred_daee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversation_readings: {
        Row: {
          conversation_id: string
          created_at: string
          id: number
          items: Json
          need_hash: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: never
          items: Json
          need_hash?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: never
          items?: Json
          need_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_readings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          asker_id: string
          assigned_at: string | null
          card_id: string | null
          classified_by: string | null
          created_at: string
          daee_id: string | null
          depth: Database["public"]["Enums"]["depth_level"] | null
          ended_at: string | null
          followup_card_accurate: boolean | null
          followup_mode: string | null
          followup_sufficient: boolean | null
          guide_summary: string | null
          id: string
          intake_id: string | null
          level: string | null
          match_quality: string | null
          match_reasons: Json | null
          org_id: string
          preferred_daee_id: string | null
          previous_conversation_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["conv_status"]
          topic: string | null
        }
        Insert: {
          asker_id: string
          assigned_at?: string | null
          card_id?: string | null
          classified_by?: string | null
          created_at?: string
          daee_id?: string | null
          depth?: Database["public"]["Enums"]["depth_level"] | null
          ended_at?: string | null
          followup_card_accurate?: boolean | null
          followup_mode?: string | null
          followup_sufficient?: boolean | null
          guide_summary?: string | null
          id?: string
          intake_id?: string | null
          level?: string | null
          match_quality?: string | null
          match_reasons?: Json | null
          org_id: string
          preferred_daee_id?: string | null
          previous_conversation_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["conv_status"]
          topic?: string | null
        }
        Update: {
          asker_id?: string
          assigned_at?: string | null
          card_id?: string | null
          classified_by?: string | null
          created_at?: string
          daee_id?: string | null
          depth?: Database["public"]["Enums"]["depth_level"] | null
          ended_at?: string | null
          followup_card_accurate?: boolean | null
          followup_mode?: string | null
          followup_sufficient?: boolean | null
          guide_summary?: string | null
          id?: string
          intake_id?: string | null
          level?: string | null
          match_quality?: string | null
          match_reasons?: Json | null
          org_id?: string
          preferred_daee_id?: string | null
          previous_conversation_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["conv_status"]
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "askers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_daee_id_fkey"
            columns: ["daee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversations_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_preferred_daee_id_fkey"
            columns: ["preferred_daee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversations_previous_conversation_id_fkey"
            columns: ["previous_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor_role: string | null
          conversation_id: string | null
          created_at: string
          id: number
          meta: Json
          org_id: string
          type: string
        }
        Insert: {
          actor_role?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          org_id: string
          type: string
        }
        Update: {
          actor_role?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          org_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intakes: {
        Row: {
          asker_id: string
          created_at: string
          depth: Database["public"]["Enums"]["depth_level"] | null
          generated_by: Database["public"]["Enums"]["card_origin"]
          id: string
          language: string | null
          raw_text: string | null
          routing_result: Json | null
          status: Database["public"]["Enums"]["intake_status"]
          topic: string | null
          transcript: Json
        }
        Insert: {
          asker_id: string
          created_at?: string
          depth?: Database["public"]["Enums"]["depth_level"] | null
          generated_by?: Database["public"]["Enums"]["card_origin"]
          id?: string
          language?: string | null
          raw_text?: string | null
          routing_result?: Json | null
          status?: Database["public"]["Enums"]["intake_status"]
          topic?: string | null
          transcript?: Json
        }
        Update: {
          asker_id?: string
          created_at?: string
          depth?: Database["public"]["Enums"]["depth_level"] | null
          generated_by?: Database["public"]["Enums"]["card_origin"]
          id?: string
          language?: string | null
          raw_text?: string | null
          routing_result?: Json | null
          status?: Database["public"]["Enums"]["intake_status"]
          topic?: string | null
          transcript?: Json
        }
        Relationships: [
          {
            foreignKeyName: "intakes_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "askers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      library_items: {
        Row: {
          asker_ok: boolean
          body: string
          cited_text: string | null
          created_at: string
          id: string
          item_key: string | null
          language: string
          level: string
          need_hash: string | null
          org_id: string
          passage_hash: string | null
          source_name: string
          source_url: string
          title: string
          topic: string
          verified_by: string
        }
        Insert: {
          asker_ok?: boolean
          body: string
          cited_text?: string | null
          created_at?: string
          id?: string
          item_key?: string | null
          language: string
          level: string
          need_hash?: string | null
          org_id: string
          passage_hash?: string | null
          source_name: string
          source_url: string
          title: string
          topic: string
          verified_by?: string
        }
        Update: {
          asker_ok?: boolean
          body?: string
          cited_text?: string | null
          created_at?: string
          id?: string
          item_key?: string | null
          language?: string
          level?: string
          need_hash?: string | null
          org_id?: string
          passage_hash?: string | null
          source_name?: string
          source_url?: string
          title?: string
          topic?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          ai_enabled: boolean
          created_at: string
          hours: string | null
          id: string
          languages: string[]
          name: string
          return_code_salt: string
          wait_alert_minutes: number
        }
        Insert: {
          ai_enabled?: boolean
          created_at?: string
          hours?: string | null
          id?: string
          languages?: string[]
          name: string
          return_code_salt?: string
          wait_alert_minutes?: number
        }
        Update: {
          ai_enabled?: boolean
          created_at?: string
          hours?: string | null
          id?: string
          languages?: string[]
          name?: string
          return_code_salt?: string
          wait_alert_minutes?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          capacity: number
          created_at: string
          display_name: string
          languages: string[]
          last_seen: string
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["presence"]
          topics: string[]
          user_id: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          display_name: string
          languages?: string[]
          last_seen?: string
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["presence"]
          topics?: string[]
          user_id: string
        }
        Update: {
          capacity?: number
          created_at?: string
          display_name?: string
          languages?: string[]
          last_seen?: string
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["presence"]
          topics?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      return_attempts: {
        Row: {
          failed_count: number
          locked_until: string | null
          org_id: string
          pseudonym_key: string
          window_started_at: string
        }
        Insert: {
          failed_count?: number
          locked_until?: string | null
          org_id: string
          pseudonym_key: string
          window_started_at?: string
        }
        Update: {
          failed_count?: number
          locked_until?: string | null
          org_id?: string
          pseudonym_key?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_attempts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      source_pages: {
        Row: {
          domain: string
          fetched_at: string
          title: string | null
          url: string
        }
        Insert: {
          domain: string
          fetched_at?: string
          title?: string | null
          url: string
        }
        Update: {
          domain?: string
          fetched_at?: string
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          card_id: string | null
          conversation_id: string
          created_at: string
          from_daee: string
          id: string
          requeued_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_daee: string
        }
        Insert: {
          card_id?: string | null
          conversation_id: string
          created_at?: string
          from_daee: string
          id?: string
          requeued_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_daee: string
        }
        Update: {
          card_id?: string | null
          conversation_id?: string
          created_at?: string
          from_daee?: string
          id?: string
          requeued_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_daee?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_daee_fkey"
            columns: ["from_daee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transfers_to_daee_fkey"
            columns: ["to_daee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_ai_health: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_alerts: { Args: { threshold_minutes?: number }; Returns: Json }
      admin_comparison: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_kpis: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_ops_snapshot: { Args: never; Returns: Json }
      admin_org: { Args: never; Returns: string }
      assign_conversation: {
        Args: { conv: string; d: string }
        Returns: undefined
      }
      assign_waiting_for: { Args: { d: string }; Returns: number }
      can_view_card: { Args: { c: string }; Returns: boolean }
      card_sources: {
        Args: { card: string }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_role: string
        }[]
      }
      complete_transfer: { Args: { t: string }; Returns: boolean }
      correct_topic: { Args: { conv: string; p_topic: string }; Returns: Json }
      delete_card: { Args: { conv: string }; Returns: number }
      delete_master_card: { Args: never; Returns: number }
      do_transfer: { Args: { t: string }; Returns: undefined }
      end_conversation: { Args: { conv: string }; Returns: undefined }
      expire_stale_presence: { Args: never; Returns: number }
      grant_next_daee_cards: {
        Args: { conv: string; d: string }
        Returns: undefined
      }
      is_active_staff: { Args: { uid: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_asker: { Args: never; Returns: boolean }
      is_daee: { Args: never; Returns: boolean }
      me_active: { Args: never; Returns: boolean }
      my_role: { Args: never; Returns: string }
      open_conversation_count: { Args: { d: string }; Returns: number }
      presence_fresh: { Args: { ts: string }; Returns: boolean }
      presence_heartbeat: {
        Args: never
        Returns: Database["public"]["Enums"]["presence"]
      }
      public_availability: { Args: { p_language: string }; Returns: number }
      purge_inactive_cards: { Args: never; Returns: number }
      queue_position: { Args: { conv: string }; Returns: number }
      rate_followup: {
        Args: { card_accurate: boolean; conv: string; sufficient: boolean }
        Returns: undefined
      }
      record_return_failure: {
        Args: { p_key: string; p_org: string }
        Returns: string
      }
      release_daee_conversations: { Args: { d: string }; Returns: number }
      relink_asker: {
        Args: { new_id: string; old_id: string }
        Returns: undefined
      }
      requeue_transfer: { Args: { t: string }; Returns: string }
      route_conversation: {
        Args: {
          conv: string
          p_depth?: Database["public"]["Enums"]["depth_level"]
          p_topic?: string
        }
        Returns: Json
      }
      sample_rate: { Args: { n: number; part: number }; Returns: number }
      set_presence: {
        Args: { p_status: Database["public"]["Enums"]["presence"] }
        Returns: number
      }
      transfer_candidates: {
        Args: { conv: string }
        Returns: {
          capacity: number
          display_name: string
          open: number
          user_id: string
        }[]
      }
      transfer_conversation: {
        Args: { ask_card?: boolean; conv: string; to_daee: string }
        Returns: string
      }
      transfer_target_available: { Args: { t: string }; Returns: boolean }
    }
    Enums: {
      booking_status: "requested" | "confirmed" | "cancelled" | "done"
      card_origin: "ai" | "manual"
      card_status: "draft" | "daee_reviewed" | "approved" | "expired"
      conv_status: "waiting" | "active" | "transferred" | "ended"
      depth_level: "intro" | "explain" | "detailed"
      intake_status: "draft" | "classified" | "routed" | "abandoned"
      presence: "available" | "busy" | "offline"
      transfer_status: "pending" | "accepted" | "declined"
      user_role: "admin" | "daee"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      booking_status: ["requested", "confirmed", "cancelled", "done"],
      card_origin: ["ai", "manual"],
      card_status: ["draft", "daee_reviewed", "approved", "expired"],
      conv_status: ["waiting", "active", "transferred", "ended"],
      depth_level: ["intro", "explain", "detailed"],
      intake_status: ["draft", "classified", "routed", "abandoned"],
      presence: ["available", "busy", "offline"],
      transfer_status: ["pending", "accepted", "declined"],
      user_role: ["admin", "daee"],
    },
  },
} as const
