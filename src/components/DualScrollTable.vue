<template>
  <div class="dual-scroll-table">
    <div
      v-show="hasOverflow"
      ref="topScroller"
      class="table-top-scroll"
      aria-hidden="true"
      @scroll="syncFromTop"
    >
      <div class="table-top-scroll-spacer" :style="{ width: `${contentWidth}px` }"></div>
    </div>
    <div ref="contentScroller" :class="['dual-scroll-content', wrapperClass]" @scroll="syncFromContent">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

defineProps({
  wrapperClass: {
    type: String,
    default: "data-table-wrap",
  },
});

const topScroller = ref(null);
const contentScroller = ref(null);
const contentWidth = ref(0);
const hasOverflow = ref(false);
let resizeObserver;
let mutationObserver;

const updateMeasurements = () => {
  const content = contentScroller.value;
  if (!content) return;
  contentWidth.value = content.scrollWidth;
  hasOverflow.value = content.scrollWidth > content.clientWidth + 1;
  if (topScroller.value) topScroller.value.scrollLeft = content.scrollLeft;
};

const syncFromTop = () => {
  if (topScroller.value && contentScroller.value) {
    contentScroller.value.scrollLeft = topScroller.value.scrollLeft;
  }
};

const syncFromContent = () => {
  if (topScroller.value && contentScroller.value) {
    topScroller.value.scrollLeft = contentScroller.value.scrollLeft;
  }
};

onMounted(async () => {
  await nextTick();
  updateMeasurements();
  resizeObserver = new ResizeObserver(updateMeasurements);
  resizeObserver.observe(contentScroller.value);
  if (contentScroller.value.firstElementChild) {
    resizeObserver.observe(contentScroller.value.firstElementChild);
  }
  mutationObserver = new MutationObserver(updateMeasurements);
  mutationObserver.observe(contentScroller.value, { childList: true, subtree: true });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
});
</script>

<style scoped>
.dual-scroll-table {
  min-width: 0;
  max-width: 100%;
}

.dual-scroll-content {
  max-width: 100%;
  overflow-x: auto;
}

.table-top-scroll {
  width: 100%;
  height: 16px;
  margin-bottom: 4px;
  overflow-x: auto;
  overflow-y: hidden;
}

.table-top-scroll-spacer {
  height: 1px;
}
</style>
