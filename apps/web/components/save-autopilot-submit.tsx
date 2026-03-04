"use client";

import { useFormStatus } from "react-dom";

type SaveAutopilotSubmitProps = {
  className?: string;
};

export function SaveAutopilotSubmit({ className }: SaveAutopilotSubmitProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? "Saving settings..." : "Save autopilot settings"}
    </button>
  );
}
