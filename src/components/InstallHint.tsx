import { useState } from 'react'
import { Share, X } from 'lucide-react'

const KEY = 'install-hint-dismissed'

function shouldShow() {
  try {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
    return ios && !standalone && localStorage.getItem(KEY) !== '1'
  } catch {
    return false
  }
}

/** En iPhone, si la app se abrió desde el navegador, explica cómo instalarla en la pantalla de inicio. */
export function InstallHint() {
  const [show, setShow] = useState(shouldShow)
  if (!show) return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-secondary p-4 text-sm text-secondary-foreground">
      <Share className="mt-0.5 size-5 shrink-0" />
      <p className="min-w-0 flex-1">
        Para usarla como app a pantalla completa: abre esta página en <strong>Safari</strong>, toca <strong>Compartir</strong> y luego{' '}
        <strong>Agregar a inicio</strong>.
      </p>
      <button
        type="button"
        aria-label="Ocultar"
        className="-m-1 rounded-md p-1 hover:bg-card/60"
        onClick={() => {
          try {
            localStorage.setItem(KEY, '1')
          } catch {
            /* sin almacenamiento: solo se oculta en esta sesión */
          }
          setShow(false)
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
