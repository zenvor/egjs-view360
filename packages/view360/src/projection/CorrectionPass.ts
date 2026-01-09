/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import WebGLContext from "../core/WebGLContext";
import TextureRenderTarget from "../texture/TextureRenderTarget";
import vsSource from "../shader/fullscreen.vert";
import fsSource from "../shader/correction.frag";

export interface CorrectionParams {
  /** 输入图像模式：erp(等距柱状) 或 fisheye(鱼眼) */
  mode: "erp" | "fisheye";
  /** Yaw 旋转角度（度） */
  yaw: number;
  /** Pitch 旋转角度（度） */
  pitch: number;
  /** Roll 旋转角度（度） */
  roll: number;
  /** 输入图像水平 FOV（度） */
  hfov: number;
  /** 输入图像垂直 FOV（度） */
  vfov: number;
  /** 鱼眼模式 FOV（度） */
  fisheyeFov: number;
}

/**
 * 离屏矫正渲染 Pass
 * 将超宽全景输入转换为标准 2:1 equirectangular 纹理
 * @hidden
 */
class CorrectionPass {
  private _ctx: WebGLContext;
  private _program: WebGLProgram;
  private _fbo: { framebuffer: WebGLFramebuffer; texture: WebGLTexture };
  private _outputTexture: TextureRenderTarget;
  private _quadBuffer: WebGLBuffer;
  private _uniformLocations: Record<string, WebGLUniformLocation | null>;
  private _outputWidth: number;
  private _outputHeight: number;

  public get outputTexture() { return this._outputTexture; }

  public constructor(ctx: WebGLContext, outputWidth: number, outputHeight: number) {
    this._ctx = ctx;
    this._outputWidth = outputWidth;
    this._outputHeight = outputHeight;

    const gl = ctx.gl;

    // 创建 FBO
    this._fbo = ctx.createFramebuffer(outputWidth, outputHeight);
    this._outputTexture = new TextureRenderTarget(this._fbo.texture, outputWidth, outputHeight);

    // 创建着色器程序
    this._program = ctx.createProgram(vsSource, fsSource);

    // 缓存 uniform 位置
    this._uniformLocations = {
      uTexture: gl.getUniformLocation(this._program, "uTexture"),
      uMode: gl.getUniformLocation(this._program, "uMode"),
      uRotYPR: gl.getUniformLocation(this._program, "uRotYPR"),
      uHFov: gl.getUniformLocation(this._program, "uHFov"),
      uVFov: gl.getUniformLocation(this._program, "uVFov"),
      uFisheyeFov: gl.getUniformLocation(this._program, "uFisheyeFov"),
      uImgSize: gl.getUniformLocation(this._program, "uImgSize")
    };

    // 创建全屏四边形顶点缓冲区
    const quadBuffer = gl.createBuffer();
    if (!quadBuffer) {
      throw new Error("无法创建顶点缓冲区");
    }
    this._quadBuffer = quadBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  public render(inputTexture: WebGLTexture, inputWidth: number, inputHeight: number, params: CorrectionParams) {
    const gl = this._ctx.gl;
    const locs = this._uniformLocations;

    // 绑定 FBO
    this._ctx.bindFramebuffer(this._fbo.framebuffer);
    gl.viewport(0, 0, this._outputWidth, this._outputHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 使用矫正程序
    gl.useProgram(this._program);

    // 设置 uniforms
    // 注意：yaw 和 pitch 需要取反，与 app.js 主 canvas 渲染保持一致
    // 这样图像移动方向与用户调整参数的直觉一致
    const toRad = (deg: number) => deg * Math.PI / 180;
    gl.uniform1i(locs.uMode, params.mode === "fisheye" ? 1 : 0);
    gl.uniform3f(locs.uRotYPR!, toRad(-params.yaw), toRad(-params.pitch), toRad(params.roll));
    gl.uniform1f(locs.uHFov!, toRad(params.hfov));
    gl.uniform1f(locs.uVFov!, toRad(params.vfov));
    gl.uniform1f(locs.uFisheyeFov!, toRad(params.fisheyeFov));
    gl.uniform2f(locs.uImgSize!, inputWidth, inputHeight);

    // 绑定输入纹理
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(locs.uTexture, 0);

    // 绘制全屏四边形
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
    const posLoc = gl.getAttribLocation(this._program, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(posLoc);

    // 恢复默认 FBO 和 viewport
    this._ctx.bindFramebuffer(null);
    this._ctx.resize();
  }

  public destroy() {
    const gl = this._ctx.gl;
    gl.deleteBuffer(this._quadBuffer);
    gl.deleteProgram(this._program);
    this._ctx.deleteFramebuffer(this._fbo);
  }
}

export default CorrectionPass;
