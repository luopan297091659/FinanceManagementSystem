<template>
  <form class="panel-form" @submit.prevent="emit('submit')">
    <div class="field-grid">
      <label>
        项目
        <input v-model="form.projectName" required placeholder="住之江区西住之江" />
      </label>
      <label>
        楼栋
        <input v-model="form.buildingName" required placeholder="T1" />
      </label>
      <label>
        房屋编号
        <input v-model="form.houseNumber" required placeholder="H0001" />
      </label>
      <label>
        房号
        <input v-model="form.roomNumber" required placeholder="101" />
      </label>
      <label>
        面积（m²）
        <input v-model.number="form.area" type="number" min="0" step="0.01" />
      </label>
      <label>
        楼层
        <input v-model.number="form.floor" type="number" />
      </label>
      <label>
        状态
        <select v-model="form.status">
          <option value="VACANT">空室</option>
          <option value="OCCUPIED">入居中</option>
          <option value="MAINTENANCE">维修中</option>
        </select>
      </label>
      <label class="span-2">
        备注
        <textarea v-model="form.note" rows="3" placeholder="朝向、钥匙等特殊事项"></textarea>
      </label>
    </div>

    <div class="form-actions">
      <button class="primary-button" type="submit">{{ editing ? "更新房源" : "新增房源" }}</button>
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
