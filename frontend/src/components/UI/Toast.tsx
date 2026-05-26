import { useEffect } from 'react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  message: string
  variant?: ToastVariant
  duration?: number
  onClose: () => void
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-teal-500 bg-teal-500/10 text-teal-300',
  error: 'border-orange-500 bg-orange-500/10 text-orange-300',
  warning: 'border-yellow-500 bg-yellow-500/10 text-yellow-300',
  info: 'border-blue-500 bg-blue-500/10 text-blue-300',
}

export default function Toast({ message, variant = 'info', duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm shadow-lg ${VARIANT_STYLES[variant]}`}
      role="alert"
    >
      <span>{message}</span>
      <button onClick={onClose} className="text-current opacity-60 hover:opacity-100" aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
