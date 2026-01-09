# Repository Guidelines

## 项目结构与模块组织
- 本仓库是 Lerna monorepo，核心库在 `packages/view360/`，框架封装在 `packages/react-view360/`、`packages/vue-view360/`、`packages/vue3-view360/`、`packages/svelte-view360/`、`packages/ngx-view360/`
- 业务源码位于各包 `src/`；样式资源集中在 `packages/view360/sass/` 与 `packages/view360/css/`
- Demo 与文档站点在 `demo/`，通用脚本与钩子在 `config/`

## 构建、测试与本地开发
- `npm install`：安装根目录依赖（推荐使用与 `yarn.lock` 一致的包管理器）
- `npm run lint`：对 `packages/**/src` 执行 ESLint
- `npm test`：通过 `lerna run test` 触发各包测试
- `npm run packages:build`：构建全部包；仅构建核心库可用 `npm run build --prefix packages/view360`
- `npm run demo:build`：构建文档与示例站点

## 编码风格与命名规范
- 以 TypeScript 为主，遵循 ESLint 规则：双引号、分号必需，保持现有两空格缩进
- 新增文件/目录使用小写驼峰命名；类名 PascalCase；普通常量 camelCase；类内常量使用大写下划线命名（例如：MAX_RETRY）
- 异步逻辑优先使用 async/await；边界处用 try/catch 并给出中文错误信息

## 测试指南
- 核心库使用 Karma + Mocha/Chai，测试位于 `packages/view360/test/`
- React 包使用 Jest（`packages/react-view360/test/`），Vue 包使用 `vue-cli-service test:unit`（`packages/vue-view360/tests/unit/`）
- 测试文件推荐以 `.spec.ts` 命名，测试用例描述使用中文

## 提交与合并请求
- 提交信息遵循 `type(scope): subject`，例如 `feat(view360): 添加热点渲染`；subject 建议不超过 50 字符
- 合并请求需说明变更动机、关联 issue、测试结果；涉及 UI 变更请附截图或录屏
