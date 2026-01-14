<script lang="ts">
/**
 * Wide Angle Realtime Projection 通用 Demo
 * 用于验证 WideAngleRealtimeProjection 对视频/图片的支持
 */
import { defineComponent, ref, shallowRef, markRaw, watch, onUnmounted, computed } from "vue";
import { View360, WideAngleRealtimeProjection, Projection, ReadyEvent } from "../src/index";

// 使用 Vite 静态资源导入
// @ts-ignore
    // @ts-ignore
    import wideAngleDemoVideo from "./static/output_2160p.mp4?url";
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
          showPreview: false,
          showCrosshair: true
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
        // 使用 WideAngleRealtimeProjection 无需配置 outputWidth/outputHeight
        const correctionSettings = ref<CorrectionSettings>({
          mode: "erp",
          yaw: 0,
          pitch: 15,
          roll: 0.5,
          hfov: 165,
          vfov: 53,
          fisheyeFov: 180
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

        // --- 相机视点到原始视频像素坐标的转换 ---
        // 将相机的 yaw/pitch（矫正后球面上的观看方向）逆向转换为矫正前原始视频上的像素坐标
        const toRad = (deg: number) => deg * Math.PI / 180;

        // 构建旋转矩阵（与 shader 中的 buildRotation 保持一致）
        const buildRotationMatrix = (yawRad: number, pitchRad: number, rollRad: number): number[][] => {
          const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
          const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
          const cr = Math.cos(rollRad), sr = Math.sin(rollRad);

          // Shader logic (Column-Major in GLSL, we emulate Row-Major here matching the GLSL matrix layout)
          // Ry
          // cy  0 -sy
          // 0   1   0
          // sy  0  cy
          const Ry = [
            [cy, 0, -sy],
            [0, 1, 0],
            [sy, 0, cy]
          ];
          // Rx
          // 1   0   0
          // 0   cp  sp
          // 0  -sp  cp
          const Rx = [
            [1, 0, 0],
            [0, cp, sp],
            [0, -sp, cp]
          ];
          // Rz
          // cr -sr  0
          // sr  cr  0
          // 0    0  1
          const Rz = [
            [cr, -sr, 0],
            [sr, cr, 0],
            [0, 0, 1]
          ];

          // R = Rz * Rx * Ry
          const mulMat = (a: number[][], b: number[][]) => {
            const result: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
            for (let i = 0; i < 3; i++) {
              for (let j = 0; j < 3; j++) {
                result[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
              }
            }
            return result;
          };

          return mulMat(Rz, mulMat(Rx, Ry));
        };

        // 矩阵转置（求逆旋转）
        const transposeMat = (m: number[][]): number[][] => {
          return [
            [m[0][0], m[1][0], m[2][0]],
            [m[0][1], m[1][1], m[2][1]],
            [m[0][2], m[1][2], m[2][2]]
          ];
        };

        // 矩阵乘向量
        const mulMatVec = (m: number[][], v: number[]): number[] => {
          return [
            m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
          ];
        };

        // 将相机 yaw/pitch 转换为原始视频像素坐标
        // 核心逻辑：
        // 1. Camera Angle -> Camera Vector (World Space, Corrected)
        // 2. Apply Inverse Correction Rotation -> Source Vector (Source Space)
        // 3. Source Vector -> Spherical (lon, lat) -> UV -> Pixel
        const cameraToSourcePixel = (
          cameraYaw: number,  // 相机 yaw（度）
          cameraPitch: number // 相机 pitch（度）
        ): { x: number; y: number; valid: boolean } => {
          const settings = correctionSettings.value;
          
          // 获取视频/图片尺寸
          const videoEl = getVideoElement();
          let srcW = 3840, srcH = 2160; // 默认值
          
          // 尝试更精确地获取尺寸
          const viewerComp = view360Ref.value as any;
          if (viewerComp && viewerComp.view360 && viewerComp.view360._mesh) {
            const tex = viewerComp.view360._mesh.getTexture();
            if (tex) {
              srcW = tex.width || srcW;
              srcH = tex.height || srcH;
            }
          } else if (videoEl && videoEl.videoWidth > 0) {
            srcW = videoEl.videoWidth;
            srcH = videoEl.videoHeight;
          }

          // 1. Camera Angle -> Vector
          // Camera Yaw: +Looking Left (CCW). Math Phi: 0=+Z, +Phi=+X (Right).
          // So Math Phi = -CameraYaw.
          // Camera Pitch: +Looking Up. Math Lat: +Up. 
          // So Math Lat = CameraPitch.
          const cYawRad = toRad(-cameraYaw);
          const cPitchRad = toRad(cameraPitch);

          // Vcam = (x, y, z) = (cosLat*sinPhi, sinLat, cosLat*cosPhi) matches shader coordinate system
          const cy = Math.cos(cYawRad), sy = Math.sin(cYawRad);
          const cp = Math.cos(cPitchRad), sp = Math.sin(cPitchRad);
          const Vcam = [cp * sy, sp, cp * cy];

          // 2. Inverse Correction
          // Shader uses: uRotYPR = [-yaw, -pitch, roll]
          // Shader Logic: imgDir = Rinv * worldDir
          // So we replicate R using shader parameters, then transpose it.
          const rYawRad = toRad(-settings.yaw);
          const rPitchRad = toRad(-settings.pitch);
          const rRollRad = toRad(settings.roll);
          
          const R = buildRotationMatrix(rYawRad, rPitchRad, rRollRad);
          const Rinv = transposeMat(R);
          
          const Vsrc = mulMatVec(Rinv, Vcam);

          // 3. Vector -> UV
          // lon = atan2(x, z)
          // lat = asin(y)
          const vx = Vsrc[0], vy = Vsrc[1], vz = Vsrc[2];
          const lon = Math.atan2(vx, vz); // [-PI, PI]
          const lat = Math.asin(Math.max(-1, Math.min(1, vy))); // [-PI/2, PI/2]

          // UV Mapping
          // Shader: u = (lon / hfov + 0.5) * (imgX - 1)
          // Shader: v = (0.5 - lat / vfov) * (imgY - 1)
          const fovH = toRad(Math.max(1e-6, settings.hfov));
          const fovV = toRad(Math.max(1e-6, settings.vfov));

          const px = (lon / fovH + 0.5) * (srcW - 1);
          const py = (0.5 - lat / fovV) * (srcH - 1);

          // 检查是否在图像范围内
          const valid = px >= 0 && px < srcW && py >= 0 && py < srcH;

          return { x: px, y: py, valid };
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
            // 使用优化后的 WideAngleRealtimeProjection，直接在球体渲染时完成矫正
            // 无需离屏 FBO，性能更好，无需配置输出分辨率
            projection.value = markRaw(new WideAngleRealtimeProjection({
              src: url,
              video: isVideoSource.value,
              mode: s.mode,
              yaw: s.yaw,
              pitch: s.pitch,
              roll: s.roll,
              hfov: s.hfov,
              vfov: s.vfov,
              fisheyeFov: s.fisheyeFov
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

            // 计算相机中心视点对应的原始视频像素坐标
            const sourcePixel = cameraToSourcePixel(nextYaw, e.pitch);
            
            // 更新 UI 显示
            currentSourcePixel.value = {
              x: sourcePixel.x,
              y: sourcePixel.y,
              valid: sourcePixel.valid
            };

            console.log("[相机→原始像素坐标]", {
              cameraYaw: nextYaw.toFixed(2) + "°",
              cameraPitch: e.pitch.toFixed(2) + "°",
              sourceX: sourcePixel.valid ? sourcePixel.x.toFixed(2) : "N/A",
              sourceY: sourcePixel.valid ? sourcePixel.y.toFixed(2) : "N/A",
              valid: sourcePixel.valid
            });
            
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

        // --- 像素反向定位逻辑 ---
        const targetPixelX = ref(0);
        const targetPixelY = ref(0);
        
        // 当前视点对应的原始像素坐标
        const currentSourcePixel = ref({ x: 0, y: 0, valid: false });
        
        const toDeg = (rad: number) => rad * 180 / Math.PI;

        const sourcePixelToCameraAngles = (px: number, py: number): { yaw: number, pitch: number } | null => {
           const settings = correctionSettings.value;
           
           // 获取视频/图片尺寸 (复用逻辑)
           const videoEl = getVideoElement();
           let srcW = 3840, srcH = 2160;
           
           const viewerComp = view360Ref.value as any;
           if (viewerComp && viewerComp.view360 && viewerComp.view360._mesh) {
             const tex = viewerComp.view360._mesh.getTexture();
             if (tex) {
               srcW = tex.width || srcW;
               srcH = tex.height || srcH;
             }
           } else if (videoEl && videoEl.videoWidth > 0) {
             srcW = videoEl.videoWidth;
             srcH = videoEl.videoHeight;
           }

           // 1. Pixel -> UV
           // center_x = fixed_center_x + (lon / fovH) * (srcW - 1)
           // (center_x - fixed_center_x) / (srcW - 1) * fovH = lon
           const fixedCenterX = (srcW - 1) / 2;
           const fixedCenterY = (srcH - 1) / 2;
           
           const fovH = Math.max(1e-6, settings.hfov);
           const fovV = Math.max(1e-6, settings.vfov);
           
           // 反解 lon/lat (角度)
           const lonDeg = ((px - fixedCenterX) / (srcW - 1)) * fovH;
           // Y轴反转：屏幕 Y 向下增大，Latitude 向上增大
           const latDeg = -((py - fixedCenterY) / (srcH - 1)) * fovV;
           
           // 转换为弧度
           const lon = toRad(lonDeg);
           const lat = toRad(latDeg);

           // 3. Spherical -> Source Vector Vsrc
           // 对应 Shader/Forward 逻辑:
           // cosLat = cos(lat), sinLat = sin(lat)
           // worldDir = (cosLat*sinPhi, sinLat, cosLat*cosPhi)
           // 此处的 Phi 对应 lon, Lat 对应 lat
           const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
           const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
           // Vsrc = [x, y, z]
           const Vsrc = [cosLat * sinLon, sinLat, cosLat * cosLon];

           // 4. Apply Correction (Forward)
           // Forward: imgDir = Rinv * worldDir (Camera Space) -> 这里命名有点混淆
           // 让我们理清前面的 Forward 变换：
           // Camera Space (WorldDir) --[Rinv]--> Source Space (imgDir) --[Mapping]--> Pixel
           // 现在我们要反过来: Pixel --[Inverse Mapping]--> Source Space (imgDir) --[R]--> Camera Space (WorldDir)
           // Vsrc 即为上面的 imgDir
           // Vcam 即为上面的 WorldDir
           // Vcam = R * Vsrc
           
           const rYawRad = toRad(-settings.yaw);
           const rPitchRad = toRad(-settings.pitch);
           const rRollRad = toRad(settings.roll);
           
           const R = buildRotationMatrix(rYawRad, rPitchRad, rRollRad);
           const Vcam = mulMatVec(R, Vsrc);

           // 5. Vcam -> Camera Angles
           // Vcam = [cp * sy, sp, cp * cy]  where y=-yaw, p=pitch
           // y = sp
           // x = cp * sy
           // z = cp * cy
           const camX = Vcam[0];
           const camY = Vcam[1];
           const camZ = Vcam[2];

           const pitchRad = Math.asin(Math.max(-1, Math.min(1, camY)));
           const yawRad = Math.atan2(camX, camZ);

           const camPitch = toDeg(pitchRad);
           const CAM_YAW_SIGN_CORRECTION = -1; // 因为 cYawRad = toRad(-cameraYaw)
           const camYaw = toDeg(yawRad) * CAM_YAW_SIGN_CORRECTION;

           return { yaw: camYaw, pitch: camPitch };
        };

        const locatePixel = async () => {
          const px = targetPixelX.value;
          const py = targetPixelY.value;
          
          const result = sourcePixelToCameraAngles(px, py);
          console.log("[定位像素]", { px, py }, "=>", result);
          
          if (result && view360Ref.value) {
            // Normalize yaw
            const targetYaw = normalizeYawTo360(result.yaw);
            
            await view360Ref.value.camera.animateTo({
              yaw: targetYaw,
              pitch: result.pitch,
              duration: 1000,
              easing: (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2 // easeInOutQuad
            });
          }
        };
        const onLoadStart = () => {
          isLoading.value = true;
        };

        const onLoad = () => {
          isLoading.value = false;
        };

        const onError = (err: Error) => {
          console.error("View360 Error:", err);
          errorMessage.value = err.message;
          isLoading.value = false;
        };

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
          

          
          currentCameraFov,

          // Pixel Locator
          targetPixelX,
          targetPixelY,
          locatePixel,
          currentSourcePixel
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
          <label class="setting-item">
            <input type="checkbox" v-model="uiConfig.showCrosshair">
            <span>Debug Crosshair</span>
          </label>
        </div>

        <div class="layout-grid">
          <!-- 左侧边栏 -->
          <aside class="left-sidebar" v-if="uiConfig.showSidebar">
            <!-- 0. 像素定位器 -->
            <div class="pixel-locator-panel">
              <div class="panel-header">像素定位 (Pixel Locator)</div>
              
              <!-- Current Viewer Center Info -->
              <div class="current-pixel-info">
                <span class="info-label">Current Center:</span>
                <span class="info-value" :class="{ invalid: !currentSourcePixel.valid }">
                  {{ currentSourcePixel.valid ? `X: ${Math.round(currentSourcePixel.x)}  Y: ${Math.round(currentSourcePixel.y)}` : 'Out of Bounds' }}
                </span>
              </div>

              <div class="locator-controls">
                <div class="input-group">
                  <label>X:</label>
                  <input type="number" v-model.number="targetPixelX" placeholder="X" @keydown.enter="locatePixel" />
                </div>
                <div class="input-group">
                  <label>Y:</label>
                  <input type="number" v-model.number="targetPixelY" placeholder="Y" @keydown.enter="locatePixel" />
                </div>
                <button class="locate-btn" @click="locatePixel">定位 (Locate)</button>
              </div>
            </div>

            <!-- 1. 矫正参数 (占据全高) -->
            <CorrectionPanel 
              v-model="correctionSettings"
              v-model:sourceType="sourceType"
              @apply="applyCorrectionSettings"
              class="sidebar-panel"
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

                <!-- 十字准星 (仅调试用) -->
                <div v-if="uiConfig.showCrosshair" class="view-crosshair">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="4" x2="12" y2="20"></line>
                    <line x1="4" y1="12" x2="20" y2="12"></line>
                  </svg>
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

/* Pixel Locator Panel */
.pixel-locator-panel {
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-header {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
}

.current-pixel-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 10px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.current-pixel-info .info-label {
  color: #aaa;
  font-size: 11px;
}

.current-pixel-info .info-value {
  color: #4ade80; /* Green for valid */
  font-family: monospace;
  font-size: 12px;
  font-weight: 600;
}

.current-pixel-info .info-value.invalid {
  color: #ef4444; /* Red for invalid */
}

.locator-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-group label {
  color: #aaa;
  font-size: 12px;
  width: 20px;
}

.input-group input {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  padding: 6px 8px;
  font-size: 13px;
}

.input-group input:focus {
  border-color: #6366f1;
  outline: none;
}

.locate-btn {
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 4px;
}

.locate-btn:hover {
  background: #4f46e5;
}

/* Sidebar Styles */
.left-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 320px;
  flex-shrink: 0;
}

.sidebar-panel {
  /* Remove fill-height constraint if strictly enforcing layout issues */
  flex-shrink: 0; 
}

/* Debug Crosshair */
.view-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 100;
  color: rgba(255, 255, 255, 0.8);
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
}

.view-crosshair svg {
  width: 100%;
  height: 100%;
  stroke: #ff3b30; /* Vivid Red */
  stroke-width: 1.5;
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
