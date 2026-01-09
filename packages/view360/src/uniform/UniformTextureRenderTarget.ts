/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import TextureRenderTarget from "../texture/TextureRenderTarget";
import Uniform from "./Uniform";

/**
 * Uniform for TextureRenderTarget
 * 与 UniformTexture2D 不同，不执行 texImage2D，只绑定已有纹理
 * @hidden
 */
class UniformTextureRenderTarget extends Uniform {
  public readonly texture: TextureRenderTarget;
  private _onDestroy: (() => void) | null;
  private readonly _keepNeedsUpdateForDestroy: boolean;

  public constructor(texture: TextureRenderTarget, onDestroy?: () => void) {
    super();
    this.texture = texture;
    this._onDestroy = onDestroy ?? null;
    this._keepNeedsUpdateForDestroy = !!this._onDestroy;

    // 首帧必须执行一次 update 以完成纹理绑定与 uniform 赋值。
    // 当需要释放离屏资源时，needsUpdate 必须保持为 true，
    // 以确保 releaseShaderResources 阶段会调用 destroy()。
    this.needsUpdate = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public destroy(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    // 纹理由 CorrectionPass/FBO 管理，这里通过回调释放
    if (this._onDestroy) {
      this._onDestroy();
      this._onDestroy = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public update(gl: WebGLRenderingContext | WebGL2RenderingContext, location: WebGLUniformLocation, isWebGL2: boolean): void {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(location, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture.glTexture);
    // 注意：当需要释放离屏资源时，needsUpdate 必须保持为 true，
    // 以确保 releaseShaderResources 阶段会调用 destroy()

    if (!this._keepNeedsUpdateForDestroy) {
      // 无需释放离屏资源时，仅需绑定一次即可
      this.needsUpdate = false;
    }
  }
}

export default UniformTextureRenderTarget;
