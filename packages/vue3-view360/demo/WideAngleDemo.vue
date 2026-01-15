<script lang="ts">
/**
 * Wide Angle Correction Projection 通用 Demo
 * 用于验证 WideAngleCorrectionProjection 对视频/图片的支持
 */
import { defineComponent, ref, shallowRef, markRaw, watch, onUnmounted, computed } from "vue";
import { View360, WideAngleCorrectionProjection, Projection, ReadyEvent } from "../src/index";

// 使用 Vite 静态资源导入
// @ts-ignore
    // @ts-ignore
    import wideAngleDemoVideo from "./static/output_fast.mp4?url";
    // @ts-ignore
    import wideAngleDemoImage from "./static/vlcsnap-2026-01-12-19h08m25s542.png?url";

    import CameraMinimap from "./components/CameraMinimap.vue";
    import CorrectionPanel, { CorrectionSettings } from "./components/CorrectionPanel.vue";
    import CameraControls from "./components/CameraControls.vue";
    import ResultPreview from "./components/ResultPreview.vue";

    export default defineComponent({
      name: "WideAngleDemo",
      components: {
        View360,
        CameraMinimap,
        CorrectionPanel,
        CameraControls,
        ResultPreview
      },
      setup() {
        const view360Ref = ref<View360>();
        
        // UI Configuration State
        const isSettingsOpen = ref(false);
        const uiConfig = ref({
          showSidebar: true,
          showMinimap: false,
          showControls: true,
          showPreview: false
        });

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
          outputWidth: 15360,
          outputHeight: 7680
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
        
        // 计算当前相机垂直 FOV (假设 Base FOV 为 65度)
        const currentCameraFov = computed(() => {
          // simple approximation: deg = 2 * atan( tan(base/2) / zoom )
          const baseFovRad = 65 * Math.PI / 180;
          const fovRad = 2 * Math.atan(Math.tan(baseFovRad / 2) / zoom.value);
          return fovRad * 180 / Math.PI;
        });

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
        
        // Helper to find video element
        const getVideoElement = () => {
          const viewerComp = view360Ref.value as any;
          if (!viewerComp) return null;
          
          // The Vue wrapper stores the vanilla instance in 'view360' data property
          const viewer = viewerComp.view360 || viewerComp;

          // 1. Try accessing the texture source directly from View360 internals
          const mesh = viewer._mesh; 
          if (mesh) {
            const texture = mesh.getTexture();
            if (texture && texture.isVideo()) {
              return texture.source as HTMLVideoElement;
            }
          }

          // 2. Fallback: Search in DOM (less reliable)
          const renderer = viewer._renderer;
          if (renderer && renderer.canvas && renderer.canvas.parentElement) {
            const videoInParent = renderer.canvas.parentElement.querySelector("video");
            if (videoInParent) return videoInParent;
          }

          return document.querySelector("video");
        };

        // Video Controls
        const isPlaying = ref(true);

        const togglePlay = () => {
          const video = getVideoElement();
          console.log("[togglePlay] Video Element:", video, "Current State:", video ? (video.paused ? "Paused" : "Playing") : "N/A");

          if (!video) return;

          if (video.paused) {
            video.play().then(() => {
              isPlaying.value = true;
            }).catch(err => console.error("Play failed:", err));
          } else {
            video.pause();
            isPlaying.value = false;
          }
        };

        const restartVideo = () => {
          const video = getVideoElement();
          if (!video) return;
          
          video.currentTime = 0;
          video.play().then(() => {
            isPlaying.value = true;
          }).catch(err => console.error("Replay failed:", err));
        };

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

          // Sync Play State
          if (isVideoSource.value) {
             const videoEl = getVideoElement();
             if (videoEl) {
               // Update isPlaying state based on actual video state
               isPlaying.value = !videoEl.paused;
               
               // Optional: listen to native events to keep state in sync
               videoEl.onplay = () => isPlaying.value = true;
               videoEl.onpause = () => isPlaying.value = false;
             }
          }

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
            // 重要：保留高精度数值以确保 Minimap 平滑旋转，避免 Math.round 导致的卡顿
            const nextYaw = normalizeYawTo360(rawYaw);

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
            pitch.value = e.pitch;
            zoom.value = e.zoom;
            
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
          // UI Config
          isSettingsOpen,
          uiConfig,
          
          // Video Controls
          isPlaying,
          togglePlay,
          restartVideo,

          // Methods
          onReady,
          onLoadStart,
          onLoad,
          onError,

          applyCorrectionSettings,
          
          currentCameraFov
        };
      }
    });
    </script>
    
    <template>
      <div class="demo-container">
        <!-- UI Configuration Toggle -->
        <button class="ui-settings-trigger" @click="isSettingsOpen = !isSettingsOpen" title="View Options">
          <!-- Settings Icon (SVG) -->
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>

        <!-- UI Configuration Panel -->
        <div v-if="isSettingsOpen" class="ui-settings-panel">
          <div class="settings-header">
            <span>View Options</span>
            <button class="close-btn" @click="isSettingsOpen = false">
              <!-- X Icon (SVG) -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <label class="setting-item">
            <input type="checkbox" v-model="uiConfig.showSidebar">
            <span>Sidebar</span>
          </label>
          <label class="setting-item">
            <input type="checkbox" v-model="uiConfig.showMinimap">
            <span>Minimap</span>
          </label>
          <label class="setting-item">
            <input type="checkbox" v-model="uiConfig.showControls">
            <span>Controls</span>
          </label>
          <label class="setting-item">
            <input type="checkbox" v-model="uiConfig.showPreview">
            <span>Result Preview</span>
          </label>
        </div>

        <div class="layout-grid">
          <!-- 左侧边栏 -->
          <aside class="left-sidebar" v-if="uiConfig.showSidebar">
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
            <div class="minimap-wrapper" v-if="uiConfig.showMinimap">
              <CameraMinimap
                :yaw="yaw" 
                :pitch="pitch"
                :fov="currentCameraFov"
              />
            </div>

            <!-- 视频控制按钮组 (播放/暂停 + 重播) -->
            <div class="video-controls" v-if="sourceType === 'video'">
              <button class="control-btn" @click="togglePlay" :title="isPlaying ? 'Pause' : 'Play'">
                <svg v-if="isPlaying" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
              
              <button class="control-btn" @click="restartVideo" title="Replay">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
            </div>
          </div>
          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>
        </div>

        <!-- 2 & 3. 底部控制区 (相机控制 + 结果预览) -->
        <div class="bottom-controls" v-if="uiConfig.showControls || uiConfig.showPreview">
          <div class="controls-container" v-if="uiConfig.showControls">
            <CameraControls
              v-model:yaw="yaw"
              v-model:pitch="pitch"
              v-model:zoom="zoom"
              :zoomRangeMin="zoomRangeMin"
              :zoomRangeMax="zoomRangeMax"
            />
          </div>

          <ResultPreview 
            v-if="uiConfig.showPreview"
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
  position: relative; /* For absolute positioning of settings */
}

/* Video Controls Group */
.video-controls {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  gap: 10px;
}

.control-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
  padding: 0;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.control-btn:active {
  transform: scale(0.95);
}

.layout-grid {
  display: flex;
  width: 100%;
  max-width: 1500px;
  gap: 20px;
  height: 100%;
}

/* UI Settings Toggle */
.ui-settings-trigger {
  position: absolute;
  top: 30px;
  left: 30px;
  z-index: 1000;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(8px);
}

.ui-settings-trigger:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: rotate(90deg);
}

.ui-settings-panel {
  position: absolute;
  top: 80px;
  left: 30px;
  z-index: 1000;
  width: 200px;
  background: rgba(20, 20, 20, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  color: #a5b4fc;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.close-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
  margin: -4px;
}
.close-btn:hover { color: #fff; }

.setting-item {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.setting-item input[type="checkbox"] {
  accent-color: #6366f1;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.setting-item span {
  color: #e5e5e5;
  font-size: 14px;
}

/* Left Sidebar */
.left-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 320px;
  flex-shrink: 0;
  height: 100%;
  transition: width 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
}

/* Bottom Controls Container */
.bottom-controls {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 220px;
  align-items: stretch;
  transition: height 0.3s ease, opacity 0.3s ease;
}

.controls-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: stretch;
}

.controls-container :deep(.camera-controls) {
  width: 100%;
  height: 100%;
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
  min-width: 0;
  height: 100%;
}

/* Viewer Section */
.viewer-section {
  position: relative;
  width: 100%;
  /* flex: 1; If we want it to fill available space when controls are hidden */
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: #000;
  border-radius: 16px;
  transition: all 0.3s ease;
}

/* When bottom controls are hidden, we might want viewer to expand, 
   but keeping aspect ratio 16/9 is usually better for video content.
   Let's keep it 16/9 centered or allow it to grow if needed. 
   For now, keeping standard aspect ratio behavior. 
*/

.viewer-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9; 
  background: #000;
  box-shadow: 0 0 40px rgba(0,0,0,0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
}

.viewer-wrapper :deep(.view360-container),
.viewer-wrapper :deep(.view360-canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  outline: none;
}

.minimap-wrapper {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 320px;
  height: 180px; /* 16:9 */
  z-index: 100;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  border-radius: 12px;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
</style>
