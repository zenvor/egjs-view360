/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import Object3D from "./Object3D";
import ShaderProgram from "./ShaderProgram";
import VertexArrayObject from "./VertexArrayObject";
import Uniform from "../uniform/Uniform";
import WebGLContext from "./WebGLContext";
import UniformCanvasCube from "../uniform/UniformCanvasCube";
import UniformTexture2D from "../uniform/UniformTexture2D";
import UniformTextureCube from "../uniform/UniformTextureCube";
import UniformTextureRenderTarget from "../uniform/UniformTextureRenderTarget";

// CommonProjectionUniforms 使用 Uniform 基类，以支持自定义纹理 uniform（如实时矫正的 RealtimeCorrectionTextureUniform）
type CommonProjectionUniforms = {
  uTexture: UniformTexture2D | UniformTextureCube | UniformCanvasCube | UniformTextureRenderTarget | Uniform;
}

/**
 * @hidden
 */
class TriangleMesh<T extends CommonProjectionUniforms = CommonProjectionUniforms> extends Object3D {
  /**
   * @internal
   * Geometry data for projection
   */
  public readonly vao: VertexArrayObject;
  /**
   * @internal
   * Material(shader) data for projection
   */
  public readonly program: ShaderProgram<T>;

  public constructor(vao: VertexArrayObject, program: ShaderProgram<T>) {
    super();

    this.vao = vao;
    this.program = program;
  }

  public destroy(ctx: WebGLContext) {
    ctx.releaseVAO(this.vao);
    ctx.releaseShaderResources(this.program);
  }

  public getTexture() {
    const uniform: any = this.program.uniforms.uTexture as any;

    return uniform.sourceTexture || uniform.texture;
  }
}

export default TriangleMesh;
