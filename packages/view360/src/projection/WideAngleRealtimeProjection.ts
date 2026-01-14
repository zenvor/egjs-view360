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
import Uniform from "../uniform/Uniform";
import UniformInt from "../uniform/UniformInt";
import UniformFloat from "../uniform/UniformFloat";
import UniformVec2 from "../uniform/UniformVec2";
import UniformVec3 from "../uniform/UniformVec3";
import vs from "../shader/wideangle_realtime.vert";
import fs from "../shader/wideangle_realtime.frag";

/**
 * Options for {@link WideAngleRealtimeProjection}
 * @ko {@link WideAngleRealtimeProjection}의 옵션들
 * @since 4.0.0
 * @category Projection
 */
export interface WideAngleRealtimeOptions extends ProjectionOptions {
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
}

// 角度转弧度
const toRad = (deg: number) => deg * Math.PI / 180;

/**
 * 实时宽角矫正纹理 Uniform
 * 处理视频帧更新和尺寸同步
 * @hidden
 */
class RealtimeCorrectionTextureUniform extends Uniform {
  public readonly texture: Texture2D;
  private _webglTexture: WebGLTexture;
  private _imgSizeUniform: UniformVec2 | null = null;
  private _initialized: boolean = false;

  public constructor(tex: Texture2D, glTex: WebGLTexture) {
    super();
    this.texture = tex;
    this._webglTexture = glTex;
  }

  public setImgSizeUniform(uniform: UniformVec2) {
    this._imgSizeUniform = uniform;
  }

  public destroy(glCtx: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.texture.destroy();
    glCtx.deleteTexture(this._webglTexture);
  }

  public update(glCtx: WebGLRenderingContext | WebGL2RenderingContext, location: WebGLUniformLocation, isWebGL2: boolean) {
    const tex = this.texture;
    const isVideo = tex.isVideo();

    // 上传纹理数据
    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, 0); // 不翻转，矫正 shader 自己处理坐标
    glCtx.uniform1i(location, 0);
    glCtx.activeTexture(glCtx.TEXTURE0);
    glCtx.bindTexture(glCtx.TEXTURE_2D, this._webglTexture);

    // 视频纹理需要每帧更新，并同步更新尺寸 uniform
    if (isVideo) {
      const videoEl = tex.source as HTMLVideoElement;
      // 视频尺寸可能在播放后才可用
      if (videoEl.readyState < 2 || videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) {
        this._uploadPlaceholder(glCtx);
        return;
      }
      if (this._imgSizeUniform) {
        const curSize = this._imgSizeUniform.val;
        if (curSize[0] !== videoEl.videoWidth || curSize[1] !== videoEl.videoHeight) {
          this._imgSizeUniform.val = [videoEl.videoWidth, videoEl.videoHeight];
          this._imgSizeUniform.needsUpdate = true;
        }
      }
    }

    if (!isVideo && isWebGL2) {
      glCtx.texSubImage2D(glCtx.TEXTURE_2D, 0, 0, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, tex.source);
    } else {
      glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, tex.source);
    }

    this._initialized = true;
    if (!isVideo) {
      this.needsUpdate = false;
    }
  }

  private _uploadPlaceholder(glCtx: WebGLRenderingContext | WebGL2RenderingContext) {
    if (this._initialized) {
      return;
    }

    // 视频未就绪时先用 1x1 占位纹理，避免不完整纹理导致渲染异常
    const pixel = new Uint8Array([0, 0, 0, 255]);
    glCtx.texImage2D(
      glCtx.TEXTURE_2D,
      0,
      glCtx.RGBA,
      1,
      1,
      0,
      glCtx.RGBA,
      glCtx.UNSIGNED_BYTE,
      pixel
    );

    if (this._imgSizeUniform) {
      const curSize = this._imgSizeUniform.val;
      if (curSize[0] <= 0 || curSize[1] <= 0) {
        this._imgSizeUniform.val = [1, 1];
        this._imgSizeUniform.needsUpdate = true;
      }
    }

    this._initialized = true;
  }
}

/**
 * 实时矫正 Projection 的 Uniforms 类型
 * @hidden
 */
interface RealtimeCorrectionUniforms {
  [key: string]: Uniform;
  uTexture: RealtimeCorrectionTextureUniform;
  uMode: UniformInt;
  uRotYPR: UniformVec3;
  uHFov: UniformFloat;
  uVFov: UniformFloat;
  uFisheyeFov: UniformFloat;
  uImgSize: UniformVec2;
}

/**
 * 实时宽角矫正 Projection
 * 直接在球体渲染时完成矫正，无需离屏渲染 Pass
 * 相比 WideAngleCorrectionProjection：
 * - 减少一次渲染 Pass，性能更好
 * - 无需配置输出分辨率
 * - 自动适配 canvas 分辨率，避免质量损失
 * @ko 실시간 와이드 앵글 보정 프로젝션. 오프스크린 렌더 패스 없이 구체 렌더링 시 직접 보정 완료.
 * @since 4.0.0
 * @category Projection
 */
class WideAngleRealtimeProjection extends Projection {
  private _mode: "erp" | "fisheye";
  private _flatProjection: boolean;
  private _yaw: number;
  private _pitch: number;
  private _roll: number;
  private _hfov: number;
  private _vfov: number;
  private _fisheyeFov: number;

  // uniforms 引用，用于运行时更新参数
  private _uniforms: Partial<RealtimeCorrectionUniforms> = {};

  /**
   * Create new instance
   * @ko 새로운 인스턴스를 생성합니다.
   * @param options - Options {@ko 옵션들}
   */
  public constructor(options: WideAngleRealtimeOptions) {
    super(options);

    this._mode = options.mode ?? "erp";
    this._flatProjection = options.flatProjection ?? false;
    this._yaw = options.yaw ?? 0;
    this._pitch = options.pitch ?? 0;
    this._roll = options.roll ?? 0;
    this._hfov = options.hfov ?? 180;
    this._vfov = options.vfov ?? 90;
    this._fisheyeFov = options.fisheyeFov ?? 180;
  }

  // 属性 getter/setter，用于运行时动态更新参数
  public get mode() { return this._mode; }
  public set mode(val: "erp" | "fisheye") {
    this._mode = val;
    if (this._uniforms.uMode) {
      this._uniforms.uMode.val = val === "fisheye" ? 1 : 0;
      this._uniforms.uMode.needsUpdate = true;
    }
  }

  public get yaw() { return this._yaw; }
  public set yaw(val: number) {
    this._yaw = val;
    this._updateRotation();
  }

  public get pitch() { return this._pitch; }
  public set pitch(val: number) {
    this._pitch = val;
    this._updateRotation();
  }

  public get roll() { return this._roll; }
  public set roll(val: number) {
    this._roll = val;
    this._updateRotation();
  }

  public get hfov() { return this._hfov; }
  public set hfov(val: number) {
    this._hfov = val;
    if (this._uniforms.uHFov) {
      this._uniforms.uHFov.val = toRad(val);
      this._uniforms.uHFov.needsUpdate = true;
    }
  }

  public get vfov() { return this._vfov; }
  public set vfov(val: number) {
    this._vfov = val;
    if (this._uniforms.uVFov) {
      this._uniforms.uVFov.val = toRad(val);
      this._uniforms.uVFov.needsUpdate = true;
    }
  }

  public get fisheyeFov() { return this._fisheyeFov; }
  public set fisheyeFov(val: number) {
    this._fisheyeFov = val;
    if (this._uniforms.uFisheyeFov) {
      this._uniforms.uFisheyeFov.val = toRad(val);
      this._uniforms.uFisheyeFov.needsUpdate = true;
    }
  }

  public createMesh(ctx: WebGLContext, texture: Texture): TriangleMesh {
    if (texture.isCube()) {
      throw new Error("WideAngleRealtimeProjection 仅支持单张 2D 图像，不支持 Cubemap 纹理");
    }

    const tex2d = texture as Texture2D;

    // 纹理尺寸检查
    const maxSize = ctx.maxTextureSize;
    if (texture.width > maxSize || texture.height > maxSize) {
      throw new Error(
        "输入纹理尺寸 (" + texture.width + "x" + texture.height + ") 超过 GPU 最大纹理尺寸限制 (" + maxSize + "x" + maxSize + ")。" +
        "请使用更小的图片或在支持更大纹理的设备上运行。"
      );
    }

    if (ctx.debug) {
      console.info(
        "WideAngleRealtimeProjection 实时矫正模式",
        "输入纹理尺寸:", texture.width, "x", texture.height,
        "GPU 最大纹理尺寸:", ctx.maxTextureSize
      );
    }

    // 创建 WebGL 纹理
    const webglTexture = ctx.createWebGLTexture(tex2d);

    // 创建纹理 uniform
    const uTexture = new RealtimeCorrectionTextureUniform(tex2d, webglTexture);

    // 创建所有 uniforms
    const uMode = new UniformInt(this._mode === "fisheye" ? 1 : 0);
    const uRotYPR = new UniformVec3(toRad(-this._yaw), toRad(-this._pitch), toRad(this._roll));
    const uHFov = new UniformFloat(toRad(this._hfov));
    const uVFov = new UniformFloat(toRad(this._vfov));
    const uFisheyeFov = new UniformFloat(toRad(this._fisheyeFov));
    const uImgSize = new UniformVec2(texture.width, texture.height);

    if (ctx.debug) {
      console.info("[WideAngleRealtimeProjection] Uniforms:", {
        mode: this._mode,
        yaw: this._yaw, yawRad: toRad(-this._yaw),
        pitch: this._pitch, pitchRad: toRad(-this._pitch),
        roll: this._roll, rollRad: toRad(this._roll),
        hfov: this._hfov, hfovRad: toRad(this._hfov),
        vfov: this._vfov, vfovRad: toRad(this._vfov),
        fisheyeFov: this._fisheyeFov, fisheyeFovRad: toRad(this._fisheyeFov),
        imgSize: [texture.width, texture.height]
      });
    }

    // 关联尺寸 uniform 到纹理 uniform，用于视频尺寸同步
    uTexture.setImgSizeUniform(uImgSize);

    // 保存 uniforms 引用
    this._uniforms = {
      uTexture,
      uMode,
      uRotYPR,
      uHFov,
      uVFov,
      uFisheyeFov,
      uImgSize
    };

    const uniforms: RealtimeCorrectionUniforms = {
      uTexture,
      uMode,
      uRotYPR,
      uHFov,
      uVFov,
      uFisheyeFov,
      uImgSize
    };

    // 根据配置选择几何体
    const geometry = this._flatProjection
      ? new PlaneGeometry(2, 1, -1) // 平面模式：2:1 比例平面
      : new SphereGeometry();       // 默认模式：球体

    const program = new ShaderProgram(ctx, vs, fs, uniforms);
    const vao = ctx.createVAO(geometry, program);
    const mesh = new TriangleMesh(vao, program);

    return mesh;
  }

  private _updateRotation() {
    if (this._uniforms.uRotYPR) {
      // 注意：yaw 和 pitch 取反，与用户调整参数的直觉一致
      this._uniforms.uRotYPR.val = [
        toRad(-this._yaw),
        toRad(-this._pitch),
        toRad(this._roll)
      ];
      this._uniforms.uRotYPR.needsUpdate = true;
    }
  }
}

export default WideAngleRealtimeProjection;
