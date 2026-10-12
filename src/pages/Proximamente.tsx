import { Construction } from 'lucide-react'

// Marcador de posición para los módulos de las etapas 2 a 4.
export default function Proximamente({ titulo, etapa }: { titulo: string; etapa: number }) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <Construction className="size-8 text-muted-foreground" />
        <p className="font-medium">En construcción</p>
        <p className="text-sm text-muted-foreground">Este módulo llega en la etapa {etapa}.</p>
      </div>
    </div>
  )
}
