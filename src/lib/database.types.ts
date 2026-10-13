// Tipos generados desde el esquema de Supabase (proyecto planificador-alimenticio).
// Regenerar cada vez que cambie el esquema.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Rel = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' }
  public: {
    Tables: {
      ingredient_measures: {
        Row: {
          created_at: string
          grams: number
          id: string
          ingredient_id: string
          is_piece: boolean
          name: string
          owner_id: string | null
          plural: string
        }
        Insert: {
          created_at?: string
          grams: number
          id?: string
          ingredient_id: string
          is_piece?: boolean
          name: string
          owner_id?: string | null
          plural: string
        }
        Update: Partial<Database['public']['Tables']['ingredient_measures']['Insert']>
        Relationships: [Rel]
      }
      ingredients: {
        Row: {
          carbs_100g: number | null
          category: string | null
          created_at: string
          default_unit: string
          fat_100g: number | null
          grams_per_unit: number | null
          id: string
          kcal_100g: number | null
          name: string
          owner_id: string | null
          protein_100g: number | null
        }
        Insert: {
          carbs_100g?: number | null
          category?: string | null
          created_at?: string
          default_unit?: string
          fat_100g?: number | null
          grams_per_unit?: number | null
          id?: string
          kcal_100g?: number | null
          name: string
          owner_id?: string | null
          protein_100g?: number | null
        }
        Update: Partial<Database['public']['Tables']['ingredients']['Insert']>
        Relationships: []
      }
      inventory: {
        Row: {
          expires_on: string | null
          id: string
          ingredient_id: string
          is_approximate: boolean
          quantity: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          expires_on?: string | null
          id?: string
          ingredient_id: string
          is_approximate?: boolean
          quantity: number
          unit: string
          updated_at?: string
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>
        Relationships: [Rel]
      }
      meal_plan_items: {
        Row: {
          day_of_week: number
          id: string
          is_done: boolean
          meal_plan_id: string
          meal_type: string
          recipe_id: string
          servings: number
        }
        Insert: {
          day_of_week: number
          id?: string
          is_done?: boolean
          meal_plan_id: string
          meal_type: string
          recipe_id: string
          servings?: number
        }
        Update: Partial<Database['public']['Tables']['meal_plan_items']['Insert']>
        Relationships: [Rel, Rel]
      }
      meal_plans: {
        Row: {
          created_at: string
          id: string
          status: string
          target_kcal: number | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          target_kcal?: number | null
          user_id?: string
          week_start: string
        }
        Update: Partial<Database['public']['Tables']['meal_plans']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string | null
          birth_date: string | null
          bmi: number | null
          body_fat_pct: number | null
          busy_day_max_min: number | null
          busy_days: number[] | null
          created_at: string
          diet_type: string | null
          free_day_max_min: number | null
          full_name: string | null
          goal: string | null
          height_cm: number | null
          id: string
          sex: string | null
          target_carbs_g: number | null
          target_fat_g: number | null
          target_kcal: number | null
          target_protein_g: number | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          birth_date?: string | null
          body_fat_pct?: number | null
          busy_day_max_min?: number | null
          busy_days?: number[] | null
          created_at?: string
          diet_type?: string | null
          free_day_max_min?: number | null
          full_name?: string | null
          goal?: string | null
          height_cm?: number | null
          id: string
          sex?: string | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_kcal?: number | null
          target_protein_g?: number | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      recipe_ingredients: {
        Row: { ingredient_id: string; quantity: number; recipe_id: string; unit: string }
        Insert: { ingredient_id: string; quantity: number; recipe_id: string; unit: string }
        Update: Partial<Database['public']['Tables']['recipe_ingredients']['Insert']>
        Relationships: [Rel, Rel]
      }
      recipes: {
        Row: {
          carbs_serving: number | null
          created_at: string
          description: string | null
          diet_tags: string[] | null
          fat_serving: number | null
          id: string
          instructions: Json
          kcal_serving: number | null
          meal_type: string | null
          name: string
          owner_id: string | null
          prep_time_min: number
          protein_serving: number | null
          servings: number
        }
        Insert: {
          carbs_serving?: number | null
          created_at?: string
          description?: string | null
          diet_tags?: string[] | null
          fat_serving?: number | null
          id?: string
          instructions?: Json
          kcal_serving?: number | null
          meal_type?: string | null
          name: string
          owner_id?: string | null
          prep_time_min: number
          protein_serving?: number | null
          servings?: number
        }
        Update: Partial<Database['public']['Tables']['recipes']['Insert']>
        Relationships: []
      }
      product_prices: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          ingredient_id: string
          observed_on: string
          package_qty: number
          package_unit: string
          price: number
          product_name: string
          store: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          ingredient_id: string
          observed_on?: string
          package_qty: number
          package_unit: string
          price: number
          product_name: string
          store: string
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['product_prices']['Insert']>
        Relationships: [Rel]
      }
      shopping_list_items: {
        Row: {
          id: string
          ingredient_id: string
          is_checked: boolean
          list_id: string
          notes: string | null
          quantity: number
          unit: string
          product_price_id: string | null
          is_manual: boolean
        }
        Insert: {
          id?: string
          ingredient_id: string
          is_checked?: boolean
          list_id: string
          notes?: string | null
          quantity: number
          unit: string
          product_price_id?: string | null
          is_manual?: boolean
        }
        Update: Partial<Database['public']['Tables']['shopping_list_items']['Insert']>
        Relationships: [Rel, Rel]
      }
      shopping_lists: {
        Row: {
          created_at: string
          id: string
          meal_plan_id: string | null
          name: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal_plan_id?: string | null
          name?: string
          status?: string
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['shopping_lists']['Insert']>
        Relationships: [Rel]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']
export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row']
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update']
