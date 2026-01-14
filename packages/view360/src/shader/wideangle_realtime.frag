// 实时宽角矫正片段着色器
// 直接从输入纹理采样，无需中间 FBO
precision highp float;

varying vec2 vUV;

uniform sampler2D uTexture;
uniform int uMode;           // 0: ERP, 1: Fisheye
uniform vec3 uRotYPR;        // yaw, pitch, roll (弧度)
uniform float uHFov;         // 输入水平 FOV (弧度)
uniform float uVFov;         // 输入垂直 FOV (弧度)
uniform float uFisheyeFov;   // 鱼眼 FOV (弧度)
uniform vec2 uImgSize;       // 输入图像尺寸

const float PI = 3.14159265359;

mat3 buildRotation(float yaw, float pitch, float roll) {
  float cy = cos(yaw), sy = sin(yaw);
  float cp = cos(pitch), sp = sin(pitch);
  float cr = cos(roll), sr = sin(roll);

  // 旋转顺序与矫正离屏算法保持一致
  mat3 Ry = mat3(cy, 0.0, sy, 0.0, 1.0, 0.0, -sy, 0.0, cy);
  mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cp, -sp, 0.0, sp, cp);
  mat3 Rz = mat3(cr, -sr, 0.0, sr, cr, 0.0, 0.0, 0.0, 1.0);

  return Rz * (Rx * Ry);
}

mat3 myTranspose(mat3 m) {
  return mat3(m[0][0], m[1][0], m[2][0],
              m[0][1], m[1][1], m[2][1],
              m[0][2], m[1][2], m[2][2]);
}

// 从 ERP 输入图像采样，限制输入 FOV 覆盖范围
vec3 dirToErpCoord(vec3 dir) {
  float lon = atan(dir.x, dir.z); // [-PI, PI]
  float lat = asin(clamp(dir.y, -1.0, 1.0)); // [-PI/2, PI/2]
  float halfLon = uHFov * 0.5;
  float halfLat = uVFov * 0.5;
  if (abs(lon) > halfLon || abs(lat) > halfLat) {
    return vec3(0.0, 0.0, -1.0);
  }
  float u = (lon / uHFov + 0.5) * (uImgSize.x - 1.0);
  float v = (0.5 - lat / uVFov) * (uImgSize.y - 1.0);
  if (u < 0.0 || u >= uImgSize.x || v < 0.0 || v >= uImgSize.y) {
    return vec3(0.0, 0.0, -1.0);
  }
  return vec3(u, v, 1.0);
}

// 从鱼眼输入图像采样（等距投影：r = f * theta）
vec3 dirToFisheyeCoord(vec3 dir) {
  float len = length(dir);
  float theta = acos(clamp(dir.z / len, -1.0, 1.0));
  // 仅渲染前半球，避免重复影像
  if (dir.z <= 0.0) return vec3(0.0, 0.0, -1.0);

  float maxTheta = uFisheyeFov * 0.5;
  if (theta > maxTheta) return vec3(0.0, 0.0, -1.0);

  float fisheyeRadius = min(uImgSize.x, uImgSize.y) * 0.5;
  float fisheyeFocalLen = fisheyeRadius / maxTheta;
  float r = fisheyeFocalLen * theta;
  float imgAngle = atan(dir.x, -dir.y);

  float ix = uImgSize.x * 0.5 + r * sin(imgAngle);
  float iy = uImgSize.y * 0.5 + r * cos(imgAngle);

  if (ix < 0.0 || ix >= uImgSize.x || iy < 0.0 || iy >= uImgSize.y) {
    return vec3(0.0, 0.0, -1.0);
  }

  return vec3(ix, iy, 1.0);
}

void main() {
  if (uImgSize.x <= 0.0 || uImgSize.y <= 0.0) {
    // 防止除零导致的采样异常
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  mat3 R = buildRotation(uRotYPR.x, uRotYPR.y, uRotYPR.z);
  mat3 Rinv = myTranspose(R);

  // 与离屏矫正算法保持一致的经纬度映射
  float phi = (vUV.x - 0.5) * 2.0 * PI;
  float lat = (vUV.y - 0.5) * PI;

  float cosLat = cos(lat);
  vec3 worldDir = vec3(cosLat * sin(phi), sin(lat), cosLat * cos(phi));
  vec3 imgDir = Rinv * worldDir;

  vec3 imgCoord;
  if (uMode == 0) {
    imgCoord = dirToErpCoord(imgDir);
  } else {
    imgCoord = dirToFisheyeCoord(imgDir);
  }

  if (imgCoord.z > 0.0) {
    vec2 uv = vec2(imgCoord.x / uImgSize.x, imgCoord.y / uImgSize.y);
    gl_FragColor = texture2D(uTexture, uv);
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
}
