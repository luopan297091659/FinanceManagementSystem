<template>
  <form class="panel-form" @submit.prevent="emit('submit')">
    <div class="field-grid">
      <label>
        类型
        <select v-model="form.kind">
          <option value="income">收入</option>
          <option value="expense">支出</option>
        </select>
      </label>
      <label>
        金额
        <input v-model.number="form.amount" type="number" min="0" step="0.01" required />
      </label>
      <label>
        发生日期
        <input v-model="form.occurredAt" type="date" required />
      </label>
      <label>
        说明
        <input v-model="form.description" placeholder="租金、维修费" />
      </label>
      <label>
        关联房间
        <input v-model="form.roomName" placeholder="101" />
      </label>
      <label>
        关联客户
        <input v-model="form.customerName" placeholder="山田 太郎" />
      </label>
    </div>

    <div class="form-actions">
      <button class="primary-button" type="submit">{{ editing ? "更新流水" : "新增流水" }}</button>
      <button v-if="editing" class="ghost-button" type="button" @click="emit('cancel')">取消</button>
    </div>
  </form>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["submit", "cancel"]);

const form = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const editing = computed(() => Boolean(props.modelValue.id));
</script>
