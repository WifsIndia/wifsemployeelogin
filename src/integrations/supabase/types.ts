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
      announcements: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          message: string
          published_at: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          published_at?: string
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          published_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          check_in_accuracy: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_accuracy: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string
          day_status: string | null
          early_departure_minutes: number | null
          employee_id: string
          id: string
          late_minutes: number | null
          office_location_id: string | null
          overtime_minutes: number | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          worked_minutes: number | null
        }
        Insert: {
          attendance_date?: string
          check_in_accuracy?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_accuracy?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string
          day_status?: string | null
          early_departure_minutes?: number | null
          employee_id: string
          id?: string
          late_minutes?: number | null
          office_location_id?: string | null
          overtime_minutes?: number | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          worked_minutes?: number | null
        }
        Update: {
          attendance_date?: string
          check_in_accuracy?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_accuracy?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string
          day_status?: string | null
          early_departure_minutes?: number | null
          employee_id?: string
          id?: string
          late_minutes?: number | null
          office_location_id?: string | null
          overtime_minutes?: number | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          worked_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_office_location_id_fkey"
            columns: ["office_location_id"]
            isOneToOne: false
            referencedRelation: "office_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      daily_work_logs: {
        Row: {
          created_at: string
          employee_id: string
          hours_worked: number | null
          id: string
          log_date: string
          notes: string | null
          status: string | null
          summary: string
          task_id: string | null
          updated_at: string
          work_completed: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          status?: string | null
          summary: string
          task_id?: string | null
          updated_at?: string
          work_completed?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          status?: string | null
          summary?: string
          task_id?: string | null
          updated_at?: string
          work_completed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_work_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_work_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      document_folders: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string | null
          created_at: string
          employee_id: string | null
          file_path: string
          folder_id: string | null
          id: string
          mime_type: string | null
          name: string
          size_bytes: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          employee_id?: string | null
          file_path: string
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          employee_id?: string | null
          file_path?: string
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_compensation: {
        Row: {
          account_holder: string | null
          account_number: string | null
          allowances: number
          bank_name: string | null
          basic_salary: number
          bond: string | null
          deductions: number
          employee_id: string
          employment_description: string | null
          ifsc: string | null
          paid_leave_allowance: number | null
          payment_mode: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          allowances?: number
          bank_name?: string | null
          basic_salary?: number
          bond?: string | null
          deductions?: number
          employee_id: string
          employment_description?: string | null
          ifsc?: string | null
          paid_leave_allowance?: number | null
          payment_mode?: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          allowances?: number
          bank_name?: string | null
          basic_salary?: number
          bond?: string | null
          deductions?: number
          employee_id?: string
          employment_description?: string | null
          ifsc?: string | null
          paid_leave_allowance?: number | null
          payment_mode?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_locations: {
        Row: {
          created_at: string
          location_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          location_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          location_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "office_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          active: boolean
          created_at: string
          holiday_date: string
          holiday_type: string
          id: string
          location_id: string | null
          mandatory: boolean
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          holiday_date: string
          holiday_type?: string
          id?: string
          location_id?: string | null
          mandatory?: boolean
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          holiday_date?: string
          holiday_type?: string
          id?: string
          location_id?: string | null
          mandatory?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "office_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policies: {
        Row: {
          active: boolean
          allow_half_day: boolean
          approver: string
          carry_forward: boolean
          days_per_year: number
          is_paid: boolean
          label: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          max_carry_forward: number
          min_notice_days: number
          requires_approval: boolean
        }
        Insert: {
          active?: boolean
          allow_half_day?: boolean
          approver?: string
          carry_forward?: boolean
          days_per_year?: number
          is_paid?: boolean
          label: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          max_carry_forward?: number
          min_notice_days?: number
          requires_approval?: boolean
        }
        Update: {
          active?: boolean
          allow_half_day?: boolean
          approver?: string
          carry_forward?: boolean
          days_per_year?: number
          is_paid?: boolean
          label?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          max_carry_forward?: number
          min_notice_days?: number
          requires_approval?: boolean
        }
        Relationships: []
      }
      leave_policy_sets: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          notify_user_ids: string[]
          updated_at: string
          working_days: number[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notify_user_ids?: string[]
          updated_at?: string
          working_days?: number[]
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notify_user_ids?: string[]
          updated_at?: string
          working_days?: number[]
        }
        Relationships: []
      }
      leave_policy_types: {
        Row: {
          active: boolean
          allow_half_day: boolean
          approver: string
          base_type: Database["public"]["Enums"]["leave_type"] | null
          carry_forward: boolean
          created_at: string
          days_per_year: number
          id: string
          is_paid: boolean
          max_carry_forward: number
          min_notice_days: number
          name: string
          policy_id: string
          requires_approval: boolean
        }
        Insert: {
          active?: boolean
          allow_half_day?: boolean
          approver?: string
          base_type?: Database["public"]["Enums"]["leave_type"] | null
          carry_forward?: boolean
          created_at?: string
          days_per_year?: number
          id?: string
          is_paid?: boolean
          max_carry_forward?: number
          min_notice_days?: number
          name: string
          policy_id: string
          requires_approval?: boolean
        }
        Update: {
          active?: boolean
          allow_half_day?: boolean
          approver?: string
          base_type?: Database["public"]["Enums"]["leave_type"] | null
          carry_forward?: boolean
          created_at?: string
          days_per_year?: number
          id?: string
          is_paid?: boolean
          max_carry_forward?: number
          min_notice_days?: number
          name?: string
          policy_id?: string
          requires_approval?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "leave_policy_types_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "leave_policy_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number | null
          employee_id: string
          end_date: string
          half_day: boolean
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          days?: number | null
          employee_id: string
          end_date: string
          half_day?: boolean
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number | null
          employee_id?: string
          end_date?: string
          half_day?: boolean
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_locations: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          pin_code: string | null
          radius_meters: number
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          pin_code?: string | null
          radius_meters?: number
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          pin_code?: string | null
          radius_meters?: number
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      organization_settings: {
        Row: {
          address: string | null
          audit_retention_days: number
          auto_mark_early_departure: boolean
          auto_mark_late: boolean
          city: string | null
          country: string | null
          currency: string
          date_format: string
          early_departure_grace_minutes: number
          email: string | null
          full_day_hours: number
          grace_minutes: number
          half_day_hours: number
          id: boolean
          logo_url: string | null
          name: string
          office_end: string
          office_start: string
          overtime_after_minutes: number
          overtime_enabled: boolean
          phone: string | null
          pin_code: string | null
          require_gps: boolean
          salary_divisor_mode: string
          salary_fixed_divisor: number
          state: string | null
          timezone: string
          updated_at: string
          website: string | null
          working_days: number[]
        }
        Insert: {
          address?: string | null
          audit_retention_days?: number
          auto_mark_early_departure?: boolean
          auto_mark_late?: boolean
          city?: string | null
          country?: string | null
          currency?: string
          date_format?: string
          early_departure_grace_minutes?: number
          email?: string | null
          full_day_hours?: number
          grace_minutes?: number
          half_day_hours?: number
          id?: boolean
          logo_url?: string | null
          name?: string
          office_end?: string
          office_start?: string
          overtime_after_minutes?: number
          overtime_enabled?: boolean
          phone?: string | null
          pin_code?: string | null
          require_gps?: boolean
          salary_divisor_mode?: string
          salary_fixed_divisor?: number
          state?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
          working_days?: number[]
        }
        Update: {
          address?: string | null
          audit_retention_days?: number
          auto_mark_early_departure?: boolean
          auto_mark_late?: boolean
          city?: string | null
          country?: string | null
          currency?: string
          date_format?: string
          early_departure_grace_minutes?: number
          email?: string | null
          full_day_hours?: number
          grace_minutes?: number
          half_day_hours?: number
          id?: boolean
          logo_url?: string | null
          name?: string
          office_end?: string
          office_start?: string
          overtime_after_minutes?: number
          overtime_enabled?: boolean
          phone?: string | null
          pin_code?: string | null
          require_gps?: boolean
          salary_divisor_mode?: string
          salary_fixed_divisor?: number
          state?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
          working_days?: number[]
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          breakdown: Json
          employee_id: string
          finalized_at: string | null
          finalized_by: string | null
          generated_at: string
          generated_by: string | null
          gross_salary: number
          id: string
          month: string
          net_salary: number
          status: string
          total_deductions: number
        }
        Insert: {
          breakdown?: Json
          employee_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          generated_at?: string
          generated_by?: string | null
          gross_salary?: number
          id?: string
          month: string
          net_salary?: number
          status?: string
          total_deductions?: number
        }
        Update: {
          breakdown?: Json
          employee_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          generated_at?: string
          generated_by?: string | null
          gross_salary?: number
          id?: string
          month?: string
          net_salary?: number
          status?: string
          total_deductions?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          custom_role_id: string | null
          department_id: string | null
          designation: string | null
          email: string
          employee_code: string | null
          employment_type: string
          full_name: string
          id: string
          joining_date: string | null
          leave_policy_id: string | null
          location_id: string | null
          manager_id: string | null
          phone: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          custom_role_id?: string | null
          department_id?: string | null
          designation?: string | null
          email?: string
          employee_code?: string | null
          employment_type?: string
          full_name?: string
          id: string
          joining_date?: string | null
          leave_policy_id?: string | null
          location_id?: string | null
          manager_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          custom_role_id?: string | null
          department_id?: string | null
          designation?: string | null
          email?: string
          employee_code?: string | null
          employment_type?: string
          full_name?: string
          id?: string
          joining_date?: string | null
          leave_policy_id?: string | null
          location_id?: string | null
          manager_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_leave_policy_id_fkey"
            columns: ["leave_policy_id"]
            isOneToOne: false
            referencedRelation: "leave_policy_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "office_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          module: string
          role_id: string
        }
        Insert: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          module: string
          role_id: string
        }
        Update: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          module?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          active: boolean
          base_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          active?: boolean
          base_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          active?: boolean
          base_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_id: string
          comment: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          comment: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          comment?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          actor_id: string | null
          change: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          change: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          actor_id?: string | null
          change?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          progress: number
          project_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          project_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          project_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      useful_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          roles: Database["public"]["Enums"]["app_role"][]
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          roles?: Database["public"]["Enums"]["app_role"][]
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          roles?: Database["public"]["Enums"]["app_role"][]
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "useful_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_companies: {
        Row: {
          company_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_companies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authorized_office_for: {
        Args: { _lat: number; _lon: number; _uid: string }
        Returns: {
          dist: number
          office_id: string
        }[]
      }
      calculate_payroll: { Args: { _month: string }; Returns: Json[] }
      calculate_salary: {
        Args: { _employee: string; _month: string }
        Returns: Json
      }
      can_access_company: {
        Args: { _actor: string; _company: string }
        Returns: boolean
      }
      can_assign_leave_policy: {
        Args: { _actor: string; _target: string }
        Returns: boolean
      }
      can_manage_employee_docs: {
        Args: { _actor: string; _emp: string }
        Returns: boolean
      }
      can_manage_leave_policies: { Args: { _actor: string }; Returns: boolean }
      can_manage_locations: {
        Args: { _actor: string; _target: string }
        Returns: boolean
      }
      can_manage_payroll: {
        Args: { _actor: string; _emp: string }
        Returns: boolean
      }
      can_view_employee: {
        Args: { _employee: string; _viewer: string }
        Returns: boolean
      }
      can_view_payroll: {
        Args: { _actor: string; _emp: string }
        Returns: boolean
      }
      check_in: {
        Args: { _accuracy: number; _lat: number; _lon: number }
        Returns: {
          attendance_date: string
          check_in_accuracy: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_accuracy: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string
          day_status: string | null
          early_departure_minutes: number | null
          employee_id: string
          id: string
          late_minutes: number | null
          office_location_id: string | null
          overtime_minutes: number | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          worked_minutes: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_out: {
        Args: { _accuracy: number; _lat: number; _lon: number }
        Returns: {
          attendance_date: string
          check_in_accuracy: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_accuracy: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string
          day_status: string | null
          early_departure_minutes: number | null
          employee_id: string
          id: string
          late_minutes: number | null
          office_location_id: string | null
          overtime_minutes: number | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          worked_minutes: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_payroll: { Args: { _emp: string; _month: string }; Returns: Json }
      distance_meters: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      employee_working_day_count: {
        Args: { _employee: string; _end: string; _start: string }
        Returns: number
      }
      generate_payroll: {
        Args: { _emp: string; _month: string }
        Returns: {
          breakdown: Json
          employee_id: string
          finalized_at: string | null
          finalized_by: string | null
          generated_at: string
          generated_by: string | null
          gross_salary: number
          id: string
          month: string
          net_salary: number
          status: string
          total_deductions: number
        }
        SetofOptions: {
          from: "*"
          to: "payroll_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_permission: {
        Args: { _action?: string; _module: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_company: {
        Args: { _company: string; _user: string }
        Returns: boolean
      }
      in_company_scope: {
        Args: { _actor: string; _emp: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_hr_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_in_hierarchy: {
        Args: { _employee: string; _supervisor: string }
        Returns: boolean
      }
      is_manager_of: {
        Args: { _employee: string; _manager: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      leave_balances: {
        Args: { _employee: string }
        Returns: {
          available: number
          carried: number
          entitled: number
          label: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          pending: number
          used: number
        }[]
      }
      my_permissions: {
        Args: never
        Returns: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          module: string
        }[]
      }
      set_payroll_status: {
        Args: { _id: string; _status: string }
        Returns: {
          breakdown: Json
          employee_id: string
          finalized_at: string | null
          finalized_by: string | null
          generated_at: string
          generated_by: string | null
          gross_salary: number
          id: string
          month: string
          net_salary: number
          status: string
          total_deductions: number
        }
        SetofOptions: {
          from: "*"
          to: "payroll_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shares_company: { Args: { _a: string; _b: string }; Returns: boolean }
      working_day_count: {
        Args: { _end: string; _location?: string; _start: string }
        Returns: number
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "hr"
        | "manager"
        | "employee"
        | "super_admin"
        | "ado"
        | "agent"
      attendance_status: "checked_in" | "checked_out"
      employee_status: "active" | "inactive"
      leave_status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
      leave_type:
        | "CASUAL"
        | "SICK"
        | "EARNED"
        | "UNPAID"
        | "OTHER"
        | "EMERGENCY"
      task_priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
      task_status:
        | "NOT_STARTED"
        | "IN_PROGRESS"
        | "ON_HOLD"
        | "COMPLETED"
        | "CANCELLED"
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
      app_role: [
        "admin",
        "hr",
        "manager",
        "employee",
        "super_admin",
        "ado",
        "agent",
      ],
      attendance_status: ["checked_in", "checked_out"],
      employee_status: ["active", "inactive"],
      leave_status: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      leave_type: ["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER", "EMERGENCY"],
      task_priority: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      task_status: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "ON_HOLD",
        "COMPLETED",
        "CANCELLED",
      ],
    },
  },
} as const
