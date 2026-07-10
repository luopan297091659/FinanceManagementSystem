<template>
  <form class="panel-form" @submit.prevent="emit('submit')">
    <div class="field-grid">
      <label>
        类型
        <select v-model="form.kind">
          <option value="tenant">租客</option>
          <option value="owner">业主</option>
        </select>
      </label>
      <label>
        姓名 / 法人名
        <input v-model="form.name" required placeholder="山田 太郎 / ABC株式会社" />
      </label>
      <label>
        客户编号
        <input v-model="form.customerCode" required placeholder="0001" />
      </label>
      <label>
        联系方式
        <input v-model="form.phone" placeholder="090-0000-0000" />
      </label>
      <label>
        邮箱
        <input v-model="form.email" type="email" placeholder="name@example.com" />
      </label>
      <label>
        备注
        <input v-model="form.note" placeholder="客户标签或备注" />
      </label>
    </div>

    <div class="form-actions">
      <button class="primary-button" type="submit">{{ editing ? "更新客户" : "新增客户" }}</button>
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
