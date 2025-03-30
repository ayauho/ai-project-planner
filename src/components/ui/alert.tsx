'use client';

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-white text-gray-900 border-gray-300",
        destructive:
          "border-red-500 bg-red-50 text-red-800 [&>svg]:text-red-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>& VariantProps<typeof alertVariants>>(({ className, variant, ...props }, ref) =>(
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    style={{
      maxWidth: '100%',
      wordWrap: 'break-word',
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
      boxSizing: 'border-box',
      padding: '0.75rem 1rem',
      hyphens: 'auto',
    }}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) =>(
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-tight tracking-tight", className)}
    style={{
      wordWrap: 'break-word',
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
      hyphens: 'auto',
    }}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) =>(
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    style={{
      maxWidth: '100%',
      wordWrap: 'break-word',
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
      hyphens: 'auto',
    }}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
