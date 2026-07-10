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
        客户编号
        <input v-model="form.customerCode" required placeholder="0001" />
      </label>
      <label>
        姓名 / 法人名
        <input v-model="form.name" required placeholder="山田 太郎 / ABC株式会社" />
      </label>
      <label>
        假名 / 负责人
        <input v-model="form.kana" placeholder="ヤマダ タロウ" />
      </label>
      <label>
        国籍
        <input v-model="form.nationality" placeholder="日本 / 中国" />
      </label>
      <label>
        电话
        <input v-model="form.phone" placeholder="090-0000-0000" />
      </label>
      <label>
        邮箱
        <input v-model="form.email" type="email" placeholder="name@example.com" />
      </label>
      <label>
        出生日期
        <input v-model="form.birthDate" type="date" />
      </label>
      <label>
        职业 / 公司电话
        <input v-model="form.occupation" placeholder="会社員 / 06-0000-0000" />
      </label>
      <label>
        年收入
        <input v-model="form.annualIncome" type="text" placeholder="4000000" />
      </label>
      <label>
        地址
        <input v-model="form.address" placeholder="大阪府大阪市..." />
      </label>
      <label class="span-2">
        附件备注
        <textarea v-model="form.attachments" rows="3" placeholder="身份证、护照、在留卡、合同、营业执照"></textarea>
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
