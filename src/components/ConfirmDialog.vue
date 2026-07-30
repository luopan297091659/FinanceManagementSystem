<template>
  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div v-if="confirmState.open" class="confirm-dialog-overlay" @click.self="cancel">
        <section
          ref="dialogElement"
          class="confirm-dialog-card"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="messageId"
          tabindex="-1"
          @keydown.esc.prevent="cancel"
          @keydown.tab="keepFocusInside"
        >
          <div class="confirm-dialog-icon" :class="{ danger: confirmState.danger }" aria-hidden="true">!</div>
          <div class="confirm-dialog-content">
            <h2 :id="titleId">{{ confirmState.title || common.confirmTitle }}</h2>
            <p :id="messageId">{{ confirmState.message }}</p>
          </div>
          <div class="confirm-dialog-actions">
            <button ref="cancelButton" class="confirm-dialog-button secondary" type="button" @click="cancel">
              {{ confirmState.cancelText || common.cancel }}
            </button>
            <button ref="confirmButton" class="confirm-dialog-button" :class="{ danger: confirmState.danger }" type="button" @click="confirm">
              {{ confirmState.confirmText || common.confirm }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "../i18n";
import { closeConfirm, confirmState } from "../services/confirm";

const { dictionary } = useI18n();
const common = computed(() => dictionary.value.common);
const dialogElement = ref(null);
const cancelButton = ref(null);
const confirmButton = ref(null);
const titleId = "global-confirm-dialog-title";
const messageId = "global-confirm-dialog-message";
let previouslyFocusedElement;

const cancel = () => closeConfirm(false);
const confirm = () => closeConfirm(true);
const keepFocusInside = (event) => {
  const buttons = [...(dialogElement.value?.querySelectorAll("button:not(:disabled)") || [])];
  if (!buttons.length) return;
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

watch(() => confirmState.open, async (open) => {
  if (open) {
    previouslyFocusedElement = document.activeElement;
    await nextTick();
    cancelButton.value?.focus();
    return;
  }
  previouslyFocusedElement?.focus?.();
  previouslyFocusedElement = undefined;
});
</script>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.5);
}

.confirm-dialog-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px 16px;
  width: min(440px, 100%);
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.24);
  color: #172033;
  outline: none;
}

.confirm-dialog-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #fff7ed;
  color: #c2410c;
  font-size: 20px;
  font-weight: 800;
}

.confirm-dialog-icon.danger {
  background: #fef2f2;
  color: #dc2626;
}

.confirm-dialog-content h2 {
  margin: 1px 0 7px;
  font-size: 18px;
  line-height: 1.4;
}

.confirm-dialog-content p {
  margin: 0;
  color: #667085;
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.confirm-dialog-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.confirm-dialog-button {
  min-width: 78px;
  min-height: 38px;
  padding: 8px 16px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.confirm-dialog-button.secondary {
  border-color: #d0d5dd;
  background: #fff;
  color: #344054;
}

.confirm-dialog-button.danger {
  border-color: #dc2626;
  background: #dc2626;
}

.confirm-dialog-button:hover { filter: brightness(0.96); }
.confirm-dialog-button:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 28%, transparent); outline-offset: 2px; }

.confirm-dialog-enter-active,
.confirm-dialog-leave-active { transition: opacity 0.16s ease; }
.confirm-dialog-enter-active .confirm-dialog-card,
.confirm-dialog-leave-active .confirm-dialog-card { transition: transform 0.16s ease, opacity 0.16s ease; }
.confirm-dialog-enter-from,
.confirm-dialog-leave-to { opacity: 0; }
.confirm-dialog-enter-from .confirm-dialog-card,
.confirm-dialog-leave-to .confirm-dialog-card { opacity: 0; transform: translateY(-8px) scale(0.98); }

@media (max-width: 520px) {
  .confirm-dialog-card { grid-template-columns: 1fr; padding: 20px; }
  .confirm-dialog-actions { grid-column: 1; }
  .confirm-dialog-button { flex: 1; }
}
</style>
