<template>
  <div class="knob-control" ref="knobRef" @mousedown="handleStart" @touchstart.prevent="handleStart">
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" class="knob-track" />
      <line 
        x1="50" y1="50" 
        x2="50" y2="10" 
        class="knob-pointer" 
        :transform="`rotate(${(360 - modelValue) % 360}, 50, 50)`" 
      />
    </svg>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onUnmounted } from "vue";

export default defineComponent({
  name: "KnobControl",
  props: {
    modelValue: {
      type: Number,
      required: true
    }
  },
  emits: ["update:modelValue", "start", "end"],
  setup(props, { emit }) {
    const knobRef = ref<HTMLElement | null>(null);
    const isDragging = ref(false);

    const updateAngle = (clientX: number, clientY: number) => {
      if (!knobRef.value) return;
      const rect = knobRef.value.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      
      // Math.atan2(y, x) 返回弧度
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      angle = (angle + 90 + 360) % 360; // 这里的 angle 是视觉顺时针角度
      
      // 因为 View360 的 Yaw 是逆时针的，所以我们要把视觉角度转为逆时针值
      emit("update:modelValue", (360 - Math.round(angle)) % 360);
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.value) return;
      
      let clientX, clientY;
      if ("touches" in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }
      
      updateAngle(clientX, clientY);
    };

    const handleEnd = () => {
      if (!isDragging.value) return;
      isDragging.value = false;
      emit("end");
      
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };

    const handleStart = (e: MouseEvent | TouchEvent) => {
      isDragging.value = true;
      emit("start");
      
      // 立即更新一次
      let clientX, clientY;
      if ("touches" in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }
      updateAngle(clientX, clientY);

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", handleEnd);
    };

    onUnmounted(() => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    });

    return {
      knobRef,
      handleStart
    };
  }
});
</script>

<style scoped>
.knob-control {
  width: 40px;
  height: 40px;
  cursor: pointer;
  touch-action: none;
  display: inline-block;
  vertical-align: middle;
}
.knob-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 12;
}
.knob-pointer {
  stroke: #10b981; /* Green */
  stroke-width: 12;
  stroke-linecap: round;
}
</style>
