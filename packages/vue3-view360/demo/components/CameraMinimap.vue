<script lang="ts">
import { defineComponent, ref, onMounted, onBeforeUnmount, watch, toRefs } from "vue";
import * as THREE from "three";

export default defineComponent({
  name: "CameraMinimap",
  props: {
    yaw: {
      type: Number,
      default: 0
    },
    pitch: {
      type: Number,
      default: 0
    },
    fov: {
      type: Number,
      default: 65
    },
    // Optional center point for the "tally light" logic
    center: {
      type: Object, // { x: number, y: number }
      default: () => ({ x: 0, y: 0 })
    }
  },
  setup(props) {
    const containerRef = ref<HTMLElement | null>(null);
    const { yaw, pitch, fov, center } = toRefs(props);

    // Three.js instances
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let animationFrameId: number;

    // Scene Objects
    let cameraRig: THREE.Group;
    let frustumGroup: THREE.Group;
    let targetMarker: THREE.Mesh;
    let tallyLightMat: THREE.MeshBasicMaterial;

    // Constants
    const CYLINDER_RADIUS = 4.5;
    const ASPECT_RATIO = 16 / 9;

    const initThree = () => {
      if (!containerRef.value) return;

      // 1. Scene Setup
      scene = new THREE.Scene();
      scene.background = new THREE.Color("#1a1a1a");

      // Camera
      const width = containerRef.value.clientWidth;
      const height = containerRef.value.clientHeight;
      camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      camera.position.set(4.5, 9, 12);
      camera.lookAt(0, 0, 0);

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      containerRef.value.appendChild(renderer.domElement);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
      dirLight.position.set(5, 10, 5);
      scene.add(dirLight);

      const pointLight = new THREE.PointLight("#6366f1", 1, 100);
      pointLight.position.set(-5, 2, 0);
      scene.add(pointLight);

      // 2. Cylinder Stage
      const stageGroup = new THREE.Group();
      // stageGroup.rotation.y = Math.PI; // Removing 180 deg rotation to verify alignment
      scene.add(stageGroup);

      // Wireframe Grid (Sphere)
      const sphereGeo = new THREE.SphereGeometry(CYLINDER_RADIUS, 32, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: "#666", wireframe: true, transparent: true, opacity: 0.3 });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      stageGroup.add(sphereMesh);

      // Active Area Bounds (Sphere inner background)
      const activeGeo = new THREE.SphereGeometry(CYLINDER_RADIUS * 0.99, 32, 16);
      const activeMat = new THREE.MeshBasicMaterial({ color: "#222", side: THREE.BackSide });
      const activeMesh = new THREE.Mesh(activeGeo, activeMat);
      stageGroup.add(activeMesh);

      // 3. Camera Rig
      cameraRig = new THREE.Group();
      scene.add(cameraRig);

      // Camera Body Representation
      const cameraBodyGroup = new THREE.Group();
      cameraBodyGroup.scale.set(0.3, 0.3, 0.3);
      cameraRig.add(cameraBodyGroup);

      // Box Body
      const bodyGeo = new THREE.BoxGeometry(1, 1, 1.5);
      const bodyMat = new THREE.MeshStandardMaterial({ color: "#ccc", roughness: 0.2, metalness: 0.6 });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.set(0, 0, 0.5);
      cameraBodyGroup.add(bodyMesh);

      // Lens
      const lensGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.5, 32);
      const lensMat = new THREE.MeshStandardMaterial({ color: "#111" });
      const lensMesh = new THREE.Mesh(lensGeo, lensMat);
      lensMesh.rotation.x = Math.PI / 2;
      lensMesh.position.set(0, 0, -0.5);
      cameraBodyGroup.add(lensMesh);

      // Tally Light
      const tallyGeo = new THREE.BoxGeometry(0.2, 0.1, 0.2);
      tallyLightMat = new THREE.MeshBasicMaterial({ color: "#880000" });
      const tallyMesh = new THREE.Mesh(tallyGeo, tallyLightMat);
      tallyMesh.position.set(0, 0.6, 0);
      cameraBodyGroup.add(tallyMesh);

      // 4. View Frustum
      frustumGroup = new THREE.Group();
      cameraRig.add(frustumGroup); // Attached to rig to rotate with it

      // Transparent Beam
      // Note: In Three.js cylinder default is vertical (y-axis). 
      // We want it z-aligned originating from camera.
      // Reference: rotation={[Math.PI / 2, Math.PI / 4, 0]} position={[0, 0, -0.5]}
      // Geometry: args={[0, 0.707, 1, 4, 1, true]} -> topRadius, bottomRadius, height, radialSegments
      // Bottom radius 0.707 is approx sin(45) or something, let's stick to ref.
      const beamGeo = new THREE.CylinderGeometry(0, 0.707, 1, 4, 1, true);
      // Rotate geometry inside the mesh to align pyramid correctly if needed, or rotate mesh.
      // Ref: rotation={[Math.PI / 2, Math.PI / 4, 0]}
      const beamMat = new THREE.MeshBasicMaterial({ 
        color: "#818cf8", 
        transparent: true, 
        opacity: 0.25, 
        side: THREE.DoubleSide, 
        depthWrite: false, 
        blending: THREE.AdditiveBlending 
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.position.set(0, 0, -0.5);
      beamMesh.rotation.set(Math.PI / 2, Math.PI / 4, 0);
      
      // Add edges to make the 3D shape more distinct
      const beamEdgesGeo = new THREE.EdgesGeometry(beamGeo);
      const beamEdgesMat = new THREE.LineBasicMaterial({ color: "#c7d2fe", transparent: true, opacity: 0.8 });
      const beamEdges = new THREE.LineSegments(beamEdgesGeo, beamEdgesMat);
      beamMesh.add(beamEdges);

      frustumGroup.add(beamMesh);

      // Screen on Wall
      const screenGroup = new THREE.Group();
      screenGroup.position.set(0, 0, -1);
      frustumGroup.add(screenGroup);


      // Center Point Indicator
      const markerGeo = new THREE.RingGeometry(0.05, 0.08, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: "#fff", side: THREE.DoubleSide });
      targetMarker = new THREE.Mesh(markerGeo, markerMat);
      targetMarker.position.set(0, 0, 0.01);
      screenGroup.add(targetMarker);

      // Crosshair
      const crosshairGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([-0.1, 0, 0, 0.1, 0, 0, 0, -0.1, 0, 0, 0.1, 0]);
      crosshairGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      const crosshairMat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8 });
      const crosshairLines = new THREE.LineSegments(crosshairGeo, crosshairMat);
      screenGroup.add(crosshairLines);

      // Grid Helper
      const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
      gridHelper.position.y = -2;
      scene.add(gridHelper);

      // Start Loop
      animate();
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      if (cameraRig && frustumGroup) {
        // 1. Smoothly interpolate rotation
        // Convert deg to rad. Note: View360 yaw is positive-right, Three.js rotation is positive-left.
        // So we negate yaw.
        // UPDATE: User reported direction is inverted. Removing negation to match.
        const targetYaw = THREE.MathUtils.degToRad(yaw.value);
        const targetPitch = THREE.MathUtils.degToRad(pitch.value);

        // Simple lerp factor
        const delta = 0.05; 
        
        // Correctly interpolate Yaw using shortest path
        const currentYaw = cameraRig.rotation.y;
        const diffYaw = targetYaw - currentYaw;
        // Normalize difference to [-PI, PI] to always find shortest path
        const shortestDiff = Math.atan2(Math.sin(diffYaw), Math.cos(diffYaw));
        
        // Apply smooth interpolation
        cameraRig.rotation.y += shortestDiff * (delta * 3);
        
        // Pitch usually doesn't wrap around in this demo context (-90 to 90), but valid to use simple lerp
        cameraRig.rotation.x = THREE.MathUtils.lerp(cameraRig.rotation.x, targetPitch, delta * 3);

        const vFovRad = THREE.MathUtils.degToRad(fov.value);
        // Frustum calc
        const viewHeight = 2 * Math.tan(vFovRad / 2) * CYLINDER_RADIUS;
        const viewWidth = viewHeight * ASPECT_RATIO;

        // Calculate Scale Factor to ensure corners are inside sphere (prevent clipping)
        // We want the corners of the flat screen plane to touch the sphere from the inside, 
        // effectively making the plane a chord of the sphere.
        const halfV = Math.tan(vFovRad / 2);
        const halfH = halfV * ASPECT_RATIO;
        // Distance factor from center to corner for a unit focal length
        const cornerFactor = Math.sqrt(halfH * halfH + halfV * halfV + 1);
        
        // We set the scale so that the furthest point (corner) is exactly at CYLINDER_RADIUS * margin
        const SAFE_MARGIN = 0.96;
        const scaleFactor = SAFE_MARGIN / cornerFactor;

        frustumGroup.scale.set(viewWidth * scaleFactor, viewHeight * scaleFactor, CYLINDER_RADIUS * scaleFactor);
        
        // 3. Tally Light
        if (tallyLightMat) {
           const hasOffset = center.value.x !== 0 || center.value.y !== 0;
           tallyLightMat.color.set(hasOffset ? "#ff4444" : "#880000");
        }

        // 4. Marker rotation
        if (targetMarker) {
          targetMarker.rotation.z += 0.02;
        }
      }

      renderer.render(scene, camera);
    };

    const onWindowResize = () => {
      if (!containerRef.value || !camera || !renderer) return;
      const width = containerRef.value.clientWidth;
      const height = containerRef.value.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    onMounted(() => {
      initThree();
      window.addEventListener("resize", onWindowResize);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("resize", onWindowResize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (renderer) renderer.dispose();
      // Dispose other resources if necessary
    });

    return {
      containerRef
    };
  }
});
</script>

<template>
  <div class="camera-minimap-container">
    <!-- HUD Info -->
    <div class="hud-info">
      <div class="indicator-group">
         <div class="status-dot"></div>
         <span class="status-text">RIG VIEW</span>
      </div>
    </div>
    
    <!-- Three.js Canvas Container -->
    <div ref="containerRef" class="canvas-wrapper"></div>
  </div>
</template>

<style scoped>
.camera-minimap-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #111;
  /* backdrop-filter: blur(4px); logic handled by parent usually, but redundant here if parent has it */
  border-radius: 12px;
  overflow: hidden;
  /* Shadow and border handled by parent */
}

.hud-info {
  position: absolute;
  top: 12px;
  left: 16px;
  z-index: 10;
  pointer-events: none;
}

.indicator-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #6366f1; /* Indigo-400 */
  box-shadow: 0 0 8px #6366f1;
  animation: pulse 2s infinite;
}

.status-text {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 700;
  color: #e0e7ff; /* Indigo-100 */
  letter-spacing: 0.1em;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.canvas-wrapper {
  width: 100%;
  height: 100%;
  display: block;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}
</style>
