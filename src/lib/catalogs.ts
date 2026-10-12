import type { ActivityLevel, DietType, Goal } from './nutrition'

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentario', hint: 'Trabajo de escritorio, casi sin ejercicio.' },
  { value: 'light', label: 'Ligero', hint: 'Ejercicio 1–3 días por semana.' },
  { value: 'moderate', label: 'Moderado', hint: 'Ejercicio 3–5 días por semana.' },
  { value: 'active', label: 'Activo', hint: 'Ejercicio intenso 6–7 días por semana.' },
  { value: 'very_active', label: 'Muy activo', hint: 'Entrenas dos veces al día o tu trabajo es físico.' },
]

export const GOAL_OPTIONS: { value: Goal; label: string; hint: string }[] = [
  { value: 'cut', label: 'Perder grasa', hint: 'Déficit del 20 % (máx. 750 kcal).' },
  { value: 'maintain', label: 'Mantener', hint: 'Comer lo que gastas.' },
  { value: 'bulk', label: 'Ganar músculo', hint: 'Superávit del 10 % (máx. 350 kcal).' },
]

export type DietInfo = {
  value: DietType
  label: string
  summary: string
  pros: string[]
  cons: string[]
}

export const DIET_OPTIONS: DietInfo[] = [
  {
    value: 'traditional',
    label: 'Tradicional balanceada',
    summary: 'De todo con medida: ~30 % grasa, proteína según tu objetivo y el resto carbohidratos.',
    pros: ['La más fácil de sostener a largo plazo.', 'Flexible para comer fuera o en familia.'],
    cons: ['Requiere cuidar porciones; no hay reglas que lo hagan por ti.'],
  },
  {
    value: 'high_protein',
    label: 'Alta en proteína',
    summary: 'Proteína elevada (+0.4 g/kg sobre lo normal) y grasa moderada.',
    pros: ['Da más saciedad.', 'Ayuda a conservar músculo cuando estás en déficit.'],
    cons: [
      'Suele costar más (carnes, lácteos, suplementos).',
      'Si hay enfermedad renal, consultarlo con un médico antes.',
    ],
  },
  {
    value: 'keto',
    label: 'Cetogénica (keto)',
    summary: 'Carbohidratos muy bajos (~25 g al día); la energía viene sobre todo de la grasa.',
    pros: [
      'En algunas personas reduce el apetito.',
      'Baja rápido de peso al inicio (buena parte es agua).',
    ],
    cons: [
      'Difícil de sostener; los primeros días puede haber cansancio o dolor de cabeza.',
      'Poca fibra si no se planean bien las verduras.',
      'Puede bajar el rendimiento en ejercicio intenso.',
      'No recomendable sin supervisión médica con diabetes medicada, embarazo o problemas renales.',
    ],
  },
  {
    value: 'vegetarian',
    label: 'Vegetariana',
    summary: 'Sin carne ni pescado; proteína de huevo, lácteos, leguminosas y soya.',
    pros: ['Alta en fibra.', 'Suele ser más barata.'],
    cons: [
      'Cuidar vitamina B12, hierro y omega-3.',
      'Llegar a la proteína requiere planear (huevo y lácteos lo facilitan).',
    ],
  },
  {
    value: 'intermittent_fasting',
    label: 'Ayuno intermitente',
    summary: 'Mismos macros que la tradicional, comidos en una ventana de 8 horas (16:8).',
    pros: ['Simplifica el día: menos comidas que planear.', 'A algunas personas les ayuda a controlar el picoteo.'],
    cons: [
      'No quema más grasa que la misma dieta sin ayuno; funciona por comer menos.',
      'No recomendable con historial de trastornos alimentarios, embarazo o diabetes medicada.',
    ],
  },
  {
    value: 'mediterranean',
    label: 'Mediterránea',
    summary: 'Grasas saludables (~35 %): aceite de oliva, pescado, nueces, verduras y leguminosas.',
    pros: ['La de mejor evidencia para salud cardiovascular.', 'Muy saciante y variada.'],
    cons: ['Aceite de oliva, pescado y nueces son más caros.', 'Las grasas suman calorías rápido.'],
  },
]

// Orden de la semana para la UI (lunes primero). Valores = día de la semana de JS (0 = domingo).
export const WEEK_DAYS = [
  { value: 1, short: 'L', label: 'Lunes' },
  { value: 2, short: 'M', label: 'Martes' },
  { value: 3, short: 'M', label: 'Miércoles' },
  { value: 4, short: 'J', label: 'Jueves' },
  { value: 5, short: 'V', label: 'Viernes' },
  { value: 6, short: 'S', label: 'Sábado' },
  { value: 0, short: 'D', label: 'Domingo' },
]
