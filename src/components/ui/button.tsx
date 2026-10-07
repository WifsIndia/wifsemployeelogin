import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PendingContext, pendingLabel } from "@/components/ui/pending";

const buttonVariants = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-normal text-center rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-4 py-2 sm:min-h-9",
        sm: "min-h-11 rounded-md px-3 py-2 text-xs sm:min-h-8 sm:py-1",
        lg: "min-h-11 rounded-md px-8 py-2 sm:min-h-10",
        icon: "size-11 sm:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Force the processing state (spinner + disabled). Async onClick handlers get this automatically. */
  loading?: boolean;
  /** Text shown while processing; defaults to e.g. "Saving…" derived from the label. */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, loadingText, onClick, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const scope = React.useContext(PendingContext);
    const running = React.useRef(false);
    const [pending, setPending] = React.useState(false);
    const mounted = React.useRef(true);
    React.useEffect(() => () => { mounted.current = false; }, []);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (running.current) { e.preventDefault(); return; }
      const result = onClick?.(e) as unknown;
      if (result && typeof (result as Promise<unknown>).then === "function") {
        // Block repeat clicks synchronously, then show the processing state until it settles.
        running.current = true;
        setPending(true);
        scope?.start();
        (result as Promise<unknown>).finally(() => {
          running.current = false;
          scope?.end();
          if (mounted.current) setPending(false);
        });
      }
    };

    const busy = !!loading || pending;
    const label = busy ? loadingText ?? pendingLabel(children) : null;
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} onClick={onClick} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        disabled={disabled || busy || (!!scope?.busy && !pending)}
        aria-busy={busy || undefined}
        {...props}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {label ?? <span className="sr-only">Processing…</span>}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
