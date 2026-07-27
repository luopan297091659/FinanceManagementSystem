<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="brand-mark">F</div>
        <h1>{{ dict.appName }}</h1>
        <p class="subtitle">{{ dict.company }}</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="username">{{ dict.username }}</label>
          <input
            id="username"
            v-model="form.username"
            type="text"
            :placeholder="dict.usernamePlaceholder"
            required
            :disabled="loading"
          />
        </div>

        <div class="form-group">
          <label for="password">{{ dict.password }}</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            :placeholder="dict.passwordPlaceholder"
            required
            :disabled="loading"
          />
        </div>

        <button type="submit" class="login-button" :disabled="loading">
          {{ loading ? dict.loggingIn : dict.login }}
        </button>

        <button type="button" class="forgot-password" @click="showResetModal = true">
          {{ dict.forgotPassword }}
        </button>
      </form>

      <div v-if="error" class="error-message">{{ error }}</div>

      <div class="login-footer">
        <p class="hint">{{ dict.demoAccount }}: admin / admin123</p>
      </div>

      <div class="locale-switch">
        <button
          v-for="loc in ['ja', 'zh']"
          :key="loc"
          :class="{ active: currentLocale === loc }"
          @click="setLocale(loc)"
        >
          {{ loc === 'ja' ? '日本語' : '中文' }}
        </button>
      </div>
    </div>

    <!-- Password Reset Modal -->
    <div v-if="showResetModal" class="modal-overlay" @click="showResetModal = false">
      <div class="modal-card" @click.stop>
        <h2>{{ dict.resetPassword }}</h2>
        <input
          v-model="resetForm.username"
          type="text"
          :placeholder="dict.enterUsername"
          class="modal-input"
        />
        <div class="modal-actions">
          <button @click="handlePasswordReset" class="modal-button primary">
            {{ dict.send }}
          </button>
          <button @click="showResetModal = false" class="modal-button">
            {{ dict.cancel }}
          </button>
        </div>
        <div v-if="resetMessage" class="reset-message">{{ resetMessage }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { locale, messages } from '../i18n.js';
import { api } from '../services/api.js';

const emit = defineEmits(['authenticated']);
const currentLocale = ref(locale.value);
const form = ref({ username: '', password: '' });
const resetForm = ref({ username: '' });
const loading = ref(false);
const error = ref('');
const showResetModal = ref(false);
const resetMessage = ref('');

const dict = computed(() => messages[currentLocale.value].login);

const setLocale = (loc) => {
  currentLocale.value = loc;
  locale.value = loc;
  localStorage.setItem('app-locale', loc);
};

const handleLogin = async () => {
  error.value = '';
  loading.value = true;
  try {
    const result = await api.login(form.value.username.trim(), form.value.password);
    if (result.token) {
      localStorage.setItem('auth-token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      emit('authenticated', result.user);
    } else {
      error.value = dict.value.loginFailed;
    }
  } catch (e) {
    error.value = dict.value.loginError + (e.message || '');
  } finally {
    loading.value = false;
  }
};

const handlePasswordReset = async () => {
  try {
    const result = await api.requestPasswordReset(resetForm.value.username);
    if (result.success) {
      resetMessage.value = dict.value.resetSent;
    } else {
      resetMessage.value = result.message || dict.value.resetFailed;
    }
  } catch (e) {
    resetMessage.value = dict.value.resetError;
  }
};

watch(locale, (newVal) => {
  currentLocale.value = newVal;
});
</script>

<style scoped>
.login-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.login-card {
  background: white;
  padding: 3rem;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 440px;
  width: 100%;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.brand-mark {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: bold;
  margin: 0 auto 1rem;
}

.login-header h1 {
  margin: 0.5rem 0;
  color: #333;
  font-size: 23px;
  line-height: 1.35;
  word-break: keep-all;
  overflow-wrap: normal;
}

.subtitle {
  color: #999;
  margin: 0.5rem 0 0;
  font-size: 14px;
}

.login-form {
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #333;
  font-weight: 500;
  font-size: 14px;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-group input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.login-button {
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.3s;
  margin-bottom: 1rem;
}

.login-button:hover:not(:disabled) {
  opacity: 0.9;
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.forgot-password {
  width: 100%;
  background: none;
  border: none;
  color: #667eea;
  font-size: 14px;
  cursor: pointer;
  padding: 5px 0;
  text-decoration: underline;
}

.forgot-password:hover {
  color: #764ba2;
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 10px;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 1rem;
  border-left: 4px solid #c33;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.login-footer {
  text-align: center;
  font-size: 12px;
  color: #999;
  margin-bottom: 1.5rem;
}

.hint {
  margin: 0;
}

.locale-switch {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.locale-switch button {
  padding: 5px 12px;
  border: 1px solid #ddd;
  background: white;
  color: #666;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s;
}

.locale-switch button.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  max-width: 400px;
  width: 90%;
}

.modal-card h2 {
  margin: 0 0 1rem;
  font-size: 18px;
  color: #333;
}

.modal-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 1rem;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.modal-button {
  flex: 1;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.modal-button.primary {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.modal-button:hover {
  opacity: 0.9;
}

.reset-message {
  font-size: 14px;
  color: #666;
  padding: 10px;
  background: #f0f0f0;
  border-radius: 6px;
}

@media (max-width: 768px) {
  .login-card {
    margin: 1rem;
    padding: 2rem;
  }
}
</style>
