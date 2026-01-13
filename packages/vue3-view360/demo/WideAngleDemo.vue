<script lang="ts">
/**
 * Wide Angle Correction Projection 通用 Demo
 * 用于验证 WideAngleCorrectionProjection 对视频/图片的支持
 */
import { defineComponent, ref, shallowRef, markRaw, watch, onUnmounted } from "vue";
import { View360, WideAngleCorrectionProjection, Projection, ReadyEvent } from "../src/index";

// 使用 Vite 静态资源导入
// @ts-ignore
import wideAngleDemoVideo from "./static/20260112112421_186_374.mp4?url";
// @ts-ignore
import wideAngleDemoImage from "./static/vlcsnap-2026-01-12-19h08m25s542.png?url";

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
    
    // 资源源
    const currentVideoUrl = ref(wideAngleDemoVideo || "");
    const currentImageUrl = ref(wideAngleDemoImage);
    const sourceType = ref<"video" | "image">("video");
    
    // 调试日志
    console.log("[WideAngleDemo] Initial sources:", { video: wideAngleDemoVideo, image: wideAngleDemoImage });

    // 保存创建的 blob url 以便释放
    const currentBlobUrl = ref<string | null>(null);

    // Projection
    const projection = shallowRef<Projection | null>(null);

    // --- 矫正参数 (Correction Params) ---
    const correctionSettings = ref<CorrectionSettings>({
      mode: "erp",
      yaw: 0,
      pitch: 15,
      roll: 0.5,
      hfov: 165,
      vfov: 53,
      fisheyeFov: 180,
      outputWidth: 4096,
      outputHeight: 2048
    });

    // --- 相机控制参数 (Camera Controls) ---
    // yaw/pitch 单位为度(°)，zoom 为缩放倍率(默认范围 0.6 ~ 10)
    const yaw = ref(0);
    const pitch = ref(0);
    const zoom = ref(1);
    const isVideoSource = ref(true); // 内部状态
    
    // 监听 sourceType 变化，自动切换 isVideoSource 并重载投影
    watch(sourceType, (newType) => {
      isVideoSource.value = newType === "video";
      const url = newType === "video" ? currentVideoUrl.value : currentImageUrl.value;
      createProjection(url);
    });
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
      const url = currentBlobUrl.value || (sourceType.value === "video" ? currentVideoUrl.value : currentImageUrl.value);
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
      currentImageUrl,
      sourceType,
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
    <div class="layout-grid">
      <!-- 左侧边栏 -->
      <aside class="left-sidebar">
        <!-- 1. 矫正参数 (占据全高) -->
        <CorrectionPanel 
          v-model="correctionSettings"
          v-model:sourceType="sourceType"
          @apply="applyCorrectionSettings"
          class="sidebar-panel fill-height"
        />
      </aside>

      <!-- 右侧主要内容 -->
      <main class="right-content">
        <!-- 视频播放器区域 -->
        <div class="viewer-section">
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

            <!-- 扫描预览 (Viewer 内部右上角) -->
            <ScanPreview />
          </div>
          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>
        </div>

        <!-- 2 & 3. 底部控制区 (相机控制 + 结果预览) -->
        <div class="bottom-controls">
          <div class="controls-container">
            <CameraControls
              v-model:yaw="yaw"
              v-model:pitch="pitch"
              v-model:zoom="zoom"
              :zoomRangeMin="zoomRangeMin"
              :zoomRangeMax="zoomRangeMax"
            />
          </div>

          <ResultPreview 
            :settings="correctionSettings"
            :src="sourceType === 'video' ? currentVideoUrl : currentImageUrl"
            :is-video="sourceType === 'video'"
            class="bottom-preview"
          />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.demo-container {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 30px;
  box-sizing: border-box;
  background: #000;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  display: flex;
  justify-content: center;
}

.layout-grid {
  display: flex;
  width: 100%;
  max-width: 1500px; /* Reduced from 1800px */
  gap: 20px;
  height: 100%;
}

/* Left Sidebar */
.left-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 320px;
  flex-shrink: 0;
  height: 100%;
}

/* Bottom Controls Container */
.bottom-controls {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 220px; /* Fixed height for alignment */
  align-items: stretch;
}

.controls-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: stretch; /* Ensure child fills height */
}

.controls-container :deep(.camera-controls) {
  width: 100%;
  height: 100%; /* Fill container */
}

.bottom-preview {
  height: 100%;
  width: auto;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Right Content */
.right-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-width: 0; /* Fix flex child overflow */
  height: 100%;
}

/* Viewer Section */
.viewer-section {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  justify-content: center; /* Center vertically if 16:9 leaves gaps */
  background: #000; /* Visualize bounds */
  border-radius: 16px;
  /* border: 1px solid rgba(255, 255, 255, 0.1); Optional frame around section */
}

.viewer-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9; 
  background: #000;
  box-shadow: 0 0 40px rgba(0,0,0,0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;   /* Clip overflow */
}

.viewer-wrapper :deep(.view360-container),
.viewer-wrapper :deep(.view360-canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  outline: none;
}
</style>
