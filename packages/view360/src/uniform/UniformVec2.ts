/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import Uniform from "./Uniform";

/**
 * vec2 类型的 Uniform
 * @hidden
 */
class UniformVec2 extends Uniform {
  public val: [number, number];

  public constructor(x: number, y: number) {
    super();
    this.val = [x, y];
  }

  public update(gl: WebGLRenderingContext | WebGL2RenderingContext, location: WebGLUniformLocation) {
    gl.uniform2f(location, this.val[0], this.val[1]);
    this.needsUpdate = false;
  }
}

export default UniformVec2;
