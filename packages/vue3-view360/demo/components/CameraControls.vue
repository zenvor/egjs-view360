<script lang="ts">
import { defineComponent, ref } from "vue";
import KnobControl from "./KnobControl.vue";

export default defineComponent({
  name: "CameraControls",
  components: {
    KnobControl
  },
  props: {
    yaw: { type: Number, required: true },
    pitch: { type: Number, required: true },
    zoom: { type: Number, required: true },
    zoomRangeMin: { type: Number, default: 0.6 },
    zoomRangeMax: { type: Number, default: 10 }
  },
  emits: ["update:yaw", "update:pitch", "update:zoom"],
  setup(props, { emit }) {


    const getZoomPercent = () => {
      const min = props.zoomRangeMin;
      const max = props.zoomRangeMax;
      if (max <= min) return 0;
      const percent = ((props.zoom - min) / (max - min)) * 100;
      return Math.max(0, Math.min(100, percent));
    };

    // Proxy for v-model bindings
    // Since we can't v-model props directly, we use computed setters or emit directly
    // Ideally we use :value and @input, but v-model is cleaner in template.
    // Let's use computed properties with get/set

    const stepYaw = (delta: number) => {
      let newYaw = (props.yaw + delta) % 360;
      if (newYaw < 0) newYaw += 360;
      emit("update:yaw", newYaw);
    };

    return {
      getZoomPercent,
      stepYaw
    };
  }
});
</script>

<template>
  <div class="camera-controls">
    <div class="controls-header">
      <h3>CAMERA CONTROLS</h3>
      <p>Fine-tune your virtual camera</p>

    </div>

    <div class="sliders-container">
      <!-- Zoom (蓝色) -->
      <div class="control-row">
        <div class="label-group">
          <span class="material-symbols-outlined icon zoom-icon">zoom_in</span>
          <span class="label">ZOOM</span>
        </div>
        <div class="slider-group">
          <input
            type="range"
            :value="zoom"
            @input="$emit('update:zoom', +($event.target as HTMLInputElement).value)"
            :min="zoomRangeMin"
            :max="zoomRangeMax"
            step="0.01"
            class="slider slider-blue"
            :style="({ '--value': getZoomPercent() + '%' } as any)"
          />
        </div>
        <div class="value-display bg-blue">{{ zoom.toFixed(2) }}</div>
      </div>

      <!-- Yaw (绿色) -->
      <div class="control-row">
        <div class="label-group">
          <span class="material-symbols-outlined icon yaw-icon">swap_horiz</span>
          <span class="label">YAW</span>
        </div>
        <div class="slider-group knob-center">
          <button class="arrow-btn" @click="stepYaw(10)">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <!-- KnobControl supports v-model, so we need to bridge it -->
          <!-- We can use :modelValue and @update:modelValue -->
          <KnobControl 
            :modelValue="yaw" 
            @update:modelValue="$emit('update:yaw', $event)" 
          />
          <button class="arrow-btn" @click="stepYaw(-10)">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div class="value-display bg-green">{{ Math.round(yaw) }}°</div>
      </div>

      <!-- Pitch (紫色) -->
      <div class="control-row">
        <div class="label-group">
          <span class="material-symbols-outlined icon pitch-icon">swap_vert</span>
          <span class="label">PITCH</span>
        </div>
        <div class="slider-group">
          <input
            type="range"
            :value="pitch"
            @input="$emit('update:pitch', +($event.target as HTMLInputElement).value)"
            :min="-90"
            :max="90"
            step="1"
            class="slider slider-purple"
            :style="({ '--value': (((pitch + 90) / 180) * 100) + '%' } as any)"
          />
        </div>
        <div class="value-display bg-purple">{{ Math.round(pitch) }}°</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 底部控制面板 */
.camera-controls {
  position: relative;
  width: 100%;
  margin: 0;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 20px 24px;
  color: #fff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between; /* Distribute vertical space */
}

.controls-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  position: relative;
  /* Removed large bottom margin to let flex handle spacing */
}

.controls-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
  margin-right: 12px;
}

.controls-header p {
  margin: 0;
  font-size: 12px;
  color: #666;
}

.sliders-container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  padding-top: 10px; /* Spacing from header */
}




/* 滑动条行样式 */
.control-row {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  height: 32px;
}

.control-row:last-child {
  margin-bottom: 0;
}

.label-group {
  display: flex;
  align-items: center;
  width: 160px;
  gap: 10px;
}

.icon {
  font-size: 20px;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
}

.zoom-icon { color: #3b82f6; }
.yaw-icon { color: #10b981; }
.pitch-icon { color: #a855f7; }

.label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #ccc;
  line-height: 1;
}

.slider-group {
  flex: 1;
  padding: 0 16px;
  display: flex;
  align-items: center;
}

.knob-center {
  justify-content: center;
  gap: 12px;
}

.arrow-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  width: 32px;
  min-width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  transition: all 0.2s;
}

.arrow-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
}

.arrow-btn:active {
  transform: scale(0.95);
}

/* 自定义 Slider 样式 */
.slider {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
  position: relative;
  margin: 0;
}

/* Slider Track Fill Logic */
.slider::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--track-color) 0%, var(--track-color) var(--value), rgba(255, 255, 255, 0.1) var(--value), rgba(255, 255, 255, 0.1) 100%);
}

.slider-blue { --track-color: #3b82f6; }
.slider-green { --track-color: #10b981; }
.slider-purple { --track-color: #a855f7; }

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--track-color);
  cursor: pointer;
  margin-top: -6px; /* center thumb */
  box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.3);
  transition: transform 0.1s;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.value-display {
  width: 48px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.bg-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
.bg-green { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.bg-purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
</style>
