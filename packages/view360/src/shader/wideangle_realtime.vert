// 实时宽角矫正顶点着色器
// 直接在球体渲染阶段完成矫正，无需离屏 Pass
// 注意：attribute 和 uniform 名称必须与渲染器约定一致
attribute vec3 position;
attribute vec2 uv;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying highp vec2 vUV;

void main() {
  // 传递 UV 坐标到 fragment shader
  // 对于 SphereGeometry，UV 本身就对应标准 ERP 的 (经度归一化, 纬度归一化)
  vUV = uv;
  gl_Position = uPMatrix * uMVMatrix * vec4(position, 1.0);
}
