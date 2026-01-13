<script lang="ts">
/**
 * Wide Angle Correction Projection 通用 Demo
 * 用于验证 WideAngleCorrectionProjection 对视频/图片的支持
 */
import { defineComponent, ref, shallowRef, markRaw, watch, onUnmounted } from "vue";
import { View360, WideAngleCorrectionProjection, Projection, ReadyEvent } from "../src/index";

// 使用 Vite 静态资源导入
// @ts-ignore
import wideAngleDemoVideo from "./static/3e559a623481993df8ddabbd82d6fa40_raw.mp4?url";

import ScanPreview from "./components/ScanPreview.vue";
import CorrectionPanel, { CorrectionSettings } from "./components/CorrectionPanel.vue";
import CameraControls from "./components/CameraControls.vue";
import ResultPreview from "./components/ResultPreview.vue";

export default defineComponent({
  name: "WideAngleDemo",
  components: {
    View360,
    ScanPreview,
    CorrectionPanel,
    CameraControls,
    ResultPreview
  },
  setup() {
    const view360Ref = ref<View360>();
    
    // 视频源
    // 确保有默认值，避免传递 undefined 给子组件
    const currentVideoUrl = ref(wideAngleDemoVideo || "");
    
    // 调试日志
    console.log("[WideAngleDemo] Initial video url:", wideAngleDemoVideo);

    // 保存创建的 blob url 以便释放
    const currentBlobUrl = ref<string | null>(null);

    // Projection
    const projection = shallowRef<Projection | null>(null);

    // --- 矫正参数 (Correction Params) ---
    const correctionSettings = ref<CorrectionSettings>({
      mode: "erp",
      yaw: 0,
      pitch: 0,
      roll: 0,
      hfov: 180,
      vfov: 90,
      fisheyeFov: 180,
      outputWidth: 4096,
      outputHeight: 2048
    });

    // --- 相机控制参数 (Camera Controls) ---
    // yaw/pitch 单位为度(°)，zoom 为缩放倍率(默认范围 0.6 ~ 10)
    const yaw = ref(0);
    const pitch = ref(0);
    const zoom = ref(1);
    const isVideoSource = ref(true); // 当前资源是否为视频（用于 projection.video）
    // zoomRange 在核心库默认是 0.6 ~ 10，这里保持一致；若外部配置了 zoomRange，会在 ready 后同步更新
    const zoomRangeMin = ref(0.6);
    const zoomRangeMax = ref(10);
    const isSyncingFromViewer = ref(false); // 防止 viewChange 回写触发 watch 循环
    const enableCameraDebugLog = ref(true); // 调试用：相机参数日志开关

    // 将任意 yaw 归一化到 [0, 360)
    const normalizeYawTo360 = (inputYaw: number) => {
      const mod = ((inputYaw % 360) + 360) % 360;
      return mod;
    };
    const shouldLogYawWrap = (prevYaw: number, nextYaw: number, rawYaw: number) => {
      // 当 rawYaw 接近 360 或 0，或 yaw 发生大跳变时才打印（避免刷屏）
      const rawNearEdge = rawYaw > 350 || rawYaw < 10;
      const yawJump = Math.abs(nextYaw - prevYaw) > 180;
      return rawNearEdge || yawJump;
    };

    // 状态
    const isLoading = ref(false);
    const errorMessage = ref("");

    // 创建 projection (只在视频源改变时调用)
    function createProjection(url: string = currentVideoUrl.value) {
      isLoading.value = true;
      errorMessage.value = "";

      try {
        const s = correctionSettings.value;
        projection.value = markRaw(new WideAngleCorrectionProjection({
          src: url,
          video: isVideoSource.value,
          mode: s.mode,
          yaw: s.yaw,
          pitch: s.pitch,
          roll: s.roll,
          hfov: s.hfov,
          vfov: s.vfov,
          fisheyeFov: s.fisheyeFov,
          outputWidth: s.outputWidth,
          outputHeight: s.outputHeight
        }));
      } catch (err) {
        errorMessage.value = String(err);
        isLoading.value = false;
      }
    }

    // 更新投影设置 (点击应用按钮时调用)
    function applyCorrectionSettings() {
      // 如果有 blob url，优先使用
      const url = currentBlobUrl.value || currentVideoUrl.value;
      createProjection(url);
    }

    // 监听 Slider 变化更新相机
    watch([yaw, pitch, zoom], async ([newYaw, newPitch, newZoom]) => {
      if (isSyncingFromViewer.value) return;
      const viewer = view360Ref.value;
      if (!viewer) return;

      // 使用 Camera.animateTo 进行平滑过渡
      if (enableCameraDebugLog.value) {
        console.log("[camera-controls] slider->camera.animateTo", {
          yaw: newYaw,
          pitch: newPitch,
          zoom: newZoom
        });
      }
      
      await viewer.camera.animateTo({
        yaw: newYaw,
        pitch: newPitch,
        zoom: newZoom,
        duration: 1000,
        easing: (x) => x
      });

      // 同步 control 内部状态，避免用户后续拖拽时出现跳变
      viewer.control.sync();
    });

    function onReady(evt: ReadyEvent) {
      console.log("View360 Ready:", evt);
      isLoading.value = false;
      const viewer = view360Ref.value;
      if (!viewer) return;

      // 同步 zoomRange（若外部设置了 zoomRange）
      const currentZoomRange = viewer.camera.zoomRange;
      if (currentZoomRange) {
        zoomRangeMin.value = currentZoomRange.min;
        zoomRangeMax.value = currentZoomRange.max;
      }

      // 初始化相机位置
      viewer.camera.lookAt({
        yaw: yaw.value,
        pitch: pitch.value,
        zoom: zoom.value
      });
      viewer.control.sync();
      
      // 监听用户拖拽导致的视角变化，同步回 Slider
      viewer.on("viewChange", (e) => {
        isSyncingFromViewer.value = true;
        const prevYaw = yaw.value;
        const rawYaw = e.yaw;
        // 重要：避免 Math.round 把 359.6... 变成 360，导致 UI 出现 360°
        const nextYaw = Math.round(normalizeYawTo360(rawYaw)) % 360;

        // 关键日志：观察 yaw 从 0 往左拖时为何变成 360
        if (enableCameraDebugLog.value && shouldLogYawWrap(prevYaw, nextYaw, rawYaw)) {
          console.log("[camera-controls] viewChange yaw wrap/debug", {
            rawYaw,
            rawYawNormalized360: normalizeYawTo360(rawYaw),
            prevYaw,
            nextYaw,
            note: "rawYaw 为 Camera 内部 [0,360) 值；Yaw 控件使用旋钮以适配环绕区间"
          });
        }

        // yaw 使用 [0, 360) 区间，匹配 Camera 内部值
        yaw.value = nextYaw;
        pitch.value = Math.round(e.pitch);
        zoom.value = Number(e.zoom.toFixed(2));
        Promise.resolve().then(() => {
          isSyncingFromViewer.value = false;
        });
      });

      // 额外日志：记录输入开始/结束，方便排查跳变发生在什么阶段
      if (enableCameraDebugLog.value) {
        viewer.on("inputStart", (evt: any) => {
          if (evt?.inputType !== "rotate") return;
          console.log("[camera-controls] inputStart(rotate)", {
            isTouch: evt.isTouch,
            isKeyboard: evt.isKeyboard
          });
        });
        viewer.on("inputEnd", (evt: any) => {
          if (evt?.inputType !== "rotate") return;
          console.log("[camera-controls] inputEnd(rotate)", {
            isTouch: evt.isTouch,
            isKeyboard: evt.isKeyboard,
            scrolling: evt.scrolling
          });
        });
      }
    }

    function onLoadStart() {
      isLoading.value = true;
    }

    function onLoad() {
      isLoading.value = false;
    }

    function onError(err: Error) {
      console.error("View360 Error:", err);
      errorMessage.value = err.message;
      isLoading.value = false;
    }



    // 初始加载
    createProjection(currentVideoUrl.value);

    onUnmounted(() => {
      if (currentBlobUrl.value) {
        URL.revokeObjectURL(currentBlobUrl.value);
      }
    });

    return {
      view360Ref,
      projection,
      // Camera
      yaw,
      pitch,
      zoom,
      zoomRangeMin,
      zoomRangeMax,
      // Correction
      correctionSettings,
      // State
      isLoading,
      errorMessage,
      currentVideoUrl,
      isVideoSource,
      // Methods
      onReady,
      onLoadStart,
      onLoad,
      onError,

      applyCorrectionSettings
    };
  }
});
</script>

<template>
  <div class="demo-container">
    <!-- 视频播放器区域 -->
    <main class="viewer-section">
      <div class="viewer-wrapper">
        <View360
          v-if="projection"
          ref="view360Ref"
          :projection="projection"
          :tab-index="1"
          class="viewer"
          @ready="onReady"
          @load-start="onLoadStart"
          @load="onLoad"
          @error="onError"
        />
        <div v-if="isLoading" class="loading-overlay">
          <div class="spinner"></div>
          <span>加载中...</span>
        </div>
      </div>
      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>

      <!-- 扫描预览 (右上角) -->
      <ScanPreview />

      <!-- 结果预览 (左下角) -->
      <ResultPreview 
        :settings="correctionSettings"
        :src="currentVideoUrl"
        :is-video="isVideoSource"
      />

      <!-- 矫正参数设置面板 (左侧) -->
      <CorrectionPanel 
        v-model="correctionSettings"
        @apply="applyCorrectionSettings"
      />

      <!-- 底部控制面板 -->
      <CameraControls
        v-model:yaw="yaw"
        v-model:pitch="pitch"
        v-model:zoom="zoom"
        :zoomRangeMin="zoomRangeMin"
        :zoomRangeMax="zoomRangeMax"

      />
    </main>
  </div>
</template>

<style scoped>
.demo-container {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
  background: #000;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
}

.viewer-section {
  width: 100%;
  height: 100%;
  position: relative;
}

.viewer-wrapper {
  width: 100%;
  height: 100%;
}

.viewer-wrapper :deep(.view360-container),
.viewer-wrapper :deep(.view360-canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  outline: none;
}

/* Loading & Error */
.loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  gap: 12px;
  z-index: 10;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: #ef4444;
  color: #fff;
  border-radius: 8px;
  z-index: 200;
  font-size: 14px;
}
</style>
