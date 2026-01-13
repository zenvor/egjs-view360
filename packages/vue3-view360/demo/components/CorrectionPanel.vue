<script lang="ts">
import { defineComponent, ref, PropType, watch } from "vue";

export interface CorrectionSettings {
  mode: "erp" | "fisheye";
  yaw: number;
  pitch: number;
  roll: number;
  hfov: number;
  vfov: number;
  fisheyeFov: number;
  outputWidth: number;
  outputHeight: number;
}

export default defineComponent({
  name: "CorrectionPanel",
  props: {
    modelValue: {
      type: Object as PropType<CorrectionSettings>,
      required: true
    }
  },
  emits: ["update:modelValue", "apply"],
  setup(props, { emit }) {
    const isSettingsPanelOpen = ref(true);

    // Create a local copy to mutate, or emit update on every change.
    // Given the original used v-model directly on refs, we should probably emit updates directly.
    // However, since it's a complex object, let's use a computed proxy or just careful v-modeling.
    // Simplest approach: Use a local reactive object that watches props and emits updates.
    // Actually, to avoid deep watchers issues, let's just use the prop directly if we can,
    // but we can't mutate props. So we need computed properties for each field or a reactive copy.

    // Let's use a reactive copy and emit update:modelValue on change.
    
    const localSettings = ref<CorrectionSettings>({ ...props.modelValue });

    watch(() => props.modelValue, (newVal) => {
      // Sync from parent if parent updates independently (e.g. reset)
      // Checks to avoid infinite loops if needed, though simple assignment is usually safe if values match
      if (JSON.stringify(newVal) !== JSON.stringify(localSettings.value)) {
        localSettings.value = { ...newVal };
      }
    }, { deep: true });

    watch(localSettings, (newVal) => {
      emit("update:modelValue", { ...newVal });
    }, { deep: true });

    function toggleSettingsPanel() {
      isSettingsPanelOpen.value = !isSettingsPanelOpen.value;
    }

    function applySettings() {
      emit("apply");
    }

    return {
      localSettings,
      applySettings
    };
  }
});
</script>

<template>
  <div class="correction-panel">
    <div class="panel-header">
      <span class="panel-title">CORRECTION SETTINGS</span>
    </div>
    
    <div class="panel-content">
      <div class="control-group">
        <span class="group-label">INPUT MODE</span>
        <div class="radio-group">
          <label :class="{ active: localSettings.mode === 'erp' }">
            <input type="radio" v-model="localSettings.mode" value="erp" /> ERP
          </label>
          <label :class="{ active: localSettings.mode === 'fisheye' }">
            <input type="radio" v-model="localSettings.mode" value="fisheye" /> FISHEYE
          </label>
        </div>
      </div>

      <div class="control-group">
        <span class="group-label">ROTATION</span>
        <div class="input-row compact">
          <label>Yaw</label>
          <input type="range" v-model.number="localSettings.yaw" min="-180" max="180" />
          <input type="number" v-model.number="localSettings.yaw" class="row-num-input" />
          <span class="unit">deg</span>
        </div>
        <div class="input-row compact">
          <label>Pitch</label>
          <input type="range" v-model.number="localSettings.pitch" min="-90" max="90" />
          <input type="number" v-model.number="localSettings.pitch" class="row-num-input" />
          <span class="unit">deg</span>
        </div>
        <div class="input-row compact">
          <label>Roll</label>
          <input type="range" v-model.number="localSettings.roll" min="-180" max="180" />
          <input type="number" v-model.number="localSettings.roll" class="row-num-input" />
          <span class="unit">deg</span>
        </div>
      </div>

      <div class="control-group">
        <span class="group-label">FOV</span>
        <div class="input-row compact">
          <label>H-FOV</label>
          <input type="range" v-model.number="localSettings.hfov" min="10" max="360" />
          <input type="number" v-model.number="localSettings.hfov" class="row-num-input" />
          <span class="unit">deg</span>
        </div>
        <div class="input-row compact">
          <label>V-FOV</label>
          <input type="range" v-model.number="localSettings.vfov" min="10" max="180" />
          <input type="number" v-model.number="localSettings.vfov" class="row-num-input" />
          <span class="unit">deg</span>
        </div>
        <div class="input-row compact" v-if="localSettings.mode === 'fisheye'">
          <label>Fisheye</label>
          <input type="range" v-model.number="localSettings.fisheyeFov" min="10" max="360" />
          <input type="number" v-model.number="localSettings.fisheyeFov" class="row-num-input" />
          <span class="unit">deg</span>
        </div>
      </div>

      <div class="control-group">
        <span class="group-label">TEXTURE SIZE</span>
        <span class="group-hint">矫正后的全景纹理分辨率，建议 4096x2048 以上</span>
        <div class="input-row compact">
          <label>W</label>
          <input type="number" v-model.number="localSettings.outputWidth" step="256" min="512" />
        </div>
        <div class="input-row compact">
          <label>H</label>
          <input type="number" v-model.number="localSettings.outputHeight" step="128" min="256" />
        </div>
      </div>

      <button class="btn-apply" @click="applySettings">
        UPDATE PROJECTION
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 矫正参数面板 */
.correction-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  width: 320px;
  background: rgba(15, 15, 20, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 100;
  color: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 250px);
}

.panel-header {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  user-select: none;
}

.panel-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
}

.panel-content {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-label {
  font-size: 11px;
  font-weight: 700;
  color: #646cff;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.group-hint {
  font-size: 10px;
  color: #888;
  margin-top: -4px;
}

.radio-group {
  display: flex;
  gap: 8px;
}

.radio-group label {
  flex: 1;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 10px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  color: #ccc;
}

.radio-group label.active {
  background: rgba(100, 108, 255, 0.2);
  border-color: #646cff;
  color: #fff;
}

.radio-group input {
  display: none;
}

.input-row.compact {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #ccc;
}

.input-row.compact label {
  width: 65px;
  font-size: 11px;
  color: #888;
  white-space: nowrap;
}

.input-row.compact input[type="range"] {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
}

.input-row.compact input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #646cff;
  border-radius: 50%;
  cursor: pointer;
}

.input-row.compact input[type="number"] {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  padding: 6px 10px;
  font-size: 13px;
}

.row-num-input {
  width: 65px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  padding: 4px 6px;
  font-size: 12px;
  text-align: center;
}

.unit {
  font-size: 11px;
  color: #888;
  width: 28px;
  text-transform: uppercase;
}

.btn-apply {
  margin-top: 8px;
  background: linear-gradient(135deg, #646cff, #535bf2);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: filter 0.2s;
}

.btn-apply:hover {
  filter: brightness(1.2);
}
</style>
