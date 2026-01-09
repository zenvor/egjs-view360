/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import Texture from "./Texture";

/**
 * 用于 Render-to-Texture 的纹理类型
 * 不持有 HTMLElement source，而是直接持有 WebGLTexture
 * @hidden
 */
class TextureRenderTarget extends Texture {
  public readonly glTexture: WebGLTexture;

  public constructor(glTexture: WebGLTexture, width: number, height: number) {
    super({
      width,
      height,
      flipY: false
    });
    this.glTexture = glTexture;
  }

  public isVideo(): this is never {
    return false;
  }

  public destroy(): void {
    // WebGLTexture 由 WebGLContext.deleteFramebuffer 管理，这里不处理
  }
}

export default TextureRenderTarget;
