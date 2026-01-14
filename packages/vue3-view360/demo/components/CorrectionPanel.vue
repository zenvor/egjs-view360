<script lang="ts">
import { defineComponent, ref, PropType, watch } from "vue";

// 使用 WideAngleRealtimeProjection 无需配置输出分辨率
export interface CorrectionSettings {
  mode: "erp" | "fisheye";
  yaw: number;
  pitch: number;
  roll: number;
  hfov: number;
  vfov: number;
  fisheyeFov: number;
}

export default defineComponent({
  name: "CorrectionPanel",
  props: {
    modelValue: {
      type: Object as PropType<CorrectionSettings>,
      required: true
    },
    sourceType: {
      type: String as PropType<"video" | "image">,
      default: "video"
    }
  },
  emits: ["update:modelValue", "apply", "update:sourceType"],
  setup(props, { emit }) {
    const isSettingsPanelOpen = ref(true);

    // ... (rest of setup)
    const localSettings = ref<CorrectionSettings>({ ...props.modelValue });

    watch(() => props.modelValue, (newVal) => {
      if (JSON.stringify(newVal) !== JSON.stringify(localSettings.value)) {
        localSettings.value = { ...newVal };
      }
    }, { deep: true });

    watch(localSettings, (newVal) => {
      emit("update:modelValue", { ...newVal });
    }, { deep: true });

    function setSourceType(type: "video" | "image") {
      emit("update:sourceType", type);
    }

    function applySettings() {
      emit("apply");
    }

    return {
      localSettings,
      setSourceType,
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
      <!-- Source Toggle (New) -->
      <div class="control-group">
        <div class="source-toggle">
          <button 
            :class="{ active: sourceType === 'video' }" 
            @click="setSourceType('video')"
          >
            <span class="material-symbols-outlined">movie</span>
            VIDEO
          </button>
          <button 
            :class="{ active: sourceType === 'image' }" 
            @click="setSourceType('image')"
          >
            <span class="material-symbols-outlined">image</span>
            IMAGE
          </button>
        </div>
      </div>

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

      <button class="btn-apply" @click="applySettings">
        UPDATE PROJECTION
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 矫正参数面板 */
.correction-panel {
  position: relative;
  width: 320px;
  height: 100%; /* Fill sidebar height */
  flex-shrink: 0;
  background: rgba(15, 15, 20, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

.source-toggle {
  display: flex;
  background: transparent; /* Remove background to align border with edge */
  padding: 0;             /* Remove padding */
  border-radius: 14px;
  border: none;           /* Remove container border */
  margin-bottom: 12px;
  gap: 8px;
}

.source-toggle button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1.5px solid rgba(255, 255, 255, 0.1); /* Base border for balance */
  background: #0a0a0e;
  color: #71717a;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.source-toggle button.active {
  background: rgba(85, 110, 255, 0.12);
  border-color: #556eff;
  color: #ffffff;
  /* box-shadow: 0 0 15px rgba(85, 110, 255, 0.2); */
}

.source-toggle button .material-symbols-outlined {
  font-size: 20px;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.source-toggle button.active .material-symbols-outlined {
  color: #ffffff;
}

.radio-group {
  display: flex;
  background: transparent;
  padding: 0;
  border-radius: 14px;
  border: none;
  gap: 8px;
}

.radio-group label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  background: #0a0a0e;
  color: #71717a;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
}

.radio-group label.active {
  background: rgba(85, 110, 255, 0.12);
  border-color: #556eff;
  color: #ffffff;
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
