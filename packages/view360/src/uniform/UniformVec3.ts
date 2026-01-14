/*
 * Copyright (c) 2023-present NAVER Corp.
 * egjs projects are licensed under the MIT license
 */
import Uniform from "./Uniform";

/**
 * vec3 类型的 Uniform
 * @hidden
 */
class UniformVec3 extends Uniform {
  public val: [number, number, number];

  public constructor(x: number, y: number, z: number) {
    super();
    this.val = [x, y, z];
  }

  public update(gl: WebGLRenderingContext | WebGL2RenderingContext, location: WebGLUniformLocation) {
    gl.uniform3f(location, this.val[0], this.val[1], this.val[2]);
    this.needsUpdate = false;
  }
}

export default UniformVec3;
