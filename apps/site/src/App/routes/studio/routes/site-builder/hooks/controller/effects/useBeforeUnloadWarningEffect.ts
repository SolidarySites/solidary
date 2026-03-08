import { useEffect } from "react";

type UseBeforeUnloadWarningEffectOptions = {
  hasUnsavedChanges: boolean;
};

export const useBeforeUnloadWarningEffect = ({
  hasUnsavedChanges
}: UseBeforeUnloadWarningEffectOptions) => {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);
};
