"use client";

import { useFormStatus } from "react-dom";

type DisconnectAccessSubmitProps = {
  className?: string;
  confirmText?: string;
};

export function DisconnectAccessSubmit({
  className,
  confirmText = "Disconnect this social account and remove stored access?"
}: DisconnectAccessSubmitProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (pending) return;
        if (!window.confirm(confirmText)) {
          event.preventDefault();
        }
      }}
      style={{
        border: "1px solid #ef4444",
        background: "#fff1f2",
        color: "#9f1239"
      }}
    >
      {pending ? "Disconnecting..." : "Disconnect access"}
    </button>
  );
}
