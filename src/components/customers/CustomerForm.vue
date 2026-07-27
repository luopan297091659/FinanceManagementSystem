<template>
  <form class="panel-form" @submit.prevent="emit('submit')">
    <div class="field-grid">
      <label>
        {{ labels.type }}
        <select v-model="form.kind">
          <option value="tenant">{{ labels.tenant }}</option>
          <option value="owner">{{ labels.owner }}</option>
        </select>
      </label>
      <label>
        {{ labels.code }}
        <input v-model="form.customerCode" required placeholder="0001" />
      </label>
      <label>
        {{ labels.name }}
        <input v-model="form.name" required placeholder="山田 太郎 / ABC株式会社" />
      </label>
      <label>
        {{ labels.kana }}
        <input v-model="form.kana" placeholder="ヤマダ タロウ" />
      </label>
      <label>
        {{ labels.nationality }}
        <input v-model="form.nationality" placeholder="日本 / 中国" />
      </label>
      <label>
        {{ labels.phone }}
        <input v-model="form.phone" placeholder="090-0000-0000" />
      </label>
      <label>
        {{ labels.email }}
        <input v-model="form.email" type="email" placeholder="name@example.com" />
      </label>
      <label>
        {{ labels.birthDate }}
        <input v-model="form.birthDate" type="date" />
      </label>
      <label>
        {{ labels.occupation }}
        <input v-model="form.occupation" placeholder="会社員 / 06-0000-0000" />
      </label>
      <label>
        {{ labels.annualIncome }}
        <input v-model="form.annualIncome" type="text" placeholder="4000000" />
      </label>
      <label>
        {{ labels.address }}
        <input v-model="form.address" placeholder="大阪府大阪市..." />
      </label>
      <label class="span-2">
        {{ labels.attachments }}
        <textarea v-model="form.attachments" rows="3" placeholder="身份证、护照、在留卡、合同、营业执照"></textarea>
      </label>
    </div>

    <div class="form-actions">
      <button class="primary-button" type="submit">{{ editing ? common.update : labels.newCustomer }}</button>
      <button v-if="editing" class="ghost-button" type="button" @click="emit('cancel')">{{ common.cancel }}</button>
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
  labels: {
    type: Object,
    required: true,
  },
  common: {
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
