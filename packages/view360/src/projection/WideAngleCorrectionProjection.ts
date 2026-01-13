/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import Projection, { ProjectionOptions } from "./Projection";
import WebGLContext from "../core/WebGLContext";
import Texture from "../texture/Texture";
import Texture2D from "../texture/Texture2D";
import TriangleMesh from "../core/TriangleMesh";
import PlaneGeometry from "../geometry/PlaneGeometry";
import SphereGeometry from "../geometry/SphereGeometry";
import ShaderProgram from "../core/ShaderProgram";
import CorrectionPass, { CorrectionParams } from "./CorrectionPass";
import UniformTextureRenderTarget from "../uniform/UniformTextureRenderTarget";
import vs from "../shader/common.vert";
import fs from "../shader/common.frag";

/**
 * Options for {@link WideAngleCorrectionProjection}
 * @ko {@link WideAngleCorrectionProjection}의 옵션들
 * @since 4.0.0
 * @category Projection
 */
export interface WideAngleCorrectionOptions extends ProjectionOptions {
  /**
   * 输入图像模式：erp(等距柱状) 或 fisheye(鱼眼)
   * @default "erp"
   */
  mode?: "erp" | "fisheye";
  /**
   * 是否使用平面投影模式展示结果（而非 360 球体）
   * @default false
   */
  flatProjection?: boolean;
  /**
   * Yaw 旋转角度（度）
   * @default 0
   */
  yaw?: number;
  /**
   * Pitch 旋转角度（度）
   * @default 0
   */
  pitch?: number;
  /**
   * Roll 旋转角度（度）
   * @default 0
   */
  roll?: number;
  /**
   * 输入图像水平 FOV（度）
   * @default 180
   */
  hfov?: number;
  /**
   * 输入图像垂直 FOV（度）
   * @default 90
   */
  vfov?: number;
  /**
   * 鱼眼模式 FOV（度）
   * @default 180
   */
  fisheyeFov?: number;
  /**
   * 输出纹理宽度
   * @default 4096
   */
  outputWidth?: number;
  /**
   * 输出纹理高度
   * @default 2048
   */
  outputHeight?: number;
}

/**
 * 超宽全景矫正 Projection
 * 将非标准全景输入（如 7680x2160）转换为标准 360° equirectangular 格式
 * 仅支持静态图像，矫正在 createMesh 时一次性完成
 * @ko 와이드 앵글 보정 프로젝션. 비표준 파노라마 입력(예: 7680x2160)을 표준 360° equirectangular 형식으로 변환합니다.
 * @since 4.0.0
 * @category Projection
 */
class WideAngleCorrectionProjection extends Projection {
  private _correctionParams: CorrectionParams;
  private _correctionPass: CorrectionPass | null = null;
  private _outputWidth: number;
  private _outputHeight: number;
  private _flatProjection: boolean;

  /**
   * Create new instance
   * @ko 새로운 인스턴스를 생성합니다.
   * @param options - Options {@ko 옵션들}
   */
  public constructor(options: WideAngleCorrectionOptions) {
    super(options);

    this._correctionParams = {
      mode: options.mode ?? "erp",
      yaw: options.yaw ?? 0,
      pitch: options.pitch ?? 0,
      roll: options.roll ?? 0,
      hfov: options.hfov ?? 180,
      vfov: options.vfov ?? 90,
      fisheyeFov: options.fisheyeFov ?? 180
    };

    this._outputWidth = options.outputWidth ?? 4096;
    this._outputHeight = options.outputHeight ?? 2048;
    this._flatProjection = options.flatProjection ?? false;
  }

  public createMesh(ctx: WebGLContext, texture: Texture): TriangleMesh {
    if (texture.isCube()) {
      throw new Error("WideAngleCorrectionProjection 仅支持单张 2D 图像，不支持 Cubemap 纹理");
    }

    // 纹理尺寸检查
    const maxSize = ctx.maxTextureSize;
    if (texture.width > maxSize || texture.height > maxSize) {
      throw new Error(
        "输入纹理尺寸 (" + texture.width + "x" + texture.height + ") 超过 GPU 最大纹理尺寸限制 (" + maxSize + "x" + maxSize + ")。" +
        "请使用更小的图片或在支持更大纹理的设备上运行。"
      );
    }
    if (this._outputWidth > maxSize || this._outputHeight > maxSize) {
      throw new Error(
        "输出纹理尺寸 (" + this._outputWidth + "x" + this._outputHeight + ") 超过 GPU 最大纹理尺寸限制 (" + maxSize + "x" + maxSize + ")。" +
        "请降低 outputWidth/outputHeight 参数值。"
      );
    }

    const gl = ctx.gl;
    // 根据宽高比计算平面尺寸，保持高度为 1
    const aspect = this._outputWidth / this._outputHeight;

    if (texture.isVideo()) {
      const pass = new CorrectionPass(ctx, this._outputWidth, this._outputHeight);
      this._correctionPass = pass;

      const uniforms = {
        uTexture: this._createVideoUniform(texture as Texture2D, gl)
      };

      const geometry = this._flatProjection
        ? new PlaneGeometry(aspect, 1, -1) // 平面模式：宽高比平面
        : new SphereGeometry();            // 默认模式：球体
      
      const program = new ShaderProgram(ctx, vs, fs, uniforms);
      const vao = ctx.createVAO(geometry, program);
      const mesh = new TriangleMesh(vao, program);

      return mesh;
    }

    // 创建矫正 Pass
    const pass = new CorrectionPass(ctx, this._outputWidth, this._outputHeight);
    this._correctionPass = pass;

    // 获取输入纹理信息
    const tex2d = texture as Texture2D;
    const inputWidth = texture.width;
    const inputHeight = texture.height;

    // 手动创建普通纹理（非 immutable），避免 texStorage2D 导致的问题
    const inputTexture = gl.createTexture();
    if (!inputTexture) {
      throw new Error("无法创建输入纹理");
    }

    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    // 与 app.js 保持一致：不翻转 Y 轴，图像已是正确方向
    // 注意：TextureLoader 默认 flipY: true，但矫正 shader 的坐标约定要求 flipY: false
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 使用 texImage2D 上传图像数据（普通 mutable texture）
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex2d.source);

    // 执行矫正渲染（静态图像只需执行一次）
    pass.render(
      inputTexture,
      inputWidth,
      inputHeight,
      this._correctionParams
    );

    // 矫正完成后释放输入纹理
    gl.deleteTexture(inputTexture);

    // 使用矫正后的纹理创建标准 EquirectProjection 的 Mesh
    // 注意：离屏资源需要随 Mesh 销毁一起释放，因此把释放逻辑交给 uniform.destroy()
    const uniforms = {
      uTexture: new UniformTextureRenderTarget(pass.outputTexture, () => {
        pass.destroy();
        if (this._correctionPass === pass) {
          this._correctionPass = null;
        }
      })
    };

    const geometry = this._flatProjection
      ? new PlaneGeometry(aspect, 1, -1)
      : new SphereGeometry();
      
    const program = new ShaderProgram(ctx, vs, fs, uniforms);
    const vao = ctx.createVAO(geometry, program);
    const mesh = new TriangleMesh(vao, program);

    return mesh;
  }

  private _createVideoUniform(texture: Texture2D, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    const pass = this._correctionPass;
    if (!pass) {
      throw new Error("矫正 Pass 未初始化");
    }

    class UniformWideAngleCorrectedVideoTexture extends UniformTextureRenderTarget {
      public readonly sourceTexture: Texture2D;
      private _inputTexture: WebGLTexture;
      private _correctionPass: CorrectionPass;
      private _params: CorrectionParams;
      private _initialized: boolean;

      public constructor(correctionPass: CorrectionPass, tex: Texture2D, params: CorrectionParams, onDestroy: () => void) {
        super(correctionPass.outputTexture, onDestroy);
        this.sourceTexture = tex;
        this._correctionPass = correctionPass;
        this._params = params;
        this._initialized = false;

        const inputTexture = gl.createTexture();
        if (!inputTexture) {
          throw new Error("无法创建输入纹理");
        }

        this._inputTexture = inputTexture;
        gl.bindTexture(gl.TEXTURE_2D, this._inputTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      public destroy(glCtx: WebGLRenderingContext | WebGL2RenderingContext): void {
        this.sourceTexture.destroy();
        glCtx.deleteTexture(this._inputTexture);
        super.destroy(glCtx);
      }

      public update(glCtx: WebGLRenderingContext | WebGL2RenderingContext, location: WebGLUniformLocation, isWebGL2: boolean) {
        const texture = this.sourceTexture;
        const isVideo = texture.isVideo();
        const prevFlipY = glCtx.getParameter(glCtx.UNPACK_FLIP_Y_WEBGL) as boolean;

        if (!isVideo || !texture.isPaused() || !this._initialized) {
          if (isVideo) {
            const videoEl = texture.source as HTMLVideoElement;
            if (videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
              super.update(glCtx, location, isWebGL2);
              glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, prevFlipY);
              return;
            }
          }

          glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, 0);
          glCtx.activeTexture(glCtx.TEXTURE0);
          glCtx.bindTexture(glCtx.TEXTURE_2D, this._inputTexture);

          if (!isVideo && isWebGL2) {
            glCtx.texSubImage2D(glCtx.TEXTURE_2D, 0, 0, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, texture.source);
          } else {
            glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, texture.source);
          }

          const src = texture.source as any;
          const inputWidth = isVideo ? (src.videoWidth || texture.width) : texture.width;
          const inputHeight = isVideo ? (src.videoHeight || texture.height) : texture.height;

          this._correctionPass.render(this._inputTexture, inputWidth, inputHeight, this._params);
          this._initialized = true;
        }

        super.update(glCtx, location, isWebGL2);
        glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, prevFlipY);
      }
    }

    return new UniformWideAngleCorrectedVideoTexture(pass, texture, this._correctionParams, () => {
      pass.destroy();
      if (this._correctionPass === pass) {
        this._correctionPass = null;
      }
    });
  }
}

export default WideAngleCorrectionProjection;
