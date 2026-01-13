<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "ScanPreview",
});
</script>

<template>
  <div class="scan-preview">
    <div class="preview-header">
      <span class="dot"></span> SCAN PREVIEW
    </div>
    <div class="preview-content">
      <div class="preview-placeholder"></div>
    </div>
  </div>
</template>

<style scoped>
/* 扫描预览窗口 */
.scan-preview {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 280px;
  height: 160px;
  background: rgba(15, 15, 20, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px;
  z-index: 100;
  color: #fff;
  display: flex;
  flex-direction: column;
}

.preview-header {
  font-size: 10px;
  font-weight: 700;
  color: #a0a0b0;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  letter-spacing: 0.5px;
}

.dot {
  width: 6px;
  height: 6px;
  background-color: #646cff;
  border-radius: 50%;
}

.preview-content {
  flex: 1;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  overflow: hidden;
}
</style>
