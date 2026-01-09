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

  // OpenGL applies: glRotate(yaw,Y), glRotate(pitch,X), glRotate(roll,Z)
  // With right-multiply convention, combined matrix is: Rz * Rx * Ry
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

// Sample from ERP source image with limited input coverage (fov_h/fov_v)
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

// Sample from fisheye source image (equidistant projection: r = f * theta)
vec3 dirToFisheyeCoord(vec3 dir) {
  float len = length(dir);
  float theta = acos(clamp(dir.z / len, -1.0, 1.0));
  // Only front hemisphere to avoid multiple copies
  if (dir.z <= 0.0) return vec3(0.0, 0.0, -1.0);

  // Check FOV limit
  float maxTheta = uFisheyeFov * 0.5;
  if (theta > maxTheta) return vec3(0.0, 0.0, -1.0);

  // Fisheye parameters
  float fisheyeRadius = min(uImgSize.x, uImgSize.y) * 0.5;
  float fisheyeFocalLen = fisheyeRadius / maxTheta;

  // Equidistant fisheye projection: r = f * theta
  float r = fisheyeFocalLen * theta;

  // Angle in image plane
  float imgAngle = atan(dir.x, -dir.y);

  // Image coordinates
  float ix = uImgSize.x * 0.5 + r * sin(imgAngle);
  float iy = uImgSize.y * 0.5 + r * cos(imgAngle);

  if (ix < 0.0 || ix >= uImgSize.x || iy < 0.0 || iy >= uImgSize.y) {
    return vec3(0.0, 0.0, -1.0);
  }

  return vec3(ix, iy, 1.0);
}

void main() {
  mat3 R = buildRotation(uRotYPR.x, uRotYPR.y, uRotYPR.z);
  mat3 Rinv = myTranspose(R);

  // 输出标准 360x180 ERP：每个像素对应经纬度
  // 与 app.js Main canvas 渲染逻辑对齐：
  //   vUV.y=0 (底部) -> lat=-PI/2 (南极)
  //   vUV.y=1 (顶部) -> lat=+PI/2 (北极)
  float phi = (vUV.x - 0.5) * 2.0 * PI;      // -PI to PI
  float lat = (vUV.y - 0.5) * PI;            // -PI/2 to PI/2 (底部南极，顶部北极)

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
