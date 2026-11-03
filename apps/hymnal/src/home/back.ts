export const searchBack =
  ({ isFocused, cancel }: { readonly isFocused: () => boolean; readonly cancel: () => void }) =>
  (): boolean => {
    if (!isFocused()) return false;
    cancel();
    return true;
  };
