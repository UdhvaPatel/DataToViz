import { forwardRef } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`flex h-10 w-full rounded-md border border-[#27272a] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
