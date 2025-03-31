"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { logger } from "@/lib/client/logger"

// Create a properly typed context
interface ToastContextType {
  toasts: Array<{
    id: string;
    content: React.ReactNode;
    duration?: number;
  }>;
  addToast: (toast: React.ReactNode, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

// Define types for our toast props
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof toastVariants> {
  onClose?: () => void;
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function Toast({
  className,
  variant = "default",
  children,
  onClose,
  ...props
}: ToastProps) {
  return (
    <div
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      {children}
      {onClose && <ToastClose onClick={onClose} />}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Array<{
    id: string;
    content: React.ReactNode;
    duration?: number;
  }>>([]);

  // Generate a unique ID for each toast
  const generateId = React.useCallback(() => {
    return Math.random().toString(36).substring(2, 9);
  }, []);

  const addToast = React.useCallback((content: React.ReactNode, duration = 5000) => {
    const id = generateId();
    logger.debug('Adding toast notification', { id, duration }, 'toast ui');
    
    setToasts(prev => [...prev, { id, content, duration }]);
    
    // Set timeout to auto-remove the toast
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [generateId]);

  const removeToast = React.useCallback((id: string) => {
    logger.debug('Removing toast notification', { id }, 'toast ui');
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const contextValue = React.useMemo(() => ({
    toasts,
    addToast,
    removeToast,
  }), [toasts, addToast, removeToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
    </ToastContext.Provider>
  )
}

export function ToastViewport({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { toasts, removeToast } = useToast();

  return (
    <div
      className={cn(
        "fixed flex flex-col gap-2 bottom-4 right-4 z-[9999] max-w-md pointer-events-auto",
        className
      )}
      {...props}
    >
      {toasts.map(({ id, content }) => {
        // Simple approach - don't try to clone elements with onClose
        return (
          <div key={id} className="animate-in fade-in slide-in-from-bottom-4">
            {content}
          </div>
        );
      })}
    </div>
  )
}

export const toastVariants = cva(
  "group relative w-full rounded-lg border p-4 pr-8 shadow-md pointer-events-auto",
  {
    variants: {
      variant: {
        default: "bg-white border-gray-200",
        destructive: "bg-red-50 border-red-200 text-red-800 border-2",
        success: "bg-green-50 border-green-200 text-green-800",
        warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export function ToastTitle({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("font-semibold text-base", className)} {...props}>
      {children}
    </div>
  )
}

export function ToastDescription({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("text-sm opacity-90 mt-1", className)} {...props}>
      {children}
    </div>
  )
}

export function ToastClose({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2",
        className
      )}
      onClick={onClick}
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  )
}
