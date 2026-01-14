/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import Uniform from "./Uniform";

/**
 * 整数类型的 Uniform
 * @hidden
 */
class UniformInt extends Uniform {
  public val: number;

  public constructor(val: number) {
    super();
    this.val = val;
  }

  public update(gl: WebGLRenderingContext | WebGL2RenderingContext, location: WebGLUniformLocation) {
    gl.uniform1i(location, this.val);
    this.needsUpdate = false;
  }
}

export default UniformInt;
