import { reactive } from "vue";

export const confirmState = reactive({
  open: false,
  message: "",
  title: "",
  confirmText: "",
  cancelText: "",
  danger: true,
});

let resolveConfirmation;

export const requestConfirm = (message, options = {}) => {
  if (resolveConfirmation) resolveConfirmation(false);

  Object.assign(confirmState, {
    open: true,
    message,
    title: options.title || "",
    confirmText: options.confirmText || "",
    cancelText: options.cancelText || "",
    danger: options.danger !== false,
  });

  return new Promise((resolve) => {
    resolveConfirmation = resolve;
  });
};

export const closeConfirm = (confirmed = false) => {
  if (!confirmState.open) return;
  confirmState.open = false;
  const resolve = resolveConfirmation;
  resolveConfirmation = undefined;
  resolve?.(confirmed);
};
