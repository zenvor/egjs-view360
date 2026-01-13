<script lang="ts">
import { defineComponent, ref, PropType, shallowRef, watch, markRaw, onMounted } from "vue";
import { View360, WideAngleCorrectionProjection, Projection } from "../../src/index";

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
  name: "ResultPreview",
  components: {
    View360
  },
  props: {
    settings: {
      type: Object as PropType<CorrectionSettings>,
      required: true
    },
    src: {
      type: String,
      required: true
    },
    isVideo: {
      type: Boolean,
      default: true
    }
  },
  setup(props) {
    const previewProjection = shallowRef<Projection | null>(null);
    const errorMessage = ref("");

    const initProjection = () => {
      console.log(`[ResultPreview] initProjection called. Src: "${props.src}" (type: ${typeof props.src})`);
      
      if (!props.src) {
        // Don't return, let's see why it's empty. Use fallback if needed?
        // But if empty, we can't project.
        errorMessage.value = `No src provided (Received: "${props.src}")`;
        return;
      }
      
      try {
        console.log("[ResultPreview] Initializing projection with settings:", props.settings);
        const s = props.settings;
        previewProjection.value = markRaw(new WideAngleCorrectionProjection({
          src: props.src,
          video: props.isVideo,
          mode: s.mode,
          yaw: s.yaw,
          pitch: s.pitch,
          roll: s.roll,
          hfov: s.hfov,
          vfov: s.vfov,
          fisheyeFov: s.fisheyeFov,
          outputWidth: 512,
          outputHeight: Math.floor(512 * (s.outputHeight / s.outputWidth)),
          // @ts-ignore: Temporary fix
          flatProjection: true
        }));
        errorMessage.value = "";
      } catch (e: any) {
        console.error("[ResultPreview] Preview Projection Error:", e);
        errorMessage.value = e?.message || "Error creating projection";
      }
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const updateProjectionDebounced = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        initProjection();
      }, 300);
    }

    watch(() => [props.src, props.settings], () => {
       updateProjectionDebounced();
    }, { deep: true });

    // Initial load immediately
    watch(() => props.src, () => {
       initProjection();
    }, { immediate: true });

    onMounted(() => {
      // Force check on mount just in case watch didn't trigger
      if (!previewProjection.value && props.src) {
         initProjection();
      }
    });

    const updateCamera = (viewer: any, settings: CorrectionSettings) => {
      if (!viewer || !viewer.camera) return;

      const planeHeight = 1.0;
      const outputAspect = settings.outputWidth / settings.outputHeight; 
      const planeWidth = planeHeight * outputAspect;

      const radV = 2 * Math.atan(planeHeight / 2);
      const degV = radV * (180 / Math.PI);

      let canvasAspect = 1.0;
      if (viewer._renderer && viewer._renderer.canvas) {
          const rect = viewer._renderer.canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            canvasAspect = rect.width / rect.height;
          }
      }

      const radH_derived = 2 * Math.atan(planeWidth / (2 * canvasAspect));
      const degH_derived = radH_derived * (180 / Math.PI);

      const finalFov = Math.max(degV, degH_derived);

      viewer.camera.lookAt({
        yaw: 0,
        pitch: 0,
        fov: finalFov
      });
    };

    const onReady = (e: any) => {
      const viewer = e.target;
      viewer.control.disable();
      updateCamera(viewer, props.settings);
    };

    // Watch settings to update camera dynamically without full reload if possible?
    // But settings change triggers projection rebuild (initProjection).
    // So onReady will fire again.
    // However, initProjection is debounced.
    // If settings change, we update camera? 
    // Actually, createMesh (initProjection) resets everything. 
    // So onReady logic is sufficient IF onReady fires on projection switch.
    // WideAngleCorrectionProjection creation -> props.projection update -> View360 updates.
    
    return {
      previewProjection,
      errorMessage,
      onReady
    };
  }
});
</script>

<template>
  <div class="result-preview">
    <div class="preview-header">
      <span class="dot"></span> RESULT PREVIEW
    </div>
      <div class="preview-content">
        <View360
          v-if="previewProjection && !errorMessage"
          class="preview-viewer"
          :projection="previewProjection"
          canvas-class="preview-canvas"
          @ready="onReady"
          :scrollable="false"
          :wheel-scrollable="false"
        />
        
        <div v-if="errorMessage" class="preview-placeholder">
           <span class="error-text">{{ errorMessage }}</span>
        </div>
        
        <div v-else-if="!previewProjection" class="preview-placeholder">
          <div class="loading-state">
            <span>Loading...</span>
            <span class="debug-info">Src: {{ src ? 'Yes' : 'No' }}</span>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <style scoped>
  /* ... rest of styles ... */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .debug-info {
    font-size: 8px;
    color: #666;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
    .result-preview {
    position: relative;
    width: 280px;
    height: 100%; /* Match height of siblings if needed, or fixed */
    flex-shrink: 0;
    min-height: 200px;
    background: rgba(15, 15, 20, 0.85);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 12px;
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
    background-color: #10b981; /* Green for result */
    border-radius: 50%;
  }
  
  .preview-content {
    flex: 1;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .preview-viewer {
    width: 100%;
    height: 100%;
    display: block;
  }
  
  .preview-viewer :deep(canvas) {
      width: 100% !important;
      height: 100% !important;
      outline: none;
  }
  
  .preview-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #555;
  }
  </style>
